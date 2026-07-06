"""
Per-agent settings-wiring smoke tests
=====================================

These tests exercise the new ``Backend/agents/_settings.py`` helper and
verify that each agent's entry method (the one driven by user-facing
config) actually reads its settings row and short-circuits / shapes the
result accordingly. The goal is broad coverage with shallow assertions —
the per-agent autonomous unit suites already deep-test the rest of the
sense → decide → act pipeline.

We mock ``get_personal_settings`` / ``get_community_settings`` at the
point each agent imports them, so the DB never gets touched. That keeps
this file pure-unit and parallelisable with the existing autonomous-
agent suite.
"""

from __future__ import annotations

from unittest.mock import patch, MagicMock

import pytest


@pytest.fixture
def flask_app_ctx():
    """``jsonify`` requires a Flask app context. Construct a throwaway
    one rather than booting the full app (Redis, DB pool, blueprints).
    """
    from flask import Flask
    app = Flask(__name__)
    with app.app_context():
        yield


# ─────────────────────────────────────────────────────────────────────
# Translator
# ─────────────────────────────────────────────────────────────────────

def test_translator_honors_cache_enabled_false():
    """cache_enabled=false must NOT call _cache_put on a successful translate."""
    from agents.translator import TranslatorAgent

    t = TranslatorAgent()
    with patch("agents.translator.get_personal_settings",
               return_value={'default_target': 'en', 'auto_detect': True,
                             'cache_enabled': False}), \
         patch.object(t, "_cache_put") as cache_put, \
         patch("agents.translator._DEEP_AVAILABLE", True), \
         patch("agents.translator._DeepGoogle") as deep:
        deep.return_value.translate.return_value = "hola"
        result = t.translate("hello", target_language="es", user_id=1)
    assert result['translated_text'] == "hola"
    cache_put.assert_not_called()


def test_translator_picks_up_default_target_when_caller_uses_en():
    """When caller passes the legacy default 'en', user's default_target wins."""
    from agents.translator import TranslatorAgent

    t = TranslatorAgent()
    with patch("agents.translator.get_personal_settings",
               return_value={'default_target': 'ur', 'auto_detect': True,
                             'cache_enabled': True}), \
         patch("agents.translator._DEEP_AVAILABLE", True), \
         patch("agents.translator._DeepGoogle") as deep:
        deep.return_value.translate.return_value = "ہیلو"
        result = t.translate("hello", target_language="en", user_id=1)
    assert result['target_language'] == 'ur'


# ─────────────────────────────────────────────────────────────────────
# Support
# ─────────────────────────────────────────────────────────────────────

def test_support_show_sources_false_returns_empty_list():
    from agents.support import SupportAgent

    s = SupportAgent()
    with patch("agents.support.get_community_settings",
               return_value={'min_score': 2, 'max_docs': 500,
                             'use_gemini_polish': False,
                             'show_sources': False}), \
         patch("agents.support._SKLEARN_AVAILABLE", True), \
         patch.object(s, "_best_match", return_value={
             'id': 1, 'title': 't', 'content': 'answer body', 'score': 0.5,
             'category': 'cat',
         }):
        out = s.ask("what is x?", community_id=42)
    assert out['matched'] is True
    assert out['sources'] == []
    assert out['answer'] == 'answer body'


# ─────────────────────────────────────────────────────────────────────
# Wellness
# ─────────────────────────────────────────────────────────────────────

def test_wellness_auto_check_false_skips_scheduled():
    from agents.wellness import WellnessAgent

    w = WellnessAgent()
    with patch("agents.wellness.get_personal_settings",
               return_value={'auto_check': False, 'break_reminders': True,
                             'check_interval_hours': 1, 'burnout_detection': True}):
        out = w.check_user_wellness(user_id=1, scheduled=True)
    assert out['success'] is True
    assert out.get('skipped') == 'auto_check_disabled'


# ─────────────────────────────────────────────────────────────────────
# Focus
# ─────────────────────────────────────────────────────────────────────

def test_focus_auto_analyze_false_skips_scheduled():
    from agents.focus import FocusAgent

    f = FocusAgent()
    with patch("agents.focus.get_personal_settings",
               return_value={'auto_analyze': False, 'session_reminders': True,
                             'analyze_threshold': 50, 'daily_reports': True}):
        out = f.analyze_focus(channel_id=1, user_id=1, scheduled=True)
    assert out['success'] is False
    assert out.get('skipped') == 'auto_analyze_disabled'


# ─────────────────────────────────────────────────────────────────────
# Engagement
# ─────────────────────────────────────────────────────────────────────

def test_engagement_auto_analyze_false_skips_scheduled():
    from agents.engagement import EngagementAgent

    e = EngagementAgent()
    with patch("agents.engagement.get_community_settings",
               return_value={'auto_analyze': False, 'analysis_interval': 30,
                             'track_threads': True, 'leaderboard': True,
                             'inactivity_alerts': False}):
        out = e.analyze_engagement(channel_id=1, community_id=2, scheduled=True)
    assert out.get('skipped') == 'auto_analyze_disabled'


# ─────────────────────────────────────────────────────────────────────
# Knowledge Builder v2
# ─────────────────────────────────────────────────────────────────────

def test_kb_auto_extract_false_skips_scheduled():
    from agents.knowledge_builder_v2 import KnowledgeBuilderAgent

    kb = KnowledgeBuilderAgent()
    with patch("agents.knowledge_builder_v2.get_community_settings",
               return_value={'auto_extract': False,
                             'extraction_interval_hours': 2,
                             'min_quality_score': 5,
                             'auto_categorize': True}):
        out = kb.extract_knowledge(channel_id=1, community_id=2, scheduled=True)
    assert out.get('skipped') == 'auto_extract_disabled'
    assert out['total_items'] == 0


# ─────────────────────────────────────────────────────────────────────
# Settings-validator unit tests (routes/agents.py)
# ─────────────────────────────────────────────────────────────────────

def test_settings_validator_rejects_unknown_keys(flask_app_ctx):
    # Importing the module-level helper without booting the whole Flask
    # app: route registration is module-level but cheap; we just need
    # _validate_agent_settings.
    from routes.agents import _validate_agent_settings

    coerced, err = _validate_agent_settings(
        'translator', {'default_target': 'en', 'bogus_key': True})
    assert err is not None  # (response, status) tuple
    resp, status = err
    assert status == 400


def test_settings_validator_coerces_bool_strings(flask_app_ctx):
    from routes.agents import _validate_agent_settings

    coerced, err = _validate_agent_settings(
        'translator', {'auto_detect': 'true', 'cache_enabled': '0'})
    assert err is None
    assert coerced == {'auto_detect': True, 'cache_enabled': False}


def test_settings_validator_enforces_int_range(flask_app_ctx):
    from routes.agents import _validate_agent_settings

    coerced, err = _validate_agent_settings(
        'moderation', {'sensitivity': 99})
    assert err is not None
    resp, status = err
    assert status == 400


def test_settings_validator_enforces_enum_choices(flask_app_ctx):
    from routes.agents import _validate_agent_settings

    coerced, err = _validate_agent_settings(
        'assistant', {'reply_style': 'verbose'})  # not in enum
    assert err is not None
    coerced_ok, err_ok = _validate_agent_settings(
        'assistant', {'reply_style': 'detailed'})
    assert err_ok is None
    assert coerced_ok == {'reply_style': 'detailed'}


def test_settings_validator_assistant_no_legacy_tone_key(flask_app_ctx):
    """The plan's earlier matrix mentioned tone/language/proactivity for
    the assistant. The actual schema dropped them — make sure they remain
    rejected (not silently passed through) until they ever come back."""
    from routes.agents import _validate_agent_settings

    coerced, err = _validate_agent_settings(
        'assistant', {'tone': 'formal'})
    assert err is not None
    resp, status = err
    assert status == 400
