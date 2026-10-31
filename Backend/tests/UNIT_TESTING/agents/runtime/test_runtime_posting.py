"""post_as_agent / thread_history / run events."""
from __future__ import annotations

from runtime_fakes import make_db  # noqa: F401  (pytest fixture)

import datetime
from unittest.mock import MagicMock

import pytest

from agents.runtime import posting, threads
from agents.runtime.definitions import AgentDefinition

DEFN = AgentDefinition(id=1, public_id="pub-aura", bot_user_id=500, bot_username="aura", name="Aura",
                       avatar_url="/uploads/aura.png")
NOW = datetime.datetime(2026, 10, 28, 12, 0, 0)


@pytest.fixture
def emitter(monkeypatch):
    sio = MagicMock()
    monkeypatch.setattr(posting, "_get_emitter", lambda: sio)
    return sio


def db(make_db, **kw):
    return make_db([
        ("SELECT created_at", {"created_at": NOW}),
        ("SELECT m.content, m.message_type", {"content": "what is up?", "message_type": "text",
                                              "username": "sarah", "display_name": "Sarah"}),
    ], ["agents.runtime.posting"], lastrowid=901)


def test_reply_is_stored_as_an_ai_message_from_the_bot_user(make_db, emitter):
    conn, cur = db(make_db)
    out = posting.post_as_agent(DEFN, 11, "  Here you go  ", reply_to=77, run_id=42)
    sql, params = cur.sql_containing("INSERT INTO messages")[0]
    assert "agent_run_id" in sql
    assert params == (11, 500, "Here you go", "ai", "Aura", 77, 42)
    assert conn.commits == 1 and conn.closed
    assert out["id"] == 901 and out["message_type"] == "ai" and out["sender_id"] == 500
    assert out["author"] == "Aura" and out["agent"]["username"] == "aura" and out["agent_run_id"] == 42
    assert out["created_at"] == NOW.isoformat()


def test_reply_carries_a_preview_of_the_message_it_answers(make_db, emitter):
    db(make_db)
    out = posting.post_as_agent(DEFN, 11, "answer", reply_to=77)
    assert out["reply_to"] == 77
    assert out["reply_to_preview"] == {"id": 77, "content": "what is up?", "author": "sarah",
                                       "message_type": "text"}


def test_run_id_and_reply_are_optional(make_db, emitter):
    _, cur = db(make_db)
    out = posting.post_as_agent(DEFN, 11, "hello everyone")
    sql, params = cur.sql_containing("INSERT INTO messages")[0]
    assert "agent_run_id" not in sql and params[-1] is None       # reply_to NULL
    assert out["reply_to"] is None and "reply_to_preview" not in out


def test_message_is_broadcast_to_the_channel_room(make_db, emitter):
    db(make_db)
    posting.post_as_agent(DEFN, 11, "hi", reply_to=77)
    event, payload = emitter.emit.call_args.args
    assert event == "message_received" and payload["content"] == "hi"
    assert emitter.emit.call_args.kwargs == {"room": "channel_11", "namespace": "/"}


def test_empty_content_is_not_posted(make_db, emitter):
    _, cur = db(make_db)
    assert posting.post_as_agent(DEFN, 11, "   ") is None
    assert posting.post_as_agent(DEFN, 0, "hi") is None
    assert cur.executed == [] and not emitter.emit.called


def test_very_long_replies_are_cut(make_db, emitter):
    _, cur = db(make_db)
    posting.post_as_agent(DEFN, 11, "x" * 20000)
    assert len(cur.sql_containing("INSERT INTO messages")[0][1][2]) == posting.MAX_REPLY_CHARS


def test_database_failure_returns_none_and_rolls_back(monkeypatch, make_db, emitter):
    conn, cur = db(make_db)
    cur.execute = MagicMock(side_effect=RuntimeError("db down"))
    assert posting.post_as_agent(DEFN, 11, "hi") is None
    assert conn.rollbacks == 1 and not emitter.emit.called


def test_emit_failure_does_not_raise():
    sio = MagicMock()
    sio.emit.side_effect = RuntimeError("redis down")
    posting._emitter = sio
    try:
        assert posting.emit_to_channel(11, "x", {}) is False
    finally:
        posting._emitter = None


def test_run_events_describe_the_agent(emitter):
    posting.emit_run_event(DEFN, 11, "agent_run_started", message_id=77)
    event, payload = emitter.emit.call_args.args
    assert event == "agent_run_started"
    assert payload == {"agent": {"id": "pub-aura", "name": "Aura", "username": "aura",
                                 "avatar": "/uploads/aura.png"}, "channel_id": 11, "message_id": 77}


# ── thread_history ──────────────────────────────────────────────────────

def test_thread_is_returned_oldest_first_with_agent_turns_as_assistant(make_db):
    rows = {
        70: {"id": 70, "sender_id": 7, "content": "what are the fees?", "reply_to": None, "username": "sarah"},
        71: {"id": 71, "sender_id": 500, "content": "Fees are due in May.", "reply_to": 70, "username": "aura"},
        72: {"id": 72, "sender_id": 8, "content": "and the deadline?", "reply_to": 71, "username": "ahmed"},
    }
    make_db([("FROM messages m", lambda sql, p: rows[p[0]])], ["agents.runtime.threads"])
    history = threads.thread_history(72, bot_user_id=500)
    assert history == [
        {"role": "user", "content": "@sarah: what are the fees?"},
        {"role": "assistant", "content": "Fees are due in May."},
        {"role": "user", "content": "@ahmed: and the deadline?"},
    ]


def test_thread_walk_is_bounded_and_cycle_safe(make_db):
    rows = {1: {"id": 1, "sender_id": 7, "content": "a", "reply_to": 2, "username": "u"},
            2: {"id": 2, "sender_id": 7, "content": "b", "reply_to": 1, "username": "u"}}
    make_db([("FROM messages m", lambda sql, p: rows[p[0]])], ["agents.runtime.threads"])
    assert len(threads.thread_history(1, 500, limit=6)) == 2


def test_no_parent_means_no_history():
    assert threads.thread_history(None, 500) == []
