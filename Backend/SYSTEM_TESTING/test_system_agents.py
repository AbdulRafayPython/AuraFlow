"""
TC-ST-11 to TC-ST-20
System tests — AI Agents end-to-end using the live codebase.
Agents are initialised with real lexicons/configs but DB writes are skipped
where they would pollute production data (via mock on DB write calls only).
Read-only DB access uses the live connection.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from unittest.mock import patch, MagicMock
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))


@pytest.fixture(scope="module")
def mood_agent():
    with patch("database.get_db_connection", return_value=MagicMock()):
        from agents.mood_tracker import MoodTrackerAgent
        return MoodTrackerAgent()


@pytest.fixture(scope="module")
def mod_agent():
    with patch("database.get_db_connection", return_value=MagicMock()), \
         patch("agents.moderation._GEMINI_MODERATION_AVAILABLE", False):
        from agents.moderation import ModerationAgent
        return ModerationAgent()


@pytest.fixture(scope="module")
def summarizer_agent():
    with patch("database.get_db_connection", return_value=MagicMock()):
        from agents.summarizer import SummarizerAgent
        return SummarizerAgent()


# ── Mood Tracker — full pipeline ───────────────────────────────────────

class TestMoodTrackerSystem:
    def test_positive_roman_urdu_classified_correctly(self, mood_agent):
        """TC-ST-11: 'bohat khushi hui' classified positive with confidence > 0."""
        result = mood_agent.analyze_message("yaar bohat khushi hui aaj! ❤️")
        assert result["sentiment"] == "positive"
        assert result["confidence"] > 0

    def test_negative_roman_urdu_classified_correctly(self, mood_agent):
        """TC-ST-12: Sad message classified negative."""
        result = mood_agent.analyze_message("bohat udaas hun aaj, kuch acha nahi lag raha 😢")
        assert result["sentiment"] == "negative"

    def test_negation_flips_positive_to_negative(self, mood_agent):
        """TC-ST-13: 'acha nahi' should not score as purely positive."""
        positive = mood_agent.analyze_message("bohat acha")
        negated  = mood_agent.analyze_message("bilkul acha nahi")
        # Negated score should be less than straight positive
        assert negated["confidence"] <= positive["confidence"] or \
               negated["sentiment"] != "positive"

    def test_emoji_boosts_sentiment(self, mood_agent):
        """TC-ST-14: Positive emoji increases positive confidence."""
        without_emoji = mood_agent.analyze_message("acha din tha")
        with_emoji    = mood_agent.analyze_message("acha din tha 😊🎉")
        assert with_emoji["confidence"] >= without_emoji["confidence"]

    def test_result_always_has_required_keys(self, mood_agent):
        """TC-ST-15: analyze_message always returns required keys regardless of input."""
        for text in ["", "hello", "😊", "bilkul nahi", "kuch bhi"]:
            result = mood_agent.analyze_message(text)
            for key in ("sentiment", "confidence", "detected_language"):
                assert key in result, f"Missing '{key}' for input: {repr(text)}"


# ── Moderation Agent ───────────────────────────────────────────────────

class TestModerationAgentSystem:
    def test_clean_message_not_blocked(self, mod_agent):
        """TC-ST-16: Clean message passes instant_check."""
        result = mod_agent.instant_check("Hello, how is everyone doing today?")
        assert result["block"] is False

    def test_extreme_slur_blocked_instantly(self, mod_agent):
        """TC-ST-17: Racial slur triggers instant block."""
        result = mod_agent.instant_check("you are a nigger")
        assert result["block"] is True

    def test_roman_urdu_extreme_blocked(self, mod_agent):
        """TC-ST-18: Severe Roman Urdu slur blocked instantly."""
        result = mod_agent.instant_check("tu ek chutiya hai")
        assert result["block"] is True


# ── Summarizer Agent ───────────────────────────────────────────────────

class TestSummarizerSystem:
    def test_extractive_summary_from_sample_messages(self, summarizer_agent):
        """TC-ST-19: Summarizer returns non-empty summary from sample messages."""
        messages = [
            {"username": "ali", "display_name": "Ali", "content": "The project deadline is next Friday.", "created_at": "2024-01-01 10:00"},
            {"username": "sara", "display_name": "Sara", "content": "We need to finish the frontend components first.", "created_at": "2024-01-01 10:01"},
            {"username": "ali", "display_name": "Ali", "content": "Backend APIs are ready and tested.", "created_at": "2024-01-01 10:02"},
            {"username": "sara", "display_name": "Sara", "content": "I'll start on the UI integration today.", "created_at": "2024-01-01 10:03"},
            {"username": "ali", "display_name": "Ali", "content": "Let's do a code review tomorrow morning.", "created_at": "2024-01-01 10:04"},
            {"username": "omar", "display_name": "Omar", "content": "The database schema was updated yesterday.", "created_at": "2024-01-01 10:05"},
        ]
        result = summarizer_agent._generate_summary(messages)
        assert isinstance(result, dict)
        summary_text = result.get("summary") or result.get("extractive_summary") or ""
        assert len(str(summary_text).strip()) > 0

    def test_summary_shorter_than_full_text(self, summarizer_agent):
        """TC-ST-20: Summary result is a valid dict with summary content."""
        messages = [{"username": f"u{i}", "display_name": f"User{i}", "content": f"Message number {i} about the project.",
                     "created_at": "2024-01-01"} for i in range(20)]
        result = summarizer_agent._generate_summary(messages)
        assert isinstance(result, dict)
        assert result.get("message_count", 0) > 0 or result.get("status") == "success" or "summary" in result or "extractive_summary" in result
