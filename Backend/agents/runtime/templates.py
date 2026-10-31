"""
Agent templates
===============
Starting points for the Agent Builder. A template provides the instructions,
tools and triggers; the user adjusts them. Templates only use read tools (the
agent's final answer is what gets posted), so every one is safe to run
unattended.

``needs_channel`` templates have a ``schedule`` trigger that can only be
created once the user picks the channel to post in.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Tuple


@dataclass(frozen=True)
class AgentTemplate:
    key: str
    name: str
    description: str
    suggested_name: str
    instructions: str
    tools: Tuple[str, ...]
    triggers: Tuple[Dict[str, Any], ...]
    needs_channel: bool = False
    model_tier: str = "fast"


_LANGUAGE = ("Reply in the language the person used (English, Urdu, Roman Urdu or Arabic). "
             "Keep answers short, friendly and concrete.")

TEMPLATES: Dict[str, AgentTemplate] = {
    "faq": AgentTemplate(
        key="faq", name="FAQ Bot", suggested_name="FAQ Bot",
        description="Answers common questions from the documents and notes you give it.",
        instructions=(
            "You are the FAQ assistant for this community. Answer questions using ONLY the "
            "knowledge returned by the search_knowledge tool. Always call search_knowledge "
            "first.\n"
            "- If the knowledge answers the question, answer briefly and name the source title.\n"
            "- If it does not, say you could not find it and suggest asking a moderator. "
            "Never guess or invent policies, dates or fees.\n"
            f"- {_LANGUAGE}"),
        tools=("search_knowledge",),
        triggers=({"type": "mention"},)),
    "welcome": AgentTemplate(
        key="welcome", name="Welcome Agent", suggested_name="Welcome Bot",
        description="Greets new members when they join the community.",
        instructions=(
            "You welcome new members. When a member joins, write one short, warm welcome "
            "message (2 to 3 sentences) that mentions them by @username, says what this "
            "community is for, and invites them to introduce themselves. Use get_member_info "
            "if you need their name and search_knowledge for community rules or links.\n"
            f"- {_LANGUAGE}"),
        tools=("get_member_info", "search_knowledge"),
        triggers=({"type": "member_joined"},)),
    "digest": AgentTemplate(
        key="digest", name="Weekly Digest", suggested_name="Digest Bot",
        description="Posts a weekly summary of a channel every Friday evening.",
        instructions=(
            "You write the weekly digest for a channel. Read the last 7 days with "
            "get_channel_history (hours=168, limit=100) and post at most 8 bullet points: "
            "decisions made, open questions, upcoming dates, and who helped most. Skip small "
            "talk. If the week was quiet, say so in one line.\n"
            f"- {_LANGUAGE}"),
        tools=("get_channel_history", "summarize_channel", "translate_text"),
        triggers=({"type": "schedule", "config": {
            "cron": "0 17 * * 5", "tz": "UTC",
            "prompt": "Write this week's digest for the channel."}},),
        needs_channel=True),
    "standup": AgentTemplate(
        key="standup", name="Standup Agent", suggested_name="Standup Bot",
        description="Starts a daily standup thread on weekday mornings.",
        instructions=(
            "You run the daily standup. Look at yesterday's activity with get_channel_history "
            "(hours=24) and post a short good-morning message (under 120 words): one line on "
            "what happened yesterday, then ask the three standup questions (what did you do, "
            "what will you do today, anything blocking?).\n"
            f"- {_LANGUAGE}"),
        tools=("get_channel_history",),
        triggers=({"type": "schedule", "config": {
            "cron": "0 10 * * 1-5", "tz": "UTC",
            "prompt": "Post today's standup message."}}, {"type": "mention"}),
        needs_channel=True),
}

BLANK = AgentTemplate(
    key="blank", name="Blank agent", suggested_name="My Agent",
    description="Start from scratch.",
    instructions="You are a helpful assistant for this community. " + _LANGUAGE,
    tools=(), triggers=({"type": "mention"},))


def get_template(key: str) -> AgentTemplate:
    if key == "blank":
        return BLANK
    return TEMPLATES[key]


def list_templates() -> List[Dict[str, Any]]:
    return [{"key": t.key, "name": t.name, "description": t.description,
             "suggested_name": t.suggested_name, "instructions": t.instructions,
             "tools": list(t.tools), "model_tier": t.model_tier,
             "needs_channel": t.needs_channel,
             "triggers": [dict(tr) for tr in t.triggers]}
            for t in list(TEMPLATES.values()) + [BLANK]]
