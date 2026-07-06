"""
TC-IT-15 to TC-IT-26
Integration tests for /channels/* and /messages/* routes.
Flask test client with mocked DB and JWT.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from unittest.mock import patch, MagicMock
from flask_jwt_extended import create_access_token


def _jwt_headers(app, username="testuser"):
    """Generate a valid JWT header within app context."""
    with app.app_context():
        token = create_access_token(identity=username)
    return {"Authorization": f"Bearer {token}"}


def _mock_conn(rows=None, lastrowid=1):
    cur = MagicMock()
    cur.fetchone.return_value = rows[0] if rows else None
    cur.fetchall.return_value = rows or []
    cur.lastrowid = lastrowid
    cur.__enter__ = lambda s: s
    cur.__exit__ = MagicMock(return_value=False)
    conn = MagicMock()
    conn.cursor.return_value = cur
    return conn, cur


# ── GET /channels/<id>/messages ────────────────────────────────────────

class TestGetMessages:
    """TC-IT-15 to TC-IT-17: Retrieve channel messages."""

    def test_get_messages_returns_200_with_list(self, client, app):
        """TC-IT-15: Authenticated GET on a valid channel returns 200 + list."""
        headers = _jwt_headers(app)
        membership = {"user_id": 1, "role": "member", "channel_id": 1, "community_id": 1}
        msg_rows = [
            {"id": 1, "content": "Hello", "sender_id": 1, "username": "testuser",
             "display_name": "Test User", "avatar_url": None,
             "created_at": None, "message_type": "text", "file_url": None,
             "reply_to": None, "is_pinned": False, "is_blocked": 0,
             "att_file_name": None, "att_file_url": None, "att_file_size": None,
             "att_mime_type": None, "att_duration": None,
             "reply_content": None, "reply_message_type": None, "reply_author": None,
             "mod_output": None, "mod_confidence": None, "sender_violation_count": 0}
        ]
        conn, cur = _mock_conn(rows=[membership])
        cur.fetchall.return_value = msg_rows

        with patch("routes.messages.get_db_connection", return_value=conn), \
             patch("routes.messages.get_channel_membership", return_value=membership), \
             patch("routes.messages.get_channel_messages_cache", return_value=None), \
             patch("routes.messages.seed_channel_messages_cache", return_value=None), \
             patch("routes.messages.get_user_id", return_value=1):
            resp = client.get("/api/messages/channel/1", headers=headers)

        assert resp.status_code == 200
        assert isinstance(resp.get_json(), list)

    def test_get_messages_unauthenticated_returns_401(self, client):
        """TC-IT-16: Unauthenticated request returns 401."""
        resp = client.get("/api/messages/channel/1")
        assert resp.status_code == 401

    def test_get_messages_non_member_returns_403_or_404(self, client, app):
        """TC-IT-17: Non-member of channel receives 403 or 404."""
        headers = _jwt_headers(app)
        conn, cur = _mock_conn(rows=[])
        cur.fetchone.return_value = None  # not a member

        with patch("routes.messages.get_db_connection", return_value=conn), \
             patch("routes.messages.get_channel_membership", return_value=None), \
             patch("routes.messages.get_user_id", return_value=99):
            resp = client.get("/api/messages/channel/1", headers=headers)

        assert resp.status_code in (403, 404)


# ── POST /channels/<id>/messages ──────────────────────────────────────

class TestSendMessage:
    """TC-IT-18 to TC-IT-21: Send message to channel."""

    def test_send_message_returns_201(self, client, app):
        """TC-IT-18: Valid message send returns 201 with message object."""
        headers = _jwt_headers(app)
        # Combined channel+blocked+community-member+sender-profile lookup
        # (collapsed from 4 round trips into 1 — see routes/messages.py send_message).
        combo_row = {
            "community_id": 1, "role": "member", "violation_count": 0,
            "blocked_id": None,
            "sender_display_name": "Test User", "sender_avatar_url": None,
        }
        conn, cur = _mock_conn()
        cur.lastrowid = 42
        cur.fetchone.side_effect = [combo_row]

        with patch("routes.messages.get_db_connection", return_value=conn), \
             patch("routes.messages.get_channel_membership", return_value=True), \
             patch("routes.messages.set_channel_membership", return_value=None), \
             patch("routes.messages.push_channel_message_cache", return_value=None), \
             patch("routes.messages.invalidate_channel_messages_cache", return_value=None), \
             patch("routes.messages.get_user_id", return_value=1), \
             patch("routes.messages._encrypt", side_effect=lambda x: x), \
             patch("routes.messages._get_moderation_agent") as mock_mod, \
             patch("routes.messages._notify_mentions", return_value=None), \
             patch("routes.messages._dispatch_agent_tasks", return_value=None), \
             patch("routes.messages._emit_unread_tracking", return_value=None):
            mock_mod.return_value.instant_check.return_value = {"block": False, "reason": ""}
            resp = client.post(
                "/api/messages/send",
                json={"content": "Hello world", "channel_id": 1},
                headers=headers,
            )

        assert resp.status_code in (200, 201)

    def test_send_empty_message_returns_400(self, client, app):
        """TC-IT-19: Empty content string returns 400 (route validates before DB)."""
        headers = _jwt_headers(app)
        conn, _ = _mock_conn()

        with patch("routes.messages.get_db_connection", return_value=conn), \
             patch("routes.messages.get_user_id", return_value=1):
            resp = client.post(
                "/api/messages/send",
                json={"content": "", "channel_id": 1},
                headers=headers,
            )

        assert resp.status_code in (400, 422)

    def test_send_message_blocked_content_returns_403(self, client, app):
        """TC-IT-20: Extreme content blocked by ModerationAgent returns 200 with moderation block info."""
        headers = _jwt_headers(app)
        combo_row = {
            "community_id": 1, "role": "member", "violation_count": 1,
            "blocked_id": None,
            "sender_display_name": "Test User", "sender_avatar_url": None,
        }
        conn, _ = _mock_conn()
        _.fetchone.side_effect = [combo_row]

        with patch("routes.messages.get_db_connection", return_value=conn), \
             patch("routes.messages.get_channel_membership", return_value=True), \
             patch("routes.messages.set_channel_membership", return_value=None), \
             patch("routes.messages.get_user_id", return_value=1), \
             patch("routes.messages._encrypt", side_effect=lambda x: x), \
             patch("routes.messages._get_moderation_agent") as mock_mod:
            mock_mod.return_value.instant_check.return_value = {
                "block": True, "reason": "Extreme content"
            }
            mock_mod.return_value.log_moderation_action.return_value = None
            resp = client.post(
                "/api/messages/send",
                json={"content": "blocked content here", "channel_id": 1},
                headers=headers,
            )

        # Route returns 200 with moderation block info (not 403)
        assert resp.status_code == 200
        data = resp.get_json()
        assert data.get("moderation", {}).get("action") == "block"

    def test_send_message_unauthenticated_returns_401(self, client):
        """TC-IT-21: Unauthenticated POST returns 401."""
        resp = client.post("/api/messages/send", json={"content": "hello", "channel_id": 1})
        assert resp.status_code == 401


# ── DELETE /messages/<id> ─────────────────────────────────────────────

class TestDeleteMessage:
    """TC-IT-22 to TC-IT-23: Delete message."""

    def test_delete_own_message_returns_200(self, client, app):
        """TC-IT-22: Message owner can delete their message."""
        headers = _jwt_headers(app)
        msg_row = {"id": 10, "sender_id": 1, "channel_id": 1, "community_id": 1}
        conn, cur = _mock_conn(rows=[msg_row])

        with patch("routes.messages.get_db_connection", return_value=conn), \
             patch("routes.messages.get_user_id", return_value=1), \
             patch("routes.messages.invalidate_channel_messages_cache", return_value=None):
            resp = client.delete("/api/messages/10", headers=headers)

        assert resp.status_code in (200, 204)

    def test_delete_others_message_returns_403(self, client, app):
        """TC-IT-23: User cannot delete another user's message."""
        headers = _jwt_headers(app)
        msg_row = {"id": 10, "sender_id": 99, "channel_id": 1, "community_id": 1}
        conn, cur = _mock_conn(rows=[msg_row])

        with patch("routes.messages.get_db_connection", return_value=conn), \
             patch("routes.messages.get_user_id", return_value=1):
            resp = client.delete("/api/messages/10", headers=headers)

        assert resp.status_code in (403, 404)


# ── PUT /messages/<id> ────────────────────────────────────────────────

class TestEditMessage:
    """TC-IT-24 to TC-IT-26: Edit message."""

    def test_edit_own_message_returns_200(self, client, app):
        """TC-IT-24: Message owner can edit content."""
        headers = _jwt_headers(app)
        msg_row = {
            "id": 10, "sender_id": 1, "channel_id": 1,
            "community_id": 1, "content": "old content"
        }
        updated_row = {
            "id": 10, "sender_id": 1, "channel_id": 1, "content": "edited content",
            "message_type": "text", "reply_to": None,
            "created_at": __import__('datetime').datetime(2024, 1, 1, 10, 0, 0),
            "username": "testuser", "display_name": "Test User", "avatar_url": None,
        }
        conn, cur = _mock_conn(rows=[msg_row])
        cur.fetchone.side_effect = [msg_row, updated_row]

        with patch("routes.messages.get_db_connection", return_value=conn), \
             patch("routes.messages.get_user_id", return_value=1), \
             patch("routes.messages._encrypt", side_effect=lambda x: x), \
             patch("routes.messages._decrypt", side_effect=lambda x: x), \
             patch("routes.messages._avatar_url", return_value=None), \
             patch("routes.messages.invalidate_channel_messages_cache", return_value=None):
            resp = client.put("/api/messages/10", json={"content": "edited content"}, headers=headers)

        assert resp.status_code in (200, 204)

    def test_edit_empty_content_returns_400(self, client, app):
        """TC-IT-25: Editing a message with empty string returns 400."""
        headers = _jwt_headers(app)
        msg_row = {"id": 10, "sender_id": 1, "channel_id": 1, "community_id": 1}
        conn, _ = _mock_conn(rows=[msg_row])

        with patch("routes.messages.get_db_connection", return_value=conn), \
             patch("routes.messages.get_user_id", return_value=1):
            resp = client.put("/api/messages/10", json={"content": ""}, headers=headers)

        assert resp.status_code in (400, 422)

    def test_edit_unauthenticated_returns_401(self, client):
        """TC-IT-26: Unauthenticated edit request returns 401."""
        resp = client.put("/api/messages/10", json={"content": "new"})
        assert resp.status_code == 401
