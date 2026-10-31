"""
MCP over stdio (operator-controlled)
====================================
Some MCP servers are local programs that talk JSON-RPC over stdin/stdout. Running one means
running a program on THIS server, so users can never name a command. The operator lists the
programs agents may use in the environment variable ``MCP_STDIO_SERVERS``::

    MCP_STDIO_SERVERS='{"files": {"command": "python", "args": ["/opt/mcp/files_server.py"],
                                   "env": {"ROOT": "/srv/shared"}, "cwd": "/srv/shared"}}'

and only a system admin may connect an agent to one of those names. Even then the program runs
with a minimal environment (no application secrets are passed on), no shell, no stderr capture,
a hard time limit and an output cap, and it is killed as soon as the conversation ends. This is
not a full sandbox by default: on Linux the program also runs under ``ulimit`` limits (see ``limited_argv``;
``MCP_STDIO_MAX_MEMORY_MB`` default 512, ``MCP_STDIO_MAX_CPU_SECONDS`` default 30) and in its own
process group that is killed as a whole, but it still shares the machine's network and files. Only
list programs you would be willing to run yourself, and prefer running the API in a container with
no access to anything sensitive.

Real isolation is available as an opt-in: set ``MCP_STDIO_SANDBOX=bwrap`` (Linux, with the
``bubblewrap`` package installed and unprivileged user namespaces allowed, which Docker's default
settings do not allow) and every stdio program runs in a sandbox with no network, a read-only
system and a private /tmp. List the extra files a program needs per server under ``"ro"``. If the
sandbox cannot start, the program is not run at all (fail closed). Plain mode is unchanged.
"""

from __future__ import annotations

import json
import logging
import os
import queue
import re
import shutil
import signal
import subprocess
import tempfile
import threading
import time
from typing import Any, Dict, List, Optional

log = logging.getLogger(__name__)

NAME_RE = re.compile(r"^[a-z0-9_]{2,24}$")
TIMEOUT = 15
MAX_OUTPUT_BYTES = 1_000_000
PROTOCOL_VERSION = "2025-03-26"
_PASS_THROUGH_ENV = ("PATH", "SYSTEMROOT", "COMSPEC", "PATHEXT", "TEMP", "TMP", "LANG", "LC_ALL")


class StdioError(Exception):
    """A problem with a stdio server. The message is safe to show to the user."""


def stdio_servers() -> Dict[str, Dict[str, Any]]:
    """The programs the operator allows, by name. Malformed entries are ignored."""
    raw = os.getenv("MCP_STDIO_SERVERS")
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except ValueError:
        log.warning("[RUNTIME] MCP_STDIO_SERVERS is not valid JSON; ignoring it")
        return {}
    out: Dict[str, Dict[str, Any]] = {}
    for name, cfg in (data.items() if isinstance(data, dict) else []):
        if not (isinstance(name, str) and NAME_RE.match(name) and isinstance(cfg, dict)):
            continue
        command, args, env = cfg.get("command"), cfg.get("args", []), cfg.get("env", {})
        if not isinstance(command, str) or not command.strip():
            continue
        if not isinstance(args, list) or any(not isinstance(a, str) for a in args):
            continue
        if not isinstance(env, dict) or any(not isinstance(k, str) or not isinstance(v, str) for k, v in env.items()):
            continue
        cwd = cfg.get("cwd")
        ro = cfg.get("ro", [])
        if not isinstance(ro, list) or any(not isinstance(p, str) or not p.startswith("/") for p in ro):
            continue
        out[name] = {"command": command, "args": list(args), "env": dict(env), "cwd": cwd if isinstance(cwd, str) else None,
                     "ro": list(ro)}
    return out


def max_memory_mb() -> int:
    try:
        return max(64, int(os.getenv("MCP_STDIO_MAX_MEMORY_MB") or 512))
    except ValueError:
        return 512


def max_cpu_seconds() -> int:
    try:
        return max(1, int(os.getenv("MCP_STDIO_MAX_CPU_SECONDS") or 30))
    except ValueError:
        return 30


def limited_argv(argv: List[str]) -> List[str]:
    """On Linux/macOS run the program under ``ulimit`` limits: no core files, CPU seconds, memory,
    the size of any file it writes, and open files. The program is passed as separate arguments to
    ``exec`` (never joined into a shell string), so nothing in a name or argument is interpreted.
    Elsewhere (Windows) the program runs without these limits."""
    if os.name != "posix" or not shutil.which("sh") or (os.getenv("MCP_STDIO_NO_LIMITS") or "") == "1":
        return argv
    script = (f"ulimit -c 0 2>/dev/null; ulimit -t {max_cpu_seconds()} 2>/dev/null; "
              f"ulimit -v {max_memory_mb() * 1024} 2>/dev/null; ulimit -f 20480 2>/dev/null; "
              "ulimit -n 256 2>/dev/null; exec \"$0\" \"$@\"")
    return ["sh", "-c", script, *argv]


SANDBOX_SYSTEM_PATHS = ("/usr", "/bin", "/sbin", "/lib", "/lib32", "/lib64", "/etc/alternatives", "/etc/ld.so.cache")


def sandbox_mode() -> str:
    """``MCP_STDIO_SANDBOX``: ``off`` (default) or ``bwrap`` (Linux, needs the ``bubblewrap`` program)."""
    mode = (os.getenv("MCP_STDIO_SANDBOX") or "off").strip().lower()
    return mode if mode in ("off", "bwrap") else "off"


def _posix() -> bool:
    return os.name == "posix"


def sandboxed_argv(argv: List[str], ro_paths: List[str], env: Dict[str, str]) -> List[str]:
    """Run the program inside a bubblewrap sandbox: no network, own process/IPC/user namespaces, the system
    directories mounted read-only, a private empty /tmp, and only the paths the operator listed under
    ``"ro"`` visible besides. The program cannot see the application files, ``.env`` or other users' data.
    Fails CLOSED: when the sandbox was asked for but cannot be used, the program does not run at all."""
    if sandbox_mode() != "bwrap":
        return argv
    bwrap = shutil.which("bwrap")
    if not _posix() or bwrap is None:
        raise StdioError("The sandbox is switched on but bubblewrap (bwrap) is not installed here, so the program was not started.")
    cmd = [bwrap, "--unshare-all", "--die-with-parent", "--new-session", "--proc", "/proc", "--dev", "/dev",
           "--tmpfs", "/tmp", "--clearenv"]
    for key, value in child_environment(env).items():
        cmd += ["--setenv", key, value]
    for path in SANDBOX_SYSTEM_PATHS:
        if os.path.exists(path):
            cmd += ["--ro-bind", path, path]
    for path in ro_paths:
        if os.path.exists(path):
            cmd += ["--ro-bind", path, path]
    return cmd + ["--", *argv]


def child_environment(extra: Dict[str, str]) -> Dict[str, str]:
    env = {k: os.environ[k] for k in _PASS_THROUGH_ENV if k in os.environ}
    env.update(extra)
    return env


class StdioSession:
    """One short conversation with one program. Use as a context manager."""

    def __init__(self, name: str):
        cfg = stdio_servers().get(name)
        if cfg is None:
            raise StdioError("This stdio server is not on the operator's allow-list.")
        self.name, self.cfg = name, cfg
        self._proc: Optional[subprocess.Popen] = None
        self._lines: "queue.Queue[Optional[bytes]]" = queue.Queue()
        self._next_id = 0
        self._ready = False
        self.capabilities: Dict[str, Any] = {}

    def __enter__(self) -> "StdioSession":
        if shutil.which(self.cfg["command"]) is None:       # under ``sh -c exec`` a missing program would only fail later
            log.warning("[RUNTIME] stdio server %s: command %r not found", self.name, self.cfg["command"])
            raise StdioError("The program could not be started.")
        try:
            self._proc = subprocess.Popen(
                sandboxed_argv(limited_argv([self.cfg["command"], *self.cfg["args"]]), self.cfg.get("ro", []), self.cfg["env"]),
                stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL, env=child_environment(self.cfg["env"]), shell=False,
                cwd=self.cfg["cwd"] or tempfile.gettempdir(), bufsize=0,
                start_new_session=(os.name == "posix"))      # its own process group, so helpers it starts die with it
        except (OSError, ValueError) as exc:
            log.warning("[RUNTIME] stdio server %s could not start: %s", self.name, exc)
            raise StdioError("The program could not be started.")
        threading.Thread(target=self._read, daemon=True).start()
        return self

    def __exit__(self, *exc: Any) -> None:
        proc = self._proc
        if proc is None:
            return
        # Kill first: closing a pipe that the reader thread is blocked on can itself block.
        self._kill_tree(proc)
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            log.warning("[RUNTIME] stdio server %s did not exit", self.name)
        for stream in (proc.stdin, proc.stdout):
            try:
                if stream:
                    stream.close()
            except OSError:
                pass

    @staticmethod
    def _kill_tree(proc: subprocess.Popen) -> None:
        """Stop the program and anything it started."""
        try:
            if os.name == "posix":
                os.killpg(proc.pid, signal.SIGKILL)
            elif proc.poll() is None:
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True, timeout=5)
        except (OSError, subprocess.SubprocessError):
            pass
        if proc.poll() is None:
            proc.kill()

    def _read(self) -> None:
        total = 0
        try:
            for line in iter(self._proc.stdout.readline, b""):
                total += len(line)
                if total > MAX_OUTPUT_BYTES:
                    self._lines.put(b"__too_large__")
                    break
                self._lines.put(line)
        except (OSError, ValueError):
            pass
        self._lines.put(None)

    def _send(self, message: Dict[str, Any]) -> None:
        try:
            self._proc.stdin.write((json.dumps(message) + "\n").encode("utf-8"))
            self._proc.stdin.flush()
        except (OSError, ValueError):
            raise StdioError("The program closed the connection.")

    def notify(self, method: str) -> None:
        self._send({"jsonrpc": "2.0", "method": method})

    def request(self, method: str, params: Optional[Dict[str, Any]] = None) -> Any:
        self._next_id += 1
        request_id = self._next_id
        self._send({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params or {}})
        deadline = time.monotonic() + TIMEOUT
        while True:
            try:
                line = self._lines.get(timeout=max(deadline - time.monotonic(), 0.01))
            except queue.Empty:
                raise StdioError("The program did not answer in time.")
            if line is None:
                raise StdioError("The program stopped before answering.")
            if line == b"__too_large__":
                raise StdioError("The program's output is too large.")
            try:
                message = json.loads(line.decode("utf-8", errors="replace"))
            except ValueError:
                continue                                  # a stray log line
            if not isinstance(message, dict) or message.get("id") != request_id:
                continue                                  # a notification, or an answer to nothing we asked
            if "error" in message:
                raise StdioError(str((message["error"] or {}).get("message") or "The program returned an error.")[:200])
            return message.get("result")

    def initialize(self) -> None:
        if self._ready:
            return
        info = self.request("initialize", {"protocolVersion": PROTOCOL_VERSION, "capabilities": {},
                                           "clientInfo": {"name": "AuraFlow", "version": "1"}})
        caps = info.get("capabilities") if isinstance(info, dict) else None
        self.capabilities = caps if isinstance(caps, dict) else {}
        self.notify("notifications/initialized")
        self._ready = True

    def list_tools(self, max_pages: int, max_tools: int) -> List[Dict[str, Any]]:
        self.initialize()
        tools: List[Dict[str, Any]] = []
        cursor: Optional[str] = None
        for _ in range(max_pages):
            result = self.request("tools/list", {"cursor": cursor} if cursor else {}) or {}
            tools.extend(t for t in result.get("tools", []) if isinstance(t, dict) and t.get("name"))
            cursor = result.get("nextCursor")
            if not cursor or len(tools) >= max_tools:
                break
        return tools[:max_tools]

    def call_tool(self, name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        self.initialize()
        return self.request("tools/call", {"name": name, "arguments": arguments}) or {}
