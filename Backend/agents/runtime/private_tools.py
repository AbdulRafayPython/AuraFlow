"""
Private tools
=============
Tools that read the asker's own private data: how their mood has been, and what was said in
their DMs. They are ``private_only``: the loop offers them only in a run whose answer goes to
that same person (a DM from the agent, or Aura's Ask box), and each tool checks that again
itself. They only ever read the data of ``ctx.invoked_by``, never anyone else's.

Importing this module registers the tools in ``TOOL_REGISTRY``.
"""

from __future__ import annotations

from collections import Counter
from typing import Any, Dict, List, Optional

from agents.runtime.tools import RISK_READ, ToolContext, ToolError, is_private_run, tool
from database import get_db_connection

MAX_MOOD_DAYS = 30
MIN_MOOD_ENTRIES = 3
TREND_STEP = 0.15           # change in average sentiment that counts as better / worse


def _asker(ctx: ToolContext) -> int:
    if not is_private_run(ctx):
        raise ToolError("This tool only works in a private conversation with the person it is about.")
    if not ctx.invoked_by:
        raise ToolError("No user is associated with this run, so private data cannot be read.")
    return int(ctx.invoked_by)


def _query(sql: str, params: tuple) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return list(cur.fetchall() or [])
    finally:
        conn.close()


# ── get_my_mood ─────────────────────────────────────────────────────────

def _trend(scores: List[float]) -> str:
    half = len(scores) // 2
    if half == 0:
        return "steady"
    before = sum(scores[:half]) / half
    after = sum(scores[half:]) / (len(scores) - half)
    if after - before >= TREND_STEP:
        return "improving"
    if before - after >= TREND_STEP:
        return "declining"
    return "steady"


def mood_summary(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Aggregate mood rows (oldest first) into a trend. Never includes message text."""
    moods = Counter(str(r.get("mood") or "neutral").lower() for r in rows)
    scores = [float(r["sentiment_score"]) for r in rows if r.get("sentiment_score") is not None]
    return {
        "entries": len(rows),
        "dominant_mood": moods.most_common(1)[0][0] if moods else None,
        "top_moods": [m for m, _ in moods.most_common(3)],
        "average_sentiment": round(sum(scores) / len(scores), 2) if scores else None,
        "trend": _trend(scores),
    }


@tool(
    "get_my_mood",
    "How the person you are talking to has been feeling lately, from their own mood tracking: "
    "the main moods, an average sentiment from -1 (very negative) to 1 (very positive) and whether "
    "it is improving, steady or declining. Only their own mood, only if they turned on mood "
    "tracking, and only in a private conversation with them. Never includes their messages.",
    {"type": "object",
     "properties": {"days": {"type": "integer", "minimum": 1, "maximum": MAX_MOOD_DAYS,
                             "description": "Look back this many days (default 7)."}}},
    risk=RISK_READ,
    private_only=True,
)
def get_my_mood(ctx: ToolContext, days: int = 7) -> Dict[str, Any]:
    user_id = _asker(ctx)
    days = max(1, min(int(days or 7), MAX_MOOD_DAYS))
    if not _query("SELECT 1 FROM user_agents WHERE user_id = %s AND agent_type = 'mood' AND enabled = TRUE",
                  (user_id,)):
        return {"tracking": False,
                "note": "They have not turned on mood tracking, so there is nothing to read. Do not guess."}
    rows = _query("SELECT mood, sentiment_score FROM user_moods WHERE user_id = %s "
                  "AND created_at >= NOW() - INTERVAL %s DAY ORDER BY created_at", (user_id, days))
    if len(rows) < MIN_MOOD_ENTRIES:
        return {"tracking": True, "days": days, "entries": len(rows),
                "note": "Too little to say how they have been. Ask them instead."}
    return {"tracking": True, "days": days, **mood_summary(rows)}


# ── summarize_dm ────────────────────────────────────────────────────────

@tool(
    "summarize_dm",
    "Summarize the direct-message conversation between the person you are talking to and one of "
    "their friends: a short summary, key points and action items. Only their own DMs, only in a "
    "private conversation with them.",
    {"type": "object",
     "properties": {
         "username": {"type": "string", "description": "The friend's username, without @."},
         "message_count": {"type": "integer", "minimum": 10, "maximum": 200,
                           "description": "How many recent messages to read (default 100)."}},
     "required": ["username"]},
    risk=RISK_READ,
    private_only=True,
)
def summarize_dm(ctx: ToolContext, username: str, message_count: int = 100) -> Dict[str, Any]:
    user_id = _asker(ctx)
    name = (username or "").strip().lstrip("@")
    peers = _query("SELECT id, username, display_name FROM users WHERE username = %s", (name,)) if name else []
    if not peers:
        raise ToolError(f"There is no member called @{name}.")
    peer = peers[0]
    if peer["id"] == user_id:
        raise ToolError("That is the person you are talking to; name the friend whose DMs to summarize.")
    # Same rule as the "Catch me up" button: DMs with friends only.
    if not _query("SELECT 1 FROM friends WHERE (user_id = %s AND friend_id = %s) "
                  "OR (user_id = %s AND friend_id = %s) LIMIT 1", (user_id, peer["id"], peer["id"], user_id)):
        raise ToolError(f"@{name} is not one of their friends, so there is no DM to summarize.")
    from agents.summarizer import SummarizerAgent  # lazy
    result = SummarizerAgent().summarize_dm(peer_user_id=peer["id"], requester_user_id=user_id,
                                            message_count=max(10, min(int(message_count or 100), 200)))
    if not result or not result.get("success"):
        raise ToolError((result or {}).get("error") or "There are not enough messages to summarize yet.")
    return {"with": peer["display_name"] or peer["username"], "summary": result.get("summary"),
            "key_points": result.get("key_points") or [], "action_items": result.get("action_items") or [],
            "message_count": result.get("message_count")}
