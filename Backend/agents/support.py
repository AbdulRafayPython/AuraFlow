"""
Context-Aware Support Agent
===========================
Lightweight document Q&A using TF-IDF cosine similarity over the
``knowledge_base`` rows already produced by the Knowledge Builder agent.

Pipeline
--------
1. Query → fetch all knowledge_base rows for the community.
2. Build / reuse a per-community TF-IDF index (cached in process).
3. Cosine-rank the docs, return the top match if it clears a threshold.
4. (Optional) Pass the question + best snippet through Gemini for a polished
   answer. If Gemini is unavailable, return the snippet verbatim.

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
    from google import genai
    from config import GEMINI_API_KEY
    _GEMINI_AVAILABLE = bool(GEMINI_API_KEY)
    _gemini_client = genai.Client(api_key=GEMINI_API_KEY) if _GEMINI_AVAILABLE else None
except Exception:
    _GEMINI_AVAILABLE = False
    _gemini_client = None


_INDEX_TTL_SECONDS = 5 * 60  # rebuild per-community index every 5 minutes
_MIN_SCORE = 0.12            # cosine threshold below which we say "no match"


class SupportAgent(AutonomousAgent):
    """Q&A over a community's knowledge base.

    Autonomous role (Phase 1.4): subscribes to ``msg.created``. Cheap
    classifies if the message is a question; only acts when (a) it is,
    (b) the TF-IDF best match clears a (per-channel adaptive) score
    threshold. Emits a ``support_suggestion`` socket event so the
    frontend can render a collapsed suggestion chip — never posts a
    full bot message in Phase 1.
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
        self.gemini_available = _GEMINI_AVAILABLE
        self.gemini_client = _gemini_client
        self.gemini_model = 'gemini-2.5-flash'
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
            best = self._best_match(
                question, community_id,
                min_cosine=min_cosine, max_docs=max_docs,
            )
        except Exception as exc:
            print(f"[SUPPORT] retrieval failed: {exc}")
            return {
                'success': False, 'answer': None,
                'error': 'retrieval_failed', 'matched': False,
            }

        if not best:
            return {
                'success': True,
                'matched': False,
                'answer': "I couldn't find anything relevant in this community's "
                          "knowledge base. Try rephrasing or ask a teammate.",
                'sources': [],
            }

        snippet = (best['content'] or '').strip()
        score = best['score']

        # Optionally polish via Gemini — honor the community setting.
        polished: Optional[str] = None
        gemini_polish = polish and bool(cfg.get('use_gemini_polish', True))
        if gemini_polish and self.gemini_available and self.gemini_client and snippet:
            polished = self._polish_with_gemini(question, snippet)

        answer = polished or snippet[:800]

        # Log
        try:
            conn = get_db_connection(); cur = conn.cursor()
            cur.execute(
                "INSERT INTO ai_agent_logs "
                "(agent_type, action, user_id, channel_id, community_id, "
                " input_data, output_data, success, processing_time_ms, created_at) "
                "VALUES ('support', 'ask', %s, %s, %s, %s, %s, 1, 0, NOW())",
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
    def _polish_with_gemini(self, question: str, snippet: str) -> Optional[str]:
        try:
            prompt = (
                "Answer the user's question using ONLY the context below. "
                "Reply in 1-3 short sentences. If context is insufficient, say so.\n\n"
                f"Context:\n{snippet[:1500]}\n\n"
                f"Question: {question[:400]}\n\nAnswer:"
            )
            resp = self.gemini_client.models.generate_content(
                model=self.gemini_model, contents=prompt,
            )
            text = (getattr(resp, 'text', '') or '').strip()
            return text[:1000] if text else None
        except Exception as exc:
            print(f"[SUPPORT] Gemini polish failed: {exc}")
            return None

    def _best_match(
        self,
        question: str,
        community_id: int,
        min_cosine: float = _MIN_SCORE,
        max_docs: int = 500,
    ) -> Optional[Dict]:
        index = self._get_or_build_index(community_id, max_docs=max_docs)
        if not index or not index.get('docs'):
            return None

        vectorizer = index['vectorizer']
        matrix = index['matrix']
        docs = index['docs']

        try:
            q_vec = vectorizer.transform([question])
            sims = cosine_similarity(q_vec, matrix)[0]
        except Exception as exc:
            print(f"[SUPPORT] vector match failed: {exc}")
            return None

        if len(sims) == 0:
            return None

        best_idx = int(sims.argmax())
        best_score = float(sims[best_idx])
        if best_score < float(min_cosine or _MIN_SCORE):
            return None

        doc = docs[best_idx]
        return {**doc, 'score': round(best_score, 4)}

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
            cur.execute(
                "SELECT id, title, content, category, source "
                "FROM knowledge_base "
                "WHERE community_id = %s AND COALESCE(is_published, 1) = 1 "
                "ORDER BY id DESC LIMIT %s",
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
                    'category': row[3], 'source': row[4],
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
    # Autonomous hooks (Phase 1.4)
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
        # No Gemini call here — TF-IDF only; cheap.
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
            "snippet":  (best.get("content") or "")[:400],
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
