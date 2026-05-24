"""
TC-UT-AGT-AUTOMSG-01 … 08
=========================
Per-agent unit tests for `agents/auto_message.py` — `AutoMessageAgent`
autonomous hooks (Phase 1.3).

`act()` posts via the lazy `from routes.sockets import _post_ai_bot_message`
helper. We don't exercise that path here — we patch it out and verify
the agent picks the right template arm and reports `posted=True`.
"""
from __future__ import annotations

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))))

import types
from unittest.mock import patch, MagicMock

import pytest

from agents.auto_message import AutoMessageAgent
from agents import event_bus as _bus


# Pre-register a fake `routes.sockets` so the lazy import in act() resolves.
_fake_sockets = types.ModuleType("routes.sockets")
_fake_sockets._post_ai_bot_message = MagicMock(return_value=None)
sys.modules.setdefault("routes.sockets", _fake_sockets)


def _join_event(community_id=7, user_id=42, first_channel_id=100):
    return {
        "topic": _bus.TOPIC_USER_JOINED,
        "community_id": community_id,
        "user_id": user_id,
        "username": "tester",
        "first_channel_id": first_channel_id,
        "correlation_id": f"join-{user_id}-{community_id}",
    }


class TestAutoMessageSense:

    def test_sense_requires_community_and_user(self, chain_store):
        a = AutoMessageAgent()
        assert a.sense({"topic": _bus.TOPIC_USER_JOINED,
                        "community_id": 7}) is None
        assert a.sense({"topic": _bus.TOPIC_USER_JOINED,
                        "user_id": 42}) is None

    def test_sense_passes_with_required_fields(self, chain_store):
        obs = AutoMessageAgent().sense(_join_event())
        assert obs is not None
        assert obs["user_id"] == 42
        assert obs["community_id"] == 7
        assert obs["scope_type"] == "community"


class TestAutoMessageDecide:

    def test_decide_skips_without_default_channel(self, chain_store):
        decision, _, reason = AutoMessageAgent().decide(
            {"community_id": 7, "user_id": 42, "username": "tester",
             "first_channel_id": None})
        assert decision == "skip"
        assert reason == "no_default_channel"

    def test_decide_acts_and_carries_template_idx(self, chain_store):
        with patch.object(AutoMessageAgent, "_pick_template_index",
                          return_value=1):
            decision, payload, reason = AutoMessageAgent().decide({
                "community_id": 7, "user_id": 42, "username": "tester",
                "first_channel_id": 100,
            })
        assert decision == "act"
        assert payload["template_idx"] == 1
        assert "welcome_template_1" in reason


class TestAutoMessageAct:

    def test_act_posts_via_sockets_helper(self, chain_store):
        # Templates come from the lexicon; we patch _templates to be
        # deterministic and _community_name to skip the DB lookup.
        with patch.object(AutoMessageAgent, "_templates",
                          return_value=["Welcome to {community}, {user}!"]), \
             patch.object(AutoMessageAgent, "_community_name",
                          return_value="AuraFlow"), \
             patch("routes.sockets._post_ai_bot_message") as post:
            result = AutoMessageAgent().act(
                {"community_id": 7, "user_id": 42, "username": "tester",
                 "first_channel_id": 100, "template_idx": 0},
                "corr-auto-1",
            )
        assert result["posted"] is True
        assert result["template_idx"] == 0
        post.assert_called_once()
        args, kwargs = post.call_args
        # _post_ai_bot_message(channel_id, user_id, text, author=...)
        assert args[0] == 100
        assert args[1] == 42
        assert "AuraFlow" in args[2] and "tester" in args[2]


class TestAutoMessageHandle:

    def test_handle_end_to_end_logs_act(self, chain_store):
        with patch.object(AutoMessageAgent, "_pick_template_index",
                          return_value=0), \
             patch.object(AutoMessageAgent, "_templates",
                          return_value=["Welcome to {community}, {user}!"]), \
             patch.object(AutoMessageAgent, "_community_name",
                          return_value="AuraFlow"), \
             patch("routes.sockets._post_ai_bot_message"):
            AutoMessageAgent().handle(_join_event())
        acts = chain_store.act_rows_for("auto_message")
        assert len(acts) == 1
        assert acts[0]["payload"]["template_idx"] == 0


class TestAutoMessageLearn:

    def test_learn_positive_credits_chosen_template(self, chain_store):
        action_id = chain_store.log_action(
            agent_name="auto_message", decision="act", reason="seed",
            correlation_id="learn-auto-pos",
            community_id=7, user_id=42, channel_id=100,
            payload={"template_idx": 2},
        )
        with patch.object(AutoMessageAgent, "_payload_for",
                          return_value={"template_idx": 2}):
            AutoMessageAgent().learn(action_id, "engaged", weight=1.5)
        st = chain_store.get_state("auto_message", "community", 7) or {}
        rewards = (st.get("thresholds") or {}).get("template_rewards") or {}
        assert rewards.get("2", 0) > 0, \
            f"engaged signal must credit template arm 2, got {rewards}"

    def test_learn_negative_does_not_credit(self, chain_store):
        """auto_message's override only bumps on positive/engaged; other
        signals fall through to the default counter (which we don't
        assert on here)."""
        action_id = chain_store.log_action(
            agent_name="auto_message", decision="act", reason="seed",
            correlation_id="learn-auto-neg",
            community_id=7, user_id=42, channel_id=100,
            payload={"template_idx": 2},
        )
        with patch.object(AutoMessageAgent, "_payload_for",
                          return_value={"template_idx": 2}):
            AutoMessageAgent().learn(action_id, "dismissed", weight=1.0)
        st = chain_store.get_state("auto_message", "community", 7) or {}
        rewards = (st.get("thresholds") or {}).get("template_rewards") or {}
        assert rewards.get("2", 0) == 0, \
            f"dismissed must NOT credit template arm, got {rewards}"
