"""Bot users: helpers, login, mention notifications, friend requests, run store, encryption-aware tools."""
from __future__ import annotations

from runtime_fakes import make_db  # noqa: F401  (pytest fixture)

import bcrypt
import pytest
from flask import Flask

from services import bots

SVC = ["services.bots"]


@pytest.fixture(autouse=True)
def _reset_probe():
    bots.reset_cache()
    yield
    bots.reset_cache()


# ── services.bots ───────────────────────────────────────────────────────

def test_probe_detects_the_column_and_caches_success(make_db):
    _, cur = make_db([("information_schema.columns", {"x": 1})], SVC)
    assert bots.bots_supported() is True
    assert bots.bots_supported() is True
    assert len(cur.executed) == 1


def test_missing_column_means_nothing_is_a_bot(make_db):
    _, cur = make_db([("information_schema.columns", None)], SVC)
    assert bots.bots_supported() is False
    assert bots.is_bot_user(5) is False
    assert bots.bot_usernames_among(["aura"]) == set()
    assert cur.sql_containing("FROM users") == []             # never queries the missing column


def test_is_bot_user(make_db):
    make_db([("information_schema.columns", {"x": 1}),
             ("SELECT is_bot", lambda sql, p: {"is_bot": 1 if p[0] == 500 else 0})], SVC)
    assert bots.is_bot_user(500) is True
    assert bots.is_bot_user(7) is False
    assert bots.is_bot_user(None) is False


def test_bot_usernames_among(make_db):
    make_db([("information_schema.columns", {"x": 1}),
             ("is_bot = 1", [{"username": "aura"}])], SVC)
    assert bots.bot_usernames_among(["aura", "sarah"]) == {"aura"}
    assert bots.bot_usernames_among([]) == set()


def test_database_errors_fail_safe(monkeypatch):
    def boom():
        raise RuntimeError("down")
    monkeypatch.setattr("services.bots.get_db_connection", boom)
    assert bots.bots_supported() is False and bots.is_bot_user(1) is False


# ── login ───────────────────────────────────────────────────────────────

def _login(make_db, monkeypatch, *, is_bot, password="correct horse"):
    hashed = bcrypt.hashpw(b"correct horse", bcrypt.gensalt(4)).decode()
    row = {"id": 500, "username": "aura", "email": None, "display_name": "Aura", "bio": "", "avatar_url": None,
           "status": "offline", "custom_status": None, "is_first_login": 0, "password": hashed,
           "email_verified": 1, "role": "user"}
    make_db([("FROM users", row)], ["routes.auth"])
    monkeypatch.setattr("services.bots.is_bot_user", lambda uid: is_bot)
    from routes.auth import login
    app = Flask(__name__)
    with app.test_request_context(json={"username": "aura", "password": password}):
        resp = login()
    return resp


def test_bots_cannot_log_in_even_with_the_right_password(make_db, monkeypatch):
    resp, status = _login(make_db, monkeypatch, is_bot=True)
    assert status == 401 and resp.get_json() == {"error": "Invalid credentials"}


def test_bot_rejection_looks_like_a_wrong_password(make_db, monkeypatch):
    bot_resp, bot_status = _login(make_db, monkeypatch, is_bot=True)
    wrong, wrong_status = _login(make_db, monkeypatch, is_bot=False, password="nope")
    assert (bot_status, bot_resp.get_json()) == (wrong_status, wrong.get_json())


# ── mentions / friends ──────────────────────────────────────────────────

def test_mentioning_an_agent_sends_no_notification(make_db, monkeypatch):
    from routes import messages
    make_db([("FROM channels c JOIN communities", {"channel_name": "general", "community_name": "CS",
                                                   "community_public_id": "p"}),
             ("SELECT id FROM users WHERE username", {"id": 500})], ["routes.messages"])
    monkeypatch.setattr("services.bots.is_bot_user", lambda uid: True)
    created = []
    monkeypatch.setattr(messages, "create_notification", lambda *a, **k: created.append(1), raising=False)
    messages._notify_mentions("@aura hi", 7, "sarah", 11, 3, 77)
    assert created == []


def test_friend_request_to_an_agent_looks_like_an_unknown_user(make_db, monkeypatch):
    from routes import friends
    make_db([("SELECT id, username, display_name, avatar_url FROM users WHERE username",
              {"id": 500, "username": "aura", "display_name": "Aura", "avatar_url": None})],
            ["routes.friends"])
    monkeypatch.setattr("services.bots.is_bot_user", lambda uid: True)
    monkeypatch.setattr(friends, "get_user_id", lambda name, cur: 7)
    monkeypatch.setattr(friends, "get_jwt_identity", lambda: "sarah")
    app = Flask(__name__)
    with app.test_request_context(json={"username": "aura"}):
        fn = friends.send_friend_request
        fn = getattr(fn, "__wrapped__", fn)
        resp, status = fn()
    assert status == 404 and resp.get_json() == {"error": "Target user not found"}


# ── run store: M2 columns are optional ──────────────────────────────────

def test_run_store_writes_agent_columns_only_when_given(make_db):
    from agents.runtime.store import MySQLRunStore
    _, cur = make_db([], ["database"])
    import database
    store = MySQLRunStore()
    kw = dict(run_uuid="u", agent_key="aura", trigger_type="mention", input_text="hi",
              community_id=3, channel_id=11, invoked_by=7, is_dry_run=False)
    store.start_run(**kw)
    store.start_run(**kw, agent_id=1, trigger_message_id=77)
    plain, full = [s for s, _ in cur.sql_containing("INSERT INTO agent_runs")]
    assert "agent_id" not in plain and "trigger_message_id" not in plain
    assert "agent_id" in full and "trigger_message_id" in full
    assert cur.sql_containing("INSERT INTO agent_runs")[1][1][-2:] == (1, 77)


# ── tools stay correct when message encryption is on ────────────────────

def test_tools_decrypt_stored_messages(monkeypatch):
    from cryptography.fernet import Fernet
    from utils import encryption
    from agents.runtime import builtin_tools as bt
    from agents.runtime.tools import ToolContext
    import datetime

    key = Fernet.generate_key().decode()
    monkeypatch.setattr(encryption, "_ENCRYPTION_KEY", key)
    encryption._get_fernet.cache_clear()
    try:
        assert encryption.is_enabled()
        secret = encryption.encrypt("the deadline is Friday")
        row = {"id": 1, "content": secret, "created_at": datetime.datetime(2026, 1, 1),
               "username": "a", "display_name": "A", "bot_name": None,
               "channel_id": 11, "channel_name": "general"}
        monkeypatch.setattr(bt.permissions, "can_read_channel", lambda u, c: True)

        calls = []
        monkeypatch.setattr(bt, "_query", lambda sql, params: calls.append((sql, params)) or [dict(row)])
        ctx = ToolContext(invoked_by=7, community_id=3, channel_id=11)

        history = bt.get_channel_history(ctx)
        assert history["messages"][0]["content"] == "the deadline is Friday"

        found = bt.search_messages(ctx, query="deadline")
        assert found["count"] == 1 and found["matches"][0]["content"] == "the deadline is Friday"
        assert "LIKE" not in calls[-1][0]                    # ciphertext cannot be LIKE-matched in SQL
        assert bt.search_messages(ctx, query="nothing like this")["count"] == 0
    finally:
        monkeypatch.undo()
        encryption._get_fernet.cache_clear()
