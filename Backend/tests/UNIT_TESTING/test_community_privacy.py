"""
Unit tests for the community privacy / rules / template helpers in
routes.channels (Discord-style join and create procedure).
"""
import pytest

from routes.channels import (
    COMMUNITY_TEMPLATES,
    COMMUNITY_VISIBILITIES,
    MAX_RULE_LEN,
    MAX_RULES,
    _normalize_rules,
    _rules_list,
)


def test_rules_accept_a_list_or_newline_text_and_drop_blanks():
    assert _normalize_rules(["Be kind", "  ", " No spam "]) == "Be kind\nNo spam"
    assert _normalize_rules("Be kind\n\nNo spam\n") == "Be kind\nNo spam"


def test_empty_rules_are_stored_as_null():
    assert _normalize_rules(None) is None
    assert _normalize_rules([]) is None
    assert _normalize_rules(["   "]) is None


def test_rules_limits():
    with pytest.raises(ValueError):
        _normalize_rules([f"rule {i}" for i in range(MAX_RULES + 1)])
    with pytest.raises(ValueError):
        _normalize_rules(["x" * (MAX_RULE_LEN + 1)])
    assert _normalize_rules(["x" * MAX_RULE_LEN]) == "x" * MAX_RULE_LEN


def test_rules_list_round_trip():
    assert _rules_list(None) == []
    assert _rules_list("Be kind\nNo spam") == ["Be kind", "No spam"]


def test_visibilities_and_templates():
    assert COMMUNITY_VISIBILITIES == ("public", "private")
    for key in ("own", "study", "class", "project", "club", "friends"):
        channels = COMMUNITY_TEMPLATES[key]
        assert channels, key
        # every template has a text channel to land in
        assert any(ch_type == "text" for _, ch_type, _ in channels), key
        for name, ch_type, _ in channels:
            assert ch_type in ("text", "voice")
            assert name == name.lower() and " " not in name
