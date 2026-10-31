# routes/agent_integrations.py — API keys and webhooks for agents.
#
# Two blueprints:
#   agent_integrations_bp  /api/agent-builder/agents/<id>/api-keys|webhooks   (logged-in managers)
#   public_agent_api_bp    /api/public/v1/...                                  (Bearer API key)
#
# A key acts as ONE agent, with the access of that agent's owner (never more): it can post a
# message as the agent and ask the agent to run (writes still wait for the owner's approval).
import html
from typing import Any, Dict, Optional

from flask import Blueprint, Response, jsonify, request
from flask_jwt_extended import jwt_required

from agents.runtime import builder, integrations, mcp, permissions
from agents.runtime.builder import BuilderError
from agents.runtime.definitions import get_definition, invalidate_cache
from routes.agent_builder import _body, _db, _load, _not_builtin, _user_id

agent_integrations_bp = Blueprint("agent_integrations", __name__, url_prefix="/api/agent-builder")
public_agent_api_bp = Blueprint("public_agent_api", __name__, url_prefix="/api/public/v1")


@agent_integrations_bp.errorhandler(BuilderError)
@public_agent_api_bp.errorhandler(BuilderError)
def _builder_error(err: BuilderError):
    body: Dict[str, Any] = {"error": err.message}
    if err.details:
        body["details"] = err.details
    return jsonify(body), err.status


# ── management (logged-in) ──────────────────────────────────────────────

def _managed(cur: Any, public_id: str):
    defn = _load(cur, public_id, _user_id(cur))
    _not_builtin(defn)
    return defn


@agent_integrations_bp.route("/agents/<public_id>/api-keys", methods=["GET"])
@jwt_required()
def list_keys(public_id: str):
    with _db() as (_, cur):
        return jsonify({"keys": integrations.list_keys(cur, _managed(cur, public_id).id)}), 200


@agent_integrations_bp.route("/agents/<public_id>/api-keys", methods=["POST"])
@jwt_required()
def create_key(public_id: str):
    with _db() as (conn, cur):
        defn = _managed(cur, public_id)
        view, key = integrations.create_key(cur, defn.id, _user_id(cur), str(_body().get("name") or ""))
        conn.commit()
    return jsonify({**view, "key": key, "note": "Copy the key now. It cannot be shown again."}), 201


@agent_integrations_bp.route("/agents/<public_id>/api-keys/<int:key_id>", methods=["DELETE"])
@jwt_required()
def revoke_key(public_id: str, key_id: int):
    with _db() as (conn, cur):
        if not integrations.revoke_key(cur, _managed(cur, public_id).id, key_id):
            raise BuilderError("Key not found", 404)
        conn.commit()
    return jsonify({"revoked": key_id}), 200


@agent_integrations_bp.route("/agents/<public_id>/webhooks", methods=["GET"])
@jwt_required()
def list_webhooks(public_id: str):
    with _db() as (_, cur):
        return jsonify({"webhooks": integrations.list_webhooks(cur, _managed(cur, public_id).id),
                        "events": list(integrations.EVENTS)}), 200


@agent_integrations_bp.route("/agents/<public_id>/webhooks", methods=["POST"])
@jwt_required()
def create_webhook(public_id: str):
    data = _body()
    with _db() as (conn, cur):
        defn = _managed(cur, public_id)
        view, secret = integrations.create_webhook(cur, defn.id, _user_id(cur), str(data.get("url") or ""), data.get("events"))
        conn.commit()
    return jsonify({**view, "secret": secret, "note": "Copy the signing secret now. It cannot be shown again."}), 201


@agent_integrations_bp.route("/agents/<public_id>/webhooks/<int:webhook_id>", methods=["DELETE"])
@jwt_required()
def delete_webhook(public_id: str, webhook_id: int):
    with _db() as (conn, cur):
        if not integrations.delete_webhook(cur, _managed(cur, public_id).id, webhook_id):
            raise BuilderError("Webhook not found", 404)
        conn.commit()
    return jsonify({"deleted": webhook_id}), 200


# ── MCP servers ─────────────────────────────────────────────────────────

@agent_integrations_bp.route("/agents/<public_id>/mcp", methods=["GET"])
@jwt_required()
def list_mcp(public_id: str):
    with _db() as (_, cur):
        return jsonify({"servers": mcp.list_servers(cur, _managed(cur, public_id).id)}), 200


@agent_integrations_bp.route("/agents/<public_id>/mcp", methods=["POST"])
@jwt_required()
def add_mcp(public_id: str):
    data = _body()
    stdio = data.get("transport") == "stdio"
    with _db() as (conn, cur):
        defn = _managed(cur, public_id)
        user_id = _user_id(cur)
        if stdio and not builder.is_system_admin(cur, user_id):
            raise BuilderError("Only a system admin can connect a program that runs on the server.", 403)
        server_id = mcp.add_server(
            cur, defn.id, user_id, str(data.get("name") or ""),
            str(data.get("stdio_name" if stdio else "url") or ""), str(data.get("token") or ""),
            auth=str(data.get("auth") or "token"), client_id=str(data.get("client_id") or ""),
            client_secret=str(data.get("client_secret") or ""), transport="stdio" if stdio else "http")
        conn.commit()
        if data.get("auth") == "oauth" and not stdio:       # nothing to list until the person has logged in
            return jsonify(next(s for s in mcp.list_servers(cur, defn.id) if s["id"] == server_id)), 201
        try:
            view = mcp.refresh_tools(cur, defn.id, server_id)
        except BuilderError as exc:       # saved, but it could not be reached yet: say so and let them retry
            conn.commit()
            return jsonify({**next(s for s in mcp.list_servers(cur, defn.id) if s["id"] == server_id),
                            "warning": exc.message}), 201
        conn.commit()
    return jsonify(view), 201


@agent_integrations_bp.route("/mcp/stdio-servers", methods=["GET"])
@jwt_required()
def stdio_servers():
    """Names of the programs the operator allows (system admins only; everyone else sees an empty list)."""
    with _db() as (_, cur):
        allowed = builder.is_system_admin(cur, _user_id(cur))
    return jsonify({"servers": sorted(mcp.mcp_stdio.stdio_servers()) if allowed else []}), 200


@agent_integrations_bp.route("/agents/<public_id>/mcp/<int:server_id>/oauth/start", methods=["POST"])
@jwt_required()
def start_mcp_oauth(public_id: str, server_id: int):
    """Begin the login: returns the provider's address, which the browser opens in a new window."""
    with _db() as (conn, cur):
        defn = _managed(cur, public_id)
        url = mcp.start_oauth(cur, defn.id, server_id, _user_id(cur), str(_body().get("redirect_uri") or ""))
        conn.commit()
    return jsonify({"authorization_url": url}), 200


def _callback_page(ok: bool, message: str) -> Response:
    text = html.escape(message)
    page = (f"<!doctype html><meta charset=utf-8><title>AuraFlow</title><body style='font-family:sans-serif;padding:2rem'>"
            f"<h3>{'Connected' if ok else 'Could not connect'}</h3><p>{text}</p>"
            f"<script>try{{window.opener&&window.opener.postMessage({{type:'auraflow-mcp-oauth',ok:{str(ok).lower()}}},"
            f"window.location.origin)}}catch(e){{}}setTimeout(function(){{window.close()}},1200)</script>")
    return Response(page, status=200 if ok else 400, mimetype="text/html")


@agent_integrations_bp.route("/mcp/oauth/callback", methods=["GET"])
def mcp_oauth_callback():
    """Where the provider sends the browser back. No login here: the single-use ``state`` identifies the flow."""
    if request.args.get("error"):
        return _callback_page(False, "The provider did not allow the login.")
    state, code = request.args.get("state", ""), request.args.get("code", "")
    if not state or not code or len(state) > 64 or len(code) > 2000:
        return _callback_page(False, "The login link is incomplete.")
    try:
        with _db() as (conn, cur):
            mcp.mcp_oauth.complete(cur, state, code)
            conn.commit()
    except mcp.mcp_oauth.OAuthError as exc:
        return _callback_page(False, str(exc))
    return _callback_page(True, "You can close this window and go back to AuraFlow.")


@agent_integrations_bp.route("/agents/<public_id>/mcp/<int:server_id>/refresh", methods=["POST"])
@jwt_required()
def refresh_mcp(public_id: str, server_id: int):
    with _db() as (conn, cur):
        defn = _managed(cur, public_id)
        try:
            view = mcp.refresh_tools(cur, defn.id, server_id)
        except BuilderError:
            conn.commit()                 # keep the recorded error
            raise
        conn.commit()
    return jsonify(view), 200


@agent_integrations_bp.route("/agents/<public_id>/mcp/<int:server_id>", methods=["DELETE"])
@jwt_required()
def delete_mcp(public_id: str, server_id: int):
    with _db() as (conn, cur):
        defn = _managed(cur, public_id)
        if not mcp.delete_server(cur, defn.id, server_id):
            raise BuilderError("Server not found", 404)
        # The agent can no longer use tools of a server it no longer has.
        remaining = set(mcp.tool_names_for(cur, defn.id))
        kept = [t for t in defn.tools if not mcp.is_mcp_tool(t) or t in remaining]
        if len(kept) != len(defn.tools):
            builder.update_agent(cur, defn.id, {"tools": kept})
        conn.commit()
    invalidate_cache()
    return jsonify({"deleted": server_id}), 200


# ── public API (API key) ────────────────────────────────────────────────

def _authenticate() -> Dict[str, Any]:
    """The active agent behind the request's Bearer key (as ``{'key_id', 'defn'}``) or a 401/429."""
    token = integrations.bearer_token(request.headers.get("Authorization"))
    with _db() as (conn, cur):
        row = integrations.find_agent_for_key(cur, token)
        conn.commit()
    if row is None:
        raise BuilderError("Invalid or revoked API key", 401)
    if not integrations.within_rate(row["id"]):
        raise BuilderError("Too many requests. Try again in a minute.", 429)
    defn = get_definition(row["agent_id"])
    if defn is None:
        raise BuilderError("This agent is not live.", 409)
    return {"key_id": row["id"], "defn": defn}


def _target_channel(defn: Any, channel_id: Any) -> Dict[str, Any]:
    """The channel the agent may use, judged with its owner's access, or a 400/403."""
    if isinstance(channel_id, bool) or not isinstance(channel_id, int):
        raise BuilderError("channel_id must be a whole number", 400)
    channel = permissions.channel_info(channel_id)
    if channel is None or channel.get("type") == "voice":
        raise BuilderError("Channel not found", 404)
    if not defn.owner_user_id or not permissions.can_read_channel(defn.owner_user_id, channel_id) \
            or not permissions.agent_may_act_in_channel(defn, channel):
        raise BuilderError("This agent cannot use that channel", 403)
    return channel


@public_agent_api_bp.route("/agent", methods=["GET"])
def whoami():
    defn = _authenticate()["defn"]
    return jsonify({"id": defn.public_id, "name": defn.name, "username": defn.bot_username,
                    "status": defn.status}), 200


@public_agent_api_bp.route("/messages", methods=["POST"])
def post_message():
    """Post ``text`` in a channel as the agent. No approval step: the key holder is trusted with this one action."""
    defn = _authenticate()["defn"]
    data = _body()
    text = str(data.get("text") or "").strip()
    if not 1 <= len(text) <= integrations.MAX_PUBLIC_TEXT:
        raise BuilderError(f"text must be 1 to {integrations.MAX_PUBLIC_TEXT} characters", 400)
    channel = _target_channel(defn, data.get("channel_id"))
    from agents.runtime.posting import post_as_agent
    posted = post_as_agent(defn, channel["id"], text)
    if posted is None:
        raise BuilderError("The message could not be posted", 502)
    return jsonify({"message_id": posted["id"], "channel_id": channel["id"]}), 201


@public_agent_api_bp.route("/invoke", methods=["POST"])
def invoke():
    """Ask the agent to handle ``message`` in a channel. The answer is posted there; writes need the owner's approval."""
    auth = _authenticate()
    defn = auth["defn"]
    data = _body()
    message = str(data.get("message") or "").strip()
    if not 1 <= len(message) <= integrations.MAX_PUBLIC_TEXT:
        raise BuilderError(f"message must be 1 to {integrations.MAX_PUBLIC_TEXT} characters", 400)
    channel = _target_channel(defn, data.get("channel_id"))
    from agents.runtime.router_agent import _runs_today
    if _runs_today(defn.id) >= defn.daily_run_cap:
        raise BuilderError("This agent has reached its daily run limit.", 429)
    from tasks.agent_runtime_tasks import run_agent_task
    trigger = {"type": "api", "channel_id": channel["id"], "community_id": channel.get("community_id"),
               "user_id": defn.owner_user_id, "content": message, "username": None}
    try:
        run_agent_task.delay(defn.id, trigger)
    except Exception:  # noqa: BLE001
        raise BuilderError("The agent could not be started. Try again shortly.", 503)
    return jsonify({"queued": True}), 202
