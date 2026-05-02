"""
TC-ST-01 to TC-ST-10
System tests — Authentication end-to-end against the live TiDB database.
Uses a unique random username/email to avoid collisions with existing data.
Cleans up the test user after each test class.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
import uuid
import bcrypt
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

TEST_USERNAME = f"sysuser_{uuid.uuid4().hex[:8]}"
TEST_EMAIL    = f"{TEST_USERNAME}@systest.auraflow.com"
TEST_PASSWORD = "SysTest@2024"


@pytest.fixture(scope="module")
def registered_user(db):
    """
    Insert a fresh test user directly into the DB before the class runs,
    and remove them afterward.
    """
    hashed = bcrypt.hashpw(TEST_PASSWORD.encode(), bcrypt.gensalt()).decode()
    user_id = None
    try:
        with db.cursor() as cur:
            cur.execute(
                """INSERT INTO users
                   (username, email, password, display_name, email_verified, is_verified)
                   VALUES (%s, %s, %s, %s, 1, 1)""",
                (TEST_USERNAME, TEST_EMAIL, hashed, TEST_USERNAME),
            )
            db.commit()
            user_id = cur.lastrowid
    except Exception as e:
        pytest.skip(f"Cannot insert test user: {e}")

    yield {"id": user_id, "username": TEST_USERNAME,
           "email": TEST_EMAIL, "password": TEST_PASSWORD}

    # Cleanup
    try:
        with db.cursor() as cur:
            cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
            db.commit()
    except Exception:
        pass


# ── TC-ST-01: DB connectivity ──────────────────────────────────────────

class TestDatabaseConnectivity:
    def test_db_is_reachable(self, db):
        """TC-ST-01: Database connection is open and responsive."""
        with db.cursor() as cur:
            cur.execute("SELECT 1 AS ping")
            row = cur.fetchone()
        assert row["ping"] == 1

    def test_core_tables_exist(self, db):
        """TC-ST-02: Core tables (users, communities, channels, messages) exist."""
        required_tables = {"users", "communities", "channels", "messages"}
        with db.cursor() as cur:
            cur.execute("SHOW TABLES")
            found = {list(r.values())[0].lower() for r in cur.fetchall()}
        missing = required_tables - found
        assert not missing, f"Missing tables: {missing}"


# ── TC-ST-03 to TC-ST-05: User record integrity ────────────────────────

class TestUserRecord:
    def test_registered_user_exists_in_db(self, db, registered_user):
        """TC-ST-03: Newly inserted test user is retrievable by username."""
        with db.cursor() as cur:
            cur.execute("SELECT id, username FROM users WHERE username = %s",
                        (registered_user["username"],))
            row = cur.fetchone()
        assert row is not None
        assert row["username"] == registered_user["username"]

    def test_password_stored_as_bcrypt_hash(self, db, registered_user):
        """TC-ST-04: Password in DB is a bcrypt hash, not plaintext."""
        with db.cursor() as cur:
            cur.execute("SELECT password FROM users WHERE id = %s",
                        (registered_user["id"],))
            row = cur.fetchone()
        assert row["password"].startswith("$2b$") or row["password"].startswith("$2a$")

    def test_bcrypt_hash_verifies_against_plaintext(self, db, registered_user):
        """TC-ST-05: Stored bcrypt hash correctly verifies against original password."""
        with db.cursor() as cur:
            cur.execute("SELECT password FROM users WHERE id = %s",
                        (registered_user["id"],))
            row = cur.fetchone()
        assert bcrypt.checkpw(TEST_PASSWORD.encode(), row["password"].encode())


# ── TC-ST-06 to TC-ST-08: Auth API end-to-end via Flask test client ────

class TestAuthSystemEndToEnd:
    def test_login_via_api_returns_jwt(self, live_client, registered_user):
        """TC-ST-06: POST /auth/login with real DB credentials returns access_token."""
        resp = live_client.post("/auth/login", json={
            "username": registered_user["username"],
            "password": registered_user["password"],
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert "access_token" in data

    def test_login_wrong_password_fails(self, live_client, registered_user):
        """TC-ST-07: Wrong password returns 401 against real DB."""
        resp = live_client.post("/auth/login", json={
            "username": registered_user["username"],
            "password": "WrongPass@000",
        })
        assert resp.status_code == 401

    def test_signup_duplicate_email_fails(self, live_client, registered_user):
        """TC-ST-08: Signing up with already-registered email returns 400."""
        resp = live_client.post("/auth/signup", json={
            "username": f"dup_{uuid.uuid4().hex[:6]}",
            "email": registered_user["email"],
            "password": "AuraFlow@99",
        })
        assert resp.status_code == 400


# ── TC-ST-09 to TC-ST-10: Community / channel schema ──────────────────

class TestCommunitySchema:
    def test_communities_table_has_expected_columns(self, db):
        """TC-ST-09: communities table has id, name, created_by, created_at columns."""
        with db.cursor() as cur:
            cur.execute("DESCRIBE communities")
            cols = {r["Field"] for r in cur.fetchall()}
        for required in ("id", "name", "created_at"):
            assert required in cols, f"Missing column: {required}"
        # created_by or owner_id
        assert "created_by" in cols or "owner_id" in cols, "Missing owner column"

    def test_channels_table_has_expected_columns(self, db):
        """TC-ST-10: channels table has id, name, type, community_id columns."""
        with db.cursor() as cur:
            cur.execute("DESCRIBE channels")
            cols = {r["Field"] for r in cur.fetchall()}
        for required in ("id", "name", "type", "community_id"):
            assert required in cols, f"Missing column: {required}"
