"""
"Describe your agent in words"
==============================
Turns a plain-language description into a *draft* agent configuration the user
reviews and edits in the builder. It never saves anything.

The model's output is treated as untrusted: it is cut down to what the builder
would accept (known read-only tools, valid trigger types, bounded lengths) and
anything dropped is reported in ``notes``.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List

from agents.runtime.builder import (
    MAX_DESCRIPTION, MAX_INSTRUCTIONS, MAX_KEYWORDS, MAX_KEYWORD_CHARS, MAX_NAME,
    MAX_TOOLS, allowed_tool_names, tool_catalog)

MAX_PROMPT_CHARS = 1500


class GenerationUnavailable(Exception):
    """No LLM is configured, or it returned nothing usable."""


def _system_prompt() -> str:
    tools = "\n".join(f"- {t['name']}: {t['description']}" for t in tool_catalog())
    return (
        "You design AI agents for a community chat app (channels, members, @mentions). "
        "From the user's description, return ONE JSON object with these keys:\n"
        '  "name": short agent name (max 40 characters)\n'
        '  "description": one sentence for the member list\n'
        '  "instructions": the agent\'s system prompt, written to the agent in second person '
        "(\"You are ...\"), concrete about what to do and what NOT to do, under 1200 characters\n"
        '  "tools": list of tool names the agent needs, chosen ONLY from this list:\n'
        f"{tools}\n"
        '  "triggers": list of objects {"type": ..., "config": {...}}. type is "mention" (answers when '
        '@mentioned, the default), "keyword" (config {"keywords": ["fees", ...]}), or "member_joined".\n'
        "Prefer \"mention\" unless the user clearly wants something else. Give the agent only the tools it "
        "needs. Never invent tool names."
    )


def generate_draft(prompt: str, *, client: Any = None) -> Dict[str, Any]:
    """Return ``{"draft": {...}, "notes": [...]}``. Raises GenerationUnavailable."""
    prompt = (prompt or "").strip()[:MAX_PROMPT_CHARS]
    if len(prompt) < 5:
        raise ValueError("Describe the agent in at least a few words.")

    if client is None:
        from utils.ai.model_router import get_model
        choice = get_model("fast")
        if not choice.available:
            raise GenerationUnavailable("The AI service is not configured.")
        client = choice.client

    raw = client.complete_json(prompt, system=_system_prompt(), temperature=0.3, max_tokens=900, timeout=30)
    if not isinstance(raw, dict):
        raise GenerationUnavailable("The AI service did not return a usable draft. Try rephrasing.")
    return sanitize_draft(raw)


def sanitize_draft(raw: Dict[str, Any]) -> Dict[str, Any]:
    notes: List[str] = []
    name = str(raw.get("name") or "").strip()[:MAX_NAME]
    if len(name) < 2:
        name = "My Agent"
        notes.append("The model gave no usable name; please pick one.")

    known = set(allowed_tool_names())
    tools: List[str] = []
    for t in raw.get("tools") if isinstance(raw.get("tools"), list) else []:
        if t in known and t not in tools and len(tools) < MAX_TOOLS:
            tools.append(t)
        else:
            notes.append(f"Dropped unknown or duplicate tool '{t}'.")

    triggers: List[Dict[str, Any]] = []
    for trig in raw.get("triggers") if isinstance(raw.get("triggers"), list) else []:
        ttype = trig.get("type") if isinstance(trig, dict) else None
        if ttype == "mention":
            triggers.append({"type": "mention"})
        elif ttype == "member_joined":
            triggers.append({"type": "member_joined"})
        elif ttype == "keyword":
            kws = (trig.get("config") or {}).get("keywords")
            kws = [k.strip() for k in kws if isinstance(k, str) and 1 <= len(k.strip()) <= MAX_KEYWORD_CHARS] \
                if isinstance(kws, list) else []
            if kws:
                triggers.append({"type": "keyword", "config": {"keywords": kws[:MAX_KEYWORDS]}})
            else:
                notes.append("Dropped a keyword trigger without keywords.")
        else:
            notes.append(f"Dropped trigger '{ttype}': schedules and channel triggers are set up by hand.")
    if not triggers:
        triggers = [{"type": "mention"}]
        notes.append("Added a mention trigger so people can talk to the agent.")

    instructions = str(raw.get("instructions") or "").strip()[:MAX_INSTRUCTIONS]
    if len(instructions) < 10:
        instructions = f"You are {name}, a helpful assistant for this community."
        notes.append("The model gave no instructions; a generic one was used.")

    return {
        "draft": {"name": name, "description": str(raw.get("description") or "").strip()[:MAX_DESCRIPTION],
                  "instructions": instructions, "tools": tools, "triggers": triggers},
        "notes": notes,
    }
