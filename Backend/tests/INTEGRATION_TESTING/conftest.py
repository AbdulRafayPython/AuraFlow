"""
conftest.py — INTEGRATION_TESTING
Provides a Flask test client with a mocked database connection.
All tests import `client` fixture from here.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import pytest
from unittest.mock import patch, MagicMock


def _make_mock_conn(rows=None, lastrowid=1):
    """Return a PyMySQL-style mock connection."""
    mock_cur = MagicMock()
    mock_cur.fetchone.return_value = rows[0] if rows else None
    mock_cur.fetchall.return_value = rows or []
    mock_cur.lastrowid = lastrowid
    mock_cur.__enter__ = lambda s: s
    mock_cur.__exit__ = MagicMock(return_value=False)

    mock_conn = MagicMock()
    mock_conn.cursor.return_value = mock_cur
    mock_conn.__enter__ = lambda s: s
    mock_conn.__exit__ = MagicMock(return_value=False)
    return mock_conn, mock_cur


def _evict_test_stubs():
    """Evict hand-made stub modules so the REAL app package can be imported.

    Several test modules pre-register bare ``types.ModuleType`` stubs at
    MODULE level -- ``sys.modules["app"]`` (agents' lazy
    ``from app import socketio``) and ``sys.modules["routes.sockets"]``
    (``from routes.sockets import _post_ai_bot_message``). pytest executes
    every test module during COLLECTION, before any test runs, so in a
    full-suite run those stubs are installed even when the stubbing file's
    own tests never execute.

    A stub then breaks any fixture that needs the real thing:
      * ``app`` stub has no ``.app``          -> AttributeError
      * ``routes.sockets`` stub has no
        ``register_socket_events``            -> ImportError at app.py:60

    Real modules loaded from disk always carry ``__spec__``/``__file__``;
    the hand-made stubs carry neither, which is how they are told apart.
    Returns {name: module} so the caller can restore them afterwards --
    the stubbing suites still expect their stubs once we are done.
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


@pytest.fixture
def mock_conn_factory():
    """Return the helper so individual tests can customise DB rows."""
    return _make_mock_conn


@pytest.fixture
def app():
    """Create Flask app in TESTING mode with sockets disabled.

    Same stub-eviction dance as tests/UAT/conftest.py -- see the long note
    there. test_agent_soak.py / test_msg_storm.py install a socketio-only
    stub as sys.modules["app"] at MODULE level so agents' lazy
    `from app import socketio` never boots Flask. In a full-suite run that
    stub can win the slot before this fixture executes, and then
    `import app` here returns the stub, which has no `.app` attribute.
    """
    evicted = _evict_test_stubs()

    try:
        with patch("database.get_db_connection", return_value=MagicMock()),              patch("services.redis_client.get_redis", return_value=None):
            import app as app_module
            flask_app = app_module.app
            flask_app.config["TESTING"] = True
            flask_app.config["JWT_SECRET_KEY"] = "test-secret-key"
            yield flask_app
    finally:
        sys.modules.update(evicted)


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def auth_headers(client):
    """
    Returns JWT Authorization headers by calling /auth/login with a mocked DB
    that returns a known user row.
    """
    import bcrypt
    hashed = bcrypt.hashpw(b"TestPass@1", bcrypt.gensalt()).decode()
    user_row = {
        "id": 1,
        "username": "testuser",
        "password": hashed,
        "email": "test@auraflow.com",
        "display_name": "Test User",
        "avatar_url": None,
        "is_verified": True,
        "first_login": False,
        "email_verified": True,
        "created_at": "2024-01-01",
    }
    mock_conn, mock_cur = _make_mock_conn(rows=[user_row])
    mock_cur.fetchone.return_value = user_row

    with patch("database.get_db_connection", return_value=mock_conn), \
         patch("services.session_manager.create_session", return_value="session-id-1"), \
         patch("services.redis_client.cache_set", return_value=True), \
         patch("services.redis_client.cache_get", return_value=None):
        resp = client.post(
            "/auth/login",
            json={"username": "testuser", "password": "TestPass@1"},
        )

    if resp.status_code == 200:
        token = resp.get_json().get("access_token", "")
        return {"Authorization": f"Bearer {token}"}
    return {}
