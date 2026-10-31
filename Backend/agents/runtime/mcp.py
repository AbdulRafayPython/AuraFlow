"""
MCP client
==========
Lets an agent use tools from an MCP (Model Context Protocol) server, over the Streamable HTTP
transport (JSON-RPC 2.0 over POST; replies are JSON or a short Server-Sent-Events stream).

Safety rules, in the order they matter:

* The server URL is public https only (``utils.net_guard``), checked before every request;
  redirects are never followed; replies are size capped; every call has a timeout.
* Only the agent's own servers are used: tool names carry the agent id, the validation of an
  agent's tool list only accepts its own MCP tools, and a tool re-reads its server row (and
  re-checks the agent id) on every call, so removing a server stops it at once.
* A tool is a *read* tool only when the server says ``readOnlyHint: true``. Everything else is a
  *write* tool: it waits for the approver, who sees the exact arguments.
* What a server sends (names, descriptions, results) is untrusted: descriptions are trimmed,
  results go through the loop's untrusted-data wrapper.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from contextlib import contextmanager
from typing import Any, Callable, Dict, Iterable, Iterator, List, Optional, Tuple

from agents.runtime import mcp_oauth, mcp_stdio
from agents.runtime.builder import BuilderError
from agents.runtime.tools import RISK_READ, RISK_WRITE, TOOL_REGISTRY, Tool, ToolContext, ToolError
from database import get_db_connection
from utils.encryption import decrypt, encrypt
from utils.net_guard import UnsafeURL, check_public_url

log = logging.getLogger(__name__)

PROTOCOL_VERSION = "2025-03-26"
TIMEOUT = 15
MAX_BODY_BYTES = 1_000_000
MAX_RESULT_CHARS = 8000
MAX_SERVERS_PER_AGENT = 3
MAX_TOOLS_PER_SERVER = 20
MAX_PAGES = 3
MAX_DESCRIPTION = 300
MAX_TOKEN_CHARS = 2000
NAME_PREFIX = "mcp_"
MAX_TOOL_NAME = 64


class McpError(Exception):
    """A problem talking to a server. The message is safe to show to the user."""


# ── protocol ────────────────────────────────────────────────────────────

def _read_limited(resp: Any) -> bytes:
    chunks, size = [], 0
    for chunk in resp.iter_content(8192):
        size += len(chunk)
        if size > MAX_BODY_BYTES:
            raise McpError("The server's reply is too large.")
        chunks.append(chunk)
    return b"".join(chunks)


def parse_reply(content_type: str, body: bytes, request_id: Optional[int]) -> Dict[str, Any]:
    """The JSON-RPC response for ``request_id`` from a JSON or event-stream body."""
    text = body.decode("utf-8", errors="replace")
    if "text/event-stream" in (content_type or ""):
        for event in re.split(r"\r?\n\r?\n", text):
            data = "\n".join(line[5:].lstrip() for line in event.splitlines() if line.startswith("data:"))
            if not data:
                continue
            try:
                message = json.loads(data)
            except ValueError:
                continue
            if isinstance(message, dict) and message.get("id") == request_id:
                return message
        raise McpError("The server did not answer the request.")
    try:
        message = json.loads(text)
    except ValueError:
        raise McpError("The server sent a reply that is not valid JSON.")
    if isinstance(message, list):
        message = next((m for m in message if isinstance(m, dict) and m.get("id") == request_id), None)
    if not isinstance(message, dict):
        raise McpError("The server sent an unexpected reply.")
    return message


class McpClient:
    """One short conversation with a server: initialize, then a request or two."""

    def __init__(self, url: str, token: Optional[str] = None, *, http_post: Optional[Callable[..., Any]] = None):
        self.url, self.token = url, token or ""
        self._post = http_post
        self._next_id = 0
        self._session: Optional[str] = None
        self._ready = False
        self.capabilities: Dict[str, Any] = {}

    def _headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream",
                   "User-Agent": "AuraFlow-MCP/1"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        if self._session:
            headers["Mcp-Session-Id"] = self._session
        return headers

    def _send(self, payload: Dict[str, Any]) -> Any:
        try:
            url = check_public_url(self.url)
        except UnsafeURL as exc:
            raise McpError(str(exc))
        post = self._post
        if post is None:
            import requests
            post = requests.post
        try:
            return post(url, data=json.dumps(payload).encode("utf-8"), headers=self._headers(), timeout=TIMEOUT,
                        allow_redirects=False, stream=True)
        except Exception as exc:  # noqa: BLE001
            log.info("[RUNTIME] MCP request failed: %s", exc)
            raise McpError("The server could not be reached.")

    def _request(self, method: str, params: Optional[Dict[str, Any]] = None) -> Any:
        self._next_id += 1
        request_id = self._next_id
        resp = self._send({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params or {}})
        try:
            if resp.status_code in (401, 403):
                raise McpError("The server refused the access token.")
            if not 200 <= resp.status_code < 300:
                raise McpError(f"The server answered HTTP {resp.status_code}.")
            session = resp.headers.get("Mcp-Session-Id")
            if session:
                self._session = session
            message = parse_reply(resp.headers.get("Content-Type", ""), _read_limited(resp), request_id)
        finally:
            close = getattr(resp, "close", None)
            if close:
                close()
        if "error" in message:
            raise McpError(str((message["error"] or {}).get("message") or "The server returned an error.")[:200])
        return message.get("result")

    def initialize(self) -> None:
        if self._ready:
            return
        info = self._request("initialize", {"protocolVersion": PROTOCOL_VERSION, "capabilities": {},
                                            "clientInfo": {"name": "AuraFlow", "version": "1"}})
        caps = (info or {}).get("capabilities") if isinstance(info, dict) else None
        self.capabilities = caps if isinstance(caps, dict) else {}
        resp = self._send({"jsonrpc": "2.0", "method": "notifications/initialized"})
        close = getattr(resp, "close", None)
        if close:
            close()
        self._ready = True

    def list_tools(self) -> List[Dict[str, Any]]:
        self.initialize()
        tools: List[Dict[str, Any]] = []
        cursor: Optional[str] = None
        for _ in range(MAX_PAGES):
            result = self._request("tools/list", {"cursor": cursor} if cursor else {}) or {}
            tools.extend(t for t in result.get("tools", []) if isinstance(t, dict) and t.get("name"))
            cursor = result.get("nextCursor")
            if not cursor or len(tools) >= MAX_TOOLS_PER_SERVER:
                break
        return tools[:MAX_TOOLS_PER_SERVER]

    def call_tool(self, name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        self.initialize()
        return format_result(self._request("tools/call", {"name": name, "arguments": arguments}) or {})

    # Resources and prompts (read-only parts of the protocol). Callers only use these when
    # ``capabilities`` says the server has them.
    def list_resources(self) -> Dict[str, Any]:
        self.initialize()
        return self._request("resources/list", {}) or {}

    def read_resource(self, uri: str) -> Dict[str, Any]:
        self.initialize()
        return self._request("resources/read", {"uri": uri}) or {}

    def list_prompts(self) -> Dict[str, Any]:
        self.initialize()
        return self._request("prompts/list", {}) or {}

    def get_prompt(self, name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        self.initialize()
        return self._request("prompts/get", {"name": name, "arguments": arguments}) or {}


# ── resources and prompts as read-only tools ────────────────────────────

MAX_LIST_ITEMS = 50
MAX_URI_CHARS = 2000

#: kind -> (remote name, description, argument schema). A server that advertises ``resources`` or
#: ``prompts`` in its capabilities gets these tools next to its own; all are read-only.
EXTRA_KINDS: Dict[str, Tuple[str, str, Dict[str, Any]]] = {
    "resources_list": ("resources_list", "List the documents (resources) this server offers, with their addresses.",
                       {"type": "object", "properties": {}}),
    "resources_read": ("resources_read", "Read one document (resource) of this server by its address (uri).",
                       {"type": "object", "properties": {"uri": {"type": "string", "minLength": 1, "maxLength": MAX_URI_CHARS}},
                        "required": ["uri"]}),
    "prompts_list": ("prompts_list", "List the ready-made prompts this server offers.", {"type": "object", "properties": {}}),
    "prompts_get": ("prompts_get", "Get one ready-made prompt of this server by name, with its arguments filled in.",
                    {"type": "object", "properties": {"name": {"type": "string", "minLength": 1, "maxLength": 200},
                                                      "arguments": {"type": "object"}}, "required": ["name"]}),
}


def extra_definitions(capabilities: Dict[str, Any], taken: Iterable[str]) -> List[Dict[str, Any]]:
    """Synthetic tool definitions for the resources / prompts a server advertises (never replacing a real tool)."""
    taken = set(taken)
    # A capability is advertised by being present: ``"resources": {}`` is an (empty) yes.
    wanted = [k for k in EXTRA_KINDS if isinstance(capabilities, dict) and k.split("_")[0] in capabilities]
    return [{"name": EXTRA_KINDS[k][0], "description": EXTRA_KINDS[k][1], "inputSchema": EXTRA_KINDS[k][2],
             "annotations": {"readOnlyHint": True}, "kind": k} for k in wanted if EXTRA_KINDS[k][0] not in taken]


def _lines(items: List[str]) -> str:
    return "\n".join(items)[:MAX_RESULT_CHARS] or "(nothing)"


def format_resources(result: Dict[str, Any]) -> Dict[str, Any]:
    rows = []
    for r in (result.get("resources") or [])[:MAX_LIST_ITEMS]:
        if isinstance(r, dict) and r.get("uri"):
            label = str(r.get("name") or r.get("title") or "")
            note = str(r.get("description") or "")[:120]
            rows.append(f"- {r['uri']}" + (f" ({label}{': ' + note if note else ''})" if label else ""))
    return {"text": _lines(rows)}


def format_resource(result: Dict[str, Any]) -> Dict[str, Any]:
    parts = []
    for c in result.get("contents") or []:
        if isinstance(c, dict) and isinstance(c.get("text"), str):
            parts.append(c["text"])
        elif isinstance(c, dict):
            parts.append(f"[{c.get('mimeType') or 'binary'} content omitted]")
    return {"text": "\n\n".join(parts)[:MAX_RESULT_CHARS] or "(empty)"}


def format_prompts(result: Dict[str, Any]) -> Dict[str, Any]:
    rows = []
    for p in (result.get("prompts") or [])[:MAX_LIST_ITEMS]:
        if isinstance(p, dict) and p.get("name"):
            args = ", ".join(str(a.get("name")) + ("*" if a.get("required") else "") for a in p.get("arguments") or []
                             if isinstance(a, dict) and a.get("name"))
            rows.append(f"- {p['name']}: {str(p.get('description') or '')[:120]}" + (f" (arguments: {args})" if args else ""))
    return {"text": _lines(rows)}


def format_prompt(result: Dict[str, Any]) -> Dict[str, Any]:
    rows = [str(result["description"])[:300]] if result.get("description") else []
    for m in result.get("messages") or []:
        content = m.get("content") if isinstance(m, dict) else None
        text = content.get("text") if isinstance(content, dict) else content if isinstance(content, str) else None
        rows.append(f"{(m.get('role') if isinstance(m, dict) else '') or 'message'}: {text if isinstance(text, str) else '[non-text content omitted]'}")
    return {"text": _lines(rows)}


def call_remote(client: Any, kind: str, remote: str, args: Dict[str, Any]) -> Dict[str, Any]:
    """Run one tool (``kind`` is ``tool`` or one of ``EXTRA_KINDS``) on a connected client."""
    if kind == "resources_list":
        return format_resources(client.list_resources())
    if kind == "resources_read":
        return format_resource(client.read_resource(str(args["uri"])))
    if kind == "prompts_list":
        return format_prompts(client.list_prompts())
    if kind == "prompts_get":
        arguments = args.get("arguments") if isinstance(args.get("arguments"), dict) else {}
        return format_prompt(client.get_prompt(str(args["name"]), arguments))
    return client.call_tool(remote, args)


def format_result(result: Dict[str, Any]) -> Dict[str, Any]:
    """The text of a ``tools/call`` result (non-text parts are not passed on); an error result raises ToolError."""
    parts = []
    for item in result.get("content") or []:
        if isinstance(item, dict) and item.get("type") == "text":
            parts.append(str(item.get("text") or ""))
        elif isinstance(item, dict):
            parts.append(f"[{item.get('type', 'content')} omitted]")
    text = "\n".join(parts)[:MAX_RESULT_CHARS]
    if result.get("isError"):
        raise ToolError(text or "The tool reported an error.")
    return {"text": text}


STDIO_PREFIX = "stdio:"


class StdioMcpClient:
    """Same surface as :class:`McpClient`, for a program on the operator's allow-list (see ``mcp_stdio``)."""

    def __init__(self, name: str):
        self.name = name
        self.capabilities: Dict[str, Any] = {}

    def _run(self, action: Callable[[Any], Any]) -> Any:
        try:
            with mcp_stdio.StdioSession(self.name) as session:
                session.initialize()
                self.capabilities = session.capabilities
                return action(session)
        except mcp_stdio.StdioError as exc:
            raise McpError(str(exc))

    def list_tools(self) -> List[Dict[str, Any]]:
        return self._run(lambda s: s.list_tools(MAX_PAGES, MAX_TOOLS_PER_SERVER))

    def call_tool(self, name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        return format_result(self._run(lambda s: s.call_tool(name, arguments)))

    def list_resources(self) -> Dict[str, Any]:
        return self._run(lambda s: s.request("resources/list", {}) or {})

    def read_resource(self, uri: str) -> Dict[str, Any]:
        return self._run(lambda s: s.request("resources/read", {"uri": uri}) or {})

    def list_prompts(self) -> Dict[str, Any]:
        return self._run(lambda s: s.request("prompts/list", {}) or {})

    def get_prompt(self, name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        return self._run(lambda s: s.request("prompts/get", {"name": name, "arguments": arguments}) or {})


def make_client(cur: Any, row: Dict[str, Any], http_post: Optional[Callable[..., Any]] = None) -> Any:
    """The right client for a stored server: stdio program, OAuth login, bearer token or nothing."""
    if row.get("transport") == "stdio" or str(row.get("url") or "").startswith(STDIO_PREFIX):
        return StdioMcpClient(str(row["url"])[len(STDIO_PREFIX):])
    if row.get("oauth_json"):
        try:
            token = mcp_oauth.bearer_for(cur, row["id"], row["oauth_json"])
        except mcp_oauth.OAuthError as exc:
            raise McpError(str(exc))
    else:
        token = _token(row.get("auth_token"))
    return McpClient(row["url"], token, http_post=http_post)


# ── tool definitions ────────────────────────────────────────────────────

def _slug(text: str, limit: int) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "_", text or "").strip("_").lower()[:limit] or "x"


def tool_name(agent_id: int, server: str, tool: str) -> str:
    """``mcp_<agent id>_<server>_<tool>``, at most 64 characters and unique per (server, tool)."""
    full = f"{NAME_PREFIX}{agent_id}_{_slug(server, 24)}_{_slug(tool, 60)}"
    if len(full) <= MAX_TOOL_NAME:
        return full
    digest = hashlib.sha1(f"{server}/{tool}".encode()).hexdigest()[:6]
    return f"{full[:MAX_TOOL_NAME - 7]}_{digest}"


def is_mcp_tool(name: str) -> bool:
    return name.startswith(NAME_PREFIX)


def schema_of(definition: Dict[str, Any]) -> Dict[str, Any]:
    """The tool's argument schema in the subset the loop validates (``type: object`` + properties)."""
    raw = definition.get("inputSchema")
    if not isinstance(raw, dict) or not isinstance(raw.get("properties"), dict):
        return {"type": "object", "properties": {}}
    props = {k: {kk: vv for kk, vv in v.items() if kk in ("type", "enum", "minimum", "maximum", "minLength", "maxLength",
                                                          "description")}
             for k, v in raw["properties"].items() if isinstance(v, dict)}
    required = [r for r in raw.get("required", []) if isinstance(r, str) and r in props]
    return {"type": "object", "properties": props, "required": required}


def is_read_only(definition: Dict[str, Any]) -> bool:
    return (definition.get("annotations") or {}).get("readOnlyHint") is True


def _summarize(server: str, tool: str) -> Callable[[ToolContext, Dict[str, Any]], str]:
    def summarize(ctx: ToolContext, args: Dict[str, Any]) -> str:
        shown = json.dumps(args, ensure_ascii=False)
        return f"Use {tool} on {server}: {shown}"[:500]
    return summarize


def build_tool(agent_id: int, server_id: int, server_name: str, definition: Dict[str, Any]) -> Tool:
    remote = str(definition["name"])
    kind = definition.get("kind") if definition.get("kind") in EXTRA_KINDS else "tool"
    registered = tool_name(agent_id, server_name, remote)
    risk = RISK_READ if is_read_only(definition) else RISK_WRITE

    def func(ctx: ToolContext, **args: Any) -> Dict[str, Any]:
        if ctx.extra.get("agent_id") != agent_id:
            raise ToolError("This tool belongs to another agent.")
        with _cursor() as cur:
            cur.execute("SELECT id, url, auth_token, transport, oauth_json FROM agent_mcp_servers "
                        "WHERE id = %s AND agent_id = %s AND enabled = 1", (server_id, agent_id))
            row = cur.fetchone()
            if not row:
                raise ToolError("This connection has been removed.")
            try:
                return call_remote(make_client(cur, row), kind, remote, args)
            except McpError as exc:
                raise ToolError(str(exc))

    description = str(definition.get("description") or remote)[:MAX_DESCRIPTION]
    return Tool(name=registered, description=f"[{server_name}] {description}", parameters=schema_of(definition),
                risk=risk, func=func, summarize=None if risk == RISK_READ else _summarize(server_name, remote))


# ── storage ─────────────────────────────────────────────────────────────

@contextmanager
def _cursor() -> Iterator[Any]:
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _token(stored: Optional[str]) -> str:
    try:
        return decrypt(stored) if stored else ""
    except Exception:  # noqa: BLE001
        return ""


def _cached(row: Dict[str, Any]) -> List[Dict[str, Any]]:
    try:
        data = json.loads(row.get("tools_json") or "[]")
    except ValueError:
        return []
    return [t for t in data if isinstance(t, dict) and t.get("name")] if isinstance(data, list) else []


def _iso(value: Any) -> Optional[str]:
    if not hasattr(value, "isoformat"):
        return None
    text = value.isoformat()
    return text if value.tzinfo else text + "Z"


def public_view(row: Dict[str, Any], agent_id: int) -> Dict[str, Any]:
    tools = [{"name": tool_name(agent_id, row["name"], t["name"]), "remote_name": t["name"],
              "description": str(t.get("description") or "")[:MAX_DESCRIPTION],
              "risk": RISK_READ if is_read_only(t) else RISK_WRITE} for t in _cached(row)]
    stdio = row.get("transport") == "stdio" or str(row["url"]).startswith(STDIO_PREFIX)
    auth = "stdio" if stdio else "oauth" if row.get("oauth_json") else "token" if row.get("auth_token") else "none"
    return {"id": row["id"], "name": row["name"], "url": row["url"], "auth": auth, "has_token": bool(row.get("auth_token")),
            "oauth_connected": auth == "oauth" and mcp_oauth.is_connected(row["oauth_json"]),
            "enabled": bool(row["enabled"]), "tools": tools, "fetched_at": _iso(row.get("tools_fetched_at")),
            "last_error": row.get("last_error")}


_COLUMNS = "id, name, url, transport, auth_token, oauth_json, enabled, tools_json, tools_fetched_at, last_error"


def list_servers(cur: Any, agent_id: int) -> List[Dict[str, Any]]:
    cur.execute(f"SELECT {_COLUMNS} FROM agent_mcp_servers WHERE agent_id = %s ORDER BY id", (agent_id,))
    return [public_view(r, agent_id) for r in cur.fetchall() or []]


def add_server(cur: Any, agent_id: int, user_id: int, name: str, url: str, token: str, *, auth: str = "token",
               client_id: str = "", client_secret: str = "", transport: str = "http") -> int:
    """Connect a server. ``auth`` is ``token`` (a bearer token, optional) or ``oauth`` (log in afterwards);
    ``transport='stdio'`` connects a program from the operator's allow-list, named in ``url``."""
    name = _slug(name, 24)
    if not re.fullmatch(r"[a-z0-9_]{2,24}", name):
        raise BuilderError("name must be 2 to 24 letters or numbers", 400)
    if len(token or "") > MAX_TOKEN_CHARS or len(client_id or "") > 300 or len(client_secret or "") > MAX_TOKEN_CHARS:
        raise BuilderError("The access token or client details are too long.", 400)
    oauth_json = None
    if transport == "stdio":
        if url not in mcp_stdio.stdio_servers():
            raise BuilderError("That program is not on the operator's stdio allow-list.", 400)
        url, token = STDIO_PREFIX + url, ""
    else:
        if auth not in ("token", "oauth"):
            raise BuilderError("auth must be token or oauth", 400)
        try:
            url = check_public_url(url)
        except UnsafeURL as exc:
            raise BuilderError(str(exc), 400)
        if auth == "oauth":
            token = ""
            blob = {"client_id": client_id.strip(), "manual_client": True} if client_id.strip() else {}
            if blob and client_secret.strip():
                blob["client_secret"] = client_secret.strip()
            oauth_json = mcp_oauth.dump_blob(blob)
    cur.execute("SELECT COUNT(*) AS n FROM agent_mcp_servers WHERE agent_id = %s", (agent_id,))
    if int((cur.fetchone() or {}).get("n") or 0) >= MAX_SERVERS_PER_AGENT:
        raise BuilderError(f"An agent can have at most {MAX_SERVERS_PER_AGENT} MCP servers.", 409)
    cur.execute("SELECT 1 FROM agent_mcp_servers WHERE agent_id = %s AND name = %s", (agent_id, name))
    if cur.fetchone():
        raise BuilderError("This agent already has a server with that name.", 409)
    cur.execute("INSERT INTO agent_mcp_servers (agent_id, name, url, transport, auth_token, oauth_json, created_by) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (agent_id, name, url, "stdio" if transport == "stdio" else "http", encrypt(token) if token else None,
                 oauth_json, user_id))
    return cur.lastrowid


def start_oauth(cur: Any, agent_id: int, server_id: int, user_id: int, redirect_uri: str,
                http: Optional[Callable[..., Any]] = None) -> str:
    """Begin an OAuth login for one of the agent's servers; returns the address to open in the browser."""
    cur.execute(f"SELECT {_COLUMNS} FROM agent_mcp_servers WHERE id = %s AND agent_id = %s", (server_id, agent_id))
    row = cur.fetchone()
    if not row:
        raise BuilderError("Server not found", 404)
    if not row.get("oauth_json"):
        raise BuilderError("This server does not use OAuth.", 400)
    try:
        return mcp_oauth.start(cur, server_id, row["url"], mcp_oauth.load_blob(row["oauth_json"]), user_id, redirect_uri, http)
    except mcp_oauth.OAuthError as exc:
        raise BuilderError(str(exc), 400)


def delete_server(cur: Any, agent_id: int, server_id: int) -> bool:
    cur.execute("DELETE FROM agent_mcp_servers WHERE id = %s AND agent_id = %s", (server_id, agent_id))
    return cur.rowcount == 1


def refresh_tools(cur: Any, agent_id: int, server_id: int, *, http_post: Optional[Callable[..., Any]] = None) -> Dict[str, Any]:
    """Ask the server for its tools and cache them. Raises BuilderError (404 / 502)."""
    cur.execute(f"SELECT {_COLUMNS} FROM agent_mcp_servers WHERE id = %s AND agent_id = %s", (server_id, agent_id))
    row = cur.fetchone()
    if not row:
        raise BuilderError("Server not found", 404)
    try:
        client = make_client(cur, row, http_post)
        tools = client.list_tools()
        extras = extra_definitions(getattr(client, "capabilities", {}), (str(t["name"]) for t in tools))
    except McpError as exc:
        cur.execute("UPDATE agent_mcp_servers SET last_error = %s WHERE id = %s", (str(exc)[:255], server_id))
        raise BuilderError(str(exc), 502)
    kept = [{"name": str(t["name"])[:128], "description": str(t.get("description") or "")[:MAX_DESCRIPTION],
             "inputSchema": t.get("inputSchema"), "annotations": {"readOnlyHint": is_read_only(t)}} for t in tools]
    kept += [{**e, "description": e["description"][:MAX_DESCRIPTION]} for e in extras]
    kept = kept[:MAX_TOOLS_PER_SERVER + len(EXTRA_KINDS)]
    cur.execute("UPDATE agent_mcp_servers SET tools_json = %s, tools_fetched_at = NOW(), last_error = NULL WHERE id = %s",
                (json.dumps(kept, ensure_ascii=False), server_id))
    return public_view(dict(row, tools_json=json.dumps(kept), last_error=None), agent_id)


def tool_names_for(cur: Any, agent_id: int) -> List[str]:
    """The MCP tool names this agent may list in its own tool list."""
    cur.execute("SELECT id, name, tools_json FROM agent_mcp_servers WHERE agent_id = %s AND enabled = 1", (agent_id,))
    return [tool_name(agent_id, r["name"], t["name"]) for r in cur.fetchall() or [] for t in _cached(r)]


def register_for_agent(agent_id: int) -> List[str]:
    """Put this agent's MCP tools into the registry of this process. Never raises."""
    try:
        with _cursor() as cur:
            cur.execute("SELECT id, name, tools_json FROM agent_mcp_servers WHERE agent_id = %s AND enabled = 1",
                        (agent_id,))
            rows = list(cur.fetchall() or [])
        names = []
        for row in rows:
            for definition in _cached(row):
                tool = build_tool(agent_id, row["id"], row["name"], definition)
                TOOL_REGISTRY[tool.name] = tool
                names.append(tool.name)
        return names
    except Exception as exc:  # noqa: BLE001
        log.warning("[RUNTIME] could not register MCP tools for agent %s: %s", agent_id, exc)
        return []
