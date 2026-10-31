"""get_community_mood returns channel/community aggregates only; it must
never rank or name individual users."""
from __future__ import annotations

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))))

import datetime
from unittest.mock import MagicMock, patch

from agents.mood_tracker import MoodTrackerAgent


def _messages():
    now = datetime.datetime(2026, 5, 29, 12, 0, 0)
    texts = ["I love this, great work everyone!", "This is terrible and I hate it",
             "ok", "Thanks, really happy with the result"]
    return [{'content': t, 'created_at': now + datetime.timedelta(minutes=i),
             'sender_id': 10 + (i % 3), 'username': f'user{10 + (i % 3)}'}
            for i, t in enumerate(texts)]


def test_community_mood_has_no_per_user_fields():
    cur = MagicMock()
    cur.fetchall.return_value = _messages()
    cur.__enter__ = lambda s: s
    cur.__exit__ = MagicMock(return_value=False)
    conn = MagicMock()
    conn.cursor.return_value = cur

    with patch("agents.mood_tracker.get_db_connection", return_value=conn), \
         patch("services.community_agent_config.is_agent_enabled", return_value=True):
        result = MoodTrackerAgent().get_community_mood(channel_id=5, hours=24)

    assert result['success'] is True
    assert result['unique_users'] == 3
    assert 'most_positive_user' not in result
    assert 'most_concerned_user' not in result
    assert not any(u in str(result) for u in ('user10', 'user11', 'user12'))
