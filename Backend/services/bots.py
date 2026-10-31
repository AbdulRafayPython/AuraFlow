"""
Bot (agent) user helpers
========================
Every agent is a row in ``users`` with ``is_bot = 1``. These helpers let the
rest of the app (login, mention notifications, friend requests) exclude bots
without breaking on a database that has not run
``migrations/add_agent_definitions.sql`` yet: while the column is missing,
nothing is a bot.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Iterable, Optional, Set

from database import get_db_connection

log = logging.getLogger(__name__)

_lock = threading.Lock()
_supported: Optional[bool] = None
_checked_at = 0.0
_RECHECK_SECONDS = 60.0     # re-probe a missing column so applying the migration needs no restart


def bots_supported() -> bool:
    """True once ``users.is_bot`` exists."""
    global _supported, _checked_at
    if _supported:
        return True
    now = time.monotonic()
    with _lock:
        if _supported is not None and now - _checked_at < _RECHECK_SECONDS:
            return bool(_supported)
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT 1 FROM information_schema.columns "
                    "WHERE table_schema = DATABASE() AND table_name = 'users' "
                    "AND column_name = 'is_bot' LIMIT 1")
                _supported = cur.fetchone() is not None
        except Exception as exc:  # noqa: BLE001
            log.debug("[BOTS] column probe failed: %s", exc)
            _supported = False
        finally:
            if conn:
                conn.close()
        _checked_at = now
        return bool(_supported)


def reset_cache() -> None:
    """Forget the column probe (tests)."""
    global _supported, _checked_at
    with _lock:
        _supported, _checked_at = None, 0.0


def is_bot_user(user_id: Optional[int]) -> bool:
    if not user_id or not bots_supported():
        return False
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT is_bot FROM users WHERE id = %s", (user_id,))
            row = cur.fetchone()
            return bool(row and row.get("is_bot"))
    except Exception as exc:  # noqa: BLE001
        log.debug("[BOTS] is_bot_user failed: %s", exc)
        return False
    finally:
        if conn:
            conn.close()


def bot_usernames_among(usernames: Iterable[str]) -> Set[str]:
    names = [n for n in usernames if n]
    if not names or not bots_supported():
        return set()
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            marks = ",".join(["%s"] * len(names))
            cur.execute(f"SELECT username FROM users WHERE is_bot = 1 AND username IN ({marks})", tuple(names))
            return {r["username"] for r in cur.fetchall() or []}
    except Exception as exc:  # noqa: BLE001
        log.debug("[BOTS] bot_usernames_among failed: %s", exc)
        return set()
    finally:
        if conn:
            conn.close()
