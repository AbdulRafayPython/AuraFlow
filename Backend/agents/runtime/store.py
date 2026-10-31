"""
Run persistence
===============
Every agent run and every step inside it is recorded (``agent_runs`` /
``agent_run_steps``) so a message can later show *why* the agent said what it
said, and so cost can be tracked per agent.

Persistence is best-effort by design: a missing table or a database hiccup
must never fail the user's request, so :class:`MySQLRunStore` logs once and
carries on.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional

log = logging.getLogger(__name__)

_MAX_JSON_CHARS = 60000


def _dumps(value: Any) -> Optional[str]:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False, default=str)[:_MAX_JSON_CHARS]


def approval_ttl_minutes() -> int:
    """How long an approval waits before it expires (``AGENT_APPROVAL_TTL_MINUTES``, default 24h)."""
    try:
        return max(1, int(os.getenv("AGENT_APPROVAL_TTL_MINUTES") or 1440))
    except ValueError:
        return 1440


def max_pending_approvals() -> int:
    """Most open approvals one person may have (``AGENT_MAX_PENDING_APPROVALS``, default 20),
    so a looping agent cannot bury them in requests."""
    try:
        return max(1, int(os.getenv("AGENT_MAX_PENDING_APPROVALS") or 20))
    except ValueError:
        return 20


class RunStore:
    """Interface. Methods never raise."""

    def start_run(self, *, run_uuid: str, agent_key: str, trigger_type: str,
                  input_text: str, community_id: Optional[int],
                  channel_id: Optional[int], invoked_by: Optional[int],
                  is_dry_run: bool, agent_id: Optional[int] = None,
                  trigger_message_id: Optional[int] = None) -> Optional[int]:
        return None

    def add_step(self, run_id: Optional[int], step_no: int, kind: str, *,
                 tool_name: Optional[str] = None, args: Any = None,
                 result: Any = None, latency_ms: Optional[int] = None) -> None:
        return None

    def finish_run(self, run_id: Optional[int], *, status: str,
                   output_text: Optional[str], step_count: int,
                   tokens_in: int, tokens_out: int,
                   error: Optional[str]) -> None:
        return None

    def create_approval(self, run_id: Optional[int], *, tool_name: str, args: Any,
                        summary: str, approver_id: int) -> Optional[int]:
        """Record a pending approval; None when it could not be stored (never execute then)."""
        return None


class NullRunStore(RunStore):
    """Records nothing."""


class MemoryRunStore(RunStore):
    """Keeps runs in memory; used by tests and dry runs."""

    def __init__(self) -> None:
        self.runs: List[Dict[str, Any]] = []
        self.steps: List[Dict[str, Any]] = []
        self.approvals: List[Dict[str, Any]] = []

    def start_run(self, **kw: Any) -> Optional[int]:
        run = dict(kw, id=len(self.runs) + 1, status="running")
        self.runs.append(run)
        return run["id"]

    def add_step(self, run_id, step_no, kind, *, tool_name=None, args=None,
                 result=None, latency_ms=None) -> None:
        self.steps.append({"run_id": run_id, "step_no": step_no, "kind": kind,
                           "tool_name": tool_name, "args": args,
                           "result": result, "latency_ms": latency_ms})

    def finish_run(self, run_id, **kw: Any) -> None:
        for run in self.runs:
            if run["id"] == run_id:
                run.update(kw)

    def create_approval(self, run_id, *, tool_name, args, summary, approver_id):
        row = {"id": len(self.approvals) + 1, "run_id": run_id, "tool_name": tool_name,
               "args": args, "summary": summary, "approver_id": approver_id, "status": "pending"}
        self.approvals.append(row)
        return row["id"]


class MySQLRunStore(RunStore):
    """Writes to ``agent_runs`` / ``agent_run_steps``."""

    def __init__(self) -> None:
        self._warned = False

    def _fail(self, what: str, exc: Exception) -> None:
        if not self._warned:
            self._warned = True
            log.warning("[RUNTIME] run store %s failed (is the agent_runs migration "
                        "applied?): %s", what, exc)

    def _execute(self, sql: str, params: tuple, *, want_id: bool = False) -> Optional[int]:
        from database import get_db_connection
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                new_id = cur.lastrowid if want_id else None
            conn.commit()
            return new_id
        finally:
            conn.close()

    def start_run(self, *, run_uuid, agent_key, trigger_type, input_text,
                  community_id, channel_id, invoked_by, is_dry_run,
                  agent_id=None, trigger_message_id=None):
        try:
            cols = ["run_uuid", "agent_key", "trigger_type", "community_id", "channel_id",
                    "invoked_by", "is_dry_run", "status", "input_text"]
            marks = ["%s"] * 7 + ["'running'", "%s"]
            vals = [run_uuid, agent_key, trigger_type, community_id, channel_id,
                    invoked_by, 1 if is_dry_run else 0, (input_text or "")[:4000]]
            # M2 columns are only written when given, so a database that has
            # not run add_agent_definitions.sql keeps working for CLI runs.
            if agent_id is not None:
                cols.append("agent_id"); marks.append("%s"); vals.append(agent_id)
            if trigger_message_id is not None:
                cols.append("trigger_message_id"); marks.append("%s"); vals.append(trigger_message_id)
            return self._execute(
                f"INSERT INTO agent_runs ({', '.join(cols)}) VALUES ({', '.join(marks)})",
                tuple(vals), want_id=True,
            )
        except Exception as exc:  # noqa: BLE001
            self._fail("start_run", exc)
            return None

    def add_step(self, run_id, step_no, kind, *, tool_name=None, args=None,
                 result=None, latency_ms=None):
        if run_id is None:
            return
        try:
            self._execute(
                "INSERT INTO agent_run_steps (run_id, step_no, kind, tool_name, "
                "args_json, result_json, latency_ms) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (run_id, step_no, kind, tool_name, _dumps(args), _dumps(result),
                 latency_ms),
            )
        except Exception as exc:  # noqa: BLE001
            self._fail("add_step", exc)

    def finish_run(self, run_id, *, status, output_text, step_count,
                   tokens_in, tokens_out, error):
        if run_id is None:
            return
        try:
            self._execute(
                "UPDATE agent_runs SET status = %s, output_text = %s, step_count = %s, "
                "tokens_in = %s, tokens_out = %s, error = %s, finished_at = NOW() "
                "WHERE id = %s",
                (status, (output_text or "")[:4000] or None, step_count, tokens_in,
                 tokens_out, (error or "")[:500] or None, run_id),
            )
        except Exception as exc:  # noqa: BLE001
            self._fail("finish_run", exc)

    @staticmethod
    def _pending_count(approver_id: int) -> int:
        from database import get_db_connection
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) AS n FROM agent_approvals "
                            "WHERE approver_id = %s AND status = 'pending' AND expires_at > NOW()",
                            (approver_id,))
                return int((cur.fetchone() or {}).get("n") or 0)
        finally:
            conn.close()

    def create_approval(self, run_id, *, tool_name, args, summary, approver_id):
        if run_id is None:
            return None
        try:
            if self._pending_count(approver_id) >= max_pending_approvals():
                log.warning("[RUNTIME] approver %s has too many pending approvals", approver_id)
                return None
            return self._execute(
                "INSERT INTO agent_approvals (run_id, tool_name, args_json, summary, approver_id, "
                "expires_at) VALUES (%s, %s, %s, %s, %s, DATE_ADD(NOW(), INTERVAL %s MINUTE))",
                (run_id, tool_name, _dumps(args) or "{}", (summary or "")[:500], approver_id,
                 approval_ttl_minutes()),
                want_id=True)
        except Exception as exc:  # noqa: BLE001
            self._fail("create_approval", exc)
            return None


def get_default_store() -> RunStore:
    """MySQL unless ``AGENT_RUNTIME_PERSIST=0``."""
    if (os.getenv("AGENT_RUNTIME_PERSIST") or "1").strip() == "0":
        return NullRunStore()
    return MySQLRunStore()
