"""
G1b — admin-scoped GET /api/agents/actions tests.

Pins the in-process behaviour of the new route at
``Backend/routes/agents.py:list_agent_actions`` (~line 5024). The route
reads from ``agent_actions`` with an EXISTS subquery on ``agent_feedback``
so the Section E "Helpful / Not helpful / Dismiss" buttons can resolve
against real correlation_ids.

We mock the DB layer (``routes.agents.get_db_connection``) and the two
identity helpers (``_get_user_id`` and ``_check_community_admin``) at
their import points inside ``routes.agents``. The route's SQL string is
not exercised — it goes through a single ``cur.execute(...)`` call whose
return value we control directly. The point of this file is the route
*semantics*: argument validation, auth gating, filter shaping, and
``has_feedback`` boolean coercion.

A throwaway Flask app is constructed per test rather than booting the
real ``app:app`` (which would bind Redis, the DB pool, and every
blueprint). JWT-Extended is wired up just enough for ``@jwt_required()``
to accept a token minted in-test.
"""
from __future__ import annotations

import datetime
from unittest.mock import patch, MagicMock

import pytest
from flask import Flask
from flask_jwt_extended import JWTManager, create_access_token


# ─────────────────────────────────────────────────────────────────────
# Test app + client
# ─────────────────────────────────────────────────────────────────────

@pytest.fixture
def client():
    """Minimal Flask app with JWT + agents_bp mounted. No DB, no Redis."""
    app = Flask(__name__)
    app.config['JWT_SECRET_KEY'] = 'test-secret-key-for-actions-route'
    app.config['TESTING'] = True
    JWTManager(app)

    from routes.agents import agents_bp
    app.register_blueprint(agents_bp)

    with app.app_context():
        token = create_access_token(identity='alice')

    c = app.test_client()
    c.environ_base['HTTP_AUTHORIZATION'] = f'Bearer {token}'
    return c


def _mock_conn(rows):
    """Build a connection whose cursor.fetchall() returns ``rows``."""
    conn = MagicMock()
    cur = MagicMock()
    cur.fetchall.return_value = list(rows)
    cm = MagicMock()
    cm.__enter__.return_value = cur
    cm.__exit__.return_value = False
    conn.cursor.return_value = cm
    return conn


def _row(**overrides):
    """Default agent_actions row shape. DictCursor returns dicts."""
    base = {
        'id': 1,
        'agent_name': 'moderation',
        'community_id': 42,
        'channel_id': 7,
        'user_id': 100,
        'decision': 'act',
        'reason': 'flagged toxic',
        'correlation_id': 'corr-uuid-1',
        'created_at': datetime.datetime(2026, 5, 30, 12, 0, 0),
        'has_feedback': 0,
    }
    base.update(overrides)
    return base


# ─────────────────────────────────────────────────────────────────────
# Validation
# ─────────────────────────────────────────────────────────────────────

def test_missing_community_id_returns_400(client):
    """``community_id`` is required and must be the first validation
    failure — before the admin check ever runs."""
    with patch('routes.agents._get_user_id', return_value=1), \
         patch('routes.agents.get_community_id_from_public_id', return_value=None), \
         patch('routes.agents._check_community_admin') as admin_check:
        resp = client.get('/api/agents/actions')
    assert resp.status_code == 400
    assert "community_id" in resp.get_json()['error']
    admin_check.assert_not_called()


def test_non_admin_returns_403(client):
    """Members can't read the autonomous decision log; admins only."""
    with patch('routes.agents._get_user_id', return_value=1), \
         patch('routes.agents.get_community_id_from_public_id', return_value=42), \
         patch('routes.agents._check_community_admin', return_value=False):
        resp = client.get('/api/agents/actions?community_id=42')
    assert resp.status_code == 403
    assert 'admin' in resp.get_json()['error'].lower()


def test_bad_decision_returns_400(client):
    """``decision`` is whitelisted — anything outside act/defer/skip
    is rejected before the SQL is built."""
    with patch('routes.agents._get_user_id', return_value=1), \
         patch('routes.agents.get_community_id_from_public_id', return_value=42), \
         patch('routes.agents._check_community_admin', return_value=True), \
         patch('routes.agents.get_db_connection') as db:
        resp = client.get(
            '/api/agents/actions?community_id=42&decision=approve')
    assert resp.status_code == 400
    assert "decision" in resp.get_json()['error']
    db.assert_not_called()


# ─────────────────────────────────────────────────────────────────────
# Filters reach the SQL parameter list
# ─────────────────────────────────────────────────────────────────────

def test_agent_name_filter_passed_to_sql(client):
    """An ``agent_name`` query param appends a WHERE clause + binds the
    value into the parameter list. We don't parse the SQL string — we
    just assert the bind list contains the requested name."""
    conn = _mock_conn([_row(agent_name='wellness')])
    with patch('routes.agents._get_user_id', return_value=1), \
         patch('routes.agents.get_community_id_from_public_id', return_value=42), \
         patch('routes.agents._check_community_admin', return_value=True), \
         patch('routes.agents.get_db_connection', return_value=conn):
        resp = client.get(
            '/api/agents/actions?community_id=42&agent_name=wellness')
    assert resp.status_code == 200
    # cur.execute(sql, [user_id] + params + [limit])
    args, _kwargs = conn.cursor.return_value.__enter__.return_value \
        .execute.call_args
    sql, binds = args
    assert 'wellness' in binds
    assert 'a.agent_name = %s' in sql


def test_decision_filter_passed_to_sql(client):
    """Same idea for ``decision`` — bind list must carry the value."""
    conn = _mock_conn([_row(decision='defer')])
    with patch('routes.agents._get_user_id', return_value=1), \
         patch('routes.agents.get_community_id_from_public_id', return_value=42), \
         patch('routes.agents._check_community_admin', return_value=True), \
         patch('routes.agents.get_db_connection', return_value=conn):
        resp = client.get(
            '/api/agents/actions?community_id=42&decision=defer')
    assert resp.status_code == 200
    args, _kwargs = conn.cursor.return_value.__enter__.return_value \
        .execute.call_args
    sql, binds = args
    assert 'defer' in binds
    assert 'a.decision = %s' in sql


# ─────────────────────────────────────────────────────────────────────
# has_feedback round-tripping
# ─────────────────────────────────────────────────────────────────────

def test_has_feedback_true_when_user_has_voted(client):
    """The EXISTS subquery returns 1 when the calling user has feedback
    on the row — the route must surface it as a JSON ``true``."""
    conn = _mock_conn([_row(has_feedback=1)])
    with patch('routes.agents._get_user_id', return_value=1), \
         patch('routes.agents.get_community_id_from_public_id', return_value=42), \
         patch('routes.agents._check_community_admin', return_value=True), \
         patch('routes.agents.get_db_connection', return_value=conn):
        resp = client.get('/api/agents/actions?community_id=42')
    assert resp.status_code == 200
    body = resp.get_json()
    assert len(body['actions']) == 1
    assert body['actions'][0]['has_feedback'] is True


def test_has_feedback_false_when_user_has_not_voted(client):
    """EXISTS returns 0 → JSON ``false``. The route does an explicit
    ``bool(r['has_feedback'])`` so the type is guaranteed."""
    conn = _mock_conn([_row(has_feedback=0)])
    with patch('routes.agents._get_user_id', return_value=1), \
         patch('routes.agents.get_community_id_from_public_id', return_value=42), \
         patch('routes.agents._check_community_admin', return_value=True), \
         patch('routes.agents.get_db_connection', return_value=conn):
        resp = client.get('/api/agents/actions?community_id=42')
    assert resp.status_code == 200
    body = resp.get_json()
    assert body['actions'][0]['has_feedback'] is False
    # Sanity-check the row shape Section E will be reading.
    row = body['actions'][0]
    for key in ('id', 'agent_name', 'community_id', 'channel_id',
                'user_id', 'decision', 'reason', 'correlation_id',
                'created_at', 'has_feedback'):
        assert key in row
    assert row['correlation_id'] == 'corr-uuid-1'
