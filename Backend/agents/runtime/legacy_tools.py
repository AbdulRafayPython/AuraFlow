"""
Tools backed by the original built-in agents
============================================
The first eleven agents (translator, focus, engagement, moderation...) keep doing
the work; these tools let any runtime agent, including user-made ones, use that
work.  Each tool checks access exactly like the matching REST route.

Not here on purpose: tools that read a person's own DMs or mood. They live in
``private_tools`` and are offered only when the answer is a DM to that person.

Importing this module registers the tools in ``TOOL_REGISTRY``.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from agents.runtime import permissions
from agents.runtime.tools import RISK_READ, RISK_WRITE, ToolContext, ToolError, tool

ENGAGEMENT_KINDS = ("icebreaker", "poll", "challenge", "starter")
ICEBREAKER_CATEGORIES = ("quick_questions", "games", "team_building", "creative")


def _need_user(ctx: ToolContext) -> int:
    if not ctx.invoked_by:
        raise ToolError("No user is associated with this run, so private data cannot be read.")
    return int(ctx.invoked_by)


def _channel(ctx: ToolContext, channel_id: Optional[int]) -> int:
    cid = channel_id or ctx.channel_id
    if not cid:
        raise ToolError("channel_id is required because there is no current channel.")
    if not permissions.can_read_channel(_need_user(ctx), int(cid)):
        raise ToolError("Access denied: the person who asked is not a member of that channel.")
    return int(cid)


# ── detect_language ─────────────────────────────────────────────────────

@tool(
    "detect_language",
    "Find out which language a piece of text is written in (English, Urdu, Roman Urdu, Arabic, "
    "and others). Returns an ISO code, a confidence and whether it is romanized Urdu.",
    {"type": "object",
     "properties": {"text": {"type": "string", "minLength": 1, "maxLength": 2000}},
     "required": ["text"]},
    risk=RISK_READ,
)
def detect_language(ctx: ToolContext, text: str) -> Dict[str, Any]:
    from agents.translator import TranslatorAgent  # lazy
    result = TranslatorAgent().detect_language(text) or {}
    return {"language": result.get("language") or "en",
            "confidence": result.get("confidence", 0.0),
            "romanized": bool(result.get("romanized"))}


# ── suggest_quick_replies ───────────────────────────────────────────────

@tool(
    "suggest_quick_replies",
    "Suggest up to 5 short reply options (chips) for a message. They are suggestions for a "
    "person to pick from; nothing is posted.",
    {"type": "object",
     "properties": {
         "message": {"type": "string", "minLength": 1, "maxLength": 1000},
         "max_suggestions": {"type": "integer", "minimum": 1, "maximum": 5, "description": "Default 3."}},
     "required": ["message"]},
    risk=RISK_READ,
)
def suggest_quick_replies(ctx: ToolContext, message: str, max_suggestions: int = 3) -> Dict[str, Any]:
    from agents.auto_message import AutoMessageAgent  # lazy
    result = AutoMessageAgent().quick_replies(message, max_suggestions=int(max_suggestions)) or {}
    return {"intent": result.get("intent", "general"), "suggestions": list(result.get("suggestions") or [])}


# ── get_focus_score ─────────────────────────────────────────────────────

@tool(
    "get_focus_score",
    "Measure how focused the recent conversation in a channel is: a 0 to 1 score, a level "
    "(high, medium, low), the main topics and how often the topic shifted. Needs at least "
    "5 messages in the time window.",
    {"type": "object",
     "properties": {
         "channel_id": {"type": "integer", "description": "Defaults to the current channel."},
         "hours": {"type": "integer", "minimum": 1, "maximum": 72, "description": "Look back this many hours (default 1)."}}},
    risk=RISK_READ,
)
def get_focus_score(ctx: ToolContext, channel_id: Optional[int] = None, hours: int = 1) -> Dict[str, Any]:
    cid = _channel(ctx, channel_id)
    from agents.focus import FocusAgent  # lazy
    result = FocusAgent().analyze_focus(cid, int(hours), user_id=ctx.invoked_by) or {}
    if not result.get("success"):
        raise ToolError(result.get("error") or "The focus score is not available for this channel.")
    return {"channel_id": cid, "focus_score": result.get("focus_score"), "focus_level": result.get("focus_level"),
            "dominant_topics": result.get("dominant_topics") or [], "topic_shifts": result.get("topic_shifts"),
            "message_count": result.get("message_count"), "participant_count": result.get("participant_count"),
            "recommendation": result.get("recommendation")}


# ── get_engagement_ideas ────────────────────────────────────────────────

@tool(
    "get_engagement_ideas",
    "Get a ready-made idea to liven up a quiet channel: an icebreaker activity, a quick poll, a "
    "fun challenge or conversation starters. To use the idea, post it or turn a poll into a real "
    "one with create_poll.",
    {"type": "object",
     "properties": {
         "kind": {"type": "string", "enum": list(ENGAGEMENT_KINDS)},
         "category": {"type": "string", "description": "Optional. Icebreaker: quick_questions, games, "
                      "team_building, creative. Starters: general (default). Default: random."}},
     "required": ["kind"]},
    risk=RISK_READ,
)
def get_engagement_ideas(ctx: ToolContext, kind: str, category: str = "random") -> Dict[str, Any]:
    if kind not in ENGAGEMENT_KINDS:
        raise ToolError(f"kind must be one of {', '.join(ENGAGEMENT_KINDS)}.")
    from agents.engagement import EngagementAgent  # lazy
    agent = EngagementAgent()
    category = (category or "random").strip().lower()
    if kind == "icebreaker":
        result = agent.get_icebreaker_activity(category)
        key = "activity"
    elif kind == "poll":
        result = agent.get_quick_poll(category)
        key = "poll"
    elif kind == "challenge":
        result = agent.get_fun_challenge(category)
        key = "challenge"
    else:
        result = agent.get_conversation_starter_by_category(category if category != "random" else "general")
        key = "starters"
    if not (result or {}).get("success"):
        raise ToolError((result or {}).get("error") or "No idea is available for that category.")
    idea = result.get(key)
    if kind == "starter":
        idea = list(idea or [])[:5]
    return {"kind": kind, "category": result.get("category", category), "idea": idea}


# ── check_message_safety ────────────────────────────────────────────────

@tool(
    "check_message_safety",
    "Check a piece of text against the community's safety rules without taking any action: "
    "would it be blocked (extreme content), does it look like spam or a scam, or does it contain "
    "personal information such as a phone number. It does not warn, delete or report anyone.",
    {"type": "object",
     "properties": {"text": {"type": "string", "minLength": 1, "maxLength": 2000}},
     "required": ["text"]},
    risk=RISK_READ,
)
def check_message_safety(ctx: ToolContext, text: str) -> Dict[str, Any]:
    from agents.moderation import ModerationAgent  # lazy
    # No user or channel is passed on purpose: that skips the per-user spam counters, so a check
    # never changes anyone's standing.
    raw = ModerationAgent().instant_check(text) or {}
    return {"would_block": bool(raw.get("block")),
            "looks_like_scam": bool(raw.get("flag")),
            "contains_personal_info": bool(raw.get("flag_personal_info")),
            "personal_info_types": list(raw.get("personal_info_types") or []),
            "reason": raw.get("reason") or ""}


# ── extract_knowledge (write, needs approval) ───────────────────────────

MAX_KNOWLEDGE_HOURS = 24 * 30


def _knowledge_args(hours: Any) -> Optional[int]:
    if hours is None:
        return None
    if isinstance(hours, bool) or not isinstance(hours, int) or not 1 <= hours <= MAX_KNOWLEDGE_HOURS:
        raise ToolError(f"hours must be a whole number from 1 to {MAX_KNOWLEDGE_HOURS} (30 days).")
    return hours


def _summarize_extract(ctx: ToolContext, args: Dict[str, Any]) -> str:
    cid = _channel(ctx, args.get("channel_id"))
    hours = _knowledge_args(args.get("hours"))
    channel = permissions.channel_info(cid) or {}
    window = f"the last {hours} hours" if hours else "its whole history"
    return f"Save FAQs, definitions and decisions found in #{channel.get('name', cid)} ({window}) to the knowledge base"[:500]


@tool(
    "extract_knowledge",
    "Read a channel and save the FAQs, definitions and decisions found in it to the community "
    "knowledge base, so search_knowledge can find them later. The person must approve it first. "
    "Defaults to the current channel and its recent history.",
    {"type": "object",
     "properties": {
         "channel_id": {"type": "integer", "description": "Defaults to the current channel."},
         "hours": {"type": "integer", "minimum": 1, "maximum": MAX_KNOWLEDGE_HOURS,
                   "description": "Only messages from the last N hours (default: all)."}}},
    risk=RISK_WRITE,
    summarize=_summarize_extract,
)
def extract_knowledge(ctx: ToolContext, channel_id: Optional[int] = None, hours: Optional[int] = None) -> Dict[str, Any]:
    cid = _channel(ctx, channel_id)
    window = _knowledge_args(hours)
    from agents.knowledge_builder_v2 import KnowledgeBuilderAgent  # lazy
    result = KnowledgeBuilderAgent().extract_knowledge(
        cid, window, community_id=ctx.community_id) or {}
    if not result.get("success"):
        raise ToolError(result.get("error") or result.get("message") or "Nothing could be extracted from this channel.")
    return {"channel_id": cid, "saved": result.get("total_items", 0),
            "message": result.get("message") or f"Saved {result.get('total_items', 0)} items."}


# ── community knowledge and info ────────────────────────────────────────

_support_agent: Any = None


def _support() -> Any:
    """One shared Support agent, so its per-community search index is built once, not on every call."""
    global _support_agent
    if _support_agent is None:
        from agents.support import SupportAgent  # lazy
        _support_agent = SupportAgent()
    return _support_agent


def _community(ctx: ToolContext) -> int:
    """The community this run belongs to, after checking that the person asking is in it."""
    if not ctx.community_id:
        raise ToolError("This agent is not part of a community, so there is no community to look at.")
    if not permissions._exists(
            "SELECT 1 FROM community_members WHERE community_id = %s AND user_id = %s LIMIT 1",
            (int(ctx.community_id), _need_user(ctx))):
        raise ToolError("Access denied: the person who asked is not a member of this community.")
    return int(ctx.community_id)


def _visible_to(ctx: ToolContext, hits: list) -> list:
    """Keep only passages saved from channels the person asking belongs to (or from no channel).

    The community-wide index covers every channel, so a private channel's FAQ must not reach
    someone who is not in it. Same rule as search_knowledge.
    """
    ids = [int(h["id"]) for h in hits if h.get("id") is not None]
    if not ids:
        return []
    from agents.runtime.builtin_tools import _query
    marks = ", ".join(["%s"] * len(ids))
    rows = _query(
        f"SELECT id FROM knowledge_base WHERE id IN ({marks}) AND (related_channel IS NULL OR related_channel IN "
        "(SELECT channel_id FROM channel_members WHERE user_id = %s))",
        tuple(ids) + (_need_user(ctx),))
    allowed = {int(r["id"]) for r in rows}
    return [h for h in hits if h.get("id") is not None and int(h["id"]) in allowed]


@tool(
    "search_community_knowledge",
    "Search the community's shared knowledge base (FAQs, definitions and decisions saved from its "
    "channels) for passages that answer a question. Returns the best passages with a relevance score, "
    "best first. Answer only from them, and say so when none answers the question.",
    {"type": "object",
     "properties": {
         "question": {"type": "string", "minLength": 3, "maxLength": 300},
         "limit": {"type": "integer", "minimum": 1, "maximum": 5, "description": "Default 3."}},
     "required": ["question"]},
    risk=RISK_READ,
)
def search_community_knowledge(ctx: ToolContext, question: str, limit: int = 3) -> Dict[str, Any]:
    community_id = _community(ctx)
    from agents._settings import get_community_settings  # lazy
    from agents import support as support_module
    cfg = get_community_settings(community_id, "support", support_module._SUPPORT_DEFAULTS)
    agent = _support()
    if not support_module._SKLEARN_AVAILABLE:
        raise ToolError("Knowledge search is not available on this server.")
    try:
        hits = agent._top_matches(
            question, community_id,
            min_cosine=support_module._resolve_min_cosine(cfg.get("min_score", 2)),
            max_docs=int(cfg.get("max_docs", 500) or 500), k=max(1, min(int(limit), 5)))
    except Exception as exc:  # noqa: BLE001
        raise ToolError("Knowledge search failed. Try again in a moment.") from exc
    hits = _visible_to(ctx, hits)
    show_sources = bool(cfg.get("show_sources", True))
    return {
        "question": question, "count": len(hits),
        "passages": [{"title": h.get("title"), "text": support_module._readable_snippet(h.get("content"))[:800],
                      "category": h.get("category") if show_sources else None, "score": h.get("score")}
                     for h in hits],
    }


@tool(
    "get_community_info",
    "Read the basics of the community this agent works in: its name, what it is about, how many "
    "members it has and its text channels. Use it to write a welcome or to point people to the right channel.",
    {"type": "object", "properties": {}},
    risk=RISK_READ,
)
def get_community_info(ctx: ToolContext) -> Dict[str, Any]:
    community_id = _community(ctx)
    from agents.runtime.builtin_tools import _clip, _query
    rows = _query("SELECT name, description, member_count FROM communities WHERE id = %s", (community_id,))
    if not rows:
        raise ToolError("That community does not exist.")
    channels = _query("SELECT name FROM channels WHERE community_id = %s AND type <> 'voice' ORDER BY id LIMIT 20",
                      (community_id,))
    row = rows[0]
    return {"name": row.get("name"), "description": _clip(row.get("description"), 400),
            "member_count": row.get("member_count"), "channels": [c["name"] for c in channels]}
