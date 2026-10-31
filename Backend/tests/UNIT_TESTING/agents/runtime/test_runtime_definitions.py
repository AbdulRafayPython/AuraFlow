"""Agent definitions: loading, caching, bot users and the built-in Aura bootstrap."""
from __future__ import annotations

from runtime_fakes import make_db  # noqa: F401  (pytest fixture)

import json

import pytest

from agents.runtime import definitions as defs
from agents.runtime.specs import AURA

MODULES = ["agents.runtime.definitions"]


@pytest.fixture(autouse=True)
def _reset():
    defs.invalidate_cache()
    defs._warned = False
    defs._aura_checked = False
    defs._last_try = 0.0
    yield
    defs.invalidate_cache()


ROW = {"id": 1, "public_id": "pub-1", "bot_user_id": 500, "bot_username": "faq_bot", "owner_user_id": 2,
       "community_id": 3, "name": "FAQ Bot", "description": "d", "instructions": "Answer FAQs.",
       "avatar_url": None, "model_tier": "smart", "tools": json.dumps(["search_knowledge"]),
       "permissions": json.dumps({"channel_ids": [11, "12"]}), "template_key": "faq", "status": "active",
       "daily_run_cap": 50}
TRIG = {"id": 9, "agent_id": 1, "type": "keyword", "channel_id": None,
        "config": json.dumps({"keywords": ["fees"]}), "enabled": 1}


def script(rows=(ROW,), triggers=(TRIG,)):
    return [("FROM agent_definitions", list(rows)), ("FROM agent_triggers", list(triggers))]


def test_definition_is_parsed_with_its_triggers(make_db):
    make_db(script(), MODULES)
    [d] = defs.load_active_definitions()
    assert (d.id, d.bot_username, d.community_id, d.model_tier) == (1, "faq_bot", 3, "smart")
    assert d.tools == ("search_knowledge",)
    assert d.channel_allowlist == {11, 12}                       # strings are coerced
    assert [(t.type, t.config) for t in d.triggers] == [("keyword", {"keywords": ["fees"]})]
    assert d.daily_run_cap == 50 and not d.is_builtin


def test_only_active_agents_are_requested(make_db):
    _, cur = make_db(script(), MODULES)
    defs.load_active_definitions()
    assert "d.status = 'active'" in cur.sql_containing("FROM agent_definitions")[0][0]


def test_result_is_cached_until_invalidated(make_db):
    _, cur = make_db(script(), MODULES)
    defs.load_active_definitions()
    defs.load_active_definitions()
    assert len(cur.sql_containing("FROM agent_definitions")) == 1
    defs.invalidate_cache()
    defs.load_active_definitions()
    assert len(cur.sql_containing("FROM agent_definitions")) == 2


def test_missing_tables_mean_no_agents_not_a_crash(monkeypatch):
    def boom():
        raise RuntimeError("Table 'agent_definitions' doesn't exist")
    monkeypatch.setattr("agents.runtime.definitions.get_db_connection", boom)
    assert defs.load_active_definitions() == []
    assert defs.get_definition(1) is None


def test_get_definition_filters_inactive_unless_asked(make_db):
    _, cur = make_db(script(), MODULES)
    defs.get_definition(1)
    defs.get_definition(1, include_inactive=True)
    queries = [s for s, _ in cur.sql_containing("FROM agent_definitions")]
    assert "d.status = 'active'" in queries[0] and "d.status = 'active'" not in queries[1]


def test_builtin_aura_uses_the_code_spec(make_db):
    make_db(script([{**ROW, "template_key": "aura", "bot_username": "aura"}]), MODULES)
    [d] = defs.load_active_definitions()
    assert d.is_builtin and defs.to_spec(d) is AURA


def test_custom_agent_spec_comes_from_the_row(make_db):
    make_db(script(), MODULES)
    spec = defs.to_spec(defs.load_active_definitions()[0])
    assert (spec.key, spec.instructions, spec.tools, spec.model_tier) == \
        ("pub-1", "Answer FAQs.", ("search_knowledge",), "smart")


# ── bot users ───────────────────────────────────────────────────────────

def test_create_bot_user_inserts_a_bot_row_with_an_unusable_password(make_db):
    _, cur = make_db([("SELECT 1 FROM users", None)], lastrowid=77)
    uid, username = defs.create_bot_user(cur, "FAQ Bot!", "FAQ Bot")
    assert (uid, username) == (77, "faqbot")                     # normalised username
    sql, params = cur.sql_containing("INSERT INTO users")[0]
    assert "is_bot" in sql and params[1] == "faqbot" and params[2] == "FAQ Bot"
    assert params[3].startswith("$2") and params[3] != "faqbot"   # a bcrypt hash of a random secret


def test_create_bot_user_avoids_taken_usernames(make_db):
    taken = {"aura", "aura_ai"}
    _, cur = make_db([("SELECT 1 FROM users", lambda sql, p: [{"x": 1}] if p[0] in taken else [])], lastrowid=5)
    _, username = defs.create_bot_user(cur, "aura", "Aura")
    assert username == "aura_ai2"


# ── ensure_aura ─────────────────────────────────────────────────────────

def test_ensure_aura_is_a_noop_before_the_migration(monkeypatch):
    monkeypatch.setattr("services.bots.bots_supported", lambda: False)
    assert defs.ensure_aura() is None


def test_ensure_aura_returns_the_existing_agent_without_creating_one(make_db, monkeypatch):
    monkeypatch.setattr("services.bots.bots_supported", lambda: True)
    _, cur = make_db(script([{**ROW, "template_key": "aura", "bot_username": "aura"}]), MODULES)
    assert defs.ensure_aura().bot_username == "aura"
    assert cur.sql_containing("INSERT") == []


def test_ensure_aura_creates_bot_definition_and_mention_trigger(make_db, monkeypatch):
    monkeypatch.setattr("services.bots.bots_supported", lambda: True)
    created = {"done": False}

    def find(sql, params):
        return [{**ROW, "template_key": "aura", "bot_username": "aura"}] if created["done"] else []

    def mark(sql, params):
        created["done"] = True
        return []

    conn, cur = make_db([
        ("FROM agent_definitions d", find), ("FROM agent_triggers", []),
        ("SELECT 1 FROM users", []), ("INSERT INTO agent_triggers", mark),
        ("SELECT id FROM users WHERE role", {"id": 1}),
    ], MODULES, lastrowid=31)
    result = defs.ensure_aura()
    assert result is not None and conn.commits == 1
    inserts = [s for s, _ in cur.sql_containing("INSERT")]
    assert any("INSERT INTO users" in s for s in inserts)
    assert any("INSERT INTO agent_definitions" in s for s in inserts)
    trig = cur.sql_containing("INSERT INTO agent_triggers")[0]
    assert "'mention'" in trig[0]
    definition = cur.sql_containing("INSERT INTO agent_definitions")[0][1]
    assert definition[-1] == "aura" and json.loads(definition[-3]) == list(AURA.tools) and json.loads(definition[-2]) == {}


def test_lazy_bootstrap_does_not_hit_the_database_for_every_message(monkeypatch):
    calls = []
    monkeypatch.setattr(defs, "ensure_aura", lambda: calls.append(1))
    defs.ensure_builtin_agents_once()
    defs.ensure_builtin_agents_once()
    defs.ensure_builtin_agents_once()
    assert calls == [1]
