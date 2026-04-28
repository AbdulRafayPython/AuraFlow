# services/unread_tracker.py — In-memory unread message counter with DB persistence
"""
Unread Tracker Service
======================
Tracks unread counts per user per channel and per community.
Uses in-memory dict for fast reads, persists to DB periodically.
Designed for horizontal scalability (can swap to Redis later).
"""
import threading
import time
import logging
from collections import defaultdict
from database import get_db_connection

log = logging.getLogger(__name__)

# In-memory stores
# channel_unread: { user_id: { channel_id: count } }
_channel_unread = defaultdict(lambda: defaultdict(int))
# community_unread: { user_id: { community_id: count } }
_community_unread = defaultdict(lambda: defaultdict(int))
# dm_unread: { user_id: { other_user_id: count } }
_dm_unread = defaultdict(lambda: defaultdict(int))

_lock = threading.Lock()
_socketio = None
_dirty_users = set()  # Users whose counts need DB sync

# Channel -> Community mapping cache
_channel_community_map = {}


def init(socketio_instance):
    """Initialize the unread tracker and start the persistence thread."""
    global _socketio
    _socketio = socketio_instance
    
    # Start periodic persistence thread
    t = threading.Thread(target=_persistence_loop, daemon=True, name="UnreadPersistThread")
    t.start()
    log.info("[UNREAD] Tracker service started")


def load_user_unreads(user_id):
    """Load unread counts for a user from DB (called on login/reconnect)."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # ── Seed channel_read_status for channels that have no entry yet ────
            # FIX 4: Replaced two correlated subqueries with derived-table JOINs.
            # The original query ran COALESCE(SELECT MAX...) and NOT EXISTS(SELECT 1...)
            # once per row in channel_members.  The rewritten version computes
            # MAX(message_id) per channel once and does the existence check via a
            # LEFT JOIN with an IS NULL filter — same semantics, linear not quadratic.
            try:
                cur.execute("""
                    INSERT INTO channel_read_status (user_id, channel_id, last_read_message_id)
                    SELECT cm.user_id, cm.channel_id, COALESCE(mx.max_id, 0)
                    FROM channel_members cm
                    LEFT JOIN (
                        SELECT channel_id, MAX(id) AS max_id
                        FROM messages
                        GROUP BY channel_id
                    ) mx ON mx.channel_id = cm.channel_id
                    LEFT JOIN channel_read_status crs
                        ON crs.user_id = cm.user_id AND crs.channel_id = cm.channel_id
                    WHERE cm.user_id = %s
                      AND crs.user_id IS NULL
                """, (user_id,))
                conn.commit()
            except Exception as seed_err:
                log.warning(f"[UNREAD] Could not seed channel_read_status: {seed_err}")
                try:
                    conn.rollback()
                except Exception:
                    pass

            # FIX 8: Replaced correlated per-row COUNT subquery with a single JOIN.
            # The original ran a "SELECT COUNT(*)" correlated against
            # channel_read_status once per channel_members row.  The JOIN version
            # scans messages once across all channels for this user.
            cur.execute("""
                SELECT cm.channel_id, ch.community_id,
                       COUNT(m.id) AS unread_count
                FROM channel_members cm
                JOIN channels ch ON cm.channel_id = ch.id
                LEFT JOIN channel_read_status crs
                    ON crs.user_id = cm.user_id AND crs.channel_id = cm.channel_id
                LEFT JOIN messages m
                    ON m.channel_id = cm.channel_id
                    AND m.id > COALESCE(crs.last_read_message_id, 0)
                    AND m.sender_id != cm.user_id
                WHERE cm.user_id = %s
                GROUP BY cm.channel_id, ch.community_id
            """, (user_id,))
            
            with _lock:
                community_totals = defaultdict(int)
                for row in cur.fetchall():
                    count = row['unread_count']
                    ch_id = row['channel_id']
                    comm_id = row['community_id']
                    
                    _channel_unread[user_id][ch_id] = count
                    if comm_id:
                        _channel_community_map[ch_id] = comm_id
                        community_totals[comm_id] += count
                
                for comm_id, total in community_totals.items():
                    _community_unread[user_id][comm_id] = total
            
            # DM unreads
            cur.execute("""
                SELECT sender_id, COUNT(*) as cnt
                FROM direct_messages
                WHERE receiver_id = %s AND is_read = FALSE
                GROUP BY sender_id
            """, (user_id,))
            
            with _lock:
                for row in cur.fetchall():
                    _dm_unread[user_id][row['sender_id']] = row['cnt']
        
        log.info(f"[UNREAD] Loaded unreads for user {user_id}")
    except Exception as e:
        log.error(f"[UNREAD] Failed to load unreads for user {user_id}: {e}")
    finally:
        if conn:
            conn.close()


def increment_channel_unread(channel_id, sender_id, community_id=None):
    """
    Increment unread count for all members of a channel except sender.
    Called when a new message is sent to a channel.
    Also emits per-user unread_update as a SECONDARY delivery mechanism.
    The PRIMARY real-time path is channel_activity emitted in sockets.py.
    """
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get all channel members except sender
            cur.execute("""
                SELECT user_id FROM channel_members
                WHERE channel_id = %s AND user_id != %s
            """, (channel_id, sender_id))
            members = cur.fetchall()
        
        log.info(f"[UNREAD] increment ch={channel_id} sender={sender_id} members={len(members)} community={community_id}")
        
        if not community_id:
            community_id = _channel_community_map.get(channel_id)
            if not community_id:
                with conn.cursor() as cur:
                    cur.execute("SELECT community_id FROM channels WHERE id = %s", (channel_id,))
                    ch = cur.fetchone()
                    if ch:
                        community_id = ch['community_id']
                        _channel_community_map[channel_id] = community_id
        
        with _lock:
            for member in members:
                uid = member['user_id']
                _channel_unread[uid][channel_id] += 1
                if community_id:
                    _community_unread[uid][community_id] += 1
                _dirty_users.add(uid)
                log.info(f"[UNREAD] ├─ user {uid}: ch_unread={_channel_unread[uid][channel_id]}, comm_unread={_community_unread[uid].get(community_id, 0)}")
        
        # SECONDARY emit: per-user room delivery (backup for channel_activity)
        if _socketio:
            for member in members:
                uid = member['user_id']
                try:
                    with _lock:
                        ch_count = _channel_unread[uid][channel_id]
                        comm_count = _community_unread[uid].get(community_id, 0) if community_id else 0
                        total_dm = sum(_dm_unread[uid].values())
                        total_channel = sum(_channel_unread[uid].values())
                    
                    emit_data = {
                        'channel_id': channel_id,
                        'community_id': community_id,
                        'channel_unread': ch_count,
                        'community_unread': comm_count,
                        'total_unread': total_channel + total_dm,
                    }
                    log.info(f"[UNREAD] ├─ EMITTING unread_update to user_{uid}: {emit_data}")
                    _socketio.emit('unread_update', emit_data, room=f"user_{uid}", namespace='/')
                    log.info(f"[UNREAD] ├─ ✅ unread_update sent to user_{uid}")
                except Exception as emit_err:
                    log.error(f"[UNREAD] ├─ ❌ emit to user_{uid} failed: {emit_err}", exc_info=True)
        else:
            log.warning("[UNREAD] _socketio is None — per-user emit skipped")
                
    except Exception as e:
        log.error(f"[UNREAD] Failed to increment channel unread: {e}", exc_info=True)
    finally:
        if conn:
            conn.close()


def increment_dm_unread(receiver_id, sender_id):
    """Increment DM unread count. Called when a new DM is received."""
    with _lock:
        _dm_unread[receiver_id][sender_id] += 1
        _dirty_users.add(receiver_id)
        dm_count = _dm_unread[receiver_id][sender_id]
        total_dm = sum(_dm_unread[receiver_id].values())
        total_channel = sum(_channel_unread[receiver_id].values())
    
    if _socketio:
        _socketio.emit('dm_unread_update', {
            'sender_id': sender_id,
            'unread_count': dm_count,
            'total_dm_unread': total_dm,
            'total_unread': total_channel + total_dm,
        }, room=f"user_{receiver_id}", namespace='/')


def mark_channel_read(user_id, channel_id, message_id=None):
    """Mark a channel as read for a user."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            if not message_id:
                cur.execute("SELECT MAX(id) AS max_id FROM messages WHERE channel_id = %s", (channel_id,))
                result = cur.fetchone()
                message_id = result['max_id'] if (result and result['max_id']) else 0
            
            if message_id:
                cur.execute("""
                    INSERT INTO channel_read_status (user_id, channel_id, last_read_message_id)
                    VALUES (%s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        last_read_message_id = GREATEST(COALESCE(last_read_message_id, 0), VALUES(last_read_message_id)),
                        last_read_at = CURRENT_TIMESTAMP
                """, (user_id, channel_id, message_id))
                conn.commit()
        
        community_id = _channel_community_map.get(channel_id)
        if not community_id:
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT community_id FROM channels WHERE id = %s", (channel_id,))
                    ch_row = cur.fetchone()
                    if ch_row:
                        community_id = ch_row['community_id']
                        _channel_community_map[channel_id] = community_id
            except Exception:
                pass
        
        with _lock:
            old_count = _channel_unread[user_id].get(channel_id, 0)
            _channel_unread[user_id][channel_id] = 0
            if community_id and old_count > 0:
                _community_unread[user_id][community_id] = max(
                    0, _community_unread[user_id][community_id] - old_count
                )
        
        # Emit updated counts
        if _socketio:
            with _lock:
                comm_count = _community_unread[user_id].get(community_id, 0) if community_id else 0
                total_dm = sum(_dm_unread[user_id].values())
                total_channel = sum(_channel_unread[user_id].values())
            
            _socketio.emit('unread_update', {
                'channel_id': channel_id,
                'community_id': community_id,
                'channel_unread': 0,
                'community_unread': comm_count,
                'total_unread': total_channel + total_dm,
            }, room=f"user_{user_id}", namespace='/')
        
    except Exception as e:
        log.error(f"[UNREAD] Failed to mark channel read: {e}")
    finally:
        if conn:
            conn.close()


def mark_dm_read(user_id, other_user_id):
    """Mark DM conversation as read."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Mark all unread DMs from other_user as read
            cur.execute("""
                UPDATE direct_messages
                SET is_read = TRUE, read_at = NOW()
                WHERE sender_id = %s AND receiver_id = %s AND is_read = FALSE
            """, (other_user_id, user_id))
            conn.commit()
        
        with _lock:
            _dm_unread[user_id][other_user_id] = 0
            total_dm = sum(_dm_unread[user_id].values())
            total_channel = sum(_channel_unread[user_id].values())
        
        if _socketio:
            _socketio.emit('dm_unread_update', {
                'sender_id': other_user_id,
                'unread_count': 0,
                'total_dm_unread': total_dm,
                'total_unread': total_channel + total_dm,
            }, room=f"user_{user_id}", namespace='/')
            
    except Exception as e:
        log.error(f"[UNREAD] Failed to mark DM read: {e}")
    finally:
        if conn:
            conn.close()


def get_user_unreads(user_id):
    """Get all unread counts for a user."""
    with _lock:
        channels = dict(_channel_unread.get(user_id, {}))
        communities = dict(_community_unread.get(user_id, {}))
        dms = dict(_dm_unread.get(user_id, {}))
        total_dm = sum(dms.values())
        total_channel = sum(channels.values())
    
    return {
        'channels': channels,
        'communities': communities,
        'dms': dms,
        'total_dm_unread': total_dm,
        'total_channel_unread': total_channel,
        'total_unread': total_dm + total_channel,
    }


def clear_user_cache(user_id):
    """Clear cached unreads for a user (on logout)."""
    with _lock:
        _channel_unread.pop(user_id, None)
        _community_unread.pop(user_id, None)
        _dm_unread.pop(user_id, None)


def _persistence_loop():
    """Periodically persist dirty unread counts to DB."""
    while True:
        try:
            time.sleep(30)  # Persist every 30 seconds

            with _lock:
                users_to_sync = list(_dirty_users)
                _dirty_users.clear()

            if not users_to_sync:
                continue

            # FIX 3: Collect ALL (user_id, community_id, total_unread) tuples first,
            # then issue a single multi-row INSERT instead of N individual INSERTs
            # followed by N COMMITs.  This reduces commit overhead from O(users *
            # communities) to exactly 1 COMMIT per 30-second persistence window.
            rows = []
            for uid in users_to_sync:
                with _lock:
                    communities = dict(_community_unread.get(uid, {}))
                for comm_id, count in communities.items():
                    rows.append((uid, comm_id, count))

            if not rows:
                continue

            conn = get_db_connection()
            try:
                with conn.cursor() as cur:
                    # Batch upsert all rows in one statement
                    cur.executemany("""
                        INSERT INTO community_unread_status (user_id, community_id, total_unread)
                        VALUES (%s, %s, %s)
                        ON DUPLICATE KEY UPDATE total_unread = VALUES(total_unread)
                    """, rows)
                conn.commit()
                log.debug(f"[UNREAD] Persisted unreads for {len(users_to_sync)} users ({len(rows)} rows) in 1 COMMIT")
            finally:
                conn.close()

        except Exception as e:
            log.error(f"[UNREAD] Persistence error: {e}")
