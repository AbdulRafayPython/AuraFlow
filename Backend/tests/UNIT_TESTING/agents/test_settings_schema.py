"""
Agent settings: one definition (agents/settings_schema.py) for the form, the checks and the defaults.

OLD_VALIDATORS is a copy of the hand-written checks routes/agents.py used before the schema existed.
The schema must produce exactly the same checks, so building the form from it changes nothing the
server accepts. (The Assistant's entry was removed with the Assistant in L5f.)
"""

from __future__ import annotations

import importlib

import pytest
from flask import Flask
from unittest.mock import patch

from agents import settings_schema as ss
from routes import agents as agents_routes

OLD_VALIDATORS = {
    'moderation': {
        'auto_filter':         (bool, None, None, None),
        'sensitivity':         (int, 1, 10, None),
        'severity_threshold':  (str, None, None, ('low', 'medium', 'high', 'critical')),
        'notify_admins':       (bool, None, None, None),
        'roman_urdu_support':  (bool, None, None, None),
        'max_warnings':        (int, 1, 10, None),
    },
    'engagement': {
        'auto_analyze':        (bool, None, None, None),
        'analysis_interval':   (int, 10, 120, None),
        'track_threads':       (bool, None, None, None),
        'leaderboard':         (bool, None, None, None),
        'inactivity_alerts':   (bool, None, None, None),
    },
    'knowledge': {
        'auto_extract':              (bool, None, None, None),
        'extraction_interval_hours': (int, 1, 12, None),
        'min_quality_score':         (int, 1, 10, None),
        'auto_categorize':           (bool, None, None, None),
    },
    'summarizer': {
        'auto_summarize_enabled':       (bool, None, None, None),
        'schedule_time':                (str, None, None, None),  # 'HH:MM'
        'auto_summarize_message_count': (int, 50, 200, None),
        'summary_length':               (str, None, None, ('brief', 'standard', 'detailed')),
        'include_topics':               (bool, None, None, None),
        'include_action_items':         (bool, None, None, None),
        # Server-tracked field — not user-editable but written by the
        # scheduler. Allow as a pass-through so saving doesn't strip it.
        'last_auto_summary_date':       (str, None, None, None),
    },
    'mood': {
        'track_per_message':    (bool, None, None, None),
        'alert_negative_trend': (bool, None, None, None),
        'sensitivity':          (int, 1, 10, None),
        'language':             (str, None, None, ('english', 'roman_urdu', 'auto')),
    },
    'wellness': {
        'auto_check':          (bool, None, None, None),
        'break_reminders':     (bool, None, None, None),
        'check_interval_hours': (int, 1, 8, None),
        'burnout_detection':   (bool, None, None, None),
    },
    'focus': {
        'auto_analyze':       (bool, None, None, None),
        'session_reminders':  (bool, None, None, None),
        'analyze_threshold':  (int, 20, 100, None),
        'daily_reports':      (bool, None, None, None),
    },
    'auto_message': {
        'welcome_enabled':         (bool, None, None, None),
        'post_in_default_channel': (bool, None, None, None),
        'quick_replies_enabled':   (bool, None, None, None),
        'use_gemini_polish':       (bool, None, None, None),
    },
    'support': {
        'min_score':         (int, 1, 10, None),
        'max_docs':          (int, 100, 1000, None),
        'use_gemini_polish': (bool, None, None, None),
        'show_sources':      (bool, None, None, None),
    },
    'translator': {
        'default_target': (str, None, None, (
            'en', 'ur', 'hi', 'es', 'fr', 'de', 'ar', 'zh-CN',
            'pt', 'ru', 'ja', 'tr', 'id', 'bn',
        )),
        'auto_detect':    (bool, None, None, None),
        'cache_enabled':  (bool, None, None, None),
    },
}


def test_the_schema_builds_exactly_the_checks_the_server_used_before():
    assert ss.validators() == OLD_VALIDATORS
    assert agents_routes._SETTINGS_VALIDATORS == OLD_VALIDATORS


DEFAULTS = {
    "moderation": ("agents.moderation", "_MOD_DEFAULTS"),
    "engagement": ("agents.engagement", "_ENGAGEMENT_DEFAULTS"),
    "knowledge": ("agents.knowledge_builder_v2", "_KB_DEFAULTS"),
    "summarizer": ("agents.summarizer", "_SUMMARIZER_DEFAULTS"),
    "mood": ("agents.mood_tracker", "_MOOD_DEFAULTS"),
    "wellness": ("agents.wellness", "_WELLNESS_DEFAULTS"),
    "focus": ("agents.focus", "_FOCUS_DEFAULTS"),
    "auto_message": ("agents.auto_message", "_AUTO_MSG_DEFAULTS"),
    "support": ("agents.support", "_SUPPORT_DEFAULTS"),
    "translator": ("agents.translator", "_TRANSLATOR_DEFAULTS"),
}


@pytest.mark.parametrize("agent", sorted(DEFAULTS))
def test_the_defaults_are_the_ones_the_agent_reads(agent):
    module, name = DEFAULTS[agent]
    agent_defaults = getattr(importlib.import_module(module), name)
    # Settings the agent reads but nobody edits (kept by the system) may be missing from the form.
    schema_defaults = ss.defaults_for(agent)
    assert {k: v for k, v in schema_defaults.items() if k in agent_defaults} == agent_defaults
    assert set(agent_defaults) <= set(schema_defaults)


def test_every_agent_with_a_default_has_a_schema():
    assert set(DEFAULTS) == set(ss.FIELDS) == set(OLD_VALIDATORS)


def test_every_field_is_complete_and_its_default_is_allowed():
    for agent, fields in ss.FIELDS.items():
        keys = [f["key"] for f in fields]
        assert len(keys) == len(set(keys)), agent
        for f in fields:
            assert f["label"] and f["help"], (agent, f["key"])
            kind, default = f["kind"], f["default"]
            if kind == ss.TOGGLE:
                assert isinstance(default, bool)
            elif kind == ss.NUMBER:
                assert f["min"] <= default <= f["max"] and f["step"] >= 1, (agent, f["key"])
            elif kind == ss.CHOICE:
                assert default in [o["value"] for o in f["options"]], (agent, f["key"])
            else:
                assert isinstance(default, str)


def test_the_schema_hides_the_settings_only_the_system_edits():
    summarizer = {f["key"] for f in ss.schema()["summarizer"]}
    assert "last_auto_summary_date" not in summarizer and "schedule_time" in summarizer
    assert "last_auto_summary_date" in OLD_VALIDATORS["summarizer"]          # still accepted when saved


def test_the_long_names_are_aliases():
    assert ss.agent_key("mood_tracker") == "mood" and ss.agent_key("knowledge_builder") == "knowledge"
    assert ss.agent_key("support") == "support"
    assert ss.defaults_for("mood_tracker") == ss.defaults_for("mood")


def test_the_endpoint_returns_the_schema():
    with Flask(__name__).test_request_context("/api/agents/settings-schema"),          patch("flask_jwt_extended.view_decorators.verify_jwt_in_request"):
        view = agents_routes.get_settings_schema
        resp, status = getattr(view, "__wrapped__", view)()
    data = resp.get_json()["agents"]
    assert status == 200 and set(data) == set(ss.FIELDS)
    support = {f["key"]: f for f in data["support"]}
    assert (support["max_docs"]["min"], support["max_docs"]["max"]) == (100, 1000)
    assert support["use_gemini_polish"]["kind"] == "toggle"


def test_a_value_the_form_offers_is_one_the_checks_accept():
    for agent, fields in ss.FIELDS.items():
        for f in fields:
            if f["kind"] == ss.NUMBER:
                for edge in (f["min"], f["max"], f["default"]):
                    value, err = agents_routes._coerce_setting(edge, ss.validators()[agent][f["key"]])
                    assert err is None and value == edge, (agent, f["key"], edge)
            elif f["kind"] == ss.CHOICE:
                for o in f["options"]:
                    assert agents_routes._coerce_setting(o["value"], ss.validators()[agent][f["key"]])[1] is None
