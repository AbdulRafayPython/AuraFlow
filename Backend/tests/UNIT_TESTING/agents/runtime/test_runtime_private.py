"""Private replies: the agent's bot user sends one person a DM, and nothing goes anywhere else."""
from __future__ import annotations

from runtime_fakes import make_db  # noqa: F401  (pytest fixture)

import datetime
from unittest.mock import MagicMock

import pytest

from agents.runtime import private
from agents.runtime.definitions import AgentDefinition

DEFN = AgentDefinition(id=1, public_id="pub-aura", bot_user_id=500, bot_username="aura", name="Aura",
                       avatar_url="/uploads/aura.png")
NOW = datetime.datetime(2026, 11, 2, 10, 0, 0)


@pytest.fixture
def sent(monkeypatch):
    seen = {"emits": [], "user_emits": [], "notifications": [], "unread": []}
    emitter = MagicMock()
    emitter.emit.side_effect = lambda event, payload, room=None, namespace=None: seen["emits"].append((event, room))
    monkeypatch.setattr(private, "_get_emitter", lambda: emitter)
    monkeypatch.setattr(private, "emit_to_user", lambda uid, event, payload: seen["user_emits"].append((uid, event)) or True)
    monkeypatch.setattr(private, "encrypt", lambda text: f"enc({text})")
    monkeypatch.setattr("services.notification_service.create_notification",
                        lambda **kw: seen["notifications"].append(kw))
    monkeypatch.setattr("services.unread_tracker.increment_dm_unread",
                        lambda receiver, sender: seen["unread"].append((receiver, sender)))
    return seen


def db(make_db, receiver=True):
    return make_db([
        ("SELECT id, username FROM users", {"id": 7, "username": "sarah"} if receiver else []),
        ("SELECT public_id FROM users", {"public_id": "bot-uuid"}),
        ("SELECT created_at FROM direct_messages", {"created_at": NOW}),
    ], ["agents.runtime.private"], lastrowid=901)


def test_it_is_stored_as_an_encrypted_dm_from_the_agent(make_db, sent):
    conn, cur = db(make_db)
    out = private.deliver_privately(DEFN, 7, "  How are you feeling today?  ", run_id=42)
    sql, params = cur.sql_containing("INSERT INTO direct_messages")[0]
    assert params == (500, 7, "enc(How are you feeling today?)") and "'ai'" in sql
    assert conn.commits == 1 and conn.closed
    assert out["id"] == 901 and out["sender_id"] == 500 and out["receiver_id"] == 7
    assert out["content"] == "How are you feeling today?" and out["message_type"] == "ai"
    assert out["sender"]["display_name"] == "Aura" and out["sender"]["is_bot"] is True
    assert out["sender"]["public_id"] == "bot-uuid"
    assert out["agent_run_id"] == 42 and out["created_at"] == NOW.isoformat()


def test_only_that_person_hears_about_it(make_db, sent):
    db(make_db)
    private.deliver_privately(DEFN, 7, "hi")
    assert sent["emits"] == [("receive_direct_message", "dm_7_500")]
    assert sent["user_emits"] == [(7, "receive_direct_message")]
    assert sent["unread"] == [(7, 500)]
    [note] = sent["notifications"]
    assert note["user_id"] == 7 and note["title"] == "Message from Aura" and note["link"] == "/dm/bot-uuid"


def test_nothing_is_posted_in_a_channel(make_db, sent):
    _, cur = db(make_db)
    private.deliver_privately(DEFN, 7, "hi")
    assert not cur.sql_containing("INSERT INTO messages")
    assert all(not str(room).startswith("channel_") for _, room in sent["emits"])


def test_long_text_is_cut(make_db, sent):
    _, cur = db(make_db)
    out = private.deliver_privately(DEFN, 7, "x" * 9000)
    assert len(out["content"]) == private.MAX_PRIVATE_CHARS
    assert len(sent["notifications"][0]["body"]) == private.PREVIEW_CHARS


@pytest.mark.parametrize("user_id,text", [(7, ""), (7, "   "), (None, "hi"), (0, "hi"), (500, "hi")])
def test_nothing_is_sent_without_a_message_or_a_real_receiver(make_db, sent, user_id, text):
    _, cur = db(make_db)
    assert private.deliver_privately(DEFN, user_id, text) is None
    assert not cur.sql_containing("INSERT INTO direct_messages") and sent["user_emits"] == []


def test_an_unknown_person_gets_nothing(make_db, sent):
    _, cur = db(make_db, receiver=False)
    assert private.deliver_privately(DEFN, 7, "hi") is None
    assert not cur.sql_containing("INSERT INTO direct_messages")


def test_a_database_error_is_rolled_back_and_nothing_is_announced(monkeypatch, sent):
    conn = MagicMock()
    conn.cursor.return_value.__enter__.return_value.execute.side_effect = RuntimeError("db down")
    monkeypatch.setattr(private, "get_db_connection", lambda: conn)
    assert private.deliver_privately(DEFN, 7, "hi") is None
    conn.rollback.assert_called_once()
    assert sent["user_emits"] == [] and sent["notifications"] == []


def test_a_failing_side_channel_does_not_lose_the_message(make_db, sent, monkeypatch):
    db(make_db)

    def boom(**kw):
        raise RuntimeError("notifications down")

    monkeypatch.setattr("services.notification_service.create_notification", boom)
    assert private.deliver_privately(DEFN, 7, "hi")["id"] == 901
