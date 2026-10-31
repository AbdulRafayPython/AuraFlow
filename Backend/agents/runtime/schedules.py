"""
Schedule triggers
=================
An agent can wake up on a cron schedule ("every Friday 17:00") and post into a
channel. Schedules live in ``agent_triggers`` (``type = 'schedule'``) with
``config = {"cron": "0 17 * * 5", "tz": "Asia/Dubai", "prompt": "..."}`` and the
next due time in ``next_run_at`` (naive UTC).

Cost guard: a schedule may not fire more often than every
``MIN_INTERVAL_MINUTES``.

:func:`run_due_schedules` is called by a Celery beat task once a minute. Each
due trigger is *claimed* with a compare-and-swap on ``next_run_at`` before it is
enqueued, so two workers can never run the same occurrence.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from croniter import croniter

from database import get_db_connection

log = logging.getLogger(__name__)

MIN_INTERVAL_MINUTES = 15
MAX_PROMPT_CHARS = 500
DEFAULT_PROMPT = "Run your scheduled task now."


def _utc_naive(dt: datetime) -> datetime:
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def validate_schedule(config: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    """Return ``(clean_config, errors)`` for a schedule trigger config."""
    errors: List[str] = []
    cron = str((config or {}).get("cron") or "").strip()
    tz_name = str((config or {}).get("tz") or "UTC").strip()
    prompt = str((config or {}).get("prompt") or DEFAULT_PROMPT).strip()[:MAX_PROMPT_CHARS]

    tz: Optional[ZoneInfo] = None
    try:
        tz = ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, ValueError, OSError):
        errors.append(f"unknown time zone '{tz_name}'")

    if not cron or len(cron.split()) != 5 or not croniter.is_valid(cron):
        errors.append("cron must be a valid 5-field expression, e.g. '0 17 * * 5'")
    elif tz is not None:
        it = croniter(cron, datetime(2026, 1, 1, tzinfo=tz))
        times = [it.get_next(datetime) for _ in range(6)]
        gaps = [(b - a).total_seconds() / 60 for a, b in zip(times, times[1:])]
        if min(gaps) < MIN_INTERVAL_MINUTES:
            errors.append(f"schedules may not run more often than every {MIN_INTERVAL_MINUTES} minutes")

    return {"cron": cron, "tz": tz_name, "prompt": prompt}, errors


def next_run_utc(config: Dict[str, Any], after_utc: Optional[datetime] = None) -> datetime:
    """Next occurrence after ``after_utc`` (naive UTC, default now), as naive UTC."""
    after = (after_utc or _utc_naive(datetime.now(timezone.utc))).replace(tzinfo=timezone.utc)
    tz = ZoneInfo(config.get("tz") or "UTC")
    nxt = croniter(config["cron"], after.astimezone(tz)).get_next(datetime)
    return _utc_naive(nxt)


def _json(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    try:
        return json.loads(value) if value else {}
    except (TypeError, ValueError):
        return {}


def run_due_schedules(now: Optional[datetime] = None, limit: int = 50,
                      enqueue: Optional[Callable[[int, Dict[str, Any]], None]] = None) -> int:
    """Enqueue every schedule that is due. Returns how many were enqueued."""
    now = now or _utc_naive(datetime.now(timezone.utc))
    if enqueue is None:
        def enqueue(agent_id: int, trigger: Dict[str, Any]) -> None:
            from tasks.agent_runtime_tasks import run_agent_task
            run_agent_task.apply_async(kwargs={"agent_id": agent_id, "trigger": trigger}, queue="default")

    conn = get_db_connection()
    started = 0
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT t.id, t.agent_id, t.channel_id, t.config, t.next_run_at, d.owner_user_id "
                "FROM agent_triggers t JOIN agent_definitions d ON d.id = t.agent_id "
                "WHERE t.type = 'schedule' AND t.enabled = 1 AND d.status = 'active' "
                "AND t.next_run_at IS NOT NULL AND t.next_run_at <= %s "
                "ORDER BY t.next_run_at LIMIT %s", (now, limit))
            due = list(cur.fetchall() or [])

            for row in due:
                config = _json(row["config"])
                try:
                    following = next_run_utc(config, now)
                except Exception as exc:  # noqa: BLE001  (corrupt config: park it, do not spin)
                    log.warning("[schedules] trigger %s has a bad config: %s", row["id"], exc)
                    cur.execute("UPDATE agent_triggers SET enabled = 0 WHERE id = %s", (row["id"],))
                    conn.commit()
                    continue

                # Claim this occurrence; only one worker can win the swap.
                cur.execute("UPDATE agent_triggers SET next_run_at = %s WHERE id = %s AND next_run_at = %s",
                            (following, row["id"], row["next_run_at"]))
                claimed = cur.rowcount == 1
                conn.commit()
                if not claimed or not row["channel_id"]:
                    continue

                cur.execute("SELECT community_id FROM channels WHERE id = %s", (row["channel_id"],))
                channel = cur.fetchone()
                if not channel:
                    continue
                enqueue(row["agent_id"], {
                    "type": "schedule", "trigger_id": row["id"], "user_id": row["owner_user_id"],
                    "username": None, "channel_id": row["channel_id"],
                    "community_id": channel["community_id"], "message_id": None, "content": None,
                    "reply_to": None, "prompt": config.get("prompt") or DEFAULT_PROMPT})
                started += 1
    finally:
        conn.close()
    return started
