"""
AuraFlow Autonomous-Agent Event Bus
====================================
Thin wrapper over the existing Redis client (services.redis_client) that
exposes a publish/subscribe interface for the autonomous agent
orchestration described in docs/AUTONOMOUS_AGENTS_PLAN.md (§3.4).

Design notes
------------
- All payloads are JSON-serialised. The bus is intentionally schema-less:
  each `topic` defines its own payload shape (see the table in the plan).
- Publishers are *non-blocking*: a missing Redis or a serialisation error
  must never break the request that produced the event. Every publish is
  wrapped in a try/except that logs at debug level and returns False.
- Subscribers are pull-based via the orchestrator. Each registered topic
  becomes a Redis pub/sub channel under the `auraflow:agent_bus:` prefix.
- The publish_action helper mirrors a logged agent_actions row out to
  Socket.IO so the frontend AgentActivityTimeline can render decisions in
  real time without a polling endpoint.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Callable, Iterable

from services.redis_client import get_redis

log = logging.getLogger(__name__)

# Redis pub/sub channel namespace. Keep distinct from cache keys.
CHANNEL_PREFIX = "auraflow:agent_bus:"

# Canonical topic names — keep in sync with §3.4 of the plan.
TOPIC_MSG_CREATED          = "msg.created"
TOPIC_MSG_REACTED          = "msg.reacted"
TOPIC_USER_JOINED          = "user.joined_community"
TOPIC_USER_IDLE            = "user.idle"
TOPIC_CHANNEL_SILENT       = "channel.silent"
TOPIC_MOOD_DETECTED        = "mood.detected"
TOPIC_MOOD_ESCALATION      = "mood.escalation"
TOPIC_TICK_MINUTE          = "tick.minute"
TOPIC_FEEDBACK_RECEIVED    = "feedback.received"
TOPIC_FOCUS_DRIFT          = "focus.drift"
TOPIC_MOD_VIOLATION        = "mod.violation"
TOPIC_KB_CREATED           = "kb.created"
TOPIC_LANG_DETECTED        = "lang.detected"

ALL_TOPICS = (
    TOPIC_MSG_CREATED, TOPIC_MSG_REACTED, TOPIC_USER_JOINED, TOPIC_USER_IDLE,
    TOPIC_CHANNEL_SILENT, TOPIC_MOOD_DETECTED, TOPIC_MOOD_ESCALATION,
    TOPIC_TICK_MINUTE, TOPIC_FEEDBACK_RECEIVED, TOPIC_FOCUS_DRIFT,
    TOPIC_MOD_VIOLATION, TOPIC_KB_CREATED, TOPIC_LANG_DETECTED,
)


def _channel_for(topic: str) -> str:
    return f"{CHANNEL_PREFIX}{topic}"


# ── Publish ──────────────────────────────────────────────────────────

def publish(topic: str, payload: dict) -> bool:
    """Fire-and-forget publish to the agent bus.

    Returns True if Redis accepted the message, False otherwise. Never
    raises — callers are expected to use this from hot request paths.
    """
    r = get_redis()
    if r is None:
        return False
    try:
        # Stamp the event with a server-side timestamp so subscribers
        # don't have to trust client clocks.
        body = dict(payload)
        body.setdefault("topic", topic)
        body.setdefault("ts", time.time())
        r.publish(_channel_for(topic), json.dumps(body, default=str))
        return True
    except Exception as exc:
        log.debug(f"[event_bus] publish({topic}) failed: {exc}")
        return False


# ── Subscribe ────────────────────────────────────────────────────────

def subscribe(topics: Iterable[str], handler: Callable[[str, dict], None],
              *, poll_timeout: float = 1.0):
    """Blocking subscribe loop — intended for the orchestrator worker.

    `handler(topic, payload)` is invoked for each message. Exceptions in
    the handler are caught and logged so one bad event does not break
    the bus loop. The caller is responsible for running this on a thread
    or a long-lived Celery task.
    """
    r = get_redis()
    if r is None:
        log.warning("[event_bus] subscribe: Redis unavailable, loop will exit.")
        return

    pubsub = r.pubsub(ignore_subscribe_messages=True)
    channels = [_channel_for(t) for t in topics]
    pubsub.subscribe(*channels)
    log.info(f"[event_bus] subscribed to {len(channels)} channel(s): {topics}")

    try:
        while True:
            msg = pubsub.get_message(timeout=poll_timeout)
            if not msg:
                continue
            if msg.get("type") != "message":
                continue
            try:
                data = msg.get("data")
                if isinstance(data, (bytes, bytearray)):
                    data = data.decode("utf-8", errors="replace")
                payload = json.loads(data) if isinstance(data, str) else data
                # Recover topic from channel name (strip prefix).
                ch = msg.get("channel") or ""
                if isinstance(ch, (bytes, bytearray)):
                    ch = ch.decode("utf-8", errors="replace")
                topic = ch[len(CHANNEL_PREFIX):] if ch.startswith(CHANNEL_PREFIX) else ch
                handler(topic, payload or {})
            except Exception as exc:
                log.exception(f"[event_bus] handler error: {exc}")
    finally:
        try:
            pubsub.close()
        except Exception:
            pass


# ── Socket-bridge: surface agent_action to the frontend timeline ────

def publish_action_to_frontend(action_row: dict) -> None:
    """Emit the `agent_action` Socket.IO event so the frontend can render
    the AgentActivityTimeline live.

    Imported lazily so this module does not pull in flask_socketio at
    Celery-worker import time. Best-effort — silently no-ops if the
    socketio object is not configured (e.g. in unit tests).
    """
    try:
        # Re-use the existing socketio singleton wired up in app.py.
        from app import socketio  # type: ignore
    except Exception:
        return
    try:
        community_id = action_row.get("community_id")
        room = f"community_{community_id}" if community_id else None
        # Strip large blobs before broadcasting.
        slim = {
            "id":           action_row.get("id"),
            "agent_name":   action_row.get("agent_name"),
            "community_id": community_id,
            "channel_id":   action_row.get("channel_id"),
            "user_id":      action_row.get("user_id"),
            "decision":     action_row.get("decision"),
            "reason":       action_row.get("reason"),
            "correlation_id": action_row.get("correlation_id"),
            "created_at":   str(action_row.get("created_at")),
        }
        if room:
            socketio.emit("agent_action", slim, room=room, namespace="/")
        else:
            socketio.emit("agent_action", slim, namespace="/")
    except Exception as exc:
        log.debug(f"[event_bus] publish_action_to_frontend failed: {exc}")
