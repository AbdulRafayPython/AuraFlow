"""The agent loop, driven by a scripted FakeLLM (no network, no database)."""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, List, Optional

import pytest

from agents.runtime import tools as rt_tools
from agents.runtime.loop import (
    STATUS_FAILED, STATUS_SUCCEEDED, STATUS_UNAVAILABLE, STATUS_WAITING, run_agent)
from agents.runtime.specs import AgentSpec
from agents.runtime.store import MemoryRunStore, NullRunStore
from agents.runtime.tools import RISK_WRITE, ToolContext, ToolError, tool
from utils.ai.llm_client import LLMToolResponse, ToolCall


# ── fakes ───────────────────────────────────────────────────────────────

def say(text: str, **usage: int) -> LLMToolResponse:
    u = {"prompt_tokens": 10, "completion_tokens": 5, **usage}
    return LLMToolResponse(text=text, usage=u, finish_reason="stop",
                           message={"role": "assistant", "content": text})


def call(*calls: tuple) -> LLMToolResponse:
    """call(("id", "tool", {args}), ...) -> a response requesting those tools."""
    tcs = [ToolCall(id=i, name=n, arguments=a, raw_arguments=json.dumps(a)) for i, n, a in calls]
    return LLMToolResponse(
        text="", tool_calls=tcs, finish_reason="tool_calls",
        usage={"prompt_tokens": 10, "completion_tokens": 5},
        message={"role": "assistant", "content": None, "tool_calls": [
            {"id": c.id, "type": "function",
             "function": {"name": c.name, "arguments": c.raw_arguments}} for c in tcs]})


class FakeLLM:
    """Plays back scripted responses and records every request."""

    def __init__(self, *script: Optional[LLMToolResponse]):
        self.script: List[Optional[LLMToolResponse]] = list(script)
        self.requests: List[dict] = []

    def chat_tools(self, messages, tools=None, **kw):
        self.requests.append({"messages": [dict(m) for m in messages], "tools": tools, **kw})
        if not self.script:
            raise AssertionError("FakeLLM script exhausted")
        return self.script.pop(0)


@dataclass
class Choice:
    client: Any
    available: bool = True
    tier: str = "fast"
    requested: str = "fast"
    model: str = "fake-model"


@pytest.fixture(autouse=True)
def restore_registry():
    snapshot = dict(rt_tools.TOOL_REGISTRY)
    yield
    rt_tools.TOOL_REGISTRY.clear()
    rt_tools.TOOL_REGISTRY.update(snapshot)


@pytest.fixture
def calls_log():
    return []


@pytest.fixture
def toolbox(calls_log):
    @tool("t_echo", "Echo text back.",
          {"type": "object", "properties": {"text": {"type": "string"}, "n": {"type": "integer", "minimum": 1}},
           "required": ["text"]})
    def t_echo(ctx, text, n=1):
        calls_log.append(("t_echo", text, n))
        return {"echo": text * n}

    @tool("t_denied", "Always refuses.", {"type": "object", "properties": {}})
    def t_denied(ctx):
        raise ToolError("Access denied: not a member")

    @tool("t_boom", "Crashes.", {"type": "object", "properties": {}})
    def t_boom(ctx):
        raise RuntimeError("secret internal detail")

    @tool("t_post", "Posts a message.", {"type": "object", "properties": {"text": {"type": "string"}}},
          risk=RISK_WRITE)
    def t_post(ctx, text=""):
        calls_log.append(("t_post", text))
        return {"posted": True}


SPEC = AgentSpec(key="tester", name="Tester", instructions="Be helpful.",
                 tools=("t_echo", "t_denied", "t_boom", "t_post"), max_steps=4)


def run(llm, message="hi", spec=SPEC, store=None, **kw):
    store = store if store is not None else MemoryRunStore()
    res = run_agent(spec, message, ctx=ToolContext(invoked_by=7, community_id=3, channel_id=11),
                    model_choice=Choice(llm), store=store, **kw)
    return res, store


def tool_messages(llm, request_index=-1):
    return [m for m in llm.requests[request_index]["messages"] if m["role"] == "tool"]


# ── happy paths ─────────────────────────────────────────────────────────

def test_direct_answer_without_tools(toolbox):
    llm = FakeLLM(say("Hello there"))
    res, store = run(llm)
    assert res.ok and res.text == "Hello there"
    assert [s["kind"] for s in res.steps] == ["llm", "final"]
    assert res.tool_calls == 0
    assert (res.tokens_in, res.tokens_out) == (10, 5)
    assert res.model == "fake-model" and res.tier == "fast"


def test_request_carries_system_prompt_tools_and_user_message(toolbox):
    llm = FakeLLM(say("ok"))
    run(llm, message="what is up")
    req = llm.requests[0]
    assert "Be helpful." in req["system"] and "channel_id=11" in req["system"]
    assert req["messages"] == [{"role": "user", "content": "what is up"}]
    assert {t["function"]["name"] for t in req["tools"]} == {"t_echo", "t_denied", "t_boom", "t_post"}
    # chat_tools humanizes only a prose answer, never a turn with tool calls
    assert req["humanize"] is True and req["temperature"] == SPEC.temperature


def test_history_is_prepended(toolbox):
    llm = FakeLLM(say("ok"))
    history = [{"role": "user", "content": "earlier"}, {"role": "assistant", "content": "reply"}]
    run(llm, history=history)
    assert [m["content"] for m in llm.requests[0]["messages"]] == ["earlier", "reply", "hi"]


def test_two_step_chain_feeds_results_back(toolbox, calls_log):
    llm = FakeLLM(
        call(("c1", "t_echo", {"text": "ab"})),
        call(("c2", "t_echo", {"text": "cd", "n": 2})),
        say("done"),
    )
    res, _ = run(llm)
    assert res.ok and res.text == "done" and res.tool_calls == 2
    assert calls_log == [("t_echo", "ab", 1), ("t_echo", "cd", 2)]
    # the 2nd request replays: user, assistant(tool_calls), tool(c1)
    second = llm.requests[1]["messages"]
    assert [m["role"] for m in second] == ["user", "assistant", "tool"]
    assert second[2]["tool_call_id"] == "c1"
    body = json.loads(second[2]["content"])
    assert body == {"tool": "t_echo", "ok": True, "untrusted_data": {"echo": "ab"}}
    assert (res.tokens_in, res.tokens_out) == (30, 15)
    assert all(r["humanize"] is True for r in llm.requests)


def test_parallel_tool_calls_in_one_turn(toolbox, calls_log):
    llm = FakeLLM(call(("a", "t_echo", {"text": "1"}), ("b", "t_echo", {"text": "2"})), say("ok"))
    res, _ = run(llm)
    assert res.ok and [c[1] for c in calls_log] == ["1", "2"]
    ids = [m["tool_call_id"] for m in tool_messages(llm)]
    assert ids == ["a", "b"]


# ── error handling ──────────────────────────────────────────────────────

def test_bad_arguments_are_reported_and_model_can_retry(toolbox, calls_log):
    llm = FakeLLM(
        call(("c1", "t_echo", {"n": 0})),                       # missing text, n < 1
        call(("c2", "t_echo", {"text": "fixed"})),
        say("ok"),
    )
    res, _ = run(llm)
    first = json.loads(tool_messages(llm, 1)[0]["content"])
    assert first["ok"] is False
    assert "missing required argument 'text'" in first["error"] and ">= 1" in first["error"]
    assert calls_log == [("t_echo", "fixed", 1)]                # the bad call never ran
    assert res.ok


def test_unparseable_arguments_from_the_model(toolbox):
    bad = call(("c1", "t_echo", {}))
    bad.tool_calls[0].error = "arguments are not valid JSON: boom"
    llm = FakeLLM(bad, say("ok"))
    run(llm)
    assert "not valid JSON" in json.loads(tool_messages(llm, 1)[0]["content"])["error"]


def test_unknown_tool_lists_what_is_available(toolbox):
    llm = FakeLLM(call(("c1", "delete_everything", {})), say("ok"))
    res, _ = run(llm)
    err = json.loads(tool_messages(llm, 1)[0]["content"])["error"]
    assert "unknown tool 'delete_everything'" in err and "t_echo" in err
    assert res.ok


def test_tool_error_message_reaches_the_model(toolbox):
    llm = FakeLLM(call(("c1", "t_denied", {})), say("sorry"))
    res, _ = run(llm)
    body = json.loads(tool_messages(llm, 1)[0]["content"])
    assert body["ok"] is False and body["error"] == "Access denied: not a member"
    assert res.ok


def test_crashing_tool_does_not_leak_details_or_stop_the_loop(toolbox):
    llm = FakeLLM(call(("c1", "t_boom", {})), say("recovered"))
    res, store = run(llm)
    content = tool_messages(llm, 1)[0]["content"]
    assert "secret internal detail" not in content
    assert json.loads(content)["error"] == "the tool failed unexpectedly"
    assert res.ok and res.text == "recovered"
    # the detail is kept in the run log for debugging
    assert any("secret internal detail" in json.dumps(s["result"]) for s in store.steps if s["kind"] == "tool_result")


def run_write(llm, *, dry=False, approver=7, store=None, spec=SPEC):
    store = store if store is not None else MemoryRunStore()
    ctx = ToolContext(invoked_by=7, community_id=3, channel_id=11, approver_id=approver, is_dry_run=dry)
    res = run_agent(spec, "post it", ctx=ctx, model_choice=Choice(llm), store=store)
    return res, store


def test_write_tool_waits_for_approval_and_never_runs(toolbox, calls_log):
    llm = FakeLLM(call(("c1", "t_post", {"text": "hi all"})))      # no second model call is scripted
    res, store = run_write(llm)
    assert calls_log == []                                           # never executed
    assert res.status == STATUS_WAITING and res.approvals == [1]
    assert "approval" in res.text and "hi all" not in res.text       # the channel never sees the draft
    assert store.runs[0]["status"] == STATUS_WAITING
    approval = store.approvals[0]
    assert approval["tool_name"] == "t_post" and approval["args"] == {"text": "hi all"}
    assert approval["approver_id"] == 7 and approval["run_id"] == 1
    assert [s["kind"] for s in store.steps] == ["llm", "tool_call", "tool_result", "approval"]
    assert len(llm.requests) == 1


def test_approval_summary_uses_the_tool_summarizer(toolbox):
    @tool("t_say", "Says it.", {"type": "object", "properties": {"text": {"type": "string"}}}, risk=RISK_WRITE,
          summarize=lambda ctx, args: f"Say: {args['text']}")
    def t_say(ctx, text=""):
        return {}

    spec = AgentSpec(key="s", name="S", instructions="x", tools=("t_say",))
    res, store = run_write(FakeLLM(call(("c1", "t_say", {"text": "yo"}))), spec=spec)
    assert store.approvals[0]["summary"] == "Say: yo" and res.status == STATUS_WAITING


def test_two_write_calls_make_two_approvals(toolbox):
    llm = FakeLLM(call(("a", "t_post", {"text": "one"}), ("b", "t_post", {"text": "two"})))
    res, store = run_write(llm)
    assert res.approvals == [1, 2] and "2 actions" in res.text


def test_write_call_that_cannot_be_approved_is_reported_to_the_model(toolbox):
    @tool("t_nope", "Never allowed.", {"type": "object", "properties": {}}, risk=RISK_WRITE,
          summarize=lambda ctx, args: (_ for _ in ()).throw(ToolError("Access denied: not a member")))
    def t_nope(ctx):
        return {}

    spec = AgentSpec(key="s", name="S", instructions="x", tools=("t_nope",))
    llm = FakeLLM(call(("c1", "t_nope", {})), say("I cannot do that"))
    res, store = run_write(llm, spec=spec)
    assert res.ok and store.approvals == []
    assert json.loads(tool_messages(llm, 1)[0]["content"])["error"] == "Access denied: not a member"


def test_write_tool_in_a_dry_run_only_reports_what_it_would_do(toolbox, calls_log):
    llm = FakeLLM(call(("c1", "t_post", {"text": "hi"})), say("I would post it"))
    res, store = run_write(llm, dry=True)
    assert res.ok and calls_log == [] and store.approvals == []
    body = json.loads(tool_messages(llm, 1)[0]["content"])["untrusted_data"]
    assert body["dry_run"] is True and body["would_do"] == "Run t_post"


def test_write_tool_without_an_approver_is_refused(toolbox, calls_log):
    llm = FakeLLM(call(("c1", "t_post", {"text": "hi"})), say("sorry"))
    res, store = run_write(llm, approver=None)
    assert res.ok and calls_log == [] and store.approvals == []
    assert "nobody who can approve" in json.loads(tool_messages(llm, 1)[0]["content"])["error"]


def test_failing_to_store_the_approval_fails_the_run_without_acting(toolbox, calls_log):
    res, _ = run_write(FakeLLM(call(("c1", "t_post", {"text": "hi"}))), store=NullRunStore())
    assert res.status == STATUS_FAILED and res.error == "approval_unavailable" and calls_log == []


def test_admin_tools_are_refused(toolbox, calls_log):
    @tool("t_admin", "Admin.", {"type": "object", "properties": {}}, risk="admin")
    def t_admin(ctx):
        calls_log.append("admin")
        return {}

    spec = AgentSpec(key="s", name="S", instructions="x", tools=("t_admin",))
    llm = FakeLLM(call(("c1", "t_admin", {})), say("no"))
    res, store = run_write(llm, spec=spec)
    assert calls_log == [] and store.approvals == [] and res.ok
    assert "not available to agents" in json.loads(tool_messages(llm, 1)[0]["content"])["error"]


def test_repeated_identical_call_is_refused(toolbox, calls_log):
    llm = FakeLLM(call(("c1", "t_echo", {"text": "x"})), call(("c2", "t_echo", {"text": "x"})), say("ok"))
    run(llm)
    assert calls_log == [("t_echo", "x", 1)]                  # only once
    assert "already called" in json.loads(tool_messages(llm, 2)[1]["content"])["error"]


# ── limits and failure modes ────────────────────────────────────────────

def test_step_budget_forces_a_tool_free_final_answer(toolbox):
    spec = AgentSpec(key="t", name="T", instructions="x", tools=("t_echo",), max_steps=2)
    llm = FakeLLM(
        call(("c1", "t_echo", {"text": "a"})),
        call(("c2", "t_echo", {"text": "b"})),
        say("best effort answer"),
    )
    res, _ = run(llm, spec=spec)
    assert res.ok and res.text == "best effort answer"
    assert len(llm.requests) == 3
    assert llm.requests[2]["tools"] is None                   # forced final has no tools
    assert llm.requests[2]["messages"][-1]["role"] == "user"
    assert res.steps[-1]["result"].get("forced") is True


def test_llm_failure_marks_the_run_failed_with_a_user_message(toolbox):
    res, _ = run(FakeLLM(None))
    assert res.status == STATUS_FAILED and res.error == "llm_error"
    assert "try again" in res.text


def test_llm_failure_mid_run_after_tool_use(toolbox):
    res, _ = run(FakeLLM(call(("c1", "t_echo", {"text": "a"})), None))
    assert res.status == STATUS_FAILED and res.tool_calls == 1


def test_forced_final_failure_is_failed(toolbox):
    spec = AgentSpec(key="t", name="T", instructions="x", tools=("t_echo",), max_steps=1)
    res, _ = run(FakeLLM(call(("c1", "t_echo", {"text": "a"})), None), spec=spec)
    assert res.status == STATUS_FAILED


def test_unavailable_model(toolbox):
    store = MemoryRunStore()
    res = run_agent(SPEC, "hi", ctx=ToolContext(), model_choice=Choice(None, available=False), store=store)
    assert res.status == STATUS_UNAVAILABLE and res.text is None
    assert store.runs[0]["status"] == STATUS_UNAVAILABLE


def test_wall_clock_budget(toolbox, monkeypatch):
    monkeypatch.setenv("AGENT_RUN_TIMEOUT", "0")
    llm = FakeLLM(say("never reached"))
    res, _ = run(llm)
    assert res.status == STATUS_FAILED and res.error == "timeout"
    assert llm.requests == []


def test_spec_with_unknown_tool_names_still_runs(toolbox):
    spec = AgentSpec(key="t", name="T", instructions="x", tools=("t_echo", "does_not_exist"))
    llm = FakeLLM(say("ok"))
    res, _ = run(llm, spec=spec)
    assert res.ok
    assert [t["function"]["name"] for t in llm.requests[0]["tools"]] == ["t_echo"]


def test_agent_without_tools_sends_no_tool_schemas(toolbox):
    spec = AgentSpec(key="t", name="T", instructions="x", tools=())
    llm = FakeLLM(say("ok"))
    run(llm, spec=spec)
    assert not llm.requests[0]["tools"]


# ── persistence ─────────────────────────────────────────────────────────

def test_run_and_steps_are_recorded(toolbox):
    llm = FakeLLM(call(("c1", "t_echo", {"text": "a"})), say("done"))
    res, store = run(llm, message="please echo")
    assert len(store.runs) == 1
    run_row = store.runs[0]
    assert run_row["agent_key"] == "tester" and run_row["invoked_by"] == 7
    assert run_row["channel_id"] == 11 and run_row["input_text"] == "please echo"
    assert run_row["status"] == STATUS_SUCCEEDED and run_row["output_text"] == "done"
    assert run_row["step_count"] == len(res.steps) == len(store.steps)
    assert (run_row["tokens_in"], run_row["tokens_out"]) == (20, 10)
    kinds = [s["kind"] for s in store.steps]
    assert kinds == ["llm", "tool_call", "tool_result", "llm", "final"]
    tc = next(s for s in store.steps if s["kind"] == "tool_call")
    assert tc["tool_name"] == "t_echo" and tc["args"] == {"text": "a"}
    assert [s["step_no"] for s in store.steps] == [1, 2, 3, 4, 5]
    assert all(s["run_id"] == 1 for s in store.steps)


def test_each_run_gets_its_own_uuid(toolbox):
    a, _ = run(FakeLLM(say("a")))
    b, _ = run(FakeLLM(say("b")))
    assert a.run_uuid != b.run_uuid and len(a.run_uuid) == 36


def test_run_works_with_a_store_that_records_nothing(toolbox):
    res, _ = run(FakeLLM(call(("c1", "t_echo", {"text": "a"})), say("fine")), store=NullRunStore())
    assert res.ok and len(res.steps) == 5     # llm, tool_call, tool_result, llm, final


def test_humanize_can_be_disabled_per_spec(toolbox):
    spec = AgentSpec(key="t", name="T", instructions="x", tools=("t_echo",), humanize=False)
    llm = FakeLLM(say("ok"))
    run(llm, spec=spec)
    assert llm.requests[0]["humanize"] is False
