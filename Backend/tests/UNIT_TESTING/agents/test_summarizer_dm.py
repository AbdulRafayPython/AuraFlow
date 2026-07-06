"""
TC-UT-AGT-SUM-DM-01 … 05
========================
Unit tests for ``SummarizerAgent.summarize_dm`` — the requester-private
1:1 DM summary path added alongside the channel summary.

The DM path mirrors ``summarize_channel`` but reads from the
``direct_messages`` table and does **not** persist to
``conversation_summaries``. These tests pin those two invariants plus
the message-count threshold and the ``message_count`` argument passthrough.
"""
from __future__ import annotations

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))))

import datetime
from unittest.mock import MagicMock, patch

import pytest

from agents.summarizer import SummarizerAgent

from conftest import fake_db_with_rows


def _dm_rows(n: int, *, requester_id=1, peer_id=2):
    """Build ``n`` direct-message rows alternating between the two
    participants. Content is long enough to clear the ``LENGTH > 3``
    filter and the agent's ``len(cleaned) > 10`` cull."""
    now = datetime.datetime(2026, 5, 29, 12, 0, 0)
    rows = []
    for i in range(n):
        sender = requester_id if i % 2 == 0 else peer_id
        rows.append({
            'id': 1000 + i,
            'content': f'This is direct message number {i} with enough words to keep.',
            'sender_id': sender,
            'created_at': now + datetime.timedelta(minutes=i),
            'username': f'user{sender}',
            'display_name': f'User {sender}',
        })
    return rows


def _fake_db_dm(rows, *, captured_sql=None, captured_params=None):
    """Like ``fake_db_with_rows`` but also captures the LIMIT clause so
    tests can assert ``message_count`` was threaded into the SQL.
    Also asserts the agent does NOT touch ``conversation_summaries``."""
    cur = MagicMock()
    cur.fetchall.return_value = list(rows)
    cur.fetchone.return_value = rows[0] if rows else None

    def _execute(sql, params=None):
        if captured_sql is not None:
            captured_sql.append(sql)
        if captured_params is not None:
            captured_params.append(params)
        # Guard against accidental persistence — DM summaries are
        # ephemeral by contract.
        assert 'INSERT INTO conversation_summaries' not in sql, (
            'summarize_dm must not persist to conversation_summaries')

    cur.execute.side_effect = _execute
    cur.__enter__ = lambda s: s
    cur.__exit__ = MagicMock(return_value=False)
    conn = MagicMock()
    conn.cursor.return_value = cur
    return conn


# ── tests ───────────────────────────────────────────────────────────


class TestSummarizeDM:

    def test_returns_summary_on_happy_path(self):
        rows = _dm_rows(40)
        agent = SummarizerAgent()
        agent.gemini_available = False  # force extractive path, deterministic

        with patch('agents.summarizer.get_db_connection',
                   return_value=_fake_db_dm(rows)), \
             patch('agents.summarizer.get_personal_settings',
                   return_value={
                       'summary_length': 'standard',
                       'include_topics': True,
                       'include_action_items': True,
                       'auto_summarize_message_count': 100,
                   }), \
             patch.object(SummarizerAgent, '_log_activity'):
            result = agent.summarize_dm(
                peer_user_id=2, requester_user_id=1, message_count=40)

        assert result['success'] is True
        assert isinstance(result['summary'], str) and result['summary']
        assert result['message_count'] == 40
        assert result['peer_user_id'] == 2
        assert result['requester_user_id'] == 1
        assert result['method'] == 'extractive'
        # No summary_id — nothing was persisted.
        assert 'summary_id' not in result

    def test_below_threshold_returns_error(self):
        rows = _dm_rows(5)  # < min_messages_for_summary (default 20)
        agent = SummarizerAgent()
        agent.gemini_available = False

        with patch('agents.summarizer.get_db_connection',
                   return_value=_fake_db_dm(rows)), \
             patch('agents.summarizer.get_personal_settings',
                   return_value={'auto_summarize_message_count': 100}), \
             patch.object(SummarizerAgent, '_log_activity'):
            result = agent.summarize_dm(
                peer_user_id=2, requester_user_id=1, message_count=40)

        assert result['success'] is False
        assert 'enough messages' in result['error'].lower()
        assert result['message_count'] == 5
        assert result['peer_user_id'] == 2

    def test_message_count_threaded_into_query(self):
        rows = _dm_rows(30)
        agent = SummarizerAgent()
        agent.gemini_available = False
        sql_seen: list = []
        params_seen: list = []

        with patch('agents.summarizer.get_db_connection',
                   return_value=_fake_db_dm(rows, captured_sql=sql_seen,
                                            captured_params=params_seen)), \
             patch('agents.summarizer.get_personal_settings',
                   return_value={'auto_summarize_message_count': 100}), \
             patch.object(SummarizerAgent, '_log_activity'):
            agent.summarize_dm(
                peer_user_id=2, requester_user_id=1, message_count=30)

        # The DM SELECT runs first; its LIMIT param is the explicit
        # message_count we passed (not the legacy-override path because
        # 30 ≠ 100).
        assert params_seen, 'expected at least one SQL execute'
        dm_params = params_seen[0]
        assert dm_params is not None
        # (requester, peer, peer, requester, message_count) — last slot
        # is the LIMIT value.
        assert dm_params[-1] == 30
        assert 'direct_messages' in sql_seen[0].lower()
        assert 'conversation_summaries' not in sql_seen[0].lower()

    def test_does_not_persist_summary(self):
        """Regression guard: the channel path INSERTs into
        ``conversation_summaries`` via ``_save_summary``. The DM path
        must not — verified by both the SQL guard in ``_fake_db_dm``
        AND by asserting ``_save_summary`` is never called."""
        rows = _dm_rows(40)
        agent = SummarizerAgent()
        agent.gemini_available = False

        with patch('agents.summarizer.get_db_connection',
                   return_value=_fake_db_dm(rows)), \
             patch('agents.summarizer.get_personal_settings',
                   return_value={'auto_summarize_message_count': 100}), \
             patch.object(SummarizerAgent, '_log_activity'), \
             patch.object(SummarizerAgent, '_save_summary') as save_mock:
            result = agent.summarize_dm(
                peer_user_id=2, requester_user_id=1, message_count=40)

        assert result['success'] is True
        save_mock.assert_not_called()

    def test_include_topics_false_blanks_key_points(self):
        rows = _dm_rows(30)
        agent = SummarizerAgent()
        agent.gemini_available = False

        with patch('agents.summarizer.get_db_connection',
                   return_value=_fake_db_dm(rows)), \
             patch('agents.summarizer.get_personal_settings',
                   return_value={
                       'summary_length': 'standard',
                       'include_topics': False,
                       'include_action_items': True,
                       'auto_summarize_message_count': 100,
                   }), \
             patch.object(SummarizerAgent, '_log_activity'):
            result = agent.summarize_dm(
                peer_user_id=2, requester_user_id=1, message_count=30)

        assert result['success'] is True
        assert result['key_points'] == []
