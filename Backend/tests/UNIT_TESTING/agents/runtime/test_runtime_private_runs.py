"""Private runs: a trigger with delivery "private", or someone replying to an agent's DM.
The answer goes to one person as a DM; nothing is ever posted in a channel."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from runtime_fakes import make_db  # noqa: F401  (pytest fixture)

from agents.runtime import builder, private
from agents.runtime.definitions import AgentDefinition, TriggerDef
from agents.runtime.loop import RunResult
from agents.runtime.specs import AgentSpec
from agents.runtime.tools import RISK_READ, RISK_WRITE, TOOL_REGISTRY
from tasks import agent_runtime_tasks as tasks

DEFN = AgentDefinition(id=1, public_id="pub-buddy", bot_user_id=500, bot_username="buddy", name="Buddy",
                       owner_user_id=9, community_id=3, tools=("search_messages",),
                       triggers=(TriggerDef(id=10, type="mention"),))
KEYWORD = {"type": "keyword", "user_id": 7, "username": "sarah", "channel_id": 11, "community_id": 3,
           "message_id": 77, "content": "help with deploy", "reply_to": None, "delivery": "private"}
DM = {"type": "dm", "user_id": 7, "username": "sarah", "message_id": 61, "content": "and tomorrow?",
      "channel_id": None, "community_id": 3, "delivery": "private"}


@pytest.fixture
def wired(monkeypatch):
    class W:
        pass
    w = W()
    w.events, w.posted, w.sent, w.run_kwargs = [], [], [], {}
    w.result = RunResult(run_uuid="u", status="succeeded", text="Here you go", run_id=42)
    monkeypatch.setattr("agents.runtime.definitions.get_definition", lambda aid: DEFN)
    monkeypatch.setattr("agents.runtime.posting.emit_run_event",
                        lambda defn, ch, event, **data: w.events.append(event))
    monkeypatch.setattr("agents.runtime.posting.post_as_agent",
                        lambda *a, **kw: w.posted.append(a) or {"id": 900})
    monkeypatch.setattr(private, "deliver_privately",
                        lambda defn, uid, text, run_id=None: w.sent.append((uid, text, run_id)) or {"id": 901})
    monkeypatch.setattr(private, "dm_history", lambda bot, uid, before_id=None: [{"role": "assistant", "content": "hi"}])
    monkeypatch.setattr("agents.runtime.threads.thread_history", lambda *a, **kw: [])
    monkeypatch.setattr("agents.runtime.store.get_default_store", lambda: "STORE")
    monkeypatch.setattr("agents.runtime.integrations.dispatch", lambda *a: 0)

    def fake_run(spec, message, **kw):
        w.run_kwargs = {"spec": spec, "message": message, **kw}
        return w.result
    monkeypatch.setattr("agents.runtime.loop.run_agent", fake_run)
    return w


def test_a_private_trigger_sends_a_dm_and_posts_nothing(wired):
    out = tasks.run_agent_task.run(1, KEYWORD)
    assert wired.sent == [(7, "Here you go", 42)] and wired.posted == []
    assert wired.events == []                         # not even a "thinking" indicator in the channel
    assert out["reply_message_id"] == 901


def test_a_private_run_only_has_read_tools_and_cannot_act(wired):
    tasks.run_agent_task.run(1, KEYWORD)
    ctx, spec = wired.run_kwargs["ctx"], wired.run_kwargs["spec"]
    assert ctx.is_dry_run is True
    assert all(TOOL_REGISTRY[t].risk == RISK_READ for t in spec.tools)
    assert "private" in spec.instructions


def test_a_reply_to_the_agents_dm_runs_without_a_channel(wired):
    tasks.run_agent_task.run(1, DM)
    assert wired.run_kwargs["message"] == "and tomorrow?"
    assert wired.run_kwargs["history"] == [{"role": "assistant", "content": "hi"}]
    assert wired.sent == [(7, "Here you go", 42)] and wired.posted == []


def test_a_failed_dm_reply_still_answers(wired):
    wired.result = RunResult(run_uuid="u", status="unavailable", text="", run_id=43)
    tasks.run_agent_task.run(1, DM)
    assert wired.sent[0][1] == tasks._UNAVAILABLE_TEXT


def test_a_private_channel_event_goes_to_the_owner(wired):
    tasks.run_agent_task.run(1, {**KEYWORD, "type": "channel_silent", "user_id": None})
    assert wired.sent[0][0] == 9


def test_without_delivery_the_answer_still_goes_to_the_channel(wired):
    tasks.run_agent_task.run(1, {**KEYWORD, "delivery": None})
    assert wired.posted and wired.sent == []


def test_private_spec_drops_write_tools():
    write = next(n for n, t in TOOL_REGISTRY.items() if t.risk == RISK_WRITE)
    read = next(n for n, t in TOOL_REGISTRY.items() if t.risk == RISK_READ)
    spec = AgentSpec(key="k", name="K", instructions="Be kind.", tools=(read, write))
    out = private.private_spec(spec)
    assert out.tools == (read,) and out.instructions.startswith("Be kind.")


# ── validation ──────────────────────────────────────────────────────────

def _validate(trigger):
    return builder.validate_triggers([trigger], community_id=3, channel_ok=lambda c: True)


def test_delivery_private_is_kept_with_the_trigger_config():
    out, errors = _validate({"type": "keyword", "config": {"keywords": ["deploy"], "delivery": "private"}})
    assert errors == [] and out[0]["config"] == {"keywords": ["deploy"], "delivery": "private"}


def test_channel_delivery_is_the_default_and_not_stored():
    out, _ = _validate({"type": "mention", "config": {"delivery": "channel"}})
    assert out[0]["config"] == {}


def test_an_unknown_delivery_is_refused():
    _, errors = _validate({"type": "mention", "config": {"delivery": "email"}})
    assert errors and "delivery" in errors[0]


# ── someone writes to an agent ──────────────────────────────────────────

@pytest.fixture
def queued(monkeypatch):
    calls = []
    task = MagicMock()
    task.apply_async.side_effect = lambda kwargs, queue: calls.append((kwargs, queue))
    monkeypatch.setattr(tasks, "run_agent_task", task)
    monkeypatch.setattr(private, "agent_for_bot_user", lambda bot: DEFN if bot == 500 else None)
    monkeypatch.setattr(private, "_rate_ok", lambda uid: True)
    monkeypatch.setattr("agents.runtime.router_agent._runs_today", lambda aid: 0)
    monkeypatch.setattr(private, "_has_written_to", lambda bot, uid: uid == 7)
    return calls


def test_writing_to_an_agent_queues_a_private_run(queued):
    assert private.on_direct_message(7, 500, 61, " and tomorrow? ", username="sarah") is None
    [(kwargs, queue)] = queued
    assert queue == "high_priority" and kwargs["agent_id"] == 1
    assert kwargs["trigger"] == {**DM, "content": "and tomorrow?"}


def test_writing_to_a_person_does_nothing(queued):
    assert private.on_direct_message(7, 8, 61, "hi") == "not_an_agent" and queued == []


@pytest.mark.parametrize("user_id,allowed", [(7, True), (9, True), (8, False)])
def test_only_its_owner_or_someone_it_wrote_to_can_write_to_an_agent(queued, user_id, allowed):
    out = private.on_direct_message(user_id, 500, 61, "hi")
    assert (out is None) == allowed and (len(queued) == 1) == allowed


def test_anyone_can_write_to_aura(queued, monkeypatch):
    aura = AgentDefinition(id=2, public_id="pub-aura", bot_user_id=12, bot_username="aura", name="Aura",
                           template_key="aura")
    monkeypatch.setattr(private, "agent_for_bot_user", lambda bot: aura)
    assert private.on_direct_message(8, 12, 61, "hi") is None


def test_rate_limit_and_daily_cap_are_kept(queued, monkeypatch):
    monkeypatch.setattr(private, "_rate_ok", lambda uid: False)
    assert private.on_direct_message(7, 500, 61, "hi") == "rate_limited"
    monkeypatch.setattr(private, "_rate_ok", lambda uid: True)
    monkeypatch.setattr("agents.runtime.router_agent._runs_today", lambda aid: DEFN.daily_run_cap)
    assert private.on_direct_message(7, 500, 61, "hi") == "daily_cap"
    assert queued == []


def test_an_empty_message_does_nothing(queued):
    assert private.on_direct_message(7, 500, 61, "   ") == "empty" and queued == []


def test_dm_history_is_oldest_first_and_names_the_agent(make_db, monkeypatch):
    monkeypatch.setattr(private, "decrypt", lambda c: c.upper())
    make_db([("FROM direct_messages", [{"id": 5, "sender_id": 500, "content": "b"},
                                        {"id": 4, "sender_id": 7, "content": "a"}])],
            ["agents.runtime.private"])
    assert private.dm_history(500, 7, before_id=6) == [
        {"role": "user", "content": "A"}, {"role": "assistant", "content": "B"}]


# ── "@aura dm me ..." ───────────────────────────────────────────────────

@pytest.mark.parametrize("text,wanted", [
    ("@aura dm me the summary", True), ("@aura tell me privately", True), ("send it in my DMs", True),
    ("@aura message me when done", True), ("@aura summarize", False), ("admin me", False), ("dms are fun", False)])
def test_asking_for_a_dm(text, wanted):
    assert private.wants_dm(text) is wanted


def test_a_mention_asking_for_a_dm_is_answered_privately():
    from agents.runtime.router_agent import _delivery
    from agents.runtime.triggers import TriggerMatch
    mention = TriggerMatch(DEFN, TriggerDef(id=1, type="mention"), "mention")
    keyword = TriggerMatch(DEFN, TriggerDef(id=2, type="keyword"), "keyword")
    assert _delivery(mention, "@buddy dm me the plan") == "private"
    assert _delivery(mention, "@buddy the plan") is None
    assert _delivery(keyword, "dm me the plan") is None                      # only when talking to the agent


# ── the old Wellness agent steps aside for its twin ─────────────────────

def test_has_mood_twin_looks_for_an_active_personal_agent_with_the_trigger(make_db):
    _, cur = make_db([("FROM agent_definitions", {"1": 1})], ["agents.runtime.private"])
    assert private.has_mood_twin(7) is True
    sql, params = cur.sql_containing("mood_escalation")[0]
    assert params == (7,) and "community_id IS NULL" in sql and "status = 'active'" in sql


def test_wellness_sends_no_mood_toast_while_the_twin_is_on(monkeypatch):
    from agents import event_bus as bus
    from agents import wellness
    agent = wellness.WellnessAgent.__new__(wellness.WellnessAgent)
    monkeypatch.setattr(agent, "_user_opted_in", lambda uid: True, raising=False)
    monkeypatch.setattr(wellness, "get_personal_settings", lambda *a: {"auto_check": True})
    monkeypatch.setattr(private, "has_mood_twin", lambda uid: True)
    assert agent.sense({"topic": bus.TOPIC_MOOD_ESCALATION, "user_id": 7}) is None
    # moderation check-ins are not the twin's job
    obs = agent.sense({"topic": bus.TOPIC_MOD_VIOLATION, "user_id": 7, "severity_score": 0.9})
    assert obs is not None and obs["trigger"] == "mod_violation"
    monkeypatch.setattr(private, "has_mood_twin", lambda uid: False)
    assert agent.sense({"topic": bus.TOPIC_MOOD_ESCALATION, "user_id": 7})["trigger"] == "mood_escalation"
