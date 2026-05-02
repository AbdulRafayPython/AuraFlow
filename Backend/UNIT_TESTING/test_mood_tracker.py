"""
TC-UT-19 to TC-UT-32
Unit tests for agents/mood_tracker.py — MoodTrackerAgent
Tests: normalization, negation detection, emotion detection, mood classification.
DB calls are mocked — no live database required.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from unittest.mock import patch, MagicMock


# Patch get_db_connection before importing the agent so the module-level
# code does not attempt a real DB connection.
@pytest.fixture(autouse=True)
def mock_db(monkeypatch):
    mock_conn = MagicMock()
    mock_conn.__enter__ = lambda s: s
    mock_conn.__exit__ = MagicMock(return_value=False)
    with patch("database.get_db_connection", return_value=mock_conn):
        yield mock_conn


@pytest.fixture(scope="module")
def tracker():
    """Shared MoodTrackerAgent instance for all tests in this module."""
    with patch("database.get_db_connection", return_value=MagicMock()):
        from agents.mood_tracker import MoodTrackerAgent
        return MoodTrackerAgent()


# ── Normalisation ──────────────────────────────────────────────────────

class TestNormalisation:
    """TC-UT-19 to TC-UT-21: Roman Urdu spelling normalisation."""

    def test_repeated_vowels_collapsed(self, tracker):
        """TC-UT-19: Repeated vowel sequences normalised (e.g., 'aaa' -> 'a')."""
        normalised = tracker._normalize_text("bohaaat acha")
        assert "aaa" not in normalised

    def test_repeated_exclamation_collapsed(self, tracker):
        """TC-UT-20: Multiple '!' collapsed to single '!'."""
        normalised = tracker._normalize_text("woohoo!!!")
        assert "!!!" not in normalised

    def test_repeated_question_collapsed(self, tracker):
        """TC-UT-21: Multiple '?' collapsed to single '?'."""
        normalised = tracker._normalize_text("kya???")
        assert "???" not in normalised


# ── Emotion Detection ──────────────────────────────────────────────────

class TestEmotionDetection:
    """TC-UT-22 to TC-UT-26: Specific emotion keyword detection."""

    def test_joy_keyword_detected(self, tracker):
        """TC-UT-22: 'khushi' triggers joy emotion."""
        emotions = tracker._detect_emotions("bohat khushi hui aaj")
        assert "joy" in emotions

    def test_sadness_keyword_detected(self, tracker):
        """TC-UT-23: 'udaas' triggers sadness emotion."""
        emotions = tracker._detect_emotions("main bohat udaas hun")
        assert "sadness" in emotions

    def test_anger_keyword_detected(self, tracker):
        """TC-UT-24: 'gussa' triggers anger emotion."""
        emotions = tracker._detect_emotions("mujhe bohat gussa aa raha hai")
        assert "anger" in emotions

    def test_love_keyword_detected(self, tracker):
        """TC-UT-25: 'pyar' triggers love emotion."""
        emotions = tracker._detect_emotions("tumse pyar hai mujhe")
        assert "love" in emotions

    def test_no_keywords_returns_neutral(self, tracker):
        """TC-UT-26: Generic text without emotion keywords returns ['neutral']."""
        emotions = tracker._detect_emotions("kal milte hain theek hai")
        assert emotions == ["neutral"]


# ── Mood Classification ────────────────────────────────────────────────

class TestMoodClassification:
    """TC-UT-27 to TC-UT-32: Mood label mapping from sentiment + emotions."""

    def test_high_confidence_positive_maps_to_happy(self, tracker):
        """TC-UT-27: positive sentiment + confidence > 0.7 → 'happy'."""
        mood = tracker._get_mood_from_sentiment("positive", 0.9, ["neutral"])
        assert mood == "happy"

    def test_low_confidence_positive_maps_to_content(self, tracker):
        """TC-UT-28: positive sentiment + confidence <= 0.7 → 'content'."""
        mood = tracker._get_mood_from_sentiment("positive", 0.5, ["neutral"])
        assert mood == "content"

    def test_high_confidence_negative_maps_to_sad(self, tracker):
        """TC-UT-29: negative sentiment + confidence > 0.7 → 'sad'."""
        mood = tracker._get_mood_from_sentiment("negative", 0.85, ["neutral"])
        assert mood == "sad"

    def test_neutral_sentiment_maps_to_neutral(self, tracker):
        """TC-UT-30: neutral sentiment with no emotions → 'neutral'."""
        mood = tracker._get_mood_from_sentiment("neutral", 0.5, ["neutral"])
        assert mood == "neutral"

    def test_joy_emotion_maps_to_happy(self, tracker):
        """TC-UT-31: joy emotion overrides neutral sentiment → 'happy'."""
        mood = tracker._get_mood_from_sentiment("neutral", 0.5, ["joy"])
        assert mood == "happy"

    def test_anger_emotion_maps_to_angry(self, tracker):
        """TC-UT-32: anger emotion → 'angry'."""
        mood = tracker._get_mood_from_sentiment("negative", 0.7, ["anger"])
        assert mood == "angry"


# ── Full analyze_message pipeline ─────────────────────────────────────

class TestAnalyzeMessage:
    """TC-UT-33 to TC-UT-35: End-to-end analyze_message() (no DB save)."""

    def test_positive_roman_urdu_message(self, tracker):
        """TC-UT-33: Clearly positive Roman Urdu message classified positive."""
        result = tracker.analyze_message("Yaar aaj bahut maza aaya! Bohat khushi hui! 😊")
        assert result["sentiment"] in ("positive",)
        assert result["confidence"] > 0

    def test_negative_roman_urdu_message(self, tracker):
        """TC-UT-34: Clearly negative Roman Urdu message classified negative."""
        result = tracker.analyze_message("Bohat udaas hun aaj. Kuch theek nahi lag raha 😢💔")
        assert result["sentiment"] in ("negative",)

    def test_analyze_message_returns_required_keys(self, tracker):
        """TC-UT-35: analyze_message() always returns required keys."""
        result = tracker.analyze_message("hello world")
        # Core keys present in all return paths
        for key in ("sentiment", "confidence", "detected_language", "detected_words"):
            assert key in result, f"Missing key: {key}"
