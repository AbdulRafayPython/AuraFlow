"""The platform-wide email_notifications_enabled switch must stop both
queuing and sending of batched notification emails."""
import json
from unittest.mock import MagicMock

import pytest


@pytest.fixture
def switch(monkeypatch):
    state = {"on": False}
    monkeypatch.setattr("services.platform_config.email_notifications_enabled", lambda: state["on"])
    return state


def test_queue_skipped_when_switch_off(switch, monkeypatch):
    from services import email_batch_service

    get_settings = MagicMock()
    get_redis = MagicMock()
    monkeypatch.setattr(email_batch_service, "_get_user_notification_settings", get_settings)
    monkeypatch.setattr("services.redis_client.get_redis", get_redis)

    email_batch_service.queue_email_notification(1, "dm", {"sender": "a"})

    get_settings.assert_not_called()
    get_redis.assert_not_called()


def test_queue_proceeds_when_switch_on(switch, monkeypatch):
    from services import email_batch_service

    switch["on"] = True
    redis = MagicMock()
    redis.exists.return_value = True
    monkeypatch.setattr(email_batch_service, "_get_user_notification_settings",
                        lambda uid: dict(email_batch_service._DEFAULTS))
    monkeypatch.setattr("services.redis_client.get_redis", lambda: redis)

    email_batch_service.queue_email_notification(1, "dm", {"sender": "a"})

    redis.rpush.assert_called_once()


def test_batch_task_drops_events_when_switch_off(switch, monkeypatch):
    from tasks import email_tasks

    redis = MagicMock()
    redis.pipeline.return_value.execute.return_value = [[json.dumps({"event_type": "dm", "metadata": {}})], 1, 1]
    monkeypatch.setattr("services.redis_client.get_redis", lambda: redis)
    get_conn = MagicMock()
    monkeypatch.setattr("database.get_db_connection", get_conn)

    email_tasks.process_email_batch.run(1)

    get_conn.assert_not_called()
