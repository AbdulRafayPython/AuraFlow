"""get_my_mood and summarize_dm: the asker's own private data, only in a private conversation."""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from agents.runtime import private, private_tools
from agents.runtime.builder import tool_catalog
from agents.runtime.loop import run_agent
from agents.runtime.specs import AURA, AgentSpec
from agents.runtime.tools import TOOL_REGISTRY, ToolContext, ToolError

PRIVATE = ToolContext(invoked_by=7, extra={"private": True})
PUBLIC = ToolContext(invoked_by=7, channel_id=11)


@pytest.fixture
def db(monkeypatch):
    """Answer each query by the first matching phrase; record what was asked."""
    state = SimpleNamespace(answers={}, asked=[])

    def query(sql, params):
        state.asked.append((sql, params))
        for phrase, rows in state.answers.items():
            if phrase in sql:
                return rows
        return []
    monkeypatch.setattr(private_tools, "_query", query)
    return state


def moods(*pairs):
    return [{"mood": m, "sentiment_score": s} for m, s in pairs]


# ── the gate ────────────────────────────────────────────────────────────

def test_both_tools_are_private_only_reads():
    for name in ("get_my_mood", "summarize_dm"):
        t = TOOL_REGISTRY[name]
        assert t.private_only and t.risk == "read"
    assert {"get_my_mood", "summarize_dm"} <= {t["name"] for t in tool_catalog() if t["private_only"]}


@pytest.mark.parametrize("name,args", [("get_my_mood", {}), ("summarize_dm", {"username": "ali"})])
def test_a_tool_refuses_in_a_run_that_posts_in_a_channel(db, name, args):
    with pytest.raises(ToolError, match="private conversation"):
        TOOL_REGISTRY[name].func(PUBLIC, **args)
    assert db.asked == []                                     # nothing was read


def test_the_loop_does_not_even_offer_them_outside_a_private_run(monkeypatch):
    seen = {}

    class Client:
        def chat_tools(self, messages, tools, **kw):
            seen["tools"] = {t["function"]["name"] for t in tools}
            return {"content": "ok", "tool_calls": []}

    choice = SimpleNamespace(available=True, tier="fast", model="m", client=Client())
    store = SimpleNamespace(start_run=lambda **kw: 1, finish_run=lambda *a, **kw: None,
                            add_step=lambda *a, **kw: None)
    for ctx, expected in ((ToolContext(invoked_by=7), False), (ToolContext(invoked_by=7, extra={"private": True}), True)):
        try:
            run_agent(AURA, "hi", ctx=ctx, store=store, model_choice=choice)
        except Exception:  # noqa: BLE001  (the fake store/client may not satisfy every call)
            pass
        assert ("get_my_mood" in seen.get("tools", set())) is expected


def test_a_private_spec_keeps_them():
    spec = AgentSpec(key="k", name="K", instructions="", tools=("get_my_mood", "summarize_dm", "post_message"))
    assert private.private_spec(spec).tools == ("get_my_mood", "summarize_dm")


# ── get_my_mood ─────────────────────────────────────────────────────────

def test_without_mood_tracking_nothing_is_read(db):
    out = private_tools.get_my_mood(PRIVATE)
    assert out["tracking"] is False
    assert not any("user_moods" in sql for sql, _ in db.asked)


def test_it_reads_only_the_askers_own_mood(db):
    db.answers = {"user_agents": [{"1": 1}], "user_moods": moods(("sad", -0.6), ("sad", -0.5), ("calm", 0.1), ("happy", 0.4))}
    out = private_tools.get_my_mood(PRIVATE, days=99)
    assert [p for sql, p in db.asked if "user_moods" in sql] == [(7, 30)]   # own id, days capped
    assert out["dominant_mood"] == "sad" and out["trend"] == "improving" and out["entries"] == 4
    assert "message_sample" not in str(db.asked) and "message" not in out


def test_too_few_entries_says_so(db):
    db.answers = {"user_agents": [{"1": 1}], "user_moods": moods(("sad", -0.6))}
    out = private_tools.get_my_mood(PRIVATE)
    assert out["entries"] == 1 and "Ask them" in out["note"]


@pytest.mark.parametrize("scores,trend", [((0.5, 0.4, -0.2, -0.3), "declining"), ((0.1, 0.0, 0.1, 0.05), "steady")])
def test_trend(scores, trend):
    assert private_tools.mood_summary(moods(*[("x", s) for s in scores]))["trend"] == trend


# ── summarize_dm ────────────────────────────────────────────────────────

def test_it_summarizes_the_askers_dms_with_a_friend(db, monkeypatch):
    db.answers = {"FROM users": [{"id": 9, "username": "ali", "display_name": "Ali"}], "FROM friends": [{"1": 1}]}
    calls = []

    class Summ:
        def summarize_dm(self, **kw):
            calls.append(kw)
            return {"success": True, "summary": "Plans for Friday.", "key_points": ["venue"], "action_items": [],
                    "message_count": 40}
    monkeypatch.setattr("agents.summarizer.SummarizerAgent", Summ)
    out = private_tools.summarize_dm(PRIVATE, username="@ali", message_count=999)
    assert calls == [{"peer_user_id": 9, "requester_user_id": 7, "message_count": 200}]
    assert out["with"] == "Ali" and out["summary"] == "Plans for Friday."


def test_not_a_friend_no_summary(db):
    db.answers = {"FROM users": [{"id": 9, "username": "ali", "display_name": "Ali"}]}
    with pytest.raises(ToolError, match="not one of their friends"):
        private_tools.summarize_dm(PRIVATE, username="ali")


def test_unknown_or_self_is_refused(db):
    with pytest.raises(ToolError, match="no member"):
        private_tools.summarize_dm(PRIVATE, username="ghost")
    db.answers = {"FROM users": [{"id": 7, "username": "sarah", "display_name": "Sarah"}]}
    with pytest.raises(ToolError, match="the person you are talking to"):
        private_tools.summarize_dm(PRIVATE, username="sarah")
