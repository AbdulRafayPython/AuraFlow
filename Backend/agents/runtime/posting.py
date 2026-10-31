"""
Posting as an agent
===================
One place that writes an agent's message and broadcasts it, so every agent
(built-in or user-created) posts the same way: a ``messages`` row sent by the
agent's bot user, ``message_type = 'ai'``, linked to the run that produced it,
optionally as a reply to the message that triggered it.

Also emits the ``agent_run_started`` / ``agent_run_finished`` socket events
the UI uses for its "<agent> is thinking…" indicator.

Works from a Celery worker: events go out through a Redis-backed
``SocketIO`` (same approach as ``tasks/agent_tasks.py``).
"""

from __future__ import annotations

import json
import logging
import os
import threading
from typing import Any, Dict, Optional

from agents.runtime.definitions import AgentDefinition
from database import get_db_connection
from utils.encryption import decrypt

log = logging.getLogger(__name__)

MAX_REPLY_CHARS = 8000

_emitter: Any = None
_emitter_lock = threading.Lock()


def _get_emitter() -> Any:
    global _emitter
    if _emitter is None:
        with _emitter_lock:
            if _emitter is None:
                from flask_socketio import SocketIO
                _emitter = SocketIO(message_queue=os.getenv("REDIS_URL", "redis://localhost:6379/0"))
    return _emitter


def emit_to_channel(channel_id: int, event: str, payload: Dict[str, Any]) -> bool:
    """Broadcast ``event`` to everyone viewing the channel. Never raises."""
    try:
        _get_emitter().emit(event, payload, room=f"channel_{channel_id}", namespace="/")
        return True
    except Exception as exc:  # noqa: BLE001
        log.warning("[RUNTIME] emit %s failed: %s", event, exc)
        return False


def emit_to_user(user_id: int, event: str, payload: Dict[str, Any]) -> bool:
    """Send ``event`` to every open tab of one user. Never raises."""
    try:
        _get_emitter().emit(event, payload, room=f"user_{user_id}", namespace="/")
        return True
    except Exception as exc:  # noqa: BLE001
        log.warning("[RUNTIME] emit %s to user failed: %s", event, exc)
        return False


def agent_summary(defn: AgentDefinition) -> Dict[str, Any]:
    return {"id": defn.public_id, "name": defn.name, "username": defn.bot_username,
            "avatar": defn.avatar_url}


def emit_run_event(defn: AgentDefinition, channel_id: int, event: str, **data: Any) -> None:
    emit_to_channel(channel_id, event, {"agent": agent_summary(defn),
                                        "channel_id": channel_id, **data})


def _reply_preview(cur: Any, reply_to: int) -> Optional[Dict[str, Any]]:
    cur.execute(
        "SELECT m.content, m.message_type, u.username, u.display_name FROM messages m "
        "JOIN users u ON u.id = m.sender_id WHERE m.id = %s", (reply_to,))
    parent = cur.fetchone()
    if not parent:
        return None
    return {"id": reply_to, "content": decrypt(parent["content"] or "")[:150],
            "author": parent["username"], "message_type": parent["message_type"]}


def post_as_agent(defn: AgentDefinition, channel_id: int, content: str, *,
                  reply_to: Optional[int] = None,
                  run_id: Optional[int] = None,
                  card: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """Insert and broadcast the agent's message. Returns the payload, or None on failure.

    ``card`` (``{'kind': 'poll', ...}``) is stored in ``engagement_cards`` so the
    client renders an interactive card; ``content`` stays as the readable fallback."""
    text = (content or "").strip()[:MAX_REPLY_CHARS]
    if not text or not channel_id:
        return None

    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cols = ["channel_id", "sender_id", "content", "message_type", "bot_name", "reply_to"]
            vals = [channel_id, defn.bot_user_id, text, "ai", defn.name, reply_to]
            if run_id is not None:
                cols.append("agent_run_id")
                vals.append(run_id)
            cur.execute(
                f"INSERT INTO messages ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(vals))})",
                tuple(vals))
            message_id = cur.lastrowid
            if card:
                cur.execute(
                    "INSERT INTO engagement_cards (message_id, channel_id, kind, payload) "
                    "VALUES (%s, %s, %s, %s)",
                    (message_id, channel_id, card["kind"],
                     json.dumps({k: v for k, v in card.items() if k != "kind"}, ensure_ascii=False)))
            cur.execute("SELECT created_at FROM messages WHERE id = %s", (message_id,))
            created = (cur.fetchone() or {}).get("created_at")
            preview = _reply_preview(cur, reply_to) if reply_to else None
        conn.commit()
    except Exception as exc:  # noqa: BLE001
        log.error("[RUNTIME] post_as_agent failed: %s", exc)
        if conn:
            conn.rollback()
        return None
    finally:
        if conn:
            conn.close()

    payload: Dict[str, Any] = {
        "id": message_id,
        "channel_id": channel_id,
        "sender_id": defn.bot_user_id,
        "content": text,
        "message_type": "ai",
        "reply_to": reply_to,
        "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created),
        "author": defn.name,
        "avatar": defn.avatar_url,
        "is_blocked": False,
        "moderation": None,
        "agent": agent_summary(defn),
        "agent_run_id": run_id,
    }
    if preview:
        payload["reply_to_preview"] = preview
    if card:
        payload["card"] = card
    emit_to_channel(channel_id, "message_received", payload)
    return payload
