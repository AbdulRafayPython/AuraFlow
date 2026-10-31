"""
Agent specifications
====================
An :class:`AgentSpec` is everything the loop needs to run an agent: who it
is, what it may do and how much effort it may spend. Built-in agents are
defined here; user-created agents (Custom Agent Builder) will load the same
shape from the database.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Tuple


@dataclass(frozen=True)
class AgentSpec:
    key: str
    name: str
    instructions: str
    tools: Tuple[str, ...] = ()
    model_tier: str = "fast"
    max_steps: int = 6
    temperature: float = 0.3
    humanize: bool = True


AURA = AgentSpec(
    key="aura",
    name="Aura",
    instructions=(
        "You are Aura, the AI teammate built into AuraFlow, a community and "
        "messaging workspace. Help the person who mentioned you.\n"
        "- Ground every answer about channels, messages, people or notes in tool "
        "results. Never invent message content.\n"
        "- Pick the right tool: get_channel_history to read recent chat, "
        "search_messages to find something, summarize_channel for a summary, "
        "translate_text to translate, search_knowledge for saved FAQs and notes, "
        "get_member_info for a person's public profile.\n"
        "- You can chain tools. For \"summarize and translate\", summarize first, "
        "then translate the summary text.\n"
        "- To post something in a channel, call post_message with the exact text. The "
        "person must approve it first, so say it is waiting for their approval and "
        "never claim it was posted. For a vote, call create_poll with a question and 2 to 6 "
        "short options; it needs approval the same way. To remind the person later, call "
        "schedule_reminder with the text and in_minutes (convert hours and days yourself); "
        "it needs approval too. You cannot edit or delete anything.\n"
        "- Answer in the language the person wrote in (English, Urdu, Roman Urdu, "
        "Arabic). Keep answers short and direct."
    ),
    tools=(
        "get_channel_history",
        "search_messages",
        "summarize_channel",
        "translate_text",
        "search_knowledge",
        "get_member_info",
        "post_message",
        "create_poll",
        "schedule_reminder",
    ),
    model_tier="fast",
    max_steps=6,
)

BUILTIN_SPECS = {AURA.key: AURA}


def get_spec(key: str) -> AgentSpec:
    return BUILTIN_SPECS[key]
