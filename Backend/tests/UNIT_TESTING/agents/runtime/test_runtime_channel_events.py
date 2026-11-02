"""channel_silent and focus_drift triggers: validation, matching, routing, the run's message."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from agents import event_bus as bus
from agents.runtime import router_agent
from agents.runtime.builder import validate_triggers
from agents.runtime.definitions import AgentDefinition, TriggerDef
from agents.runtime.router_agent import CustomAgentRouter
from agents.runtime.triggers import match_channel_event
from tasks.agent_runtime_tasks import build_user_message


def agent(id=1, community_id=3, triggers=(), channel_ids=None, owner=42):
    return AgentDefinition(
        id=id, public_id=f"pub-{id}", bot_user_id=500 + id, bot_username=f"bot{id}", name=f"Bot {id}",
        owner_user_id=owner, community_id=community_id, triggers=tuple(triggers),
        permissions={"channel_ids": channel_ids} if channel_ids else {})


SILENT = TriggerDef(id=1, type="channel_silent")
DRIFT = TriggerDef(id=2, type="focus_drift")


# ── validation ──────────────────────────────────────────────────────────

def clean(triggers, community_id=3):
    return validate_triggers(triggers, community_id=community_id, channel_ok=lambda c: c in (11, 12))


@pytest.mark.parametrize("kind", ["channel_silent", "focus_drift"])
def test_the_new_triggers_are_for_community_agents_only(kind):
    out, errors = clean([{"type": kind}], community_id=None)
    assert out == [] and "only works for community agents" in errors[0]
    out, errors = clean([{"type": kind}])
    assert errors == [] and out[0]["type"] == kind and out[0]["channel_id"] is None


def test_a_channel_can_be_chosen():
    assert clean([{"type": "channel_silent", "channel_id": 11}])[0][0]["channel_id"] == 11
    assert "not a channel you can use" in clean([{"type": "focus_drift", "channel_id": 99}])[1][0]


def test_min_minutes_is_kept_only_when_valid():
    assert clean([{"type": "channel_silent", "config": {"min_minutes": 120}}])[0][0]["config"] == {"min_minutes": 120}
    for bad in (5, 5000, True, "60", 1.5):
        out, errors = clean([{"type": "channel_silent", "config": {"min_minutes": bad}}])
        assert out == [] and "min_minutes must be" in errors[0]


def test_min_minutes_means_nothing_for_focus_drift():
    assert clean([{"type": "focus_drift", "config": {"min_minutes": 120}}])[0][0]["config"] == {}


# ── matching ────────────────────────────────────────────────────────────

def ev(**kw):
    return {"channel_id": 11, "community_id": 3, "silent_minutes": 90, **kw}


def test_a_silent_channel_wakes_the_agent_of_that_community():
    a = agent(triggers=[SILENT])
    [m] = match_channel_event("channel_silent", ev(), [a])
    assert m.definition is a and m.kind == "channel_silent"


def test_each_event_wakes_only_its_own_trigger():
    a = agent(triggers=[SILENT])
    assert match_channel_event("focus_drift", ev(), [a]) == []
    assert match_channel_event("focus_drift", ev(), [agent(triggers=[DRIFT])])


def test_another_community_never_matches():
    assert match_channel_event("channel_silent", ev(community_id=4), [agent(triggers=[SILENT])]) == []
    assert match_channel_event("channel_silent", ev(community_id=None), [agent(community_id=None, triggers=[SILENT])]) == []


def test_a_trigger_limited_to_a_channel_only_matches_it():
    a = agent(triggers=[TriggerDef(id=3, type="channel_silent", channel_id=12)])
    assert match_channel_event("channel_silent", ev(channel_id=11), [a]) == []
    assert match_channel_event("channel_silent", ev(channel_id=12), [a])


def test_the_channel_allowlist_is_respected():
    a = agent(triggers=[SILENT], channel_ids=[12])
    assert match_channel_event("channel_silent", ev(channel_id=11), [a]) == []


def test_min_minutes_asks_for_a_longer_silence():
    a = agent(triggers=[TriggerDef(id=3, type="channel_silent", config={"min_minutes": 120})])
    assert match_channel_event("channel_silent", ev(silent_minutes=90), [a]) == []
    assert match_channel_event("channel_silent", ev(silent_minutes=180), [a])


def test_a_paused_trigger_does_not_match():
    a = agent(triggers=[TriggerDef(id=3, type="channel_silent", enabled=False)])
    assert match_channel_event("channel_silent", ev(), [a]) == []


# ── routing ─────────────────────────────────────────────────────────────

class FakeRedis:
    def __init__(self, *, fail=False):
        self.keys = {}

    def set(self, key, value, nx=False, ex=None):
        if nx and key in self.keys:
            return None
        self.keys[key] = value
        return True

    def incr(self, key):
        return 1

    def expire(self, key, seconds):
        pass


@pytest.fixture
def env(monkeypatch):
    class Env:
        redis = FakeRedis()
        defs = [agent(triggers=[SILENT, DRIFT])]
        enqueued: list = []

    e = Env()
    e.enqueued = []
    monkeypatch.setattr(router_agent, "ensure_builtin_agents_once", lambda: None)
    monkeypatch.setattr(router_agent, "load_active_definitions", lambda: e.defs)
    monkeypatch.setattr(router_agent, "_redis", lambda: e.redis)
    monkeypatch.setattr(router_agent, "_runs_today", lambda agent_id: 0)
    task = MagicMock()
    task.apply_async.side_effect = lambda **kw: e.enqueued.append(kw)
    monkeypatch.setattr("tasks.agent_runtime_tasks.run_agent_task", task)
    return e


def silent_event(**kw):
    return {"topic": bus.TOPIC_CHANNEL_SILENT, "channel_id": 11, "community_id": 3,
            "silent_minutes": 95, "bucket": 60, **kw}


def drift_event(**kw):
    return {"topic": bus.TOPIC_FOCUS_DRIFT, "channel_id": 11, "community_id": 3, "user_id": 7, "message_id": 77,
            "old_topics": ["exam", "syllabus"], "new_topics": ["cricket"], **kw}


def run_event(env, event):
    router = CustomAgentRouter()
    obs = router.sense(event)
    if obs is None:
        return None
    decision, payload, reason = router.decide(obs)
    if decision == "act":
        router.act(payload, "corr")
    return decision, reason


def test_the_router_listens_to_both_events():
    assert bus.TOPIC_CHANNEL_SILENT in CustomAgentRouter.SUBSCRIBES
    assert bus.TOPIC_FOCUS_DRIFT in CustomAgentRouter.SUBSCRIBES


def test_a_silent_channel_queues_a_run_for_the_owner(env):
    assert run_event(env, silent_event())[0] == "act"
    [call] = env.enqueued
    trig = call["kwargs"]["trigger"]
    assert call["queue"] == "default" and call["kwargs"]["agent_id"] == 1
    assert trig["type"] == "channel_silent" and trig["channel_id"] == 11 and trig["silent_minutes"] == 95
    assert trig["user_id"] == 42                          # acts for the agent's owner, not for anyone in the chat
    assert trig["content"] is None and trig["message_id"] is None


def test_a_drift_run_never_acts_for_the_person_who_caused_it(env):
    run_event(env, drift_event())
    trig = env.enqueued[0]["kwargs"]["trigger"]
    assert trig["type"] == "focus_drift" and trig["user_id"] == 42 and trig["username"] is None
    assert trig["old_topics"] == ["exam", "syllabus"] and trig["new_topics"] == ["cricket"]


def test_the_same_channel_wakes_an_agent_once_per_cooldown(env):
    assert run_event(env, silent_event())[0] == "act"
    decision, reason = run_event(env, silent_event(bucket=180))
    assert decision == "skip" and "cooldown" in reason
    assert len(env.enqueued) == 1


def test_without_redis_channel_events_do_not_run(env):
    env.redis = None
    decision, reason = run_event(env, silent_event())
    assert decision == "skip" and "no_redis" in reason and env.enqueued == []


def test_an_agents_own_post_never_wakes_agents(env):
    assert run_event(env, drift_event(user_id=501)) is None and env.enqueued == []


def test_topics_from_chat_are_trimmed(env):
    long = "x" * 80
    run_event(env, drift_event(new_topics=[long, "", "a", "b", "c", "d", "e", "f"]))
    topics = env.enqueued[0]["kwargs"]["trigger"]["new_topics"]
    assert len(topics) == 5 and len(topics[0]) == 30


# ── the message the agent is given ──────────────────────────────────────

def test_the_agent_is_told_why_it_woke():
    a = agent()
    quiet = build_user_message(a, {"type": "channel_silent", "silent_minutes": 95})
    assert "quiet for about 95 minutes" in quiet and "restart the conversation" in quiet
    assert "Do what your instructions say" in quiet
    assert "a while" in build_user_message(a, {"type": "channel_silent"})
    drift = build_user_message(a, {"type": "focus_drift", "old_topics": ["exam"], "new_topics": ["cricket", "ipl"]})
    assert "from exam to cricket, ipl" in drift and "Do what your instructions say" in drift
    assert "an earlier topic" in build_user_message(a, {"type": "focus_drift"})


def test_these_runs_post_a_fresh_message_not_a_reply():
    from tasks.agent_runtime_tasks import _DIRECT_KINDS, _STANDALONE_KINDS
    assert {"channel_silent", "focus_drift"} <= set(_STANDALONE_KINDS)
    assert not {"channel_silent", "focus_drift"} & set(_DIRECT_KINDS)
