"""
Reminders set by agents
=======================
``schedule_reminder`` (an approved write tool) stores one ``agent_reminders`` row.
A Beat task calls :func:`deliver_due` every minute; it claims each due row once
(``pending`` -> ``sent`` compare-and-set, so two workers never both post) and the agent
posts the reminder in the channel, mentioning the person.

Times are computed by the database (``NOW()``), which stores UTC, so no time zone maths
happens here.
"""

from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from typing import Any, Iterator, Optional

from database import get_db_connection

log = logging.getLogger(__name__)

MAX_MINUTES = 7 * 24 * 60
MAX_TEXT_CHARS = 300
BATCH = 50


def max_pending_per_user() -> int:
    """Open reminders one person may have (``AGENT_MAX_PENDING_REMINDERS``, default 20)."""
    try:
        return max(1, int(os.getenv("AGENT_MAX_PENDING_REMINDERS") or 20))
    except ValueError:
        return 20


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


def describe_delay(minutes: int) -> str:
    """'45 min', '2 h', '1 d 3 h' for the approval summary."""
    days, rest = divmod(int(minutes), 1440)
    hours, mins = divmod(rest, 60)
    parts = [f"{days} d" if days else "", f"{hours} h" if hours else "", f"{mins} min" if mins else ""]
    return " ".join(p for p in parts if p) or "0 min"


def create(*, agent_id: int, channel_id: int, user_id: int, text: str, in_minutes: int) -> Optional[int]:
    """Store a reminder. None when the person already has too many open ones."""
    with _cursor() as cur:
        cur.execute("SELECT COUNT(*) AS n FROM agent_reminders WHERE user_id = %s AND status = 'pending'",
                    (user_id,))
        if int((cur.fetchone() or {}).get("n") or 0) >= max_pending_per_user():
            return None
        cur.execute(
            "INSERT INTO agent_reminders (agent_id, channel_id, user_id, text, remind_at) "
            "VALUES (%s, %s, %s, %s, DATE_ADD(NOW(), INTERVAL %s MINUTE))",
            (agent_id, channel_id, user_id, text[:500], int(in_minutes)))
        return cur.lastrowid


def _finish(cur: Any, reminder_id: int, error: Optional[str]) -> None:
    if error:
        cur.execute("UPDATE agent_reminders SET status = 'failed', error = %s WHERE id = %s",
                    (error[:255], reminder_id))


def deliver_due() -> int:
    """Post every reminder that is due. Returns how many were posted."""
    from agents.runtime import permissions
    from agents.runtime.definitions import get_definition
    from agents.runtime.posting import post_as_agent

    with _cursor() as cur:
        cur.execute("SELECT r.id, r.agent_id, r.channel_id, r.user_id, r.text, u.username "
                    "FROM agent_reminders r JOIN users u ON u.id = r.user_id "
                    "WHERE r.status = 'pending' AND r.remind_at <= NOW() ORDER BY r.remind_at LIMIT %s",
                    (BATCH,))
        due = list(cur.fetchall() or [])

    sent = 0
    for row in due:
        with _cursor() as cur:
            cur.execute("UPDATE agent_reminders SET status = 'sent', sent_at = NOW() "
                        "WHERE id = %s AND status = 'pending'", (row["id"],))
            if cur.rowcount != 1:       # another worker has it
                continue
            error = None
            try:
                defn = get_definition(int(row["agent_id"]))
                if defn is None:
                    error = "The agent is no longer active."
                elif not permissions.can_read_channel(row["user_id"], row["channel_id"]):
                    error = "The person is no longer in that channel."
                elif post_as_agent(defn, row["channel_id"],
                                   f"⏰ @{row['username']} reminder: {row['text']}") is None:
                    error = "The reminder could not be posted."
            except Exception:  # noqa: BLE001
                log.exception("[RUNTIME] reminder %s failed", row["id"])
                error = "Unexpected error."
            if error:
                _finish(cur, row["id"], error)
            else:
                sent += 1
    return sent
