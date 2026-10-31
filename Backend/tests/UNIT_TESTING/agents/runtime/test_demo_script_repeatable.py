"""docs/DEMO_SCRIPT.md, played five times in a row against the real Aura spec and the real
write tools, with a scripted model. Every round must end the same way and must never post,
vote or remind by itself (no state may leak from one round to the next)."""
from __future__ import annotations

import pytest

from agents.runtime import permissions, reminders
from agents.runtime import tools as rt
from agents.runtime.definitions import AgentDefinition
from agents.runtime.loop import STATUS_SUCCEEDED, STATUS_WAITING, run_agent
from agents.runtime.specs import AURA
from agents.runtime.store import MemoryRunStore
from agents.runtime.tools import RISK_READ, ToolContext, tool
from test_runtime_loop import Choice, FakeLLM, call, say

ROUNDS = 5
GENERAL = {"id": 11, "name": "assignments", "community_id": 2, "type": "text"}
AGENT = AgentDefinition(id=3, public_id="p", bot_user_id=500, bot_username="aura", name="Aura", community_id=None)


@pytest.fixture
def demo(monkeypatch):
    snapshot = dict(rt.TOOL_REGISTRY)
    side_effects = []

    # Read tools: stand-ins for the database-backed ones (the loop and the real write tools stay real).
    @tool("get_channel_history", "stub", {"type": "object", "properties": {}}, risk=RISK_READ)
    def _history(ctx):
        return {"messages": ["Quiz on Friday", "Notes uploaded"]}

    @tool("summarize_channel", "stub", {"type": "object", "properties": {}}, risk=RISK_READ)
    def _summary(ctx):
        return {"summary": "Quiz on Friday; notes are up."}

    @tool("translate_text", "stub", {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]},
          risk=RISK_READ)
    def _translate(ctx, text):
        return {"translated": "Juma ko quiz hai."}

    monkeypatch.setattr(permissions, "channel_info", lambda cid: GENERAL)
    monkeypatch.setattr(permissions, "can_read_channel", lambda uid, cid: True)
    monkeypatch.setattr("agents.runtime.definitions.get_definition", lambda aid, include_inactive=False: AGENT)
    monkeypatch.setattr("agents.runtime.posting.post_as_agent",
                        lambda *a, **k: side_effects.append("post") or {"id": 1})
    monkeypatch.setattr(reminders, "create", lambda **k: side_effects.append("reminder") or 1)
    yield side_effects
    rt.TOOL_REGISTRY.clear()
    rt.TOOL_REGISTRY.update(snapshot)


def play(llm, *, dry=False):
    store = MemoryRunStore()
    ctx = ToolContext(invoked_by=7, community_id=2, channel_id=11, approver_id=7, is_dry_run=dry,
                      extra={"agent_id": 3})
    res = run_agent(AURA, "demo", ctx=ctx, model_choice=Choice(llm), store=store, agent_id=3)
    return res, store


def one_round():
    out = {}

    res, _ = play(FakeLLM(call(("1", "get_channel_history", {})),
                          call(("2", "summarize_channel", {})),
                          call(("3", "translate_text", {"text": "Quiz on Friday; notes are up."})),
                          say("Juma ko quiz hai.")))
    out["summary_urdu"] = (res.status, res.text)

    for name, args in [
        ("post_message", {"text": "Exams start next Monday."}),
        ("create_poll", {"question": "Which day for the quiz?", "options": ["Mon", "Wed", "Fri"]}),
        ("schedule_reminder", {"text": "Submit report", "in_minutes": 120}),
    ]:
        res, store = play(FakeLLM(call(("w", name, args))))
        out[name] = (res.status, len(res.approvals), store.approvals[0]["summary"], "approval" in res.text)

    res, store = play(FakeLLM(call(("w", "post_message", {"text": "hi"})), say("I would post it.")), dry=True)
    out["dry_run"] = (res.status, len(store.approvals))
    return out


def test_the_demo_ends_the_same_way_five_times_and_never_acts_alone(demo):
    first = one_round()
    assert first["summary_urdu"] == (STATUS_SUCCEEDED, "Juma ko quiz hai.")
    for name in ("post_message", "create_poll", "schedule_reminder"):
        status, approvals, summary, announced = first[name]
        assert (status, approvals, announced) == (STATUS_WAITING, 1, True)
    assert first["post_message"][2] == "Post in #assignments: Exams start next Monday."
    assert first["create_poll"][2] == "Poll in #assignments: Which day for the quiz? (Mon / Wed / Fri)"
    assert first["schedule_reminder"][2] == "Remind you in #assignments in 2 h: Submit report"
    assert first["dry_run"] == (STATUS_SUCCEEDED, 0)

    for _ in range(ROUNDS - 1):
        assert one_round() == first
    assert demo == []          # nothing was posted, voted or scheduled without an approval
