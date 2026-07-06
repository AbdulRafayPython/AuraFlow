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
from agents.base import AutonomousAgent
from agents import event_bus as _event_bus
from agents import memory as _agent_memory
from agents._settings import get_community_settings
from services.redis_client import get_redis as _get_redis

# TTL on the per-(community, user) welcome claim. The orchestrator runs one
# pub/sub loop per worker process; if a stray second worker is alive (common
# after restarts on Windows), the same user.joined event reaches every loop
# and each would post its own welcome. An atomic Redis claim collapses that
# fan-out to a single post. Kept short so a genuine re-join is re-welcomed.
_WELCOME_DEDUPE_TTL = 60  # seconds


_AUTO_MSG_DEFAULTS = {
    'welcome_enabled': True,
    'post_in_default_channel': True,
    'quick_replies_enabled': True,
    'use_gemini_polish': True,
}

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


class AutoMessageAgent(AutonomousAgent):
    """Generates welcome posts and quick-reply suggestions.

    Autonomous role (Phase 1.3): subscribes to ``user.joined_community``
    and posts a welcome message picked via a per-community
    multi-armed-bandit over the available welcome templates. Each
    template's reward is the count of positive ``agent_feedback`` rows
    pointing back at its ``agent_actions`` row. learn() updates the
    reward table.
    """

    NAME = "auto_message"
    GOAL = {"welcome_every_new_member": True, "learn_best_template_per_community": True}
    SUBSCRIBES = [_event_bus.TOPIC_USER_JOINED]
    SCOPE_TYPE = _agent_memory.SCOPE_COMMUNITY
    COOLDOWN_SECONDS = 0   # per-join: bounded naturally by user_joined cadence

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

        # Honor use_gemini_polish for this community — when off we skip the
        # Gemini call entirely and use a template directly.
        cfg = (get_community_settings(community_id, 'auto_message', _AUTO_MSG_DEFAULTS)
               if community_id else dict(_AUTO_MSG_DEFAULTS))
        use_polish = bool(cfg.get('use_gemini_polish', True))

        # Try Gemini first for a polished line
        text: Optional[str] = None
        if use_polish and self.gemini_available and self.gemini_client:
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

    # ────────────────────────────────────────────────────────────────────
    # Autonomous hooks (Phase 1.3)
    # ────────────────────────────────────────────────────────────────────

    def _claim_welcome(self, community_id: int, user_id: int) -> bool:
        """Atomically claim the right to welcome this (community, user) once.

        Returns True if this caller won the claim (should post), False if a
        concurrent orchestrator already claimed it. Fail-open: if Redis is
        unavailable we return True — the duplicate only happens *with* Redis +
        multiple loops anyway, and a single-worker setup must still welcome.
        """
        try:
            r = _get_redis()
            if r is None:
                return True
            key = f"auto_message:welcomed:{community_id}:{user_id}"
            # SET NX EX — only the first caller across all processes succeeds.
            return bool(r.set(key, "1", nx=True, ex=_WELCOME_DEDUPE_TTL))
        except Exception:
            return True

    def sense(self, event: dict) -> Optional[Dict]:
        community_id = event.get("community_id")
        user_id      = event.get("user_id")
        if not community_id or not user_id:
            return None
        # Community-level kill-switch: welcome_enabled=false → skip the
        # autonomous welcome (admins keep on-demand posts available
        # through the agent route).
        try:
            cfg = get_community_settings(int(community_id), 'auto_message',
                                         _AUTO_MSG_DEFAULTS)
            if not cfg.get('welcome_enabled', True):
                return None
            if not cfg.get('post_in_default_channel', True) \
                    and not event.get("first_channel_id"):
                # Setting requires posting in the default channel; if the
                # join event didn't carry one and admin chose default-only,
                # we don't have a target.
                return None
        except Exception:
            pass
        # Idempotency guard — collapse duplicate dispatch from multiple
        # orchestrator loops to a single welcome. Must be the last gate so we
        # only claim when we're otherwise going to act.
        if not self._claim_welcome(int(community_id), int(user_id)):
            return None
        return {
            "community_id":     community_id,
            "user_id":          user_id,
            "username":         event.get("username") or "friend",
            "first_channel_id": event.get("first_channel_id"),
            "scope_type":       _agent_memory.SCOPE_COMMUNITY,
            "scope_id":         community_id,
        }

    def decide(self, observation: Dict):
        # We always want to welcome — picking the *template* is the
        # learning signal, not whether to act. The legacy
        # _maybe_post_welcome() in routes/channels.py already checks
        # whether the agent is installed / welcome_enabled; that gating
        # still applies before this event ever fires.
        if not observation.get("first_channel_id"):
            return ("skip", observation, "no_default_channel")
        # Pick template index via bandit; carry it forward so act() uses
        # the same arm.
        idx = self._pick_template_index(observation["community_id"])
        return ("act", {**observation, "template_idx": idx},
                f"welcome_template_{idx}")

    def act(self, payload: Dict, correlation_id: str) -> Optional[Dict]:
        community_id     = payload["community_id"]
        user_id          = payload["user_id"]
        first_channel_id = payload["first_channel_id"]
        username         = payload.get("username", "friend")
        template_idx     = payload.get("template_idx")

        # Look up the community name once.
        community_name = self._community_name(community_id) or "this community"

        # If we have a chosen template index, format it directly instead
        # of letting generate_welcome() pick randomly. Falls back to the
        # legacy random pick when the bandit returned None.
        text: Optional[str] = None
        templates = self._templates()
        if template_idx is not None and 0 <= template_idx < len(templates):
            try:
                text = templates[template_idx].format(
                    community=community_name, user=username,
                )
            except Exception:
                text = None

        if not text:
            res = self.generate_welcome(
                community_name=community_name,
                username=username,
                channel_id=first_channel_id,
                community_id=community_id,
                user_id=user_id,
                post=True,
            )
            return {"posted": res.get("posted"), "message_id": res.get("message_id"),
                    "template_idx": None}

        # Post directly via the sockets helper (channels-table-safe).
        try:
            from routes.sockets import _post_ai_bot_message
            _post_ai_bot_message(first_channel_id, user_id, text,
                                 author="AuraFlow Bot")
        except Exception as exc:
            print(f"[AUTO_MESSAGE] welcome post failed: {exc}")
            return {"posted": False, "template_idx": template_idx}

        # Quick-reply chips: when the community has them enabled, emit
        # three templated suggestions to the new member's personal socket
        # room so the frontend can render them under the chat input. Lazy
        # import socketio + best-effort emit — failure to emit doesn't
        # affect the welcome post itself.
        quick_replies: List[str] = []
        try:
            am_cfg = get_community_settings(
                community_id, 'auto_message', _AUTO_MSG_DEFAULTS)
            if am_cfg.get('quick_replies_enabled', True):
                community_name = self._community_name(community_id) or "this community"
                quick_replies = [
                    "Hi everyone!",
                    f"Excited to be in {community_name}!",
                    "What's everyone working on?",
                ]
                try:
                    from app import socketio  # lazy import
                    socketio.emit('welcome_quick_replies', {
                        'community_id': community_id,
                        'channel_id':   first_channel_id,
                        'suggestions':  quick_replies,
                        'correlation_id': correlation_id,
                    }, room=f"user_{user_id}", namespace='/')
                except Exception as emit_exc:
                    print(f"[AUTO_MESSAGE] quick_replies emit failed: {emit_exc}")
        except Exception:
            pass

        return {"posted": True, "template_idx": template_idx,
                "text": text[:240],
                "quick_replies": quick_replies}

    def learn(self, action_id: int, signal: str, *, weight: float = 1.0) -> None:
        """Bump the template-arm reward when feedback is positive/engaged.
        Falls back to the default counter for other signals.
        """
        try:
            action = _agent_memory.get_action(action_id)
            if not action:
                return
            community_id = action.get("community_id")
            # The chosen template index is in the action's payload.
            payload = None
            try:
                # payload_json was stripped on read; refetch raw.
                payload = self._payload_for(action_id)
            except Exception:
                payload = None
            idx = (payload or {}).get("template_idx")
            if community_id is not None and idx is not None and \
               signal in ("positive", "engaged"):
                state = _agent_memory.get_state(
                    self.NAME, _agent_memory.SCOPE_COMMUNITY, community_id) or {}
                th = dict(state.get("thresholds") or {})
                rewards = dict(th.get("template_rewards") or {})
                rewards[str(idx)] = float(rewards.get(str(idx), 0)) + float(weight)
                th["template_rewards"] = rewards
                _agent_memory.set_state(
                    self.NAME, _agent_memory.SCOPE_COMMUNITY, community_id,
                    thresholds=th, last_outcome="positive",
                )
        except Exception as exc:
            print(f"[AUTO_MESSAGE] learn failed: {exc}")
        # Always also run the default counter for completeness.
        super().learn(action_id, signal, weight=weight)

    # ── Bandit helpers ──────────────────────────────────────────────

    def _templates(self) -> List[str]:
        return list(_LEX.get('welcome_templates') or [
            "Welcome to {community}, {user}! Glad you're here.",
            "Hey {user}, welcome to {community}! Feel free to introduce yourself.",
            "Welcome aboard, {user}! Take a look around {community} and say hi when ready.",
        ])

    def _pick_template_index(self, community_id: int) -> Optional[int]:
        """ε-greedy: 80% pick best-reward arm, 20% explore."""
        templates = self._templates()
        if not templates:
            return None
        state = _agent_memory.get_state(
            self.NAME, _agent_memory.SCOPE_COMMUNITY, community_id) or {}
        rewards = (state.get("thresholds") or {}).get("template_rewards") or {}
        # 20% exploration
        if random.random() < 0.2 or not rewards:
            return random.randrange(len(templates))
        # Else exploit the best arm seen so far.
        try:
            best_key = max(rewards, key=lambda k: float(rewards[k]))
            idx = int(best_key)
            if 0 <= idx < len(templates):
                return idx
        except Exception:
            pass
        return random.randrange(len(templates))

    def _community_name(self, community_id: int) -> Optional[str]:
        try:
            conn = get_db_connection(); cur = conn.cursor()
            cur.execute("SELECT name FROM communities WHERE id=%s", (community_id,))
            row = cur.fetchone()
            cur.close(); conn.close()
            if row:
                return row['name'] if isinstance(row, dict) else row[0]
        except Exception:
            pass
        return None

    def _payload_for(self, action_id: int) -> Optional[Dict]:
        try:
            conn = get_db_connection(); cur = conn.cursor()
            cur.execute("SELECT payload_json FROM agent_actions WHERE id=%s",
                        (action_id,))
            row = cur.fetchone()
            cur.close(); conn.close()
            if not row:
                return None
            raw = row['payload_json'] if isinstance(row, dict) else row[0]
            if isinstance(raw, (str, bytes, bytearray)):
                return json.loads(raw)
            return raw
        except Exception:
            return None
