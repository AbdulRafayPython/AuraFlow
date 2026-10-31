"""
Agent runtime v2
================
A generic tool-calling loop that every agent (built-in or user-created) runs
on. See ``docs/PHASE1_AGENT_PLATFORM_PLAN.md``.

    from agents.runtime import run_agent, AURA, ToolContext
    result = run_agent(AURA, "summarize #general and translate to Urdu",
                       ctx=ToolContext(invoked_by=2, community_id=1, channel_id=1))
    print(result.text)

Imports are kept lazy so importing the package stays cheap.
"""

from agents.runtime.specs import AgentSpec, AURA, BUILTIN_SPECS, get_spec
from agents.runtime.tools import (
    TOOL_REGISTRY, Tool, ToolContext, ToolError, tool,
    RISK_READ, RISK_WRITE, RISK_ADMIN,
)


def run_agent(*args, **kwargs):
    from agents.runtime.loop import run_agent as _run
    return _run(*args, **kwargs)


__all__ = [
    "run_agent", "AgentSpec", "AURA", "BUILTIN_SPECS", "get_spec",
    "TOOL_REGISTRY", "Tool", "ToolContext", "ToolError", "tool",
    "RISK_READ", "RISK_WRITE", "RISK_ADMIN",
]
