"""Reminders: the schedule_reminder tool, storing them, and delivering the ones that are due."""
from __future__ import annotations

import pytest

from runtime_fakes import make_db  # noqa: F401  (pytest fixture)
from agents.runtime import permissions, reminders, write_tools
from agents.runtime import tools as rt
from agents.runtime.definitions import AgentDefinition
from agents.runtime.tools import RISK_WRITE, ToolContext, ToolError
from tasks import agent_runtime_tasks as tasks

DB = ("agents.runtime.reminders",)
AGENT = AgentDefinition(id=3, public_id="p", bot_user_id=500, bot_username="h", name="Helper",
                        community_id=2, permissions={"channel_ids": [11]})
GENERAL = {"id": 11, "name": "general", "community_id": 2, "type": "text"}


def ctx(**kw):
    base = dict(invoked_by=7, community_id=2, channel_id=11, run_id=42, extra={"agent_id": 3})
    base.update(kw)
    return ToolContext(**base)


@pytest.fixture
def scene(monkeypatch):
    s = {"member": True, "created": [], "cap": False}
    monkeypatch.setattr(permissions, "channel_info", lambda cid: GENERAL)
    monkeypatch.setattr(permissions, "can_read_channel", lambda uid, cid: s["member"])
    monkeypatch.setattr("agents.runtime.definitions.get_definition", lambda aid, include_inactive=False: AGENT)

    def fake_create(**kw):
        s["created"].append(kw)
        return None if s["cap"] else 77
    monkeypatch.setattr(reminders, "create", fake_create)
    return s


# ── the tool ────────────────────────────────────────────────────────────

def test_it_is_a_write_tool_with_a_readable_summary(scene):
    tool = rt.TOOL_REGISTRY["schedule_reminder"]
    assert tool.risk == RISK_WRITE
    assert tool.describe(ctx(), {"text": "Submit report", "in_minutes": 150}) == \
        "Remind you in #general in 2 h 30 min: Submit report"


def test_reminder_is_stored_for_the_person_who_asked(scene):
    out = write_tools.schedule_reminder(ctx(), "Submit report", 90)
    assert out == {"scheduled": True, "reminder_id": 77, "channel": "general", "in": "1 h 30 min"}
    assert scene["created"] == [dict(agent_id=3, channel_id=11, user_id=7, text="Submit report", in_minutes=90)]


@pytest.mark.parametrize("minutes", [0, -5, 10081, "30", 1.5, True, None])
def test_the_delay_must_be_a_whole_number_within_a_week(scene, minutes):
    with pytest.raises(ToolError, match="in_minutes"):
        write_tools.schedule_reminder(ctx(), "x", minutes)
    assert scene["created"] == []


def test_a_reminder_needs_text(scene):
    with pytest.raises(ToolError, match="some text"):
        write_tools.schedule_reminder(ctx(), "  ", 10)


def test_channel_access_is_checked(scene):
    scene["member"] = False
    with pytest.raises(ToolError, match="Access denied"):
        write_tools.schedule_reminder(ctx(), "x", 10)


def test_too_many_open_reminders_is_a_clear_error(scene):
    scene["cap"] = True
    with pytest.raises(ToolError, match="maximum"):
        write_tools.schedule_reminder(ctx(), "x", 10)


def test_aura_can_set_reminders_but_only_through_approval():
    from agents.runtime.specs import AURA
    assert "schedule_reminder" in AURA.tools


# ── storing ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize("minutes, text", [(1, "1 min"), (60, "1 h"), (150, "2 h 30 min"), (1500, "1 d 1 h"), (10080, "7 d")])
def test_describe_delay(minutes, text):
    assert reminders.describe_delay(minutes) == text


def test_create_inserts_with_a_database_computed_time(make_db):
    _, cur = make_db([("COUNT(*)", {"n": 2})], modules=DB, lastrowid=9)
    assert reminders.create(agent_id=3, channel_id=11, user_id=7, text="x", in_minutes=30) == 9
    sql, params = cur.sql_containing("INSERT INTO agent_reminders")[0]
    assert "DATE_ADD(NOW()" in sql and params == (3, 11, 7, "x", 30)


def test_create_refuses_beyond_the_cap(make_db, monkeypatch):
    monkeypatch.setenv("AGENT_MAX_PENDING_REMINDERS", "5")
    _, cur = make_db([("COUNT(*)", {"n": 5})], modules=DB)
    assert reminders.create(agent_id=3, channel_id=11, user_id=7, text="x", in_minutes=30) is None
    assert cur.sql_containing("INSERT INTO agent_reminders") == []


# ── delivering ──────────────────────────────────────────────────────────

DUE = {"id": 1, "agent_id": 3, "channel_id": 11, "user_id": 7, "text": "Submit report", "username": "sarah_dev"}


@pytest.fixture
def delivery(monkeypatch):
    d = {"posted": [], "defn": AGENT, "member": True, "post_ok": True}
    monkeypatch.setattr("agents.runtime.definitions.get_definition", lambda aid, include_inactive=False: d["defn"])
    monkeypatch.setattr(permissions, "can_read_channel", lambda uid, cid: d["member"])

    def fake_post(defn, channel_id, text, **kw):
        d["posted"].append((channel_id, text))
        return {"id": 1} if d["post_ok"] else None
    monkeypatch.setattr("agents.runtime.posting.post_as_agent", fake_post)
    return d


def test_a_due_reminder_is_posted_once_and_mentions_the_person(make_db, delivery):
    _, cur = make_db([("JOIN users u", [DUE])], modules=DB)
    assert reminders.deliver_due() == 1
    assert delivery["posted"] == [(11, "⏰ @sarah_dev reminder: Submit report")]
    claim = cur.sql_containing("SET status = 'sent'")[0]
    assert "status = 'pending'" in claim[0]


def test_a_reminder_another_worker_claimed_is_not_posted(make_db, delivery):
    make_db([("JOIN users u", [DUE])], modules=DB, rowcount=0)
    assert reminders.deliver_due() == 0
    assert delivery["posted"] == []


@pytest.mark.parametrize("change, reason", [
    ({"defn": None}, "no longer active"),
    ({"member": False}, "no longer in that channel"),
    ({"post_ok": False}, "could not be posted"),
])
def test_a_reminder_that_cannot_be_delivered_is_marked_failed(make_db, delivery, change, reason):
    delivery.update(change)
    _, cur = make_db([("JOIN users u", [DUE])], modules=DB)
    assert reminders.deliver_due() == 0
    failed = cur.sql_containing("SET status = 'failed'")
    assert failed and reason in failed[0][1][0]


def test_nothing_due_posts_nothing(make_db, delivery):
    make_db([], modules=DB)
    assert reminders.deliver_due() == 0


# ── the Beat task ───────────────────────────────────────────────────────

def test_task_returns_the_count(monkeypatch):
    monkeypatch.setattr(reminders, "deliver_due", lambda: 4)
    assert tasks.deliver_reminders.run() == 4


def test_task_never_raises(monkeypatch):
    def boom():
        raise RuntimeError("db down")
    monkeypatch.setattr(reminders, "deliver_due", boom)
    assert tasks.deliver_reminders.run() == 0
