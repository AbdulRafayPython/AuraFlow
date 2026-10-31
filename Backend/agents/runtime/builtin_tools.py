"""
Built-in read tools
===================
The first tools the runtime ships with. Each one acts for the person who
invoked the agent (``ctx.invoked_by``) and checks that person's access before
touching data, exactly like the matching REST routes.

Importing this module registers the tools in ``TOOL_REGISTRY``.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from agents.runtime import permissions
from agents.runtime.tools import ToolContext, ToolError, tool, RISK_READ
from database import get_db_connection
from utils import encryption

_CONTENT_LIMIT = 500


def _iso(value: Any) -> Optional[str]:
    return value.isoformat() if isinstance(value, datetime) else (str(value) if value else None)


def _clip(text: Any, limit: int = _CONTENT_LIMIT) -> str:
    s = str(text or "")
    return s if len(s) <= limit else s[: limit - 1] + "…"


def _query(sql: str, params: tuple) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return list(cur.fetchall() or [])
    finally:
        conn.close()


def _need_user(ctx: ToolContext) -> int:
    if not ctx.invoked_by:
        raise ToolError("No user is associated with this run, so private data cannot be read.")
    return int(ctx.invoked_by)


def _resolve_channel(ctx: ToolContext, channel_id: Optional[int]) -> int:
    cid = channel_id or ctx.channel_id
    if not cid:
        raise ToolError("channel_id is required because there is no current channel.")
    return int(cid)


def _require_channel_access(ctx: ToolContext, channel_id: int) -> int:
    user_id = _need_user(ctx)
    if not permissions.can_read_channel(user_id, channel_id):
        raise ToolError("Access denied: the person who asked is not a member of that channel.")
    return user_id


def _like(term: str) -> str:
    return "%" + term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


# ── get_channel_history ─────────────────────────────────────────────────

@tool(
    "get_channel_history",
    "Read the most recent messages of a channel, oldest first. Use it to see what "
    "was discussed. Defaults to the current channel.",
    {
        "type": "object",
        "properties": {
            "channel_id": {"type": "integer", "description": "Channel to read; defaults to the current one."},
            "limit": {"type": "integer", "minimum": 1, "maximum": 100, "description": "How many messages (default 30)."},
            "hours": {"type": "integer", "minimum": 1, "maximum": 720, "description": "Only messages from the last N hours."},
        },
    },
    risk=RISK_READ,
)
def get_channel_history(ctx: ToolContext, channel_id: Optional[int] = None,
                        limit: int = 30, hours: Optional[int] = None) -> Dict[str, Any]:
    cid = _resolve_channel(ctx, channel_id)
    _require_channel_access(ctx, cid)
    sql = (
        "SELECT m.id, m.content, m.created_at, u.username, u.display_name, m.bot_name "
        "FROM messages m JOIN users u ON u.id = m.sender_id "
        "WHERE m.channel_id = %s AND m.moderation_flagged = 0 "
        "AND m.message_type IN ('text', 'ai') "
    )
    params: List[Any] = [cid]
    if hours:
        sql += "AND m.created_at >= DATE_SUB(NOW(), INTERVAL %s HOUR) "
        params.append(int(hours))
    sql += "ORDER BY m.id DESC LIMIT %s"
    params.append(int(limit))
    rows = _query(sql, tuple(params))
    rows.reverse()
    return {
        "channel_id": cid,
        "count": len(rows),
        "messages": [
            {"id": r["id"], "author": r.get("bot_name") or r.get("display_name") or r["username"],
             "content": _clip(encryption.decrypt(r["content"] or "")), "at": _iso(r["created_at"])}
            for r in rows
        ],
    }


# ── search_messages ─────────────────────────────────────────────────────

@tool(
    "search_messages",
    "Find messages containing some text, newest first. Searches one channel if "
    "channel_id is given, otherwise every channel the person can read in the current community.",
    {
        "type": "object",
        "properties": {
            "query": {"type": "string", "minLength": 2, "maxLength": 100, "description": "Text to look for."},
            "channel_id": {"type": "integer"},
            "limit": {"type": "integer", "minimum": 1, "maximum": 20, "description": "Default 10."},
        },
        "required": ["query"],
    },
    risk=RISK_READ,
)
def search_messages(ctx: ToolContext, query: str, channel_id: Optional[int] = None,
                    limit: int = 10) -> Dict[str, Any]:
    user_id = _need_user(ctx)
    sql = (
        "SELECT m.id, m.channel_id, c.name AS channel_name, m.content, m.created_at, "
        "u.username, u.display_name "
        "FROM messages m "
        "JOIN users u ON u.id = m.sender_id "
        "JOIN channels c ON c.id = m.channel_id "
        "JOIN channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = %s "
        "WHERE m.moderation_flagged = 0 AND m.message_type IN ('text', 'ai') "
    )
    params: List[Any] = [user_id]
    # With ENCRYPTION_KEY set the database holds ciphertext, so LIKE cannot match;
    # fetch recent rows and filter after decrypting instead.
    encrypted = encryption.is_enabled()
    if not encrypted:
        sql += "AND m.content LIKE %s "
        params.append(_like(query.strip()))
    if channel_id:
        sql += "AND m.channel_id = %s "
        params.append(int(channel_id))
    elif ctx.community_id:
        sql += "AND c.community_id = %s "
        params.append(int(ctx.community_id))
    sql += "ORDER BY m.id DESC LIMIT %s"
    params.append(400 if encrypted else int(limit))
    rows = _query(sql, tuple(params))
    if encrypted:
        needle = query.strip().lower()
        for r in rows:
            r["content"] = encryption.decrypt(r["content"] or "")
        rows = [r for r in rows if needle in r["content"].lower()][: int(limit)]
    else:
        for r in rows:
            r["content"] = encryption.decrypt(r["content"] or "")
    return {
        "query": query,
        "count": len(rows),
        "matches": [
            {"id": r["id"], "channel_id": r["channel_id"], "channel": r["channel_name"],
             "author": r.get("display_name") or r["username"],
             "content": _clip(r["content"]), "at": _iso(r["created_at"])}
            for r in rows
        ],
    }


# ── summarize_channel ───────────────────────────────────────────────────

@tool(
    "summarize_channel",
    "Summarize recent discussion in a channel: returns a summary, key points and "
    "action items. Defaults to the current channel. Note: like the Summarize button, "
    "this also saves the summary to the channel's summary history.",
    {
        "type": "object",
        "properties": {
            "channel_id": {"type": "integer"},
            "message_count": {"type": "integer", "minimum": 10, "maximum": 200, "description": "How many recent messages to cover (default 100)."},
        },
    },
    risk=RISK_READ,
)
def summarize_channel(ctx: ToolContext, channel_id: Optional[int] = None,
                      message_count: int = 100) -> Dict[str, Any]:
    cid = _resolve_channel(ctx, channel_id)
    user_id = _require_channel_access(ctx, cid)
    from agents.summarizer import SummarizerAgent  # heavy import, keep lazy
    result = SummarizerAgent().summarize_channel(
        channel_id=cid, message_count=int(message_count), user_id=user_id)
    if not result.get("success"):
        raise ToolError(result.get("error") or "Could not summarize this channel.")
    return {
        "channel_id": cid,
        "message_count": result.get("message_count"),
        "summary": result.get("summary"),
        "key_points": result.get("key_points") or [],
        "action_items": result.get("action_items") or [],
        "participants": result.get("participants") or [],
    }


# ── translate_text ──────────────────────────────────────────────────────

@tool(
    "translate_text",
    "Translate text into another language. Use ISO codes such as en, ur, ar, hi, fr.",
    {
        "type": "object",
        "properties": {
            "text": {"type": "string", "minLength": 1, "maxLength": 2000},
            "target_language": {"type": "string", "minLength": 2, "maxLength": 10},
            "source_language": {"type": "string", "description": "Default 'auto'."},
        },
        "required": ["text", "target_language"],
    },
    risk=RISK_READ,
)
def translate_text(ctx: ToolContext, text: str, target_language: str,
                   source_language: str = "auto") -> Dict[str, Any]:
    from agents.translator import TranslatorAgent  # lazy
    result = TranslatorAgent().translate(
        text=text, target_language=target_language,
        source_language=source_language, user_id=ctx.invoked_by)
    translated = (result or {}).get("translated_text")
    if not translated:
        raise ToolError("Translation is unavailable right now.")
    return {
        "translated_text": translated,
        "source_language": result.get("source_language"),
        "target_language": result.get("target_language"),
        "provider": result.get("provider"),
    }


# ── search_knowledge ────────────────────────────────────────────────────

@tool(
    "search_knowledge",
    "Search the saved knowledge base (FAQs, definitions, decisions extracted from "
    "channels) for entries matching a question or keywords.",
    {
        "type": "object",
        "properties": {
            "query": {"type": "string", "minLength": 3, "maxLength": 200},
            "limit": {"type": "integer", "minimum": 1, "maximum": 10, "description": "Default 5."},
        },
        "required": ["query"],
    },
    risk=RISK_READ,
)
def search_knowledge(ctx: ToolContext, query: str, limit: int = 5) -> Dict[str, Any]:
    user_id = _need_user(ctx)
    # A user-created agent answers from its own documents only; the built-in agent
    # searches the community knowledge base below.
    if ctx.extra.get("agent_id") and not ctx.extra.get("builtin"):
        from agents.runtime import knowledge
        if not knowledge.search_terms(query):
            raise ToolError("Give at least one keyword.")
        hits = knowledge.search(int(ctx.extra["agent_id"]), query, int(limit))
        return {"query": query, "count": len(hits),
                "entries": [{"id": h["id"], "title": h["title"], "content": h["content"],
                             "source": "agent knowledge"} for h in hits]}
    terms = list(dict.fromkeys(re.findall(r"\w{3,}", query.lower())))[:6]
    if not terms:
        raise ToolError("Give at least one keyword of 3 or more letters.")
    clauses = " OR ".join(["LOWER(title) LIKE %s OR LOWER(content) LIKE %s"] * len(terms))
    params: List[Any] = []
    for t in terms:
        params += [_like(t), _like(t)]
    sql = (
        "SELECT id, title, content, source, related_channel FROM knowledge_base "
        f"WHERE ({clauses}) AND (related_channel IS NULL OR related_channel IN "
        "(SELECT channel_id FROM channel_members WHERE user_id = %s)) LIMIT 50"
    )
    rows = _query(sql, tuple(params + [user_id]))

    def score(r: Dict[str, Any]) -> int:
        title, content = (r["title"] or "").lower(), (r["content"] or "").lower()
        return sum((2 if t in title else 0) + (1 if t in content else 0) for t in terms)

    rows.sort(key=score, reverse=True)
    return {
        "query": query,
        "count": min(len(rows), int(limit)),
        "entries": [
            {"id": r["id"], "title": r["title"], "content": _clip(r["content"], 600),
             "source": r.get("source")}
            for r in rows[: int(limit)]
        ],
    }


# ── get_member_info ─────────────────────────────────────────────────────

@tool(
    "get_member_info",
    "Look up a member's public profile (display name, bio, status, role in the "
    "current community) by username. Only people who share a community with the requester.",
    {
        "type": "object",
        "properties": {"username": {"type": "string", "minLength": 1, "maxLength": 100}},
        "required": ["username"],
    },
    risk=RISK_READ,
)
def get_member_info(ctx: ToolContext, username: str) -> Dict[str, Any]:
    user_id = _need_user(ctx)
    name = username.strip().lstrip("@")
    rows = _query(
        "SELECT id, username, display_name, bio, status, custom_status "
        "FROM users WHERE username = %s AND account_status = 'active' LIMIT 1",
        (name,),
    )
    # Same message for "no such user" and "not visible": do not reveal which.
    if not rows or not permissions.share_a_community(user_id, rows[0]["id"]):
        raise ToolError("No visible member with that username.")
    u = rows[0]
    info: Dict[str, Any] = {
        "username": u["username"], "display_name": u["display_name"],
        "bio": _clip(u["bio"], 300), "status": u["status"],
        "custom_status": u["custom_status"],
    }
    if ctx.community_id:
        role = _query(
            "SELECT role FROM community_members WHERE community_id = %s AND user_id = %s",
            (int(ctx.community_id), u["id"]),
        )
        if role:
            info["community_role"] = role[0]["role"]
    return info
