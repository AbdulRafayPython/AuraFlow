"""
TC-UT-AGT-KB-01 … 08
====================
Per-agent unit tests for `agents/knowledge_builder_v2.py` —
`KnowledgeBuilderAgent` autonomous hooks (Phase 3.4).
"""
from __future__ import annotations

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))))

from unittest.mock import patch

import pytest

from agents.knowledge_builder_v2 import KnowledgeBuilderAgent
from agents import event_bus as _bus

from conftest import fake_db_with_count


def _drift_event(channel_id=100, community_id=7):
    return {
        "topic": _bus.TOPIC_FOCUS_DRIFT,
        "channel_id": channel_id, "community_id": community_id,
        "old_topics": ["docker", "container"],
        "new_topics": ["movie", "weekend"],
        "correlation_id": "drift-kb-1",
    }


class TestKnowledgeBuilderSense:

    def test_sense_drops_unowned_channel(self, chain_store):
        a = KnowledgeBuilderAgent()
        assert a.sense({"topic": _bus.TOPIC_FOCUS_DRIFT}) is None

    def test_sense_emits_msg_count(self, chain_store):
        with patch("agents.knowledge_builder_v2.get_db_connection",
                   return_value=fake_db_with_count(42)):
            obs = KnowledgeBuilderAgent().sense(_drift_event())
        assert obs is not None
        assert obs["msg_count"] == 42
        assert obs["scope_type"] == "channel"


class TestKnowledgeBuilderDecide:

    def _obs(self, msg_count=42):
        return {
            "channel_id": 100, "community_id": 7, "user_id": None,
            "msg_count": msg_count, "old_topics": ["a"], "new_topics": ["b"],
            "scope_type": "channel", "scope_id": 100,
        }

    def test_decide_acts_above_threshold(self, chain_store):
        with patch.object(KnowledgeBuilderAgent, "_min_messages",
                          return_value=10):
            decision, _, reason = KnowledgeBuilderAgent().decide(self._obs(42))
        assert decision == "act"
        assert "extract_msgs_42" in reason

    def test_decide_defers_below_threshold(self, chain_store):
        with patch.object(KnowledgeBuilderAgent, "_min_messages",
                          return_value=20):
            decision, _, reason = KnowledgeBuilderAgent().decide(self._obs(2))
        assert decision == "defer"
        assert "below_20" in reason


class TestKnowledgeBuilderAct:

    def test_act_publishes_kb_created(self, chain_store, bus_captured):
        with patch.object(KnowledgeBuilderAgent, "extract_knowledge",
                          return_value={"success": True, "total_items": 3,
                                        "faqs": 2, "definitions": 1,
                                        "decisions": 0}):
            result = KnowledgeBuilderAgent().act(
                {"channel_id": 100, "community_id": 7,
                 "old_topics": ["docker"], "new_topics": ["movie"]},
                "corr-kb-1",
            )
        assert result["extracted"] is True
        assert result["total_items"] == 3
        topics = [c["topic"] for c in bus_captured]
        assert _bus.TOPIC_KB_CREATED in topics
        payload = next(c["payload"] for c in bus_captured
                       if c["topic"] == _bus.TOPIC_KB_CREATED)
        assert payload["correlation_id"] == "corr-kb-1"
        assert payload["faqs"] == 2

    def test_act_skips_publish_when_zero_items(self, chain_store, bus_captured):
        with patch.object(KnowledgeBuilderAgent, "extract_knowledge",
                          return_value={"success": True, "total_items": 0}):
            result = KnowledgeBuilderAgent().act(
                {"channel_id": 100, "community_id": 7}, "corr-kb-empty")
        assert result == {"extracted": True, "total_items": 0}
        assert not any(c["topic"] == _bus.TOPIC_KB_CREATED for c in bus_captured)


class TestKnowledgeBuilderHandle:

    def test_handle_end_to_end_publishes(self, chain_store, bus_captured):
        with patch.object(KnowledgeBuilderAgent, "_min_messages", return_value=5), \
             patch.object(KnowledgeBuilderAgent, "extract_knowledge",
                          return_value={"success": True, "total_items": 2,
                                        "faqs": 1, "definitions": 1,
                                        "decisions": 0}), \
             patch("agents.knowledge_builder_v2.get_db_connection",
                   return_value=fake_db_with_count(42)):
            KnowledgeBuilderAgent().handle(_drift_event())
        acts = chain_store.act_rows_for("knowledge_builder")
        assert len(acts) == 1
        assert any(c["topic"] == _bus.TOPIC_KB_CREATED for c in bus_captured)

    def test_handle_low_volume_defers(self, chain_store, bus_captured):
        with patch.object(KnowledgeBuilderAgent, "_min_messages", return_value=20), \
             patch.object(KnowledgeBuilderAgent, "extract_knowledge") as extract, \
             patch("agents.knowledge_builder_v2.get_db_connection",
                   return_value=fake_db_with_count(2)):
            KnowledgeBuilderAgent().handle(_drift_event())
        assert not extract.called
        assert not any(c["topic"] == _bus.TOPIC_KB_CREATED for c in bus_captured)


class TestKnowledgeBuilderLearn:

    def test_learn_negative_raises_min_messages(self, chain_store):
        chain_store.set_state(
            "knowledge_builder", "channel", 100,
            thresholds={"min_messages": 10},
        )
        action_id = chain_store.log_action(
            agent_name="knowledge_builder", decision="act", reason="seed",
            correlation_id="learn-kb-neg", channel_id=100, community_id=7,
            payload={"msg_count": 10},
        )
        KnowledgeBuilderAgent().learn(action_id, "dismissed", weight=2.0)
        st = chain_store.get_state("knowledge_builder", "channel", 100) or {}
        mm = (st.get("thresholds") or {}).get("min_messages")
        assert mm is not None and mm > 10, \
            f"dismissed must raise min_messages above 10, got {mm}"
        assert mm <= 60, "must respect upper bound of 60"
