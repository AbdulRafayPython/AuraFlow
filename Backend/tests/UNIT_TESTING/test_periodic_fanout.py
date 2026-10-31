"""
Unit tests for the periodic-sweep fan-out (docs/SCALING_TO_1000_USERS.md, F2).

The *_periodic tasks used to loop over every user/community/channel INSIDE a
single Celery task. That task is bound by celery_app.conf task_time_limit
(180s hard kill), so once the tenant list grew past what one task could
finish in three minutes the worker killed it mid-sweep and every remaining
row was silently skipped -- no error raised, no retry of the remainder, and
because the list order was stable it was always the same rows starving.

These tests pin the property that actually matters: the dispatcher ENQUEUES
one child task per unit of work and does no per-unit work itself. If someone
later inlines the work back into the sweep, these fail.
"""
import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(
    0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)

import tasks.agent_tasks as at


def _conn_returning(rows):
    """Build a mock connection whose cursor.fetchall() returns `rows`."""
    cur = MagicMock()
    cur.__enter__ = lambda s: s
    cur.__exit__ = MagicMock(return_value=False)
    cur.fetchall.return_value = rows
    conn = MagicMock()
    conn.cursor.return_value = cur
    return conn, cur


class TestWellnessFanout:
    def test_enqueues_one_task_per_enabled_user(self):
        users = [{"user_id": 1}, {"user_id": 2}, {"user_id": 3}]
        conn, _ = _conn_returning(users)

        with patch.object(at, "get_db_connection", return_value=conn), \
             patch.object(at.check_wellness_for_user, "delay") as delay, \
             patch.object(at, "_log_agent_action"):
            result = at.check_wellness_periodic()

        assert result == {"queued": 3}
        assert [c.args[0] for c in delay.call_args_list] == [1, 2, 3]

    def test_does_not_run_the_check_inline(self):
        """The sweep must not touch WellnessAgent itself -- that is the child's
        job. Doing it inline is exactly what blew the task time limit."""
        conn, _ = _conn_returning([{"user_id": 1}])

        with patch.object(at, "get_db_connection", return_value=conn), \
             patch.object(at.check_wellness_for_user, "delay"), \
             patch.object(at, "_log_agent_action"), \
             patch("agents.wellness.WellnessAgent") as agent_cls:
            at.check_wellness_periodic()

        assert not agent_cls.called

    def test_one_bad_enqueue_does_not_abort_the_sweep(self):
        conn, _ = _conn_returning([{"user_id": 1}, {"user_id": 2}, {"user_id": 3}])

        with patch.object(at, "get_db_connection", return_value=conn), \
             patch.object(at.check_wellness_for_user, "delay",
                          side_effect=[Exception("broker down"), None, None]), \
             patch.object(at, "_log_agent_action"):
            result = at.check_wellness_periodic()

        # user 1 failed to enqueue; 2 and 3 still got queued
        assert result == {"queued": 2}


class TestEngagementFanout:
    def test_enqueues_one_task_per_channel(self):
        rows = [
            {"community_id": 7, "settings": '{"check_hours": 12}', "channel_id": 100},
            {"community_id": 7, "settings": '{"check_hours": 12}', "channel_id": 101},
        ]
        conn, _ = _conn_returning(rows)

        with patch.object(at, "get_db_connection", return_value=conn), \
             patch.object(at.analyze_engagement_for_channel, "delay") as delay, \
             patch.object(at, "_log_agent_action"):
            result = at.check_engagement_periodic()

        assert result == {"queued": 2}
        assert [c.args for c in delay.call_args_list] == [(100, 7, 12), (101, 7, 12)]

    def test_missing_settings_falls_back_to_default_hours(self):
        conn, _ = _conn_returning(
            [{"community_id": 7, "settings": None, "channel_id": 100}]
        )

        with patch.object(at, "get_db_connection", return_value=conn), \
             patch.object(at.analyze_engagement_for_channel, "delay") as delay, \
             patch.object(at, "_log_agent_action"):
            at.check_engagement_periodic()

        assert delay.call_args.args == (100, 7, 24)


class TestKnowledgeFanout:
    def test_enqueues_one_task_per_channel(self):
        rows = [
            {"community_id": 3, "settings": '{"extract_hours": 6}', "channel_id": 50},
            {"community_id": 3, "settings": '{"extract_hours": 6}', "channel_id": 51},
        ]
        conn, _ = _conn_returning(rows)

        with patch.object(at, "get_db_connection", return_value=conn), \
             patch.object(at.extract_knowledge_for_channel, "delay") as delay, \
             patch.object(at, "_log_agent_action"):
            result = at.extract_knowledge_periodic()

        assert result == {"queued": 2}
        assert [c.args for c in delay.call_args_list] == [(50, 3, 6), (51, 3, 6)]


class TestAutoSummarizeFanout:
    def _settings(self, **over):
        base = {
            "auto_summarize_enabled": True,
            "schedule_time": "14:30",
            "auto_summarize_message_count": 200,
        }
        base.update(over)
        import json
        return json.dumps(base)

    def _run_at(self, hour, minute, communities):
        """Run the dispatcher with the clock pinned to hour:minute UTC."""
        import datetime as _dt

        conn, cur = _conn_returning(communities)

        class _Pinned(_dt.datetime):
            @classmethod
            def utcnow(cls):
                return cls(2026, 5, 20, hour, minute, 0)

        with patch.object(at, "get_db_connection", return_value=conn), \
             patch.object(at, "datetime", _Pinned), \
             patch.object(at.auto_summarize_community, "delay") as delay, \
             patch.object(at, "_log_agent_action"):
            result = at.auto_summarize_communities()
        return result, delay, cur

    def test_queues_a_community_inside_the_window(self):
        rows = [{"community_id": 9, "settings": self._settings(), "installed_by": 4}]
        result, delay, _ = self._run_at(14, 35, rows)

        assert result["queued"] == 1
        assert delay.call_args.args == (9, 4, 200)

    def test_skips_a_community_outside_the_window(self):
        rows = [{"community_id": 9, "settings": self._settings(), "installed_by": 4}]
        result, delay, _ = self._run_at(9, 0, rows)

        assert result == {"queued": 0, "skipped": 1}
        assert not delay.called

    def test_skips_when_already_run_today(self):
        rows = [{
            "community_id": 9,
            "settings": self._settings(last_auto_summary_date="2026-05-20"),
            "installed_by": 4,
        }]
        result, delay, _ = self._run_at(14, 30, rows)

        assert result == {"queued": 0, "skipped": 1}
        assert not delay.called

    def test_skips_when_disabled(self):
        rows = [{
            "community_id": 9,
            "settings": self._settings(auto_summarize_enabled=False),
            "installed_by": 4,
        }]
        result, delay, _ = self._run_at(14, 30, rows)

        assert result == {"queued": 0, "skipped": 1}
        assert not delay.called

    def test_claims_the_date_before_enqueueing(self):
        """The claim must be written BEFORE the task is queued, otherwise the
        next beat tick inside the same +/-15min window queues it again."""
        rows = [{"community_id": 9, "settings": self._settings(), "installed_by": 4}]
        result, delay, cur = self._run_at(14, 30, rows)

        assert result["queued"] == 1
        updates = [c for c in cur.execute.call_args_list
                   if "UPDATE community_agents" in c.args[0]]
        assert len(updates) == 1, "expected exactly one claim write"
        assert "2026-05-20" in updates[0].args[1][0]


class TestScheduleQueryIsSargable:
    def test_due_schedule_lookup_does_not_wrap_the_column(self):
        """F4: TIME_FORMAT(schedule_time, ...) wraps the column in a function,
        making the predicate non-sargable -- no index can serve it, so the
        per-minute sweep full-scanned the table. It must stay a bare range."""
        import inspect
        src = inspect.getsource(at.check_user_summary_schedules)
        # Compare code lines only -- the fix is documented in a comment
        # that legitimately names TIME_FORMAT, and that must not fail here.
        code_lines = [
            line for line in src.splitlines()
            if not line.lstrip().startswith("#")
        ]

        assert not any("TIME_FORMAT" in line for line in code_lines)
        assert any(
            "s.schedule_time >= %s AND s.schedule_time < %s" in line
            for line in code_lines
        )
