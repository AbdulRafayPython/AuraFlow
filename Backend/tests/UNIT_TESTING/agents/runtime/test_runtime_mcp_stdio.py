"""MCP over stdio (operator allow-list) and the routes for stdio servers and the OAuth callback.

The stdio tests start a real child process (fixtures/echo_mcp_stdio.py), so they exercise the pipes,
the time limit and the clean-up for real."""
from __future__ import annotations

import json
import os
import shutil
import sys
import time

import pytest
from flask import Flask
from flask_jwt_extended import JWTManager, create_access_token

from runtime_fakes import make_db  # noqa: F401  (pytest fixture)
from agents.runtime import builder, mcp, mcp_oauth, mcp_stdio
from agents.runtime.builder import BuilderError
from agents.runtime.definitions import AgentDefinition
from agents.runtime.mcp import McpError, StdioMcpClient
from agents.runtime.mcp_stdio import StdioError, StdioSession
from routes import agent_builder as ab
from routes import agent_integrations as ai

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "echo_mcp_stdio.py")


def allow(monkeypatch, **extra):
    cfg = {"echo": {"command": sys.executable, "args": [FIXTURE], "env": {"KEEP": "yes"}}}
    cfg.update(extra)
    monkeypatch.setenv("MCP_STDIO_SERVERS", json.dumps(cfg))


# ── the allow-list ──────────────────────────────────────────────────────

def test_nothing_is_allowed_unless_the_operator_says_so(monkeypatch):
    monkeypatch.delenv("MCP_STDIO_SERVERS", raising=False)
    assert mcp_stdio.stdio_servers() == {}


def test_the_allow_list_is_read_and_checked(monkeypatch):
    allow(monkeypatch, **{"Bad Name": {"command": "x"}, "nocmd": {"args": []}, "badargs": {"command": "x", "args": [1]},
                          "badenv": {"command": "x", "env": {"A": 1}}, "notdict": "x", "ok_2": {"command": "tool", "cwd": "/srv"}})
    servers = mcp_stdio.stdio_servers()
    assert set(servers) == {"echo", "ok_2"} and servers["ok_2"] == {"command": "tool", "args": [], "env": {}, "cwd": "/srv", "ro": []}


@pytest.mark.parametrize("raw", ["not json", "[1, 2]", '"text"', "null"])
def test_a_broken_allow_list_allows_nothing(monkeypatch, raw):
    monkeypatch.setenv("MCP_STDIO_SERVERS", raw)
    assert mcp_stdio.stdio_servers() == {}


def test_the_child_gets_a_minimal_environment(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "super-secret")
    monkeypatch.setenv("DB_PASSWORD", "db-secret")
    env = mcp_stdio.child_environment({"KEEP": "yes"})
    assert env["KEEP"] == "yes" and "JWT_SECRET_KEY" not in env and "DB_PASSWORD" not in env and "PATH" in env


# ── a real program ──────────────────────────────────────────────────────

def test_tools_are_listed_and_a_tool_is_called_despite_log_lines_and_notifications(monkeypatch):
    allow(monkeypatch)
    with StdioSession("echo") as session:
        names = [t["name"] for t in session.list_tools(3, 20)]
        out = session.call_tool("echo", {"text": "salam"})
    assert names == ["echo", "secret_env", "alloc", "save"]
    assert out["content"][0]["text"] == "echo: salam"


def test_application_secrets_never_reach_the_program_but_its_own_settings_do(monkeypatch):
    allow(monkeypatch)
    for name in ("JWT_SECRET_KEY", "DB_PASSWORD", "DEEPSEEK_API_KEY"):
        monkeypatch.setenv(name, "leak-me")
    with StdioSession("echo") as session:
        text = session.call_tool("secret_env", {})["content"][0]["text"]
    assert text == "leaked= keep=yes"


def test_a_name_that_is_not_listed_cannot_be_started(monkeypatch):
    allow(monkeypatch)
    with pytest.raises(StdioError, match="allow-list"):
        StdioSession("rm_rf").__enter__()


def test_a_program_that_cannot_start_is_a_clean_error(monkeypatch):
    allow(monkeypatch, ghost={"command": "definitely-not-a-program-xyz"})
    with pytest.raises(StdioError, match="could not be started"):
        StdioSession("ghost").__enter__()


def test_a_program_that_does_not_answer_is_stopped(monkeypatch):
    allow(monkeypatch)
    monkeypatch.setattr(mcp_stdio, "TIMEOUT", 1)
    started = time.monotonic()
    with pytest.raises(StdioError, match="did not answer in time"):
        with StdioSession("echo") as session:
            proc = session._proc
            session.call_tool("hang", {})
    assert time.monotonic() - started < 10
    assert proc.poll() is not None                          # the process was killed when the conversation ended


def test_a_program_that_exits_early_is_reported(monkeypatch):
    allow(monkeypatch, quitter={"command": sys.executable, "args": ["-c", "pass"]})
    with pytest.raises(StdioError, match="stopped before answering|closed the connection"):
        with StdioSession("quitter") as session:
            session.list_tools(1, 5)


def test_too_much_output_is_cut_off(monkeypatch):
    allow(monkeypatch)
    monkeypatch.setattr(mcp_stdio, "MAX_OUTPUT_BYTES", 50)
    with pytest.raises(StdioError, match="too large"):
        with StdioSession("echo") as session:
            session.list_tools(1, 5)


def test_a_json_rpc_error_is_reported(monkeypatch):
    allow(monkeypatch)
    with pytest.raises(StdioError, match="Method not found"):
        with StdioSession("echo") as session:
            session.initialize()
            session.request("nonsense/method")


# ── through the MCP layer ───────────────────────────────────────────────

def test_the_mcp_client_wraps_a_stdio_program(monkeypatch):
    allow(monkeypatch)
    client = StdioMcpClient("echo")
    assert [t["name"] for t in client.list_tools()] == ["echo", "secret_env", "alloc", "save"]
    assert client.call_tool("echo", {"text": "hi"}) == {"text": "echo: hi"}


def test_problems_with_a_stdio_program_surface_as_mcp_errors(monkeypatch):
    allow(monkeypatch)
    with pytest.raises(McpError, match="allow-list"):
        StdioMcpClient("other").list_tools()


def test_make_client_picks_stdio_from_the_stored_row(make_db):
    _, cur = make_db([], [])
    assert isinstance(mcp.make_client(cur, {"id": 1, "url": "stdio:echo", "transport": "stdio"}), StdioMcpClient)
    assert mcp.make_client(cur, {"id": 1, "url": "stdio:echo"}).name == "echo"       # the prefix alone is enough


def test_a_stdio_server_is_stored_as_stdio_with_no_token(make_db, monkeypatch):
    allow(monkeypatch)
    _, cur = make_db([("COUNT(*)", {"n": 0})], [], lastrowid=3)
    assert mcp.add_server(cur, 5, 7, "files", "echo", "ignored token", transport="stdio") == 3
    params = cur.sql_containing("INSERT INTO agent_mcp_servers")[0][1]
    assert params == (5, "files", "stdio:echo", "stdio", None, None, 7)


def test_a_program_that_is_not_allowed_cannot_be_added(make_db, monkeypatch):
    allow(monkeypatch)
    _, cur = make_db([], [])
    with pytest.raises(BuilderError, match="allow-list"):
        mcp.add_server(cur, 5, 7, "files", "rm_rf", "", transport="stdio")
    assert cur.executed == []


def test_the_public_view_marks_stdio_servers():
    view = mcp.public_view({"id": 1, "name": "files", "url": "stdio:echo", "transport": "stdio", "enabled": 1,
                            "auth_token": None, "oauth_json": None, "tools_json": None}, 5)
    assert view["auth"] == "stdio" and view["oauth_connected"] is False


# ── routes ──────────────────────────────────────────────────────────────

PID = "pub-5"


class Env:
    pass


@pytest.fixture
def api(monkeypatch, make_db):
    env = Env()
    env.defn = AgentDefinition(id=5, public_id=PID, bot_user_id=505, bot_username="b", name="Bot", owner_user_id=7,
                               community_id=None, status="draft", instructions="Answer FAQs.")
    env.admin = False
    env.conn, env.cur = make_db([], ["routes.agent_builder"])
    monkeypatch.setattr(ab, "get_user_id", lambda name, cur: 7)
    monkeypatch.setattr(ab, "get_definition_by_public_id", lambda pid: env.defn if pid == PID else None)
    monkeypatch.setattr(builder, "can_manage", lambda cur, uid, d: True)
    monkeypatch.setattr(builder, "can_view", lambda cur, uid, d: True)
    monkeypatch.setattr(builder, "is_system_admin", lambda cur, uid: env.admin)
    app = Flask(__name__)
    app.config.update(JWT_SECRET_KEY="test-secret-key-for-unit-tests-123456", TESTING=True)
    JWTManager(app)
    app.register_blueprint(ab.agent_builder_bp)
    app.register_blueprint(ai.agent_integrations_bp)
    with app.app_context():
        token = create_access_token(identity="sarah")
    env.http, env.headers = app.test_client(), {"Authorization": f"Bearer {token}"}
    env.call = lambda method, path, **kw: getattr(env.http, method)("/api/agent-builder" + path, headers=env.headers, **kw)
    return env


def test_only_a_system_admin_can_connect_a_program_that_runs_on_the_server(api, monkeypatch):
    allow(monkeypatch)
    added = {}
    monkeypatch.setattr(mcp, "add_server", lambda cur, aid, uid, name, url, token, **kw: added.update(url=url, **kw) or 9)
    monkeypatch.setattr(mcp, "refresh_tools", lambda cur, aid, sid: {"id": sid, "tools": []})
    body = {"name": "files", "transport": "stdio", "stdio_name": "echo", "url": "https://ignored.example.com/mcp"}
    r = api.call("post", f"/agents/{PID}/mcp", json=body)
    assert r.status_code == 403 and added == {}
    api.admin = True
    r = api.call("post", f"/agents/{PID}/mcp", json=body)
    assert r.status_code == 201 and added["url"] == "echo" and added["transport"] == "stdio"       # the name, never the url field


def test_the_list_of_allowed_programs_is_for_system_admins_only(api, monkeypatch):
    allow(monkeypatch)
    assert api.call("get", "/mcp/stdio-servers").get_json() == {"servers": []}
    api.admin = True
    assert api.call("get", "/mcp/stdio-servers").get_json() == {"servers": ["echo"]}
    assert api.http.get("/api/agent-builder/mcp/stdio-servers").status_code == 401


def test_adding_an_oauth_server_does_not_try_to_reach_it_yet(api, monkeypatch):
    seen = {}
    monkeypatch.setattr(mcp, "add_server", lambda cur, aid, uid, name, url, token, **kw: seen.update(kw) or 9)
    monkeypatch.setattr(mcp, "list_servers", lambda cur, aid: [{"id": 9, "name": "notion", "auth": "oauth", "tools": []}])
    monkeypatch.setattr(mcp, "refresh_tools", lambda *a, **k: (_ for _ in ()).throw(AssertionError("must not be called")))
    r = api.call("post", f"/agents/{PID}/mcp", json={"name": "notion", "url": "https://mcp.example.com/mcp", "auth": "oauth",
                                                      "client_id": "abc"})
    assert r.status_code == 201 and r.get_json()["auth"] == "oauth"
    assert seen["auth"] == "oauth" and seen["client_id"] == "abc" and seen["transport"] == "http"


def test_starting_a_login_returns_the_providers_address(api, monkeypatch):
    seen = {}
    monkeypatch.setattr(mcp, "start_oauth", lambda cur, aid, sid, uid, redirect: seen.update(sid=sid, redirect=redirect) or "https://auth.example.com/authorize?x=1")
    r = api.call("post", f"/agents/{PID}/mcp/9/oauth/start", json={"redirect_uri": "https://app/api/agent-builder/mcp/oauth/callback"})
    assert r.status_code == 200 and r.get_json() == {"authorization_url": "https://auth.example.com/authorize?x=1"}
    assert seen == {"sid": 9, "redirect": "https://app/api/agent-builder/mcp/oauth/callback"} and api.conn.commits == 1
    assert api.http.post(f"/api/agent-builder/agents/{PID}/mcp/9/oauth/start").status_code == 401


def test_the_callback_finishes_the_login_without_a_session(api, monkeypatch):
    done = {}
    monkeypatch.setattr(mcp_oauth, "complete", lambda cur, state, code, http=None: done.update(state=state, code=code) or 9)
    r = api.http.get("/api/agent-builder/mcp/oauth/callback?state=abc&code=xyz")           # no Authorization header
    assert r.status_code == 200 and b"Connected" in r.data and done == {"state": "abc", "code": "xyz"} and api.conn.commits == 1
    assert b"auraflow-mcp-oauth" in r.data and r.mimetype == "text/html"


@pytest.mark.parametrize("query, fragment", [
    ("?error=access_denied&state=abc", b"did not allow"), ("?state=abc", b"incomplete"), ("?code=xyz", b"incomplete"),
    ("", b"incomplete"), ("?state=" + "a" * 65 + "&code=x", b"incomplete")])
def test_a_callback_that_is_denied_or_incomplete_is_explained(api, monkeypatch, query, fragment):
    monkeypatch.setattr(mcp_oauth, "complete", lambda *a, **k: (_ for _ in ()).throw(AssertionError("must not be called")))
    r = api.http.get("/api/agent-builder/mcp/oauth/callback" + query)
    assert r.status_code == 400 and fragment in r.data and b"Could not connect" in r.data


def test_a_login_the_provider_refuses_is_shown_safely(api, monkeypatch):
    def refuse(cur, state, code, http=None):
        raise mcp_oauth.OAuthError("The provider refused the request: <script>alert(1)</script>")
    monkeypatch.setattr(mcp_oauth, "complete", refuse)
    r = api.http.get("/api/agent-builder/mcp/oauth/callback?state=abc&code=xyz")
    assert r.status_code == 400 and b"<script>alert(1)</script>" not in r.data and b"&lt;script&gt;" in r.data


# ── resource limits (Linux/macOS) ───────────────────────────────────────

def test_the_program_is_wrapped_in_ulimit_only_where_that_exists(monkeypatch):
    monkeypatch.delenv("MCP_STDIO_NO_LIMITS", raising=False)
    monkeypatch.delenv("MCP_STDIO_MAX_MEMORY_MB", raising=False)
    monkeypatch.delenv("MCP_STDIO_MAX_CPU_SECONDS", raising=False)
    argv = ["python", "server.py", "--flag; rm -rf /"]
    wrapped = mcp_stdio.limited_argv(argv)
    if os.name != "posix":
        assert wrapped == argv
        return
    assert wrapped[:2] == ["sh", "-c"] and wrapped[3:] == argv                  # the program is never part of the script text
    script = wrapped[2]
    assert "ulimit -t 30" in script and f"ulimit -v {512 * 1024}" in script and "ulimit -c 0" in script
    assert 'exec "$0" "$@"' in script and "rm -rf" not in script


def test_the_limits_can_be_tuned_or_switched_off(monkeypatch):
    monkeypatch.setenv("MCP_STDIO_MAX_MEMORY_MB", "128")
    monkeypatch.setenv("MCP_STDIO_MAX_CPU_SECONDS", "5")
    assert mcp_stdio.max_memory_mb() == 128 and mcp_stdio.max_cpu_seconds() == 5
    monkeypatch.setenv("MCP_STDIO_MAX_MEMORY_MB", "1")
    assert mcp_stdio.max_memory_mb() == 64                                       # never absurdly low
    monkeypatch.setenv("MCP_STDIO_MAX_MEMORY_MB", "lots")
    assert mcp_stdio.max_memory_mb() == 512
    monkeypatch.setenv("MCP_STDIO_NO_LIMITS", "1")
    assert mcp_stdio.limited_argv(["python"]) == ["python"]


@pytest.mark.skipif(os.name != "posix", reason="ulimit exists on Linux/macOS only")
def test_a_program_that_asks_for_too_much_memory_is_stopped_by_the_limit(monkeypatch):
    allow(monkeypatch)
    monkeypatch.setenv("MCP_STDIO_MAX_MEMORY_MB", "256")
    with StdioSession("echo") as session:
        assert "allocated 8 MB" in session.call_tool("alloc", {"mb": 8})["content"][0]["text"]
        result = session.call_tool("alloc", {"mb": 1500})
    assert result["isError"] is True and "MemoryError" in result["content"][0]["text"]


@pytest.mark.skipif(os.name != "posix", reason="process groups exist on Linux/macOS only")
def test_helpers_the_program_starts_die_with_it(monkeypatch, tmp_path):
    pidfile = tmp_path / "child.pid"
    script = tmp_path / "spawner.py"
    script.write_text("import subprocess, sys, time\n"
                      "p = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(120)'])\n"
                      f"open({str(pidfile)!r}, 'w').write(str(p.pid))\n"
                      "time.sleep(120)\n")
    allow(monkeypatch, spawner={"command": sys.executable, "args": [str(script)]})
    monkeypatch.setattr(mcp_stdio, "TIMEOUT", 2)
    with pytest.raises(StdioError):
        with StdioSession("spawner") as session:
            session.request("initialize", {})
    child = int(pidfile.read_text())
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        try:
            os.kill(child, 0)
        except ProcessLookupError:
            break
        time.sleep(0.1)
    else:
        pytest.fail("the helper process survived")


# ── resources and prompts ───────────────────────────────────────────────

def test_a_server_that_advertises_them_gets_four_read_only_tools_next_to_its_own():
    extras = mcp.extra_definitions({"tools": {}, "resources": {}, "prompts": {}}, ["echo"])
    assert [e["kind"] for e in extras] == ["resources_list", "resources_read", "prompts_list", "prompts_get"]
    assert all(e["annotations"] == {"readOnlyHint": True} for e in extras)
    assert [e["kind"] for e in mcp.extra_definitions({"resources": {}}, [])] == ["resources_list", "resources_read"]
    assert [e["kind"] for e in mcp.extra_definitions({"prompts": {"listChanged": True}}, [])] == ["prompts_list", "prompts_get"]
    assert mcp.extra_definitions({"tools": {}}, []) == [] and mcp.extra_definitions({}, []) == []
    assert mcp.extra_definitions(None, []) == []


def test_a_real_tool_with_the_same_name_is_never_replaced():
    assert mcp.extra_definitions({"resources": {}}, ["resources_list"]) == mcp.extra_definitions({"resources": {}}, [])[1:]


def test_resources_and_prompts_work_through_a_stdio_program(monkeypatch):
    allow(monkeypatch)
    client = StdioMcpClient("echo")
    assert mcp.call_remote(client, "resources_list", "resources_list", {})["text"] == \
        "- file:///notes/hostel.txt (Hostel notes: Rent and rules)\n- file:///notes/library.txt (Library)"
    assert mcp.call_remote(client, "resources_read", "resources_read", {"uri": "file:///notes/hostel.txt"}) == \
        {"text": "Rent is due on the 1st."}
    assert mcp.call_remote(client, "resources_read", "resources_read", {"uri": "file:///notes/logo.png"})["text"] == \
        "[image/png content omitted]"
    assert mcp.call_remote(client, "prompts_list", "prompts_list", {})["text"] == \
        "- summarize: Summarize a topic (arguments: topic*, style)"
    assert mcp.call_remote(client, "prompts_get", "prompts_get", {"name": "summarize", "arguments": {"topic": "fees"}})["text"] == \
        "Summary request\nuser: Please summarize: fees"
    assert client.capabilities.get("resources") == {} and client.capabilities.get("prompts") == {}


def test_a_missing_resource_or_prompt_is_a_clean_error(monkeypatch):
    allow(monkeypatch)
    with pytest.raises(McpError, match="Resource not found"):
        mcp.call_remote(StdioMcpClient("echo"), "resources_read", "resources_read", {"uri": "file:///nope"})
    with pytest.raises(McpError, match="Unknown prompt"):
        mcp.call_remote(StdioMcpClient("echo"), "prompts_get", "prompts_get", {"name": "ghost"})


def test_refreshing_a_stdio_server_caches_its_tools_and_the_extras(make_db, monkeypatch):
    allow(monkeypatch)
    row = {"id": 9, "name": "files", "url": "stdio:echo", "transport": "stdio", "auth_token": None, "oauth_json": None,
           "enabled": 1, "tools_json": None, "tools_fetched_at": None, "last_error": None}
    _, cur = make_db([("FROM agent_mcp_servers WHERE id", row)], [])
    view = mcp.refresh_tools(cur, 5, 9)
    names = [t["remote_name"] for t in view["tools"]]
    assert names == ["echo", "secret_env", "alloc", "save", "resources_list", "resources_read", "prompts_list", "prompts_get"]
    risks = {t["remote_name"]: t["risk"] for t in view["tools"]}
    assert risks["resources_read"] == "read" and risks["prompts_get"] == "read" and risks["save"] == "write"
    stored = json.loads(cur.sql_containing("SET tools_json")[0][1][0])
    assert stored[-1]["kind"] == "prompts_get" and "kind" not in stored[0]


def test_a_cached_extra_runs_as_a_resource_call_not_a_tool_call(make_db, monkeypatch):
    allow(monkeypatch)
    definition = {"name": "resources_read", "kind": "resources_read", "description": "d", "annotations": {"readOnlyHint": True},
                  "inputSchema": mcp.EXTRA_KINDS["resources_read"][2]}
    tool = mcp.build_tool(5, 9, "files", definition)
    assert tool.risk == "read" and tool.parameters["required"] == ["uri"] and tool.name == "mcp_5_files_resources_read"
    make_db([("FROM agent_mcp_servers WHERE id", {"id": 9, "url": "stdio:echo", "auth_token": None,
                                                  "transport": "stdio", "oauth_json": None})], ["agents.runtime.mcp"])
    from agents.runtime.tools import ToolContext
    out = tool.func(ToolContext(invoked_by=7, extra={"agent_id": 5}), uri="file:///notes/hostel.txt")
    assert out == {"text": "Rent is due on the 1st."}


def test_results_are_trimmed_and_lists_are_capped():
    many = {"resources": [{"uri": f"file:///{i}", "name": "n"} for i in range(200)]}
    assert len(mcp.format_resources(many)["text"].splitlines()) == mcp.MAX_LIST_ITEMS
    big = {"contents": [{"text": "x" * 50000}]}
    assert len(mcp.format_resource(big)["text"]) == mcp.MAX_RESULT_CHARS
    assert mcp.format_resources({})["text"] == "(nothing)" and mcp.format_resource({})["text"] == "(empty)"
    assert mcp.format_prompt({"messages": [{"role": "assistant", "content": {"type": "image"}}]})["text"] == \
        "assistant: [non-text content omitted]"


# ── optional bubblewrap sandbox ─────────────────────────────────────────

def test_the_sandbox_is_off_unless_asked_for(monkeypatch):
    monkeypatch.delenv("MCP_STDIO_SANDBOX", raising=False)
    assert mcp_stdio.sandbox_mode() == "off"
    assert mcp_stdio.sandboxed_argv(["python", "x.py"], ["/opt/mcp"], {}) == ["python", "x.py"]
    monkeypatch.setenv("MCP_STDIO_SANDBOX", "something-else")
    assert mcp_stdio.sandbox_mode() == "off"


def test_the_sandbox_command_has_no_network_a_read_only_system_and_only_listed_paths(monkeypatch, tmp_path):
    monkeypatch.setenv("MCP_STDIO_SANDBOX", "BWRAP")
    monkeypatch.setattr(mcp_stdio.shutil, "which", lambda name: "/usr/bin/bwrap" if name == "bwrap" else None)
    monkeypatch.setattr(mcp_stdio, "_posix", lambda: True)
    mine = tmp_path / "server"
    mine.mkdir()
    cmd = mcp_stdio.sandboxed_argv(["sh", "-c", "script", "python", "/opt/s.py"], [str(mine), "/does/not/exist"], {"KEEP": "yes"})
    assert cmd[0] == "/usr/bin/bwrap" and "--unshare-all" in cmd and "--die-with-parent" in cmd and "--clearenv" in cmd
    assert "--share-net" not in cmd                                              # --unshare-all includes the network
    assert cmd[cmd.index("--tmpfs") + 1] == "/tmp"
    binds = [cmd[i + 1] for i, a in enumerate(cmd) if a == "--ro-bind"]
    assert str(mine) in binds and "/does/not/exist" not in binds                 # only what exists, only what was listed
    assert "--bind" not in cmd and "--bind-try" not in cmd                       # nothing is writable except /tmp
    assert not any("env" in b.lower() or ".env" in b for b in binds)
    assert ["--setenv", "KEEP", "yes"] == cmd[cmd.index("--setenv"):cmd.index("--setenv") + 3] or "KEEP" in cmd
    assert cmd[cmd.index("--") + 1:] == ["sh", "-c", "script", "python", "/opt/s.py"]


def test_the_sandbox_fails_closed_when_it_cannot_be_used(monkeypatch):
    monkeypatch.setenv("MCP_STDIO_SANDBOX", "bwrap")
    monkeypatch.setattr(mcp_stdio.shutil, "which", lambda name: None)
    with pytest.raises(StdioError, match="not installed"):
        mcp_stdio.sandboxed_argv(["python"], [], {})
    monkeypatch.setattr(mcp_stdio.shutil, "which", lambda name: "/usr/bin/bwrap")
    monkeypatch.setattr(mcp_stdio, "_posix", lambda: False)
    with pytest.raises(StdioError, match="not installed"):
        mcp_stdio.sandboxed_argv(["python"], [], {})


def test_a_session_does_not_start_the_program_when_the_requested_sandbox_is_missing(monkeypatch):
    allow(monkeypatch)
    monkeypatch.setenv("MCP_STDIO_SANDBOX", "bwrap")
    monkeypatch.setattr(mcp_stdio.shutil, "which", lambda name: sys.executable if name == sys.executable else None)
    started = []
    monkeypatch.setattr(mcp_stdio.subprocess, "Popen", lambda *a, **k: started.append(a) or None)
    with pytest.raises(StdioError, match="bubblewrap"):
        StdioSession("echo").__enter__()
    assert started == []                                                         # never ran unsandboxed


def test_the_allow_list_accepts_absolute_read_only_paths_only(monkeypatch):
    allow(monkeypatch, good={"command": "x", "ro": ["/opt/mcp", "/srv/data"]}, relative={"command": "x", "ro": ["opt/mcp"]},
          wrong={"command": "x", "ro": "/opt"})
    servers = mcp_stdio.stdio_servers()
    assert servers["good"]["ro"] == ["/opt/mcp", "/srv/data"] and "relative" not in servers and "wrong" not in servers


@pytest.mark.skipif(shutil.which("bwrap") is None or os.name != "posix", reason="needs bubblewrap and Linux")
def test_a_sandboxed_program_has_no_network_no_app_files_and_changes_nothing_on_the_host(monkeypatch, tmp_path):
    secret = tmp_path / "app_secret.txt"
    secret.write_text("top secret")
    probe = tmp_path / "probe.py"
    probe.write_text(
        "import json, os, socket, sys\n"
        "out = {}\n"
        "try:\n    socket.create_connection(('1.1.1.1', 53), timeout=2); out['net'] = 'reachable'\n"
        "except OSError as e:\n    out['net'] = 'blocked'\n"
        f"out['secret_visible'] = os.path.exists({str(secret)!r})\n"
        "try:\n    open('/usr/auraflow_test', 'w'); out['write_usr'] = 'allowed'\n"
        "except OSError:\n    out['write_usr'] = 'blocked'\n"
        "try:\n    open('/etc/auraflow_test', 'w').write('x')\n"
        "except OSError:\n    pass\n"
        "open('/tmp/x', 'w').write('ok'); out['write_tmp'] = 'ok'\n"
        "print(json.dumps({'jsonrpc': '2.0', 'id': 1, 'result': out}), flush=True)\n"
        "sys.stdin.readline()\n")
    allow(monkeypatch, probe={"command": sys.executable, "args": [str(probe)], "ro": [str(probe), os.path.dirname(sys.executable)]})
    monkeypatch.setenv("MCP_STDIO_SANDBOX", "bwrap")
    with StdioSession("probe") as session:
        result = session.request("anything")
    assert result == {"net": "blocked", "secret_visible": False, "write_usr": "blocked", "write_tmp": "ok"}
    assert not os.path.exists("/etc/auraflow_test")          # whatever it wrote outside /tmp lived in the sandbox only
