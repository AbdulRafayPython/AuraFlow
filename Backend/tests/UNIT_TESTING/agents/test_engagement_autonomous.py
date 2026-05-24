"""
TC-UT-AGT-ENG-01 … 08
=====================
Per-agent unit tests for `agents/engagement.py` — `EngagementAgent`
autonomous hooks (Phase 3.1).
"""
from __future__ import annotations

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))))

from unittest.mock import patch

import pytest

from agents.engagement import EngagementAgent
from agents import event_bus as _bus


def _silent_event(bucket=60, channel_id=100):
    return {
        "topic": _bus.TOPIC_CHANNEL_SILENT,
        "channel_id": channel_id, "community_id": 7,
        "bucket": bucket, "silent_minutes": bucket,
        "correlation_id": f"silent-{bucket}",
    }


class TestEngagementSense:

    def test_sense_drops_below_min_bucket(self, chain_store):
        a = EngagementAgent()
        # _MIN_BUCKET_MINUTES = 15
        assert a.sense(_silent_event(bucket=5)) is None

    def test_sense_passes_at_or_above_min_bucket(self, chain_store):
        a = EngagementAgent()
        obs = a.sense(_silent_event(bucket=60))
        assert obs is not None
        assert obs["channel_id"] == 100
        assert obs["bucket"] == 60
        assert obs["scope_type"] == "channel"

    def test_sense_drops_unowned_channel(self, chain_store):
        a = EngagementAgent()
        assert a.sense({"topic": _bus.TOPIC_CHANNEL_SILENT, "bucket": 60}) is None


class TestEngagementDecide:

    def test_decide_always_acts_with_category(self, chain_store):
        with patch.object(EngagementAgent, "_pick_category",
                          return_value="casual"):
            decision, payload, reason = EngagementAgent().decide({
                "channel_id": 100, "bucket": 60, "community_id": 7,
                "silent_minutes": 60, "scope_type": "channel",
                "scope_id": 100,
            })
        assert decision == "act"
        assert payload["category"] == "casual"
        assert "nudge_bucket_60_cat_casual" in reason


class TestEngagementAct:

    def test_act_emits_engagement_nudge(self, chain_store, socketio_emits):
        with patch.object(EngagementAgent, "_suggest_conversation_starter",
                          return_value="What's everyone working on today?"):
            result = EngagementAgent().act(
                {"channel_id": 100, "community_id": 7, "bucket": 60,
                 "silent_minutes": 60, "category": "casual"},
                "corr-eng-1",
            )
        assert result["emitted"] is True
        assert result["category"] == "casual"
        topic = socketio_emits.call_args.args[0]
        assert topic == "engagement_nudge"
        payload = socketio_emits.call_args.args[1]
        assert payload["category"] == "casual"
        assert payload["correlation_id"] == "corr-eng-1"
        assert socketio_emits.call_args.kwargs["room"] == "channel_100"


class TestEngagementHandle:

    def test_handle_end_to_end(self, chain_store, socketio_emits):
        with patch.object(EngagementAgent, "_pick_category",
                          return_value="icebreaker"), \
             patch.object(EngagementAgent, "_suggest_conversation_starter",
                          return_value="Quick share: one win today."):
            EngagementAgent().handle(_silent_event(bucket=240))
        acts = chain_store.act_rows_for("engagement")
        assert len(acts) == 1
        assert acts[0]["payload"]["category"] == "icebreaker"
        assert socketio_emits.call_count == 1


class TestEngagementLearn:

    def test_learn_positive_bumps_category_reward(self, chain_store):
        action_id = chain_store.log_action(
            agent_name="engagement", decision="act", reason="seed",
            correlation_id="learn-eng-pos", channel_id=100, community_id=7,
            payload={"category": "casual"},
        )
        with patch.object(EngagementAgent, "_category_for",
                          return_value="casual"):
            EngagementAgent().learn(action_id, "engaged", weight=2.0)
        st = chain_store.get_state("engagement", "channel", 100) or {}
        rewards = (st.get("thresholds") or {}).get("category_rewards") or {}
        assert rewards.get("casual", 0) > 0, \
            f"engaged must credit the picked category, got {rewards}"

    def test_learn_negative_drops_but_floors_at_zero(self, chain_store):
        # Seed an existing reward to confirm the half-step floor.
        chain_store.set_state(
            "engagement", "channel", 100,
            thresholds={"category_rewards": {"casual": 0.3}},
        )
        action_id = chain_store.log_action(
            agent_name="engagement", decision="act", reason="seed",
            correlation_id="learn-eng-neg", channel_id=100, community_id=7,
            payload={"category": "casual"},
        )
        with patch.object(EngagementAgent, "_category_for",
                          return_value="casual"):
            EngagementAgent().learn(action_id, "dismissed", weight=2.0)
        st = chain_store.get_state("engagement", "channel", 100) or {}
        rewards = (st.get("thresholds") or {}).get("category_rewards") or {}
        # 0.3 - 0.5 * 2 = -0.7 → floored at 0
        assert rewards.get("casual") == 0.0, \
            f"reward must floor at 0, got {rewards}"
