"""Cron schedules for agents: validation, next-run maths and the due-runner."""
from __future__ import annotations

import json
from datetime import datetime

import pytest

from runtime_fakes import make_db  # noqa: F401  (pytest fixture)
from agents.runtime import schedules
from agents.runtime.schedules import next_run_utc, run_due_schedules, validate_schedule

FRIDAY_17 = {"cron": "0 17 * * 5", "tz": "UTC", "prompt": "digest"}


# ── validation ──────────────────────────────────────────────────────────

def test_valid_schedule_is_cleaned():
    clean, errors = validate_schedule({"cron": " 0 17 * * 5 ", "tz": "Asia/Dubai", "prompt": "  weekly  "})
    assert errors == [] and clean == {"cron": "0 17 * * 5", "tz": "Asia/Dubai", "prompt": "weekly"}


def test_defaults_are_utc_and_a_generic_prompt():
    clean, errors = validate_schedule({"cron": "30 9 * * 1-5"})
    assert errors == [] and clean["tz"] == "UTC" and clean["prompt"] == schedules.DEFAULT_PROMPT


@pytest.mark.parametrize("cron", ["", "not a cron", "0 17 * *", "99 17 * * 5", "0 17 * * 5 2026"])
def test_bad_cron_is_rejected(cron):
    _, errors = validate_schedule({"cron": cron})
    assert any("cron" in e for e in errors)


def test_unknown_time_zone_is_rejected():
    _, errors = validate_schedule({"cron": "0 9 * * *", "tz": "Mars/Olympus"})
    assert any("time zone" in e for e in errors)


@pytest.mark.parametrize("cron", ["* * * * *", "*/5 * * * *", "*/10 * * * *", "0,10 * * * *"])
def test_schedules_cannot_run_more_often_than_every_15_minutes(cron):
    _, errors = validate_schedule({"cron": cron})
    assert any("15 minutes" in e for e in errors)


def test_every_15_minutes_is_allowed():
    assert validate_schedule({"cron": "*/15 * * * *"})[1] == []


def test_prompt_is_capped():
    clean, _ = validate_schedule({"cron": "0 9 * * *", "prompt": "x" * 5000})
    assert len(clean["prompt"]) == schedules.MAX_PROMPT_CHARS


# ── next run ────────────────────────────────────────────────────────────

def test_next_run_is_the_following_friday_5pm_utc():
    assert next_run_utc(FRIDAY_17, datetime(2026, 10, 28, 12, 0)) == datetime(2026, 10, 30, 17, 0)   # Wed -> Fri


def test_next_run_is_strictly_after_the_reference_time():
    assert next_run_utc(FRIDAY_17, datetime(2026, 10, 30, 17, 0)) == datetime(2026, 11, 6, 17, 0)


def test_time_zone_is_applied_and_result_is_utc():
    dubai = {"cron": "0 9 * * *", "tz": "Asia/Dubai"}          # 09:00 in UTC+4 is 05:00 UTC
    assert next_run_utc(dubai, datetime(2026, 10, 28, 0, 0)) == datetime(2026, 10, 28, 5, 0)
    assert next_run_utc(dubai, datetime(2026, 10, 28, 6, 0)) == datetime(2026, 10, 29, 5, 0)


def test_result_is_naive_for_the_database():
    assert next_run_utc(FRIDAY_17, datetime(2026, 10, 28)).tzinfo is None


# ── due runner ──────────────────────────────────────────────────────────

NOW = datetime(2026, 10, 30, 17, 0, 30)


def due_row(**kw):
    row = {"id": 5, "agent_id": 2, "channel_id": 11, "config": json.dumps(FRIDAY_17),
           "next_run_at": datetime(2026, 10, 30, 17, 0), "owner_user_id": 4}
    row.update(kw)
    return row


def run(make_db, rows, *, rowcount=1, channel=({"community_id": 3},)):
    conn, cur = make_db([("FROM agent_triggers t", rows), ("SELECT community_id FROM channels", list(channel))],
                        ["agents.runtime.schedules"], rowcount=rowcount)
    sent = []
    n = run_due_schedules(now=NOW, enqueue=lambda aid, trig: sent.append((aid, trig)))
    return n, sent, cur, conn


def test_due_schedule_is_claimed_then_enqueued(make_db):
    n, sent, cur, conn = run(make_db, [due_row()])
    assert n == 1
    agent_id, trig = sent[0]
    assert agent_id == 2
    assert trig == {"type": "schedule", "trigger_id": 5, "user_id": 4, "username": None, "channel_id": 11,
                    "community_id": 3, "message_id": None, "content": None, "reply_to": None, "prompt": "digest",
                    "delivery": None}
    sql, params = cur.sql_containing("UPDATE agent_triggers SET next_run_at")[0]
    assert "AND next_run_at = %s" in sql                       # compare-and-swap
    assert params == (datetime(2026, 11, 6, 17, 0), 5, datetime(2026, 10, 30, 17, 0))
    assert conn.commits >= 1


def test_only_due_active_enabled_schedules_are_selected(make_db):
    _, _, cur, _ = run(make_db, [])
    sql, params = cur.sql_containing("FROM agent_triggers t")[0]
    for fragment in ("t.type = 'schedule'", "t.enabled = 1", "d.status = 'active'", "t.next_run_at <= %s"):
        assert fragment in sql
    assert params[0] == NOW


def test_losing_the_claim_means_someone_else_runs_it(make_db):
    n, sent, _, _ = run(make_db, [due_row()], rowcount=0)
    assert n == 0 and sent == []


def test_a_schedule_with_no_channel_advances_but_does_not_run(make_db):
    n, sent, cur, _ = run(make_db, [due_row(channel_id=None)])
    assert n == 0 and sent == [] and cur.sql_containing("UPDATE agent_triggers SET next_run_at")


def test_a_corrupt_config_is_disabled_instead_of_spinning(make_db):
    n, sent, cur, conn = run(make_db, [due_row(config="{not json")])
    assert n == 0 and sent == []
    assert cur.sql_containing("SET enabled = 0") and conn.commits >= 1


def test_missing_channel_is_skipped(make_db):
    n, sent, _, _ = run(make_db, [due_row()], channel=())
    assert n == 0 and sent == []


def test_missed_runs_collapse_into_one(make_db):
    """A worker that was down for weeks runs the schedule once, then continues from now."""
    row = due_row(next_run_at=datetime(2026, 9, 1, 17, 0))
    n, sent, cur, _ = run(make_db, [row])
    assert n == 1
    assert cur.sql_containing("UPDATE agent_triggers SET next_run_at")[0][1][0] == datetime(2026, 11, 6, 17, 0)


def test_beat_task_and_route_are_registered():
    from celery_app import celery_app
    from tasks import agent_runtime_tasks
    assert agent_runtime_tasks.run_due_agent_schedules.name == "tasks.agent_runtime_tasks.run_due_agent_schedules"
    entry = celery_app.conf.beat_schedule["run-due-agent-schedules"]
    assert entry["task"] == agent_runtime_tasks.run_due_agent_schedules.name
    assert entry["schedule"] == 60.0 and entry["options"] == {"queue": "periodic"}
    assert celery_app.conf.task_routes[entry["task"]] == {"queue": "periodic"}
