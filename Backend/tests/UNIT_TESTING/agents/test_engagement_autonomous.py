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

from unittest.mock import patch, MagicMock

import pytest

from agents.engagement import EngagementAgent
from agents import event_bus as _bus


def _fake_conn(lastrowid=42):
    """Connection whose cursor() context-manager yields a cursor with a fixed
    lastrowid. Mirrors the conftest fake-db pattern."""
    cur = MagicMock()
    cur.lastrowid = lastrowid
    cur.__enter__ = lambda s: s
    cur.__exit__ = MagicMock(return_value=False)
    conn = MagicMock()
    conn.cursor.return_value = cur
    return conn, cur


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
        # act() now POSTS real content into the channel; stub the DB write
        # so the unit test exercises only the decision/emit contract.
        with patch.object(EngagementAgent, "_suggest_conversation_starter",
                          return_value="What's everyone working on today?"), \
             patch.object(EngagementAgent, "_post_as_ai_bot",
                          return_value={"posted": True, "message_id": 1,
                                        "kind": "poll"}):
            result = EngagementAgent().act(
                {"channel_id": 100, "community_id": 7, "bucket": 60,
                 "silent_minutes": 60, "category": "casual"},
                "corr-eng-1",
            )
        assert result["emitted"] is True
        assert result["category"] == "casual"
        # With _post_as_ai_bot stubbed, the only socket emit is the nudge.
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
                          return_value="Quick share: one win today."), \
             patch.object(EngagementAgent, "_post_as_ai_bot",
                          return_value={"posted": True, "message_id": 1,
                                        "kind": "pack"}):
            EngagementAgent().handle(_silent_event(bucket=240))
        acts = chain_store.act_rows_for("engagement")
        assert len(acts) == 1
        assert acts[0]["payload"]["category"] == "icebreaker"
        # _post_as_ai_bot is stubbed, so the lone emit is the dashboard nudge.
        assert socketio_emits.call_count == 1


class TestEngagementCards:
    """TC-UT-AGT-ENG-09 … 15 — structured engagement cards."""

    def test_build_card_starter(self):
        with patch.object(EngagementAgent, "_suggest_conversation_starter",
                          return_value="What are you building?"):
            built = EngagementAgent()._build_card_for("starter")
        assert built["text"] == "What are you building?"
        assert built["card"] == {"kind": "starter",
                                 "text": "What are you building?"}

    def test_build_card_poll_has_question_and_options(self):
        built = EngagementAgent()._build_card_for("poll")
        assert built is not None
        card = built["card"]
        assert card["kind"] == "poll"
        assert isinstance(card["question"], str) and card["question"]
        assert isinstance(card["options"], list) and len(card["options"]) >= 2

    def test_build_card_icebreaker_has_title(self):
        card = EngagementAgent()._build_card_for("icebreaker")["card"]
        assert card["kind"] == "icebreaker"
        assert card["title"]
        assert isinstance(card["questions"], list)

    def test_build_card_challenge_has_title(self):
        card = EngagementAgent()._build_card_for("challenge")["card"]
        assert card["kind"] == "challenge"
        assert card["title"]

    def test_pack_posts_three_separate_cards(self):
        captured = []

        def fake_post(self, text, channel_id, community_id=None, card=None):
            captured.append(card)
            return {"posted": True, "message_id": len(captured), "card": card}

        with patch.object(EngagementAgent, "_post_as_ai_bot", new=fake_post):
            res = EngagementAgent().post_engagement_content(
                100, 7, kind="pack")
        assert res["posted"] is True
        assert len(res["items"]) == 3
        assert [c["kind"] for c in captured] == ["starter", "poll", "icebreaker"]

    def test_single_poll_posts_one_card(self):
        captured = []

        def fake_post(self, text, channel_id, community_id=None, card=None):
            captured.append(card)
            return {"posted": True, "message_id": 1, "card": card}

        with patch.object(EngagementAgent, "_post_as_ai_bot", new=fake_post):
            res = EngagementAgent().post_engagement_content(
                100, 7, kind="poll")
        assert len(res["items"]) == 1
        assert captured[0]["kind"] == "poll"

    def test_post_as_ai_bot_persists_and_emits_card(self, socketio_emits):
        conn, cur = _fake_conn(lastrowid=99)
        card = {"kind": "poll", "question": "Q?", "options": ["a", "b"]}
        with patch("agents.engagement.get_db_connection", return_value=conn):
            res = EngagementAgent()._post_as_ai_bot("text", 100, 7, card=card)
        assert res["posted"] is True
        assert res["message_id"] == 99
        assert res["card"] == card
        # Two INSERTs: the message row + the engagement_cards row.
        insert_calls = [c for c in cur.execute.call_args_list
                        if "INSERT INTO" in c.args[0]]
        assert any("engagement_cards" in c.args[0] for c in insert_calls)
        # The socket payload carries the card so the frontend can render it.
        emit_payload = socketio_emits.call_args.args[1]
        assert emit_payload["card"] == card
        assert socketio_emits.call_args.kwargs["room"] == "channel_100"


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
