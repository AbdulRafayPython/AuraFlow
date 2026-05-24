"""
TC-UT-AGT-MOOD-01 … 10
======================
Per-agent unit tests for `agents/mood_tracker.py` — `MoodTrackerAgent`
autonomous hooks (Phase 2.1).

Notes
-----
* `decide()` returns `act` even when not escalating — every opted-in
  message persists a mood row. The escalate flag in the payload is
  what drives the `mood.escalation` publish in `act()`.
* `_user_opted_in`, `_push_and_recall`, `_recently_escalated`,
  `_mark_escalation`, `_persist_mood_row` and `analyze_message` are all
  patched per-test so we don't need real Redis / DB / lexicon.
"""
from __future__ import annotations

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))))

from unittest.mock import patch, MagicMock

import pytest

from agents.mood_tracker import MoodTrackerAgent
from agents import event_bus as _bus


def _msg_event(content="i feel down", user_id=42, **extras):
    base = {
        "topic": _bus.TOPIC_MSG_CREATED,
        "content": content,
        "user_id": user_id,
        "channel_id": 100, "community_id": 7,
        "message_id": 1001,
    }
    base.update(extras)
    return base


# ───────────────────────────────────────────────────────────────────
#  TestSense
# ───────────────────────────────────────────────────────────────────

class TestMoodTrackerSense:

    def test_sense_drops_empty_or_command(self, chain_store):
        a = MoodTrackerAgent()
        assert a.sense(_msg_event(content="")) is None
        assert a.sense(_msg_event(content="/help")) is None
        assert a.sense(_msg_event(content="a")) is None  # < 2 chars

    def test_sense_drops_unowned_message(self, chain_store):
        a = MoodTrackerAgent()
        evt = _msg_event(user_id=None)
        assert a.sense(evt) is None

    def test_sense_passes_normal_message(self, chain_store):
        a = MoodTrackerAgent()
        obs = a.sense(_msg_event(content="just feeling rough today"))
        assert obs is not None
        assert obs["user_id"] == 42
        assert obs["scope_type"] == "user"
        assert obs["scope_id"] == 42


# ───────────────────────────────────────────────────────────────────
#  TestDecide
# ───────────────────────────────────────────────────────────────────

class TestMoodTrackerDecide:

    def _obs(self, content="rough day"):
        return {
            "content": content, "user_id": 42,
            "channel_id": 100, "community_id": 7,
            "message_id": 1001,
            "scope_type": "user", "scope_id": 42,
        }

    def test_decide_skips_opted_out_user(self, chain_store):
        with patch.object(MoodTrackerAgent, "_user_opted_in",
                          return_value=False):
            decision, _, reason = MoodTrackerAgent().decide(self._obs())
        assert decision == "skip"
        assert reason == "opt_out"

    def test_decide_acts_with_warming_when_window_short(self, chain_store):
        """Until rolling window has WINDOW_SIZE entries, decide returns
        act with escalate=False so we still persist a mood row."""
        with patch.object(MoodTrackerAgent, "_user_opted_in", return_value=True), \
             patch.object(MoodTrackerAgent, "analyze_message",
                          return_value={"sentiment_score": -0.5,
                                        "primary_mood": "sad",
                                        "sentiment": "negative"}), \
             patch.object(MoodTrackerAgent, "_push_and_recall",
                          return_value=[-0.5, -0.6]):
            decision, payload, reason = MoodTrackerAgent().decide(self._obs())
        assert decision == "act"
        assert payload["escalate"] is False
        assert "warming_window" in reason

    def test_decide_acts_escalate_when_window_full_and_below_threshold(
            self, chain_store):
        with patch.object(MoodTrackerAgent, "_user_opted_in", return_value=True), \
             patch.object(MoodTrackerAgent, "analyze_message",
                          return_value={"sentiment_score": -0.9,
                                        "primary_mood": "sad",
                                        "sentiment": "negative"}), \
             patch.object(MoodTrackerAgent, "_push_and_recall",
                          return_value=[-0.6, -0.7, -0.8, -0.8, -0.9]), \
             patch.object(MoodTrackerAgent, "_escalation_threshold",
                          return_value=-0.4), \
             patch.object(MoodTrackerAgent, "_recently_escalated",
                          return_value=False):
            decision, payload, reason = MoodTrackerAgent().decide(self._obs())
        assert decision == "act"
        assert payload["escalate"] is True
        assert payload["window_mean"] < -0.4
        assert "escalation_mean" in reason

    def test_decide_acts_stable_when_already_recently_escalated(
            self, chain_store):
        """Even when the mean is below threshold, the 30-min dedupe suppresses
        a second escalation — but the row is still persisted."""
        with patch.object(MoodTrackerAgent, "_user_opted_in", return_value=True), \
             patch.object(MoodTrackerAgent, "analyze_message",
                          return_value={"sentiment_score": -0.9,
                                        "primary_mood": "sad",
                                        "sentiment": "negative"}), \
             patch.object(MoodTrackerAgent, "_push_and_recall",
                          return_value=[-0.6, -0.7, -0.8, -0.8, -0.9]), \
             patch.object(MoodTrackerAgent, "_escalation_threshold",
                          return_value=-0.4), \
             patch.object(MoodTrackerAgent, "_recently_escalated",
                          return_value=True):
            decision, payload, reason = MoodTrackerAgent().decide(self._obs())
        assert decision == "act"
        assert payload["escalate"] is False
        assert "stable_mean" in reason


# ───────────────────────────────────────────────────────────────────
#  TestAct
# ───────────────────────────────────────────────────────────────────

class TestMoodTrackerAct:

    def test_act_persists_row_without_publishing_when_not_escalating(
            self, chain_store, bus_captured):
        with patch.object(MoodTrackerAgent, "_persist_mood_row") as persist, \
             patch.object(MoodTrackerAgent, "_mark_escalation") as mark:
            result = MoodTrackerAgent().act(
                {"user_id": 42, "channel_id": 100, "community_id": 7,
                 "message_id": 1001, "score": -0.5, "primary_mood": "sad",
                 "sentiment": "negative", "window_mean": -0.3,
                 "threshold": -0.4, "analysis": {}, "escalate": False},
                "corr-mood-stable",
            )
        assert result == {"persisted": True}
        assert persist.called
        assert not mark.called
        assert bus_captured == []

    def test_act_publishes_mood_escalation_and_marks_dedupe(
            self, chain_store, bus_captured):
        with patch.object(MoodTrackerAgent, "_persist_mood_row") as persist, \
             patch.object(MoodTrackerAgent, "_mark_escalation") as mark:
            result = MoodTrackerAgent().act(
                {"user_id": 42, "channel_id": 100, "community_id": 7,
                 "message_id": 1001, "score": -0.9, "primary_mood": "sad",
                 "sentiment": "negative", "window_mean": -0.78,
                 "threshold": -0.4, "analysis": {}, "escalate": True},
                "corr-mood-escalate",
            )
        assert result["escalated"] is True
        assert persist.called
        assert mark.called
        topics = [c["topic"] for c in bus_captured]
        assert _bus.TOPIC_MOOD_ESCALATION in topics
        payload = next(c["payload"] for c in bus_captured
                       if c["topic"] == _bus.TOPIC_MOOD_ESCALATION)
        assert payload["correlation_id"] == "corr-mood-escalate"
        assert payload["window_mean"] == -0.78


# ───────────────────────────────────────────────────────────────────
#  TestHandle (end-to-end)
# ───────────────────────────────────────────────────────────────────

class TestMoodTrackerHandle:

    def test_handle_escalates_negative_user(self, chain_store, bus_captured):
        with patch.object(MoodTrackerAgent, "_user_opted_in", return_value=True), \
             patch.object(MoodTrackerAgent, "analyze_message",
                          return_value={"sentiment_score": -0.9,
                                        "primary_mood": "sad",
                                        "sentiment": "negative"}), \
             patch.object(MoodTrackerAgent, "_push_and_recall",
                          return_value=[-0.6, -0.7, -0.8, -0.8, -0.9]), \
             patch.object(MoodTrackerAgent, "_escalation_threshold",
                          return_value=-0.4), \
             patch.object(MoodTrackerAgent, "_recently_escalated",
                          return_value=False), \
             patch.object(MoodTrackerAgent, "_mark_escalation",
                          return_value=None), \
             patch.object(MoodTrackerAgent, "_persist_mood_row",
                          return_value=None):
            MoodTrackerAgent().handle(_msg_event(content="bohot stress hai"))
        acts = chain_store.act_rows_for("mood_tracker")
        assert len(acts) == 1
        assert acts[0]["payload"]["escalate"] is True
        assert any(c["topic"] == _bus.TOPIC_MOOD_ESCALATION
                   for c in bus_captured)

    def test_handle_skips_opted_out_user(self, chain_store, bus_captured):
        with patch.object(MoodTrackerAgent, "_user_opted_in", return_value=False), \
             patch.object(MoodTrackerAgent, "analyze_message") as analyze:
            MoodTrackerAgent().handle(_msg_event())
        # Skip decision still gets logged once.
        rows = chain_store.actions_for("mood_tracker")
        assert len(rows) == 1
        assert rows[0]["decision"] == "skip"
        assert bus_captured == []
        assert not analyze.called, \
            "opted-out skip must short-circuit before analyze_message()"


# ───────────────────────────────────────────────────────────────────
#  TestLearn
# ───────────────────────────────────────────────────────────────────

class TestMoodTrackerLearn:

    def test_learn_negative_lowers_threshold(self, chain_store):
        chain_store.set_state(
            "mood_tracker", "user", 42,
            thresholds={"escalation_threshold": -0.4},
        )
        action_id = chain_store.log_action(
            agent_name="mood_tracker", decision="act", reason="seed",
            correlation_id="learn-neg", user_id=42, channel_id=100,
            payload={"escalate": True},
        )
        MoodTrackerAgent().learn(action_id, "dismissed", weight=2.0)
        st = chain_store.get_state("mood_tracker", "user", 42) or {}
        th = (st.get("thresholds") or {}).get("escalation_threshold")
        assert th is not None and th < -0.4, \
            f"dismissed signal must drop threshold below -0.4, got {th}"
        assert st.get("last_outcome") == "negative"

    def test_learn_positive_nudges_toward_default(self, chain_store):
        chain_store.set_state(
            "mood_tracker", "user", 42,
            thresholds={"escalation_threshold": -0.6},  # drifted low
        )
        action_id = chain_store.log_action(
            agent_name="mood_tracker", decision="act", reason="seed",
            correlation_id="learn-pos", user_id=42, channel_id=100,
            payload={"escalate": True},
        )
        MoodTrackerAgent().learn(action_id, "engaged", weight=1.0)
        st = chain_store.get_state("mood_tracker", "user", 42) or {}
        th = (st.get("thresholds") or {}).get("escalation_threshold")
        assert th is not None
        # engaged nudges +0.02 toward the -0.4 default; should not exceed default.
        assert -0.6 < th <= -0.4 + 1e-9, \
            f"engaged signal must nudge toward default -0.4, got {th}"
