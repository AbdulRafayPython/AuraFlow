"""Built-in read tools: access control and result shaping (no database)."""
from __future__ import annotations

import datetime
from unittest.mock import MagicMock, patch

import pytest

from agents.runtime import builtin_tools as bt
from agents.runtime.tools import ToolContext, ToolError

NOW = datetime.datetime(2026, 10, 28, 12, 0, 0)


def ctx(**kw):
    base = dict(invoked_by=7, community_id=3, channel_id=11)
    base.update(kw)
    return ToolContext(**base)


@pytest.fixture
def db(monkeypatch):
    """Capture SQL and return canned rows from ``bt._query``."""
    state = {"rows": [], "calls": []}

    def fake_query(sql, params):
        state["calls"].append((sql, params))
        rows = state["rows"]
        return rows.pop(0) if rows and isinstance(rows[0], list) else list(rows)

    monkeypatch.setattr(bt, "_query", fake_query)
    return state


@pytest.fixture
def member(monkeypatch):
    monkeypatch.setattr(bt.permissions, "can_read_channel", lambda u, c: True)


# ── access control ──────────────────────────────────────────────────────

@pytest.mark.parametrize("tool,kwargs", [
    (bt.get_channel_history, {}),
    (bt.summarize_channel, {}),
])
def test_channel_tools_deny_non_members(monkeypatch, tool, kwargs):
    monkeypatch.setattr(bt.permissions, "can_read_channel", lambda u, c: False)
    with pytest.raises(ToolError, match="Access denied"):
        tool(ctx(), **kwargs)


@pytest.mark.parametrize("tool,kwargs", [
    (bt.get_channel_history, {}),
    (bt.search_messages, {"query": "hello"}),
    (bt.search_knowledge, {"query": "deadline"}),
    (bt.get_member_info, {"username": "sarah"}),
    (bt.summarize_channel, {}),
])
def test_tools_need_a_user(tool, kwargs):
    with pytest.raises(ToolError, match="No user"):
        tool(ctx(invoked_by=None), **kwargs)


def test_channel_is_required_without_a_current_channel(member):
    with pytest.raises(ToolError, match="channel_id is required"):
        bt.get_channel_history(ctx(channel_id=None))


# ── get_channel_history ─────────────────────────────────────────────────

def test_history_is_oldest_first_and_defaults_to_current_channel(member, db):
    db["rows"] = [
        {"id": 3, "content": "third", "created_at": NOW, "username": "b", "display_name": "Bee", "bot_name": None},
        {"id": 2, "content": "second", "created_at": NOW, "username": "a", "display_name": None, "bot_name": None},
        {"id": 1, "content": "x" * 900, "created_at": NOW, "username": "a", "display_name": "Ann", "bot_name": "Aura"},
    ]
    out = bt.get_channel_history(ctx(), limit=3)
    assert out["channel_id"] == 11 and out["count"] == 3
    assert [m["id"] for m in out["messages"]] == [1, 2, 3]
    assert out["messages"][0]["author"] == "Aura"          # bot name wins
    assert out["messages"][1]["author"] == "a"             # falls back to username
    assert len(out["messages"][0]["content"]) <= 500
    sql, params = db["calls"][0]
    assert "moderation_flagged = 0" in sql and params == (11, 3)


def test_history_hours_filter_is_parameterised(member, db):
    bt.get_channel_history(ctx(), hours=24)
    sql, params = db["calls"][0]
    assert "INTERVAL %s HOUR" in sql and params == (11, 24, 30)


# ── search_messages ─────────────────────────────────────────────────────

def test_search_escapes_like_wildcards_and_scopes_to_member_channels(db):
    bt.search_messages(ctx(), query="100%_done")
    sql, params = db["calls"][0]
    assert "JOIN channel_members cm" in sql and "cm.user_id = %s" in sql
    assert "c.community_id = %s" in sql
    assert params[0] == 7
    assert params[1] == "%100\\%\\_done%"
    assert 3 in params


def test_search_in_one_channel_skips_community_scope(db):
    bt.search_messages(ctx(), query="hello", channel_id=5)
    sql, params = db["calls"][0]
    assert "m.channel_id = %s" in sql and "c.community_id" not in sql
    assert 5 in params


# ── search_knowledge ────────────────────────────────────────────────────

def test_knowledge_ranks_title_hits_first(db):
    db["rows"] = [
        {"id": 1, "title": "Misc", "content": "fees are due in May", "source": "agent", "related_channel": None},
        {"id": 2, "title": "Fees policy", "content": "pay online", "source": "agent", "related_channel": 4},
    ]
    out = bt.search_knowledge(ctx(), query="fees")
    assert [e["id"] for e in out["entries"]] == [2, 1]
    sql, params = db["calls"][0]
    assert "channel_members WHERE user_id = %s" in sql and params[-1] == 7


def test_knowledge_needs_a_real_keyword():
    with pytest.raises(ToolError, match="keyword"):
        bt.search_knowledge(ctx(), query="a b")


# ── get_member_info ─────────────────────────────────────────────────────

def test_member_info_hides_users_outside_shared_communities(monkeypatch, db):
    db["rows"] = [{"id": 9, "username": "ghost", "display_name": "G", "bio": "", "status": "online", "custom_status": None}]
    monkeypatch.setattr(bt.permissions, "share_a_community", lambda a, b: False)
    with pytest.raises(ToolError) as hidden:
        bt.get_member_info(ctx(), username="ghost")
    db["rows"] = []
    with pytest.raises(ToolError) as missing:
        bt.get_member_info(ctx(), username="nobody")
    assert str(hidden.value) == str(missing.value)        # cannot tell them apart


def test_member_info_returns_public_fields_only(monkeypatch, db):
    db["rows"] = [
        [{"id": 9, "username": "sarah", "display_name": "Sarah", "bio": "CS", "status": "online",
          "custom_status": None, "email": "secret@example.com"}],
        [{"role": "admin"}],
    ]
    monkeypatch.setattr(bt.permissions, "share_a_community", lambda a, b: True)
    out = bt.get_member_info(ctx(), username="@sarah")
    assert out["username"] == "sarah" and out["community_role"] == "admin"
    assert "email" not in out and "secret@example.com" not in str(out)


# ── translate_text / summarize_channel (delegating tools) ───────────────

def test_translate_returns_agent_result():
    agent = MagicMock()
    agent.translate.return_value = {"translated_text": "سلام", "source_language": "en",
                                    "target_language": "ur", "provider": "deep_translator"}
    with patch("agents.translator.TranslatorAgent", return_value=agent):
        out = bt.translate_text(ctx(), text="hello", target_language="ur")
    assert out["translated_text"] == "سلام" and out["provider"] == "deep_translator"
    assert agent.translate.call_args.kwargs["user_id"] == 7


def test_translate_failure_is_a_tool_error():
    agent = MagicMock()
    agent.translate.return_value = {"translated_text": ""}
    with patch("agents.translator.TranslatorAgent", return_value=agent):
        with pytest.raises(ToolError, match="unavailable"):
            bt.translate_text(ctx(), text="hello", target_language="ur")


def test_summarize_passes_user_and_trims_result(member):
    agent = MagicMock()
    agent.summarize_channel.return_value = {
        "success": True, "summary": "S", "key_points": ["a"], "action_items": ["b"],
        "participants": ["x"], "message_count": 40, "internal": "drop me"}
    with patch("agents.summarizer.SummarizerAgent", return_value=agent):
        out = bt.summarize_channel(ctx(), message_count=50)
    assert out["summary"] == "S" and "internal" not in out
    kw = agent.summarize_channel.call_args.kwargs
    assert kw == {"channel_id": 11, "message_count": 50, "user_id": 7}


def test_summarize_failure_is_a_tool_error(member):
    agent = MagicMock()
    agent.summarize_channel.return_value = {"success": False, "error": "Not enough messages"}
    with patch("agents.summarizer.SummarizerAgent", return_value=agent):
        with pytest.raises(ToolError, match="Not enough messages"):
            bt.summarize_channel(ctx())
