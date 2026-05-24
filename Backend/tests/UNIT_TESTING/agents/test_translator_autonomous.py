"""
TC-UT-AGT-TRANS-01 … 07
=======================
Per-agent unit tests for `agents/translator.py` — `TranslatorAgent`
autonomous hooks (Phase 1.1).

Translator publishes `lang.detected` but never auto-posts translations
in Phase 1, so we exercise sense/decide/act + the 5s cooldown.
"""
from __future__ import annotations

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))))

from unittest.mock import patch

import pytest

from agents.translator import TranslatorAgent
from agents import event_bus as _bus


def _msg(content="hello there", channel_id=100, message_id=1):
    return {
        "topic": _bus.TOPIC_MSG_CREATED,
        "content": content,
        "channel_id": channel_id, "community_id": 7,
        "user_id": 42, "message_id": message_id,
    }


class TestTranslatorSense:

    def test_sense_drops_short_content(self, chain_store):
        assert TranslatorAgent().sense(_msg(content="hi")) is None

    def test_sense_drops_slash_command(self, chain_store):
        assert TranslatorAgent().sense(_msg(content="/translate hello")) is None

    def test_sense_passes_long_content(self, chain_store):
        obs = TranslatorAgent().sense(_msg(content="hola amigos"))
        assert obs is not None
        assert obs["content"].startswith("hola")
        assert obs["scope_type"] == "channel"


class TestTranslatorDecide:

    def _obs(self, content="bonjour tout le monde"):
        return {
            "content": content, "channel_id": 100, "community_id": 7,
            "user_id": 42, "message_id": 1,
            "scope_type": "channel", "scope_id": 100,
        }

    def test_decide_skips_english(self, chain_store):
        with patch.object(TranslatorAgent, "detect_language",
                          return_value={"language": "en", "confidence": 0.9}):
            decision, _, reason = TranslatorAgent().decide(self._obs())
        assert decision == "skip"
        assert reason == "english_message"

    def test_decide_skips_low_confidence(self, chain_store):
        with patch.object(TranslatorAgent, "detect_language",
                          return_value={"language": "fr", "confidence": 0.2}):
            decision, _, reason = TranslatorAgent().decide(self._obs())
        assert decision == "skip"
        assert "low_confidence" in reason

    def test_decide_acts_on_non_english(self, chain_store):
        with patch.object(TranslatorAgent, "detect_language",
                          return_value={"language": "ur", "confidence": 0.7,
                                        "romanized": True}):
            decision, payload, reason = TranslatorAgent().decide(self._obs())
        assert decision == "act"
        assert payload["language"] == "ur"
        assert payload["romanized"] is True
        assert "detected_ur" in reason


class TestTranslatorAct:

    def test_act_publishes_lang_detected(self, chain_store, bus_captured):
        TranslatorAgent().act(
            {"language": "fr", "confidence": 0.8, "romanized": False,
             "message_id": 1, "channel_id": 100, "community_id": 7,
             "user_id": 42},
            "corr-trans-1",
        )
        topics = [c["topic"] for c in bus_captured]
        assert _bus.TOPIC_LANG_DETECTED in topics
        payload = next(c["payload"] for c in bus_captured
                       if c["topic"] == _bus.TOPIC_LANG_DETECTED)
        assert payload["language"] == "fr"
        assert payload["correlation_id"] == "corr-trans-1"


class TestTranslatorHandle:

    def test_handle_end_to_end_publishes(self, chain_store, bus_captured):
        with patch.object(TranslatorAgent, "detect_language",
                          return_value={"language": "fr", "confidence": 0.8}):
            TranslatorAgent().handle(_msg(content="bonjour les amis"))
        acts = chain_store.act_rows_for("translator")
        assert len(acts) == 1
        assert any(c["topic"] == _bus.TOPIC_LANG_DETECTED for c in bus_captured)

    def test_handle_cooldown_blocks_second_publish(self, chain_store, bus_captured):
        """5-second per-channel cooldown drops the second emit."""
        with patch.object(TranslatorAgent, "detect_language",
                          return_value={"language": "fr", "confidence": 0.8}):
            a = TranslatorAgent()
            a.handle(_msg(content="bonjour les amis", message_id=1))
            a.handle(_msg(content="bonjour encore", message_id=2))
        # Both decisions logged; only one publish (cooldown gates act()).
        assert len(chain_store.act_rows_for("translator")) == 2
        publishes = [c for c in bus_captured
                     if c["topic"] == _bus.TOPIC_LANG_DETECTED]
        assert len(publishes) == 1, \
            "5s per-channel cooldown must block the second lang.detected"
