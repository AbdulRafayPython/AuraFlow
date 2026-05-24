"""
TC-UAT-01 to TC-UAT-20
User Acceptance Tests - AuraFlow
Simulates complete user journeys as a real end-user would experience them.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
import datetime
import bcrypt
from unittest.mock import patch, MagicMock
from flask_jwt_extended import create_access_token


# -- Helpers ----------------------------------------------------------------

def _build_cursor(rows=None, lastrowid=1):
    cur = MagicMock()
    if rows:
        cur.fetchone.side_effect = list(rows) + [None] * 10
    else:
        cur.fetchone.return_value = None
    cur.fetchall.return_value = rows or []
    cur.lastrowid = lastrowid
    cur.__enter__ = lambda s: s
    cur.__exit__ = MagicMock(return_value=False)
    return cur


def _build_conn(rows=None, lastrowid=1):
    cur = _build_cursor(rows, lastrowid)
    conn = MagicMock()
    conn.cursor.return_value = cur
    return conn, cur


def _jwt(app, username="uat_user"):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=username)}"}


# ===========================================================================
#  JOURNEY 1 - New User Registration
# ===========================================================================

class TestUAT_Registration:
    """TC-UAT-01 to TC-UAT-03: New user registers an account."""

    def test_uat01_user_registers_successfully(self, uat_client):
        """TC-UAT-01: User fills in valid registration form and gets success response."""
        conn, cur = _build_conn()
        cur.fetchone.return_value = None

        with patch("routes.auth.get_db_connection", return_value=conn), \
             patch("services.email_service.send_verification_email", return_value=None):
            resp = uat_client.post("/api/signup", json={
                "username": "uat_alice",
                "email": "alice@uat.auraflow.com",
                "password": "Alice@2024",
                "displayName": "Alice UAT",
            })

        assert resp.status_code in (201, 200)

    def test_uat02_duplicate_username_shows_error(self, uat_client):
        """TC-UAT-02: Registering with a taken username returns an error message."""
        conn, cur = _build_conn()
        cur.fetchone.return_value = {"id": 1, "username": "existing_user"}

        with patch("routes.auth.get_db_connection", return_value=conn):
            resp = uat_client.post("/api/signup", json={
                "username": "existing_user",
                "email": "new@uat.com",
                "password": "AuraFlow@1",
            })

        assert resp.status_code == 400
        assert "error" in resp.get_json()

    def test_uat03_weak_password_shows_guidance(self, uat_client):
        """TC-UAT-03: Weak password returns actionable error message."""
        conn, cur = _build_conn()
        cur.fetchone.return_value = None

        with patch("routes.auth.get_db_connection", return_value=conn):
            resp = uat_client.post("/api/signup", json={
                "username": "weakpw",
                "email": "weak@uat.com",
                "password": "abc",
            })
        assert resp.status_code == 400
        msg = resp.get_json().get("error", "")
        assert len(msg) > 5


# ===========================================================================
#  JOURNEY 2 - Login and Dashboard Access
# ===========================================================================

class TestUAT_Login:
    """TC-UAT-04 to TC-UAT-06: User logs in and accesses their profile."""

    def _do_login(self, uat_client, username="uat_user", password="AuraFlow@1"):
        hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        user_row = {
            "id": 10, "username": username, "password": hashed,
            "email": f"{username}@uat.com", "display_name": username,
            "avatar_url": None, "is_verified": True, "first_login": False,
            "email_verified": True, "created_at": "2024-01-01",
        }
        conn, cur = _build_conn()
        cur.fetchone.return_value = user_row

        with patch("routes.auth.get_db_connection", return_value=conn), \
             patch("services.session_manager.create_session", return_value="s1"), \
             patch("services.session_manager.check_refresh_rate_limit", return_value=None), \
             patch("services.redis_client.cache_set", return_value=True), \
             patch("services.redis_client.cache_get", return_value=None):
            return uat_client.post("/api/login", json={
                "username": username, "password": password,
            })

    def test_uat04_user_logs_in_and_receives_token(self, uat_client):
        """TC-UAT-04: Correct credentials return JWT tokens."""
        resp = self._do_login(uat_client)
        assert resp.status_code == 200
        data = resp.get_json()
        assert "token" in data or "access_token" in data

    def test_uat05_wrong_password_shows_error(self, uat_client):
        """TC-UAT-05: Wrong password shows clear error, no token issued."""
        hashed = bcrypt.hashpw(b"AuraFlow@1", bcrypt.gensalt()).decode()
        user_row = {
            "id": 10, "username": "uat_user", "password": hashed,
            "email": "uat_user@uat.com", "display_name": "UAT",
            "avatar_url": None, "is_verified": True, "first_login": False,
            "email_verified": True, "created_at": "2024-01-01",
        }
        conn, cur = _build_conn()
        cur.fetchone.return_value = user_row

        with patch("routes.auth.get_db_connection", return_value=conn), \
             patch("services.redis_client.cache_get", return_value=None):
            resp = uat_client.post("/api/login", json={
                "username": "uat_user", "password": "WrongPass@99",
            })

        assert resp.status_code == 401
        data = resp.get_json()
        assert "token" not in data and "access_token" not in data

    def test_uat06_unauthenticated_profile_access_blocked(self, uat_client):
        """TC-UAT-06: Accessing /api/me without login returns 401."""
        resp = uat_client.get("/api/me")
        assert resp.status_code == 401


# ===========================================================================
#  JOURNEY 3 - Community and Channel Management
# ===========================================================================

class TestUAT_CommunityManagement:
    """TC-UAT-07 to TC-UAT-09: User creates a community and channels."""

    def test_uat07_create_community_requires_auth(self, uat_client):
        """TC-UAT-07: Creating a community without JWT returns 401."""
        resp = uat_client.post("/api/channels/communities", json={"name": "My Community"})
        assert resp.status_code == 401

    def test_uat08_create_channel_requires_auth(self, uat_client):
        """TC-UAT-08: Creating a channel without JWT returns 401."""
        resp = uat_client.post("/api/channels/communities/1/channels", json={
            "name": "general", "type": "text",
        })
        assert resp.status_code == 401

    def test_uat09_join_with_invalid_invite_code(self, uat_client, uat_app):
        """TC-UAT-09: Invalid invite code returns 404 or 400."""
        headers = _jwt(uat_app)
        conn, cur = _build_conn()
        cur.fetchone.return_value = None

        with patch("routes.channels.get_db_connection", return_value=conn), \
             patch("routes.channels.get_user_id", return_value=1):
            resp = uat_client.post("/api/channels/communities/1/join", json={}, headers=headers)

        assert resp.status_code in (400, 404)


# ===========================================================================
#  JOURNEY 4 - Messaging Workflow
# ===========================================================================

class TestUAT_Messaging:
    """TC-UAT-10 to TC-UAT-13: Full message lifecycle."""

    def test_uat10_send_message_requires_auth(self, uat_client):
        """TC-UAT-10: Sending a message without login returns 401."""
        resp = uat_client.post("/api/messages/send", json={"content": "hello", "channel_id": 1})
        assert resp.status_code == 401

    def test_uat11_toxic_message_blocked_before_save(self, uat_client, uat_app):
        """TC-UAT-11: User sends hateful message; system blocks it."""
        headers = _jwt(uat_app)
        channel_row = {"id": 1, "community_id": 1, "name": "general", "type": "text"}
        membership_row = {"user_id": 1, "role": "member", "channel_id": 1, "community_id": 1}

        conn, cur = _build_conn()
        cur.fetchone.side_effect = [channel_row, None, membership_row, None]

        mock_mod_result = {"block": True, "reason": "Extreme content detected", "action": "block"}

        with patch("routes.messages.get_db_connection", return_value=conn), \
             patch("routes.messages.get_user_id", return_value=1), \
             patch("routes.messages.get_channel_membership", return_value=membership_row), \
             patch("routes.messages._get_moderation_agent") as mock_get_mod:
            mock_get_mod.return_value.instant_check.return_value = mock_mod_result
            resp = uat_client.post(
                "/api/messages/send",
                json={"content": "I will kill you all", "channel_id": 1},
                headers=headers,
            )

        assert resp.status_code in (200, 400, 403)
        if resp.status_code == 200:
            data = resp.get_json()
            assert data.get("moderation", {}).get("action") == "block" or \
                   data.get("moderation", {}).get("block") is True

    def test_uat12_edit_message_unauthenticated_denied(self, uat_client):
        """TC-UAT-12: Editing message without auth returns 401."""
        resp = uat_client.put("/api/messages/5", json={"content": "edited"})
        assert resp.status_code == 401

    def test_uat13_delete_message_unauthenticated_denied(self, uat_client):
        """TC-UAT-13: Deleting message without auth returns 401."""
        resp = uat_client.delete("/api/messages/5")
        assert resp.status_code == 401


# ===========================================================================
#  JOURNEY 5 - AI Agent Interactions
# ===========================================================================

class TestUAT_AIAgents:
    """TC-UAT-14 to TC-UAT-17: User interacts with AI features."""

    def test_uat14_mood_tracker_positive_roman_urdu(self):
        """TC-UAT-14: User's happy Roman Urdu message classified as positive mood."""
        with patch("database.get_db_connection", return_value=MagicMock()):
            from agents.mood_tracker import MoodTrackerAgent
            tracker = MoodTrackerAgent()
        result = tracker.analyze_message("Yaar aaj bahut maza aaya! bohat khushi hui")
        assert result["sentiment"] == "positive"

    def test_uat15_mood_tracker_negative_roman_urdu(self):
        """TC-UAT-15: User's sad message classified as negative mood."""
        with patch("database.get_db_connection", return_value=MagicMock()):
            from agents.mood_tracker import MoodTrackerAgent
            tracker = MoodTrackerAgent()
        result = tracker.analyze_message("bohat udaas hun, kuch acha nahi lag raha")
        assert result["sentiment"] == "negative"

    def test_uat16_moderation_blocks_slur(self):
        """TC-UAT-16: Extreme slur blocked instantly without reaching DB."""
        with patch("database.get_db_connection", return_value=MagicMock()), \
             patch("agents.moderation._GEMINI_MODERATION_AVAILABLE", False):
            from agents.moderation import ModerationAgent
            mod = ModerationAgent()
        result = mod.instant_check("you nigger")
        assert result["block"] is True

    def test_uat17_moderation_allows_clean_message(self):
        """TC-UAT-17: Clean polite message passes moderation."""
        with patch("database.get_db_connection", return_value=MagicMock()), \
             patch("agents.moderation._GEMINI_MODERATION_AVAILABLE", False):
            from agents.moderation import ModerationAgent
            mod = ModerationAgent()
        result = mod.instant_check("Good morning everyone! Hope you are all doing well.")
        assert result["block"] is False


# ===========================================================================
#  JOURNEY 6 - API Boundary and Security Checks
# ===========================================================================

class TestUAT_Security:
    """TC-UAT-18 to TC-UAT-20: Security boundary tests from user perspective."""

    def test_uat18_sql_injection_in_login_body_returns_401_not_500(self, uat_client):
        """TC-UAT-18: SQL-injection-style username does not cause 500 error."""
        conn, cur = _build_conn()
        cur.fetchone.return_value = None

        with patch("routes.auth.get_db_connection", return_value=conn), \
             patch("services.redis_client.cache_get", return_value=None):
            resp = uat_client.post("/api/login", json={
                "username": "' OR '1'='1",
                "password": "anything",
            })

        assert resp.status_code != 500
        assert resp.status_code in (400, 401)

    def test_uat19_overlong_password_rejected_cleanly(self, uat_client):
        """TC-UAT-19: Password longer than 128 chars returns 400, not 500."""
        conn, cur = _build_conn()
        cur.fetchone.return_value = None

        with patch("routes.auth.get_db_connection", return_value=conn):
            resp = uat_client.post("/api/signup", json={
                "username": "longpw",
                "email": "lp@uat.com",
                "password": "A" * 200 + "a1!",
            })
        assert resp.status_code in (400, 422)
        assert resp.status_code != 500

    def test_uat20_missing_auth_header_returns_401(self, uat_client):
        """TC-UAT-20: All protected endpoints return 401 without Authorization header."""
        protected_routes = [
            ("GET",    "/api/me"),
            ("GET",    "/api/messages/channel/1"),
            ("POST",   "/api/messages/send"),
            ("DELETE", "/api/messages/1"),
        ]
        for method, url in protected_routes:
            if method == "GET":
                resp = uat_client.get(url)
            elif method == "POST":
                resp = uat_client.post(url, json={})
            elif method == "DELETE":
                resp = uat_client.delete(url)
            assert resp.status_code == 401, \
                f"Expected 401 for {method} {url}, got {resp.status_code}"