"""
TC-UT-AGT-ASSIST-01 … 07
========================
Per-agent unit tests for `agents/assistant.py` — `AssistantAgent`
autonomous hooks (Phase 1.2).

Assistant fires on explicit `/ask` or `@assistant` triggers. We patch
`ask()`, `_recall_memory`, `_append_memory`, and the lazy sockets helper
so the test never touches Redis, Gemini, or the DB.
"""
from __future__ import annotations

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))))

import types
from unittest.mock import patch, MagicMock

import pytest

from agents.assistant import AssistantAgent
from agents import event_bus as _bus


# Stub routes.sockets so the lazy import in act() resolves cleanly even
# in the absence of the Flask app.
_fake_sockets = types.ModuleType("routes.sockets")
_fake_sockets._post_ai_bot_message = MagicMock(return_value=None)
sys.modules.setdefault("routes.sockets", _fake_sockets)


def _msg(content="/ask what is auraflow?", channel_id=100, message_id=1):
    return {
        "topic": _bus.TOPIC_MSG_CREATED,
        "content": content,
        "channel_id": channel_id, "community_id": 7,
        "user_id": 42, "message_id": message_id,
    }


class TestAssistantSense:

    def test_sense_drops_non_trigger(self, chain_store):
        assert AssistantAgent().sense(_msg(content="just chatting here")) is None

    def test_sense_passes_slash_ask(self, chain_store):
        obs = AssistantAgent().sense(_msg(content="/ask what is the meaning?"))
        assert obs is not None
        # Trigger is stripped before the question reaches ask().
        assert "/ask" not in obs["question"]
        assert "meaning" in obs["question"]

    def test_sense_passes_at_mention(self, chain_store):
        obs = AssistantAgent().sense(_msg(content="@assistant explain react"))
        assert obs is not None
        assert "@assistant" not in obs["question"]
        assert "react" in obs["question"]

    def test_sense_drops_trigger_with_no_question(self, chain_store):
        # "/ask" with nothing after it → empty question → skip.
        assert AssistantAgent().sense(_msg(content="/ask")) is None


class TestAssistantDecide:

    def test_decide_always_acts(self, chain_store):
        decision, payload, reason = AssistantAgent().decide({
            "question": "explain X", "channel_id": 100,
            "community_id": 7, "user_id": 42, "message_id": 1,
        })
        assert decision == "act"
        assert reason == "explicit_invocation"


class TestAssistantAct:

    def test_act_posts_reply_via_sockets(self, chain_store):
        with patch.object(AssistantAgent, "_recall_memory", return_value=[]), \
             patch.object(AssistantAgent, "_append_memory", return_value=None), \
             patch.object(AssistantAgent, "ask",
                          return_value={"reply": "Here's an explanation.",
                                        "source": "gemini"}), \
             patch("routes.sockets._post_ai_bot_message") as post:
            result = AssistantAgent().act(
                {"question": "what is auraflow?", "channel_id": 100,
                 "community_id": 7, "user_id": 42, "message_id": 1},
                "corr-asst-1",
            )
        assert result["posted"] is True
        assert result["source"] == "gemini"
        post.assert_called_once()
        # _post_ai_bot_message(channel_id, user_id, text, author="Assistant")
        args, kwargs = post.call_args
        assert args[0] == 100
        assert args[1] == 42
        assert args[2] == "Here's an explanation."
        assert kwargs.get("author") == "Assistant"

    def test_act_handles_empty_reply(self, chain_store):
        with patch.object(AssistantAgent, "_recall_memory", return_value=[]), \
             patch.object(AssistantAgent, "_append_memory", return_value=None), \
             patch.object(AssistantAgent, "ask",
                          return_value={"reply": "", "source": "fallback"}), \
             patch("routes.sockets._post_ai_bot_message") as post:
            result = AssistantAgent().act(
                {"question": "?", "channel_id": 100, "community_id": 7,
                 "user_id": 42, "message_id": 1},
                "corr-asst-2",
            )
        assert result["posted"] is False
        post.assert_not_called()


class TestAssistantHandle:

    def test_handle_end_to_end(self, chain_store):
        with patch.object(AssistantAgent, "_recall_memory", return_value=[]), \
             patch.object(AssistantAgent, "_append_memory", return_value=None), \
             patch.object(AssistantAgent, "ask",
                          return_value={"reply": "Sure.", "source": "gemini"}), \
             patch("routes.sockets._post_ai_bot_message"):
            AssistantAgent().handle(_msg(content="/ask explain auraflow"))
        acts = chain_store.act_rows_for("assistant")
        assert len(acts) == 1
        assert acts[0]["payload"]["question"] == "explain auraflow"
