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
import threading
import time
from typing import Dict, List, Optional, Tuple

from database import get_db_connection

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


class SupportAgent:
    """Q&A over a community's knowledge base."""

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

        try:
            best = self._best_match(question, community_id)
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

        # Optionally polish via Gemini.
        polished: Optional[str] = None
        if polish and self.gemini_available and self.gemini_client and snippet:
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

        return {
            'success': True,
            'matched': True,
            'answer': answer,
            'score': score,
            'sources': [
                {
                    'id': best.get('id'),
                    'title': best.get('title'),
                    'category': best.get('category'),
                }
            ],
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

    def _best_match(self, question: str, community_id: int) -> Optional[Dict]:
        index = self._get_or_build_index(community_id)
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
        if best_score < _MIN_SCORE:
            return None

        doc = docs[best_idx]
        return {**doc, 'score': round(best_score, 4)}

    def _get_or_build_index(self, community_id: int) -> Optional[Dict]:
        with self._lock:
            cached = self._indices.get(community_id)
            if cached and (time.time() - cached['ts']) < _INDEX_TTL_SECONDS:
                return cached

        docs = self._load_docs(community_id)
        if not docs:
            with self._lock:
                self._indices[community_id] = {
                    'ts': time.time(), 'vectorizer': None,
                    'matrix': None, 'docs': [],
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
        }
        with self._lock:
            self._indices[community_id] = index
        return index

    def _load_docs(self, community_id: int) -> List[Dict]:
        try:
            conn = get_db_connection(); cur = conn.cursor()
            cur.execute(
                "SELECT id, title, content, category, source "
                "FROM knowledge_base "
                "WHERE community_id = %s AND COALESCE(is_published, 1) = 1 "
                "ORDER BY id DESC LIMIT 500",
                (community_id,),
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
