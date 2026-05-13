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


class AssistantAgent:
    """General-purpose Q&A assistant."""

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

        # Quick lexicon shortcuts (avoid API calls when obvious)
        if _GREETING_RE.search(question_truncated):
            text = random.choice(_FALLBACK.get('greetings') or ['Hello!'])
            self._log(user_id, channel_id, community_id, question, text, 'lexicon')
            return self._reply(text, source='lexicon')

        if _JOKE_RE.search(question_truncated):
            text = random.choice(_FALLBACK.get('jokes') or ['Be your own joke today!'])
            self._log(user_id, channel_id, community_id, question, text, 'lexicon')
            return self._reply(text, source='lexicon', tag='joke')

        if _MOTIVATION_RE.search(question_truncated):
            text = random.choice(_FALLBACK.get('motivation') or ['Keep going!'])
            self._log(user_id, channel_id, community_id, question, text, 'lexicon')
            return self._reply(text, source='lexicon', tag='motivation')

        # Try Gemini for general questions
        if self.gemini_available and self.gemini_client:
            try:
                prompt_parts: List[str] = [
                    "You are AuraFlow's friendly in-chat assistant.",
                    "Reply in 1-3 short sentences. Plain text. No markdown headings.",
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
                    text = text[: self.max_output_chars]
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

    def random_joke(self) -> Dict:
        text = random.choice(_FALLBACK.get('jokes') or ['Smile — it\'s contagious.'])
        return self._reply(text, source='lexicon', tag='joke')

    def random_motivation(self) -> Dict:
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
