"""Approvals: deciding once, running the approved tool once, and the post_message tool."""
from __future__ import annotations

import datetime
import json

import pytest

from runtime_fakes import make_db  # noqa: F401  (pytest fixture)
from agents.runtime import approvals, permissions, write_tools
from agents.runtime import tools as rt
from agents.runtime.approvals import ApprovalError
from agents.runtime.definitions import AgentDefinition
from agents.runtime.tools import RISK_WRITE, ToolContext, ToolError
from tasks import agent_runtime_tasks as tasks

NOW = datetime.datetime(2026, 10, 29, 9, 0, 0)
MODS = ["agents.runtime.approvals"]


def row(**kw):
    base = dict(id=5, run_id=42, tool_name="t_exec", args_json=json.dumps({"text": "hello"}),
                summary="Post in #general: hello", approver_id=7, status="pending", result_json=None,
                decided_at=None, expires_at=NOW, created_at=NOW, agent_id=3, channel_id=11, community_id=2,
                trigger_message_id=77, agent_public_id="pub-3", agent_name="Helper")
    base.update(kw)
    return base


@pytest.fixture
def events(monkeypatch):
    sent = []
    monkeypatch.setattr(approvals, "_emit_user", lambda uid, event, payload: sent.append((uid, event, payload)))
    return sent


@pytest.fixture
def exec_tool(monkeypatch):
    seen = {}

    def func(ctx, text):
        seen["ctx"], seen["text"] = ctx, text
        if text == "boom":
            raise RuntimeError("secret")
        if text == "deny":
            raise ToolError("Access denied: not a member")
        return {"posted": True}

    monkeypatch.setitem(rt.TOOL_REGISTRY, "t_exec", rt.Tool(
        "t_exec", "d", {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]},
        RISK_WRITE, func))
    return seen


# ── deciding ────────────────────────────────────────────────────────────

def test_the_approver_can_decide_a_pending_request(make_db):
    conn, cur = make_db([("FROM agent_approvals a JOIN", row(status="approved"))], MODS, rowcount=1)
    out = approvals.decide(5, 7, True)
    sql, params = cur.sql_containing("UPDATE agent_approvals")[0]
    assert "status = 'pending'" in sql and "expires_at > NOW()" in sql and "approver_id = %s" in sql
    assert params == ("approved", 5, 7)
    assert out["id"] == 5 and conn.commits == 1


def test_rejecting_records_rejected(make_db):
    _, cur = make_db([("FROM agent_approvals a JOIN", row(status="rejected"))], MODS, rowcount=1)
    approvals.decide(5, 7, False)
    assert cur.sql_containing("UPDATE agent_approvals")[0][1][0] == "rejected"


def test_somebody_else_gets_a_404_and_learns_nothing(make_db):
    make_db([("FROM agent_approvals a JOIN", row(approver_id=9))], MODS, rowcount=0)
    with pytest.raises(ApprovalError) as err:
        approvals.decide(5, 7, True)
    assert err.value.status == 404


def test_missing_approval_is_a_404(make_db):
    make_db([], MODS, rowcount=0)
    with pytest.raises(ApprovalError) as err:
        approvals.decide(5, 7, True)
    assert err.value.status == 404


def test_a_decided_request_cannot_be_decided_again(make_db):
    make_db([("FROM agent_approvals a JOIN", row(status="approved"))], MODS, rowcount=0)
    with pytest.raises(ApprovalError) as err:
        approvals.decide(5, 7, False)
    assert err.value.status == 409 and "already approved" in err.value.message


def test_an_overdue_request_reports_expiry(make_db):
    make_db([("FROM agent_approvals a JOIN", row(status="pending"))], MODS, rowcount=0)
    with pytest.raises(ApprovalError) as err:
        approvals.decide(5, 7, True)
    assert err.value.status == 409 and "expired" in err.value.message


# ── executing ───────────────────────────────────────────────────────────

def run_execute(make_db, rowcount=1, **kw):
    return make_db([("FROM agent_approvals a JOIN", row(status="approved", **kw)),
                    ("MAX(step_no)", {"n": 4})], MODS, rowcount=rowcount)


def test_approved_tool_runs_with_the_approvers_access(make_db, exec_tool, events):
    conn, cur = run_execute(make_db)
    out = approvals.execute(5)
    assert out == {"ok": True, "value": {"posted": True}}
    ctx = exec_tool["ctx"]
    assert (ctx.invoked_by, ctx.approver_id, ctx.community_id, ctx.channel_id, ctx.run_id) == (7, 7, 2, 11, 42)
    assert ctx.extra == {"agent_id": 3, "approved": True} and exec_tool["text"] == "hello"
    assert cur.sql_containing("UPDATE agent_runs")[0][1][0] == "succeeded"
    step = cur.sql_containing("INSERT INTO agent_run_steps")[0][1]
    assert step[:4] == (42, 4, "tool_result", "t_exec")
    assert events == [(7, "agent_approval_resolved", {"id": 5, "status": "approved",
                                                      "summary": "Post in #general: hello",
                                                      "agent": "Helper", "error": None})]


def test_an_approved_mcp_tool_gets_its_agents_tools_registered_first(make_db, events, monkeypatch):
    from agents.runtime import mcp
    registered = []

    def register(agent_id):
        registered.append(agent_id)
        monkeypatch.setitem(rt.TOOL_REGISTRY, "mcp_3_notion_create", rt.Tool(
            "mcp_3_notion_create", "d", {"type": "object", "properties": {"title": {"type": "string"}}},
            RISK_WRITE, lambda ctx, title="": {"text": f"made {title}"}))
        return ["mcp_3_notion_create"]
    monkeypatch.setattr(mcp, "register_for_agent", register)
    run_execute(make_db, tool_name="mcp_3_notion_create", args_json=json.dumps({"title": "Plan"}))
    assert approvals.execute(5) == {"ok": True, "value": {"text": "made Plan"}} and registered == [3]


def test_the_claim_makes_a_second_execution_a_no_op(make_db, exec_tool, events):
    run_execute(make_db, rowcount=0)
    assert approvals.execute(5) is None
    assert "ctx" not in exec_tool and events == []


def test_tool_errors_fail_the_run_and_tell_the_approver(make_db, exec_tool, events):
    _, cur = run_execute(make_db, args_json=json.dumps({"text": "deny"}))
    out = approvals.execute(5)
    assert out == {"ok": False, "error": "Access denied: not a member"}
    assert cur.sql_containing("UPDATE agent_runs")[0][1][0] == "failed"
    assert events[0][2]["status"] == "failed" and events[0][2]["error"] == "Access denied: not a member"


def test_a_crashing_tool_does_not_leak_details(make_db, exec_tool, events):
    run_execute(make_db, args_json=json.dumps({"text": "boom"}))
    out = approvals.execute(5)
    assert out == {"ok": False, "error": "the action failed unexpectedly"}


def test_stored_arguments_are_validated_again(make_db, exec_tool, events):
    run_execute(make_db, args_json=json.dumps({"nope": 1}))
    out = approvals.execute(5)
    assert out["ok"] is False and "missing required argument 'text'" in out["error"]
    assert "ctx" not in exec_tool


def test_a_tool_that_no_longer_exists_fails_cleanly(make_db, events):
    run_execute(make_db, tool_name="gone")
    assert approvals.execute(5)["ok"] is False


# ── rejecting and expiring ──────────────────────────────────────────────

def test_rejection_cancels_the_run_and_tells_the_channel(make_db, events, monkeypatch):
    _, cur = make_db([("FROM agent_approvals a JOIN", row(status="rejected")), ("MAX(step_no)", {"n": 5})], MODS)
    notes = []
    monkeypatch.setattr(approvals, "_post_note", lambda r, text: notes.append((r["channel_id"], text)))
    approvals.finish_rejected(5)
    assert cur.sql_containing("UPDATE agent_runs")[0][1][0] == "cancelled"
    assert notes == [(11, "Okay, I won't do that.")]
    assert events[0][2]["status"] == "rejected"


def test_finish_rejected_ignores_other_statuses(make_db, events):
    make_db([("FROM agent_approvals a JOIN", row(status="approved"))], MODS)
    approvals.finish_rejected(5)
    assert events == []


def test_expire_due_closes_overdue_requests(make_db, events):
    _, cur = make_db([("SELECT a.id, a.run_id, a.approver_id",
                       [{"id": 1, "run_id": 10, "approver_id": 7}, {"id": 2, "run_id": 11, "approver_id": 8}])],
                     MODS, rowcount=1)
    assert approvals.expire_due() == 2
    assert len(cur.sql_containing("SET status = 'expired'")) == 2
    assert [c[1][0] for c in cur.sql_containing("UPDATE agent_runs")] == ["cancelled", "cancelled"]
    assert [(e[0], e[2]["status"]) for e in events] == [(7, "expired"), (8, "expired")]


def test_expire_due_with_nothing_overdue(make_db, events):
    make_db([], MODS)
    assert approvals.expire_due() == 0 and events == []


# ── listing ─────────────────────────────────────────────────────────────

def test_inbox_lists_only_my_open_requests(make_db):
    _, cur = make_db([("FROM agent_approvals a JOIN", [row()])], MODS)
    out = approvals.list_for(7, "pending")
    sql, params = cur.sql_containing("FROM agent_approvals a JOIN")[0]
    assert "a.status = 'pending' AND a.expires_at > NOW()" in sql and params == (7, 50)
    assert out[0]["summary"] == "Post in #general: hello" and out[0]["agent"] == {"id": "pub-3", "name": "Helper"}
    assert out[0]["args"] == {"text": "hello"} and out[0]["expires_at"] == NOW.isoformat() + "Z"


def test_list_limit_is_capped(make_db):
    _, cur = make_db([], MODS)
    approvals.list_for(7, "recent", limit=9999)
    assert cur.sql_containing("FROM agent_approvals a JOIN")[0][1] == (7, 100)


# ── announcing ──────────────────────────────────────────────────────────

def test_approver_is_told_a_request_is_waiting(make_db, events):
    make_db([("FROM agent_approvals a JOIN", row())], MODS)
    approvals.announce_requested([5], 7)
    assert events[0][0] == 7 and events[0][1] == "agent_approval_requested" and events[0][2]["id"] == 5


# ── Celery tasks ────────────────────────────────────────────────────────

@pytest.mark.parametrize("status,called", [("approved", "execute"), ("rejected", "finish_rejected"),
                                           ("pending", None), ("expired", None)])
def test_resolve_task_acts_on_the_decision(monkeypatch, status, called):
    calls = []
    monkeypatch.setattr(approvals, "get", lambda aid: {"status": status})
    monkeypatch.setattr(approvals, "execute", lambda aid: calls.append("execute"))
    monkeypatch.setattr(approvals, "finish_rejected", lambda aid: calls.append("finish_rejected"))
    tasks.resolve_approval_task.run(5)
    assert calls == ([called] if called else [])


def test_resolve_task_never_raises(monkeypatch):
    monkeypatch.setattr(approvals, "get", lambda aid: (_ for _ in ()).throw(RuntimeError("db down")))
    tasks.resolve_approval_task.run(5)


def test_expire_task_returns_the_count(monkeypatch):
    monkeypatch.setattr(approvals, "expire_due", lambda: 3)
    assert tasks.expire_approvals.run() == 3
    monkeypatch.setattr(approvals, "expire_due", lambda: (_ for _ in ()).throw(RuntimeError("x")))
    assert tasks.expire_approvals.run() == 0


# ── post_message ────────────────────────────────────────────────────────

COMMUNITY_AGENT = AgentDefinition(id=3, public_id="p", bot_user_id=500, bot_username="h", name="Helper",
                                  community_id=2, permissions={"channel_ids": [11, 12]})
GENERAL = {"id": 11, "name": "general", "community_id": 2, "type": "text"}


@pytest.fixture
def scene(monkeypatch):
    s = {"channel": GENERAL, "member": True, "defn": COMMUNITY_AGENT, "posted": []}
    monkeypatch.setattr(permissions, "channel_info", lambda cid: s["channel"])
    monkeypatch.setattr(permissions, "can_read_channel", lambda uid, cid: s["member"])
    monkeypatch.setattr("agents.runtime.definitions.get_definition", lambda aid, include_inactive=False: s["defn"])

    def fake_post(defn, channel_id, text, *, reply_to=None, run_id=None, card=None):
        s["posted"].append((channel_id, text, run_id))
        s["card"] = card
        return {"id": 901}
    monkeypatch.setattr("agents.runtime.posting.post_as_agent", fake_post)
    return s


def ctx(**kw):
    base = dict(invoked_by=7, community_id=2, channel_id=11, run_id=42, extra={"agent_id": 3})
    base.update(kw)
    return ToolContext(**base)


def test_post_message_is_a_write_tool_with_a_readable_summary(scene):
    tool = rt.TOOL_REGISTRY["post_message"]
    assert tool.risk == RISK_WRITE
    assert tool.describe(ctx(), {"text": "Hello team"}) == "Post in #general: Hello team"


def test_summary_is_clipped_for_long_posts(scene):
    summary = rt.TOOL_REGISTRY["post_message"].describe(ctx(), {"text": "x" * 1000})
    assert len(summary) <= 500 and summary.endswith("…")


def test_post_message_posts_as_the_agent(scene):
    out = write_tools.post_message(ctx(), "Hello team")
    assert out == {"posted": True, "message_id": 901, "channel": "general"}
    assert scene["posted"] == [(11, "Hello team", 42)]


def test_explicit_channel_overrides_the_current_one(scene):
    scene["channel"] = {"id": 12, "name": "news", "community_id": 2, "type": "text"}
    write_tools.post_message(ctx(), "Hi", channel_id=12)
    assert scene["posted"][0][0] == 12


@pytest.mark.parametrize("mutate,message", [
    (lambda s: s.update(member=False), "not a member"),
    (lambda s: s.update(channel=None), "does not exist"),
    (lambda s: s.update(channel={**GENERAL, "type": "voice"}), "voice channel"),
    (lambda s: s.update(channel={**GENERAL, "community_id": 9}), "not allowed to post"),
    (lambda s: s.update(channel={**GENERAL, "id": 99}), "not allowed to post"),   # outside the allow-list
])
def test_post_message_checks_access_when_asked_and_when_run(scene, mutate, message):
    mutate(scene)
    with pytest.raises(ToolError, match=message):
        rt.TOOL_REGISTRY["post_message"].describe(ctx(), {"text": "hi"})
    with pytest.raises(ToolError, match=message):
        write_tools.post_message(ctx(), "hi")
    assert scene["posted"] == []


def test_post_message_needs_a_person_and_a_channel(scene):
    with pytest.raises(ToolError, match="No user"):
        write_tools.post_message(ctx(invoked_by=None), "hi")
    with pytest.raises(ToolError, match="channel_id is required"):
        write_tools.post_message(ctx(channel_id=None), "hi")


def test_an_inactive_agent_cannot_post(scene, monkeypatch):
    calls = iter([COMMUNITY_AGENT, None])        # allowed when checked, gone when posting
    monkeypatch.setattr("agents.runtime.definitions.get_definition",
                        lambda aid, include_inactive=False: next(calls))
    with pytest.raises(ToolError, match="not active"):
        write_tools.post_message(ctx(), "hi")


def test_personal_agents_are_only_limited_by_the_persons_own_access(scene):
    scene["defn"] = AgentDefinition(id=3, public_id="p", bot_user_id=500, bot_username="h", name="Mine",
                                    community_id=None)
    scene["channel"] = {**GENERAL, "community_id": 9}
    assert write_tools.post_message(ctx(), "hi")["posted"] is True


# ── MySQL store guardrail ───────────────────────────────────────────────

def test_a_person_cannot_be_buried_in_approval_requests(make_db, monkeypatch):
    from agents.runtime import store
    monkeypatch.setenv("AGENT_MAX_PENDING_APPROVALS", "2")
    conn, cur = make_db([("COUNT(*)", {"n": 2})], [], lastrowid=9)
    monkeypatch.setattr("database.get_db_connection", lambda: conn)
    out = store.MySQLRunStore().create_approval(42, tool_name="post_message", args={}, summary="s", approver_id=7)
    assert out is None and cur.sql_containing("INSERT INTO agent_approvals") == []


def test_below_the_cap_the_approval_is_stored(make_db, monkeypatch):
    from agents.runtime import store
    conn, cur = make_db([("COUNT(*)", {"n": 1})], [], lastrowid=9)
    monkeypatch.setattr("database.get_db_connection", lambda: conn)
    monkeypatch.setenv("AGENT_MAX_PENDING_APPROVALS", "2")
    out = store.MySQLRunStore().create_approval(42, tool_name="post_message", args={"text": "x"}, summary="s",
                                                approver_id=7)
    assert out == 9
    assert cur.sql_containing("INSERT INTO agent_approvals")[0][1][:2] == (42, "post_message")


def test_aura_can_post_but_only_through_approval():
    from agents.runtime.specs import AURA
    assert "post_message" in AURA.tools and rt.TOOL_REGISTRY["post_message"].risk == RISK_WRITE
    assert "create_poll" in AURA.tools and rt.TOOL_REGISTRY["create_poll"].risk == RISK_WRITE


# ── create_poll ─────────────────────────────────────────────────────────

def test_poll_summary_names_the_channel_question_and_options(scene):
    summary = rt.TOOL_REGISTRY["create_poll"].describe(ctx(), {"question": "Lunch?", "options": ["Pizza", " Rice ", ""]})
    assert summary == "Poll in #general: Lunch? (Pizza / Rice)"


@pytest.mark.parametrize("options", [[], ["only one"], ["a", "b", "c", "d", "e", "f", "g"], ["", " "]])
def test_a_poll_needs_two_to_six_options(scene, options):
    with pytest.raises(ToolError, match="2 to 6"):
        write_tools.create_poll(ctx(), "Q?", options)
    assert scene["posted"] == []


def test_poll_is_posted_as_an_interactive_card(scene):
    out = write_tools.create_poll(ctx(), "Lunch?", ["Pizza", "Rice"])
    assert out == {"posted": True, "message_id": 901, "channel": "general"}
    assert scene["card"] == {"kind": "poll", "question": "Lunch?", "options": ["Pizza", "Rice"]}
    assert scene["posted"] == [(11, "📊 Lunch?\n1. Pizza\n2. Rice", 42)]


def test_poll_checks_channel_access(scene):
    scene["member"] = False
    with pytest.raises(ToolError, match="Access denied"):
        write_tools.create_poll(ctx(), "Q?", ["a", "b"])
