"""
The "Today" view
================
One call that answers "what needs me, and what did my agents do?": approvals waiting for the
person, reminders coming up, how each of their agents did in the last 24 hours, and the latest
runs. Each section is read on its own, so a missing table (a migration not applied yet) leaves
that section empty instead of failing the page.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Dict, List

from agents.runtime import approvals

log = logging.getLogger(__name__)

MAX_ITEMS = 20
RECENT_RUNS = 8


def _iso(value: Any) -> Any:
    if not hasattr(value, "isoformat"):
        return value
    text = value.isoformat()
    return text if value.tzinfo else text + "Z"


def _section(name: str, read: Callable[[], List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    try:
        return read()
    except Exception as exc:  # noqa: BLE001
        log.warning("[TODAY] %s unavailable: %s", name, exc)
        return []


def reminders(cur: Any, user_id: int) -> List[Dict[str, Any]]:
    cur.execute(
        "SELECT r.id, r.text, r.remind_at, r.channel_id, c.name AS channel_name, d.name AS agent_name "
        "FROM agent_reminders r JOIN channels c ON c.id = r.channel_id "
        "LEFT JOIN agent_definitions d ON d.id = r.agent_id "
        "WHERE r.user_id = %s AND r.status = 'pending' ORDER BY r.remind_at LIMIT %s", (user_id, MAX_ITEMS))
    return [{"id": r["id"], "text": r["text"], "remind_at": _iso(r["remind_at"]), "channel_id": r["channel_id"],
             "channel": r["channel_name"], "agent": r["agent_name"]} for r in cur.fetchall() or []]


def agent_stats(cur: Any, user_id: int) -> List[Dict[str, Any]]:
    cur.execute(
        "SELECT d.public_id, d.name, d.status, d.daily_run_cap, COUNT(r.id) AS runs, "
        "COALESCE(SUM(r.status = 'failed'), 0) AS failed, "
        "COALESCE(SUM(r.status = 'waiting_approval'), 0) AS waiting, "
        "COALESCE(SUM(COALESCE(r.tokens_in, 0) + COALESCE(r.tokens_out, 0)), 0) AS tokens "
        "FROM agent_definitions d LEFT JOIN agent_runs r ON r.agent_id = d.id AND r.is_dry_run = 0 "
        "AND r.started_at >= DATE_SUB(NOW(), INTERVAL 1 DAY) "
        "WHERE d.owner_user_id = %s AND d.status <> 'archived' AND (d.template_key IS NULL OR d.template_key <> 'aura') "
        "GROUP BY d.id, d.public_id, d.name, d.status, d.daily_run_cap ORDER BY runs DESC, d.id LIMIT %s",
        (user_id, MAX_ITEMS))
    return [{"id": r["public_id"], "name": r["name"], "status": r["status"], "runs": int(r["runs"] or 0),
             "failed": int(r["failed"] or 0), "waiting": int(r["waiting"] or 0), "tokens": int(r["tokens"] or 0),
             "daily_run_cap": r["daily_run_cap"]} for r in cur.fetchall() or []]


def recent_runs(cur: Any, user_id: int) -> List[Dict[str, Any]]:
    cur.execute(
        "SELECT r.run_uuid, r.status, r.trigger_type, r.started_at, d.name AS agent_name, d.public_id "
        "FROM agent_runs r JOIN agent_definitions d ON d.id = r.agent_id "
        "WHERE d.owner_user_id = %s AND r.is_dry_run = 0 ORDER BY r.id DESC LIMIT %s", (user_id, RECENT_RUNS))
    return [{"run_id": r["run_uuid"], "status": r["status"], "trigger": r["trigger_type"],
             "started_at": _iso(r["started_at"]), "agent": r["agent_name"], "agent_id": r["public_id"]}
            for r in cur.fetchall() or []]


def build(cur: Any, user_id: int) -> Dict[str, Any]:
    return {
        "approvals": _section("approvals", lambda: approvals.list_for(user_id, "pending", MAX_ITEMS)),
        "reminders": _section("reminders", lambda: reminders(cur, user_id)),
        "agents": _section("agents", lambda: agent_stats(cur, user_id)),
        "recent_runs": _section("recent runs", lambda: recent_runs(cur, user_id)),
    }
