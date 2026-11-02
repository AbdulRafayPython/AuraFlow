"""
The agent loop
==============
One function, :func:`run_agent`, drives every agent:

    system prompt + user message
        └─► model ──► (answer)                      done
              └─► tool calls ─► run tools ─► results ─► model ─► ...

The model picks tools itself; the loop enforces the limits:

* at most ``spec.max_steps`` model calls, then one tool-free call that forces
  a final answer from what was gathered;
* a wall-clock budget (``AGENT_RUN_TIMEOUT`` seconds, default 60);
* arguments validated against each tool's schema, bad calls reported back to
  the model so it can correct itself;
* repeated identical calls refused;
* only ``read`` tools run inside the loop. A ``write`` tool call becomes an
  approval request and the run stops in ``waiting_approval``; nothing happens
  until the approver decides (see ``agents.runtime.approvals``). In a dry run
  (the builder's test chat) write tools just report what they would do.

Every run and step is recorded through a :class:`RunStore`. Nothing here
raises: failures come back as a :class:`RunResult` with a ``status``.
"""

from __future__ import annotations

import json
import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from agents.runtime import builtin_tools, legacy_tools, private_tools, write_tools  # noqa: F401  (registers the tools)
from agents.runtime.context import build_system_prompt, wrap_tool_result
from agents.runtime.specs import AgentSpec
from agents.runtime.store import RunStore, get_default_store
from agents.runtime.tools import (
    RISK_READ, RISK_WRITE, Tool, ToolContext, ToolError, is_private_run, resolve_tools, validate_arguments,
)

log = logging.getLogger(__name__)

STATUS_SUCCEEDED = "succeeded"
STATUS_FAILED = "failed"
STATUS_UNAVAILABLE = "unavailable"
STATUS_WAITING = "waiting_approval"

_FALLBACK_TEXT = "I could not finish that. Please try again in a moment."
_FORCE_FINAL = ("Stop using tools now. Answer the person using only what you have "
                "already gathered. If something is missing, say what.")


def _run_timeout() -> float:
    try:
        return float(os.getenv("AGENT_RUN_TIMEOUT") or 60)
    except ValueError:
        return 60.0


@dataclass
class RunResult:
    run_uuid: str
    status: str
    text: Optional[str] = None
    error: Optional[str] = None
    steps: List[Dict[str, Any]] = field(default_factory=list)
    tokens_in: int = 0
    tokens_out: int = 0
    tool_calls: int = 0
    tier: str = ""
    model: str = ""
    run_id: Optional[int] = None     # agent_runs.id when the run was recorded
    approvals: List[int] = field(default_factory=list)   # agent_approvals.id waiting on someone

    @property
    def ok(self) -> bool:
        return self.status == STATUS_SUCCEEDED


def run_agent(
    spec: AgentSpec,
    user_message: str,
    *,
    ctx: Optional[ToolContext] = None,
    history: Optional[List[Dict[str, Any]]] = None,
    model_choice: Any = None,
    store: Optional[RunStore] = None,
    trigger_type: str = "mention",
    agent_id: Optional[int] = None,
    trigger_message_id: Optional[int] = None,
) -> RunResult:
    """Run ``spec`` on ``user_message`` and return the outcome.

    ``history`` is optional earlier conversation in OpenAI message format.
    ``model_choice`` overrides the router (tests pass a fake); it needs a
    ``client`` with ``chat_tools``, plus ``available``, ``tier`` and ``model``.
    """
    ctx = ctx or ToolContext()
    ctx.agent_key = spec.key
    store = store if store is not None else get_default_store()
    run_uuid = str(uuid.uuid4())
    result = RunResult(run_uuid=run_uuid, status=STATUS_FAILED)

    if model_choice is None:
        from utils.ai.model_router import get_model
        model_choice = get_model(spec.model_tier)
    result.tier, result.model = model_choice.tier, model_choice.model

    ctx.run_id = store.start_run(
        run_uuid=run_uuid, agent_key=spec.key, trigger_type=trigger_type,
        input_text=user_message, community_id=ctx.community_id,
        channel_id=ctx.channel_id, invoked_by=ctx.invoked_by,
        is_dry_run=ctx.is_dry_run, agent_id=agent_id,
        trigger_message_id=trigger_message_id)
    result.run_id = ctx.run_id

    step_no = 0

    def record(kind: str, **kw: Any) -> None:
        nonlocal step_no
        step_no += 1
        entry = {"step_no": step_no, "kind": kind, **kw}
        result.steps.append(entry)
        store.add_step(ctx.run_id, step_no, kind, tool_name=kw.get("tool_name"),
                       args=kw.get("args"), result=kw.get("result"),
                       latency_ms=kw.get("latency_ms"))

    def finish(status: str, text: Optional[str] = None,
               error: Optional[str] = None) -> RunResult:
        result.status, result.text, result.error = status, text, error
        store.finish_run(ctx.run_id, status=status, output_text=text,
                         step_count=len(result.steps), tokens_in=result.tokens_in,
                         tokens_out=result.tokens_out, error=error)
        return result

    if not model_choice.available:
        return finish(STATUS_UNAVAILABLE, error="No LLM is configured.")

    tools: Dict[str, Tool] = {t.name: t for t in resolve_tools(spec.tools)
                              if not t.private_only or is_private_run(ctx)}
    tool_schemas = [t.to_openai() for t in tools.values()]
    system = build_system_prompt(spec, ctx)
    messages: List[Dict[str, Any]] = list(history or [])
    messages.append({"role": "user", "content": user_message})

    client = model_choice.client
    deadline = time.monotonic() + _run_timeout()
    seen_calls: set = set()
    pending: List[Any] = []          # (tool, args) of write calls waiting for approval

    def call_model(use_tools: bool):
        remaining = deadline - time.monotonic()
        if remaining <= 1:
            return None, "timeout"
        t0 = time.monotonic()
        # chat_tools humanizes only a prose answer, never a turn with tool calls.
        resp = client.chat_tools(
            messages, tool_schemas if use_tools else None, system=system,
            temperature=spec.temperature, timeout=min(remaining, 40.0),
            humanize=spec.humanize)
        latency = int((time.monotonic() - t0) * 1000)
        if resp is None:
            record("llm", result={"error": "no response"}, latency_ms=latency)
            return None, "llm_error"
        result.tokens_in += resp.prompt_tokens
        result.tokens_out += resp.completion_tokens
        record("llm", result={"finish_reason": resp.finish_reason, "usage": resp.usage,
                              "tool_calls": [c.name for c in resp.tool_calls]},
               latency_ms=latency)
        return resp, None

    for _ in range(max(1, spec.max_steps)):
        resp, err = call_model(use_tools=bool(tool_schemas))
        if resp is None:
            return finish(STATUS_FAILED, text=_FALLBACK_TEXT, error=err)

        if not resp.tool_calls:
            record("final", result={"chars": len(resp.text)})
            return finish(STATUS_SUCCEEDED, text=resp.text or _FALLBACK_TEXT)

        messages.append(resp.message)
        for call in resp.tool_calls:
            messages.append({
                "role": "tool", "tool_call_id": call.id,
                "content": _execute(call, tools, ctx, seen_calls, record, result, pending),
            })
        if pending:
            return _ask_for_approval(pending, ctx, store, result, record, finish)

    # Step budget used up: force an answer from what was gathered.
    messages.append({"role": "user", "content": _FORCE_FINAL})
    resp, err = call_model(use_tools=False)
    if resp is None or not resp.text:
        return finish(STATUS_FAILED, text=_FALLBACK_TEXT, error=err or "max_steps")
    record("final", result={"chars": len(resp.text), "forced": True})
    return finish(STATUS_SUCCEEDED, text=resp.text)


def _ask_for_approval(pending: List[Any], ctx: ToolContext, store: RunStore,
                      result: RunResult, record: Any, finish: Any) -> RunResult:
    """Store one approval per pending write call and end the run until someone decides."""
    for tool, args in pending:
        try:
            summary = tool.describe(ctx, args)
        except ToolError as exc:
            record("approval", tool_name=tool.name, args=args,
                   result={"status": "not_requested", "error": str(exc)})
            continue
        approval_id = store.create_approval(
            ctx.run_id, tool_name=tool.name, args=args, summary=summary,
            approver_id=ctx.approver_id)
        record("approval", tool_name=tool.name, args=args,
               result={"status": "pending" if approval_id else "not_requested",
                       "approval_id": approval_id, "summary": summary})
        if approval_id:
            result.approvals.append(approval_id)

    if not result.approvals:
        return finish(STATUS_FAILED, text="I could not ask for approval, so I did nothing.",
                      error="approval_unavailable")
    n = len(result.approvals)
    # The channel only learns that approval is needed; what exactly is shown to the approver.
    text = ("I need your approval before I do that. Approve or reject it in the card below, or under Agents."
            if n == 1 else f"I need your approval for {n} actions. Approve or reject them in the cards below, or under Agents.")
    return finish(STATUS_WAITING, text=text)


def _execute(call: Any, tools: Dict[str, Tool], ctx: ToolContext, seen: set,
             record: Any, result: RunResult, pending: List[Any]) -> str:
    """Run one tool call and return the string for its ``role="tool"`` message."""
    name = call.name
    result.tool_calls += 1

    def refuse(reason: str) -> str:
        record("tool_call", tool_name=name, args=call.arguments)
        record("tool_result", tool_name=name, result={"error": reason})
        return wrap_tool_result(name, error=reason)

    if call.error:
        return refuse(call.error)
    tool = tools.get(name)
    if tool is None:
        return refuse(f"unknown tool '{name}'. Available: {', '.join(tools) or 'none'}")

    args, problems = validate_arguments(tool.parameters, call.arguments)
    if problems:
        return refuse("; ".join(problems))

    if tool.risk not in (RISK_READ, RISK_WRITE):
        return refuse(f"'{name}' is not available to agents. Tell the person you cannot do that.")

    key = (name, json.dumps(args, sort_keys=True, default=str))
    if key in seen:
        return refuse("you already called this tool with the same arguments; "
                      "use the earlier result.")
    seen.add(key)

    if tool.risk == RISK_WRITE:
        try:
            summary = tool.describe(ctx, args)
        except ToolError as exc:
            return refuse(str(exc))
        record("tool_call", tool_name=name, args=args)
        if ctx.is_dry_run:
            note = {"dry_run": True, "would_do": summary,
                    "note": "Test mode: nothing was done. In a live run the person must approve it first."}
            record("tool_result", tool_name=name, result=note)
            return wrap_tool_result(name, note)
        if not ctx.approver_id:
            return refuse("there is nobody who can approve this action, so it cannot be done.")
        pending.append((tool, args))
        note = {"status": "awaiting_approval",
                "note": "Sent to the person for approval. Do not tell them it is done."}
        record("tool_result", tool_name=name, result=note)
        return wrap_tool_result(name, note)

    record("tool_call", tool_name=name, args=args)
    t0 = time.monotonic()
    try:
        value = tool.func(ctx, **args)
        latency = int((time.monotonic() - t0) * 1000)
        record("tool_result", tool_name=name, result=value, latency_ms=latency)
        return wrap_tool_result(name, value)
    except ToolError as exc:
        record("tool_result", tool_name=name, result={"error": str(exc)},
               latency_ms=int((time.monotonic() - t0) * 1000))
        return wrap_tool_result(name, error=str(exc))
    except Exception as exc:  # noqa: BLE001
        log.exception("[RUNTIME] tool %s crashed", name)
        record("tool_result", tool_name=name,
               result={"error": f"{type(exc).__name__}: {exc}"},
               latency_ms=int((time.monotonic() - t0) * 1000))
        return wrap_tool_result(name, error="the tool failed unexpectedly")
