"""
AI Assistant Agent
==================
Lightweight Q&A / chatbot. Uses Gemini (gemini-2.5-flash) when an API key
is available, otherwise falls back to a curated lexicon of canned replies
(jokes, motivational quotes, generic acknowledgements). All public methods
return a dictionary; they never raise.
"""

from __future__ import annotations

import json
import os
import random
import re
import time
from pathlib import Path
from typing import Dict, List, Optional

from database import get_db_connection
from agents.base import AutonomousAgent
from agents import event_bus as _event_bus
from agents._settings import get_personal_settings
from services.redis_client import get_redis as _get_redis


_ASSISTANT_DEFAULTS = {
    'use_gemini': True,
    'reply_style': 'concise',
    'max_history': 5,
    'allow_jokes': True,
    'allow_motivation': True,
    'memory_paused': False,
}


_REPLY_STYLE_HINT = {
    'concise':  ("Reply in 1-2 short sentences. Plain text. No markdown headings.", 600),
    'friendly': ("Reply in 1-3 short, warm sentences. Plain text. No markdown headings.", 800),
    'detailed': ("Reply in 3-5 sentences with helpful detail. Plain text. No markdown headings.", 1200),
}

# -- Optional Gemini ---------------------------------------------------------
try:
    from google import genai
    from google.genai import errors as genai_errors
    from config import GEMINI_API_KEY
    _GEMINI_AVAILABLE = bool(GEMINI_API_KEY)
    if _GEMINI_AVAILABLE:
        _gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    else:
        _gemini_client = None
except Exception as exc:  # pragma: no cover
    _GEMINI_AVAILABLE = False
    _gemini_client = None
    print(f"[ASSISTANT] Gemini unavailable: {exc}")


_LEXICON_PATH = Path(__file__).parent.parent / 'lexicons' / 'assistant_fallback.json'


def _load_fallback() -> Dict:
    try:
        if _LEXICON_PATH.exists():
            with open(_LEXICON_PATH, 'r', encoding='utf-8') as fh:
                return json.load(fh)
    except Exception as exc:
        print(f"[ASSISTANT] fallback load failed: {exc}")
    return {
        'jokes': [
            "Why do programmers prefer dark mode? Because light attracts bugs.",
            "I told my computer I needed a break — it said 'no problem, I'll go to sleep.'",
            "There are 10 kinds of people: those who understand binary and those who don't.",
        ],
        'motivation': [
            "Small steps every day add up to big results.",
            "Progress, not perfection.",
            "You don't have to be great to start, but you have to start to be great.",
        ],
        'greetings': [
            "Hi there! How can I help you today?",
            "Hello! Ask me anything.",
            "Hey! Need help with something?",
        ],
        'fallback': [
            "I'm not sure about that one — try rephrasing?",
            "Hmm, I don't have a great answer for that. Could you give me more context?",
        ],
    }


_FALLBACK = _load_fallback()


_GREETING_RE = re.compile(r'^\s*(hi|hello|hey|salam|assalam|hola)\b', re.IGNORECASE)
_JOKE_RE = re.compile(r'\b(joke|funny|laugh)\b', re.IGNORECASE)
_MOTIVATION_RE = re.compile(r'\b(motivat|inspir|quote|encourage)\b', re.IGNORECASE)


class AssistantAgent(AutonomousAgent):
    """General-purpose Q&A assistant.

    Autonomous role (Phase 1.2): subscribes to ``msg.created`` and only
    acts on **explicit invocation** — either ``/ask`` prefix or an
    ``@assistant`` mention. Never barges in. Carries a 5-turn rolling
    memory per user in Redis (LIST) so follow-ups remember the prior
    exchange.
    """

    NAME = "assistant"
    GOAL = {"opt_in_pair_assistant": True}
    SUBSCRIBES = [_event_bus.TOPIC_MSG_CREATED]
    COOLDOWN_SECONDS = 0  # no global cooldown — user explicitly invoked

    # Redis LIST key holding the last N (user, content) turns per user.
    _MEMORY_KEY = "assistant:mem:{user_id}"
    _MEMORY_TURNS = 5

    def __init__(self):
        self.gemini_available = _GEMINI_AVAILABLE
        self.gemini_client = _gemini_client
        self.gemini_model = 'gemini-2.5-flash'
        self.max_input_chars = 1500
        self.max_output_chars = 1200

    # ------------------------------------------------------------------- API
    def ask(
        self,
        question: str,
        user_id: Optional[int] = None,
        channel_id: Optional[int] = None,
        community_id: Optional[int] = None,
        context: Optional[str] = None,
    ) -> Dict:
        question = (question or '').strip()
        if not question:
            return self._reply('Ask me anything!', source='empty')

        question_truncated = question[: self.max_input_chars]

        # Pull user prefs once — drives reply_style, allow_*, use_gemini.
        cfg = (get_personal_settings(user_id, 'assistant', _ASSISTANT_DEFAULTS)
               if user_id else dict(_ASSISTANT_DEFAULTS))

        # Quick lexicon shortcuts (avoid API calls when obvious)
        if _GREETING_RE.search(question_truncated):
            text = random.choice(_FALLBACK.get('greetings') or ['Hello!'])
            self._log(user_id, channel_id, community_id, question, text, 'lexicon')
            return self._reply(text, source='lexicon')

        if _JOKE_RE.search(question_truncated):
            if not cfg.get('allow_jokes', True):
                text = ("I'd love to crack a joke, but you've turned that off in "
                        "my settings. Toggle it back on if you change your mind!")
                self._log(user_id, channel_id, community_id, question, text, 'lexicon')
                return self._reply(text, source='lexicon', tag='joke_disabled')
            text = random.choice(_FALLBACK.get('jokes') or ['Be your own joke today!'])
            self._log(user_id, channel_id, community_id, question, text, 'lexicon')
            return self._reply(text, source='lexicon', tag='joke')

        if _MOTIVATION_RE.search(question_truncated):
            if not cfg.get('allow_motivation', True):
                text = ("Motivational replies are paused in your settings — flip "
                        "the toggle back on whenever you want them again.")
                self._log(user_id, channel_id, community_id, question, text, 'lexicon')
                return self._reply(text, source='lexicon', tag='motivation_disabled')
            text = random.choice(_FALLBACK.get('motivation') or ['Keep going!'])
            self._log(user_id, channel_id, community_id, question, text, 'lexicon')
            return self._reply(text, source='lexicon', tag='motivation')

        # Resolve reply-style hint + per-style output cap before the
        # Gemini call, so a 'detailed' user actually gets a longer reply.
        style_key = str(cfg.get('reply_style') or 'concise').lower()
        style_hint, style_cap = _REPLY_STYLE_HINT.get(
            style_key, _REPLY_STYLE_HINT['concise'])
        effective_cap = min(self.max_output_chars, style_cap)

        # Try Gemini for general questions — honor use_gemini toggle.
        use_gemini = bool(cfg.get('use_gemini', True))
        if use_gemini and self.gemini_available and self.gemini_client:
            try:
                prompt_parts: List[str] = [
                    "You are AuraFlow's friendly in-chat assistant.",
                    style_hint,
                    "If the user writes Roman Urdu, you may reply in the same style.",
                ]
                if context:
                    prompt_parts.append(f"Context: {context[:600]}")
                prompt_parts.append(f"User: {question_truncated}")
                prompt = "\n".join(prompt_parts)

                start = time.time()
                resp = self.gemini_client.models.generate_content(
                    model=self.gemini_model,
                    contents=prompt,
                )
                elapsed_ms = int((time.time() - start) * 1000)
                text = (getattr(resp, 'text', '') or '').strip()
                if text:
                    text = text[: effective_cap]
                    self._log(user_id, channel_id, community_id, question, text,
                              'gemini', elapsed_ms)
                    return self._reply(text, source='gemini')
            except genai_errors.ClientError as exc:
                print(f"[ASSISTANT] Gemini client error: {exc}")
            except Exception as exc:
                print(f"[ASSISTANT] Gemini failed: {exc}")

        # Final fallback
        text = random.choice(_FALLBACK.get('fallback')
                             or ["I'm not sure, try rephrasing."])
        self._log(user_id, channel_id, community_id, question, text, 'fallback')
        return self._reply(text, source='fallback')

    def random_joke(self, user_id: Optional[int] = None) -> Dict:
        if user_id:
            cfg = get_personal_settings(user_id, 'assistant', _ASSISTANT_DEFAULTS)
            if not cfg.get('allow_jokes', True):
                return self._reply(
                    "Jokes are turned off in your assistant settings.",
                    source='lexicon', tag='joke_disabled',
                )
        text = random.choice(_FALLBACK.get('jokes') or ['Smile — it\'s contagious.'])
        return self._reply(text, source='lexicon', tag='joke')

    def random_motivation(self, user_id: Optional[int] = None) -> Dict:
        if user_id:
            cfg = get_personal_settings(user_id, 'assistant', _ASSISTANT_DEFAULTS)
            if not cfg.get('allow_motivation', True):
                return self._reply(
                    "Motivational replies are turned off in your settings.",
                    source='lexicon', tag='motivation_disabled',
                )
        text = random.choice(_FALLBACK.get('motivation') or ['You got this!'])
        return self._reply(text, source='lexicon', tag='motivation')

    # ---------------------------------------------------------------- helpers
    def _reply(self, text: str, source: str, tag: Optional[str] = None) -> Dict:
        out = {
            'success': True,
            'reply': text,
            'source': source,
        }
        if tag:
            out['tag'] = tag
        return out

    def _log(
        self,
        user_id: Optional[int],
        channel_id: Optional[int],
        community_id: Optional[int],
        question: str,
        reply: str,
        source: str,
        elapsed_ms: int = 0,
    ) -> None:
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO ai_agent_logs "
                "(agent_type, action, user_id, channel_id, community_id, "
                " input_data, output_data, success, processing_time_ms, created_at) "
                "VALUES ('assistant', 'ask', %s, %s, %s, %s, %s, 1, %s, NOW())",
                (
                    user_id, channel_id, community_id,
                    json.dumps({'q': question[:500], 'source': source})[:1000],
                    json.dumps({'reply': reply[:1000]})[:2000],
                    elapsed_ms,
                ),
            )
            conn.commit()
            cur.close(); conn.close()
        except Exception as exc:
            print(f"[ASSISTANT] log failed: {exc}")

    # ────────────────────────────────────────────────────────────────────
    # Autonomous hooks (Phase 1.2)
    # ────────────────────────────────────────────────────────────────────

    _TRIGGER_RE = re.compile(
        r"(^\s*/ask\b)|(@assistant\b)", re.IGNORECASE
    )

    def sense(self, event: dict) -> Optional[Dict]:
        content = (event.get("content") or "").strip()
        if not content or not self._TRIGGER_RE.search(content):
            return None
        # Strip the trigger so the question itself goes to ask().
        question = self._TRIGGER_RE.sub("", content, count=1).strip()
        if not question:
            return None
        return {
            "question":     question[: self.max_input_chars],
            "channel_id":   event.get("channel_id"),
            "community_id": event.get("community_id"),
            "user_id":      event.get("user_id"),
            "message_id":   event.get("message_id"),
        }

    def decide(self, observation: Dict):
        # Sense already gated on the trigger; always act here.
        return ("act", observation, "explicit_invocation")

    def act(self, payload: Dict, correlation_id: str) -> Optional[Dict]:
        user_id    = payload.get("user_id")
        channel_id = payload.get("channel_id")
        community_id = payload.get("community_id")
        question   = payload.get("question", "")

        # Pull rolling context from Redis (best-effort).
        history = self._recall_memory(user_id)
        context = "\n".join(history) if history else None

        reply = self.ask(
            question=question,
            user_id=user_id,
            channel_id=channel_id,
            community_id=community_id,
            context=context,
        )
        text = (reply or {}).get("reply") or ""

        # Update memory: store the user turn + assistant reply.
        self._append_memory(user_id, f"User: {question}")
        if text:
            self._append_memory(user_id, f"Assistant: {text}")

        # Post the bot reply into the channel (if any). Reuse the sockets
        # helper so it integrates with the existing message broadcast.
        posted_msg_id = None
        if text and channel_id and user_id:
            try:
                from routes.sockets import _post_ai_bot_message
                _post_ai_bot_message(channel_id, user_id, text, author="Assistant")
            except Exception as exc:
                print(f"[ASSISTANT] auto-post failed: {exc}")

        return {
            "posted":        bool(text and channel_id),
            "reply":         text[:300],
            "message_id":    posted_msg_id,
            "source":        (reply or {}).get("source"),
        }

    # ── Redis-backed per-user rolling memory ────────────────────────

    def _memory_paused(self, user_id: Optional[int]) -> bool:
        """Return True when the user has flipped the 'pause memory' switch
        in their assistant settings (``user_agents.settings.memory_paused``).
        Best-effort: a DB error or missing row falls back to *not paused* so
        a transient outage never silently strips the rolling context.
        """
        if not user_id:
            return False
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT settings FROM user_agents "
                    "WHERE user_id=%s AND agent_type='assistant'",
                    (user_id,),
                )
                row = cur.fetchone()
            if not row:
                return False
            raw = row.get('settings') if isinstance(row, dict) else row[0]
            if not raw:
                return False
            settings = raw if isinstance(raw, dict) else json.loads(raw)
            return bool(settings.get('memory_paused'))
        except Exception:
            return False
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

    def _recall_memory(self, user_id: Optional[int]) -> List[str]:
        if not user_id or self._memory_paused(user_id):
            return []
        r = _get_redis()
        if r is None:
            return []
        try:
            # Honor the user's max_history slider (1..10 turns).
            cfg = get_personal_settings(user_id, 'assistant', _ASSISTANT_DEFAULTS)
            try:
                turns = max(1, min(10, int(cfg.get('max_history', self._MEMORY_TURNS))))
            except (TypeError, ValueError):
                turns = self._MEMORY_TURNS
            key = self._MEMORY_KEY.format(user_id=user_id)
            raw = r.lrange(key, 0, turns * 2 - 1)  # 2 lines per turn
            return list(reversed(raw or []))
        except Exception:
            return []

    def _append_memory(self, user_id: Optional[int], line: str) -> None:
        if not user_id or not line:
            return
        if self._memory_paused(user_id):
            return
        r = _get_redis()
        if r is None:
            return
        try:
            cfg = get_personal_settings(user_id, 'assistant', _ASSISTANT_DEFAULTS)
            try:
                turns = max(1, min(10, int(cfg.get('max_history', self._MEMORY_TURNS))))
            except (TypeError, ValueError):
                turns = self._MEMORY_TURNS
            key = self._MEMORY_KEY.format(user_id=user_id)
            pipe = r.pipeline()
            pipe.lpush(key, line[:600])
            pipe.ltrim(key, 0, turns * 2 - 1)
            pipe.expire(key, 60 * 30)  # 30-min window
            pipe.execute()
        except Exception:
            pass
