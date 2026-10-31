"""The Today view: what needs the person and what their agents did."""
from __future__ import annotations

import datetime

import pytest
from flask import Flask
from flask_jwt_extended import JWTManager, create_access_token

from runtime_fakes import make_db  # noqa: F401  (pytest fixture)
from agents.runtime import approvals, today
from routes import agent_builder as ab

NOW = datetime.datetime(2026, 10, 29, 9, 0, 0)


def script():
    return [
        ("FROM agent_reminders r", [{"id": 1, "text": "Submit report", "remind_at": NOW, "channel_id": 11,
                                      "channel_name": "general", "agent_name": "Aura"}]),
        ("FROM agent_definitions d LEFT JOIN agent_runs", [
            {"public_id": "p1", "name": "FAQ Bot", "status": "active", "daily_run_cap": 200, "runs": 12, "failed": 2,
             "waiting": 1, "tokens": 5400},
            {"public_id": "p2", "name": "Digest", "status": "paused", "daily_run_cap": 50, "runs": None, "failed": None,
             "waiting": None, "tokens": None}]),
        ("FROM agent_runs r JOIN agent_definitions d", [
            {"run_uuid": "u1", "status": "succeeded", "trigger_type": "mention", "started_at": NOW,
             "agent_name": "FAQ Bot", "public_id": "p1"}]),
    ]


@pytest.fixture
def mine(monkeypatch):
    monkeypatch.setattr(approvals, "list_for", lambda uid, view, limit: [{"id": 8, "summary": "Post in #general: hi"}])


def test_every_section_is_filled(make_db, mine):
    _, cur = make_db(script(), [])
    out = today.build(cur, 7)
    assert out["approvals"] == [{"id": 8, "summary": "Post in #general: hi"}]
    assert out["reminders"] == [{"id": 1, "text": "Submit report", "remind_at": "2026-10-29T09:00:00Z", "channel_id": 11,
                                 "channel": "general", "agent": "Aura"}]
    assert out["agents"][0] == {"id": "p1", "name": "FAQ Bot", "status": "active", "runs": 12, "failed": 2, "waiting": 1,
                                "tokens": 5400, "daily_run_cap": 200}
    assert out["agents"][1]["runs"] == 0 and out["agents"][1]["failed"] == 0        # an idle agent still shows up
    assert out["recent_runs"] == [{"run_id": "u1", "status": "succeeded", "trigger": "mention",
                                   "started_at": "2026-10-29T09:00:00Z", "agent": "FAQ Bot", "agent_id": "p1"}]


def test_everything_is_scoped_to_the_person_and_hides_practice_runs(make_db, mine):
    _, cur = make_db(script(), [])
    today.build(cur, 7)
    by_sql = {sql.split("FROM", 1)[1][:30]: params for sql, params in cur.executed}
    assert all(params[0] == 7 for params in by_sql.values())
    stats_sql = cur.sql_containing("LEFT JOIN agent_runs")[0][0]
    assert "is_dry_run = 0" in stats_sql and "owner_user_id = %s" in stats_sql and "'aura'" in stats_sql
    assert "is_dry_run = 0" in cur.sql_containing("FROM agent_runs r JOIN")[0][0]


def test_a_missing_table_only_empties_its_own_section(make_db, mine):
    def missing(sql, params):
        raise RuntimeError("Table 'agent_reminders' doesn't exist")
    _, cur = make_db([("FROM agent_reminders r", missing)] + script()[1:], [])
    out = today.build(cur, 7)
    assert out["reminders"] == [] and len(out["agents"]) == 2 and len(out["recent_runs"]) == 1


def test_nothing_at_all_is_a_valid_day(make_db, monkeypatch):
    monkeypatch.setattr(approvals, "list_for", lambda uid, view, limit: [])
    _, cur = make_db([], [])
    assert today.build(cur, 7) == {"approvals": [], "reminders": [], "agents": [], "recent_runs": []}


def test_the_endpoint_needs_a_login_and_returns_the_view(make_db, monkeypatch, mine):
    conn, cur = make_db(script(), ["routes.agent_builder"])
    monkeypatch.setattr(ab, "get_user_id", lambda name, cur: 7)
    app = Flask(__name__)
    app.config.update(JWT_SECRET_KEY="test-secret-key-for-unit-tests-123456", TESTING=True)
    JWTManager(app)
    app.register_blueprint(ab.agent_builder_bp)
    client = app.test_client()
    assert client.get("/api/agent-builder/today").status_code == 401
    with app.app_context():
        token = create_access_token(identity="sarah")
    r = client.get("/api/agent-builder/today", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200 and set(r.get_json()) == {"approvals", "reminders", "agents", "recent_runs"}
