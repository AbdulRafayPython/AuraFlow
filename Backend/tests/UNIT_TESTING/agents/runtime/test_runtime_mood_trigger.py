"""mood_escalation: a personal agent hears that its owner's mood dipped, and answers them by DM.
Never anyone else's mood, never while they do not track it, never in a channel."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from agents import event_bus as bus
from agents.runtime import router_agent
from agents.runtime.builder import validate_triggers
from agents.runtime.definitions import AgentDefinition, TriggerDef
from agents.runtime.router_agent import CustomAgentRouter
from agents.runtime.triggers import match_mood_escalation
from tasks.agent_runtime_tasks import build_user_message

MOOD = TriggerDef(id=1, type="mood_escalation", config={"delivery": "private"})
OWNER = 42


def agent(id=1, community_id=None, owner=OWNER, triggers=(MOOD,), template_key=None):
    return AgentDefinition(id=id, public_id=f"pub-{id}", bot_user_id=500 + id, bot_username=f"bot{id}",
                           name=f"Bot {id}", owner_user_id=owner, community_id=community_id,
                           triggers=tuple(triggers), template_key=template_key)


def mood_event(**kw):
    return {"topic": bus.TOPIC_MOOD_ESCALATION, "user_id": OWNER, "channel_id": 11, "community_id": 3,
            "message_id": 77, "primary_mood": "sad", "window_mean": -0.6, **kw}


# ── validation ──────────────────────────────────────────────────────────

def clean(triggers, community_id=None):
    return validate_triggers(triggers, community_id=community_id, channel_ok=lambda c: True)


def test_it_is_for_personal_agents_and_always_private():
    out, errors = clean([{"type": "mood_escalation"}])
    assert errors == [] and out[0]["config"] == {"delivery": "private"} and out[0]["channel_id"] is None
    out, errors = clean([{"type": "mood_escalation", "config": {"delivery": "channel"}}])
    assert out[0]["config"] == {"delivery": "private"}


def test_a_community_agent_cannot_have_it():
    out, errors = clean([{"type": "mood_escalation"}], community_id=3)
    assert out == [] and "personal agents" in errors[0]


def test_it_is_not_tied_to_a_channel():
    out, errors = clean([{"type": "mood_escalation", "channel_id": 11}])
    assert out == [] and "not tied to a channel" in errors[0]


# ── matching ────────────────────────────────────────────────────────────

def test_only_the_owners_own_personal_agent_matches():
    mine, theirs = agent(1), agent(2, owner=99)
    community = agent(3, community_id=3)
    aura = agent(4, template_key="aura")
    off = agent(5, triggers=(TriggerDef(id=9, type="mood_escalation", enabled=False),))
    other_trigger = agent(6, triggers=(TriggerDef(id=8, type="mention"),))
    found = match_mood_escalation({"user_id": OWNER}, [mine, theirs, community, aura, off, other_trigger])
    assert [m.definition.id for m in found] == [1]


def test_no_user_no_match():
    assert match_mood_escalation({}, [agent()]) == []


# ── routing ─────────────────────────────────────────────────────────────

class FakeRedis:
    def __init__(self):
        self.keys = {}

    def set(self, key, value, nx=False, ex=None):
        if nx and key in self.keys:
            return None
        self.keys[key] = (value, ex)
        return True


@pytest.fixture
def env(monkeypatch):
    class Env:
        pass
    e = Env()
    e.redis, e.defs, e.enqueued, e.tracks = FakeRedis(), [agent()], [], True
    monkeypatch.setattr(router_agent, "ensure_builtin_agents_once", lambda: None)
    monkeypatch.setattr(router_agent, "load_active_definitions", lambda: e.defs)
    monkeypatch.setattr(router_agent, "_redis", lambda: e.redis)
    monkeypatch.setattr(router_agent, "_runs_today", lambda agent_id: 0)
    monkeypatch.setattr(router_agent, "_tracks_mood", lambda uid: e.tracks)
    task = MagicMock()
    task.apply_async.side_effect = lambda **kw: e.enqueued.append(kw)
    monkeypatch.setattr("tasks.agent_runtime_tasks.run_agent_task", task)
    return e


def run_event(event):
    router = CustomAgentRouter()
    obs = router.sense(event)
    if obs is None:
        return None
    decision, payload, reason = router.decide(obs)
    if decision == "act":
        router.act(payload, "corr")
    return decision, reason


def test_the_router_listens_for_mood_dips():
    assert bus.TOPIC_MOOD_ESCALATION in CustomAgentRouter.SUBSCRIBES


def test_a_mood_dip_queues_a_private_run_for_the_owner(env):
    assert run_event(mood_event())[0] == "act"
    [call] = env.enqueued
    trig = call["kwargs"]["trigger"]
    assert call["kwargs"]["agent_id"] == 1
    assert trig["type"] == "mood_escalation" and trig["delivery"] == "private" and trig["user_id"] == OWNER
    assert trig["primary_mood"] == "sad"
    assert trig["content"] is None and trig["message_id"] is None   # the run never sees the message itself


def test_someone_elses_mood_never_wakes_my_agent(env):
    assert run_event(mood_event(user_id=7)) is None and env.enqueued == []


def test_nothing_happens_once_they_stop_tracking_their_mood(env):
    env.tracks = False
    assert run_event(mood_event()) is None and env.enqueued == []


def test_a_mood_dip_without_a_channel_still_counts(env):
    assert run_event(mood_event(channel_id=None))[0] == "act"


def test_one_check_in_per_cooldown(env):
    assert run_event(mood_event())[0] == "act"
    decision, reason = run_event(mood_event(message_id=78))
    assert decision == "skip" and "cooldown" in reason and len(env.enqueued) == 1
    assert env.redis.keys[f"agent_router:mood:1:{OWNER}"][1] == router_agent.MOOD_COOLDOWN_SECONDS


def test_without_redis_mood_runs_do_not_happen(env):
    env.redis = None
    decision, reason = run_event(mood_event())
    assert decision == "skip" and "no_redis" in reason and env.enqueued == []


def test_the_mood_run_does_not_steal_the_messages_own_claim(env):
    router = CustomAgentRouter()
    obs = router.sense(mood_event())
    assert obs["message_id"] is None and "mood.escalation" in obs["event_key"]


# ── the run ─────────────────────────────────────────────────────────────

def test_the_prompt_is_a_gentle_private_check_in():
    text = build_user_message(agent(), {"type": "mood_escalation", "primary_mood": "sad"})
    assert "sad" in text and "only they will see" in text and "do not quote their messages" in text


def test_the_prompt_works_without_a_mood_label():
    assert "hard time." in build_user_message(agent(), {"type": "mood_escalation"})
