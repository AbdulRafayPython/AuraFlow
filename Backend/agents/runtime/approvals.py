"""
Approvals for agent write actions
=================================
When the loop meets a ``write`` tool call it stores an ``agent_approvals`` row
and stops (see ``loop._ask_for_approval``). This module is everything after
that:

``list_for``       what is waiting for a person (the Approvals inbox)
``decide``         approve or reject, exactly once, only by the approver
``execute``        run the approved tool, with the approver's own access
``finish_rejected`` tell the channel the agent will not go ahead
``expire_due``     stop old requests from waiting forever

The decision is a compare-and-set ``UPDATE`` so two clicks (or two workers)
cannot both win. ``execute`` claims the row the same way, so a retried task
never posts twice.
"""

from __future__ import annotations

import json
import logging
from contextlib import contextmanager
from typing import Any, Dict, Iterator, List, Optional

from agents.runtime import builtin_tools, write_tools  # noqa: F401  (registers the tools)
from agents.runtime.tools import TOOL_REGISTRY, ToolContext, ToolError, validate_arguments
from database import get_db_connection

log = logging.getLogger(__name__)

PENDING, APPROVED, REJECTED, EXPIRED = "pending", "approved", "rejected", "expired"
LIST_FILTERS = ("pending", "recent")

_SELECT = (
    "SELECT a.id, a.run_id, a.tool_name, a.args_json, a.summary, a.approver_id, a.status, "
    "a.result_json, a.decided_at, a.expires_at, a.created_at, r.agent_id, r.channel_id, "
    "r.community_id, r.trigger_message_id, d.public_id AS agent_public_id, d.name AS agent_name "
    "FROM agent_approvals a JOIN agent_runs r ON r.id = a.run_id "
    "LEFT JOIN agent_definitions d ON d.id = r.agent_id "
)


class ApprovalError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message, self.status = message, status


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


def _json(value: Any, default: Any) -> Any:
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value) if value else default
    except (TypeError, ValueError):
        return default


def _iso(value: Any) -> Any:
    """ISO text for a MySQL DATETIME. The database stores UTC, so say so (``Z``): a bare
    timestamp would be read by browsers as local time."""
    if not hasattr(value, "isoformat"):
        return value
    text = value.isoformat()
    return text if value.tzinfo else text + "Z"


def public_view(row: Dict[str, Any]) -> Dict[str, Any]:
    """What the API returns for one approval."""
    return {
        "id": row["id"], "status": row["status"], "summary": row["summary"],
        "tool": row["tool_name"], "args": _json(row.get("args_json"), {}),
        "agent": {"id": row.get("agent_public_id"), "name": row.get("agent_name") or "Agent"},
        "channel_id": row.get("channel_id"), "result": _json(row.get("result_json"), None),
        "created_at": _iso(row.get("created_at")), "expires_at": _iso(row.get("expires_at")),
        "decided_at": _iso(row.get("decided_at")),
    }


# ── reading ─────────────────────────────────────────────────────────────

def get(approval_id: int) -> Optional[Dict[str, Any]]:
    with _cursor() as cur:
        cur.execute(_SELECT + "WHERE a.id = %s", (approval_id,))
        return cur.fetchone()


def list_for(user_id: int, view: str = "pending", limit: int = 50) -> List[Dict[str, Any]]:
    """Approvals addressed to ``user_id``: still open, or the latest decided ones."""
    limit = max(1, min(int(limit), 100))
    where = ("a.status = 'pending' AND a.expires_at > NOW()" if view == "pending"
             else "a.status <> 'pending' OR a.expires_at <= NOW()")
    with _cursor() as cur:
        cur.execute(_SELECT + f"WHERE a.approver_id = %s AND ({where}) ORDER BY a.id DESC LIMIT %s",
                    (user_id, limit))
        return [public_view(r) for r in cur.fetchall() or []]


# ── deciding ────────────────────────────────────────────────────────────

def decide(approval_id: int, user_id: int, approve: bool) -> Dict[str, Any]:
    """Record the decision. Raises :class:`ApprovalError` unless it is still pending and yours."""
    new_status = APPROVED if approve else REJECTED
    with _cursor() as cur:
        cur.execute(
            "UPDATE agent_approvals SET status = %s, decided_at = NOW() "
            "WHERE id = %s AND approver_id = %s AND status = 'pending' AND expires_at > NOW()",
            (new_status, approval_id, user_id))
        won = cur.rowcount == 1
        cur.execute(_SELECT + "WHERE a.id = %s", (approval_id,))
        row = cur.fetchone()
    if row is None or row["approver_id"] != user_id:
        raise ApprovalError("Approval not found", 404)
    if not won:
        if row["status"] == PENDING:
            raise ApprovalError("This request has expired", 409)
        raise ApprovalError(f"This request was already {row['status']}", 409)
    return row


# ── after the decision ──────────────────────────────────────────────────

def _set_run_status(cur: Any, run_id: int, status: str, error: Optional[str] = None) -> None:
    cur.execute("UPDATE agent_runs SET status = %s, error = %s, finished_at = NOW() WHERE id = %s",
                (status, (error or "")[:500] or None, run_id))


def _add_step(cur: Any, run_id: int, kind: str, tool_name: str, result: Any) -> None:
    cur.execute("SELECT COALESCE(MAX(step_no), 0) + 1 AS n FROM agent_run_steps WHERE run_id = %s", (run_id,))
    n = (cur.fetchone() or {}).get("n") or 1
    cur.execute("INSERT INTO agent_run_steps (run_id, step_no, kind, tool_name, result_json) "
                "VALUES (%s, %s, %s, %s, %s)",
                (run_id, n, kind, tool_name, json.dumps(result, ensure_ascii=False, default=str)[:60000]))


def execute(approval_id: int) -> Optional[Dict[str, Any]]:
    """Run an approved tool once. Returns the outcome, or None when it was already run."""
    with _cursor() as cur:
        cur.execute("UPDATE agent_approvals SET result_json = %s "
                    "WHERE id = %s AND status = 'approved' AND result_json IS NULL",
                    (json.dumps({"state": "running"}), approval_id))
        if cur.rowcount != 1:
            return None
        cur.execute(_SELECT + "WHERE a.id = %s", (approval_id,))
        row = cur.fetchone()

    if row["tool_name"].startswith("mcp_") and row.get("agent_id"):
        from agents.runtime import mcp
        mcp.register_for_agent(int(row["agent_id"]))
    tool = TOOL_REGISTRY.get(row["tool_name"])
    outcome: Dict[str, Any]
    if tool is None:
        outcome = {"ok": False, "error": f"tool '{row['tool_name']}' no longer exists"}
    else:
        args, problems = validate_arguments(tool.parameters, _json(row["args_json"], {}))
        ctx = ToolContext(
            invoked_by=row["approver_id"], approver_id=row["approver_id"],
            community_id=row["community_id"], channel_id=row["channel_id"], run_id=row["run_id"],
            extra={"agent_id": row["agent_id"], "approved": True})
        try:
            if problems:
                raise ToolError("; ".join(problems))
            outcome = {"ok": True, "value": tool.func(ctx, **args)}
        except ToolError as exc:
            outcome = {"ok": False, "error": str(exc)}
        except Exception:  # noqa: BLE001
            log.exception("[APPROVALS] tool %s crashed (approval=%s)", row["tool_name"], approval_id)
            outcome = {"ok": False, "error": "the action failed unexpectedly"}

    with _cursor() as cur:
        cur.execute("UPDATE agent_approvals SET result_json = %s WHERE id = %s",
                    (json.dumps(outcome, ensure_ascii=False, default=str)[:60000], approval_id))
        _add_step(cur, row["run_id"], "tool_result", row["tool_name"], outcome)
        _set_run_status(cur, row["run_id"], "succeeded" if outcome["ok"] else "failed",
                        None if outcome["ok"] else outcome.get("error"))
    _notify(row, "approved" if outcome["ok"] else "failed", outcome)
    return outcome


def finish_rejected(approval_id: int) -> None:
    """The person said no: close the run and let the channel know."""
    row = get(approval_id)
    if row is None or row["status"] != REJECTED:
        return
    with _cursor() as cur:
        _add_step(cur, row["run_id"], "approval", row["tool_name"], {"status": REJECTED})
        _set_run_status(cur, row["run_id"], "cancelled")
    _post_note(row, "Okay, I won't do that.")
    _notify(row, "rejected", None)


def expire_due() -> int:
    """Mark overdue pending approvals expired and cancel their runs. Returns how many."""
    with _cursor() as cur:
        cur.execute("SELECT a.id, a.run_id, a.approver_id FROM agent_approvals a "
                    "WHERE a.status = 'pending' AND a.expires_at <= NOW() LIMIT 200")
        due = list(cur.fetchall() or [])
        for item in due:
            cur.execute("UPDATE agent_approvals SET status = 'expired', decided_at = NOW() "
                        "WHERE id = %s AND status = 'pending'", (item["id"],))
            if cur.rowcount == 1:
                _set_run_status(cur, item["run_id"], "cancelled", "approval expired")
    for item in due:
        _emit_user(item["approver_id"], "agent_approval_resolved",
                   {"id": item["id"], "status": EXPIRED})
    return len(due)


# ── notifications ───────────────────────────────────────────────────────

def _emit_user(user_id: int, event: str, payload: Dict[str, Any]) -> None:
    from agents.runtime.posting import emit_to_user
    emit_to_user(user_id, event, payload)


def announce_requested(approval_ids: List[int], approver_id: int) -> None:
    """Tell the approver's open tabs that something is waiting."""
    for approval_id in approval_ids:
        row = get(approval_id)
        if row is not None:
            _emit_user(approver_id, "agent_approval_requested", public_view(row))


def _notify(row: Dict[str, Any], state: str, outcome: Optional[Dict[str, Any]]) -> None:
    payload = {"id": row["id"], "status": state, "summary": row["summary"],
               "agent": row.get("agent_name"), "error": (outcome or {}).get("error")}
    _emit_user(row["approver_id"], "agent_approval_resolved", payload)


def _post_note(row: Dict[str, Any], text: str) -> None:
    from agents.runtime.definitions import get_definition
    from agents.runtime.posting import post_as_agent
    if not row.get("channel_id") or not row.get("agent_id"):
        return
    defn = get_definition(row["agent_id"])
    if defn is not None:
        post_as_agent(defn, row["channel_id"], text, reply_to=row.get("trigger_message_id"),
                      run_id=row["run_id"])
