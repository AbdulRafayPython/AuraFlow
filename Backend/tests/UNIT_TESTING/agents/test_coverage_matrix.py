"""
G1a — per-channel coverage override tests.

Covers AutonomousAgent._is_enabled_for_channel (Backend/agents/base.py).
Route tests for PUT /configure/channel and GET /coverage live in the
integration tier; here we pin the in-process semantics:

  1. channel_id None → defers to _is_enabled(community_id)
  2. community_id None → defers to _is_enabled(community_id) (returns True)
  3. row present, enabled=1 → True
  4. row present, enabled=0 → False
  5. row absent → falls through to _is_enabled
  6. DB exception → falls through to _is_enabled (never crashes sense())
"""
from __future__ import annotations

from unittest.mock import patch, MagicMock

import pytest

from agents.base import AutonomousAgent


class _FakeAgent(AutonomousAgent):
    NAME = "moderation"  # arbitrary; must match an existing agent_type

    def sense(self, event):  # pragma: no cover — unused
        return None

    def decide(self, observation):  # pragma: no cover — unused
        return ("skip", {}, "")

    def act(self, payload, correlation_id):  # pragma: no cover — unused
        return None


@pytest.fixture
def agent():
    return _FakeAgent()


def _mock_conn(row):
    """Build a mock connection whose cursor.fetchone() returns `row`."""
    conn = MagicMock()
    cur = MagicMock()
    cur.fetchone.return_value = row
    cm = MagicMock()
    cm.__enter__.return_value = cur
    cm.__exit__.return_value = False
    conn.cursor.return_value = cm
    return conn


def test_channel_none_defers_to_community(agent):
    """channel_id None → does not consult the override table at all."""
    with patch.object(agent, '_is_enabled', return_value=True) as m:
        assert agent._is_enabled_for_channel(42, None) is True
        m.assert_called_once_with(42)


def test_community_none_defers_to_community(agent):
    """community_id None → _is_enabled short-circuits to True."""
    with patch.object(agent, '_is_enabled', return_value=True) as m:
        assert agent._is_enabled_for_channel(None, 7) is True
        m.assert_called_once_with(None)


def test_row_present_enabled_wins(agent):
    """An override row with enabled=1 returns True regardless of community."""
    with patch('database.get_db_connection',
               return_value=_mock_conn({'enabled': 1})), \
         patch.object(agent, '_is_enabled', return_value=False) as m:
        assert agent._is_enabled_for_channel(42, 7) is True
        m.assert_not_called()  # channel override short-circuits


def test_row_present_disabled_wins(agent):
    """An override row with enabled=0 returns False regardless of community."""
    with patch('database.get_db_connection',
               return_value=_mock_conn({'enabled': 0})), \
         patch.object(agent, '_is_enabled', return_value=True) as m:
        assert agent._is_enabled_for_channel(42, 7) is False
        m.assert_not_called()


def test_row_absent_falls_through(agent):
    """No override → falls back to _is_enabled(community_id)."""
    with patch('database.get_db_connection',
               return_value=_mock_conn(None)), \
         patch.object(agent, '_is_enabled', return_value=True) as m:
        assert agent._is_enabled_for_channel(42, 7) is True
        m.assert_called_once_with(42)


def test_db_exception_falls_through_safely(agent):
    """A DB failure must NOT crash sense(); falls back to _is_enabled."""
    with patch('database.get_db_connection',
               side_effect=RuntimeError("pool exhausted")), \
         patch.object(agent, '_is_enabled', return_value=True) as m:
        assert agent._is_enabled_for_channel(42, 7) is True
        m.assert_called_once_with(42)
