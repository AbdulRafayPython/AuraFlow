"""
TC-UT-AGT-SUPPORT-01 … 09
=========================
Per-agent unit tests for `agents/support.py` — `SupportAgent`
autonomous hooks (Phase 1.4).

Support uses sklearn TF-IDF for retrieval. We don't exercise the TF-IDF
machinery here — we patch `_best_match` to return canned results so the
tests verify decision/action wiring, not retrieval quality.
"""
from __future__ import annotations

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))))

from unittest.mock import patch

import pytest

from agents.support import SupportAgent
from agents import event_bus as _bus


def _question_event(content="how do I reset my password?",
                    channel_id=100, community_id=7, user_id=42):
    return {
        "topic": _bus.TOPIC_MSG_CREATED,
        "content": content,
        "channel_id": channel_id, "community_id": community_id,
        "user_id": user_id, "message_id": 5001,
    }


class TestSupportSense:

    def test_sense_drops_non_question(self, chain_store):
        a = SupportAgent()
        obs = a.sense(_question_event(content="ship looks good today"))
        assert obs is None

    def test_sense_drops_command(self, chain_store):
        a = SupportAgent()
        assert a.sense(_question_event(content="/help me out?")) is None

    def test_sense_requires_community(self, chain_store):
        a = SupportAgent()
        evt = _question_event(community_id=None)
        assert a.sense(evt) is None

    def test_sense_passes_genuine_question(self, chain_store):
        obs = SupportAgent().sense(_question_event())
        assert obs is not None
        assert "password" in obs["question"]
        assert obs["channel_id"] == 100


class TestSupportDecide:

    def _obs(self, channel_id=100):
        return {
            "question": "how do I reset my password?",
            "community_id": 7, "channel_id": channel_id, "user_id": 42,
            "message_id": 5001, "scope_type": "channel", "scope_id": channel_id,
        }

    def test_decide_skips_when_no_match(self, chain_store):
        with patch.object(SupportAgent, "_best_match", return_value=None):
            decision, _, reason = SupportAgent().decide(self._obs())
        assert decision == "skip"
        assert reason == "no_kb_match"

    def test_decide_defers_when_score_below_threshold(self, chain_store):
        with patch.object(SupportAgent, "_best_match",
                          return_value={"id": 1, "title": "FAQ",
                                        "content": "...", "score": 0.05}), \
             patch.object(SupportAgent, "_score_threshold", return_value=0.25):
            decision, _, reason = SupportAgent().decide(self._obs())
        assert decision == "defer"
        assert "below" in reason

    def test_decide_acts_with_strong_match(self, chain_store):
        with patch.object(SupportAgent, "_best_match",
                          return_value={"id": 42, "title": "Reset password",
                                        "content": "Click forgot password",
                                        "score": 0.8}), \
             patch.object(SupportAgent, "_score_threshold", return_value=0.25):
            decision, payload, reason = SupportAgent().decide(self._obs())
        assert decision == "act"
        assert payload["kb_id"] == 42
        assert payload["score"] == 0.8
        assert "kb_match_0.80" in reason


class TestSupportAct:

    def test_act_emits_support_suggestion(self, chain_store, socketio_emits):
        result = SupportAgent().act(
            {"channel_id": 100, "community_id": 7, "message_id": 5001,
             "kb_id": 42, "kb_title": "Reset password",
             "snippet": "Click forgot password", "score": 0.8},
            "corr-sup-1",
        )
        assert result == {"emitted": True, "kb_id": 42}
        topic = socketio_emits.call_args.args[0]
        assert topic == "support_suggestion"
        payload = socketio_emits.call_args.args[1]
        assert payload["kb_id"] == 42
        assert payload["correlation_id"] == "corr-sup-1"
        assert socketio_emits.call_args.kwargs["room"] == "channel_100"


class TestSupportHandle:

    def test_handle_end_to_end(self, chain_store, socketio_emits):
        with patch.object(SupportAgent, "_best_match",
                          return_value={"id": 42, "title": "Reset",
                                        "content": "...", "score": 0.8}), \
             patch.object(SupportAgent, "_score_threshold", return_value=0.25):
            SupportAgent().handle(_question_event())
        acts = chain_store.act_rows_for("support")
        assert len(acts) == 1
        assert socketio_emits.call_count == 1


class TestSupportLearn:

    def test_learn_positive_lowers_threshold(self, chain_store):
        chain_store.set_state(
            "support", "channel", 100,
            thresholds={"score_threshold": 0.25},
        )
        action_id = chain_store.log_action(
            agent_name="support", decision="act", reason="seed",
            correlation_id="learn-sup-pos", channel_id=100, community_id=7,
            payload={"kb_id": 42, "score": 0.8},
        )
        SupportAgent().learn(action_id, "engaged", weight=2.0)
        st = chain_store.get_state("support", "channel", 100) or {}
        thr = (st.get("thresholds") or {}).get("score_threshold")
        assert thr is not None and thr < 0.25, \
            f"engaged must lower score_threshold below 0.25, got {thr}"
        assert thr >= 0.10, "must respect floor of 0.10"

    def test_learn_negative_raises_threshold(self, chain_store):
        chain_store.set_state(
            "support", "channel", 100,
            thresholds={"score_threshold": 0.25},
        )
        action_id = chain_store.log_action(
            agent_name="support", decision="act", reason="seed",
            correlation_id="learn-sup-neg", channel_id=100, community_id=7,
            payload={"kb_id": 42, "score": 0.3},
        )
        SupportAgent().learn(action_id, "dismissed", weight=2.0)
        st = chain_store.get_state("support", "channel", 100) or {}
        thr = (st.get("thresholds") or {}).get("score_threshold")
        assert thr is not None and thr > 0.25, \
            f"dismissed must raise score_threshold above 0.25, got {thr}"
        assert thr <= 0.45, "must respect ceiling of 0.45"
