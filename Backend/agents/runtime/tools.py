"""
Tool registry for the agent runtime
===================================
A *tool* is a plain Python function the model may call. Each one declares a
name, a description, a JSON-schema for its arguments and a risk level:

``read``   no side effects on shared state; runs immediately.
``write``  changes something users can see (post, poll, reminder).
``admin``  moderation-grade actions.

The loop runs ``read`` tools immediately. A ``write`` tool never runs inside the
loop: the call becomes an approval request (``agents.runtime.approvals``) and
runs only after the approver says yes. ``admin`` tools are refused for now.

Tool functions have the signature ``func(ctx: ToolContext, **arguments)`` and
return a JSON-serialisable value. They raise :class:`ToolError` for problems
the model can act on (bad channel, no access); any other exception is logged
and reported to the model as a generic failure.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

log = logging.getLogger(__name__)

RISK_READ = "read"
RISK_WRITE = "write"
RISK_ADMIN = "admin"
RISKS = (RISK_READ, RISK_WRITE, RISK_ADMIN)


class ToolError(Exception):
    """A failure whose message is safe and useful to show to the model."""


@dataclass
class ToolContext:
    """Who is calling and where. Tools must authorise against this."""
    agent_key: str = ""
    invoked_by: Optional[int] = None      # users.id of the human who triggered the run
    community_id: Optional[int] = None
    channel_id: Optional[int] = None
    run_id: Optional[int] = None
    is_dry_run: bool = False
    approver_id: Optional[int] = None     # who decides write-tool approvals (invoker, else the owner)
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    parameters: Dict[str, Any]
    risk: str
    func: Callable[..., Any]
    # Write tools: ``summarize(ctx, args)`` returns the sentence the approver reads
    # ("Post a message in #general: ..."). It may raise ToolError for a request that
    # could never be approved (no access, unknown channel).
    summarize: Optional[Callable[[ToolContext, Dict[str, Any]], str]] = None
    # Reads the asker's private data (their mood, their DMs): offered only when the answer is
    # a DM to that same person, never in a run that posts in a channel.
    private_only: bool = False

    def describe(self, ctx: ToolContext, args: Dict[str, Any]) -> str:
        return self.summarize(ctx, args) if self.summarize else f"Run {self.name}"

    def to_openai(self) -> Dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


TOOL_REGISTRY: Dict[str, Tool] = {}


def tool(name: str, description: str,
         parameters: Optional[Dict[str, Any]] = None,
         risk: str = RISK_READ,
         summarize: Optional[Callable[[ToolContext, Dict[str, Any]], str]] = None,
         private_only: bool = False,
         ) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Register ``func`` as a tool. Usable as a decorator."""
    if risk not in RISKS:
        raise ValueError(f"unknown risk {risk!r}")
    schema = parameters or {"type": "object", "properties": {}}

    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        TOOL_REGISTRY[name] = Tool(name=name, description=description,
                                   parameters=schema, risk=risk, func=func,
                                   summarize=summarize, private_only=private_only)
        return func

    return decorator


def is_private_run(ctx: Optional["ToolContext"]) -> bool:
    """The answer of this run goes only to the person who asked (a DM or the Ask box)."""
    return bool(ctx and ctx.extra.get("private"))


def resolve_tools(names: Iterable[str]) -> List[Tool]:
    """Registered tools for ``names``, in order; unknown names are skipped."""
    out: List[Tool] = []
    for n in names:
        t = TOOL_REGISTRY.get(n)
        if t is None:
            log.warning("[RUNTIME] unknown tool %r requested by an agent spec", n)
            continue
        out.append(t)
    return out


# ── Argument validation ─────────────────────────────────────────────────

def _coerce(value: Any, typ: str) -> Tuple[Any, Optional[str]]:
    """Return (value, error). Accepts numeric/boolean strings the model may send."""
    if typ == "string":
        return (value, None) if isinstance(value, str) else (value, "must be a string")
    if typ == "integer":
        if isinstance(value, bool):
            return value, "must be an integer"
        if isinstance(value, int):
            return value, None
        if isinstance(value, float) and value.is_integer():
            return int(value), None
        if isinstance(value, str):
            try:
                return int(value.strip()), None
            except ValueError:
                pass
        return value, "must be an integer"
    if typ == "number":
        if isinstance(value, bool):
            return value, "must be a number"
        if isinstance(value, (int, float)):
            return value, None
        if isinstance(value, str):
            try:
                return float(value.strip()), None
            except ValueError:
                pass
        return value, "must be a number"
    if typ == "boolean":
        if isinstance(value, bool):
            return value, None
        if isinstance(value, str) and value.strip().lower() in ("true", "false"):
            return value.strip().lower() == "true", None
        return value, "must be true or false"
    if typ == "array":
        return (value, None) if isinstance(value, list) else (value, "must be an array")
    if typ == "object":
        return (value, None) if isinstance(value, dict) else (value, "must be an object")
    return value, None


def validate_arguments(schema: Dict[str, Any],
                       args: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    """Check ``args`` against a small JSON-schema subset.

    Supports ``type``, ``enum``, ``minimum``/``maximum``, ``minLength``/
    ``maxLength``, ``required`` and unknown-property rejection. Returns the
    (lightly coerced) arguments and a list of human-readable errors.
    """
    props: Dict[str, Any] = schema.get("properties") or {}
    errors: List[str] = []
    cleaned: Dict[str, Any] = {}

    for key in schema.get("required") or []:
        if key not in args:
            errors.append(f"missing required argument '{key}'")

    for key, value in args.items():
        spec = props.get(key)
        if spec is None:
            errors.append(f"unexpected argument '{key}'")
            continue
        typ = spec.get("type")
        if typ:
            value, err = _coerce(value, typ)
            if err:
                errors.append(f"'{key}' {err}")
                continue
        if "enum" in spec and value not in spec["enum"]:
            errors.append(f"'{key}' must be one of {spec['enum']}")
            continue
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            if "minimum" in spec and value < spec["minimum"]:
                errors.append(f"'{key}' must be >= {spec['minimum']}")
                continue
            if "maximum" in spec and value > spec["maximum"]:
                errors.append(f"'{key}' must be <= {spec['maximum']}")
                continue
        if isinstance(value, str):
            if "minLength" in spec and len(value) < spec["minLength"]:
                errors.append(f"'{key}' must be at least {spec['minLength']} characters")
                continue
            if "maxLength" in spec and len(value) > spec["maxLength"]:
                errors.append(f"'{key}' must be at most {spec['maxLength']} characters")
                continue
        cleaned[key] = value

    return cleaned, errors
