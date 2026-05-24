"""
TC-UT-AGT-SUM-01 … 08
=====================
Per-agent unit tests for `agents/summarizer.py` — `SummarizerAgent`
autonomous hooks (Phase 3.3).
"""
from __future__ import annotations

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))))

from unittest.mock import patch

import pytest

from agents.summarizer import SummarizerAgent
from agents import event_bus as _bus

from conftest import fake_db_with_count


def _drift_event(channel_id=100, community_id=7, **extras):
    base = {
        "topic": _bus.TOPIC_FOCUS_DRIFT,
        "channel_id": channel_id, "community_id": community_id,
        "old_topics": ["docker", "container", "image"],
        "new_topics": ["weekend", "movie", "dinner"],
        "shared": [], "jaccard": 0.0,
        "correlation_id": "drift-sum-1",
    }
    base.update(extras)
    return base


class TestSummarizerSense:

    def test_sense_drops_unowned_channel(self, chain_store):
        a = SummarizerAgent()
        obs = a.sense({"topic": _bus.TOPIC_FOCUS_DRIFT})
        assert obs is None

    def test_sense_emits_msg_count(self, chain_store):
        a = SummarizerAgent()
        with patch("agents.summarizer.get_db_connection",
                   return_value=fake_db_with_count(42)):
            obs = a.sense(_drift_event())
        assert obs is not None
        assert obs["msg_count"] == 42
        assert obs["channel_id"] == 100
        assert obs["scope_type"] == "channel"


class TestSummarizerDecide:

    def _obs(self, msg_count=42, channel_id=100):
        return {
            "channel_id": channel_id, "community_id": 7, "user_id": None,
            "old_topics": ["a", "b"], "new_topics": ["c"], "jaccard": 0.0,
            "msg_count": msg_count, "scope_type": "channel",
            "scope_id": channel_id,
        }

    def test_decide_acts_above_threshold(self, chain_store):
        with patch.object(SummarizerAgent, "_min_messages", return_value=10):
            decision, _, reason = SummarizerAgent().decide(self._obs(42))
        assert decision == "act"
        assert "checkpoint_msgs_42" in reason

    def test_decide_defers_below_threshold(self, chain_store):
        with patch.object(SummarizerAgent, "_min_messages", return_value=50):
            decision, _, reason = SummarizerAgent().decide(self._obs(5))
        assert decision == "defer"
        assert "below_50" in reason


class TestSummarizerAct:

    def test_act_emits_summary_checkpoint(self, chain_store, socketio_emits):
        with patch.object(SummarizerAgent, "summarize_channel",
                          return_value={"success": True,
                                        "summary": "Team discussed Docker.",
                                        "method": "extractive"}):
            result = SummarizerAgent().act(
                {"channel_id": 100, "community_id": 7,
                 "old_topics": ["docker"], "new_topics": ["movie"],
                 "msg_count": 42},
                "corr-sum-1",
            )
        assert result["summarised"] is True
        assert result["emitted"] is True
        topic = socketio_emits.call_args.args[0]
        assert topic == "summary_checkpoint"
        payload = socketio_emits.call_args.args[1]
        assert payload["summary"].startswith("Team discussed")
        assert payload["correlation_id"] == "corr-sum-1"
        assert socketio_emits.call_args.kwargs["room"] == "channel_100"

    def test_act_handles_empty_summary(self, chain_store, socketio_emits):
        with patch.object(SummarizerAgent, "summarize_channel",
                          return_value={"success": True, "summary": ""}):
            result = SummarizerAgent().act(
                {"channel_id": 100, "msg_count": 5}, "corr-sum-2")
        assert result == {"summarised": False, "reason": "empty_summary"}
        assert not socketio_emits.called


class TestSummarizerHandle:

    def test_handle_end_to_end_logs_act_and_emits(
            self, chain_store, socketio_emits):
        with patch.object(SummarizerAgent, "_min_messages", return_value=5), \
             patch.object(SummarizerAgent, "summarize_channel",
                          return_value={"success": True,
                                        "summary": "Brief summary.",
                                        "method": "extractive"}), \
             patch("agents.summarizer.get_db_connection",
                   return_value=fake_db_with_count(42)):
            SummarizerAgent().handle(_drift_event())
        acts = chain_store.act_rows_for("summarizer")
        assert len(acts) == 1
        emitted_topics = [c.args[0] for c in socketio_emits.call_args_list]
        assert "summary_checkpoint" in emitted_topics

    def test_handle_low_volume_defers(self, chain_store, socketio_emits):
        with patch.object(SummarizerAgent, "_min_messages", return_value=50), \
             patch.object(SummarizerAgent, "summarize_channel") as summarize, \
             patch("agents.summarizer.get_db_connection",
                   return_value=fake_db_with_count(2)):
            SummarizerAgent().handle(_drift_event())
        # log_action records the defer; no summarise call, no emit.
        assert not summarize.called
        assert not socketio_emits.called
        assert any(a["decision"] == "defer"
                   for a in chain_store.actions_for("summarizer"))


class TestSummarizerLearn:

    def test_learn_positive_lowers_min_messages(self, chain_store):
        chain_store.set_state(
            "summarizer", "channel", 100,
            thresholds={"min_messages": 30},
        )
        action_id = chain_store.log_action(
            agent_name="summarizer", decision="act", reason="seed",
            correlation_id="learn-sum-pos", channel_id=100, community_id=7,
            payload={"msg_count": 30},
        )
        SummarizerAgent().learn(action_id, "engaged", weight=2.0)
        st = chain_store.get_state("summarizer", "channel", 100) or {}
        mm = (st.get("thresholds") or {}).get("min_messages")
        assert mm is not None and mm < 30, \
            f"engaged signal must lower min_messages below 30, got {mm}"
        assert mm >= 5, "must respect lower bound of 5"
