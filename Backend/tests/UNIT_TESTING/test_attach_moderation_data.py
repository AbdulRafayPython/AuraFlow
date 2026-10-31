"""
Unit tests for routes.messages._attach_moderation_data.

This helper replaced two derived tables that used to be JOINed into the
get_channel_messages query (see docs/SCALING_TO_1000_USERS.md, F1). Neither
was scoped to the page being returned, so both full-scanned ai_agent_logs on
every request.

These tests pin the behaviours the old SQL had, so the rewrite stays
equivalent:
  * latest verdict per message wins (old: correlated SELECT MAX(id))
  * a NULL community_id yields violation_count 0 (old: JOIN never matched)
  * violation counts land on the right sender
"""
import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


@pytest.fixture(scope="module")
def attach():
    """Import the helper with DB/Redis stubbed so importing app is safe."""
    with patch("database.get_db_connection", return_value=MagicMock()), \
         patch("services.redis_client.get_redis", return_value=None):
        from routes.messages import _attach_moderation_data
    return _attach_moderation_data


class FakeCursor:
    """Cursor that returns a queued result set per execute() call."""

    def __init__(self, results):
        self._results = list(results)
        self._current = []
        self.queries = []

    def execute(self, sql, params=None):
        self.queries.append((" ".join(sql.split()), params))
        self._current = self._results.pop(0) if self._results else []

    def fetchall(self):
        return self._current


def _row(msg_id, sender_id, community_id=7):
    return {"id": msg_id, "sender_id": sender_id, "_community_id": community_id}


def test_empty_rows_is_a_noop(attach):
    cur = FakeCursor([])
    attach(cur, [])
    assert cur.queries == []


def test_defaults_applied_when_no_moderation_rows_exist(attach):
    rows = [_row(1, 100), _row(2, 101)]
    attach(FakeCursor([[], []]), rows)
    for r in rows:
        assert r["mod_output"] is None
        assert r["mod_confidence"] is None
        assert r["sender_violation_count"] == 0


def test_latest_verdict_per_message_wins(attach):
    """Mirrors the old correlated SELECT MAX(id): highest id is the verdict.

    The query orders by id DESC, so the first row seen per message_id is the
    newest one and later (older) rows must not overwrite it.
    """
    rows = [_row(1, 100)]
    verdicts = [
        {"message_id": 1, "output_data": '{"action":"block"}', "confidence_score": 0.9},
        {"message_id": 1, "output_data": '{"action":"allow"}', "confidence_score": 0.1},
    ]
    attach(FakeCursor([verdicts, []]), rows)
    assert rows[0]["mod_output"] == '{"action":"block"}'
    assert rows[0]["mod_confidence"] == 0.9


def test_violation_counts_map_to_correct_sender(attach):
    rows = [_row(1, 100), _row(2, 101), _row(3, 100)]
    counts = [{"user_id": 100, "violation_count": 4}]
    attach(FakeCursor([[], counts]), rows)
    assert rows[0]["sender_violation_count"] == 4
    assert rows[1]["sender_violation_count"] == 0  # no row -> 0, not missing
    assert rows[2]["sender_violation_count"] == 4


def test_null_community_id_skips_violation_query(attach):
    """DM channels have community_id NULL.

    The old LEFT JOIN matched on ch.community_id, and NULL never equals NULL,
    so the count stayed 0. Preserve that and skip the query entirely.
    """
    rows = [_row(1, 100, community_id=None)]
    cur = FakeCursor([[]])
    attach(cur, rows)
    assert rows[0]["sender_violation_count"] == 0
    assert len(cur.queries) == 1  # verdicts only, no violation query


def test_queries_are_scoped_to_this_page(attach):
    """The whole point of the rewrite: no unbounded scan of ai_agent_logs."""
    rows = [_row(1, 100), _row(2, 101)]
    cur = FakeCursor([[], []])
    attach(cur, rows)

    verdict_sql, verdict_params = cur.queries[0]
    assert "message_id IN (%s,%s)" in verdict_sql
    assert verdict_params == (1, 2)

    violation_sql, violation_params = cur.queries[1]
    assert "user_id IN (%s,%s)" in violation_sql
    assert violation_params[0] == 7  # community_id scopes the aggregate
    assert set(violation_params[1:]) == {100, 101}
