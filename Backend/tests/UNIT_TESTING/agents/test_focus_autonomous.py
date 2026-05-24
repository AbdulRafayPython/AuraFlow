"""
TC-UT-AGT-FOCUS-01 … 08
=======================
Per-agent unit tests for `agents/focus.py` — `FocusAgent` autonomous
hooks (Phase 2.3).

Focus tracks a 12-message rolling window per channel and computes the
Jaccard overlap between the oldest and newest halves. Tests assemble
the window by calling `sense()` 12 times with controlled keyword sets,
then exercise `decide()` / `act()` / `learn()`.
"""
from __future__ import annotations

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))))

from unittest.mock import patch

import pytest

from agents.focus import FocusAgent
from agents import event_bus as _bus


def _msg(content="hello world", channel_id=100, message_id=1, **extras):
    base = {
        "topic": _bus.TOPIC_MSG_CREATED,
        "content": content,
        "channel_id": channel_id, "community_id": 7,
        "user_id": 42, "message_id": message_id,
    }
    base.update(extras)
    return base


def _fill_window(agent, channel_id, *, old_kws, new_kws):
    """Drive sense() 12 times so the channel's deque is full, returning
    the last observation. The first 6 messages contribute `old_kws`, the
    last 6 contribute `new_kws`. We patch `text_processor.extract_keywords`
    per call so each message yields a distinct keyword set."""
    obs = None
    halves = [old_kws] * 6 + [new_kws] * 6
    for i, kws in enumerate(halves):
        with patch.object(agent.text_processor, "extract_keywords",
                          return_value=list(kws)):
            obs = agent.sense(_msg(content="msg " + "x" * 10,
                                   channel_id=channel_id,
                                   message_id=i + 1))
    return obs


class TestFocusSense:

    def test_sense_drops_short_or_slash(self, chain_store):
        a = FocusAgent()
        assert a.sense(_msg(content="hi")) is None
        assert a.sense(_msg(content="/help me out")) is None

    def test_sense_returns_none_until_window_fills(self, chain_store):
        a = FocusAgent()
        # First 11 messages → window incomplete → sense returns None.
        for i in range(11):
            with patch.object(a.text_processor, "extract_keywords",
                              return_value=["docker", "image"]):
                obs = a.sense(_msg(content="topic msg " + "x" * 5,
                                   channel_id=100, message_id=i + 1))
            assert obs is None, f"window of {i+1} should not emit yet"
        # 12th message completes the window.
        with patch.object(a.text_processor, "extract_keywords",
                          return_value=["docker", "image"]):
            obs = a.sense(_msg(content="topic msg " + "x" * 5,
                               channel_id=100, message_id=12))
        assert obs is not None
        assert obs["channel_id"] == 100
        assert len(obs["snapshot"]) == 12


class TestFocusDecide:

    def test_decide_skips_when_keyword_set_empty(self, chain_store):
        a = FocusAgent()
        # Build an observation where both halves are empty.
        obs = {"snapshot": [{"kws": set(), "ts": 0, "msg_id": i}
                            for i in range(12)],
               "channel_id": 100, "community_id": 7,
               "scope_type": "channel", "scope_id": 100}
        decision, _, reason = a.decide(obs)
        assert decision == "skip"
        assert reason == "empty_keyword_set"

    def test_decide_defers_when_overlap_high(self, chain_store):
        a = FocusAgent()
        with patch.object(FocusAgent, "_drift_threshold", return_value=0.25):
            obs = _fill_window(a, channel_id=200,
                               old_kws={"docker", "image"},
                               new_kws={"docker", "image"})  # identical
            decision, _, reason = a.decide(obs)
        assert decision == "defer"
        assert "above" in reason

    def test_decide_acts_when_overlap_below_threshold(self, chain_store):
        a = FocusAgent()
        with patch.object(FocusAgent, "_drift_threshold", return_value=0.25):
            obs = _fill_window(a, channel_id=300,
                               old_kws={"docker", "container"},
                               new_kws={"weekend", "movie"})  # disjoint
            decision, payload, reason = a.decide(obs)
        assert decision == "act"
        assert payload["jaccard"] == 0.0
        assert set(payload["new_topics"]) == {"weekend", "movie"}
        assert set(payload["old_topics"]) == {"docker", "container"}
        assert "drift_jaccard" in reason


class TestFocusAct:

    def test_act_publishes_focus_drift(self, chain_store, bus_captured):
        result = FocusAgent().act(
            {"channel_id": 100, "community_id": 7, "user_id": 42,
             "message_id": 1, "jaccard": 0.0,
             "old_topics": ["docker"], "new_topics": ["movie"], "shared": []},
            "corr-focus-1",
        )
        assert result["published"] is True
        topics = [c["topic"] for c in bus_captured]
        assert _bus.TOPIC_FOCUS_DRIFT in topics
        payload = next(c["payload"] for c in bus_captured
                       if c["topic"] == _bus.TOPIC_FOCUS_DRIFT)
        assert payload["correlation_id"] == "corr-focus-1"
        assert payload["new_topics"] == ["movie"]


class TestFocusHandle:

    def test_handle_drift_end_to_end(self, chain_store, bus_captured):
        a = FocusAgent()
        # Prime the deque so the OLDER half (first 6) has one topic and
        # the NEWER half (last 6) has a different topic. Each of the
        # first 6 messages contributes {docker, container}; the last 6
        # contribute {weekend, movie}. Jaccard = 0 → drift.
        old_kws = ["docker", "container"]
        new_kws = ["weekend", "movie"]
        for i in range(11):
            kws = old_kws if i < 6 else new_kws
            with patch.object(a.text_processor, "extract_keywords",
                              return_value=kws):
                a.sense(_msg(content="topic msg " + "x" * 5,
                             channel_id=400, message_id=i + 1))
        # The 12th message is the final newer-half entry; handle() runs
        # the full sense → decide → act chain on it.
        with patch.object(a.text_processor, "extract_keywords",
                          return_value=new_kws), \
             patch.object(FocusAgent, "_drift_threshold", return_value=0.25):
            a.handle(_msg(content="topic msg " + "x" * 5,
                          channel_id=400, message_id=12))
        # We get exactly one act row for this channel and one publish.
        acts = chain_store.act_rows_for("focus")
        assert len(acts) == 1
        assert any(c["topic"] == _bus.TOPIC_FOCUS_DRIFT for c in bus_captured)


class TestFocusLearn:

    def test_learn_negative_lowers_drift_threshold(self, chain_store):
        chain_store.set_state(
            "focus", "channel", 100,
            thresholds={"drift_threshold": 0.25},
        )
        action_id = chain_store.log_action(
            agent_name="focus", decision="act", reason="seed",
            correlation_id="learn-focus-neg", channel_id=100, community_id=7,
            payload={"jaccard": 0.0},
        )
        FocusAgent().learn(action_id, "dismissed", weight=2.0)
        st = chain_store.get_state("focus", "channel", 100) or {}
        dt = (st.get("thresholds") or {}).get("drift_threshold")
        assert dt is not None and dt < 0.25, \
            f"dismissed must lower drift_threshold below 0.25 (stricter), got {dt}"
        assert dt >= 0.05, "must respect floor of 0.05"
