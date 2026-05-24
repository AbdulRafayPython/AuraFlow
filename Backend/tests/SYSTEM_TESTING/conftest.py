"""
conftest.py — SYSTEM_TESTING
Connects to the live TiDB Cloud database (credentials from .env).
These tests require the database to be reachable.
Skips automatically if DB connection fails.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import pytest
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"))


@pytest.fixture(scope="session")
def db():
    """Return a live DB connection; skip all tests if DB is unreachable."""
    try:
        from database import get_db_connection
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        yield conn
        conn.close()
    except Exception as e:
        pytest.skip(f"DB not reachable: {e}")


@pytest.fixture(scope="session")
def live_app():
    """Flask app with real DB (no mocks) for system-level tests."""
    import app as app_module
    flask_app = app_module.app
    flask_app.config["TESTING"] = True
    return flask_app


@pytest.fixture(scope="session")
def live_client(live_app):
    return live_app.test_client()
