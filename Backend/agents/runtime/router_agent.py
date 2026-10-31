"""
CustomAgentRouter
=================
The bridge between the event bus and the agent runtime. It is a normal
autonomous agent (registered in ``agents/orchestrator.py``) that subscribes to
``msg.created`` and ``user.joined_community`` and answers one question: *does
any agent want this event?*

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
* every agent has a ``daily_run_cap``.
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
from agents.runtime.triggers import TriggerMatch, match_member_joined, match_message
from database import get_db_connection

log = logging.getLogger(__name__)

CLAIM_TTL_SECONDS = 300
DIRECT_KINDS = ("mention", "reply")


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


class CustomAgentRouter(AutonomousAgent):
    NAME = "custom_router"
    GOAL = {"route_events_to_agents": True}
    SUBSCRIBES = [_bus.TOPIC_MSG_CREATED, _bus.TOPIC_USER_JOINED]
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
        else:
            return None

        if not matches or not channel_id:
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
            "matches": [{"agent_id": m.definition.id, "trigger_id": m.trigger.id, "kind": m.kind,
                         "cap": m.definition.daily_run_cap} for m in matches],
            "scope_type": _agent_memory.SCOPE_CHANNEL,
            "scope_id": channel_id,
        }

    # ── Think ────────────────────────────────────────────────────────
    def decide(self, obs: Dict[str, Any]) -> Tuple[str, Dict[str, Any], str]:
        r = _redis()
        key = obs.get("message_id") or f"join-{obs.get('user_id')}-{obs.get('community_id')}"
        kept: List[Dict[str, Any]] = []
        reasons: List[str] = []

        direct = [m for m in obs["matches"] if m["kind"] in DIRECT_KINDS]
        if direct and r is not None and not self._rate_ok(r, obs.get("user_id")):
            reasons.append("rate_limited")
            matches = [m for m in obs["matches"] if m["kind"] not in DIRECT_KINDS]
        else:
            matches = obs["matches"]

        for m in matches:
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
            run_agent_task.apply_async(
                kwargs={"agent_id": m["agent_id"],
                        "trigger": {**trigger, "type": m["kind"], "trigger_id": m["trigger_id"]}},
                queue=queue)
            queued += 1
        return {"enqueued": queued}
