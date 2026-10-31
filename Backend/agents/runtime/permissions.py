"""
Access checks used by tools
===========================
A tool acts for the *person who invoked the agent*, never with the agent's own
authority. Every read tool therefore checks the invoker's membership here, the
same way the REST routes do.
"""

from __future__ import annotations

from typing import Optional

from database import get_db_connection


def _exists(sql: str, params: tuple) -> bool:
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchone() is not None
    finally:
        conn.close()


def can_read_channel(user_id: Optional[int], channel_id: Optional[int]) -> bool:
    if not user_id or not channel_id:
        return False
    return _exists(
        "SELECT 1 FROM channel_members WHERE channel_id = %s AND user_id = %s LIMIT 1",
        (channel_id, user_id),
    )


def share_a_community(user_a: Optional[int], user_b: Optional[int]) -> bool:
    if not user_a or not user_b:
        return False
    return _exists(
        "SELECT 1 FROM community_members a "
        "JOIN community_members b ON a.community_id = b.community_id "
        "WHERE a.user_id = %s AND b.user_id = %s LIMIT 1",
        (user_a, user_b),
    )


def channel_info(channel_id: Optional[int]) -> Optional[dict]:
    """``{"id", "name", "community_id", "type"}`` for a channel, or None."""
    if not channel_id:
        return None
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name, community_id, type FROM channels WHERE id = %s", (channel_id,))
            return cur.fetchone()
    finally:
        conn.close()


def agent_may_act_in_channel(defn, channel: Optional[dict]) -> bool:
    """A community agent stays inside its community (and inside its channel
    allow-list when it has one); a personal agent has no extra limit here."""
    if channel is None:
        return False
    if defn is None:
        return True
    if defn.community_id is not None and channel.get("community_id") != defn.community_id:
        return False
    allow = defn.channel_allowlist
    return not allow or channel["id"] in allow
