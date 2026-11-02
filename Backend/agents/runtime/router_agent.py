"""
CustomAgentRouter
=================
The bridge between the event bus and the agent runtime. It is a normal
autonomous agent (registered in ``agents/orchestrator.py``) that subscribes to
``msg.created``, ``user.joined_community``, ``channel.silent``, ``focus.drift`` and
``mood.escalation``
and answers one question: *does any agent want this event?*

It never calls an LLM. ``sense`` matches triggers (pure, cheap), ``decide``
applies de-duplication and cost guards, and ``act`` only enqueues a Celery task
(``tasks.agent_runtime_tasks.run_agent_task``), so a slow agent cannot hold up
the orchestrator loop that every other agent shares.

Guards:

* an agent's own (or any bot's) message never triggers an agent, so two agents
  cannot talk to each other forever;
* each (message, agent) pair is claimed once in Redis, so two orchestrators
  never double-dispatch;
* direct invocations (mention / reply) are rate limited per user;
* every agent has a ``daily_run_cap``;
* channel events (silent channel, topic drift) wake an agent at most once per
  ``EVENT_COOLDOWN_SECONDS`` per channel, and not at all when Redis is down
  (without it the limit cannot be kept);
* a mood dip wakes only the person's own personal agents, only while they track their
  mood (Mood Tracker on), always answers by DM, and at most once per
  ``MOOD_COOLDOWN_SECONDS`` per agent (again not at all without Redis).
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional, Tuple

from agents import event_bus as _bus
from agents import memory as _agent_memory
from agents.base import AutonomousAgent
from agents.runtime.definitions import (
    AgentDefinition, ensure_builtin_agents_once, load_active_definitions)
from agents.runtime.definitions import DELIVERY_PRIVATE
from agents.runtime.private import wants_dm
from agents.runtime.triggers import (
    TriggerMatch, match_channel_event, match_member_joined, match_message, match_mood_escalation)
from database import get_db_connection

log = logging.getLogger(__name__)

CLAIM_TTL_SECONDS = 300
DIRECT_KINDS = ("mention", "reply")
EVENT_COOLDOWN_SECONDS = 30 * 60
# Channel-level events: bus topic -> trigger type. Nobody spoke to the agent, so these runs act for its owner.
CHANNEL_EVENT_KINDS = {_bus.TOPIC_CHANNEL_SILENT: "channel_silent", _bus.TOPIC_FOCUS_DRIFT: "focus_drift"}
MAX_TOPICS = 5
MOOD_KIND = "mood_escalation"
MOOD_COOLDOWN_SECONDS = 6 * 60 * 60


def _user_rate_limit() -> int:
    try:
        return int(os.getenv("AGENT_USER_RATE_PER_MIN") or 8)
    except ValueError:
        return 8


def _redis() -> Any:
    try:
        from services.redis_client import get_redis
        return get_redis()
    except Exception:  # noqa: BLE001
        return None


def _runs_today(agent_id: int) -> int:
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS n FROM agent_runs WHERE agent_id = %s "
                        "AND started_at >= CURDATE()", (agent_id,))
            return int((cur.fetchone() or {}).get("n") or 0)
    except Exception as exc:  # noqa: BLE001
        log.debug("[router] runs_today failed: %s", exc)
        return 0
    finally:
        if conn:
            conn.close()


def _reply_parent_sender(message_id: int) -> Optional[int]:
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT sender_id FROM messages WHERE id = %s", (message_id,))
            row = cur.fetchone()
            return row["sender_id"] if row else None
    except Exception as exc:  # noqa: BLE001
        log.debug("[router] reply parent lookup failed: %s", exc)
        return None
    finally:
        if conn:
            conn.close()


def _delivery(match: TriggerMatch, content: Optional[str]) -> Optional[str]:
    """The trigger's own setting, or a DM when someone talking to the agent asks for one."""
    configured = (match.trigger.config or {}).get("delivery")
    if configured is None and match.kind in DIRECT_KINDS and wants_dm(content):
        return DELIVERY_PRIVATE
    return configured


def _tracks_mood(user_id: int) -> bool:
    """The person has Mood Tracker on. Fails closed: no answer means no."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM user_agents WHERE user_id = %s AND agent_type = 'mood' "
                        "AND enabled = TRUE", (user_id,))
            return cur.fetchone() is not None
    except Exception as exc:  # noqa: BLE001
        log.debug("[router] mood opt-in lookup failed: %s", exc)
        return False
    finally:
        if conn:
            conn.close()


def _topics(value: Any) -> List[str]:
    """A short, plain list of topic words from an event (they come from chat, so keep them small)."""
    if not isinstance(value, (list, tuple)):
        return []
    return [str(v).strip()[:30] for v in value if str(v).strip()][:MAX_TOPICS]


class CustomAgentRouter(AutonomousAgent):
    NAME = "custom_router"
    GOAL = {"route_events_to_agents": True}
    SUBSCRIBES = [_bus.TOPIC_MSG_CREATED, _bus.TOPIC_USER_JOINED, _bus.TOPIC_CHANNEL_SILENT, _bus.TOPIC_FOCUS_DRIFT,
                  _bus.TOPIC_MOOD_ESCALATION]
    COOLDOWN_SECONDS = 0                      # one user may mention an agent repeatedly
    SCOPE_TYPE = _agent_memory.SCOPE_CHANNEL

    # ── Sense ────────────────────────────────────────────────────────
    def sense(self, event: dict) -> Optional[Dict[str, Any]]:
        ensure_builtin_agents_once()
        defs = load_active_definitions()
        if not defs:
            return None

        topic = event.get("topic")
        if topic == _bus.TOPIC_USER_JOINED:
            matches = match_member_joined(event, defs)
            channel_id = event.get("first_channel_id")
            message_id = None
        elif topic == _bus.TOPIC_MSG_CREATED:
            if not (event.get("content") or "").strip() or not event.get("channel_id"):
                return None
            if event.get("user_id") in {d.bot_user_id for d in defs}:
                return None                    # an agent's own message never triggers agents
            parent_bot = None
            if event.get("reply_to"):
                sender = _reply_parent_sender(int(event["reply_to"]))
                if sender in {d.bot_user_id for d in defs}:
                    parent_bot = sender
            matches = match_message(event, defs, reply_parent_bot_id=parent_bot)
            channel_id = event.get("channel_id")
            message_id = event.get("message_id")
        elif topic in CHANNEL_EVENT_KINDS:
            if event.get("user_id") in {d.bot_user_id for d in defs}:
                return None                    # a drift caused by an agent's own post never wakes agents
            matches = match_channel_event(CHANNEL_EVENT_KINDS[topic], event, defs)
            channel_id = event.get("channel_id")
            message_id = None
        elif topic == _bus.TOPIC_MOOD_ESCALATION:
            matches = match_mood_escalation(event, defs)
            if matches and not _tracks_mood(int(event["user_id"])):
                return None                    # stopped tracking their mood: nothing reads it
            channel_id = event.get("channel_id")
            message_id = None                  # the message already had its own run; keep the claims apart
        else:
            return None

        if not matches or (not channel_id and topic != _bus.TOPIC_MOOD_ESCALATION):
            return None
        return {
            "topic": topic,
            "user_id": event.get("user_id"),
            "username": event.get("username"),
            "channel_id": channel_id,
            "community_id": event.get("community_id"),
            "message_id": message_id,
            "content": event.get("content"),
            "reply_to": event.get("reply_to"),
            "silent_minutes": event.get("silent_minutes"),
            "old_topics": _topics(event.get("old_topics")),
            "new_topics": _topics(event.get("new_topics")),
            "primary_mood": str(event.get("primary_mood") or "")[:30] or None,
            "event_key": f"{topic}-{channel_id}-{event.get('bucket') or event.get('message_id') or ''}",
            "matches": [{"agent_id": m.definition.id, "trigger_id": m.trigger.id, "kind": m.kind,
                         "cap": m.definition.daily_run_cap, "owner_user_id": m.definition.owner_user_id,
                         "delivery": _delivery(m, event.get("content"))}
                        for m in matches],
            "scope_type": _agent_memory.SCOPE_CHANNEL,
            "scope_id": channel_id,
        }

    # ── Think ────────────────────────────────────────────────────────
    def decide(self, obs: Dict[str, Any]) -> Tuple[str, Dict[str, Any], str]:
        r = _redis()
        key = obs.get("message_id") or obs.get("event_key") or f"join-{obs.get('user_id')}-{obs.get('community_id')}"
        kept: List[Dict[str, Any]] = []
        reasons: List[str] = []

        direct = [m for m in obs["matches"] if m["kind"] in DIRECT_KINDS]
        if direct and r is not None and not self._rate_ok(r, obs.get("user_id")):
            reasons.append("rate_limited")
            matches = [m for m in obs["matches"] if m["kind"] not in DIRECT_KINDS]
        else:
            matches = obs["matches"]

        for m in matches:
            if m["kind"] in CHANNEL_EVENT_KINDS.values():
                if r is None:
                    reasons.append("no_redis")
                    continue
                if not r.set(f"agent_router:evt:{m['kind']}:{m['agent_id']}:{obs.get('channel_id')}", "1",
                             nx=True, ex=EVENT_COOLDOWN_SECONDS):
                    reasons.append("cooldown")
                    continue
            if m["kind"] == MOOD_KIND:
                if r is None:
                    reasons.append("no_redis")
                    continue
                if not r.set(f"agent_router:mood:{m['agent_id']}:{obs.get('user_id')}", "1",
                             nx=True, ex=MOOD_COOLDOWN_SECONDS):
                    reasons.append("cooldown")
                    continue
            if r is not None and not r.set(f"agent_router:claim:{key}:{m['agent_id']}", "1",
                                           nx=True, ex=CLAIM_TTL_SECONDS):
                reasons.append("duplicate")
                continue
            if _runs_today(m["agent_id"]) >= m["cap"]:
                reasons.append("daily_cap")
                continue
            kept.append(m)

        if not kept:
            return ("skip", obs, ",".join(sorted(set(reasons))) or "no_match")
        ids = "-".join(str(m["agent_id"]) for m in kept)
        payload = {**obs, "matches": kept, "correlation_id": f"router-{key}-{ids}"}
        return ("act", payload, "route:" + ",".join(m["kind"] for m in kept))

    @staticmethod
    def _rate_ok(r: Any, user_id: Optional[int]) -> bool:
        if not user_id:
            return True
        try:
            k = f"agent_router:rate:{user_id}"
            n = r.incr(k)
            if n == 1:
                r.expire(k, 60)
            return n <= _user_rate_limit()
        except Exception:  # noqa: BLE001
            return True                          # never block on Redis trouble

    # ── Act ──────────────────────────────────────────────────────────
    def act(self, payload: Dict[str, Any], correlation_id: str) -> Optional[Dict[str, Any]]:
        from tasks.agent_runtime_tasks import run_agent_task
        trigger = {k: payload.get(k) for k in
                   ("user_id", "username", "channel_id", "community_id", "message_id",
                    "content", "reply_to")}
        queued = 0
        for m in payload["matches"]:
            queue = "high_priority" if m["kind"] in DIRECT_KINDS else "default"
            run_trigger = {**trigger, "type": m["kind"], "trigger_id": m["trigger_id"], "delivery": m.get("delivery")}
            if m["kind"] in CHANNEL_EVENT_KINDS.values():
                run_trigger.update(user_id=m.get("owner_user_id"), username=None, content=None, reply_to=None,
                                   silent_minutes=payload.get("silent_minutes"),
                                   old_topics=payload.get("old_topics"), new_topics=payload.get("new_topics"))
            elif m["kind"] == MOOD_KIND:
                run_trigger.update(user_id=m.get("owner_user_id"), username=None, content=None, reply_to=None,
                                   message_id=None, delivery=DELIVERY_PRIVATE,
                                   primary_mood=payload.get("primary_mood"))
            run_agent_task.apply_async(kwargs={"agent_id": m["agent_id"], "trigger": run_trigger}, queue=queue)
            queued += 1
        return {"enqueued": queued}
