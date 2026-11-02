"""
The channel-silence probe: silence is counted from the last message a person wrote, and the
once-an-hour guard survives a restart (it lives in Redis), so the Engagement agent is not woken
for every quiet channel at once when the backend starts.
"""

from __future__ import annotations

import pytest

from services import presence


class FakeRedis:
    def __init__(self):
        self.keys = {}

    def set(self, key, value, nx=False, ex=None):
        if nx and key in self.keys:
            return None
        self.keys[key] = (value, ex)
        return True


class FakeCursor:
    def __init__(self, rows):
        self.rows, self.sql = rows, []

    def execute(self, sql, params=None):
        self.sql.append(sql)

    def fetchall(self):
        return list(self.rows)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class FakeConn:
    def __init__(self, cur):
        self.cur = cur

    def cursor(self):
        return self.cur

    def close(self):
        pass


@pytest.fixture
def probe(monkeypatch):
    class Env:
        redis = FakeRedis()
        rows = [{"channel_id": 1, "community_id": 3, "silent_minutes": 70},
                {"channel_id": 2, "community_id": 3, "silent_minutes": 20}]
        published: list = []
        cursor = None

    e = Env()
    e.published = []
    presence._silence_last_fired.clear()

    def connect():
        e.cursor = FakeCursor(e.rows)
        return FakeConn(e.cursor)

    monkeypatch.setattr(presence, "get_db_connection", connect)
    monkeypatch.setattr(presence, "_silence_redis", lambda: e.redis)
    from agents import event_bus
    monkeypatch.setattr(event_bus, "publish", lambda topic, payload: e.published.append((topic, payload)))
    yield e
    presence._silence_last_fired.clear()


def test_silence_is_counted_from_the_last_message_a_person_wrote(probe):
    presence._run_silence_probe_once()
    sql = probe.cursor.sql[0]
    assert "m.message_type <> 'ai'" in sql and "m.sender_id IS NOT NULL" in sql


def test_each_silent_channel_fires_once_with_its_highest_bucket(probe):
    from agents import event_bus
    presence._run_silence_probe_once()
    assert [(t, p["channel_id"], p["bucket"]) for t, p in probe.published] == [
        (event_bus.TOPIC_CHANNEL_SILENT, 1, 60), (event_bus.TOPIC_CHANNEL_SILENT, 2, 15)]
    assert probe.redis.keys["presence:silent:1:60"] == ("1", 3600)


def test_the_next_probe_in_the_same_hour_stays_quiet(probe):
    presence._run_silence_probe_once()
    presence._run_silence_probe_once()
    assert len(probe.published) == 2


def test_a_restart_does_not_fire_every_silent_channel_again(probe):
    presence._run_silence_probe_once()
    presence._silence_last_fired.clear()           # what a restart does to the process memory
    presence._run_silence_probe_once()
    assert len(probe.published) == 2               # the Redis guard still remembers


def test_a_longer_silence_is_a_new_bucket_and_fires(probe):
    presence._run_silence_probe_once()
    probe.rows = [{"channel_id": 1, "community_id": 3, "silent_minutes": 250}]
    presence._run_silence_probe_once()
    assert [p["bucket"] for _, p in probe.published] == [60, 15, 240]


def test_without_redis_it_falls_back_to_memory(probe, monkeypatch):
    monkeypatch.setattr(presence, "_silence_redis", lambda: None)
    presence._run_silence_probe_once()
    presence._run_silence_probe_once()
    assert len(probe.published) == 2 and (1, 60) in presence._silence_last_fired


def test_a_redis_error_also_falls_back_to_memory(probe):
    class Broken:
        def set(self, *a, **k):
            raise ConnectionError("redis down")

    probe.redis = Broken()
    presence._run_silence_probe_once()
    presence._run_silence_probe_once()
    assert len(probe.published) == 2


def test_channels_not_silent_long_enough_are_skipped(probe):
    probe.rows = [{"channel_id": 9, "community_id": 3, "silent_minutes": 10}]
    presence._run_silence_probe_once()
    assert probe.published == []
