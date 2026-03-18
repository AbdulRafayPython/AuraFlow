# services/notification_service.py — Persistent notification service
"""
Notification Service
====================
Creates notifications in the DB, emits real-time socket events,
and sends web push to offline users.
"""
import json
import logging
from database import get_db_connection

log = logging.getLogger(__name__)

_socketio = None

# Lazy-loaded web push helper
_webpush = None
_vapid_private = None
_vapid_claims = None


def init(socketio_instance):
    """Bind the SocketIO instance and load VAPID keys for web push."""
    global _socketio, _webpush, _vapid_private, _vapid_claims
    _socketio = socketio_instance
    log.info("[NOTIFICATIONS] Service initialized")

    import config as _cfg
    if _cfg.VAPID_PRIVATE_KEY and _cfg.VAPID_PUBLIC_KEY:
        try:
            from pywebpush import webpush
            _webpush = webpush
            _vapid_private = _cfg.VAPID_PRIVATE_KEY
            _vapid_claims = {"sub": _cfg.VAPID_CLAIMS_EMAIL}
            log.info("[NOTIFICATIONS] Web push enabled (VAPID keys loaded)")
        except ImportError:
            log.warning("[NOTIFICATIONS] pywebpush not installed — web push disabled")
    else:
        log.info("[NOTIFICATIONS] No VAPID keys — web push disabled")


def create_notification(
    user_id: int,
    type: str,
    title: str,
    body: str,
    icon_url: str = None,
    link: str = None,
    related_id: int = None,
    emit: bool = True,
):
    """
    Insert a notification row and optionally push it over the socket.

    Returns the new notification dict or None on error.
    """
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO notifications
                   (user_id, type, title, body, icon_url, link, related_id)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                (user_id, type, title, body, icon_url, link, related_id),
            )
            notif_id = cur.lastrowid
            cur.execute("SELECT * FROM notifications WHERE id = %s", (notif_id,))
            row = cur.fetchone()
        conn.commit()

        notification = _row_to_dict(row)

        if emit and _socketio:
            _socketio.emit(
                "notification",
                notification,
                room=f"user_{user_id}",
                namespace="/",
            )

        # Web Push — best-effort, non-blocking
        if _webpush and emit:
            _send_web_push(user_id, notification)

        return notification

    except Exception as e:
        log.error(f"[NOTIFICATIONS] create_notification failed: {e}", exc_info=True)
        if conn:
            conn.rollback()
        return None
    finally:
        if conn:
            conn.close()


def get_notifications(user_id: int, limit: int = 30, offset: int = 0):
    """Return a page of notifications for a user (newest first)."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                """SELECT * FROM notifications
                   WHERE user_id = %s
                   ORDER BY created_at DESC
                   LIMIT %s OFFSET %s""",
                (user_id, limit, offset),
            )
            rows = cur.fetchall()
        return [_row_to_dict(r) for r in rows]
    except Exception as e:
        log.error(f"[NOTIFICATIONS] get_notifications failed: {e}", exc_info=True)
        return []
    finally:
        if conn:
            conn.close()


def get_unread_count(user_id: int) -> int:
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = %s AND is_read = 0",
                (user_id,),
            )
            return cur.fetchone()["cnt"]
    except Exception as e:
        log.error(f"[NOTIFICATIONS] get_unread_count failed: {e}", exc_info=True)
        return 0
    finally:
        if conn:
            conn.close()


def mark_read(user_id: int, notification_ids: list):
    """Mark specific notifications as read."""
    if not notification_ids:
        return
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            placeholders = ",".join(["%s"] * len(notification_ids))
            cur.execute(
                f"UPDATE notifications SET is_read = 1 WHERE user_id = %s AND id IN ({placeholders})",
                [user_id] + list(notification_ids),
            )
        conn.commit()
    except Exception as e:
        log.error(f"[NOTIFICATIONS] mark_read failed: {e}", exc_info=True)
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()


def mark_all_read(user_id: int):
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE notifications SET is_read = 1 WHERE user_id = %s AND is_read = 0",
                (user_id,),
            )
        conn.commit()
    except Exception as e:
        log.error(f"[NOTIFICATIONS] mark_all_read failed: {e}", exc_info=True)
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()


def delete_notification(user_id: int, notification_id: int) -> bool:
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM notifications WHERE id = %s AND user_id = %s",
                (notification_id, user_id),
            )
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    except Exception as e:
        log.error(f"[NOTIFICATIONS] delete_notification failed: {e}", exc_info=True)
        if conn:
            conn.rollback()
        return False
    finally:
        if conn:
            conn.close()


def delete_all_notifications(user_id: int):
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("DELETE FROM notifications WHERE user_id = %s", (user_id,))
        conn.commit()
    except Exception as e:
        log.error(f"[NOTIFICATIONS] delete_all failed: {e}", exc_info=True)
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()


# ── Helpers ──────────────────────────────────────────────────────────

def _row_to_dict(row):
    if not row:
        return None
    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "type": row["type"],
        "title": row["title"],
        "body": row["body"],
        "icon_url": row["icon_url"],
        "link": row["link"],
        "related_id": row["related_id"],
        "is_read": bool(row["is_read"]),
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
    }


def _send_web_push(user_id: int, notification: dict):
    """Send web push to all subscriptions for a user. Fire-and-forget."""
    import threading

    def _push():
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT endpoint, p256dh_key, auth_key FROM push_subscriptions WHERE user_id = %s",
                    (user_id,),
                )
                subs = cur.fetchall()

            payload = json.dumps({
                "title": notification.get("title", "AuroFlow"),
                "body": notification.get("body", ""),
                "icon": notification.get("icon_url") or "/AuraflowLogo.png",
                "data": {
                    "url": notification.get("link", "/"),
                    "notificationId": notification.get("id"),
                },
            })

            stale_endpoints = []
            for sub in subs:
                try:
                    _webpush(
                        subscription_info={
                            "endpoint": sub["endpoint"],
                            "keys": {
                                "p256dh": sub["p256dh_key"],
                                "auth": sub["auth_key"],
                            },
                        },
                        data=payload,
                        vapid_private_key=_vapid_private,
                        vapid_claims=_vapid_claims,
                    )
                except Exception as e:
                    err_str = str(e)
                    # 404 / 410 means the subscription is gone
                    if "410" in err_str or "404" in err_str:
                        stale_endpoints.append(sub["endpoint"])
                    else:
                        log.debug(f"[PUSH] Push to {sub['endpoint'][:40]}… failed: {e}")

            # Clean up stale subscriptions
            if stale_endpoints:
                try:
                    conn2 = get_db_connection()
                    with conn2.cursor() as cur2:
                        for ep in stale_endpoints:
                            cur2.execute("DELETE FROM push_subscriptions WHERE endpoint = %s", (ep,))
                    conn2.commit()
                    conn2.close()
                except Exception:
                    pass

        except Exception as e:
            log.debug(f"[PUSH] _send_web_push failed: {e}")
        finally:
            if conn:
                conn.close()

    threading.Thread(target=_push, daemon=True).start()
