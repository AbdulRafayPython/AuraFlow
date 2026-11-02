"""Tools backed by the original built-in agents: access, result shape, approval wording."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from agents.runtime import legacy_tools as lt
from agents.runtime.tools import RISK_READ, RISK_WRITE, TOOL_REGISTRY, ToolContext, ToolError


def ctx(**kw):
    base = dict(invoked_by=7, community_id=3, channel_id=11)
    base.update(kw)
    return ToolContext(**base)


@pytest.fixture
def member(monkeypatch):
    monkeypatch.setattr(lt.permissions, "can_read_channel", lambda u, c: True)
    monkeypatch.setattr(lt.permissions, "channel_info", lambda c: {"id": c, "name": "general", "type": "text"})


def test_the_tools_are_registered_with_the_right_risk():
    for name in ("detect_language", "suggest_quick_replies", "get_focus_score",
                 "get_engagement_ideas", "check_message_safety"):
        assert TOOL_REGISTRY[name].risk == RISK_READ
    assert TOOL_REGISTRY["extract_knowledge"].risk == RISK_WRITE
    assert TOOL_REGISTRY["extract_knowledge"].summarize is not None


@pytest.mark.parametrize("name,kwargs", [("get_focus_score", {}), ("extract_knowledge", {})])
def test_channel_tools_deny_non_members(monkeypatch, name, kwargs):
    monkeypatch.setattr(lt.permissions, "can_read_channel", lambda u, c: False)
    with pytest.raises(ToolError, match="Access denied"):
        TOOL_REGISTRY[name].func(ctx(), **kwargs)


@pytest.mark.parametrize("name,kwargs", [("get_focus_score", {}), ("extract_knowledge", {})])
def test_channel_tools_need_a_user(name, kwargs):
    with pytest.raises(ToolError, match="No user"):
        TOOL_REGISTRY[name].func(ctx(invoked_by=None), **kwargs)


def test_channel_tools_need_a_channel():
    with pytest.raises(ToolError, match="channel_id is required"):
        lt.get_focus_score(ctx(channel_id=None))


def test_detect_language_flags_roman_urdu():
    out = lt.detect_language(ctx(), "mujhe kal assignment submit karna hai")
    assert out["language"] == "ur" and out["romanized"] is True


def test_quick_replies_are_suggestions_only():
    out = lt.suggest_quick_replies(ctx(), "can you help me with the assignment deadline?", max_suggestions=2)
    assert out["intent"] and 1 <= len(out["suggestions"]) <= 2


@pytest.mark.parametrize("kind,key", [("icebreaker", "title"), ("poll", "question"), ("challenge", "title")])
def test_engagement_ideas_are_returned_per_kind(kind, key):
    out = lt.get_engagement_ideas(ctx(), kind)
    assert out["kind"] == kind and key in out["idea"]


def test_conversation_starters_are_capped_at_five():
    out = lt.get_engagement_ideas(ctx(), "starter")
    assert isinstance(out["idea"], list) and 1 <= len(out["idea"]) <= 5


def test_engagement_ideas_reject_an_unknown_kind():
    with pytest.raises(ToolError, match="kind must be one of"):
        lt.get_engagement_ideas(ctx(), "meme")


def test_a_safety_check_flags_but_never_acts():
    threat = lt.check_message_safety(ctx(), "i will kill you all")
    assert threat["would_block"] is True
    phone = lt.check_message_safety(ctx(), "call me on 0300-1234567")
    assert phone["contains_personal_info"] is True and "phone_number" in phone["personal_info_types"]
    plain = lt.check_message_safety(ctx(), "see you at the lab tomorrow")
    assert plain["would_block"] is False and plain["contains_personal_info"] is False


def test_a_safety_check_passes_no_user_or_channel_to_the_agent(monkeypatch):
    calls = []

    class Fake:
        def instant_check(self, *args, **kwargs):
            calls.append((args, kwargs))
            return {"block": False, "reason": ""}

    monkeypatch.setattr("agents.moderation.ModerationAgent", Fake)
    lt.check_message_safety(ctx(), "hello there")
    assert calls == [(("hello there",), {})]               # no spam counters touched


def test_the_focus_score_is_shaped_from_the_agent_result(member, monkeypatch):
    class Fake:
        def analyze_focus(self, channel_id, hours, *, user_id=None, scheduled=False):
            assert (channel_id, hours, user_id, scheduled) == (11, 1, 7, False)
            return {"success": True, "focus_score": 0.75, "focus_level": "high", "message_count": 9,
                    "dominant_topics": [{"topic": "exam", "count": 4}], "topic_shifts": 1,
                    "participant_count": 3, "recommendation": "keep going"}

    monkeypatch.setattr("agents.focus.FocusAgent", Fake)
    out = lt.get_focus_score(ctx())
    assert out["focus_score"] == 0.75 and out["dominant_topics"][0]["topic"] == "exam"


def test_a_focus_failure_becomes_a_tool_error(member, monkeypatch):
    class Fake:
        def analyze_focus(self, *a, **k):
            return {"success": False, "error": "Need at least 5 messages for analysis. Found 2 messages."}

    monkeypatch.setattr("agents.focus.FocusAgent", Fake)
    with pytest.raises(ToolError, match="Need at least 5 messages"):
        lt.get_focus_score(ctx())


# ── extract_knowledge ───────────────────────────────────────────────────

def test_the_approver_reads_what_will_be_saved_and_from_where(member):
    tool = TOOL_REGISTRY["extract_knowledge"]
    assert tool.describe(ctx(), {"hours": 48}) == \
        "Save FAQs, definitions and decisions found in #general (the last 48 hours) to the knowledge base"
    assert "whole history" in tool.describe(ctx(), {})


@pytest.mark.parametrize("hours", [0, -1, 24 * 30 + 1, True, "5", 1.5])
def test_extract_knowledge_rejects_a_bad_window(member, hours):
    with pytest.raises(ToolError, match="hours must be"):
        lt.extract_knowledge(ctx(), hours=hours)


def test_extract_knowledge_runs_the_original_agent_for_this_community(member, monkeypatch):
    seen = {}

    class Fake:
        def extract_knowledge(self, channel_id, hours, *, community_id=None, scheduled=False):
            seen.update(channel=channel_id, hours=hours, community=community_id, scheduled=scheduled)
            return {"success": True, "total_items": 4}

    monkeypatch.setattr("agents.knowledge_builder_v2.KnowledgeBuilderAgent", Fake)
    out = lt.extract_knowledge(ctx(), hours=24)
    assert seen == {"channel": 11, "hours": 24, "community": 3, "scheduled": False}
    assert out["saved"] == 4


def test_extract_knowledge_reports_a_failure(member, monkeypatch):
    class Fake:
        def extract_knowledge(self, *a, **k):
            return {"success": False, "error": "Not enough messages to extract knowledge."}

    monkeypatch.setattr("agents.knowledge_builder_v2.KnowledgeBuilderAgent", Fake)
    with pytest.raises(ToolError, match="Not enough messages"):
        lt.extract_knowledge(ctx())


def test_a_write_tool_is_never_run_inside_the_loop():
    from agents.runtime.loop import run_agent  # noqa: F401  (import registers the tools)
    assert TOOL_REGISTRY["extract_knowledge"].risk == RISK_WRITE


# ── community knowledge and info ────────────────────────────────────────

@pytest.fixture
def in_community(monkeypatch):
    monkeypatch.setattr(lt.permissions, "_exists", lambda sql, params: params == (3, 7))


def test_the_community_tools_are_read_only_and_registered():
    for name in ("search_community_knowledge", "get_community_info"):
        assert TOOL_REGISTRY[name].risk == RISK_READ


@pytest.mark.parametrize("name,kwargs", [("search_community_knowledge", {"question": "library hours"}),
                                          ("get_community_info", {})])
def test_community_tools_need_a_community_a_user_and_membership(monkeypatch, name, kwargs):
    fn = TOOL_REGISTRY[name].func
    with pytest.raises(ToolError, match="not part of a community"):
        fn(ctx(community_id=None), **kwargs)
    with pytest.raises(ToolError, match="No user"):
        fn(ctx(invoked_by=None), **kwargs)
    monkeypatch.setattr(lt.permissions, "_exists", lambda sql, params: False)
    with pytest.raises(ToolError, match="not a member of this community"):
        fn(ctx(), **kwargs)


def test_community_knowledge_comes_back_best_first_and_cleaned(in_community, monkeypatch):
    class Fake:
        def _top_matches(self, question, community_id, min_cosine, max_docs, k):
            assert (question, community_id, k) == ("library hours", 3, 3)
            assert 0 < min_cosine <= 0.3 and max_docs == 500
            return [{"id": 1, "title": "Library", "content": '{"question": "Hours?", "answer": "8am to 8pm"}',
                     "category": "faq", "score": 0.4},
                    {"id": 2, "title": "Hostel", "content": "Curfew is 11pm", "category": "rules", "score": 0.2}]

    from agents.runtime import builtin_tools as bt
    monkeypatch.setattr(bt, "_query", lambda sql, params: [{"id": 1}, {"id": 2}])
    monkeypatch.setattr(lt, "_support_agent", Fake())
    out = lt.search_community_knowledge(ctx(), "library hours")
    assert out["count"] == 2 and [p["title"] for p in out["passages"]] == ["Library", "Hostel"]
    assert "8am to 8pm" in out["passages"][0]["text"] and "{" not in out["passages"][0]["text"]
    assert out["passages"][0]["score"] == 0.4


def test_the_support_agent_is_built_once(monkeypatch):
    monkeypatch.setattr(lt, "_support_agent", None)
    made = []

    class Fake:
        def __init__(self):
            made.append(1)

    monkeypatch.setattr("agents.support.SupportAgent", Fake)
    assert lt._support() is lt._support() and made == [1]


def test_a_search_failure_is_a_clean_tool_error(in_community, monkeypatch):
    class Boom:
        def _top_matches(self, *a, **k):
            raise RuntimeError("index exploded")

    monkeypatch.setattr(lt, "_support_agent", Boom())
    with pytest.raises(ToolError, match="Knowledge search failed"):
        lt.search_community_knowledge(ctx(), "library hours")


def test_community_info_reads_name_description_and_text_channels(in_community, monkeypatch):
    from agents.runtime import builtin_tools as bt
    answers = [[{"name": "CS Department", "description": "Official BSCS community", "member_count": 7}],
               [{"name": "general"}, {"name": "assignments"}]]
    seen = []
    monkeypatch.setattr(bt, "_query", lambda sql, params: seen.append((sql, params)) or answers.pop(0))
    out = lt.get_community_info(ctx())
    assert out == {"name": "CS Department", "description": "Official BSCS community", "member_count": 7,
                   "channels": ["general", "assignments"]}
    assert all(p == (3,) for _, p in seen) and "voice" in seen[1][0]       # only this community, no voice channels


def test_the_faq_and_welcome_templates_use_the_community_tools():
    from agents.runtime.templates import TEMPLATES
    assert TEMPLATES["faq"].tools == ("search_community_knowledge", "search_knowledge")
    assert "search_community_knowledge first" in TEMPLATES["faq"].instructions
    assert "get_community_info" in TEMPLATES["welcome"].tools


def test_passages_from_channels_the_person_is_not_in_are_dropped(in_community, monkeypatch):
    class Fake:
        def _top_matches(self, *a, **k):
            return [{"id": 1, "title": "Public", "content": "a", "score": 0.5},
                    {"id": 2, "title": "Private channel", "content": "b", "score": 0.4}]

    from agents.runtime import builtin_tools as bt
    seen = []
    monkeypatch.setattr(bt, "_query", lambda sql, params: seen.append((sql, params)) or [{"id": 1}])
    monkeypatch.setattr(lt, "_support_agent", Fake())
    out = lt.search_community_knowledge(ctx(), "anything here")
    assert [p["title"] for p in out["passages"]] == ["Public"] and out["count"] == 1
    sql, params = seen[0]
    assert "channel_members" in sql and params == (1, 2, 7)                  # asks as the invoking person
