# ============================================================================
# services/reaction_cache.py — In-process reaction cache
#
# Provides a thread-safe, TTL-based cache for reaction aggregations so that
# the hot path (read reactions for N messages) never touches MySQL unless
# the cache is cold or stale.
#
# Architecture:
#   Write path:  toggle_reaction() → DB write → invalidate cache → rebuild
#   Read path:   get_reactions()   → cache hit (fast) / cache miss → DB
#
# This eliminates the N+1 problem (1 API call per message on page load)
# and the double-hit problem (toggle + re-fetch).
# ============================================================================

import threading
import time
import logging
from database import get_db_connection

log = logging.getLogger(__name__)

# ── Cache storage ───────────────────────────────────────────────────────
# Key: ("msg", message_id) or ("dm", dm_id)
# Value: { "data": [...grouped reactions...], "ts": timestamp }
_cache: dict = {}
_lock = threading.Lock()

CACHE_TTL = 120  # seconds — stale entries auto-expire


def _cache_key(msg_type: str, msg_id: int) -> tuple:
    return (msg_type, msg_id)


def _is_fresh(entry: dict) -> bool:
    return (time.time() - entry["ts"]) < CACHE_TTL


# ── Public API ──────────────────────────────────────────────────────────

def get_reactions(msg_type: str, msg_id: int, current_username: str) -> list:
    """
    Return grouped reactions for a message.
    Fast path: serve from cache.  Slow path: query DB, populate cache.
    """
    key = _cache_key(msg_type, msg_id)
    with _lock:
        entry = _cache.get(key)
        if entry and _is_fresh(entry):
            # Clone and stamp current-user flag (cache stores raw rows)
            return _stamp_current_user(entry["data"], current_username)

    # Cache miss — load from DB
    rows = _load_from_db(msg_type, msg_id)
    with _lock:
        _cache[key] = {"data": rows, "ts": time.time()}
    return _stamp_current_user(rows, current_username)


def get_reactions_bulk(msg_type: str, msg_ids: list, current_username: str) -> dict:
    """
    Batch-fetch reactions for multiple messages in one call.
    Returns { msg_id: [grouped reactions], ... }
    """
    result = {}
    missing_ids = []

    with _lock:
        for mid in msg_ids:
            key = _cache_key(msg_type, mid)
            entry = _cache.get(key)
            if entry and _is_fresh(entry):
                result[mid] = _stamp_current_user(entry["data"], current_username)
            else:
                missing_ids.append(mid)

    if missing_ids:
        bulk = _load_bulk_from_db(msg_type, missing_ids)
        with _lock:
            now = time.time()
            for mid in missing_ids:
                rows = bulk.get(mid, [])
                _cache[_cache_key(msg_type, mid)] = {"data": rows, "ts": now}
                result[mid] = _stamp_current_user(rows, current_username)

    return result


def invalidate(msg_type: str, msg_id: int):
    """Remove a cache entry so the next read rebuilds from DB."""
    key = _cache_key(msg_type, msg_id)
    with _lock:
        _cache.pop(key, None)


def toggle_reaction(msg_type: str, msg_id: int, user_id: int, emoji: str,
                    username: str) -> dict:
    """
    Idempotent add/remove.  Returns { "action": "added"|"removed",
    "reactions": [...aggregated...] } in one round trip.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            if msg_type == "msg":
                table = "message_reactions"
                col = "message_id"
            else:
                table = "direct_message_reactions"
                col = "direct_message_id"

            # Check existence
            cur.execute(
                f"SELECT id FROM {table} WHERE {col} = %s AND user_id = %s AND emoji = %s",
                (msg_id, user_id, emoji),
            )
            exists = cur.fetchone()

            if exists:
                cur.execute(
                    f"DELETE FROM {table} WHERE {col} = %s AND user_id = %s AND emoji = %s",
                    (msg_id, user_id, emoji),
                )
                action = "removed"
            else:
                cur.execute(
                    f"INSERT INTO {table} ({col}, user_id, emoji) VALUES (%s, %s, %s)",
                    (msg_id, user_id, emoji),
                )
                action = "added"

            conn.commit()

            # Rebuild aggregation from DB within same connection
            rows = _query_reactions(cur, msg_type, msg_id)

    finally:
        conn.close()

    # Update cache
    with _lock:
        _cache[_cache_key(msg_type, msg_id)] = {"data": rows, "ts": time.time()}

    return {
        "action": action,
        "reactions": _stamp_current_user(rows, username),
    }


# ── Internal helpers ────────────────────────────────────────────────────

def _stamp_current_user(rows: list, username: str) -> list:
    """Add the per-viewer `reacted_by_current_user` flag to cached data."""
    out = []
    for group in rows:
        out.append({
            **group,
            "reacted_by_current_user": any(
                u["username"] == username for u in group["users"]
            ),
        })
    return out


def _query_reactions(cur, msg_type: str, msg_id: int) -> list:
    """Run the aggregation query on an existing cursor."""
    if msg_type == "msg":
        cur.execute("""
            SELECT mr.emoji, mr.user_id, u.username, u.display_name, u.avatar_url
            FROM message_reactions mr
            JOIN users u ON mr.user_id = u.id
            WHERE mr.message_id = %s
            ORDER BY mr.created_at ASC
        """, (msg_id,))
    else:
        cur.execute("""
            SELECT dmr.emoji, dmr.user_id, u.username, u.display_name, u.avatar_url
            FROM direct_message_reactions dmr
            JOIN users u ON dmr.user_id = u.id
            WHERE dmr.direct_message_id = %s
            ORDER BY dmr.created_at ASC
        """, (msg_id,))
    return _group_rows(cur.fetchall())


def _load_from_db(msg_type: str, msg_id: int) -> list:
    """Single-message load (cache miss)."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            return _query_reactions(cur, msg_type, msg_id)
    finally:
        conn.close()


def _load_bulk_from_db(msg_type: str, msg_ids: list) -> dict:
    """
    Multi-message load in ONE query — eliminates N+1.
    Returns { msg_id: [grouped], ... }
    """
    if not msg_ids:
        return {}

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            placeholders = ",".join(["%s"] * len(msg_ids))
            if msg_type == "msg":
                cur.execute(f"""
                    SELECT mr.message_id AS msg_id, mr.emoji,
                           mr.user_id, u.username, u.display_name, u.avatar_url
                    FROM message_reactions mr
                    JOIN users u ON mr.user_id = u.id
                    WHERE mr.message_id IN ({placeholders})
                    ORDER BY mr.message_id, mr.created_at ASC
                """, tuple(msg_ids))
            else:
                cur.execute(f"""
                    SELECT dmr.direct_message_id AS msg_id, dmr.emoji,
                           dmr.user_id, u.username, u.display_name, u.avatar_url
                    FROM direct_message_reactions dmr
                    JOIN users u ON dmr.user_id = u.id
                    WHERE dmr.direct_message_id IN ({placeholders})
                    ORDER BY dmr.direct_message_id, dmr.created_at ASC
                """, tuple(msg_ids))

            all_rows = cur.fetchall()
    finally:
        conn.close()

    # Group by msg_id, then by emoji
    per_msg: dict = {}
    for row in all_rows:
        mid = row["msg_id"]
        per_msg.setdefault(mid, []).append(row)

    result = {}
    for mid in msg_ids:
        result[mid] = _group_rows(per_msg.get(mid, []))
    return result


def _group_rows(rows: list) -> list:
    """Group flat rows into the { emoji, count, users } shape."""
    grouped: dict = {}
    for r in rows:
        emoji = r["emoji"]
        if emoji not in grouped:
            grouped[emoji] = {"emoji": emoji, "count": 0, "users": []}
        grouped[emoji]["count"] += 1
        grouped[emoji]["users"].append({
            "user_id": r["user_id"],
            "username": r["username"],
            "display_name": r["display_name"],
            "avatar_url": r.get("avatar_url"),
        })
    return list(grouped.values())


# ── Periodic cache cleanup (evict stale entries) ───────────────────────
def cleanup_cache():
    """Remove expired entries. Call from a background thread."""
    now = time.time()
    with _lock:
        stale = [k for k, v in _cache.items() if (now - v["ts"]) > CACHE_TTL * 2]
        for k in stale:
            del _cache[k]
    if stale:
        log.debug(f"[REACTION_CACHE] Evicted {len(stale)} stale entries")
