"""run_agent_task: the Celery job that runs an agent and posts the answer."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from agents.runtime.definitions import AgentDefinition, TriggerDef
from agents.runtime.loop import RunResult
from tasks import agent_runtime_tasks as tasks

DEFN = AgentDefinition(id=1, public_id="pub-aura", bot_user_id=500, bot_username="aura", name="Aura",
                       template_key="aura", triggers=(TriggerDef(id=10, type="mention"),))

TRIGGER = {"type": "mention", "user_id": 7, "username": "sarah", "channel_id": 11,
           "community_id": 3, "message_id": 77, "content": "@aura summarize please", "reply_to": None}


@pytest.fixture
def wired(monkeypatch):
    """Patch everything run_agent_task imports lazily; record the order of effects."""
    class W:
        events: list = []
        defn = DEFN
        result = RunResult(run_uuid="u", status="succeeded", text="Here you go", run_id=42)
        run_kwargs: dict = {}
        posted: list = []
        history = []
        raises = False

    w = W()
    w.events, w.posted, w.run_kwargs = [], [], {}

    monkeypatch.setattr("agents.runtime.definitions.get_definition", lambda aid: w.defn)
    monkeypatch.setattr("agents.runtime.posting.emit_run_event",
                        lambda defn, ch, event, **data: w.events.append((event, ch, data)))

    def fake_post(defn, channel_id, content, *, reply_to=None, run_id=None):
        w.posted.append({"channel_id": channel_id, "content": content, "reply_to": reply_to, "run_id": run_id})
        w.events.append(("posted", channel_id, {}))
        return {"id": 900}
    monkeypatch.setattr("agents.runtime.posting.post_as_agent", fake_post)

    def fake_run(spec, message, **kw):
        w.events.append(("run", None, {}))
        w.run_kwargs = {"spec": spec, "message": message, **kw}
        if w.raises:
            raise RuntimeError("boom")
        return w.result
    monkeypatch.setattr("agents.runtime.loop.run_agent", fake_run)
    monkeypatch.setattr("agents.runtime.threads.thread_history",
                        lambda parent, bot_id, limit=6: w.history)
    monkeypatch.setattr("agents.runtime.store.get_default_store", lambda: "STORE")
    w.webhooks = []
    monkeypatch.setattr("agents.runtime.integrations.dispatch",
                        lambda agent_id, public_id, event, data: w.webhooks.append((event, data)) or 0)
    return w


def run(trigger=None, agent_id=1):
    return tasks.run_agent_task.run(agent_id, trigger or TRIGGER)


def test_happy_path_posts_a_threaded_reply_between_start_and_finish_events(wired):
    out = run()
    assert [e[0] for e in wired.events] == ["agent_run_started", "run", "posted", "agent_run_finished"]
    assert wired.posted == [{"channel_id": 11, "content": "Here you go", "reply_to": 77, "run_id": 42}]
    started, finished = wired.events[0], wired.events[-1]
    assert started[1] == 11 and started[2]["message_id"] == 77
    assert finished[2] == {"message_id": 77, "status": "succeeded", "reply_message_id": 900}
    assert out == {"status": "succeeded", "run_id": 42, "reply_message_id": 900}


def test_agent_runs_for_the_person_who_asked(wired):
    run()
    kw = wired.run_kwargs
    ctx = kw["ctx"]
    assert (ctx.invoked_by, ctx.community_id, ctx.channel_id) == (7, 3, 11)
    assert ctx.extra["invoker_username"] == "sarah"
    assert kw["agent_id"] == 1 and kw["trigger_message_id"] == 77 and kw["trigger_type"] == "mention"
    assert kw["store"] == "STORE" and kw["spec"].key == "aura"


def test_the_mention_is_stripped_from_the_question(wired):
    run()
    assert wired.run_kwargs["message"] == "summarize please"


def test_a_bare_mention_still_gets_an_answer(wired):
    run({**TRIGGER, "content": "@aura"})
    assert wired.run_kwargs["message"] == "Hello"


def test_replies_carry_the_thread_so_far(wired):
    wired.history = [{"role": "assistant", "content": "earlier answer"}]
    run({**TRIGGER, "reply_to": 70})
    assert wired.run_kwargs["history"] == [{"role": "assistant", "content": "earlier answer"}]


def test_no_history_for_a_fresh_message(wired):
    wired.history = [{"role": "assistant", "content": "should not be used"}]
    run()
    assert wired.run_kwargs["history"] == []


def test_unavailable_llm_still_answers_the_user(wired):
    wired.result = RunResult(run_uuid="u", status="unavailable", text=None, run_id=43)
    run()
    assert "not configured" in wired.posted[0]["content"]


def test_failed_run_posts_its_apology_and_reports_failed(wired):
    wired.result = RunResult(run_uuid="u", status="failed", text="I could not finish that.", run_id=44)
    out = run()
    assert wired.posted[0]["content"] == "I could not finish that."
    assert wired.events[-1][2]["status"] == "failed" and out["status"] == "failed"


def test_a_crash_never_leaves_the_ui_stuck_on_thinking(wired):
    wired.raises = True
    out = run()
    assert wired.events[-1][0] == "agent_run_finished"
    assert wired.events[-1][2]["status"] == "failed"
    assert wired.posted == [] and out["status"] == "failed"


def test_inactive_or_missing_agent_is_skipped_silently(wired):
    wired.defn = None
    assert run()["status"] == "skipped"
    assert wired.events == []


def test_trigger_without_a_channel_is_skipped(wired):
    assert run({**TRIGGER, "channel_id": None})["status"] == "skipped"
    assert wired.events == []


def test_member_joined_welcome_is_a_fresh_message_not_a_reply(wired):
    run({"type": "member_joined", "user_id": 9, "username": "newbie", "channel_id": 20,
         "community_id": 3, "message_id": None, "content": None})
    assert wired.posted[0]["reply_to"] is None and wired.posted[0]["channel_id"] == 20
    assert "newbie" in wired.run_kwargs["message"] and "welcome" in wired.run_kwargs["message"].lower()
    assert wired.run_kwargs["trigger_type"] == "member_joined"


def test_task_is_registered_on_the_priority_queue():
    from celery_app import celery_app
    assert tasks.run_agent_task.name == "tasks.agent_runtime_tasks.run_agent_task"
    assert celery_app.conf.task_routes["tasks.agent_runtime_tasks.run_agent_task"] == {"queue": "high_priority"}
    assert "tasks.agent_runtime_tasks" in celery_app.conf.include


def test_a_run_waiting_for_approval_tells_the_approver(wired, monkeypatch):
    wired.result = RunResult(run_uuid="u", status="waiting_approval", text="I need your approval.", run_id=42,
                             approvals=[8])
    announced = []
    monkeypatch.setattr("agents.runtime.approvals.announce_requested", lambda ids, who: announced.append((ids, who)))
    run()
    assert wired.run_kwargs["ctx"].approver_id == 7
    assert announced == [([8], 7)]
    assert wired.posted[0]["content"] == "I need your approval."      # a mention still gets an answer


def test_webhooks_hear_about_every_finished_run_even_a_crashed_one(wired):
    run()
    assert wired.webhooks == [("run.finished", {"run_id": 42, "status": "succeeded", "channel_id": 11,
                                                "reply_message_id": 900, "trigger": "mention"})]
    wired.webhooks.clear()
    wired.raises = True
    run()
    assert wired.webhooks[0][0] == "run.finished" and wired.webhooks[0][1]["status"] == "failed"


def test_webhooks_hear_when_a_run_asks_for_approval(wired, monkeypatch):
    wired.result = RunResult(run_uuid="u", status="waiting_approval", text="I need your approval.", run_id=42,
                             approvals=[8])
    monkeypatch.setattr("agents.runtime.approvals.announce_requested", lambda ids, who: None)
    run()
    assert [e for e, _ in wired.webhooks] == ["approval.requested", "run.finished"]
    assert wired.webhooks[0][1] == {"run_id": 42, "approval_ids": [8], "channel_id": 11}


def test_scheduled_runs_ask_the_agents_owner(wired, monkeypatch):
    wired.defn = AgentDefinition(id=1, public_id="p", bot_user_id=500, bot_username="d", name="D", owner_user_id=3)
    wired.result = RunResult(run_uuid="u", status="waiting_approval", text="x", run_id=42, approvals=[9])
    announced = []
    monkeypatch.setattr("agents.runtime.approvals.announce_requested", lambda ids, who: announced.append((ids, who)))
    run({"type": "schedule", "channel_id": 11, "community_id": 3, "prompt": "post the digest"})
    assert announced == [([9], 3)] and wired.posted == []              # passive runs stay quiet in the channel
