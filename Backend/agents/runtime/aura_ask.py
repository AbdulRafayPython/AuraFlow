"""
Ask Aura privately
==================
The quick "Ask" box: one person asks Aura something and gets the answer back to themselves.
Nothing is posted to a channel, nothing waits for approval (the tools that post, poll or set
reminders are left out), and Aura can only read what that person may read.

It runs the same loop as an @aura mention, on a dry run, with a short memory per person so a
follow-up like "and the second one?" works. The memory lives in Redis for half an hour and can
be cleared.
"""

from __future__ import annotations

import dataclasses
import json
import logging
import os
from typing import Any, Dict, List, Optional

from agents.runtime import permissions
from agents.runtime.definitions import ensure_aura
from agents.runtime.loop import STATUS_UNAVAILABLE, run_agent
from agents.runtime.posting import post_as_agent
from agents.runtime.specs import AURA
from agents.runtime.store import get_default_store
from agents.runtime.tools import RISK_READ, TOOL_REGISTRY, ToolContext

log = logging.getLogger(__name__)

MAX_QUESTION_CHARS = 1000
MAX_TURNS = 5                      # question and answer pairs Aura remembers
MEMORY_SECONDS = 30 * 60
MEMORY_LINE_CHARS = 600
MAX_STEPS = 3                      # model calls per question: a quick answer, not a research job

MEMORY_KEY = "aura:mem:{user_id}"
RATE_KEY = "aura_ask:rate:{user_id}"

PRIVATE_NOTE = (
    "\n- This is the private Ask box: answer the person directly, nothing you say is posted in a "
    "channel. You cannot post, start a poll or set a reminder from here; if they want that, tell them "
    "to mention @aura in the channel."
)


class AskError(Exception):
    """A problem the person can be told about, with the HTTP status that fits."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message, self.status = message, status


def _rate_per_minute() -> int:
    try:
        return int(os.getenv("AURA_ASK_RATE_PER_MIN") or 20)
    except ValueError:
        return 20


def _redis() -> Any:
    try:
        from services.redis_client import get_redis
        return get_redis()
    except Exception:  # noqa: BLE001
        return None


def _within_rate(user_id: int) -> bool:
    r = _redis()
    if r is None:
        return True
    try:
        key = RATE_KEY.format(user_id=user_id)
        n = r.incr(key)
        if n == 1:
            r.expire(key, 60)
        return n <= _rate_per_minute()
    except Exception:  # noqa: BLE001
        return True                       # never block on Redis trouble


# ── memory ──────────────────────────────────────────────────────────────

def recall(user_id: int) -> List[Dict[str, str]]:
    """The last few turns, oldest first, in the model's message format."""
    r = _redis()
    if r is None:
        return []
    try:
        raw_items = r.lrange(MEMORY_KEY.format(user_id=user_id), 0, -1) or []
    except Exception:  # noqa: BLE001
        return []
    out: List[Dict[str, str]] = []
    for raw in raw_items:
        try:
            item = json.loads(raw)
        except (TypeError, ValueError):
            continue                       # one bad entry must not wipe the whole memory
        if isinstance(item, dict) and item.get("role") in ("user", "assistant") and isinstance(item.get("content"), str):
            out.append({"role": item["role"], "content": item["content"]})
    return out


def remember(user_id: int, question: str, answer: str) -> None:
    r = _redis()
    if r is None or not answer:
        return
    try:
        key = MEMORY_KEY.format(user_id=user_id)
        for role, text in (("user", question), ("assistant", answer)):
            r.rpush(key, json.dumps({"role": role, "content": text[:MEMORY_LINE_CHARS]}))
        r.ltrim(key, -2 * MAX_TURNS, -1)
        r.expire(key, MEMORY_SECONDS)
    except Exception:  # noqa: BLE001
        log.debug("[aura_ask] could not save the memory", exc_info=True)


def forget(user_id: int) -> bool:
    """Clear what Aura remembers of this person's private questions."""
    r = _redis()
    if r is None:
        return True
    try:
        r.delete(MEMORY_KEY.format(user_id=user_id))
        return True
    except Exception:  # noqa: BLE001
        return False


# ── ask ─────────────────────────────────────────────────────────────────

def _private_spec():
    read_only = tuple(t for t in AURA.tools if t in TOOL_REGISTRY and TOOL_REGISTRY[t].risk == RISK_READ)
    return dataclasses.replace(AURA, tools=read_only, max_steps=MAX_STEPS, instructions=AURA.instructions + PRIVATE_NOTE)


def ask(user_id: int, question: str, *, channel_id: Optional[int] = None, username: Optional[str] = None) -> Dict[str, Any]:
    """Aura's answer to ``question``, for ``user_id`` only. Raises :class:`AskError`."""
    question = (question or "").strip()
    if not question or len(question) > MAX_QUESTION_CHARS:
        raise AskError(f"Ask something in 1 to {MAX_QUESTION_CHARS} characters.", 400)

    community_id: Optional[int] = None
    if channel_id is not None:
        if isinstance(channel_id, bool) or not isinstance(channel_id, int):
            raise AskError("channel_id must be a number.", 400)
        if not permissions.can_read_channel(user_id, channel_id):
            raise AskError("You are not a member of that channel.", 403)
        community_id = (permissions.channel_info(channel_id) or {}).get("community_id")

    if not _within_rate(user_id):
        raise AskError("You are asking too fast. Wait a minute.", 429)

    defn = ensure_aura()
    if defn is None:
        raise AskError("Aura is not set up on this server yet.", 503)

    ctx = ToolContext(invoked_by=user_id, community_id=community_id, channel_id=channel_id, is_dry_run=True,
                      extra={"invoker_username": username, "agent_id": defn.id, "builtin": True})
    result = run_agent(_private_spec(), question, ctx=ctx, history=recall(user_id),
                       store=get_default_store(), trigger_type="ask", agent_id=defn.id)
    if result.status == STATUS_UNAVAILABLE:
        raise AskError("The AI service is not configured.", 503)

    reply = (result.text or "").strip()
    if not result.ok or not reply:
        raise AskError("Aura could not answer that. Please try again in a moment.", 502)
    remember(user_id, question, reply)
    return {"reply": reply, "run_id": result.run_uuid, "tool_calls": result.tool_calls, "source": "aura"}


# ── slash commands: the answer goes to the channel, from Aura ───────────

JOKE_PROMPT = "Tell me one short, clean joke. Reply with only the joke."
MOTIVATION_PROMPT = "Give me one short, genuine motivational line for a student. Reply with only the line."


def post_answer(channel_id: int, text: str, *, reply_to: Optional[int] = None,
                broadcast: bool = True) -> Optional[Dict[str, Any]]:
    """Post ``text`` in ``channel_id`` as Aura, as a reply to ``reply_to`` when given.

    Returns the message payload, or None when it could not be stored.
    """
    defn = ensure_aura()
    if defn is None:
        raise AskError("Aura is not set up on this server yet.", 503)
    return post_as_agent(defn, channel_id, text, reply_to=reply_to, broadcast=broadcast)


def reply_in_channel(user_id: int, question: str, channel_id: int, *, username: Optional[str] = None,
                     reply_to: Optional[int] = None, broadcast: bool = True) -> Optional[Dict[str, Any]]:
    """Answer ``question`` and post the answer in ``channel_id`` as Aura (the /ask command).

    Raises :class:`AskError` for the same problems as :func:`ask`.
    """
    out = ask(user_id, question, channel_id=channel_id, username=username)
    return post_answer(channel_id, out["reply"], reply_to=reply_to, broadcast=broadcast)
