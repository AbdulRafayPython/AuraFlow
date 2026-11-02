"""
Private replies
===============
How an agent says something to one person only: its bot user sends that person a direct
message. The message is kept (encrypted, like every DM), shows up in their DM list under the
agent's name, counts as unread and rings the notification bell. Nobody else sees it, and
nothing is posted in any channel. No email is sent: an agent writing to you is not worth one.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from agents.runtime.definitions import AgentDefinition
from agents.runtime.posting import _get_emitter, emit_to_user
from database import get_db_connection
from utils.encryption import encrypt

log = logging.getLogger(__name__)

MAX_PRIVATE_CHARS = 4000
PREVIEW_CHARS = 80


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
