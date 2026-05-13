"""
Admin Audit Logger
==================
Records every write-side admin action to admin_audit_logs.

Use log_admin_action(...) at each admin write endpoint:

    from services.audit_logger import log_admin_action
    log_admin_action(
        actor_user_id=request.admin_user_id,
        actor_role='system_admin' if request.is_system_admin else 'community_admin',
        action='user.suspend',
        target_type='user',
        target_id=user_id,
        community_id=None,
        metadata={'reason': reason, 'duration_days': days},
    )

Failures are swallowed (logged) — never block the user-facing request on audit
write failures.
"""

import json
import logging
from typing import Optional, Any

from database import get_db_connection

log = logging.getLogger(__name__)


_TABLE_ENSURED = False


def _ensure_table(conn) -> None:
    """Create admin_audit_logs if it doesn't exist. Idempotent, safe to call repeatedly."""
    global _TABLE_ENSURED
    if _TABLE_ENSURED:
        return
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS admin_audit_logs (
                    id BIGINT NOT NULL AUTO_INCREMENT,
                    actor_user_id INT NOT NULL,
                    actor_role ENUM('system_admin','community_admin','community_owner') NOT NULL,
                    action VARCHAR(64) NOT NULL,
                    target_type VARCHAR(32) NOT NULL,
                    target_id BIGINT NULL,
                    community_id INT NULL,
                    metadata JSON NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    KEY idx_actor (actor_user_id, created_at),
                    KEY idx_community (community_id, created_at),
                    KEY idx_target (target_type, target_id),
                    KEY idx_action (action, created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
                """
            )
        conn.commit()
        _TABLE_ENSURED = True
    except Exception as e:
        log.warning(f"[AUDIT] Could not ensure admin_audit_logs table: {e}")


def log_admin_action(
    actor_user_id: int,
    actor_role: str,
    action: str,
    target_type: str,
    target_id: Optional[int] = None,
    community_id: Optional[int] = None,
    metadata: Optional[dict] = None,
    conn: Any = None,
) -> Optional[int]:
    """
    Insert an audit log row. Returns the inserted id (or None on failure).

    If `conn` is provided, uses that connection (does not close it). Otherwise
    pulls a connection from the pool, commits, and closes.
    """
    own_conn = False
    try:
        if conn is None:
            conn = get_db_connection()
            own_conn = True
        _ensure_table(conn)
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO admin_audit_logs
                    (actor_user_id, actor_role, action, target_type, target_id, community_id, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    actor_user_id,
                    actor_role,
                    action,
                    target_type,
                    target_id,
                    community_id,
                    json.dumps(metadata) if metadata is not None else None,
                ),
            )
            inserted_id = cur.lastrowid
        if own_conn:
            conn.commit()
        return inserted_id
    except Exception as e:
        log.warning(f"[AUDIT] Failed to log admin action {action}: {e}")
        return None
    finally:
        if own_conn and conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def actor_role_from_request(request_obj) -> str:
    """Derive actor_role from the Flask request decorated by admin auth."""
    if getattr(request_obj, 'is_system_admin', False):
        return 'system_admin'
    admin_role = getattr(request_obj, 'admin_role', None)
    if admin_role == 'owner':
        return 'community_owner'
    return 'community_admin'
