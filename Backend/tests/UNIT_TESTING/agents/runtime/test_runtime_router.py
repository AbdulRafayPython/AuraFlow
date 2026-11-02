"""CustomAgentRouter: sense -> decide -> act with every external dependency faked."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from agents import event_bus as bus
from agents.runtime import router_agent
from agents.runtime.definitions import AgentDefinition, TriggerDef
from agents.runtime.router_agent import CustomAgentRouter

AURA = AgentDefinition(
    id=1, public_id="pub-aura", bot_user_id=500, bot_username="aura", name="Aura", template_key="aura",
    triggers=(TriggerDef(id=10, type="mention"),), daily_run_cap=5)
GREETER = AgentDefinition(
    id=2, public_id="pub-greet", bot_user_id=501, bot_username="greeter", name="Greeter",
    community_id=3, triggers=(TriggerDef(id=11, type="member_joined"),))


class FakeRedis:
    def __init__(self):
        self.keys, self.counters, self.expire_calls = {}, {}, []

    def set(self, key, value, nx=False, ex=None):
        if nx and key in self.keys:
            return None
        self.keys[key] = value
        return True

    def incr(self, key):
        self.counters[key] = self.counters.get(key, 0) + 1
        return self.counters[key]

    def expire(self, key, seconds):
        self.expire_calls.append((key, seconds))


@pytest.fixture
def env(monkeypatch):
    """Router wired to fakes. Returns a namespace the tests tweak."""
    class Env:
        redis = FakeRedis()
        defs = [AURA, GREETER]
        runs_today = 0
        parent_sender = None
        enqueued: list = []

    e = Env()
    e.enqueued = []
    monkeypatch.setattr(router_agent, "ensure_builtin_agents_once", lambda: None)
    monkeypatch.setattr(router_agent, "load_active_definitions", lambda: e.defs)
    monkeypatch.setattr(router_agent, "_redis", lambda: e.redis)
    monkeypatch.setattr(router_agent, "_runs_today", lambda agent_id: e.runs_today)
    monkeypatch.setattr(router_agent, "_reply_parent_sender", lambda mid: e.parent_sender)

    task = MagicMock()
    task.apply_async.side_effect = lambda **kw: e.enqueued.append(kw)
    monkeypatch.setattr("tasks.agent_runtime_tasks.run_agent_task", task)
    return e


def msg(content="@aura what is up", **kw):
    return {"topic": bus.TOPIC_MSG_CREATED, "message_id": 77, "user_id": 7, "username": "sarah",
            "channel_id": 11, "community_id": 3, "content": content, **kw}


# ── sense ───────────────────────────────────────────────────────────────

def test_sense_ignores_messages_nobody_wants(env):
    assert CustomAgentRouter().sense(msg("just chatting")) is None


def test_sense_builds_an_observation_for_a_mention(env):
    obs = CustomAgentRouter().sense(msg())
    assert obs["channel_id"] == 11 and obs["user_id"] == 7 and obs["message_id"] == 77
    assert obs["matches"] == [{"agent_id": 1, "trigger_id": 10, "kind": "mention", "cap": 5, "owner_user_id": None,
                              "delivery": None}]
    assert obs["scope_type"] == "channel" and obs["scope_id"] == 11


def test_sense_ignores_messages_sent_by_an_agent(env):
    assert CustomAgentRouter().sense(msg(user_id=500)) is None         # Aura's own message
    assert CustomAgentRouter().sense(msg("@aura hi", user_id=501)) is None   # another agent: no agent-to-agent loop


def test_sense_with_no_active_agents_is_a_noop(env):
    env.defs = []
    assert CustomAgentRouter().sense(msg()) is None


def test_sense_treats_a_reply_to_an_agent_as_talking_to_it(env):
    env.parent_sender = 500
    obs = CustomAgentRouter().sense(msg("and fees?", reply_to=70))
    assert obs["matches"][0]["kind"] == "reply" and obs["reply_to"] == 70


def test_reply_to_a_human_does_not_wake_the_agent(env):
    env.parent_sender = 7
    assert CustomAgentRouter().sense(msg("and fees?", reply_to=70)) is None


def test_sense_ignores_empty_content_and_unknown_topics(env):
    assert CustomAgentRouter().sense(msg("   ")) is None
    assert CustomAgentRouter().sense({"topic": "mood.detected", "content": "@aura"}) is None


def test_sense_member_joined_uses_the_first_channel(env):
    ev = {"topic": bus.TOPIC_USER_JOINED, "community_id": 3, "user_id": 9, "username": "newbie",
          "first_channel_id": 20}
    obs = CustomAgentRouter().sense(ev)
    assert obs["channel_id"] == 20 and obs["matches"][0]["agent_id"] == 2
    assert CustomAgentRouter().sense({**ev, "first_channel_id": None}) is None


# ── decide ──────────────────────────────────────────────────────────────

def test_decide_acts_and_claims_the_message(env):
    r = CustomAgentRouter()
    decision, payload, reason = r.decide(r.sense(msg()))
    assert decision == "act" and reason == "route:mention"
    assert payload["correlation_id"] == "router-77-1"
    assert "agent_router:claim:77:1" in env.redis.keys


def test_decide_skips_a_message_another_orchestrator_already_claimed(env):
    r = CustomAgentRouter()
    obs = r.sense(msg())
    assert r.decide(obs)[0] == "act"
    decision, _, reason = r.decide(obs)
    assert decision == "skip" and reason == "duplicate"


def test_decide_enforces_the_daily_cap(env):
    env.runs_today = 5                         # AURA.daily_run_cap == 5
    r = CustomAgentRouter()
    decision, _, reason = r.decide(r.sense(msg()))
    assert decision == "skip" and reason == "daily_cap"


def test_decide_rate_limits_direct_invocations_per_user(env, monkeypatch):
    monkeypatch.setenv("AGENT_USER_RATE_PER_MIN", "2")
    r = CustomAgentRouter()
    results = []
    for mid in (1, 2, 3):
        results.append(r.decide(r.sense(msg(message_id=mid)))[0])
    assert results == ["act", "act", "skip"]
    assert ("agent_router:rate:7", 60) in env.redis.expire_calls


def test_rate_limit_is_per_user(env, monkeypatch):
    monkeypatch.setenv("AGENT_USER_RATE_PER_MIN", "1")
    r = CustomAgentRouter()
    assert r.decide(r.sense(msg(message_id=1, user_id=7)))[0] == "act"
    assert r.decide(r.sense(msg(message_id=2, user_id=8)))[0] == "act"


def test_passive_triggers_are_not_user_rate_limited(env, monkeypatch):
    monkeypatch.setenv("AGENT_USER_RATE_PER_MIN", "0")
    watcher = AgentDefinition(id=3, public_id="w", bot_user_id=502, bot_username="watcher", name="W", community_id=3,
                              triggers=(TriggerDef(id=12, type="channel_message"),))
    env.defs = [watcher]
    r = CustomAgentRouter()
    assert r.decide(r.sense(msg("anything at all")))[0] == "act"


def test_without_redis_the_router_still_works(env):
    env.redis = None
    r = CustomAgentRouter()
    decision, payload, _ = r.decide(r.sense(msg()))
    assert decision == "act" and payload["matches"]


# ── act ─────────────────────────────────────────────────────────────────

def test_act_enqueues_one_task_per_agent_on_the_right_queue(env):
    r = CustomAgentRouter()
    _, payload, _ = r.decide(r.sense(msg()))
    assert r.act(payload, payload["correlation_id"]) == {"enqueued": 1}
    [call] = env.enqueued
    assert call["queue"] == "high_priority"
    assert call["kwargs"]["agent_id"] == 1
    trig = call["kwargs"]["trigger"]
    assert trig["type"] == "mention" and trig["message_id"] == 77 and trig["channel_id"] == 11
    assert trig["user_id"] == 7 and trig["content"] == "@aura what is up"


def test_passive_agents_use_the_default_queue(env):
    env.defs = [AgentDefinition(id=3, public_id="w", bot_user_id=502, bot_username="watcher", name="W", community_id=3,
                                triggers=(TriggerDef(id=12, type="keyword", config={"keywords": ["fees"]}),))]
    r = CustomAgentRouter()
    _, payload, _ = r.decide(r.sense(msg("what are the fees")))
    r.act(payload, "c")
    assert env.enqueued[0]["queue"] == "default"


def test_full_cycle_through_handle(env, chain_store):
    """The orchestrator calls handle(); it must enqueue exactly one task."""
    CustomAgentRouter().handle(msg())
    assert len(env.enqueued) == 1
    CustomAgentRouter().handle(msg())                  # duplicate delivery of the same event
    assert len(env.enqueued) == 1


def test_router_is_registered_with_the_orchestrator():
    from agents import orchestrator
    assert orchestrator._REGISTRY["custom_router"] == "agents.runtime.router_agent:CustomAgentRouter"
    assert bus.TOPIC_MSG_CREATED in CustomAgentRouter.SUBSCRIBES
    assert CustomAgentRouter.COOLDOWN_SECONDS == 0
