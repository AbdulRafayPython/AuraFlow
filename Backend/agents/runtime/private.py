"""
Private replies
===============
How an agent says something to one person only: its bot user sends that person a direct
message. The message is kept (encrypted, like every DM), shows up in their DM list under the
agent's name, counts as unread and rings the notification bell. Nobody else sees it, and
nothing is posted in any channel. No email is sent: an agent writing to you is not worth one.

A *private run* is one whose answer goes this way: a trigger with ``delivery: "private"``, or a
person replying to the agent's DM. It only gets read tools and runs in test mode, so it can
look things up but never post, poll or remind in a channel.

Who may write to an agent: Aura, everyone; any other agent, its owner, or someone it has already
written to. Each message costs a model call, so the same per-person rate limit as a mention applies.
"""

from __future__ import annotations

import dataclasses
import logging
import os
import re
from typing import Any, Dict, List, Optional

from agents.runtime.definitions import DELIVERY_PRIVATE, AgentDefinition
from agents.runtime.posting import _get_emitter, emit_to_user
from database import get_db_connection
from utils.encryption import decrypt, encrypt

log = logging.getLogger(__name__)

MAX_PRIVATE_CHARS = 4000
PREVIEW_CHARS = 80
DM_HISTORY = 8                     # earlier DMs the agent sees when someone writes to it
DM_KIND = "dm"

PRIVATE_NOTE = (
    "\n- This conversation is private: your answer goes to the person as a direct message and "
    "nobody else sees it. You cannot post in a channel, start a poll or set a reminder from here; "
    "if they want that, tell them to mention you in the channel."
)


# "@aura dm me the summary", "@aura tell me privately": the person asks for the answer in a DM.
_DM_ME = re.compile(r"\b(?:dm|message|text) me\b|\bprivately\b|\bin (?:a |my )?dms?\b", re.I)


def wants_dm(text: Optional[str]) -> bool:
    return bool(_DM_ME.search(text or ""))


def is_private(trigger: Dict[str, Any]) -> bool:
    return trigger.get("type") == DM_KIND or trigger.get("delivery") == DELIVERY_PRIVATE


def recipient(defn: AgentDefinition, trigger: Dict[str, Any]) -> Optional[int]:
    """Who a private answer goes to: the person the run is for, else the agent's owner."""
    return trigger.get("user_id") or defn.owner_user_id


def private_spec(spec: Any) -> Any:
    """The same agent with only its read tools, told that its answer is a DM."""
    from agents.runtime.tools import RISK_READ, TOOL_REGISTRY
    read_only = tuple(t for t in spec.tools if t in TOOL_REGISTRY and TOOL_REGISTRY[t].risk == RISK_READ)
    return dataclasses.replace(spec, tools=read_only, instructions=(spec.instructions or "") + PRIVATE_NOTE)


def _dm_room(a: int, b: int) -> str:
    return f"dm_{min(a, b)}_{max(a, b)}"


def deliver_privately(defn: AgentDefinition, user_id: int, content: str, *,
                      run_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
    """Send ``content`` from the agent to ``user_id`` as a direct message.

    Returns the message as the client receives it, or None when it could not be stored.
    Never posts anywhere else.
    """
    text = (content or "").strip()[:MAX_PRIVATE_CHARS]
    if not text or not user_id or not defn or not defn.bot_user_id:
        return None
    if int(user_id) == int(defn.bot_user_id):
        return None                                   # an agent never writes to itself

    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id, username FROM users WHERE id = %s", (user_id,))
            receiver = cur.fetchone()
            if not receiver:
                return None
            cur.execute("SELECT public_id FROM users WHERE id = %s", (defn.bot_user_id,))
            bot_public_id = (cur.fetchone() or {}).get("public_id")
            cur.execute(
                "INSERT INTO direct_messages (sender_id, receiver_id, content, message_type) "
                "VALUES (%s, %s, %s, 'ai')",
                (defn.bot_user_id, user_id, encrypt(text)))
            message_id = cur.lastrowid
            cur.execute("SELECT created_at FROM direct_messages WHERE id = %s", (message_id,))
            created = (cur.fetchone() or {}).get("created_at")
        conn.commit()
    except Exception as exc:  # noqa: BLE001
        log.error("[RUNTIME] deliver_privately failed: %s", exc)
        if conn:
            conn.rollback()
        return None
    finally:
        if conn:
            conn.close()

    payload: Dict[str, Any] = {
        "id": message_id,
        "sender_id": defn.bot_user_id,
        "receiver_id": int(user_id),
        "content": text,
        "message_type": "ai",
        "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created),
        "is_read": False,
        "edited_at": None,
        "sender": {"id": defn.bot_user_id, "public_id": bot_public_id, "username": defn.bot_username, "display_name": defn.name,
                   "avatar_url": defn.avatar_url, "is_bot": True},
        "agent_run_id": run_id,
    }
    _announce(defn, int(user_id), payload, text, bot_public_id)
    return payload


def _announce(defn: AgentDefinition, user_id: int, payload: Dict[str, Any], text: str,
              bot_public_id: Optional[str]) -> None:
    """Live delivery (open DM view and every tab), unread count, and the bell. Best effort."""
    try:
        _get_emitter().emit("receive_direct_message", payload, room=_dm_room(defn.bot_user_id, user_id), namespace="/")
    except Exception as exc:  # noqa: BLE001
        log.debug("[RUNTIME] private DM room emit failed: %s", exc)
    emit_to_user(user_id, "receive_direct_message", payload)
    try:
        from services.unread_tracker import increment_dm_unread
        increment_dm_unread(user_id, defn.bot_user_id)
    except Exception as exc:  # noqa: BLE001
        log.debug("[RUNTIME] private DM unread count failed: %s", exc)
    try:
        from services.notification_service import create_notification
        create_notification(
            user_id=user_id, type="message", title=f"Message from {defn.name}",
            body=text[:PREVIEW_CHARS], icon_url=defn.avatar_url,
            link=f"/dm/{bot_public_id or defn.bot_user_id}", related_id=payload["id"])
    except Exception as exc:  # noqa: BLE001
        log.debug("[RUNTIME] private DM notification failed: %s", exc)


# ── the old Wellness agent's twin ───────────────────────────────────────

def has_mood_twin(user_id: int) -> bool:
    """The person has their own agent on with a "when my mood dips" trigger. While it is on, the
    old Wellness agent stops sending its own mood check-ins, so they never get two."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM agent_definitions d JOIN agent_triggers t ON t.agent_id = d.id "
                "WHERE d.owner_user_id = %s AND d.community_id IS NULL AND d.status = 'active' "
                "AND t.type = 'mood_escalation' AND t.enabled = 1 LIMIT 1", (user_id,))
            return cur.fetchone() is not None
    except Exception as exc:  # noqa: BLE001
        log.debug("[RUNTIME] has_mood_twin failed: %s", exc)
        return False
    finally:
        if conn:
            conn.close()


# ── someone writes to the agent ─────────────────────────────────────────

def dm_history(bot_user_id: int, user_id: int, *, before_id: Optional[int] = None,
               limit: int = DM_HISTORY) -> List[Dict[str, Any]]:
    """The last DMs between the agent and this person (before ``before_id``), oldest first."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, sender_id, content FROM direct_messages "
                "WHERE ((sender_id = %s AND receiver_id = %s) OR (sender_id = %s AND receiver_id = %s)) "
                "AND id < %s ORDER BY id DESC LIMIT %s",
                (bot_user_id, user_id, user_id, bot_user_id, before_id or 2 ** 62, limit))
            rows = list(cur.fetchall() or [])
    except Exception as exc:  # noqa: BLE001
        log.debug("[RUNTIME] dm_history failed: %s", exc)
        return []
    finally:
        if conn:
            conn.close()
    out: List[Dict[str, Any]] = []
    for row in reversed(rows):
        try:
            text = decrypt(row["content"] or "")
        except Exception:  # noqa: BLE001
            continue
        out.append({"role": "assistant" if row["sender_id"] == bot_user_id else "user", "content": text})
    return out


def _has_written_to(bot_user_id: int, user_id: int) -> bool:
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM direct_messages WHERE sender_id = %s AND receiver_id = %s LIMIT 1",
                        (bot_user_id, user_id))
            return cur.fetchone() is not None
    except Exception as exc:  # noqa: BLE001
        log.debug("[RUNTIME] has_written_to failed: %s", exc)
        return False
    finally:
        if conn:
            conn.close()


def may_write_to(defn: AgentDefinition, user_id: int) -> bool:
    if defn.is_builtin or user_id == defn.owner_user_id:
        return True
    return _has_written_to(defn.bot_user_id, user_id)


def _rate_ok(user_id: int) -> bool:
    try:
        limit = int(os.getenv("AGENT_USER_RATE_PER_MIN") or 8)
    except ValueError:
        limit = 8
    try:
        from services.redis_client import get_redis
        r = get_redis()
        if r is None:
            return True
        key = f"agent_router:rate:{user_id}"
        n = r.incr(key)
        if n == 1:
            r.expire(key, 60)
        return n <= limit
    except Exception:  # noqa: BLE001
        return True                                   # never block on Redis trouble, like the router


def agent_for_bot_user(bot_user_id: int) -> Optional[AgentDefinition]:
    from agents.runtime.definitions import load_active_definitions
    try:
        return next((d for d in load_active_definitions() if d.bot_user_id == bot_user_id), None)
    except Exception as exc:  # noqa: BLE001
        log.debug("[RUNTIME] agent lookup failed: %s", exc)
        return None


def on_direct_message(sender_id: int, receiver_id: int, message_id: int, content: str,
                      *, username: Optional[str] = None) -> Optional[str]:
    """A person wrote ``content`` to ``receiver_id``. If that is an agent, queue its private answer.

    Returns why nothing was queued (``None`` when a run was queued, or the receiver is not an agent).
    """
    text = (content or "").strip()
    if not text or not sender_id or sender_id == receiver_id:
        return "empty"
    defn = agent_for_bot_user(receiver_id)
    if defn is None:
        return "not_an_agent"
    if not may_write_to(defn, sender_id):
        return "not_allowed"
    if not _rate_ok(sender_id):
        return "rate_limited"
    from agents.runtime.router_agent import _runs_today
    if _runs_today(defn.id) >= defn.daily_run_cap:
        return "daily_cap"
    from tasks.agent_runtime_tasks import run_agent_task
    run_agent_task.apply_async(kwargs={"agent_id": defn.id, "trigger": {
        "type": DM_KIND, "user_id": sender_id, "username": username, "message_id": message_id,
        "content": text[:MAX_PRIVATE_CHARS], "delivery": DELIVERY_PRIVATE,
        "channel_id": None, "community_id": defn.community_id}}, queue="high_priority")
    return None
