"""
TC-UT-AGT-WELLNESS-01 … 09
==========================
Per-agent unit tests for `agents/wellness.py` — `WellnessAgent`
autonomous hooks (Phase 3.2 + Phase 4 victim-support chain).

We exercise `sense` / `decide` / `act` / `learn` in isolation plus an
end-to-end `handle()` cycle. Side-effects are caught by the shared
fixtures from `UNIT_TESTING/agents/conftest.py`:

* `chain_store`     — in-memory `agent_memory`
* `bus_captured`    — `agents.event_bus.publish` calls
* `socketio_emits`  — emit mock on the pre-stubbed `app` module

Wellness is the first file we write because it carries every landmine
worth proving the fixtures against in one place: two triggers
(`mood.escalation` / `mod.violation`), quiet-hours via `datetime.now()`,
the named-import `_agent_memory` lookup, lazy `from app import socketio`,
and a per-user cooldown.
"""
from __future__ import annotations

import sys
import os
# Add Backend root to sys.path so `agents.*` is importable. conftest
# does this too, but conftest runs after module-import collection.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))))

import datetime
from unittest.mock import patch, MagicMock

import pytest

from agents.wellness import WellnessAgent
from agents import event_bus as _bus

# `make_fixed_dt` is defined in this directory's conftest; importing it
# directly keeps the test signatures clean. (conftest is on sys.path via
# pytest's rootdir machinery.)
from conftest import make_fixed_dt  # noqa: F401


class _FakeRedis:
    """Minimal Redis stand-in supporting the SET NX EX claim semantics
    used by WellnessAgent._claim_checkin. One instance shared across two
    agents models two orchestrator loops sharing the same Redis."""

    def __init__(self) -> None:
        self.store: dict = {}

    def set(self, key, value, nx=False, ex=None):
        if nx and key in self.store:
            return None
        self.store[key] = value
        return True


# ───────────────────────────────────────────────────────────────────
#  TestSense
# ───────────────────────────────────────────────────────────────────

class TestWellnessSense:
    """sense() filters by topic + severity gate + opt-in."""

    def test_sense_drops_unknown_topic(self, chain_store):
        agent = WellnessAgent()
        with patch.object(WellnessAgent, "_user_opted_in", return_value=True):
            obs = agent.sense({"topic": "msg.created", "user_id": 1})
        assert obs is None, "wellness only listens to mood.escalation + mod.violation"

    def test_sense_passes_mood_escalation(self, chain_store):
        agent = WellnessAgent()
        with patch.object(WellnessAgent, "_user_opted_in", return_value=True):
            obs = agent.sense({
                "topic": _bus.TOPIC_MOOD_ESCALATION,
                "user_id": 42, "channel_id": 100, "community_id": 7,
                "score": -0.9, "primary_mood": "sad", "window_mean": -0.7,
                "threshold": -0.4, "correlation_id": "x1",
            })
        assert obs is not None
        assert obs["trigger"] == "mood_escalation"
        assert obs["user_id"] == 42
        assert obs["mood_correlation_id"] == "x1"
        assert obs["mod_correlation_id"] is None

    def test_sense_drops_low_severity_violation(self, chain_store):
        """severity_score below 0.5 is too light for a de-escalation nudge."""
        agent = WellnessAgent()
        with patch.object(WellnessAgent, "_user_opted_in", return_value=True):
            obs = agent.sense({
                "topic": _bus.TOPIC_MOD_VIOLATION,
                "user_id": 42, "channel_id": 100,
                "category": "spam", "severity": "low",
                "severity_score": 0.2,
            })
        assert obs is None

    def test_sense_passes_high_severity_violation(self, chain_store):
        agent = WellnessAgent()
        with patch.object(WellnessAgent, "_user_opted_in", return_value=True):
            obs = agent.sense({
                "topic": _bus.TOPIC_MOD_VIOLATION,
                "user_id": 42, "channel_id": 100,
                "category": "harassment", "severity": "high",
                "severity_score": 0.8, "correlation_id": "v1",
            })
        assert obs is not None
        assert obs["trigger"] == "mod_violation"
        assert obs["mod_correlation_id"] == "v1"
        assert obs["mood_correlation_id"] is None

    def test_sense_drops_opted_out_user(self, chain_store):
        agent = WellnessAgent()
        with patch.object(WellnessAgent, "_user_opted_in", return_value=False):
            obs = agent.sense({
                "topic": _bus.TOPIC_MOOD_ESCALATION,
                "user_id": 42, "score": -0.9,
            })
        assert obs is None


# ───────────────────────────────────────────────────────────────────
#  TestDecide
# ───────────────────────────────────────────────────────────────────

class TestWellnessDecide:
    """decide() handles quiet hours + always-act for moderation path."""

    def _obs(self, **overrides):
        base = {
            "user_id": 42, "channel_id": 100, "community_id": 7,
            "trigger": "mood_escalation",
            "score": -0.9, "primary_mood": "sad", "window_mean": -0.7,
            "threshold": -0.4,
        }
        base.update(overrides)
        return base

    def test_decide_act_during_daytime(self, chain_store):
        DayDt = make_fixed_dt(hour=14)
        with patch("agents.wellness.datetime", DayDt), \
             patch.object(WellnessAgent, "_pick_template_index", return_value=2):
            decision, payload, reason = WellnessAgent().decide(self._obs())
        assert decision == "act"
        assert payload["template_idx"] == 2
        assert "checkin_template_2" in reason

    def test_decide_defers_during_quiet_hours_for_mood(self, chain_store):
        """23:00–06:00 → mood-path defers."""
        NightDt = make_fixed_dt(hour=3)
        with patch("agents.wellness.datetime", NightDt):
            decision, _, reason = WellnessAgent().decide(self._obs())
        assert decision == "defer"
        assert "quiet_hours" in reason

    def test_decide_acts_during_quiet_hours_for_violation(self, chain_store):
        """The moderation path bypasses quiet hours — de-escalation is
        time-sensitive."""
        NightDt = make_fixed_dt(hour=3)
        with patch("agents.wellness.datetime", NightDt), \
             patch.object(WellnessAgent, "_pick_template_index", return_value=1):
            decision, payload, reason = WellnessAgent().decide(
                self._obs(trigger="mod_violation",
                          mod_category="harassment", mod_severity="high"))
        assert decision == "act"
        assert "deescalation_template_1" in reason


# ───────────────────────────────────────────────────────────────────
#  TestAct
# ───────────────────────────────────────────────────────────────────

class TestWellnessAct:
    """act() emits wellness_checkin via the lazy `from app import socketio`."""

    def test_act_emits_mood_checkin(self, chain_store, socketio_emits):
        with patch.object(WellnessAgent, "_format_checkin",
                          return_value="Quick reset?"), \
             patch.object(WellnessAgent, "_log_wellness_check",
                          return_value=None):
            result = WellnessAgent().act(
                {"user_id": 42, "channel_id": 100, "community_id": 7,
                 "trigger": "mood_escalation", "template_idx": 0,
                 "primary_mood": "sad", "window_mean": -0.7},
                "corr-mood-1",
            )
        assert result == {"emitted": True, "template_idx": 0,
                          "text": "Quick reset?"}
        assert socketio_emits.called
        topic, payload = (socketio_emits.call_args.args[0],
                          socketio_emits.call_args.args[1])
        assert topic == "wellness_checkin"
        assert payload["trigger"] == "mood_escalation"
        assert payload["correlation_id"] == "corr-mood-1"
        assert socketio_emits.call_args.kwargs["room"] == "user_42"

    def test_act_emits_violation_checkin(self, chain_store, socketio_emits):
        with patch.object(WellnessAgent, "_format_checkin",
                          return_value="Try rephrasing."), \
             patch.object(WellnessAgent, "_log_wellness_check",
                          return_value=None):
            WellnessAgent().act(
                {"user_id": 99, "channel_id": 100, "community_id": 7,
                 "trigger": "mod_violation", "template_idx": 1,
                 "mod_category": "harassment", "mod_severity": "high"},
                "corr-mod-1",
            )
        assert socketio_emits.call_args.args[1]["trigger"] == "mod_violation"


# ───────────────────────────────────────────────────────────────────
#  TestDedupe (cross-process idempotency claim)
# ───────────────────────────────────────────────────────────────────

class TestWellnessDedupe:
    """A single escalation fanned out to N orchestrator loops must yield
    exactly one wellness_checkin — the atomic Redis claim collapses the
    duplicate emits that caused the '3-4 stacked toasts' bug."""

    def test_act_dedupes_duplicate_dispatch_across_loops(
            self, chain_store, socketio_emits):
        fake = _FakeRedis()
        payload = {
            "user_id": 42, "channel_id": 100, "community_id": 7,
            "trigger": "mood_escalation", "template_idx": 0,
            "primary_mood": "sad", "window_mean": -0.7,
        }
        # `patch` here overrides the autouse `_no_redis_claims` stub for the
        # duration of the block, so the claim actually engages.
        with patch("agents.wellness._get_redis", return_value=fake), \
             patch.object(WellnessAgent, "_format_checkin", return_value="Hey."), \
             patch.object(WellnessAgent, "_log_wellness_check", return_value=None):
            # Two separate instances = two orchestrator loops (distinct
            # worker processes) reacting to the SAME escalation event.
            first = WellnessAgent().act(dict(payload), "corr-dupe")
            second = WellnessAgent().act(dict(payload), "corr-dupe")

        assert first["emitted"] is True
        assert second == {"emitted": False, "deduped": True, "template_idx": 0}
        assert socketio_emits.call_count == 1, \
            "duplicate fan-out must collapse to a single toast"

    def test_act_fails_open_without_redis(self, chain_store, socketio_emits):
        """No Redis (single-process dev) → claim fail-opens, emit proceeds."""
        with patch("agents.wellness._get_redis", return_value=None), \
             patch.object(WellnessAgent, "_format_checkin", return_value="Hey."), \
             patch.object(WellnessAgent, "_log_wellness_check", return_value=None):
            result = WellnessAgent().act(
                {"user_id": 42, "channel_id": 100, "community_id": 7,
                 "trigger": "mood_escalation", "template_idx": 0},
                "corr-open",
            )
        assert result["emitted"] is True
        assert socketio_emits.call_count == 1


# ───────────────────────────────────────────────────────────────────
#  TestHandle (end-to-end through base.handle)
# ───────────────────────────────────────────────────────────────────

class TestWellnessHandle:
    """handle() drives sense→decide→log_action→act→set_state in one shot."""

    def test_handle_logs_act_row_and_emits(
            self, chain_store, bus_captured, socketio_emits):
        DayDt = make_fixed_dt(hour=14)
        with patch.object(WellnessAgent, "_user_opted_in", return_value=True), \
             patch.object(WellnessAgent, "_pick_template_index", return_value=0), \
             patch.object(WellnessAgent, "_format_checkin", return_value="Hey."), \
             patch.object(WellnessAgent, "_log_wellness_check", return_value=None), \
             patch("agents.wellness.datetime", DayDt):
            WellnessAgent().handle({
                "topic": _bus.TOPIC_MOOD_ESCALATION,
                "user_id": 42, "channel_id": 100, "community_id": 7,
                "score": -0.9, "primary_mood": "sad", "window_mean": -0.7,
                "threshold": -0.4, "correlation_id": "mood-uat-handle",
            })
        acts = chain_store.act_rows_for("wellness")
        assert len(acts) == 1
        assert socketio_emits.call_count == 1

    def test_handle_cooldown_blocks_second_emit(
            self, chain_store, bus_captured, socketio_emits):
        """Two escalations inside 60-min cooldown → 2 logged act rows, 1 emit."""
        DayDt = make_fixed_dt(hour=14)
        evt_a = {
            "topic": _bus.TOPIC_MOOD_ESCALATION,
            "user_id": 77, "channel_id": 100, "community_id": 7,
            "score": -0.9, "primary_mood": "sad", "window_mean": -0.8,
            "threshold": -0.4, "correlation_id": "wellness-cd-a",
        }
        evt_b = {**evt_a, "correlation_id": "wellness-cd-b"}

        with patch.object(WellnessAgent, "_user_opted_in", return_value=True), \
             patch.object(WellnessAgent, "_pick_template_index", return_value=0), \
             patch.object(WellnessAgent, "_format_checkin", return_value="x"), \
             patch.object(WellnessAgent, "_log_wellness_check", return_value=None), \
             patch("agents.wellness.datetime", DayDt):
            agent = WellnessAgent()
            agent.handle(evt_a)
            agent.handle(evt_b)

        assert len(chain_store.act_rows_for("wellness")) == 2
        assert socketio_emits.call_count == 1, \
            "60-min per-user cooldown must drop the second emit"

    def test_handle_quiet_hours_skips_mood_but_still_logs(
            self, chain_store, bus_captured, socketio_emits):
        NightDt = make_fixed_dt(hour=3)
        with patch.object(WellnessAgent, "_user_opted_in", return_value=True), \
             patch("agents.wellness.datetime", NightDt):
            WellnessAgent().handle({
                "topic": _bus.TOPIC_MOOD_ESCALATION,
                "user_id": 42, "channel_id": 100, "community_id": 7,
                "score": -0.9, "window_mean": -0.7, "threshold": -0.4,
                "correlation_id": "qh-mood",
            })
        # decide returned 'defer' → row logged with decision=defer, no emit.
        assert not socketio_emits.called
        rows = chain_store.actions_for("wellness")
        assert len(rows) == 1
        assert rows[0]["decision"] == "defer"


# ───────────────────────────────────────────────────────────────────
#  TestLearn
# ───────────────────────────────────────────────────────────────────

class TestWellnessLearn:
    """learn() updates per-user template_rewards + cooldown_multiplier."""

    def test_learn_positive_signal_bumps_template_reward(self, chain_store):
        # Seed an action row the bandit can credit.
        action_id = chain_store.log_action(
            agent_name="wellness", decision="act", reason="seed",
            correlation_id="learn-pos", user_id=42, channel_id=100,
            payload={"template_idx": 2},
        )
        with patch.object(WellnessAgent, "_template_idx_for", return_value=2):
            WellnessAgent().learn(action_id, "engaged")

        st = chain_store.get_state("wellness", "user", 42) or {}
        rewards = (st.get("thresholds") or {}).get("template_rewards") or {}
        assert rewards.get("2") and float(rewards["2"]) > 0, \
            f"engaged signal must credit template arm 2, got {rewards}"
        assert st.get("last_outcome") == "positive"

    def test_learn_negative_signal_stretches_cooldown(self, chain_store):
        action_id = chain_store.log_action(
            agent_name="wellness", decision="act", reason="seed",
            correlation_id="learn-neg", user_id=42, channel_id=100,
            payload={"template_idx": 0},
        )
        with patch.object(WellnessAgent, "_template_idx_for", return_value=0):
            WellnessAgent().learn(action_id, "dismissed")

        st = chain_store.get_state("wellness", "user", 42) or {}
        mult = (st.get("thresholds") or {}).get("cooldown_multiplier")
        assert mult is not None and mult > 1.0, \
            f"dismissed signal must stretch cooldown (got {mult})"
        assert mult <= 6.0, "cooldown_multiplier must be capped at 6"
        assert st.get("last_outcome") == "negative"
