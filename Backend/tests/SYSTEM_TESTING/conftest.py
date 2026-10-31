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


def _evict_test_stubs():
    """Evict hand-made stub modules so the REAL app package can be imported.

    Mirrors the helper in tests/UAT/conftest.py -- see there for the full
    rationale. Short version: other test modules pre-register bare
    ``types.ModuleType`` stubs for ``app`` and ``routes.sockets`` at MODULE
    level, and pytest executes every test module during COLLECTION, so those
    stubs are present in a full-suite run even when their own tests never
    execute. Real modules carry ``__spec__``/``__file__``; the stubs do not.
    Returns {name: module} so the caller can restore them.
    """
    evicted = {}
    for name in list(sys.modules):
        if name != "app" and not name.startswith("routes."):
            continue
        mod = sys.modules[name]
        if getattr(mod, "__spec__", None) is None and getattr(mod, "__file__", None) is None:
            evicted[name] = mod
            del sys.modules[name]
    return evicted


@pytest.fixture(scope="session")
def live_app():
    """Flask app with real DB (no mocks) for system-level tests."""
    evicted = _evict_test_stubs()
    try:
        import app as app_module
        flask_app = app_module.app
        flask_app.config["TESTING"] = True
        yield flask_app
    finally:
        sys.modules.update(evicted)


@pytest.fixture(scope="session")
def live_client(live_app):
    return live_app.test_client()
