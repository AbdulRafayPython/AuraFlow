# routes/notifications.py — Notification REST endpoints
import logging
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import get_db_connection
from services.notification_service import (
    get_notifications,
    get_unread_count,
    mark_read,
    mark_all_read,
    delete_notification,
    delete_all_notifications,
)
import config as _cfg

log = logging.getLogger(__name__)

notifications_bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")


@notifications_bp.route("", methods=["GET"])
@jwt_required()
def list_notifications():
    """GET /api/notifications?limit=30&offset=0"""
    user_id = _current_user_id()
    if not user_id:
        return jsonify({"error": "User not found"}), 404

    limit = min(int(request.args.get("limit", 30)), 100)
    offset = max(int(request.args.get("offset", 0)), 0)
    data = get_notifications(user_id, limit=limit, offset=offset)
    return jsonify(data), 200


@notifications_bp.route("/unread-count", methods=["GET"])
@jwt_required()
def unread_count():
    """GET /api/notifications/unread-count"""
    user_id = _current_user_id()
    if not user_id:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"count": get_unread_count(user_id)}), 200


@notifications_bp.route("/read", methods=["PATCH"])
@jwt_required()
def read_notifications():
    """PATCH /api/notifications/read  body: { ids: [1,2,3] }"""
    user_id = _current_user_id()
    if not user_id:
        return jsonify({"error": "User not found"}), 404

    ids = (request.get_json() or {}).get("ids", [])
    if not isinstance(ids, list):
        return jsonify({"error": "ids must be a list"}), 400

    # Sanitise: only ints
    safe_ids = [int(i) for i in ids if isinstance(i, (int, float))]
    mark_read(user_id, safe_ids)
    return jsonify({"ok": True}), 200


@notifications_bp.route("/read-all", methods=["PATCH"])
@jwt_required()
def read_all_notifications():
    """PATCH /api/notifications/read-all"""
    user_id = _current_user_id()
    if not user_id:
        return jsonify({"error": "User not found"}), 404
    mark_all_read(user_id)
    return jsonify({"ok": True}), 200


@notifications_bp.route("/<int:notification_id>", methods=["DELETE"])
@jwt_required()
def remove_notification(notification_id):
    """DELETE /api/notifications/<id>"""
    user_id = _current_user_id()
    if not user_id:
        return jsonify({"error": "User not found"}), 404
    ok = delete_notification(user_id, notification_id)
    return (jsonify({"ok": True}), 200) if ok else (jsonify({"error": "Not found"}), 404)


@notifications_bp.route("", methods=["DELETE"])
@jwt_required()
def remove_all_notifications():
    """DELETE /api/notifications"""
    user_id = _current_user_id()
    if not user_id:
        return jsonify({"error": "User not found"}), 404
    delete_all_notifications(user_id)
    return jsonify({"ok": True}), 200


# ── Helper ───────────────────────────────────────────────────────────

def _current_user_id():
    """Resolve JWT username → user_id."""
    conn = None
    try:
        username = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            row = cur.fetchone()
            return row["id"] if row else None
    except Exception:
        return None
    finally:
        if conn:
            conn.close()


# ─── Web Push subscription endpoints ─────────────────────────────────

@notifications_bp.route("/push/vapid-public-key", methods=["GET"])
@jwt_required()
def vapid_public_key():
    """Return the server's VAPID public key so the frontend can subscribe."""
    key = _cfg.VAPID_PUBLIC_KEY
    if not key:
        return jsonify({"error": "Web push not configured"}), 501
    return jsonify({"publicKey": key}), 200


@notifications_bp.route("/push/subscribe", methods=["POST"])
@jwt_required()
def push_subscribe():
    """Store or update a push subscription for the current user."""
    user_id = _current_user_id()
    if not user_id:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json() or {}
    endpoint = data.get("endpoint")
    keys = data.get("keys", {})
    p256dh = keys.get("p256dh")
    auth = keys.get("auth")

    if not endpoint or not p256dh or not auth:
        return jsonify({"error": "endpoint, keys.p256dh, and keys.auth required"}), 400

    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Upsert: replace if endpoint already exists
            cur.execute(
                """INSERT INTO push_subscriptions (user_id, endpoint, p256dh_key, auth_key)
                   VALUES (%s, %s, %s, %s)
                   ON DUPLICATE KEY UPDATE user_id = %s, p256dh_key = %s, auth_key = %s""",
                (user_id, endpoint, p256dh, auth, user_id, p256dh, auth),
            )
        conn.commit()
        return jsonify({"ok": True}), 201
    except Exception as e:
        log.error(f"[PUSH] subscribe failed: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Failed to save subscription"}), 500
    finally:
        if conn:
            conn.close()


@notifications_bp.route("/push/unsubscribe", methods=["POST"])
@jwt_required()
def push_unsubscribe():
    """Remove a push subscription."""
    user_id = _current_user_id()
    if not user_id:
        return jsonify({"error": "User not found"}), 404

    endpoint = (request.get_json() or {}).get("endpoint")
    if not endpoint:
        return jsonify({"error": "endpoint required"}), 400

    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM push_subscriptions WHERE user_id = %s AND endpoint = %s",
                (user_id, endpoint),
            )
        conn.commit()
        return jsonify({"ok": True}), 200
    except Exception as e:
        log.error(f"[PUSH] unsubscribe failed: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Failed"}), 500
    finally:
        if conn:
            conn.close()
