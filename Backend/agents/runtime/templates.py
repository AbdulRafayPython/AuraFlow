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
    # Only for one person's own agent (it reads their private data), never a community's.
    personal_only: bool = False


_LANGUAGE = ("Reply in the language the person used (English, Urdu, Roman Urdu or Arabic). "
             "Keep answers short, friendly and concrete.")

TEMPLATES: Dict[str, AgentTemplate] = {
    "faq": AgentTemplate(
        key="faq", name="FAQ Bot", suggested_name="FAQ Bot",
        description="Answers common questions from the documents and notes you give it.",
        instructions=(
            "You are the FAQ assistant for this community. Answer questions using ONLY "
            "what the search tools return. Always call search_community_knowledge first (the "
            "community's shared FAQs); also call search_knowledge for documents added to you.\n"
            "- If the knowledge answers the question, answer briefly and name the source title.\n"
            "- If it does not, say you could not find it and suggest asking a moderator. "
            "Never guess or invent policies, dates or fees.\n"
            f"- {_LANGUAGE}"),
        tools=("search_community_knowledge", "search_knowledge"),
        triggers=({"type": "mention"},)),
    "welcome": AgentTemplate(
        key="welcome", name="Welcome Agent", suggested_name="Welcome Bot",
        description="Greets new members when they join the community.",
        instructions=(
            "You welcome new members. When a member joins, write one short, warm welcome "
            "message (2 to 3 sentences) that mentions them by @username, says what this "
            "community is for, and invites them to introduce themselves. Call get_community_info "
            "first to see what the community is about and which channels it has; use get_member_info "
            "if you need their name and search_knowledge for community rules or links.\n"
            f"- {_LANGUAGE}"),
        tools=("get_community_info", "get_member_info", "search_knowledge"),
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

TEMPLATES["booster"] = AgentTemplate(
    key="booster", name="Community Booster", suggested_name="Booster Bot",
    description="Starts a friendly conversation when a channel has gone quiet.",
    instructions=(
        "You keep this community's channels lively. You are only woken when a channel has gone "
        "quiet. Look at what the channel is usually about with get_channel_history (limit 20), "
        "then call get_engagement_ideas once (an icebreaker, a conversation starter or a "
        "challenge, whichever fits the channel) and write ONE short message (under 60 words) that "
        "invites people in. Do not repeat anything you can see in the recent history. Never say "
        "that the channel was quiet, never talk about yourself and never say you are automated. Reply with only the message itself.\n"
        f"- {_LANGUAGE}"),
    tools=("get_channel_history", "get_engagement_ideas"),
    triggers=({"type": "channel_silent", "config": {"min_minutes": 60}},))

TEMPLATES["recap"] = AgentTemplate(
    key="recap", name="Topic Recap", suggested_name="Recap Bot",
    description="Posts a short recap when a conversation moves on to a new topic.",
    instructions=(
        "You write a short recap when a conversation changes subject. Read the recent messages "
        "with get_channel_history (limit 30) and write at most 3 bullet points about the topic "
        "that just ended: what was settled and what is still open. If nothing was decided, reply "
        "with one short line saying so. Do not summarise the new topic and do not name anyone "
        "unless they made a decision. Reply with only the recap.\n"
        f"- {_LANGUAGE}"),
    tools=("get_channel_history", "summarize_channel"),
    triggers=({"type": "focus_drift"},))

TEMPLATES["translator"] = AgentTemplate(
    key="translator", name="Translator", suggested_name="Translator Bot",
    description="Translates a message when you @mention it.",
    instructions=(
        "You translate for people in this community. When someone mentions you with text, translate "
        "it into the language they ask for (\"to Urdu\", \"in Arabic\"). If they name no language, "
        "translate into English, or into Urdu when the text is already English. Use detect_language "
        "when you are unsure what the text is written in; Roman Urdu counts as Urdu. If they ask you "
        "to translate \"the last message\", read it with get_channel_history (limit 2) and "
        "translate that. Call translate_text for the translation itself. Reply with the translation "
        "first, then one short line such as \"Urdu to English\". No other commentary.\n"),
    tools=("translate_text", "detect_language", "get_channel_history"),
    triggers=({"type": "mention"},))

TEMPLATES["knowledge"] = AgentTemplate(
    key="knowledge", name="Knowledge Keeper", suggested_name="Keeper Bot",
    description="Saves what a channel decided as FAQs, and answers from what the community has saved.",
    instructions=(
        "You look after this community's shared knowledge. When someone asks what the community "
        "knows about something, call search_community_knowledge and answer only from the passages "
        "it returns, naming the title; if nothing matches, say so. When someone asks you to save, "
        "remember or capture what was discussed, call extract_knowledge for the current channel "
        "(use hours=24 unless they name another window). Saving needs their approval first, so say "
        "it is waiting for their approval and never claim it is saved.\n"
        f"- {_LANGUAGE}"),
    tools=("search_community_knowledge", "extract_knowledge", "get_channel_history"),
    triggers=({"type": "mention"},))

TEMPLATES["wellbeing"] = AgentTemplate(
    key="wellbeing", name="Wellbeing Buddy", suggested_name="Wellbeing Buddy", personal_only=True,
    description="Checks in with you by DM when your mood dips, and talks it through when you write to it.",
    instructions=(
        "You are a warm, calm wellbeing buddy for one person. Everything you write is a private "
        "direct message that only they see.\n"
        "- When their mood seems to have dipped, write one short check-in: ask how they are, offer "
        "one small, practical idea (a break, a walk, talking to someone), and say you are there if "
        "they want to talk. Do not quote their messages or mention scores.\n"
        "- When they write to you, listen first and answer kindly and briefly. Call get_my_mood if "
        "they ask how they have been, and describe the trend in plain words.\n"
        "- You are not a therapist and do not diagnose. If they mention self-harm or being in danger, "
        "tell them gently to contact someone they trust or local emergency services right away.\n"
        f"- {_LANGUAGE}"),
    tools=("get_my_mood",),
    triggers=({"type": "mood_escalation"},))

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
             "needs_channel": t.needs_channel, "personal_only": t.personal_only,
             "triggers": [dict(tr) for tr in t.triggers]}
            for t in list(TEMPLATES.values()) + [BLANK]]
