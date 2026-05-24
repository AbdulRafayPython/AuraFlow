"""
TC-UT-AGT-MOD-01 … 10
=====================
Per-agent unit tests for `agents/moderation.py` — `ModerationAgent`
autonomous hooks (Phase 2.2) and Phase 5.2 clamp behaviour.

Patches the named-import `_agent_memory` lookups inside the moderation
module — the shared `chain_store` fixture covers that.
"""
from __future__ import annotations

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))))

from unittest.mock import patch, MagicMock

import pytest

from agents.moderation import ModerationAgent
from agents import event_bus as _bus


# ───────────────────────────────────────────────────────────────────
#  TestSense
# ───────────────────────────────────────────────────────────────────

class TestModerationSense:

    def test_sense_drops_short_or_slash_content(self, chain_store):
        agent = ModerationAgent()
        assert agent.sense({"topic": "msg.created", "content": "ok",
                            "user_id": 1, "channel_id": 1,
                            "community_id": 1}) is None
        assert agent.sense({"topic": "msg.created", "content": "/help",
                            "user_id": 1, "channel_id": 1,
                            "community_id": 1}) is None

    def test_sense_passes_when_instant_check_blocks(self, chain_store):
        agent = ModerationAgent()
        with patch.object(ModerationAgent, "instant_check",
                          return_value={"block": True,
                                        "reason": "directed_threat"}):
            obs = agent.sense({
                "topic": "msg.created",
                "content": "i will kill you",
                "user_id": 99, "channel_id": 100, "community_id": 7,
                "message_id": 1234,
            })
        assert obs is not None
        assert obs["severity"] == "critical"
        assert obs["category"] == "extreme"
        assert obs["scope_type"] == "community"

    def test_sense_passes_when_flag_personal_info(self, chain_store):
        agent = ModerationAgent()
        with patch.object(ModerationAgent, "instant_check",
                          return_value={"block": False,
                                        "flag_personal_info": True,
                                        "personal_info_types": ["phone_number"],
                                        "reason": "PII"}):
            obs = agent.sense({
                "topic": "msg.created",
                "content": "my number is 555-1234567",
                "user_id": 99, "channel_id": 100, "community_id": 7,
            })
        assert obs is not None
        assert obs["severity"] == "high"
        assert obs["category"] == "personal_info"

    def test_sense_drops_clean_content(self, chain_store):
        agent = ModerationAgent()
        with patch.object(ModerationAgent, "instant_check",
                          return_value={"block": False, "reason": ""}):
            obs = agent.sense({
                "topic": "msg.created",
                "content": "hello team, ship looks good",
                "user_id": 99, "channel_id": 100, "community_id": 7,
            })
        assert obs is None

    def test_sense_kill_switch_short_circuits(self, chain_store):
        """Phase 5.2 — admin disables moderation for a community."""
        agent = ModerationAgent()
        chain_store.set_state(
            "moderation", "community", 7, goal_value={"enabled": False},
        )
        with patch.object(ModerationAgent, "instant_check") as ic:
            obs = agent.sense({
                "topic": "msg.created",
                "content": "extreme slur goes here",
                "user_id": 99, "channel_id": 100, "community_id": 7,
            })
        assert obs is None
        assert not ic.called, "kill-switch must short-circuit before instant_check"


# ───────────────────────────────────────────────────────────────────
#  TestDecide
# ───────────────────────────────────────────────────────────────────

class TestModerationDecide:

    def _obs(self, severity="high", category="harassment", community_id=7):
        return {
            "content": "...",
            "user_id": 99, "channel_id": 100, "community_id": community_id,
            "message_id": 1234, "category": category, "severity": severity,
            "reason": "test",
        }

    def test_decide_acts_on_high_severity(self, chain_store):
        with patch.object(ModerationAgent, "_severity_threshold",
                          return_value=0.5):
            decision, payload, reason = ModerationAgent().decide(self._obs())
        assert decision == "act"
        assert payload["severity_score"] == 0.8
        assert "violation_harassment_high" in reason

    def test_decide_defers_when_below_threshold(self, chain_store):
        with patch.object(ModerationAgent, "_severity_threshold",
                          return_value=0.5):
            decision, _, reason = ModerationAgent().decide(
                self._obs(severity="low"))
        assert decision == "defer"
        assert "below" in reason

    def test_decide_respects_per_community_threshold(self, chain_store):
        """An admin-tightened community uses a higher threshold."""
        # Stored learned baseline + tight clamp.
        chain_store.set_state(
            "moderation", "community", 11,
            thresholds={
                "severity_threshold": 0.5,
                "_clamps": {"severity_threshold": {"min": 0.9, "max": 0.95}},
            },
        )
        # severity 'high' = score 0.8, below the clamped 0.9 floor.
        decision, _, _ = ModerationAgent().decide(
            self._obs(community_id=11, severity="high"))
        assert decision == "defer"


# ───────────────────────────────────────────────────────────────────
#  TestAct
# ───────────────────────────────────────────────────────────────────

class TestModerationAct:

    def test_act_publishes_mod_violation(self, chain_store, bus_captured):
        result = ModerationAgent().act(
            {"user_id": 99, "channel_id": 100, "community_id": 7,
             "message_id": 4321, "category": "harassment",
             "severity": "high", "severity_score": 0.8, "reason": "x"},
            "corr-mod-1",
        )
        assert result == {"published": True, "category": "harassment",
                          "severity": "high"}
        topics = [c["topic"] for c in bus_captured]
        assert _bus.TOPIC_MOD_VIOLATION in topics
        payload = next(c["payload"] for c in bus_captured
                       if c["topic"] == _bus.TOPIC_MOD_VIOLATION)
        assert payload["user_id"] == 99
        assert payload["correlation_id"] == "corr-mod-1"


# ───────────────────────────────────────────────────────────────────
#  TestHandle (end-to-end)
# ───────────────────────────────────────────────────────────────────

class TestModerationHandle:

    def test_handle_block_creates_act_row_and_publishes(
            self, chain_store, bus_captured):
        with patch.object(ModerationAgent, "instant_check",
                          return_value={"block": True, "reason": "slur"}):
            ModerationAgent().handle({
                "topic": "msg.created",
                "user_id": 99, "channel_id": 100, "community_id": 7,
                "content": "extreme slur here", "message_id": 99001,
            })
        acts = chain_store.act_rows_for("moderation")
        assert len(acts) == 1
        assert acts[0]["payload"]["severity"] == "critical"
        assert any(c["topic"] == _bus.TOPIC_MOD_VIOLATION for c in bus_captured)

    def test_handle_clean_message_does_not_log_anything(
            self, chain_store, bus_captured):
        with patch.object(ModerationAgent, "instant_check",
                          return_value={"block": False, "reason": ""}):
            ModerationAgent().handle({
                "topic": "msg.created",
                "user_id": 99, "channel_id": 100, "community_id": 7,
                "content": "totally fine message",
            })
        # sense returned None → nothing logged.
        assert chain_store.actions_for("moderation") == []
        assert bus_captured == []


# ───────────────────────────────────────────────────────────────────
#  TestLearn (threshold adaptation + clamp)
# ───────────────────────────────────────────────────────────────────

class TestModerationLearn:

    def test_learn_positive_lowers_threshold(self, chain_store):
        # Seed a community with the default threshold and a logged act row.
        chain_store.set_state(
            "moderation", "community", 7,
            thresholds={"severity_threshold": 0.5},
        )
        action_id = chain_store.log_action(
            agent_name="moderation", decision="act", reason="seed",
            correlation_id="learn-pos", community_id=7, channel_id=100,
            user_id=99, payload={"severity": "high"},
        )
        ModerationAgent().learn(action_id, "positive", weight=2.0)
        st = chain_store.get_state("moderation", "community", 7) or {}
        th = (st.get("thresholds") or {}).get("severity_threshold")
        assert th is not None
        assert th < 0.5, f"positive signal must drop threshold below 0.5, got {th}"

    def test_learn_negative_raises_threshold(self, chain_store):
        chain_store.set_state(
            "moderation", "community", 7,
            thresholds={"severity_threshold": 0.5},
        )
        action_id = chain_store.log_action(
            agent_name="moderation", decision="act", reason="seed",
            correlation_id="learn-neg", community_id=7, channel_id=100,
            user_id=99, payload={"severity": "high"},
        )
        ModerationAgent().learn(action_id, "dismissed", weight=2.0)
        st = chain_store.get_state("moderation", "community", 7) or {}
        th = (st.get("thresholds") or {}).get("severity_threshold")
        assert th > 0.5, f"dismissed signal must raise threshold above 0.5, got {th}"

    def test_learn_respects_admin_clamp(self, chain_store):
        """Multiple negative signals would normally drift past clamp ceiling;
        clamp must hold the line."""
        chain_store.set_state(
            "moderation", "community", 11,
            thresholds={
                "severity_threshold": 0.55,
                "_clamps": {"severity_threshold": {"min": 0.4, "max": 0.6}},
            },
        )
        action_id = chain_store.log_action(
            agent_name="moderation", decision="act", reason="seed",
            correlation_id="learn-clamp", community_id=11, channel_id=100,
            user_id=99, payload={"severity": "high"},
        )
        agent = ModerationAgent()
        for _ in range(10):
            agent.learn(action_id, "negative", weight=1.0)
        st = chain_store.get_state("moderation", "community", 11) or {}
        th = (st.get("thresholds") or {}).get("severity_threshold")
        assert th is not None
        assert th <= 0.6 + 1e-9, \
            f"clamp ceiling 0.6 violated — got {th}"
