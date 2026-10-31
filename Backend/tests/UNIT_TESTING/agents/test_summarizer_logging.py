"""SummarizerAgent._log_activity must persist the outcome: a failed run has
to be stored as 'failed' with the error text, not as the column default."""
from __future__ import annotations

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))))

from unittest.mock import MagicMock, patch

from agents.summarizer import SummarizerAgent


def _run_log(**kwargs):
    cur = MagicMock()
    cur.fetchone.return_value = {'id': 5}
    cur.__enter__ = lambda s: s
    cur.__exit__ = MagicMock(return_value=False)
    conn = MagicMock()
    conn.cursor.return_value = cur
    with patch("agents.summarizer.get_db_connection", return_value=conn):
        SummarizerAgent()._log_activity(channel_id=1, user_id=2,
                                        input_data="in", **kwargs)
    inserts = [c for c in cur.execute.call_args_list
               if "INSERT INTO ai_agent_logs" in c.args[0]]
    assert len(inserts) == 1
    return inserts[0].args[1]


def test_failed_run_is_logged_as_failed_with_error_text():
    params = _run_log(output_data=None, status='failed', error_message='boom')
    assert params[-1] == 'failed'
    assert params[-2] == 'boom'


def test_successful_run_keeps_output_and_status():
    params = _run_log(output_data='summary text', status='success')
    assert params[-1] == 'success'
    assert params[-2] == 'summary text'
