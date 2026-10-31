"""
conftest.py — UAT
User Acceptance Tests simulate real end-user journeys via the Flask test client.
Unlike integration tests (which test individual routes), UAT tests simulate
complete workflows: Register → Login → Join Community → Send Message → Summarize.
DB is mocked for reproducibility, but the full Flask routing stack is exercised.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import pytest
from contextlib import ExitStack
from unittest.mock import patch, MagicMock


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


@pytest.fixture(autouse=True)
def _no_redis_claims():
    """Neutralise the Redis idempotency claims (`auto_message._claim_welcome`,
    `engagement._claim_nudge`, `wellness._claim_checkin`) for UAT tests.

    Identical in purpose to the fixture of the same name in
    ``tests/UNIT_TESTING/agents/conftest.py`` — see there for the full
    rationale. Without it these suites are NOT hermetic: the claim helpers
    fail-open to ``True`` only when Redis is *absent*, so a dev box running
    ``redis-server`` for the app lets a claim persist for the full
    ``_CHECKIN_DEDUPE_TTL`` (1 hour) — across separate pytest runs. That made
    ``test_chain02_violation_triggers_victim_support`` pass on a cold Redis
    and fail on every rerun within the hour, which is why full-suite runs
    reported different failure counts from an identical tree.

    Forcing ``get_redis() -> None`` makes the claims deterministically
    fail-open regardless of environment."""
    with ExitStack() as stack:
        for mod in ("agents.auto_message", "agents.engagement",
                    "agents.wellness"):
            if mod in sys.modules and hasattr(sys.modules[mod], "_get_redis"):
                stack.enter_context(patch(f"{mod}._get_redis",
                                          return_value=None))
        try:
            stack.enter_context(patch("services.redis_client.get_redis",
                                      return_value=None))
        except (AttributeError, ModuleNotFoundError):
            pass
        yield


@pytest.fixture(autouse=True)
def _platform_defaults():
    """Make platform_config toggles resolve to their declared defaults.

    ``services.platform_config.get_setting(key, default)`` reads through the
    DB, which UAT replaces with a MagicMock. A MagicMock is truthy, so
    ``is_maintenance_mode()`` -> ``bool(<MagicMock>)`` -> True, and every
    auth journey got a 503 "Platform is in maintenance mode" before the route
    logic ran. The same truthiness silently flips every other toggle on.

    Returning the caller's own default keeps the documented production
    defaults (maintenance off, registration on) instead of whatever the mock
    happens to make truthy. A test that wants a specific toggle should patch
    ``services.platform_config.get_setting`` itself."""
    try:
        with patch("services.platform_config.get_setting",
                   side_effect=lambda key, default=None: default):
            yield
    except (AttributeError, ModuleNotFoundError):
        yield


@pytest.fixture(scope="session")
def uat_app():
    """Boot the REAL Flask app with DB/Redis stubbed out.

    Several suites (UNIT_TESTING/agents/conftest.py, UAT/test_agent_chains.py,
    and the INTEGRATION soak/storm tests) install a tiny stub module as
    sys.modules["app"] carrying only `socketio`, so agents' lazy
    `from app import socketio` never boots the real app. Those stubs are
    installed at MODULE level, so in a full-suite run one of them can win the
    slot before this fixture runs -- and then `import app` here returns the
    stub, which has no `.app` attribute. That was the source of the 45
    "module 'app' has no attribute 'app'" collection errors.

    Evict a stub (identified by the missing `.app` attribute) so the real
    module gets imported, then restore it at session teardown so the agent
    suites keep the stub they expect. The real module also exposes
    `socketio`, so anything resolving through sys.modules keeps working
    while the real app is installed.
    """
    evicted = _evict_test_stubs()

    try:
        # Scope the DB/Redis patches to the IMPORT only. This fixture is
        # session-scoped, so holding them around the `yield` would keep
        # `database.get_db_connection` replaced by a MagicMock for the rest
        # of the pytest session -- long after the UAT directory is done.
        # Agent code that resolves it lazily (base._is_enabled_for_channel
        # does `from database import get_db_connection` inside the function)
        # would then read a truthy MagicMock row and conclude every agent is
        # enabled, breaking the moderation kill-switch test in a full run.
        # Individual UAT tests patch `routes.<mod>.get_db_connection`
        # themselves, so nothing here needs the global patch after import.
        with patch("database.get_db_connection", return_value=MagicMock()),              patch("services.redis_client.get_redis", return_value=None):
            import app as app_module
            flask_app = app_module.app

        flask_app.config["TESTING"] = True
        flask_app.config["JWT_SECRET_KEY"] = "uat-secret-key"
        yield flask_app
    finally:
        sys.modules.update(evicted)


@pytest.fixture(scope="session")
def uat_client(uat_app):
    return uat_app.test_client()
