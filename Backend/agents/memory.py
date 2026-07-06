"""
AuraFlow Autonomous-Agent Memory
=================================
Per-agent persistent state (goals, adaptive thresholds, last-acted) plus
the action log and feedback collector. Backed by `agent_state`,
`agent_actions`, and `agent_feedback` (see Backend/migrations/).

These helpers are intentionally tiny and synchronous: each call opens a
short-lived connection from the existing pool, does one query, closes.
Higher-level patterns (LRU caches, bandit arms, etc.) live inside each
agent and use these primitives.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from database import get_db_connection

log = logging.getLogger(__name__)

# Scope constants — keep in sync with the ENUM in add_agent_state.sql.
SCOPE_COMMUNITY = "community"
SCOPE_CHANNEL   = "channel"
SCOPE_USER      = "user"
SCOPE_GLOBAL    = "global"

VALID_SCOPES = {SCOPE_COMMUNITY, SCOPE_CHANNEL, SCOPE_USER, SCOPE_GLOBAL}


# ── agent_state ──────────────────────────────────────────────────────

def get_state(agent_name: str, scope_type: str, scope_id: Optional[int],
              goal_key: str = "default") -> Optional[dict]:
    """Fetch one agent_state row as a dict, or None if not present.

    `goal_value` and `thresholds` are JSON-decoded into Python dicts when
    present (MySQL JSON columns may arrive as str depending on driver).
    """
    if scope_type not in VALID_SCOPES:
        raise ValueError(f"invalid scope_type {scope_type!r}")
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, agent_name, scope_type, scope_id, goal_key, "
                "       goal_value, thresholds, last_acted_at, last_outcome, updated_at "
                "FROM agent_state "
                "WHERE agent_name=%s AND scope_type=%s "
                "  AND ((scope_id IS NULL AND %s IS NULL) OR scope_id=%s) "
                "  AND goal_key=%s "
                "LIMIT 1",
                (agent_name, scope_type, scope_id, scope_id, goal_key),
            )
            row = cur.fetchone()
        if not row:
            return None
        for k in ("goal_value", "thresholds"):
            v = row.get(k)
            if isinstance(v, (str, bytes, bytearray)):
                try:
                    row[k] = json.loads(v)
                except Exception:
                    row[k] = None
        return row
    except Exception as exc:
        log.warning(f"[agent_memory] get_state({agent_name},{scope_type},{scope_id},{goal_key}) failed: {exc}")
        return None
    finally:
        if conn:
            conn.close()


def set_state(agent_name: str, scope_type: str, scope_id: Optional[int],
              goal_key: str = "default", *,
              goal_value: Optional[dict] = None,
              thresholds: Optional[dict] = None,
              last_acted: bool = False,
              last_outcome: Optional[str] = None) -> bool:
    """Upsert one agent_state row.

    Only the fields you pass are written; unspecified columns keep their
    existing values via COALESCE on the UPDATE branch. Pass last_acted=True
    to bump last_acted_at to NOW().
    """
    if scope_type not in VALID_SCOPES:
        raise ValueError(f"invalid scope_type {scope_type!r}")
    gv_json = json.dumps(goal_value) if goal_value is not None else None
    th_json = json.dumps(thresholds) if thresholds is not None else None
    last_acted_sql = "NOW()" if last_acted else "last_acted_at"

    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # MySQL has no native partial-update upsert; emulate with
            # INSERT … ON DUPLICATE KEY UPDATE + COALESCE.
            cur.execute(
                f"""
                INSERT INTO agent_state
                    (agent_name, scope_type, scope_id, goal_key,
                     goal_value, thresholds, last_acted_at, last_outcome)
                VALUES (%s, %s, %s, %s, %s, %s, {('NOW()' if last_acted else 'NULL')}, %s)
                ON DUPLICATE KEY UPDATE
                    goal_value    = COALESCE(VALUES(goal_value), goal_value),
                    thresholds    = COALESCE(VALUES(thresholds), thresholds),
                    last_acted_at = {last_acted_sql},
                    last_outcome  = COALESCE(VALUES(last_outcome), last_outcome)
                """,
                (agent_name, scope_type, scope_id, goal_key,
                 gv_json, th_json, last_outcome),
            )
        conn.commit()
        return True
    except Exception as exc:
        log.warning(f"[agent_memory] set_state failed: {exc}")
        try:
            if conn:
                conn.rollback()
        except Exception:
            pass
        return False
    finally:
        if conn:
            conn.close()


# ── agent_actions ────────────────────────────────────────────────────

def log_action(*, agent_name: str, decision: str, reason: str,
               correlation_id: str,
               community_id: Optional[int] = None,
               channel_id:   Optional[int] = None,
               user_id:      Optional[int] = None,
               payload:      Optional[dict] = None,
               emit_socket:  bool = True) -> Optional[int]:
    """Insert one agent_actions row and return its id.

    The (agent_name, correlation_id) UNIQUE key makes this idempotent:
    if a sibling worker already logged the same correlation, the INSERT
    fails silently and we return the existing row id instead.
    """
    if decision not in ("act", "skip", "defer"):
        raise ValueError(f"invalid decision {decision!r}")

    payload_json = json.dumps(payload, default=str) if payload is not None else None
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            try:
                cur.execute(
                    "INSERT INTO agent_actions "
                    "(agent_name, community_id, channel_id, user_id, "
                    " decision, reason, payload_json, correlation_id) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                    (agent_name, community_id, channel_id, user_id,
                     decision, (reason or "")[:255], payload_json, correlation_id),
                )
                action_id = cur.lastrowid
                conn.commit()
            except Exception:
                # Duplicate correlation — fetch existing id.
                conn.rollback()
                cur.execute(
                    "SELECT id FROM agent_actions "
                    "WHERE agent_name=%s AND correlation_id=%s LIMIT 1",
                    (agent_name, correlation_id),
                )
                row = cur.fetchone()
                action_id = row["id"] if row else None

        if action_id and emit_socket:
            # Best-effort frontend broadcast — never block on failure.
            try:
                from agents.event_bus import publish_action_to_frontend
                publish_action_to_frontend({
                    "id": action_id,
                    "agent_name": agent_name,
                    "community_id": community_id,
                    "channel_id":   channel_id,
                    "user_id":      user_id,
                    "decision":     decision,
                    "reason":       reason,
                    "correlation_id": correlation_id,
                    "created_at":   None,  # NOW() — frontend will format from arrival
                })
            except Exception:
                pass
        return action_id
    except Exception as exc:
        log.warning(f"[agent_memory] log_action failed: {exc}")
        return None
    finally:
        if conn:
            conn.close()


# ── agent_feedback ───────────────────────────────────────────────────

VALID_SIGNALS = ("positive", "negative", "dismissed", "engaged", "ignored")


def record_feedback(*, action_id: int, signal: str,
                    user_id: Optional[int] = None,
                    weight: float = 1.0) -> Optional[int]:
    """Insert one agent_feedback row and return its id, or None on failure.

    Does NOT call agent.learn() — that wiring lives in the
    /api/agents/<name>/feedback HTTP handler so unit tests of this
    function don't need the agent registry available.
    """
    if signal not in VALID_SIGNALS:
        raise ValueError(f"invalid signal {signal!r}")
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # NB: `signal` is reserved in MySQL 8.0+, so backtick everywhere.
            cur.execute(
                "INSERT INTO `agent_feedback` "
                "(`action_id`, `user_id`, `signal`, `weight`) "
                "VALUES (%s, %s, %s, %s)",
                (action_id, user_id, signal, float(weight)),
            )
            fb_id = cur.lastrowid
        conn.commit()
        return fb_id
    except Exception as exc:
        log.warning(f"[agent_memory] record_feedback failed: {exc}")
        try:
            if conn:
                conn.rollback()
        except Exception:
            pass
        return None
    finally:
        if conn:
            conn.close()


def get_action(action_id: int) -> Optional[dict]:
    """Fetch an agent_actions row by id (used by the feedback endpoint to
    look up the originating agent before calling its learn() hook)."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, agent_name, community_id, channel_id, user_id, "
                "       decision, reason, correlation_id, created_at "
                "FROM agent_actions WHERE id=%s LIMIT 1",
                (action_id,),
            )
            return cur.fetchone()
    except Exception as exc:
        log.warning(f"[agent_memory] get_action failed: {exc}")
        return None
    finally:
        if conn:
            conn.close()


def get_action_by_correlation(agent_name: str, correlation_id: str) -> Optional[dict]:
    """Fetch an agent_actions row by (agent_name, correlation_id) — the
    UNIQUE pair on the table. Used by the feedback endpoint when the
    frontend only has the correlation_id (timeline + toast pattern)."""
    if not agent_name or not correlation_id:
        return None
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, agent_name, community_id, channel_id, user_id, "
                "       decision, reason, correlation_id, created_at "
                "FROM agent_actions "
                "WHERE agent_name=%s AND correlation_id=%s "
                "ORDER BY id DESC LIMIT 1",
                (agent_name, correlation_id),
            )
            return cur.fetchone()
    except Exception as exc:
        log.warning(f"[agent_memory] get_action_by_correlation failed: {exc}")
        return None
    finally:
        if conn:
            conn.close()
