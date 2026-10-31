"""HTTP behaviour of /api/agent-builder: auth, validation, permissions and status codes.

Database access is a scripted fake and the service layer's permission checks are
patched per test, so each test pins down one rule of the API.
"""
from __future__ import annotations

import datetime
import io
import json

import pytest
from flask import Flask
from flask_jwt_extended import JWTManager, create_access_token

from runtime_fakes import make_db  # noqa: F401  (pytest fixture)
from agents.runtime import builder, knowledge
from agents.runtime.builder import BuilderError
from agents.runtime.definitions import AgentDefinition, TriggerDef
from agents.runtime.loop import RunResult
from routes import agent_builder as ab

PID = "pub-5"


def agent(**kw):
    base = dict(id=5, public_id=PID, bot_user_id=505, bot_username="faq_bot", name="FAQ Bot", owner_user_id=7,
                community_id=None, status="draft", instructions="Answer FAQs.", tools=("search_knowledge",),
                triggers=(TriggerDef(id=1, type="mention"),))
    base.update(kw)
    return AgentDefinition(**base)


class Env:
    """Handles the tests tweak."""
    defn = None
    db = None


@pytest.fixture
def api(monkeypatch, make_db):
    env = Env()
    env.defn = agent()
    env.conn, env.cur = make_db([], ["routes.agent_builder"])
    monkeypatch.setattr(ab, "get_user_id", lambda name, cur: 7)
    monkeypatch.setattr(ab, "get_definition_by_public_id", lambda pid: env.defn if pid == PID else None)
    monkeypatch.setattr(ab, "get_community_public_id_for", lambda cid: f"comm-{cid}")
    monkeypatch.setattr(ab, "invalidate_cache", lambda: None)
    # default: the caller owns the agent
    monkeypatch.setattr(builder, "can_manage", lambda cur, uid, d: True)
    monkeypatch.setattr(builder, "can_view", lambda cur, uid, d: True)
    monkeypatch.setattr(builder, "can_create", lambda cur, uid, cid: True)
    monkeypatch.setattr(builder, "check_quota", lambda cur, uid, cid: None)
    monkeypatch.setattr(builder, "channel_checker", lambda cur, uid, cid: (lambda ch: True))

    app = Flask(__name__)
    app.config.update(JWT_SECRET_KEY="test-secret-key-for-unit-tests-123456", TESTING=True)
    JWTManager(app)
    app.register_blueprint(ab.agent_builder_bp)
    with app.app_context():
        token = create_access_token(identity="sarah")
    env.http = app.test_client()
    env.headers = {"Authorization": f"Bearer {token}"}
    env.call = lambda method, path, **kw: getattr(env.http, method)(
        "/api/agent-builder" + path, headers=env.headers, **kw)
    return env


# ── auth + catalog ──────────────────────────────────────────────────────

def test_every_endpoint_needs_a_token(api):
    for method, path in [("get", "/templates"), ("get", "/tools"), ("post", "/generate"), ("post", "/agents"),
                         ("get", "/agents"), ("get", f"/agents/{PID}"), ("patch", f"/agents/{PID}"),
                         ("post", f"/agents/{PID}/publish"), ("delete", f"/agents/{PID}"),
                         ("put", f"/agents/{PID}/triggers"), ("post", f"/agents/{PID}/knowledge"),
                         ("post", f"/agents/{PID}/test"), ("get", f"/agents/{PID}/runs"), ("get", "/runs/x")]:
        assert getattr(api.http, method)("/api/agent-builder" + path).status_code == 401, path


def test_templates_and_tools(api):
    keys = {t["key"] for t in api.call("get", "/templates").get_json()["templates"]}
    assert keys == {"faq", "welcome", "digest", "standup", "blank"}
    tools = api.call("get", "/tools").get_json()["tools"]
    assert "search_knowledge" in {t["name"] for t in tools} and {t["name"]: t["risk"] for t in tools}["post_message"] == "write"


# ── generate ────────────────────────────────────────────────────────────

def test_generate_returns_a_draft(api, monkeypatch):
    monkeypatch.setattr(ab, "generate_draft", lambda prompt: {"draft": {"name": "X"}, "notes": []})
    r = api.call("post", "/generate", json={"prompt": "an agent that answers fee questions"})
    assert r.status_code == 200 and r.get_json()["draft"]["name"] == "X"


def test_generate_validation_and_availability(api, monkeypatch):
    assert api.call("post", "/generate", json={"prompt": "hi"}).status_code == 400
    def down(prompt):
        raise ab.GenerationUnavailable("The AI service is not configured.")
    monkeypatch.setattr(ab, "generate_draft", down)
    r = api.call("post", "/generate", json={"prompt": "an agent that answers fee questions"})
    assert r.status_code == 503 and "not configured" in r.get_json()["error"]


# ── create ──────────────────────────────────────────────────────────────

def capture_create(monkeypatch, api):
    seen = {}

    def fake_create(cur, **kw):
        seen.update(kw)
        return 5, PID
    monkeypatch.setattr(builder, "create_agent", fake_create)
    return seen


def test_create_from_template_uses_its_defaults(api, monkeypatch):
    seen = capture_create(monkeypatch, api)
    r = api.call("post", "/agents", json={"template": "faq"})
    assert r.status_code == 201
    body = r.get_json()
    assert body["id"] == PID and body["status"] == "draft"
    assert seen["owner_id"] == 7 and seen["community_id"] is None and seen["template_key"] == "faq"
    assert seen["fields"]["name"] == "FAQ Bot" and seen["fields"]["tools"] == ["search_knowledge"]
    assert [t["type"] for t in seen["triggers"]] == ["mention"]
    assert api.conn.commits == 1


def test_create_lets_the_user_override_the_template(api, monkeypatch):
    seen = capture_create(monkeypatch, api)
    api.call("post", "/agents", json={"template": "faq", "name": "Fees Helper", "model_tier": "smart",
                                       "triggers": [{"type": "keyword", "config": {"keywords": ["fees"]}}]})
    assert seen["fields"]["name"] == "Fees Helper" and seen["fields"]["model_tier"] == "smart"
    assert seen["triggers"][0]["config"] == {"keywords": ["fees"]}


def test_blank_agent_has_no_template_key(api, monkeypatch):
    seen = capture_create(monkeypatch, api)
    assert api.call("post", "/agents", json={}).status_code == 201
    assert seen["template_key"] is None


def test_scheduled_template_without_a_channel_is_created_without_the_schedule(api, monkeypatch):
    seen = capture_create(monkeypatch, api)
    r = api.call("post", "/agents", json={"template": "digest"})
    assert r.status_code == 201 and seen["triggers"] == []
    assert any("schedule" in n.lower() for n in r.get_json()["notes"])


def test_scheduled_template_with_a_channel_gets_its_schedule(api, monkeypatch):
    seen = capture_create(monkeypatch, api)
    api.call("post", "/agents", json={"template": "digest", "channel_id": 11})
    [t] = seen["triggers"]
    assert t["type"] == "schedule" and t["channel_id"] == 11 and t["next_run_at"] is not None


def test_welcome_template_is_not_available_for_personal_agents(api, monkeypatch):
    seen = capture_create(monkeypatch, api)
    r = api.call("post", "/agents", json={"template": "welcome"})
    assert r.status_code == 201 and seen["triggers"] == [] and any("member_joined" in n for n in r.get_json()["notes"])


def test_create_rejects_bad_input_with_details(api, monkeypatch):
    capture_create(monkeypatch, api)
    assert api.call("post", "/agents", json={"template": "nope"}).status_code == 400
    r = api.call("post", "/agents", json={"name": "x", "tools": ["nope"]})
    assert r.status_code == 400 and r.get_json()["error"] == "Invalid agent"
    assert len(r.get_json()["details"]) == 2
    r = api.call("post", "/agents", json={"triggers": [{"type": "keyword"}]})
    assert r.status_code == 400 and r.get_json()["error"] == "Invalid triggers"


def test_community_agents_need_a_community_admin(api, monkeypatch):
    capture_create(monkeypatch, api)
    monkeypatch.setattr(ab, "get_community_id_from_public_id", lambda p: 3)
    monkeypatch.setattr(builder, "can_create", lambda cur, uid, cid: False)
    r = api.call("post", "/agents", json={"template": "faq", "community_id": "comm-uuid"})
    assert r.status_code == 403


def test_unknown_community_is_404(api, monkeypatch):
    capture_create(monkeypatch, api)
    monkeypatch.setattr(ab, "get_community_id_from_public_id", lambda p: None)
    assert api.call("post", "/agents", json={"community_id": "nope"}).status_code == 404


def test_quota_is_enforced(api, monkeypatch):
    capture_create(monkeypatch, api)

    def over(cur, uid, cid):
        raise BuilderError("You already have the maximum of 5 agents.", 409)
    monkeypatch.setattr(builder, "check_quota", over)
    assert api.call("post", "/agents", json={}).status_code == 409


def test_allowed_channels_must_be_usable(api, monkeypatch):
    capture_create(monkeypatch, api)
    monkeypatch.setattr(builder, "channel_checker", lambda cur, uid, cid: (lambda ch: ch != 99))
    r = api.call("post", "/agents", json={"permissions": {"channel_ids": [11, 99]}})
    assert r.status_code == 400


# ── read ────────────────────────────────────────────────────────────────

def test_owner_sees_everything_including_knowledge(api, monkeypatch):
    monkeypatch.setattr(knowledge, "list_sources", lambda cur, aid: [{"id": 1, "title": "Handbook"}])
    body = api.call("get", f"/agents/{PID}").get_json()
    assert body["instructions"] == "Answer FAQs." and body["knowledge"] == [{"id": 1, "title": "Handbook"}]
    assert body["triggers"][0]["type"] == "mention"


def test_members_get_the_public_view_only(api, monkeypatch):
    monkeypatch.setattr(builder, "can_manage", lambda cur, uid, d: False)
    body = api.call("get", f"/agents/{PID}").get_json()
    assert body["name"] == "FAQ Bot" and "instructions" not in body and "knowledge" not in body


def test_agents_you_cannot_see_do_not_exist(api, monkeypatch):
    monkeypatch.setattr(builder, "can_manage", lambda cur, uid, d: False)
    monkeypatch.setattr(builder, "can_view", lambda cur, uid, d: False)
    assert api.call("get", f"/agents/{PID}").status_code == 404
    assert api.call("get", "/agents/unknown").status_code == 404
    assert api.call("patch", f"/agents/{PID}", json={"name": "Hack"}).status_code == 404


def test_visible_but_not_manageable_is_403(api, monkeypatch):
    monkeypatch.setattr(builder, "can_manage", lambda cur, uid, d: False)
    assert api.call("patch", f"/agents/{PID}", json={"name": "Hack"}).status_code == 403
    assert api.call("post", f"/agents/{PID}/publish").status_code == 403
    assert api.call("delete", f"/agents/{PID}").status_code == 403


# ── edit / lifecycle ────────────────────────────────────────────────────

def test_patch_applies_only_valid_changes(api, monkeypatch):
    applied = {}
    monkeypatch.setattr(builder, "update_agent", lambda cur, aid, clean: applied.update(clean))
    r = api.call("patch", f"/agents/{PID}", json={"name": "Better Bot", "unknown_field": 1})
    assert r.status_code == 200 and applied == {"name": "Better Bot"}
    assert api.call("patch", f"/agents/{PID}", json={"name": "x"}).status_code == 400


def test_the_builtin_agent_cannot_be_edited_here(api):
    api.defn = agent(template_key="aura")
    for method, path, kw in [("patch", f"/agents/{PID}", {"json": {"name": "Aurora"}}),
                             ("post", f"/agents/{PID}/publish", {}), ("post", f"/agents/{PID}/pause", {}),
                             ("delete", f"/agents/{PID}", {}), ("put", f"/agents/{PID}/triggers", {"json": {"triggers": []}}),
                             ("post", f"/agents/{PID}/knowledge", {"json": {"type": "text", "text": "x"}})]:
        assert api.call(method, path, **kw).status_code == 403, path


def test_publish_requires_a_trigger(api):
    api.defn = agent(triggers=())
    r = api.call("post", f"/agents/{PID}/publish")
    assert r.status_code == 400 and "trigger" in r.get_json()["error"]


def test_publish_activates_and_restarts_schedules(api, monkeypatch):
    statuses = []
    monkeypatch.setattr(builder, "set_status", lambda cur, d, status: statuses.append(status))
    api.defn = agent(triggers=(TriggerDef(id=9, type="schedule", channel_id=11,
                                          config={"cron": "0 17 * * 5", "tz": "UTC"}),))
    assert api.call("post", f"/agents/{PID}/publish").status_code == 200
    assert statuses == ["active"]
    sql, params = api.cur.sql_containing("UPDATE agent_triggers SET next_run_at")[0]
    assert params[1] == 9 and params[0] > datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def test_pause_and_archive(api, monkeypatch):
    statuses = []
    monkeypatch.setattr(builder, "set_status", lambda cur, d, status: statuses.append(status))
    assert api.call("post", f"/agents/{PID}/pause").status_code == 200
    assert api.call("delete", f"/agents/{PID}").get_json() == {"status": "archived"}
    assert statuses == ["paused", "archived"]


def test_put_triggers_validates_then_replaces(api, monkeypatch):
    saved = []
    monkeypatch.setattr(builder, "replace_triggers", lambda cur, aid, trig: saved.extend(trig))
    ok = api.call("put", f"/agents/{PID}/triggers", json={"triggers": [{"type": "mention"}]})
    assert ok.status_code == 200 and [t["type"] for t in saved] == ["mention"]
    bad = api.call("put", f"/agents/{PID}/triggers", json={"triggers": [{"type": "schedule"}]})
    assert bad.status_code == 400 and bad.get_json()["details"]


# ── knowledge ───────────────────────────────────────────────────────────

def test_add_text_knowledge(api, monkeypatch):
    api.cur.script.append(("COUNT(*)", {"n": 0}))
    seen = {}
    monkeypatch.setattr(knowledge, "add_source", lambda cur, aid, **kw: seen.update(kw) or {"id": 1, "chunks": 1})
    r = api.call("post", f"/agents/{PID}/knowledge", json={"type": "text", "title": "Fees", "text": "Due in May."})
    assert r.status_code == 201 and seen == {"type": "text", "title": "Fees", "text": "Due in May."}
    assert api.conn.commits == 1


def test_upload_a_file(api, monkeypatch):
    api.cur.script.append(("COUNT(*)", {"n": 0}))
    seen = {}
    monkeypatch.setattr(knowledge, "add_source", lambda cur, aid, **kw: seen.update(kw) or {"id": 2, "chunks": 3})
    r = api.call("post", f"/agents/{PID}/knowledge", content_type="multipart/form-data",
                 data={"file": (io.BytesIO("Hostel rules".encode()), "rules.txt")})
    assert r.status_code == 201
    assert seen["type"] == "file" and seen["title"] == "rules.txt" and seen["text"] == "Hostel rules"


def test_unsupported_upload_is_a_clean_400(api):
    api.cur.script.append(("COUNT(*)", {"n": 0}))
    r = api.call("post", f"/agents/{PID}/knowledge", content_type="multipart/form-data",
                 data={"file": (io.BytesIO(b"MZ"), "virus.exe")})
    assert r.status_code == 400 and "Unsupported" in r.get_json()["error"]


def test_channel_knowledge_needs_access(api, monkeypatch):
    api.cur.script.append(("COUNT(*)", {"n": 0}))
    monkeypatch.setattr(builder, "channel_checker", lambda cur, uid, cid: (lambda ch: False))
    r = api.call("post", f"/agents/{PID}/knowledge", json={"type": "channel", "channel_id": 11})
    assert r.status_code == 400


def test_channel_knowledge_is_read_and_stored(api, monkeypatch):
    api.cur.script += [("COUNT(*)", {"n": 0}), ("SELECT name FROM channels", {"name": "faq"})]
    monkeypatch.setattr(knowledge, "read_channel_text", lambda cur, cid: "a: hello")
    seen = {}
    monkeypatch.setattr(knowledge, "add_source", lambda cur, aid, **kw: seen.update(kw) or {"id": 3, "chunks": 1})
    assert api.call("post", f"/agents/{PID}/knowledge", json={"type": "channel", "channel_id": 11}).status_code == 201
    assert seen["title"] == "#faq history" and seen["ref"] == "11" and seen["text"] == "a: hello"


def test_source_limit_and_bad_request(api):
    api.cur.script.append(("COUNT(*)", {"n": ab.MAX_SOURCES_PER_AGENT}))
    assert api.call("post", f"/agents/{PID}/knowledge", json={"type": "text", "text": "x"}).status_code == 409
    api.cur.script[:] = [("COUNT(*)", {"n": 0})]
    assert api.call("post", f"/agents/{PID}/knowledge", json={"type": "voice"}).status_code == 400


def test_delete_knowledge(api, monkeypatch):
    monkeypatch.setattr(knowledge, "delete_source", lambda cur, aid, sid: sid == 4)
    assert api.call("delete", f"/agents/{PID}/knowledge/4").status_code == 200
    assert api.call("delete", f"/agents/{PID}/knowledge/9").status_code == 404


# ── dry run ─────────────────────────────────────────────────────────────

def fake_run(monkeypatch, result, seen=None):
    def run(spec, message, **kw):
        if seen is not None:
            seen.update(kw, message=message, spec=spec)
        return result
    monkeypatch.setattr("agents.runtime.loop.run_agent", run)
    monkeypatch.setattr("agents.runtime.store.get_default_store", lambda: "STORE")


def test_dry_run_returns_answer_and_steps(api, monkeypatch):
    seen = {}
    result = RunResult(run_uuid="r1", status="succeeded", text="Fees are due in May.", tokens_in=100, tokens_out=20,
                       tool_calls=1, model="deepseek-chat",
                       steps=[{"step_no": 1, "kind": "tool_call", "tool_name": "search_knowledge", "args": {"query": "fees"}},
                              {"step_no": 2, "kind": "tool_result", "tool_name": "search_knowledge",
                               "result": "x" * 5000, "latency_ms": 12}])
    fake_run(monkeypatch, result, seen)
    r = api.call("post", f"/agents/{PID}/test", json={"message": "when are fees due?"})
    body = r.get_json()
    assert r.status_code == 200 and body["text"] == "Fees are due in May." and body["tokens"] == {"in": 100, "out": 20}
    assert body["steps"][0]["tool"] == "search_knowledge" and len(body["steps"][1]["result"]) < 1600
    ctx = seen["ctx"]
    assert ctx.is_dry_run and ctx.invoked_by == 7 and ctx.extra["agent_id"] == 5 and ctx.extra["builtin"] is False
    assert seen["agent_id"] == 5 and seen["trigger_type"] == "test" and seen["spec"].key == PID


def test_dry_run_works_on_unpublished_agents(api, monkeypatch):
    fake_run(monkeypatch, RunResult(run_uuid="r", status="succeeded", text="ok"))
    api.defn = agent(status="draft")
    assert api.call("post", f"/agents/{PID}/test", json={"message": "hi"}).status_code == 200


def test_dry_run_input_checks(api, monkeypatch):
    fake_run(monkeypatch, RunResult(run_uuid="r", status="succeeded", text="ok"))
    assert api.call("post", f"/agents/{PID}/test", json={}).status_code == 400
    assert api.call("post", f"/agents/{PID}/test", json={"message": "x" * 1001}).status_code == 400
    monkeypatch.setattr(builder, "channel_checker", lambda cur, uid, cid: (lambda ch: False))
    assert api.call("post", f"/agents/{PID}/test", json={"message": "hi", "channel_id": 11}).status_code == 400


def test_dry_run_is_rate_limited(api, monkeypatch):
    fake_run(monkeypatch, RunResult(run_uuid="r", status="succeeded", text="ok"))
    monkeypatch.setattr(ab, "_within_test_rate", lambda uid: False)
    assert api.call("post", f"/agents/{PID}/test", json={"message": "hi"}).status_code == 429


def test_dry_run_without_an_llm_is_503(api, monkeypatch):
    fake_run(monkeypatch, RunResult(run_uuid="r", status="unavailable", error="No LLM is configured."))
    assert api.call("post", f"/agents/{PID}/test", json={"message": "hi"}).status_code == 503


def test_test_rate_counter(monkeypatch):
    class R:
        n = 0
        def incr(self, k): self.n += 1; return self.n
        def expire(self, k, s): pass
    r = R()
    monkeypatch.setattr("services.redis_client.get_redis", lambda: r)
    results = [ab._within_test_rate(7) for _ in range(ab.TEST_RATE_PER_MINUTE + 2)]
    assert results[: ab.TEST_RATE_PER_MINUTE] == [True] * ab.TEST_RATE_PER_MINUTE and results[-1] is False


# ── history ─────────────────────────────────────────────────────────────

def test_run_history(api):
    now = datetime.datetime(2026, 10, 28, 12, 0)
    api.cur.script.append(("FROM agent_runs", [{
        "run_uuid": "r1", "trigger_type": "mention", "is_dry_run": 0, "status": "succeeded", "input_text": "hi",
        "output_text": "hello", "step_count": 3, "tokens_in": 10, "tokens_out": 5, "error": None,
        "started_at": now, "finished_at": now}]))
    body = api.call("get", f"/agents/{PID}/runs?limit=500").get_json()
    assert body["runs"][0]["run_uuid"] == "r1" and body["runs"][0]["is_dry_run"] is False
    assert body["runs"][0]["started_at"] == now.isoformat() + "Z"
    assert api.cur.executed[-1][1] == (5, 100, 0)                       # limit is capped at 100


def test_run_detail_with_steps(api, monkeypatch):
    now = datetime.datetime(2026, 10, 28, 12, 0)
    run = {"id": 1, "agent_id": 5, "run_uuid": "r1", "trigger_type": "test", "is_dry_run": 1, "status": "succeeded",
           "input_text": "hi", "output_text": "ok", "step_count": 2, "tokens_in": 1, "tokens_out": 1, "error": None,
           "started_at": now, "finished_at": None}
    api.cur.script += [("FROM agent_runs WHERE run_uuid", run),
                       ("FROM agent_run_steps", [{"step_no": 1, "kind": "tool_call", "tool_name": "t",
                                                  "args_json": '{"q": 1}', "result_json": None, "latency_ms": None}])]
    monkeypatch.setattr(ab, "get_definition", lambda aid, include_inactive=False: api.defn)
    body = api.call("get", "/runs/r1").get_json()
    assert body["is_dry_run"] is True and body["steps"] == [
        {"step": 1, "kind": "tool_call", "tool": "t", "args": {"q": 1}, "result": None, "latency_ms": None}]
    assert "id" not in body and "agent_id" not in body


def test_run_detail_is_hidden_from_non_managers(api, monkeypatch):
    run = {"id": 1, "agent_id": 5, "run_uuid": "r1", "is_dry_run": 0}
    api.cur.script.append(("FROM agent_runs WHERE run_uuid", run))
    monkeypatch.setattr(ab, "get_definition", lambda aid, include_inactive=False: api.defn)
    monkeypatch.setattr(builder, "can_manage", lambda cur, uid, d: False)
    assert api.call("get", "/runs/r1").status_code == 404
    api.cur.script[:] = []
    assert api.call("get", "/runs/missing").status_code == 404


def test_blueprint_is_registered_in_app_py():
    # tests/UNIT_TESTING/agents/conftest.py replaces the `app` module with a stub, so read the source.
    import pathlib
    source = (pathlib.Path(__file__).resolve().parents[4] / "app.py").read_text(encoding="utf-8")
    assert "from routes.agent_builder import agent_builder_bp" in source
    assert "app.register_blueprint(agent_builder_bp)" in source
    assert ab.agent_builder_bp.url_prefix == "/api/agent-builder"


# ── mention autocomplete list ───────────────────────────────────────────

def test_mentionable_agents_shape_and_scope(api, monkeypatch):
    monkeypatch.setattr(ab, "get_community_id_from_public_id", lambda p: 3)
    monkeypatch.setattr(builder, "community_role", lambda cur, uid, cid: "member")
    api.cur.script.append(("FROM agent_definitions d JOIN users u", [
        {"public_id": "a1", "name": "Aura", "description": None, "avatar_url": None, "template_key": "aura", "username": "aura"},
        {"public_id": "a2", "name": "Campus FAQ", "description": "Fees", "avatar_url": None, "template_key": "faq",
         "username": "campus_faq"}]))
    r = api.call("get", "/agents/mentionable?community_id=comm")
    assert r.status_code == 200
    assert r.get_json()["agents"] == [
        {"id": "a1", "name": "Aura", "username": "aura", "description": "", "avatar_url": None, "builtin": True},
        {"id": "a2", "name": "Campus FAQ", "username": "campus_faq", "description": "Fees", "avatar_url": None,
         "builtin": False}]
    sql, params = api.cur.executed[-1]
    assert "d.status = 'active'" in sql and "t.type = 'mention'" in sql and "t.enabled = 1" in sql
    assert params == (7, 3)                                   # personal agents of the caller + this community


def test_mentionable_without_a_community_lists_aura_and_personal_agents(api):
    api.cur.script.append(("FROM agent_definitions d JOIN users u", []))
    assert api.call("get", "/agents/mentionable").status_code == 200
    assert api.cur.executed[-1][1] == (7,)


def test_mentionable_hides_communities_you_do_not_belong_to(api, monkeypatch):
    monkeypatch.setattr(ab, "get_community_id_from_public_id", lambda p: 3)
    monkeypatch.setattr(builder, "community_role", lambda cur, uid, cid: None)
    monkeypatch.setattr(builder, "is_system_admin", lambda cur, uid: False)
    assert api.call("get", "/agents/mentionable?community_id=comm").status_code == 404


def test_mentionable_is_not_mistaken_for_an_agent_id(api):
    """/agents/mentionable must not be routed to GET /agents/<public_id>."""
    api.cur.script.append(("FROM agent_definitions d JOIN users u", []))
    assert "agents" in api.call("get", "/agents/mentionable").get_json()


# ── approvals ───────────────────────────────────────────────────────────

@pytest.fixture
def queued(monkeypatch):
    from agents.runtime import approvals
    from tasks import agent_runtime_tasks as tasks
    calls = {"delay": [], "inline": [], "decide": [], "broker_down": False}

    def decide(aid, uid, approve):
        calls["decide"].append((aid, uid, approve))
        if aid == 404:
            raise approvals.ApprovalError("Approval not found", 404)
        if aid == 409:
            raise approvals.ApprovalError("This request was already approved", 409)
        return {"id": aid}

    def delay(aid):
        if calls["broker_down"]:
            raise ConnectionError("redis down")
        calls["delay"].append(aid)

    monkeypatch.setattr(approvals, "decide", decide)
    monkeypatch.setattr(tasks.resolve_approval_task, "delay", delay)
    monkeypatch.setattr(tasks.resolve_approval_task, "apply", lambda args: calls["inline"].append(args))
    return calls


def test_approval_endpoints_need_a_token(api):
    for method, path in [("get", "/approvals"), ("post", "/approvals/1/approve"), ("post", "/approvals/1/reject")]:
        assert getattr(api.http, method)("/api/agent-builder" + path).status_code == 401


def test_inbox_lists_my_pending_approvals(api, monkeypatch):
    from agents.runtime import approvals
    seen = {}
    monkeypatch.setattr(approvals, "list_for", lambda uid, view, limit: seen.update(uid=uid, view=view, limit=limit)
                        or [{"id": 5, "summary": "Post in #general: hi"}])
    body = api.call("get", "/approvals").get_json()
    assert body == {"approvals": [{"id": 5, "summary": "Post in #general: hi"}]}
    assert seen == {"uid": 7, "view": "pending", "limit": 50}


def test_inbox_rejects_unknown_filters(api):
    assert api.call("get", "/approvals?status=everything").status_code == 400


def test_approve_records_the_decision_and_queues_the_work(api, queued):
    res = api.call("post", "/approvals/5/approve")
    assert res.status_code == 200 and res.get_json() == {"id": 5, "status": "approved"}
    assert queued["decide"] == [(5, 7, True)] and queued["delay"] == [5]


def test_reject_records_the_decision(api, queued):
    res = api.call("post", "/approvals/5/reject")
    assert res.get_json()["status"] == "rejected" and queued["decide"] == [(5, 7, False)]


def test_decision_errors_keep_their_status_codes(api, queued):
    assert api.call("post", "/approvals/404/approve").status_code == 404
    res = api.call("post", "/approvals/409/reject")
    assert res.status_code == 409 and "already approved" in res.get_json()["error"]
    assert queued["delay"] == []


def test_a_down_broker_does_not_lose_the_decision(api, queued):
    queued["broker_down"] = True
    res = api.call("post", "/approvals/5/approve")
    assert res.status_code == 200 and queued["inline"] == [(5,)]
