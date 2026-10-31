"""API keys, webhooks and the public API an agent exposes to outside services."""
from __future__ import annotations

import datetime
import hashlib
import hmac
import json

import pytest
from flask import Flask
from flask_jwt_extended import JWTManager, create_access_token

from runtime_fakes import make_db  # noqa: F401  (pytest fixture)
from agents.runtime import builder, integrations, permissions
from agents.runtime.builder import BuilderError
from agents.runtime.definitions import AgentDefinition
from routes import agent_builder as ab
from routes import agent_integrations as ai
from tasks import agent_runtime_tasks as tasks
from utils import net_guard

PID = "pub-5"
GOOD_URL = "https://hooks.example.com/in"


@pytest.fixture(autouse=True)
def public_dns(monkeypatch):
    """Every host name resolves to a public address unless a test says otherwise."""
    monkeypatch.delenv("NET_GUARD_ALLOW_PRIVATE", raising=False)
    monkeypatch.setattr(net_guard.socket, "getaddrinfo",
                        lambda host, port, type=0: [(2, 1, 6, "", ("93.184.216.34", port))])


# ── API keys ────────────────────────────────────────────────────────────

def test_a_key_is_shown_once_and_only_its_hash_is_stored(make_db):
    _, cur = make_db([("COUNT(*)", {"n": 0})], [], lastrowid=4)
    view, key = integrations.create_key(cur, 5, 7, " Zapier ")
    assert key.startswith("afk_") and len(key) > 30 and view["prefix"] == key[:10] and view["name"] == "Zapier"
    params = cur.sql_containing("INSERT INTO agent_api_keys")[0][1]
    assert params == (5, "Zapier", key[:10], hashlib.sha256(key.encode()).hexdigest(), 7)
    assert key not in json.dumps(params[:2] + params[4:])


@pytest.mark.parametrize("name", ["", "   ", "x" * 61])
def test_a_key_needs_a_reasonable_name(make_db, name):
    _, cur = make_db([], [])
    with pytest.raises(BuilderError, match="name"):
        integrations.create_key(cur, 5, 7, name)


def test_keys_are_limited_per_agent(make_db):
    _, cur = make_db([("COUNT(*)", {"n": integrations.MAX_KEYS_PER_AGENT})], [])
    with pytest.raises(BuilderError, match="at most"):
        integrations.create_key(cur, 5, 7, "one more")
    assert cur.sql_containing("INSERT") == []


def test_list_keys_never_includes_the_key(make_db):
    _, cur = make_db([("FROM agent_api_keys", [{"id": 1, "name": "n", "key_prefix": "afk_abcdef", "created_at":
                                                 datetime.datetime(2026, 10, 29, 9), "last_used_at": None,
                                                 "revoked_at": None}])], [])
    [k] = integrations.list_keys(cur, 5)
    assert k == {"id": 1, "name": "n", "prefix": "afk_abcdef", "created_at": "2026-10-29T09:00:00Z",
                 "last_used_at": None, "revoked": False}


def test_an_active_key_finds_its_agent_and_records_the_use(make_db):
    _, cur = make_db([("FROM agent_api_keys WHERE key_hash", {"id": 3, "agent_id": 5})], [])
    assert integrations.find_agent_for_key(cur, "afk_" + "x" * 20) == {"id": 3, "agent_id": 5}
    assert cur.sql_containing("revoked_at IS NULL") and cur.sql_containing("last_used_at = NOW()")


@pytest.mark.parametrize("key", ["", "nope", "afk_" + "x" * 200, None])
def test_keys_of_the_wrong_shape_never_reach_the_database(make_db, key):
    _, cur = make_db([], [])
    assert integrations.find_agent_for_key(cur, key) is None and cur.executed == []


def test_revoking_only_touches_this_agents_active_keys(make_db):
    _, cur = make_db([], [], rowcount=1)
    assert integrations.revoke_key(cur, 5, 3) is True
    sql, params = cur.executed[0]
    assert "agent_id = %s" in sql and "revoked_at IS NULL" in sql and params == (3, 5)
    _, cur = make_db([], [], rowcount=0)
    assert integrations.revoke_key(cur, 5, 99) is False


@pytest.mark.parametrize("header, token", [("Bearer abc", "abc"), ("bearer  abc ", "abc"), ("Basic abc", ""),
                                           ("Bearer", ""), ("", ""), (None, "")])
def test_bearer_token(header, token):
    assert integrations.bearer_token(header) == token


# ── webhooks ────────────────────────────────────────────────────────────

def test_a_webhook_gets_a_secret_shown_once(make_db):
    _, cur = make_db([("COUNT(*)", {"n": 0})], [], lastrowid=2)
    view, secret = integrations.create_webhook(cur, 5, 7, GOOD_URL, ["run.finished", "approval.requested"])
    assert len(secret) == 48 and view["events"] == ["run.finished", "approval.requested"] and "secret" not in view
    assert cur.sql_containing("INSERT INTO agent_webhooks")[0][1] == (5, GOOD_URL, secret, "run.finished,approval.requested", 7)


def test_events_default_to_run_finished_and_unknown_ones_are_refused():
    assert integrations.validate_events(None) == "run.finished"
    assert integrations.validate_events(["run.finished", "run.finished"]) == "run.finished"
    for bad in (["nope"], "run.finished", [1]):
        with pytest.raises(BuilderError, match="events"):
            integrations.validate_events(bad)


@pytest.mark.parametrize("url", ["http://hooks.example.com/in", "https://user:pw@hooks.example.com/", "ftp://x.com/a", ""])
def test_unsafe_webhook_urls_are_refused(make_db, url):
    _, cur = make_db([], [])
    with pytest.raises(BuilderError):
        integrations.create_webhook(cur, 5, 7, url, None)
    assert cur.executed == []


def test_a_webhook_to_a_private_address_is_refused(make_db, monkeypatch):
    monkeypatch.setattr(net_guard.socket, "getaddrinfo", lambda host, port, type=0: [(2, 1, 6, "", ("169.254.169.254", port))])
    _, cur = make_db([], [])
    with pytest.raises(BuilderError, match="private or reserved"):
        integrations.create_webhook(cur, 5, 7, "https://metadata.example.com/", None)


def test_webhooks_are_limited_per_agent(make_db):
    _, cur = make_db([("COUNT(*)", {"n": integrations.MAX_WEBHOOKS_PER_AGENT})], [])
    with pytest.raises(BuilderError, match="at most"):
        integrations.create_webhook(cur, 5, 7, GOOD_URL, None)


def test_signature_is_an_hmac_of_the_exact_body():
    body = b'{"event":"run.finished"}'
    expected = "sha256=" + hmac.new(b"s3cret", body, hashlib.sha256).hexdigest()
    assert integrations.sign("s3cret", body) == expected


class FakeResponse:
    def __init__(self, status):
        self.status_code = status


def hook_row(**kw):
    return dict({"id": 2, "url": GOOD_URL, "secret": "s3cret", "enabled": 1}, **kw)


def test_delivery_posts_a_signed_json_body_without_following_redirects(make_db):
    _, cur = make_db([("FROM agent_webhooks WHERE id", hook_row())], [])
    seen = {}

    def post(url, **kw):
        seen.update(url=url, **kw)
        return FakeResponse(204)
    payload = integrations.envelope("run.finished", PID, {"status": "succeeded"})
    assert integrations.deliver(cur, 2, payload, http_post=post) == 204
    assert seen["url"] == GOOD_URL and seen["allow_redirects"] is False and seen["timeout"] == integrations.WEBHOOK_TIMEOUT
    assert seen["headers"]["X-AuraFlow-Signature"] == integrations.sign("s3cret", seen["data"])
    assert seen["headers"]["X-AuraFlow-Event"] == "run.finished" and json.loads(seen["data"])["data"] == {"status": "succeeded"}
    assert cur.sql_containing("UPDATE agent_webhooks")[0][1] == (204, None, 2)


def test_a_failing_receiver_is_recorded_not_raised(make_db):
    _, cur = make_db([("FROM agent_webhooks WHERE id", hook_row())], [])
    assert integrations.deliver(cur, 2, {"event": "x"}, http_post=lambda *a, **k: FakeResponse(500)) == 500
    assert "HTTP 500" in cur.sql_containing("UPDATE agent_webhooks")[0][1][1]

    def down(*a, **k):
        raise ConnectionError("secret internal detail")
    assert integrations.deliver(cur, 2, {"event": "x"}, http_post=down) is None
    last = cur.sql_containing("UPDATE agent_webhooks")[-1][1]
    assert last[1] == "The receiver could not be reached." and "secret" not in last[1]


def test_delivery_rechecks_the_address_and_skips_disabled_hooks(make_db, monkeypatch):
    _, cur = make_db([("FROM agent_webhooks WHERE id", hook_row())], [])
    monkeypatch.setattr(net_guard.socket, "getaddrinfo", lambda host, port, type=0: [(2, 1, 6, "", ("10.0.0.7", port))])
    called = []
    assert integrations.deliver(cur, 2, {}, http_post=lambda *a, **k: called.append(1)) is None
    assert called == [] and "private or reserved" in cur.sql_containing("UPDATE agent_webhooks")[0][1][1]
    _, cur = make_db([("FROM agent_webhooks WHERE id", hook_row(enabled=0))], [])
    assert integrations.deliver(cur, 2, {}, http_post=lambda *a, **k: called.append(1)) is None and called == []
    _, cur = make_db([], [])
    assert integrations.deliver(cur, 404, {}, http_post=lambda *a, **k: called.append(1)) is None


def test_only_webhooks_that_want_the_event_are_queued(make_db, monkeypatch):
    _, cur = make_db([("FROM agent_webhooks WHERE agent_id", [
        {"id": 1, "events": "run.finished"}, {"id": 2, "events": "approval.requested"},
        {"id": 3, "events": "run.finished,approval.requested"}])], ["agents.runtime.integrations"])
    queued = []
    monkeypatch.setattr(tasks.deliver_webhook_task, "delay", lambda wid, payload: queued.append((wid, payload)))
    assert integrations.dispatch(5, PID, "run.finished", {"status": "succeeded"}) == 2
    assert [q[0] for q in queued] == [1, 3] and queued[0][1]["event"] == "run.finished" and queued[0][1]["agent_id"] == PID


def test_dispatch_never_raises(monkeypatch):
    def boom():
        raise RuntimeError("db down")
    monkeypatch.setattr(integrations, "get_db_connection", boom)
    assert integrations.dispatch(5, PID, "run.finished", {}) == 0


def test_the_webhook_task_records_and_never_raises(make_db, monkeypatch):
    conn, _ = make_db([], ["database"])
    monkeypatch.setattr(integrations, "attempt", lambda cur, wid, payload: (200, False))
    assert tasks.deliver_webhook_task.run(2, {"event": "x"}) == 200 and conn.commits == 1 and conn.closed

    def boom(*a):
        raise RuntimeError("x")
    monkeypatch.setattr(integrations, "attempt", boom)
    assert tasks.deliver_webhook_task.run(2, {"event": "x"}) is None


# ── retries ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize("status, reachable, retry", [
    (500, True, True), (503, True, True), (429, True, True), (408, True, True), (425, True, True),
    (None, False, True),                                   # could not be reached at all
    (400, True, False), (404, True, False), (410, True, False), (301, True, False), (200, True, False),
    (None, True, False)])                                  # refused before sending (forbidden address)
def test_which_failures_are_worth_retrying(status, reachable, retry):
    assert integrations.is_retryable(status, reachable) is retry


def test_an_attempt_reports_whether_to_try_again(make_db):
    _, cur = make_db([("FROM agent_webhooks WHERE id", hook_row())], [])
    assert integrations.attempt(cur, 2, {}, http_post=lambda *a, **k: FakeResponse(204)) == (204, False)
    assert integrations.attempt(cur, 2, {}, http_post=lambda *a, **k: FakeResponse(503)) == (503, True)
    assert integrations.attempt(cur, 2, {}, http_post=lambda *a, **k: FakeResponse(404)) == (404, False)

    def down(*a, **k):
        raise ConnectionError("x")
    assert integrations.attempt(cur, 2, {}, http_post=down) == (None, True)


def test_a_forbidden_address_or_a_missing_webhook_is_never_retried(make_db, monkeypatch):
    _, cur = make_db([("FROM agent_webhooks WHERE id", hook_row())], [])
    monkeypatch.setattr(net_guard.socket, "getaddrinfo", lambda host, port, type=0: [(2, 1, 6, "", ("10.0.0.7", port))])
    assert integrations.attempt(cur, 2, {}, http_post=lambda *a, **k: FakeResponse(200)) == (None, False)
    _, cur = make_db([], [])
    assert integrations.attempt(cur, 404, {}, http_post=lambda *a, **k: FakeResponse(200)) == (None, False)
    _, cur = make_db([("FROM agent_webhooks WHERE id", hook_row(enabled=0))], [])
    assert integrations.attempt(cur, 2, {}, http_post=lambda *a, **k: FakeResponse(200)) == (None, False)


class Retried(Exception):
    pass


def run_task(monkeypatch, outcome, retries):
    """Run the task body as if it were attempt ``retries + 1``; returns ``(result, countdowns requested)``."""
    asked = []

    def fake_retry(countdown):
        asked.append(countdown)
        return Retried()
    monkeypatch.setattr(integrations, "attempt", lambda cur, wid, payload: outcome)
    monkeypatch.setattr(tasks.deliver_webhook_task, "retry", fake_retry, raising=False)
    monkeypatch.setattr(type(tasks.deliver_webhook_task.request), "retries", retries, raising=False)
    try:
        return tasks.deliver_webhook_task.run(2, {"event": "x"}), asked
    except Retried:
        return "retried", asked


@pytest.mark.parametrize("retries, countdown", [(0, 30), (1, 120), (2, 600)])
def test_a_down_receiver_is_tried_again_with_growing_delays(make_db, monkeypatch, retries, countdown):
    make_db([], ["database"])
    assert run_task(monkeypatch, (503, True), retries) == ("retried", [countdown])


def test_after_the_last_retry_it_gives_up_and_the_failure_stays_on_the_webhook(make_db, monkeypatch):
    make_db([], ["database"])
    assert run_task(monkeypatch, (503, True), 3) == (503, [])


def test_a_receiver_that_answers_is_not_asked_twice(make_db, monkeypatch):
    make_db([], ["database"])
    assert run_task(monkeypatch, (204, False), 0) == (204, [])
    assert run_task(monkeypatch, (400, False), 0) == (400, [])


# ── routes ──────────────────────────────────────────────────────────────

def agent(**kw):
    base = dict(id=5, public_id=PID, bot_user_id=505, bot_username="faq_bot", name="FAQ Bot", owner_user_id=7,
                community_id=3, status="active", instructions="Answer FAQs.", tools=("search_knowledge",), daily_run_cap=10)
    base.update(kw)
    return AgentDefinition(**base)


class Env:
    pass


@pytest.fixture
def api(monkeypatch, make_db):
    env = Env()
    env.defn = agent()
    env.channel = {"id": 11, "name": "general", "community_id": 3, "type": "text"}
    env.member = True
    env.key_row = {"id": 3, "agent_id": 5}
    env.rate_ok = True
    env.conn, env.cur = make_db([], ["routes.agent_builder"])
    monkeypatch.setattr(ab, "get_user_id", lambda name, cur: 7)
    monkeypatch.setattr(ab, "get_definition_by_public_id", lambda pid: env.defn if pid == PID else None)
    monkeypatch.setattr(builder, "can_manage", lambda cur, uid, d: True)
    monkeypatch.setattr(builder, "can_view", lambda cur, uid, d: True)
    monkeypatch.setattr(ai, "get_definition", lambda aid: env.defn)
    monkeypatch.setattr(integrations, "find_agent_for_key",
                        lambda cur, key: env.key_row if key == "afk_goodkey" else None)
    monkeypatch.setattr(integrations, "within_rate", lambda key_id, limit=30: env.rate_ok)
    monkeypatch.setattr(permissions, "channel_info", lambda cid: env.channel if cid == 11 else None)
    monkeypatch.setattr(permissions, "can_read_channel", lambda uid, cid: env.member)
    env.posted, env.queued = [], []
    monkeypatch.setattr("agents.runtime.posting.post_as_agent",
                        lambda defn, cid, text, **kw: env.posted.append((cid, text)) or {"id": 901})
    monkeypatch.setattr(tasks.run_agent_task, "delay", lambda agent_id, trigger: env.queued.append((agent_id, trigger)))
    monkeypatch.setattr("agents.runtime.router_agent._runs_today", lambda agent_id: env.runs_today)
    env.runs_today = 0

    app = Flask(__name__)
    app.config.update(JWT_SECRET_KEY="test-secret-key-for-unit-tests-123456", TESTING=True)
    JWTManager(app)
    app.register_blueprint(ai.agent_integrations_bp)
    app.register_blueprint(ai.public_agent_api_bp)
    with app.app_context():
        token = create_access_token(identity="sarah")
    env.http, env.headers = app.test_client(), {"Authorization": f"Bearer {token}"}
    env.call = lambda method, path, **kw: getattr(env.http, method)("/api/agent-builder" + path, headers=env.headers, **kw)
    env.public = lambda method, path, key="afk_goodkey", **kw: getattr(env.http, method)(
        "/api/public/v1" + path, headers={"Authorization": f"Bearer {key}"} if key else {}, **kw)
    return env


def test_management_endpoints_need_a_login(api):
    for method, path in [("get", f"/agents/{PID}/api-keys"), ("post", f"/agents/{PID}/api-keys"),
                         ("delete", f"/agents/{PID}/api-keys/1"), ("get", f"/agents/{PID}/webhooks"),
                         ("post", f"/agents/{PID}/webhooks"), ("delete", f"/agents/{PID}/webhooks/1")]:
        assert getattr(api.http, method)("/api/agent-builder" + path).status_code == 401, path


def test_creating_a_key_returns_it_exactly_once(api, monkeypatch):
    monkeypatch.setattr(integrations, "create_key", lambda cur, aid, uid, name: ({"id": 4, "name": name}, "afk_secretvalue"))
    r = api.call("post", f"/agents/{PID}/api-keys", json={"name": "Zapier"})
    assert r.status_code == 201 and r.get_json()["key"] == "afk_secretvalue" and api.conn.commits == 1
    monkeypatch.setattr(integrations, "list_keys", lambda cur, aid: [{"id": 4, "name": "Zapier", "prefix": "afk_secret"}])
    assert "afk_secretvalue" not in api.call("get", f"/agents/{PID}/api-keys").get_data(as_text=True)


def test_revoking_an_unknown_key_is_404(api, monkeypatch):
    monkeypatch.setattr(integrations, "revoke_key", lambda cur, aid, kid: kid == 4)
    assert api.call("delete", f"/agents/{PID}/api-keys/4").status_code == 200
    assert api.call("delete", f"/agents/{PID}/api-keys/9").status_code == 404


def test_the_builtin_agent_has_no_integrations(api):
    api.defn = agent(template_key="aura")
    assert api.call("get", f"/agents/{PID}/api-keys").status_code == 403


def test_creating_a_webhook_returns_the_secret_once(api, monkeypatch):
    monkeypatch.setattr(integrations, "create_webhook", lambda cur, aid, uid, url, ev: ({"id": 2, "url": url}, "sekret"))
    r = api.call("post", f"/agents/{PID}/webhooks", json={"url": GOOD_URL})
    assert r.status_code == 201 and r.get_json()["secret"] == "sekret"
    monkeypatch.setattr(integrations, "list_webhooks", lambda cur, aid: [{"id": 2, "url": GOOD_URL}])
    body = api.call("get", f"/agents/{PID}/webhooks").get_json()
    assert "sekret" not in json.dumps(body) and body["events"] == list(integrations.EVENTS)


def test_public_calls_need_a_valid_key(api):
    assert api.public("get", "/agent", key=None).status_code == 401
    assert api.public("get", "/agent", key="afk_wrong").status_code == 401
    r = api.public("get", "/agent")
    assert r.status_code == 200 and r.get_json()["id"] == PID


def test_public_calls_are_rate_limited(api):
    api.rate_ok = False
    assert api.public("get", "/agent").status_code == 429


def test_a_paused_agent_cannot_be_used(api, monkeypatch):
    monkeypatch.setattr(ai, "get_definition", lambda aid: None)
    assert api.public("post", "/messages", json={"channel_id": 11, "text": "hi"}).status_code == 409
    assert api.posted == []


def test_posting_a_message_as_the_agent(api):
    r = api.public("post", "/messages", json={"channel_id": 11, "text": "Deploy finished"})
    assert r.status_code == 201 and r.get_json() == {"message_id": 901, "channel_id": 11}
    assert api.posted == [(11, "Deploy finished")]


@pytest.mark.parametrize("body, status", [
    ({"channel_id": 11, "text": ""}, 400), ({"channel_id": 11, "text": "x" * 2001}, 400),
    ({"channel_id": "11", "text": "hi"}, 400), ({"channel_id": True, "text": "hi"}, 400),
    ({"channel_id": 99, "text": "hi"}, 404), ({"text": "hi"}, 400)])
def test_posting_validates_its_input(api, body, status):
    assert api.public("post", "/messages", json=body).status_code == status
    assert api.posted == []


def test_the_key_cannot_reach_beyond_the_owners_access_or_the_agents_scope(api):
    api.member = False
    assert api.public("post", "/messages", json={"channel_id": 11, "text": "hi"}).status_code == 403
    api.member = True
    api.channel = dict(api.channel, community_id=4)                     # another community
    assert api.public("post", "/messages", json={"channel_id": 11, "text": "hi"}).status_code == 403
    api.channel = dict(api.channel, community_id=3, type="voice")
    assert api.public("post", "/messages", json={"channel_id": 11, "text": "hi"}).status_code == 404
    assert api.posted == []


def test_invoking_queues_a_run_with_the_owners_identity(api):
    r = api.public("post", "/invoke", json={"channel_id": 11, "message": "Summarise today"})
    assert r.status_code == 202 and r.get_json() == {"queued": True}
    [(agent_id, trigger)] = api.queued
    assert agent_id == 5 and trigger["type"] == "api" and trigger["user_id"] == 7 and trigger["content"] == "Summarise today"
    assert trigger["channel_id"] == 11 and trigger["community_id"] == 3


def test_invoking_respects_the_daily_cap_and_input_checks(api):
    api.runs_today = 10
    assert api.public("post", "/invoke", json={"channel_id": 11, "message": "hi"}).status_code == 429
    api.runs_today = 0
    assert api.public("post", "/invoke", json={"channel_id": 11, "message": ""}).status_code == 400
    assert api.queued == []


def test_invoking_when_the_queue_is_down_is_a_clean_503(api, monkeypatch):
    def down(agent_id, trigger):
        raise ConnectionError("redis")
    monkeypatch.setattr(tasks.run_agent_task, "delay", down)
    assert api.public("post", "/invoke", json={"channel_id": 11, "message": "hi"}).status_code == 503


def test_api_runs_post_as_a_new_message_and_use_the_content_as_the_prompt():
    assert "api" in tasks._STANDALONE_KINDS
    assert tasks.build_user_message(agent(), {"type": "api", "content": "  Summarise  "}) == "Summarise"
    assert tasks.build_user_message(agent(), {"type": "api", "content": ""}) == "Hello"


def test_blueprints_are_registered_in_app_py():
    from pathlib import Path
    source = (Path(__file__).resolve().parents[4] / "app.py").read_text(encoding="utf-8")
    assert "app.register_blueprint(agent_integrations_bp)" in source and "app.register_blueprint(public_agent_api_bp)" in source
