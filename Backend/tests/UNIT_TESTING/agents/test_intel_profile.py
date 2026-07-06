"""
G1c — community intelligence_profile heuristic + admin override tests.

Pins the in-process semantics of:

* ``routes.channels._compute_intel_profile`` — derives a badge subset from a
  list of ``(agent_type, enabled)`` tuples (moderation→safe,
  summarizer→recaps, translator→multilingual).
* ``routes.channels._parse_intel_profile_column`` — coerces the MySQL JSON
  column (str / list / None) into a clean badge list or ``None`` when the
  caller should fall back to the heuristic.
* ``routes.channels.update_community`` — the new ``intelligence_profile``
  field on PUT: accepts a list subset, rejects garbage, accepts ``null`` as
  a clear-the-override signal.
* ``routes.channels.discover_communities`` — surfaces the heuristic when the
  column is NULL and surfaces the stored override when it isn't.

The DB and identity helpers are mocked at the route module's lookup point
(``routes.channels.get_db_connection`` / ``routes.channels.get_user_id``)
so no real connection is opened. A throwaway Flask app is wired to the
plain ``update_community`` / ``discover_communities`` functions — these
are NOT blueprint-routed (see ``Backend/app.py:185-202``), so the test
mounts them via ``app.route(...)`` directly, matching how the real app
registers them.
"""
from __future__ import annotations

import datetime
import json
from unittest.mock import patch, MagicMock

import pytest
from flask import Flask
from flask_jwt_extended import JWTManager, create_access_token

from routes.channels import (
    _compute_intel_profile,
    _parse_intel_profile_column,
    discover_communities,
    update_community,
)

# Fixed public_id used across PUT tests — routes.channels.get_community_id_from_public_id
# is mocked to resolve it to the internal int id (42) used by the rest of these fixtures.
_TEST_PUBLIC_ID = '11111111-1111-1111-1111-111111111111'


# ─────────────────────────────────────────────────────────────────────
# Pure helpers
# ─────────────────────────────────────────────────────────────────────

def test_compute_intel_profile_picks_enabled_mapped_agents():
    """Moderation + summarizer enabled → ['safe', 'recaps'] in display order."""
    rows = [('moderation', 1), ('summarizer', 1), ('focus', 1)]
    assert _compute_intel_profile(rows) == ['safe', 'recaps']


def test_compute_intel_profile_ignores_disabled_rows():
    """A disabled row does not contribute its badge, even if mapped."""
    rows = [('moderation', 1), ('summarizer', 0), ('translator', 1)]
    assert _compute_intel_profile(rows) == ['safe', 'multilingual']


def test_compute_intel_profile_empty_when_no_mapped_agents():
    """Agents outside the mapping (engagement/wellness/focus) yield []."""
    rows = [('engagement', 1), ('wellness', 1), ('focus', 1)]
    assert _compute_intel_profile(rows) == []


def test_compute_intel_profile_preserves_display_order():
    """Even if input order is shuffled, output is
    ['safe', 'recaps', 'multilingual']."""
    rows = [('translator', 1), ('moderation', 1), ('summarizer', 1)]
    assert _compute_intel_profile(rows) == ['safe', 'recaps', 'multilingual']


def test_parse_intel_profile_column_handles_none():
    """NULL → None, signalling "use heuristic"."""
    assert _parse_intel_profile_column(None) is None


def test_parse_intel_profile_column_handles_json_string():
    """MySQL returns the JSON column as a Python str in some driver modes."""
    assert _parse_intel_profile_column('["safe","recaps"]') == ['safe', 'recaps']


def test_parse_intel_profile_column_handles_list():
    """Other driver modes return the column already decoded into a list."""
    assert _parse_intel_profile_column(['safe', 'multilingual']) == [
        'safe', 'multilingual']


def test_parse_intel_profile_column_filters_unknown_badges():
    """Unknown badge ids are dropped silently — defensive against legacy
    rows or hand-edited JSON."""
    assert _parse_intel_profile_column(['safe', 'bogus', 'recaps']) == [
        'safe', 'recaps']


def test_parse_intel_profile_column_returns_empty_list_for_empty_array():
    """An empty JSON array is a valid override meaning "no badges" — distinct
    from NULL."""
    assert _parse_intel_profile_column([]) == []
    assert _parse_intel_profile_column('[]') == []


# ─────────────────────────────────────────────────────────────────────
# PUT /api/channels/communities/<id> intelligence_profile field
# ─────────────────────────────────────────────────────────────────────

@pytest.fixture
def client():
    """Minimal Flask app with the two plain route functions mounted at
    the same paths ``Backend/app.py`` registers them under."""
    app = Flask(__name__)
    app.config['JWT_SECRET_KEY'] = 'test-secret-key-for-intel-profile'
    app.config['TESTING'] = True
    JWTManager(app)

    app.route(
        '/api/channels/communities/<uuid:public_id>',
        methods=['PUT'])(update_community)
    app.route(
        '/api/channels/communities/discover',
        methods=['GET'])(discover_communities)

    with app.app_context():
        token = create_access_token(identity='alice')

    c = app.test_client()
    c.environ_base['HTTP_AUTHORIZATION'] = f'Bearer {token}'
    return c


def _admin_cursor_for_update(intelligence_profile_after_update=None):
    """Build a cursor that:
      1. Resolves get_user_id (cur.fetchone -> {'id': 1}).
      2. Resolves the role check (cur.fetchone -> {'role': 'owner'}).
      3. Accepts the UPDATE.
      4. Returns the updated community row.
      5. Returns no installed agents for the heuristic helper.
    """
    cur = MagicMock()
    # Sequence of fetchone() return values across the call chain.
    cur.fetchone.side_effect = [
        # 1. role lookup
        {'role': 'owner'},
        # 2. updated community row
        {
            'id': 42,
            'public_id': _TEST_PUBLIC_ID,
            'name': 'Quantum Lab',
            'description': 'physics chat',
            'icon': 'QL',
            'color': '#8B5CF6',
            'logo_url': None,
            'banner_url': None,
            'created_at': datetime.datetime(2026, 5, 30, 12, 0, 0),
            'intelligence_profile': intelligence_profile_after_update,
        },
    ]
    # _intel_profiles_for_communities reads via fetchall — return empty.
    cur.fetchall.return_value = []
    cm = MagicMock()
    cm.__enter__.return_value = cur
    cm.__exit__.return_value = False
    conn = MagicMock()
    conn.cursor.return_value = cm
    return conn, cur


def test_put_persists_subset_override(client):
    """PUT intelligence_profile=['safe','multilingual'] reaches the UPDATE
    SQL as a canonicalised JSON string."""
    conn, cur = _admin_cursor_for_update(
        intelligence_profile_after_update='["safe","multilingual"]')
    with patch('routes.channels.get_db_connection', return_value=conn), \
         patch('utils.get_community_id_from_public_id', return_value=42), \
         patch('routes.channels.get_user_id', return_value=1):
        resp = client.put(
            f'/api/channels/communities/{_TEST_PUBLIC_ID}',
            json={'intelligence_profile': ['safe', 'multilingual']})

    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()
    assert body['intelligence_profile'] == ['safe', 'multilingual']

    # The UPDATE call is one of the cur.execute() invocations. Locate it
    # by looking for the SET clause in the SQL string.
    update_call = next(
        c for c in cur.execute.call_args_list
        if 'UPDATE communities SET' in str(c.args[0]))
    sql, params = update_call.args
    assert 'intelligence_profile = %s' in sql
    # Canonicalised JSON: sorted by display order, deduped.
    assert json.dumps(['safe', 'multilingual']) in params


def test_put_null_clears_override(client):
    """PUT intelligence_profile=None emits SET intelligence_profile = NULL
    (no bind) — the route falls back to the heuristic on the next read."""
    conn, cur = _admin_cursor_for_update(intelligence_profile_after_update=None)
    with patch('routes.channels.get_db_connection', return_value=conn), \
         patch('utils.get_community_id_from_public_id', return_value=42), \
         patch('routes.channels.get_user_id', return_value=1):
        resp = client.put(
            f'/api/channels/communities/{_TEST_PUBLIC_ID}',
            json={'intelligence_profile': None})

    assert resp.status_code == 200
    update_call = next(
        c for c in cur.execute.call_args_list
        if 'UPDATE communities SET' in str(c.args[0]))
    sql, _params = update_call.args
    assert 'intelligence_profile = NULL' in sql


def test_put_rejects_invalid_badge(client):
    """A badge not in {safe, recaps, multilingual} is rejected with 400 and
    the UPDATE is never issued."""
    conn = MagicMock()
    cur = MagicMock()
    # Only the role check should run before validation rejects.
    cur.fetchone.return_value = {'role': 'admin'}
    cm = MagicMock()
    cm.__enter__.return_value = cur
    cm.__exit__.return_value = False
    conn.cursor.return_value = cm

    with patch('routes.channels.get_db_connection', return_value=conn), \
         patch('utils.get_community_id_from_public_id', return_value=42), \
         patch('routes.channels.get_user_id', return_value=1):
        resp = client.put(
            f'/api/channels/communities/{_TEST_PUBLIC_ID}',
            json={'intelligence_profile': ['safe', 'launch-codes']})

    assert resp.status_code == 400
    assert 'intelligence_profile' in resp.get_json()['error']
    # No UPDATE call ever issued.
    assert not any(
        'UPDATE communities SET' in str(c.args[0])
        for c in cur.execute.call_args_list)


def test_put_rejects_non_array(client):
    """``intelligence_profile`` must be a JSON array or null — a string is
    a client error."""
    conn = MagicMock()
    cur = MagicMock()
    cur.fetchone.return_value = {'role': 'owner'}
    cm = MagicMock()
    cm.__enter__.return_value = cur
    cm.__exit__.return_value = False
    conn.cursor.return_value = cm

    with patch('routes.channels.get_db_connection', return_value=conn), \
         patch('utils.get_community_id_from_public_id', return_value=42), \
         patch('routes.channels.get_user_id', return_value=1):
        resp = client.put(
            f'/api/channels/communities/{_TEST_PUBLIC_ID}',
            json={'intelligence_profile': 'safe'})

    assert resp.status_code == 400
    assert 'array or null' in resp.get_json()['error']


# ─────────────────────────────────────────────────────────────────────
# GET /api/channels/communities/discover — heuristic fallback
# ─────────────────────────────────────────────────────────────────────

def test_discover_falls_back_to_heuristic_when_column_null(client):
    """When ``intelligence_profile`` is NULL on a community row, the
    discover response should carry the badge subset derived from that
    community's installed+enabled agents."""
    cur = MagicMock()
    # First fetchall: the discover SELECT (one community, profile NULL).
    # Second fetchall: _intel_profiles_for_communities lookup
    # (moderation+summarizer enabled).
    cur.fetchall.side_effect = [
        [{
            'id': 99,
            'public_id': '22222222-2222-2222-2222-222222222222',
            'name': 'Algorave',
            'description': 'live-coding music',
            'icon': 'AL',
            'color': '#FF0080',
            'logo_url': None,
            'banner_url': None,
            'created_at': datetime.datetime(2026, 1, 1, 0, 0, 0),
            'intelligence_profile': None,
            'member_count': 12,
            'creator_username': 'sam',
            'creator_name': 'Sam Q',
            'creator_avatar': None,
        }],
        [
            {'community_id': 99, 'agent_type': 'moderation', 'enabled': 1},
            {'community_id': 99, 'agent_type': 'summarizer', 'enabled': 1},
        ],
    ]
    cm = MagicMock()
    cm.__enter__.return_value = cur
    cm.__exit__.return_value = False
    conn = MagicMock()
    conn.cursor.return_value = cm

    with patch('routes.channels.get_db_connection', return_value=conn), \
         patch('routes.channels.get_user_id', return_value=1):
        resp = client.get('/api/channels/communities/discover')

    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()
    assert len(body) == 1
    # Heuristic kicks in because intelligence_profile column was NULL.
    assert body[0]['intelligence_profile'] == ['safe', 'recaps']


def test_discover_stored_override_beats_heuristic(client):
    """A non-NULL JSON array wins, even when the heuristic would suggest
    a different set."""
    cur = MagicMock()
    cur.fetchall.side_effect = [
        [{
            'id': 99,
            'public_id': '22222222-2222-2222-2222-222222222222',
            'name': 'Algorave',
            'description': 'live-coding music',
            'icon': 'AL',
            'color': '#FF0080',
            'logo_url': None,
            'banner_url': None,
            'created_at': datetime.datetime(2026, 1, 1, 0, 0, 0),
            # Admin override: only 'multilingual', even though moderation
            # is installed below (heuristic would suggest 'safe').
            'intelligence_profile': '["multilingual"]',
            'member_count': 12,
            'creator_username': 'sam',
            'creator_name': 'Sam Q',
            'creator_avatar': None,
        }],
        # Heuristic would have produced ['safe'].
        [{'community_id': 99, 'agent_type': 'moderation', 'enabled': 1}],
    ]
    cm = MagicMock()
    cm.__enter__.return_value = cur
    cm.__exit__.return_value = False
    conn = MagicMock()
    conn.cursor.return_value = cm

    with patch('routes.channels.get_db_connection', return_value=conn), \
         patch('routes.channels.get_user_id', return_value=1):
        resp = client.get('/api/channels/communities/discover')

    assert resp.status_code == 200
    assert resp.get_json()[0]['intelligence_profile'] == ['multilingual']
