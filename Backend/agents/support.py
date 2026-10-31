"""
Context-Aware Support Agent
===========================
Lightweight document Q&A using TF-IDF cosine similarity over the
``knowledge_base`` rows already produced by the Knowledge Builder agent.

Pipeline
--------
1. Query → fetch all knowledge_base rows for the community.
2. Build / reuse a per-community TF-IDF index (cached in process).
3. Cosine-rank the docs, keep the top few that clear a threshold.
4. (Optional) Hand the question plus those candidates to DeepSeek in ONE
   call that both picks the right passage and writes the answer. If the LLM
   is unavailable, fall back to returning the top-cosine snippet verbatim.

Step 4 is why the agent reads the top ``_RERANK_K`` candidates rather than
just ``argmax``: bag-of-words cosine puts the right passage in the top few
far more often than it puts it first, and a reranking model recovers that
gap for the price of the polish call we were already making. The model may
also answer "not in these passages", which stops the old failure mode of
confidently reciting the nearest wrong document.

No FAISS / embedding model — TF-IDF is fine for ≤500 docs per community.
"""

from __future__ import annotations

import json
import re
import threading
import time
from typing import Dict, List, Optional, Tuple

from database import get_db_connection
from agents.base import AutonomousAgent
from agents import event_bus as _event_bus
from agents._settings import get_community_settings


_SUPPORT_DEFAULTS = {
    'min_score': 2,            # slider 1..10, maps to ~ value * 0.03 cosine
    'max_docs': 500,           # LIMIT clause cap
    'use_gemini_polish': True,
    'show_sources': True,
}


def _resolve_min_cosine(min_score_setting: int) -> float:
    """Map the UI's 1..10 slider onto a cosine-similarity floor.

    A setting of 2 (the schema default) preserves the historic 0.06–0.12
    behaviour; a setting of 10 forces a much stricter 0.30 floor.
    """
    try:
        s = max(1, min(10, int(min_score_setting)))
    except (TypeError, ValueError):
        s = 2
    return round(s * 0.03, 3)

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    _SKLEARN_AVAILABLE = True
except Exception:
    _SKLEARN_AVAILABLE = False
    TfidfVectorizer = None  # type: ignore
    cosine_similarity = None  # type: ignore

try:
    from utils.ai.llm_client import get_llm_client, is_llm_available
    _LLM_AVAILABLE = is_llm_available()
    _llm_client = get_llm_client()
except Exception:
    _LLM_AVAILABLE = False
    _llm_client = None


_INDEX_TTL_SECONDS = 5 * 60  # rebuild per-community index every 5 minutes
_MIN_SCORE = 0.12            # cosine threshold below which we say "no match"
_RERANK_K = 3                # candidates handed to the reranking LLM call

_SUPPORT_SYSTEM = (
    "You answer questions using only a community's own knowledge base.\n"
    "You are given the question and a few numbered passages retrieved from "
    "that knowledge base. Exactly one of them may be relevant, or none may be.\n"
    "Rules:\n"
    "- Answer only from the passages. Never add outside knowledge, and never "
    "guess at specifics the passages do not state.\n"
    "- If no passage actually answers the question, set answered to false and "
    "say plainly that the knowledge base does not cover it.\n"
    "- Keep the answer to one to three sentences, plain text, no markdown.\n"
    "- Write it as an answer, not as a summary of a document. Do not say "
    "'according to the passage' or 'the context states'."
)


def _readable_snippet(content: str) -> str:
    """Knowledge Builder stores each row's ``content`` as a JSON blob
    (``{type, question, answer, tags}``). Return the human-readable answer
    for display; fall back to the raw string if it isn't that JSON shape.
    Keeps answers clean even when LLM polish is off or unavailable."""
    content = (content or '').strip()
    if not content:
        return ''
    try:
        obj = json.loads(content)
    except Exception:
        return content
    if isinstance(obj, dict):
        # Combine question + answer when both exist: for `decision`-type
        # entries the substance often lives in the question field while the
        # answer is a one-line gloss ("Targets have been set."). Passing the
        # answer alone starved the model into "context is insufficient".
        q = obj.get('question')
        q = q.strip() if isinstance(q, str) else ''
        for key in ('answer', 'definition', 'summary', 'decision', 'content', 'text'):
            val = obj.get(key)
            if isinstance(val, str) and val.strip():
                a = val.strip()
                return f"{q}\n{a}" if q and q not in a else a
        if q:
            return q
    return content


class SupportAgent(AutonomousAgent):
    """Q&A over a community's knowledge base.

    Autonomous role: subscribes to ``msg.created``. Cheap
    classifies if the message is a question; only acts when (a) it is,
    (b) the TF-IDF best match clears a (per-channel adaptive) score
    threshold. Emits a ``support_suggestion`` socket event so the
    frontend can render a collapsed suggestion chip — never posts a
    full bot message.
    """

    NAME = "support"
    GOAL = {"proactive_answers_from_kb": True, "low_intrusiveness": True}
    SUBSCRIBES = [_event_bus.TOPIC_MSG_CREATED]
    COOLDOWN_SECONDS = 90  # per-channel: at most one suggestion every 90s

    # Adaptive score threshold; learn() raises/lowers via agent_state.
    _DEFAULT_SCORE_THRESHOLD = 0.18  # higher than the on-demand _MIN_SCORE

    _QUESTION_RE = re.compile(
        r"(\?\s*$)|"
        r"\b(what|why|how|when|where|which|who|can|could|does|do|is|are|"
        r"should|kaise|kese|kya|kis|kab|kahan|kyun|kyon)\b",
        re.IGNORECASE,
    )

    def __init__(self):
        self.llm = _llm_client
        self.llm_available = _LLM_AVAILABLE and _llm_client is not None
        self._indices: Dict[int, Dict] = {}      # community_id -> { ts, vec, mat, docs }
        self._lock = threading.Lock()

    # -------------------------------------------------------------- public
    def ask(
        self,
        question: str,
        community_id: int,
        user_id: Optional[int] = None,
        channel_id: Optional[int] = None,
        polish: bool = True,
    ) -> Dict:
        question = (question or '').strip()
        if not question:
            return {
                'success': False, 'answer': None,
                'error': 'empty_question', 'matched': False,
            }

        if not _SKLEARN_AVAILABLE:
            return {
                'success': False, 'answer': None,
                'error': 'sklearn_unavailable', 'matched': False,
            }

        cfg = get_community_settings(community_id, 'support', _SUPPORT_DEFAULTS)
        min_cosine = _resolve_min_cosine(cfg.get('min_score', 2))
        max_docs = int(cfg.get('max_docs', 500) or 500)

        try:
            candidates = self._top_matches(
                question, community_id,
                min_cosine=min_cosine, max_docs=max_docs, k=_RERANK_K,
            )
        except Exception as exc:
            print(f"[SUPPORT] retrieval failed: {exc}")
            return {
                'success': False, 'answer': None,
                'error': 'retrieval_failed', 'matched': False,
            }

        if not candidates:
            return {
                'success': True,
                'matched': False,
                'answer': "I couldn't find anything relevant in this community's "
                          "knowledge base. Try rephrasing or ask a teammate.",
                'sources': [],
            }

        best = candidates[0]
        score = best['score']

        # One LLM call reranks the candidates and writes the answer. Honor
        # the community's polish setting; with it off we serve the top-cosine
        # snippet exactly as before.
        use_llm = polish and bool(cfg.get('use_gemini_polish', True))
        answer: Optional[str] = None
        if use_llm and self.llm_available and self.llm:
            verdict = self._answer_from_candidates(question, candidates)
            # verdict is None when the call itself failed — fall through to
            # the snippet, which is what this agent has always done.
            if verdict is not None:
                if not verdict.get('answered'):
                    # The model read every candidate and none answered the
                    # question. Saying so beats reciting the nearest doc.
                    return {
                        'success': True,
                        'matched': False,
                        'answer': "I couldn't find anything in this community's "
                                  "knowledge base that answers that.",
                        'sources': [],
                    }
                idx = verdict.get('index')
                if isinstance(idx, int) and 0 <= idx < len(candidates):
                    best = candidates[idx]
                    score = best['score']
                answer = verdict.get('answer') or None

        if not answer:
            answer = _readable_snippet(best.get('content'))[:800]

        # Log
        try:
            conn = get_db_connection(); cur = conn.cursor()
            cur.execute(
                "INSERT INTO ai_agent_logs "
                "(agent_name, action_type, user_id, channel_id, community_id, "
                " input_data, output_data, status, execution_time_ms, created_at) "
                "VALUES ('support', 'ask', %s, %s, %s, %s, %s, 'success', 0, NOW())",
                (
                    user_id, channel_id, community_id,
                    json.dumps({'q': question[:500]})[:1000],
                    json.dumps({'score': score, 'kb_id': best.get('id')})[:1000],
                ),
            )
            conn.commit()
            cur.close(); conn.close()
        except Exception as exc:
            print(f"[SUPPORT] log failed: {exc}")

        # Honor show_sources: when false, callers still get a citation-less
        # answer (keeps the response shape stable; UI hides the chip).
        sources = [
            {
                'id': best.get('id'),
                'title': best.get('title'),
                'category': best.get('category'),
            }
        ] if cfg.get('show_sources', True) else []

        return {
            'success': True,
            'matched': True,
            'answer': answer,
            'score': score,
            'sources': sources,
        }

    # ------------------------------------------------------------- internals
    def _answer_from_candidates(
        self,
        question: str,
        candidates: List[Dict],
    ) -> Optional[Dict]:
        """Rerank the retrieved passages and write the answer in one call.

        Returns ``{'answered': bool, 'index': int|None, 'answer': str}``, or
        None when the call failed — the caller then falls back to the raw
        top-cosine snippet, which is the behaviour this agent had before.

        ``index`` is the passage the answer came from, so the citation chip
        points at the document the model actually used rather than whatever
        TF-IDF happened to rank first.

        The request carries its own timeout because the synchronous
        ``/support`` HTTP route blocks on this; a stalled provider must not
        hold a Flask worker open.
        """
        try:
            blocks = []
            for i, doc in enumerate(candidates):
                title = (doc.get('title') or 'Untitled').strip()
                body = _readable_snippet(doc.get('content'))[:1200]
                blocks.append(f"[{i}] {title}\n{body}")
            passages = "\n\n".join(blocks)

            prompt = (
                f"Question: {question[:400]}\n\n"
                f"Passages:\n{passages}\n\n"
                'Return a JSON object: {"answered": true or false, '
                '"index": the number of the passage you used or null, '
                '"answer": your answer as a string}'
            )
            verdict = self.llm.complete_json(
                prompt,
                system=_SUPPORT_SYSTEM,
                temperature=0.2,
                max_tokens=350,
                timeout=10.0,
            )
            if not isinstance(verdict, dict):
                return None

            answered = bool(verdict.get('answered'))
            raw_answer = str(verdict.get('answer') or '').strip()
            if answered and not raw_answer:
                return None

            index = verdict.get('index')
            try:
                index = int(index) if index is not None else None
            except (TypeError, ValueError):
                index = None

            # JSON mode skips the humanizer (it would corrupt the payload),
            # so run it on the extracted prose here.
            from utils.ai.llm_client import humanize_text
            return {
                'answered': answered,
                'index': index,
                'answer': humanize_text(raw_answer)[:1000],
            }
        except Exception as exc:
            print(f"[SUPPORT] rerank/answer call failed: {exc}")
            return None

    def _top_matches(
        self,
        question: str,
        community_id: int,
        min_cosine: float = _MIN_SCORE,
        max_docs: int = 500,
        k: int = _RERANK_K,
    ) -> List[Dict]:
        """Return up to ``k`` docs above ``min_cosine``, best first.

        The extra candidates exist for the reranking step in ``ask()``. The
        threshold still applies to every one of them, so a low-signal query
        returns an empty list exactly as ``_best_match`` returned None.
        """
        index = self._get_or_build_index(community_id, max_docs=max_docs)
        if not index or not index.get('docs'):
            return []

        vectorizer = index['vectorizer']
        matrix = index['matrix']
        docs = index['docs']

        try:
            q_vec = vectorizer.transform([question])
            sims = cosine_similarity(q_vec, matrix)[0]
        except Exception as exc:
            print(f"[SUPPORT] vector match failed: {exc}")
            return []

        if len(sims) == 0:
            return []

        floor = float(min_cosine or _MIN_SCORE)
        # argsort ascending, so take the tail and reverse for best-first.
        order = sims.argsort()[::-1][: max(1, int(k))]
        out: List[Dict] = []
        for idx in order:
            score = float(sims[int(idx)])
            if score < floor:
                break  # sorted desc — everything after is worse
            out.append({**docs[int(idx)], 'score': round(score, 4)})
        return out

    def _best_match(
        self,
        question: str,
        community_id: int,
        min_cosine: float = _MIN_SCORE,
        max_docs: int = 500,
    ) -> Optional[Dict]:
        """Single best doc, or None. Kept for ``decide()``, which must stay
        cheap: the autonomous path does retrieval only, never an LLM call."""
        matches = self._top_matches(
            question, community_id,
            min_cosine=min_cosine, max_docs=max_docs, k=1,
        )
        return matches[0] if matches else None

    def _get_or_build_index(
        self,
        community_id: int,
        max_docs: int = 500,
    ) -> Optional[Dict]:
        with self._lock:
            cached = self._indices.get(community_id)
            # Invalidate the cached index when the doc-cap setting changed
            # since last build — otherwise a setting flip would silently
            # serve a stale 500-doc index until the 5-minute TTL elapses.
            if cached and (time.time() - cached['ts']) < _INDEX_TTL_SECONDS \
                    and cached.get('max_docs') == max_docs:
                return cached

        docs = self._load_docs(community_id, max_docs=max_docs)
        if not docs:
            with self._lock:
                self._indices[community_id] = {
                    'ts': time.time(), 'vectorizer': None,
                    'matrix': None, 'docs': [], 'max_docs': max_docs,
                }
            return self._indices[community_id]

        try:
            corpus = [d['searchable'] for d in docs]
            vectorizer = TfidfVectorizer(
                lowercase=True,
                stop_words='english',
                ngram_range=(1, 2),
                max_df=0.9,
                min_df=1,
            )
            matrix = vectorizer.fit_transform(corpus)
        except Exception as exc:
            print(f"[SUPPORT] build index failed: {exc}")
            return None

        index = {
            'ts': time.time(),
            'vectorizer': vectorizer,
            'matrix': matrix,
            'docs': docs,
            'max_docs': max_docs,
        }
        with self._lock:
            self._indices[community_id] = index
        return index

    def _load_docs(self, community_id: int, max_docs: int = 500) -> List[Dict]:
        try:
            # Clamp to a sane range so a hostile settings row can't push
            # us into an unbounded scan or a zero-doc no-op.
            try:
                lim = max(50, min(2000, int(max_docs)))
            except (TypeError, ValueError):
                lim = 500
            conn = get_db_connection(); cur = conn.cursor()
            # knowledge_base rows are scoped by `related_channel`; a community
            # owns many channels, so join through `channels` to gather every
            # doc for the community. (The table has no community_id/category/
            # is_published columns — see migrations/schema.sql.)
            cur.execute(
                "SELECT kb.id, kb.title, kb.content, kb.source "
                "FROM knowledge_base kb "
                "JOIN channels c ON kb.related_channel = c.id "
                "WHERE c.community_id = %s "
                "ORDER BY kb.id DESC LIMIT %s",
                (community_id, lim),
            )
            rows = cur.fetchall() or []
            cur.close(); conn.close()
        except Exception as exc:
            print(f"[SUPPORT] load docs failed: {exc}")
            return []

        out: List[Dict] = []
        for row in rows:
            if isinstance(row, dict):
                d = row
            else:
                d = {
                    'id': row[0], 'title': row[1], 'content': row[2],
                    'source': row[3],
                }
            title = (d.get('title') or '').strip()
            content = (d.get('content') or '').strip()
            if not (title or content):
                continue
            d['searchable'] = f"{title}. {content}".strip()
            out.append(d)
        return out

    def invalidate(self, community_id: Optional[int] = None) -> None:
        """Drop cached indices so the next query rebuilds."""
        with self._lock:
            if community_id is None:
                self._indices.clear()
            else:
                self._indices.pop(community_id, None)

    # ────────────────────────────────────────────────────────────────────
    # Autonomous hooks
    # ────────────────────────────────────────────────────────────────────

    def sense(self, event: dict) -> Optional[Dict]:
        content = (event.get("content") or "").strip()
        if not content or content.startswith("/"):
            return None
        # Must look like a question.
        if not self._QUESTION_RE.search(content):
            return None
        if not event.get("community_id"):
            return None  # No KB without a community.
        # G1a per-channel override (CoverageMatrix). Falls through to
        # community-level kill-switch via base.py helper.
        if not self._is_enabled_for_channel(
            event.get("community_id"), event.get("channel_id")
        ):
            return None
        return {
            "question":     content[:500],
            "community_id": event.get("community_id"),
            "channel_id":   event.get("channel_id"),
            "user_id":      event.get("user_id"),
            "message_id":   event.get("message_id"),
            "scope_type":   "channel",
            "scope_id":     event.get("channel_id"),
        }

    def decide(self, observation: Dict):
        # No LLM call here — TF-IDF only; this runs on every question-shaped
        # message in every channel, so it has to stay free.
        if not _SKLEARN_AVAILABLE:
            return ("skip", observation, "sklearn_unavailable")
        try:
            best = self._best_match(
                observation["question"], observation["community_id"])
        except Exception:
            return ("skip", observation, "retrieval_failed")
        if not best:
            return ("skip", observation, "no_kb_match")
        threshold = self._score_threshold(observation["channel_id"])
        if best["score"] < threshold:
            return ("defer", observation,
                    f"score_{best['score']:.2f}_below_{threshold:.2f}")
        return ("act", {
            **observation,
            "kb_id":    best.get("id"),
            "kb_title": best.get("title"),
            "snippet":  _readable_snippet(best.get("content"))[:400],
            "score":    best["score"],
        }, f"kb_match_{best['score']:.2f}")

    def act(self, payload: Dict, correlation_id: str) -> Optional[Dict]:
        """Emit a 'support_suggestion' socket event into the channel.
        The frontend renders this as a collapsed suggestion chip; the
        user opts in by clicking — much less intrusive than a full
        bot reply.
        """
        try:
            from app import socketio  # lazy: avoid circular import
            socketio.emit("support_suggestion", {
                "channel_id":   payload.get("channel_id"),
                "community_id": payload.get("community_id"),
                "message_id":   payload.get("message_id"),
                "kb_id":        payload.get("kb_id"),
                "kb_title":     payload.get("kb_title"),
                "snippet":      payload.get("snippet"),
                "score":        payload.get("score"),
                "correlation_id": correlation_id,
            }, room=f"channel_{payload.get('channel_id')}", namespace="/")
        except Exception as exc:
            print(f"[SUPPORT] suggestion emit failed: {exc}")
            return {"emitted": False}
        return {"emitted": True, "kb_id": payload.get("kb_id")}

    def learn(self, action_id: int, signal: str, *, weight: float = 1.0) -> None:
        """Click-through rate over time: positive/engaged lowers the
        threshold (we're being helpful); dismissed raises it (we're
        being noisy)."""
        try:
            from agents import memory as _mem
            action = _mem.get_action(action_id)
            if not action or not action.get("channel_id"):
                return super().learn(action_id, signal, weight=weight)
            channel_id = action["channel_id"]
            state = _mem.get_state(self.NAME, _mem.SCOPE_CHANNEL, channel_id) or {}
            th = dict(state.get("thresholds") or {})
            thr = float(th.get("score_threshold", self._DEFAULT_SCORE_THRESHOLD))
            if signal in ("positive", "engaged"):
                thr = max(0.10, thr - 0.02 * float(weight))
            elif signal in ("negative", "dismissed"):
                thr = min(0.45, thr + 0.03 * float(weight))
            th["score_threshold"] = round(thr, 3)
            _mem.set_state(self.NAME, _mem.SCOPE_CHANNEL, channel_id,
                           thresholds=th)
        except Exception as exc:
            print(f"[SUPPORT] learn failed: {exc}")
        super().learn(action_id, signal, weight=weight)

    def _score_threshold(self, channel_id: Optional[int]) -> float:
        if not channel_id:
            return self._DEFAULT_SCORE_THRESHOLD
        try:
            from agents import memory as _mem
            state = _mem.get_state(self.NAME, _mem.SCOPE_CHANNEL, channel_id)
            if not state:
                return self._DEFAULT_SCORE_THRESHOLD
            return float((state.get("thresholds") or {})
                         .get("score_threshold", self._DEFAULT_SCORE_THRESHOLD))
        except Exception:
            return self._DEFAULT_SCORE_THRESHOLD
