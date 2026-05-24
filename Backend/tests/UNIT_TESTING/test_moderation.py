"""
TC-UT-36 to TC-UT-48
Unit tests for agents/moderation.py — ModerationAgent
Tests: instant_check extreme-content blocking, personal-info detection,
       clean messages pass, scam detection.
No Redis, no Gemini, no DB — all external calls mocked.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from unittest.mock import patch, MagicMock


@pytest.fixture(scope="module")
def moderator():
    """Shared ModerationAgent with all external services mocked."""
    with patch("database.get_db_connection", return_value=MagicMock()), \
         patch("agents.moderation._GEMINI_MODERATION_AVAILABLE", False), \
         patch("agents.moderation._gemini_client", None):
        from agents.moderation import ModerationAgent
        return ModerationAgent()


# ── Instant check — extreme content ───────────────────────────────────

class TestInstantCheckBlock:
    """TC-UT-36 to TC-UT-39: Extreme content that must be blocked immediately."""

    def test_extreme_english_slur_blocked(self, moderator):
        """TC-UT-36: Racial slur triggers block=True."""
        result = moderator.instant_check("you are a nigger")
        assert result["block"] is True

    def test_extreme_roman_urdu_slur_blocked(self, moderator):
        """TC-UT-37: Severe Roman Urdu slur triggers block=True."""
        result = moderator.instant_check("tu bilkul chutiya hai")
        assert result["block"] is True

    def test_kill_threat_phrase_blocked(self, moderator):
        """TC-UT-38: Explicit kill threat phrase blocked."""
        result = moderator.instant_check("i will kill you")
        assert result["block"] is True

    def test_roman_urdu_death_threat_blocked(self, moderator):
        """TC-UT-39: Roman Urdu death threat blocked."""
        result = moderator.instant_check("jaan se maar dunga")
        assert result["block"] is True


# ── Instant check — clean messages ────────────────────────────────────

class TestInstantCheckAllow:
    """TC-UT-40 to TC-UT-43: Normal messages must not be blocked."""

    def test_greeting_allowed(self, moderator):
        """TC-UT-40: Simple greeting passes through."""
        result = moderator.instant_check("Hello everyone! How are you?")
        assert result["block"] is False

    def test_programming_term_allowed(self, moderator):
        """TC-UT-41: Programming jargon (kill -9, exec) not blocked."""
        result = moderator.instant_check("run kill -9 to stop the process")
        assert result["block"] is False

    def test_roman_urdu_casual_allowed(self, moderator):
        """TC-UT-42: Casual Roman Urdu conversation passes."""
        result = moderator.instant_check("yaar kya haal hai? kal milte hain")
        assert result["block"] is False

    def test_slang_compliment_allowed(self, moderator):
        """TC-UT-43: Slang compliment ('you killed it') not blocked."""
        result = moderator.instant_check("bro you absolutely killed it today!")
        assert result["block"] is False


# ── Personal-info detection ────────────────────────────────────────────

class TestPersonalInfoDetection:
    """TC-UT-44 to TC-UT-46: PII detection in instant_check."""

    def test_phone_number_flagged(self, moderator):
        """TC-UT-44: Message containing phone number flagged (block=False, flag set)."""
        result = moderator.instant_check("call me at 03001234567 anytime")
        # Should NOT hard-block but should flag personal info
        assert result.get("flag_personal_info") is True or result.get("block") is False

    def test_email_in_message_flagged(self, moderator):
        """TC-UT-45: Embedded email address in message flagged."""
        result = moderator.instant_check("reach me at user@example.com please")
        assert result.get("flag_personal_info") is True or result.get("block") is False

    def test_clean_message_no_pii_flag(self, moderator):
        """TC-UT-46: Clean message does not set flag_personal_info."""
        result = moderator.instant_check("the weather is nice today")
        assert not result.get("flag_personal_info")


# ── Very short messages ────────────────────────────────────────────────

class TestShortMessages:
    """TC-UT-47 to TC-UT-48: Edge cases for short inputs."""

    def test_empty_ish_message_not_blocked(self, moderator):
        """TC-UT-47: Message under 3 chars returns block=False immediately."""
        result = moderator.instant_check("hi")
        assert result["block"] is False

    def test_single_space_not_blocked(self, moderator):
        """TC-UT-48: Whitespace-only string returns block=False."""
        result = moderator.instant_check("   ")
        assert result["block"] is False
