"""
Auto Message Generator Agent
============================
Two responsibilities:
  1. Welcome message — fired automatically when a user joins a community.
     Posts as the AI bot in the community's default channel.
  2. Quick-reply suggestions — suggests 3 short replies the user can tap to
     send. Suggestions are SUGGESTIONS only, never auto-posted.

Light, deterministic, no heavy ML. Optional Gemini polish for welcome
copy when GEMINI_API_KEY is set.
"""

from __future__ import annotations

import json
import random
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from database import get_db_connection

try:
    from google import genai
    from config import GEMINI_API_KEY
    _GEMINI_AVAILABLE = bool(GEMINI_API_KEY)
    _gemini_client = genai.Client(api_key=GEMINI_API_KEY) if _GEMINI_AVAILABLE else None
except Exception:
    _GEMINI_AVAILABLE = False
    _gemini_client = None


_LEXICON_PATH = Path(__file__).parent.parent / 'lexicons' / 'auto_messages.json'


def _load_lex() -> Dict:
    try:
        if _LEXICON_PATH.exists():
            with open(_LEXICON_PATH, 'r', encoding='utf-8') as fh:
                return json.load(fh)
    except Exception as exc:
        print(f"[AUTO_MESSAGE] lexicon load failed: {exc}")
    return {}


_LEX = _load_lex()


# Patterns -> reply suggestion banks
_INTENT_PATTERNS = [
    ('greeting', re.compile(
        r'^\s*(hi|hello|hey|yo|salam|assalam|hola|namaste)\b', re.IGNORECASE)),
    ('thanks', re.compile(r'\b(thanks|thank you|thx|shukriya)\b', re.IGNORECASE)),
    ('question', re.compile(r'\?\s*$')),
    ('help_request', re.compile(r'\b(help|stuck|issue|problem|error)\b', re.IGNORECASE)),
    ('confirm', re.compile(r'\b(ok|okay|done|sure|got it)\b', re.IGNORECASE)),
    ('apology', re.compile(r'\b(sorry|apolog|my bad)\b', re.IGNORECASE)),
]


class AutoMessageAgent:
    """Generates welcome posts and quick-reply suggestions."""

    def __init__(self):
        self.gemini_available = _GEMINI_AVAILABLE
        self.gemini_client = _gemini_client
        self.gemini_model = 'gemini-2.5-flash'

    # ---------------------------------------------------------------- welcome
    def generate_welcome(
        self,
        community_name: str,
        username: str,
        community_description: Optional[str] = None,
        channel_id: Optional[int] = None,
        community_id: Optional[int] = None,
        user_id: Optional[int] = None,
        post: bool = False,
    ) -> Dict:
        """Build a welcome message; optionally post it as an AI bot message."""
        community_name = (community_name or 'this community').strip()
        username = (username or 'friend').strip()

        # Try Gemini first for a polished line
        text: Optional[str] = None
        if self.gemini_available and self.gemini_client:
            try:
                prompt = (
                    "Write ONE warm, short welcome message (max 2 sentences) "
                    "for a new community member. Plain text, no emojis. "
                    f"Community: {community_name}. "
                    f"New member: {username}. "
                    + (f"Community is about: {community_description}. "
                       if community_description else "")
                )
                resp = self.gemini_client.models.generate_content(
                    model=self.gemini_model, contents=prompt,
                )
                t = (getattr(resp, 'text', '') or '').strip()
                if t:
                    text = t.split('\n')[0].strip()[:300]
            except Exception as exc:
                print(f"[AUTO_MESSAGE] Gemini welcome failed: {exc}")

        if not text:
            templates = (_LEX.get('welcome_templates')
                         or [
                             "Welcome to {community}, {user}! Glad you're here.",
                             "Hey {user}, welcome to {community}! Feel free to introduce yourself.",
                             "Welcome aboard, {user}! Take a look around {community} and say hi when ready.",
                         ])
            text = random.choice(templates).format(community=community_name, user=username)

        result: Dict = {
            'success': True,
            'text': text,
            'community_id': community_id,
            'channel_id': channel_id,
        }

        if post and channel_id:
            posted = self._post_as_ai_bot(text, channel_id, community_id)
            result['posted'] = posted.get('posted', False)
            if posted.get('message_id'):
                result['message_id'] = posted['message_id']

        # Log
        try:
            conn = get_db_connection(); cur = conn.cursor()
            cur.execute(
                "INSERT INTO ai_agent_logs "
                "(agent_type, action, user_id, channel_id, community_id, "
                " input_data, output_data, success, processing_time_ms, created_at) "
                "VALUES ('auto_message', 'welcome', %s, %s, %s, %s, %s, 1, 0, NOW())",
                (
                    user_id, channel_id, community_id,
                    json.dumps({'community_name': community_name,
                                'username': username})[:500],
                    json.dumps({'text': text})[:1000],
                ),
            )
            conn.commit()
            cur.close(); conn.close()
        except Exception as exc:
            print(f"[AUTO_MESSAGE] log failed: {exc}")

        return result

    # ----------------------------------------------------------- quick replies
    def quick_replies(self, last_message: str, max_suggestions: int = 3) -> Dict:
        """Return up to N short suggested reply chips for ``last_message``.
        Suggestions only — NEVER auto-posted.
        """
        text = (last_message or '').strip()
        if not text:
            return {'success': True, 'suggestions': []}

        intent = 'general'
        for name, pat in _INTENT_PATTERNS:
            if pat.search(text):
                intent = name
                break

        bank = (_LEX.get('quick_replies') or {}).get(intent) \
            or (_LEX.get('quick_replies') or {}).get('general') \
            or ["Got it", "Thanks!", "Sounds good"]

        # Deduplicate while preserving order, then sample.
        seen, ordered = set(), []
        for item in bank:
            if item not in seen:
                seen.add(item)
                ordered.append(item)

        suggestions = (random.sample(ordered, k=min(max_suggestions, len(ordered)))
                       if len(ordered) >= max_suggestions
                       else ordered[:max_suggestions])

        return {
            'success': True,
            'intent': intent,
            'suggestions': suggestions,
        }

    # ----------------------------------------------------- internal helpers
    def _post_as_ai_bot(
        self,
        text: str,
        channel_id: int,
        community_id: Optional[int],
    ) -> Dict:
        """Insert an AI bot message into the channel and broadcast it."""
        try:
            conn = get_db_connection(); cur = conn.cursor()
            cur.execute(
                "INSERT INTO messages "
                "(content, sender_id, channel_id, community_id, message_type, "
                " is_ai_generated, created_at) "
                "VALUES (%s, NULL, %s, %s, 'ai', 1, NOW())",
                (text, channel_id, community_id),
            )
            mid = cur.lastrowid
            conn.commit()
            cur.close(); conn.close()

            try:
                from app import socketio  # lazy to avoid circular import
                payload = {
                    'id': mid,
                    'content': text,
                    'sender_id': None,
                    'channel_id': channel_id,
                    'community_id': community_id,
                    'message_type': 'ai',
                    'is_ai_generated': True,
                    'username': 'AuraFlow Bot',
                    'created_at': datetime.utcnow().isoformat() + 'Z',
                }
                socketio.emit('message_received', payload,
                              room=f'channel_{channel_id}', namespace='/')
            except Exception as emit_exc:
                print(f"[AUTO_MESSAGE] socket emit failed: {emit_exc}")

            return {'posted': True, 'message_id': mid}
        except Exception as exc:
            print(f"[AUTO_MESSAGE] _post_as_ai_bot failed: {exc}")
            return {'posted': False, 'error': str(exc)}
