# routes/agent_builder.py — Agent Builder API: create, configure, test and review AI agents.
#
# Thin HTTP layer; validation, permissions and SQL live in agents/runtime/builder.py.
# Everything requires a logged-in user. Agents are managed by their owner, by the
# owners/admins of their community, or by a system admin.
import logging
from contextlib import contextmanager
from typing import Any, Dict, Optional

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from agents.runtime import approvals, aura_ask, builder, knowledge, mcp
from agents.runtime.builder import BuilderError
from agents.runtime.definitions import (
    AgentDefinition, get_definition, get_definition_by_public_id, invalidate_cache, to_spec)
from agents.runtime.generator import GenerationUnavailable, generate_draft
from agents.runtime.schedules import next_run_utc
from agents.runtime.templates import TEMPLATES, get_template, list_templates
from database import get_db_connection
from utils import get_community_id_from_public_id, get_community_public_id_for, get_user_id

log = logging.getLogger(__name__)

agent_builder_bp = Blueprint("agent_builder", __name__, url_prefix="/api/agent-builder")

MAX_SOURCES_PER_AGENT = 20
TEST_RATE_PER_MINUTE = 10
MAX_TEST_MESSAGE = 1000
STEP_RESULT_PREVIEW = 1500


@agent_builder_bp.errorhandler(BuilderError)
def _builder_error(err: BuilderError):
    body: Dict[str, Any] = {"error": err.message}
    if err.details:
        body["details"] = err.details
    return jsonify(body), err.status


@agent_builder_bp.errorhandler(knowledge.KnowledgeError)
def _knowledge_error(err: knowledge.KnowledgeError):
    return jsonify({"error": str(err)}), 400


@agent_builder_bp.errorhandler(approvals.ApprovalError)
def _approval_error(err: approvals.ApprovalError):
    return jsonify({"error": err.message}), err.status


@contextmanager
def _db():
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            yield conn, cur
    finally:
        conn.close()


def _user_id(cur: Any) -> int:
    uid = get_user_id(get_jwt_identity(), cur)
    if not uid:
        raise BuilderError("User not found", 404)
    return uid


def _community_param(value: Any) -> Optional[int]:
    """Public community id from a request -> internal id (None when not given)."""
    if value in (None, ""):
        return None
    cid = get_community_id_from_public_id(str(value))
    if not cid:
        raise BuilderError("Community not found", 404)
    return cid


def _body() -> Dict[str, Any]:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def _load(cur: Any, public_id: str, user_id: int, *, manage: bool = True) -> AgentDefinition:
    """Fetch an agent the user may manage (or just see). 404 hides agents they cannot see."""
    defn = get_definition_by_public_id(public_id)
    if defn is None:
        raise BuilderError("Agent not found", 404)
    if manage and not builder.can_manage(cur, user_id, defn):
        if builder.can_view(cur, user_id, defn):
            raise BuilderError("You cannot manage this agent", 403)
        raise BuilderError("Agent not found", 404)
    if not manage and not builder.can_view(cur, user_id, defn):
        raise BuilderError("Agent not found", 404)
    return defn


def _not_builtin(defn: AgentDefinition) -> None:
    if defn.is_builtin:
        raise BuilderError("The built-in agent cannot be changed here.", 403)


def _out(defn: AgentDefinition, **kw: Any) -> Dict[str, Any]:
    pub = get_community_public_id_for(defn.community_id) if defn.community_id else None
    return builder.serialize(defn, community_public_id=pub, **kw)


# ── catalog ─────────────────────────────────────────────────────────────

@agent_builder_bp.route("/templates", methods=["GET"])
@jwt_required()
def templates():
    return jsonify({"templates": list_templates()}), 200


@agent_builder_bp.route("/tools", methods=["GET"])
@jwt_required()
def tools():
    return jsonify({"tools": builder.tool_catalog()}), 200


@agent_builder_bp.route("/today", methods=["GET"])
@jwt_required()
def today_view():
    from agents.runtime import today
    with _db() as (_, cur):
        user_id = _user_id(cur)
        return jsonify(today.build(cur, user_id)), 200


@agent_builder_bp.route("/generate", methods=["POST"])
@jwt_required()
def generate():
    with _db() as (_, cur):
        _user_id(cur)
    try:
        return jsonify(generate_draft(str(_body().get("prompt") or ""))), 200
    except ValueError as exc:
        raise BuilderError(str(exc), 400)
    except GenerationUnavailable as exc:
        raise BuilderError(str(exc), 503)


# ── create / read ───────────────────────────────────────────────────────

@agent_builder_bp.route("/agents", methods=["POST"])
@jwt_required()
def create_agent():
    data = _body()
    key = data.get("template") or "blank"
    if key != "blank" and key not in TEMPLATES:
        raise BuilderError(f"Unknown template '{key}'", 400)
    tpl = get_template(key)

    merged = {"name": tpl.suggested_name, "instructions": tpl.instructions, "tools": list(tpl.tools),
              "model_tier": tpl.model_tier, "description": tpl.description}
    merged.update({k: v for k, v in data.items() if k in (
        "name", "description", "instructions", "tools", "model_tier", "permissions", "daily_run_cap", "avatar_url")})
    fields, errors = builder.validate_fields(merged)
    if errors:
        raise BuilderError("Invalid agent", 400, errors)

    notes = []
    with _db() as (conn, cur):
        user_id = _user_id(cur)
        community_id = _community_param(data.get("community_id"))
        if tpl.personal_only and community_id is not None:
            raise BuilderError(f"{tpl.name} is a personal agent: create it without a community.", 400)
        if not builder.can_create(cur, user_id, community_id):
            raise BuilderError("Only a community owner or admin can create agents for it.", 403)
        builder.check_quota(cur, user_id, community_id)

        channel_ok = builder.channel_checker(cur, user_id, community_id)
        if isinstance(data.get("triggers"), list):
            requested = data["triggers"]
        else:
            requested = []
            for t in tpl.triggers:
                t = dict(t)
                if t["type"] == "schedule":
                    if data.get("channel_id") is None:
                        notes.append("Add a schedule later: pick the channel the agent should post in.")
                        continue
                    t["channel_id"] = data["channel_id"]
                if t["type"] in ("member_joined", "channel_silent", "focus_drift") and community_id is None:
                    notes.append(f"{t['type']} only works for community agents; it was left out.")
                    continue
                requested.append(t)
        triggers, trig_errors = builder.validate_triggers(requested, community_id=community_id, channel_ok=channel_ok)
        if trig_errors:
            raise BuilderError("Invalid triggers", 400, trig_errors)
        allowed = fields.get("permissions", {}).get("channel_ids", [])
        if any(not channel_ok(c) for c in allowed):
            raise BuilderError("permissions.channel_ids contains a channel you cannot use for this agent", 400)

        _, public_id = builder.create_agent(cur, owner_id=user_id, community_id=community_id, fields=fields,
                                            triggers=triggers, template_key=None if key == "blank" else key)
        conn.commit()
    invalidate_cache()
    out = _out(get_definition_by_public_id(public_id))
    out["notes"] = notes
    return jsonify(out), 201


@agent_builder_bp.route("/agents", methods=["GET"])
@jwt_required()
def list_agents():
    with _db() as (_, cur):
        user_id = _user_id(cur)
        community_id = _community_param(request.args.get("community_id"))
        if community_id is not None:
            manager = builder.can_create(cur, user_id, community_id)
            if not manager and builder.community_role(cur, user_id, community_id) is None:
                raise BuilderError("Community not found", 404)
            cur.execute("SELECT public_id FROM agent_definitions WHERE community_id = %s "
                        + ("AND status <> 'archived' " if manager else "AND status = 'active' ")
                        + "ORDER BY id", (community_id,))
        else:
            cur.execute("SELECT public_id FROM agent_definitions WHERE owner_user_id = %s "
                        "AND status <> 'archived' AND (template_key IS NULL OR template_key <> 'aura') ORDER BY id",
                        (user_id,))
        ids = [r["public_id"] for r in cur.fetchall() or []]
        agents = []
        for pid in ids:
            d = get_definition_by_public_id(pid)
            if d is not None:
                agents.append(_out(d, include_private=builder.can_manage(cur, user_id, d)))
    return jsonify({"agents": agents}), 200


@agent_builder_bp.route("/agents/mentionable", methods=["GET"])
@jwt_required()
def mentionable_agents():
    """Agents the caller can @mention here: Aura, the community's active agents and their own personal ones.

    Only agents with an enabled mention trigger are listed (anything else would ignore the mention).
    """
    with _db() as (_, cur):
        user_id = _user_id(cur)
        community_id = _community_param(request.args.get("community_id"))
        if community_id is not None and builder.community_role(cur, user_id, community_id) is None                 and not builder.is_system_admin(cur, user_id):
            raise BuilderError("Community not found", 404)
        scope = "d.template_key = 'aura' OR (d.community_id IS NULL AND d.owner_user_id = %s)"
        params = [user_id]
        if community_id is not None:
            scope += " OR d.community_id = %s"
            params.append(community_id)
        cur.execute(
            "SELECT d.public_id, d.name, d.description, d.avatar_url, d.template_key, u.username "
            "FROM agent_definitions d JOIN users u ON u.id = d.bot_user_id "
            "WHERE d.status = 'active' AND (" + scope + ") "
            "AND EXISTS (SELECT 1 FROM agent_triggers t WHERE t.agent_id = d.id AND t.type = 'mention' AND t.enabled = 1) "
            "ORDER BY (d.template_key = 'aura') DESC, d.name", tuple(params))
        agents = [{"id": r["public_id"], "name": r["name"], "username": r["username"],
                   "description": r["description"] or "", "avatar_url": r["avatar_url"],
                   "builtin": r["template_key"] == "aura"} for r in cur.fetchall() or []]
    return jsonify({"agents": agents}), 200


@agent_builder_bp.route("/agents/<public_id>", methods=["GET"])
@jwt_required()
def get_agent(public_id: str):
    with _db() as (_, cur):
        user_id = _user_id(cur)
        defn = _load(cur, public_id, user_id, manage=False)
        private = builder.can_manage(cur, user_id, defn)
        out = _out(defn, include_private=private)
        if private:
            out["knowledge"] = knowledge.list_sources(cur, defn.id)
    return jsonify(out), 200


# ── edit / lifecycle ────────────────────────────────────────────────────

@agent_builder_bp.route("/agents/<public_id>", methods=["PATCH"])
@jwt_required()
def update_agent(public_id: str):
    data = _body()
    wanted_mcp = [t for t in data.get("tools", []) if isinstance(t, str) and mcp.is_mcp_tool(t)]         if isinstance(data.get("tools"), list) else []
    clean, errors = builder.validate_fields(data, partial=True, extra_tools=wanted_mcp)
    if errors:
        raise BuilderError("Invalid agent", 400, errors)
    with _db() as (conn, cur):
        user_id = _user_id(cur)
        defn = _load(cur, public_id, user_id)
        _not_builtin(defn)
        if wanted_mcp:     # only this agent's own MCP tools may be attached
            own = set(mcp.tool_names_for(cur, defn.id))
            if any(t not in own for t in wanted_mcp):
                raise BuilderError("Invalid agent", 400, ["tools contains an MCP tool this agent does not have"])
        if "permissions" in clean:
            channel_ok = builder.channel_checker(cur, user_id, defn.community_id)
            if any(not channel_ok(c) for c in clean["permissions"]["channel_ids"]):
                raise BuilderError("permissions.channel_ids contains a channel you cannot use for this agent", 400)
        builder.update_agent(cur, defn.id, clean)
        conn.commit()
    invalidate_cache()
    return jsonify(_out(get_definition_by_public_id(public_id))), 200


@agent_builder_bp.route("/agents/<public_id>/publish", methods=["POST"])
@jwt_required()
def publish(public_id: str):
    with _db() as (conn, cur):
        user_id = _user_id(cur)
        defn = _load(cur, public_id, user_id)
        _not_builtin(defn)
        live = [t for t in defn.triggers if t.enabled]
        if not live:
            raise BuilderError("Add at least one trigger before publishing.", 400)
        for t in live:
            if t.type == "schedule":      # start counting from now, not from when it was drafted
                cur.execute("UPDATE agent_triggers SET next_run_at = %s WHERE id = %s",
                            (next_run_utc(t.config), t.id))
        builder.set_status(cur, defn, "active")
        conn.commit()
    invalidate_cache()
    return jsonify(_out(get_definition_by_public_id(public_id))), 200


@agent_builder_bp.route("/agents/<public_id>/pause", methods=["POST"])
@jwt_required()
def pause(public_id: str):
    with _db() as (conn, cur):
        defn = _load(cur, public_id, _user_id(cur))
        _not_builtin(defn)
        builder.set_status(cur, defn, "paused")
        conn.commit()
    invalidate_cache()
    return jsonify(_out(get_definition_by_public_id(public_id))), 200


@agent_builder_bp.route("/agents/<public_id>", methods=["DELETE"])
@jwt_required()
def archive(public_id: str):
    with _db() as (conn, cur):
        defn = _load(cur, public_id, _user_id(cur))
        _not_builtin(defn)
        builder.set_status(cur, defn, "archived")
        conn.commit()
    invalidate_cache()
    return jsonify({"status": "archived"}), 200


@agent_builder_bp.route("/agents/<public_id>/triggers", methods=["PUT"])
@jwt_required()
def put_triggers(public_id: str):
    with _db() as (conn, cur):
        user_id = _user_id(cur)
        defn = _load(cur, public_id, user_id)
        _not_builtin(defn)
        triggers, errors = builder.validate_triggers(
            _body().get("triggers"), community_id=defn.community_id,
            channel_ok=builder.channel_checker(cur, user_id, defn.community_id))
        if errors:
            raise BuilderError("Invalid triggers", 400, errors)
        builder.replace_triggers(cur, defn.id, triggers)
        conn.commit()
    invalidate_cache()
    return jsonify(_out(get_definition_by_public_id(public_id))), 200


# ── knowledge ───────────────────────────────────────────────────────────

@agent_builder_bp.route("/agents/<public_id>/knowledge", methods=["GET"])
@jwt_required()
def list_knowledge(public_id: str):
    with _db() as (_, cur):
        defn = _load(cur, public_id, _user_id(cur))
        return jsonify({"sources": knowledge.list_sources(cur, defn.id)}), 200


@agent_builder_bp.route("/agents/<public_id>/knowledge", methods=["POST"])
@jwt_required()
def add_knowledge(public_id: str):
    upload = request.files.get("file")
    data = request.form if upload else _body()
    with _db() as (conn, cur):
        user_id = _user_id(cur)
        defn = _load(cur, public_id, user_id)
        _not_builtin(defn)
        cur.execute("SELECT COUNT(*) AS n FROM agent_knowledge_sources WHERE agent_id = %s", (defn.id,))
        if int((cur.fetchone() or {}).get("n") or 0) >= MAX_SOURCES_PER_AGENT:
            raise BuilderError(f"An agent can have at most {MAX_SOURCES_PER_AGENT} knowledge sources.", 409)

        title = str(data.get("title") or "").strip()
        if upload:
            raw = upload.read(knowledge.MAX_FILE_BYTES + 1)
            text = knowledge.extract_text(upload.filename or "", raw)
            result = knowledge.add_source(cur, defn.id, type="file", title=title or upload.filename or "Document",
                                          text=text, ref=upload.filename)
        elif data.get("type") == "text":
            result = knowledge.add_source(cur, defn.id, type="text", title=title or "Notes",
                                          text=str(data.get("text") or ""))
        elif data.get("type") == "channel":
            channel_id = data.get("channel_id")
            if isinstance(channel_id, bool) or not isinstance(channel_id, int) \
                    or not builder.channel_checker(cur, user_id, defn.community_id)(channel_id):
                raise BuilderError("channel_id is not a channel you can use for this agent", 400)
            cur.execute("SELECT name FROM channels WHERE id = %s", (channel_id,))
            name = (cur.fetchone() or {}).get("name") or str(channel_id)
            result = knowledge.add_source(cur, defn.id, type="channel", title=title or f"#{name} history",
                                          text=knowledge.read_channel_text(cur, channel_id), ref=str(channel_id))
        else:
            raise BuilderError("Send a file, or JSON with type 'text' or 'channel'.", 400)
        conn.commit()
    return jsonify(result), 201


@agent_builder_bp.route("/agents/<public_id>/knowledge/<int:source_id>", methods=["DELETE"])
@jwt_required()
def delete_knowledge(public_id: str, source_id: int):
    with _db() as (conn, cur):
        defn = _load(cur, public_id, _user_id(cur))
        _not_builtin(defn)
        if not knowledge.delete_source(cur, defn.id, source_id):
            raise BuilderError("Knowledge source not found", 404)
        conn.commit()
    return jsonify({"deleted": source_id}), 200


# ── test run + history ──────────────────────────────────────────────────

def _within_test_rate(user_id: int) -> bool:
    try:
        from services.redis_client import get_redis
        r = get_redis()
        if r is None:
            return True
        key = f"agent_builder:test_rate:{user_id}"
        n = r.incr(key)
        if n == 1:
            r.expire(key, 60)
        return n <= TEST_RATE_PER_MINUTE
    except Exception:  # noqa: BLE001
        return True


def _preview(value: Any) -> Any:
    text = value if isinstance(value, str) else str(value)
    return value if value is None or len(text) <= STEP_RESULT_PREVIEW else text[:STEP_RESULT_PREVIEW] + "…"


@agent_builder_bp.route("/agents/<public_id>/test", methods=["POST"])
@jwt_required()
def test_agent(public_id: str):
    """Dry run: the agent answers as it would live but nothing is posted to any channel."""
    from agents.runtime.loop import STATUS_UNAVAILABLE, run_agent
    from agents.runtime.store import get_default_store
    from agents.runtime.tools import ToolContext

    data = _body()
    message = str(data.get("message") or "").strip()
    if not message or len(message) > MAX_TEST_MESSAGE:
        raise BuilderError(f"message must be 1 to {MAX_TEST_MESSAGE} characters", 400)

    with _db() as (_, cur):
        user_id = _user_id(cur)
        defn = _load(cur, public_id, user_id)
        if not _within_test_rate(user_id):
            raise BuilderError("Too many test runs. Wait a minute.", 429)
        channel_id = data.get("channel_id")
        community_id = defn.community_id
        if channel_id is not None:
            if isinstance(channel_id, bool) or not isinstance(channel_id, int) \
                    or not builder.channel_checker(cur, user_id, defn.community_id)(channel_id):
                raise BuilderError("channel_id is not a channel you can use for this agent", 400)
            cur.execute("SELECT community_id FROM channels WHERE id = %s", (channel_id,))
            community_id = (cur.fetchone() or {}).get("community_id")
        username = get_jwt_identity()

    ctx = ToolContext(invoked_by=user_id, community_id=community_id, channel_id=channel_id, is_dry_run=True,
                      extra={"invoker_username": username, "agent_id": defn.id,
                                    "builtin": defn.is_builtin})
    if any(t.startswith("mcp_") for t in defn.tools):
        mcp.register_for_agent(defn.id)
    result = run_agent(to_spec(defn), message, ctx=ctx, store=get_default_store(), trigger_type="test",
                       agent_id=defn.id)
    if result.status == STATUS_UNAVAILABLE:
        raise BuilderError("The AI service is not configured.", 503)
    return jsonify({
        "status": result.status, "text": result.text, "error": result.error,
        "tool_calls": result.tool_calls, "tokens": {"in": result.tokens_in, "out": result.tokens_out},
        "model": result.model, "run_id": result.run_uuid,
        "steps": [{"step": s["step_no"], "kind": s["kind"], "tool": s.get("tool_name"),
                   "args": s.get("args"), "result": _preview(s.get("result")),
                   "latency_ms": s.get("latency_ms")} for s in result.steps],
    }), 200


# ── ask Aura privately ──────────────────────────────────────────────────

@agent_builder_bp.route("/aura/ask", methods=["POST"])
@jwt_required()
def ask_aura():
    """The private Ask box: Aura answers the person who asked, nothing is posted anywhere."""
    data = _body()
    channel_id = data.get("channel_id")
    with _db() as (_, cur):
        user_id = _user_id(cur)
    try:
        out = aura_ask.ask(user_id, str(data.get("question") or ""), channel_id=channel_id,
                           username=get_jwt_identity())
    except aura_ask.AskError as err:
        raise BuilderError(err.message, err.status)
    return jsonify(out), 200


@agent_builder_bp.route("/aura/memory", methods=["DELETE"])
@jwt_required()
def clear_aura_memory():
    """Forget what Aura remembers of this person's private questions."""
    with _db() as (_, cur):
        user_id = _user_id(cur)
    return jsonify({"success": aura_ask.forget(user_id)}), 200


def _iso(v: Any) -> Any:
    """ISO text for a DATETIME; the database stores UTC, so mark it (a bare timestamp reads as local time)."""
    if not hasattr(v, "isoformat"):
        return v
    text = v.isoformat()
    return text if getattr(v, "tzinfo", None) else text + "Z"


@agent_builder_bp.route("/agents/<public_id>/runs", methods=["GET"])
@jwt_required()
def list_runs(public_id: str):
    limit = max(1, min(request.args.get("limit", 20, type=int), 100))
    offset = max(0, request.args.get("offset", 0, type=int))
    with _db() as (_, cur):
        defn = _load(cur, public_id, _user_id(cur))
        cur.execute(
            "SELECT run_uuid, trigger_type, is_dry_run, status, input_text, output_text, step_count, "
            "tokens_in, tokens_out, error, started_at, finished_at FROM agent_runs "
            "WHERE agent_id = %s ORDER BY id DESC LIMIT %s OFFSET %s", (defn.id, limit, offset))
        runs = [{**r, "is_dry_run": bool(r["is_dry_run"]), "started_at": _iso(r["started_at"]),
                 "finished_at": _iso(r["finished_at"])} for r in cur.fetchall() or []]
    return jsonify({"runs": runs}), 200


@agent_builder_bp.route("/runs/<run_uuid>", methods=["GET"])
@jwt_required()
def get_run(run_uuid: str):
    import json as _json
    with _db() as (_, cur):
        user_id = _user_id(cur)
        cur.execute("SELECT id, agent_id, run_uuid, trigger_type, is_dry_run, status, input_text, output_text, "
                    "step_count, tokens_in, tokens_out, error, started_at, finished_at "
                    "FROM agent_runs WHERE run_uuid = %s", (run_uuid,))
        run = cur.fetchone()
        defn = get_definition(run["agent_id"], include_inactive=True) if run and run["agent_id"] else None
        if run is None or defn is None or not builder.can_manage(cur, user_id, defn):
            raise BuilderError("Run not found", 404)
        cur.execute("SELECT step_no, kind, tool_name, args_json, result_json, latency_ms FROM agent_run_steps "
                    "WHERE run_id = %s ORDER BY step_no", (run["id"],))

        def load(v: Any) -> Any:
            try:
                return _json.loads(v) if v else None
            except (TypeError, ValueError):
                return v
        steps = [{"step": s["step_no"], "kind": s["kind"], "tool": s["tool_name"], "args": load(s["args_json"]),
                  "result": _preview(load(s["result_json"])), "latency_ms": s["latency_ms"]}
                 for s in cur.fetchall() or []]
        run.pop("id")
        run.pop("agent_id")
        return jsonify({**run, "is_dry_run": bool(run["is_dry_run"]), "started_at": _iso(run["started_at"]),
                        "finished_at": _iso(run["finished_at"]), "steps": steps}), 200


# ── approvals: what agents want to do, waiting for a person to say yes ────

@agent_builder_bp.route("/approvals", methods=["GET"])
@jwt_required()
def list_approvals():
    view = request.args.get("status", "pending")
    if view not in approvals.LIST_FILTERS:
        raise BuilderError(f"status must be one of {list(approvals.LIST_FILTERS)}", 400)
    with _db() as (_, cur):
        user_id = _user_id(cur)
    return jsonify({"approvals": approvals.list_for(user_id, view, request.args.get("limit", 50, type=int))}), 200


def _decide(approval_id: int, approve: bool):
    from tasks.agent_runtime_tasks import resolve_approval_task
    with _db() as (_, cur):
        user_id = _user_id(cur)
    row = approvals.decide(approval_id, user_id, approve)
    try:
        resolve_approval_task.delay(approval_id)
    except Exception:  # noqa: BLE001  (broker down: do the work here rather than lose the decision)
        log.exception("could not queue approval %s; resolving inline", approval_id)
        resolve_approval_task.apply(args=(approval_id,))
    return jsonify({"id": row["id"], "status": approvals.APPROVED if approve else approvals.REJECTED}), 200


@agent_builder_bp.route("/approvals/<int:approval_id>/approve", methods=["POST"])
@jwt_required()
def approve_approval(approval_id: int):
    return _decide(approval_id, True)


@agent_builder_bp.route("/approvals/<int:approval_id>/reject", methods=["POST"])
@jwt_required()
def reject_approval(approval_id: int):
    return _decide(approval_id, False)
