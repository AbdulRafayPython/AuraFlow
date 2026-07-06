"""
AuraFlow AutonomousAgent — the Sense → Think → Act → Learn ABC
==============================================================
Every agent that wants to be driven by the orchestrator subclasses this
class. Existing on-demand agents (translator, assistant, summarizer, …)
can keep their public methods alongside; the autonomous wiring is
additive.

Lifecycle (`handle(event)`):

    sense(event)  -> observation | None       # cheap, no Gemini
        ↓
    decide(obs)   -> (action, payload, reason)
        ↓
    log_action(...) — every cycle is logged whether we act, skip, or defer
        ↓
    if action == "act":  act(payload, correlation_id)
        ↓ (asynchronously, via /api/agents/<n>/feedback)
    learn(action_id, signal)                  # adjusts thresholds in agent_state

Subclasses MUST implement sense / decide / act and SHOULD override learn
to do something agent-specific (the default just records the signal).
"""

from __future__ import annotations

import logging
import time
import uuid
from abc import ABC, abstractmethod
from typing import Any, Literal, Optional, Tuple

from agents import memory as agent_memory

log = logging.getLogger(__name__)

Decision = Literal["act", "skip", "defer"]


class AutonomousAgent(ABC):
    # ── Identity / contract ──────────────────────────────────────────
    NAME: str = "abstract"
    GOAL: dict = {}                       # human-readable goal contract
    SUBSCRIBES: list[str] = []            # event_bus topics
    COOLDOWN_SECONDS: int = 300           # min gap between same-scope acts
    SCOPE_TYPE: str = agent_memory.SCOPE_CHANNEL  # default scope for state

    # ── Sense ────────────────────────────────────────────────────────
    @abstractmethod
    def sense(self, event: dict) -> Optional[dict]:
        """Pre-filter an incoming event into a cheap observation, or
        return None to drop the event. Must NOT call Gemini or any
        other paid LLM here — this runs on every event."""

    # ── Think ────────────────────────────────────────────────────────
    @abstractmethod
    def decide(self, observation: dict) -> Tuple[Decision, dict, str]:
        """Choose between 'act' / 'skip' / 'defer'. Return the payload
        for act() and a short human-readable reason (≤ 255 chars)."""

    # ── Act ──────────────────────────────────────────────────────────
    @abstractmethod
    def act(self, payload: dict, correlation_id: str) -> Optional[dict]:
        """Perform the side effect. Should be idempotent w.r.t. the
        correlation_id — if a sibling worker already acted on the same
        decision, no-op gracefully."""

    # ── Clamps (Phase 5.2) ───────────────────────────────────────────
    def _apply_clamps(self, thresholds: dict,
                      community_id: Optional[int] = None) -> dict:
        """Coerce learn()-mutated thresholds back into the admin window.

        Reads the per-community ``_clamps`` sub-dict (set via the Agent
        Goals admin panel) plus the absolute catalog min/max from
        ``agents/tunables.py``. Returns a new dict — never mutates the
        input. Falls back to identity if anything goes wrong (we'd
        rather drift than crash a learning step).
        """
        try:
            from agents.tunables import apply_clamps
        except Exception:
            return dict(thresholds or {})
        clamps: dict = {}
        if community_id is not None:
            try:
                state = agent_memory.get_state(
                    self.NAME, agent_memory.SCOPE_COMMUNITY, community_id)
                if state:
                    raw = (state.get("thresholds") or {}).get("_clamps")
                    if isinstance(raw, dict):
                        clamps = raw
            except Exception:
                clamps = {}
        try:
            return apply_clamps(self.NAME, thresholds, clamps)
        except Exception:
            return dict(thresholds or {})

    def _is_enabled(self, community_id: Optional[int]) -> bool:
        """Kill-switch check used by sense() — returns False when an admin
        has disabled this agent for a given community. Default True so
        agents without a row keep running."""
        if community_id is None:
            return True
        try:
            state = agent_memory.get_state(
                self.NAME, agent_memory.SCOPE_COMMUNITY, community_id)
            if not state:
                return True
            gv = state.get("goal_value") or {}
            return bool(gv.get("enabled", True))
        except Exception:
            return True

    def _is_enabled_for_channel(
        self,
        community_id: Optional[int],
        channel_id: Optional[int],
    ) -> bool:
        """Per-channel override on top of _is_enabled(community_id).

        Order of resolution:
          1. If either id is None → defer to _is_enabled(community_id).
          2. Look up community_channel_agents for (community, channel, NAME).
             Row present → its enabled flag wins.
          3. Row absent → fall through to community-level _is_enabled.

        Backed by the table created in
        Backend/migrations/add_community_channel_agents.sql. Wired into
        CoverageMatrix in Frontend/src/components/ai-agents/CommunityAgentsTab.tsx.
        Always safe to call: any DB failure falls through to community-level."""
        if community_id is None or channel_id is None:
            return self._is_enabled(community_id)
        try:
            from database import get_db_connection
            conn = get_db_connection()
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT enabled FROM community_channel_agents "
                        "WHERE community_id = %s AND channel_id = %s "
                        "AND agent_type = %s",
                        (community_id, channel_id, self.NAME),
                    )
                    row = cur.fetchone()
            finally:
                conn.close()
            if row:
                enabled = row.get("enabled") if isinstance(row, dict) else row[0]
                return bool(enabled)
        except Exception as exc:
            log.debug(f"[{self.NAME}] channel-override lookup failed: {exc}")
        return self._is_enabled(community_id)

    # ── Learn ────────────────────────────────────────────────────────
    def learn(self, action_id: int, signal: str, *, weight: float = 1.0) -> None:
        """Default: read the action's scope and bump a simple
        positive/negative counter in agent_state.thresholds. Subclasses
        override to do something smarter (bandit updates, per-user
        preference vectors, etc.)."""
        try:
            action = agent_memory.get_action(action_id)
            if not action:
                return
            scope_type, scope_id = self._scope_from_action(action)
            state = agent_memory.get_state(self.NAME, scope_type, scope_id) or {}
            th = dict(state.get("thresholds") or {})
            counters = dict(th.get("feedback_counts") or {})
            counters[signal] = counters.get(signal, 0) + 1
            th["feedback_counts"] = counters
            outcome = ("positive" if signal in ("positive", "engaged")
                       else "negative" if signal in ("negative", "dismissed")
                       else "neutral")
            agent_memory.set_state(self.NAME, scope_type, scope_id,
                                   thresholds=th, last_outcome=outcome)
        except Exception as exc:
            log.debug(f"[{self.NAME}] default learn() failed: {exc}")

    # ── Cooldown helper ──────────────────────────────────────────────
    def _cooldown_active(self, scope_type: str, scope_id: Optional[int]) -> bool:
        """Returns True if this agent acted on the same scope more
        recently than COOLDOWN_SECONDS. Backed by agent_state.last_acted_at
        — durable across worker restarts (unlike an in-memory cache)."""
        if not self.COOLDOWN_SECONDS:
            return False
        state = agent_memory.get_state(self.NAME, scope_type, scope_id)
        if not state or not state.get("last_acted_at"):
            return False
        last = state["last_acted_at"]
        try:
            # MySQL driver returns a datetime; convert to epoch.
            last_ts = last.timestamp() if hasattr(last, "timestamp") else float(last)
        except Exception:
            return False
        return (time.time() - last_ts) < self.COOLDOWN_SECONDS

    def _scope_from_action(self, action: dict) -> Tuple[str, Optional[int]]:
        """Best-effort: derive (scope_type, scope_id) from a logged
        action row. Falls back to the agent's SCOPE_TYPE default."""
        if action.get("channel_id"):
            return (agent_memory.SCOPE_CHANNEL, action["channel_id"])
        if action.get("community_id"):
            return (agent_memory.SCOPE_COMMUNITY, action["community_id"])
        if action.get("user_id"):
            return (agent_memory.SCOPE_USER, action["user_id"])
        return (agent_memory.SCOPE_GLOBAL, None)

    # ── Driver — called by the orchestrator ─────────────────────────
    def handle(self, event: dict) -> Optional[dict]:
        """Run one full sense→decide→(maybe)act cycle. Returns the act
        result dict if we acted, None otherwise. Every cycle that
        survives sense() is logged in agent_actions."""
        try:
            obs = self.sense(event)
        except Exception as exc:
            log.warning(f"[{self.NAME}] sense() raised: {exc}")
            return None
        if obs is None:
            return None

        try:
            decision, payload, reason = self.decide(obs)
        except Exception as exc:
            log.warning(f"[{self.NAME}] decide() raised: {exc}")
            return None

        correlation_id = (payload.get("correlation_id") if isinstance(payload, dict)
                          else None) or str(uuid.uuid4())

        action_id = agent_memory.log_action(
            agent_name     = self.NAME,
            decision       = decision,
            reason         = reason,
            correlation_id = correlation_id,
            community_id   = obs.get("community_id"),
            channel_id     = obs.get("channel_id"),
            user_id        = obs.get("user_id"),
            payload        = payload if isinstance(payload, dict) else None,
        )

        if decision != "act":
            return None

        # Honour cooldown after logging (so 'defer' still leaves a trail).
        scope_type = obs.get("scope_type") or self.SCOPE_TYPE
        scope_id   = obs.get("scope_id") or obs.get("channel_id") \
                     or obs.get("community_id") or obs.get("user_id")
        if self._cooldown_active(scope_type, scope_id):
            log.info(f"[{self.NAME}] cooldown blocked act (scope={scope_type}:{scope_id})")
            return None

        try:
            result = self.act(payload, correlation_id)
        except Exception as exc:
            log.exception(f"[{self.NAME}] act() raised: {exc}")
            return None

        # Stamp last_acted_at so cooldown is honoured next time.
        try:
            agent_memory.set_state(self.NAME, scope_type, scope_id,
                                   last_acted=True)
        except Exception:
            pass

        if isinstance(result, dict):
            result.setdefault("action_id", action_id)
            result.setdefault("correlation_id", correlation_id)
        return result
