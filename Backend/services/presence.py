# services/presence.py — Real-time presence tracking (online/offline/away)
"""
Presence Service
================
Tracks user online status using in-memory state + heartbeat mechanism.
Handles multi-tab, multi-device login, graceful disconnect, and crash recovery.
"""
import threading
import time
import logging
from datetime import datetime, timedelta
from collections import defaultdict
from database import get_db_connection

log = logging.getLogger(__name__)

_socketio = None

# Active connections: { user_id: set(socket_ids) }
_user_connections = defaultdict(set)
# Heartbeat timestamps: { user_id: datetime }
_user_heartbeats = {}
# Status cache: { user_id: 'online'|'idle'|'dnd'|'offline' }
_user_status = {}
# Username -> user_id mapping
_username_to_id = {}

_lock = threading.Lock()

# Idle threshold: 5 minutes without heartbeat
IDLE_THRESHOLD = timedelta(minutes=5)
# Offline threshold: 2 minutes after last heartbeat with no connections
OFFLINE_THRESHOLD = timedelta(minutes=2)


def init(socketio_instance):
    """Initialize presence service."""
    global _socketio
    _socketio = socketio_instance

    # Start presence monitor thread
    t = threading.Thread(target=_monitor_loop, daemon=True, name="PresenceMonitorThread")
    t.start()
    log.info("[PRESENCE] Service started")

    # Start channel-silence probe thread. Emits `channel.silent` events
    # onto the autonomous-agent event bus for channels with no activity
    # in the last N minutes — feeds the Engagement agent's adaptive
    # scheduling. Cheap one-query-per-minute probe, daemon thread so it
    # does not block shutdown.
    s = threading.Thread(target=_silence_probe_loop, daemon=True, name="ChannelSilenceProbeThread")
    s.start()


def user_connected(user_id, username, socket_id):
    """Register a new socket connection for a user."""
    with _lock:
        _user_connections[user_id].add(socket_id)
        _user_heartbeats[user_id] = datetime.now()
        _username_to_id[username] = user_id
        old_status = _user_status.get(user_id)
        _user_status[user_id] = 'online'
    
    if old_status != 'online':
        _broadcast_status(user_id, username, 'online')
        _persist_status(user_id, 'online')
    
    log.info(f"[PRESENCE] {username} connected (sid={socket_id}, total={len(_user_connections[user_id])})")


def user_disconnected(user_id, username, socket_id):
    """Remove a socket connection. Only mark offline if no connections remain."""
    with _lock:
        _user_connections[user_id].discard(socket_id)
        remaining = len(_user_connections[user_id])
    
    if remaining == 0:
        # No more active connections — mark offline after grace period
        # (handled by monitor loop to handle reconnects gracefully)
        with _lock:
            _user_heartbeats[user_id] = datetime.now()  # Grace period starts now
        log.info(f"[PRESENCE] {username} last connection closed, grace period started")
    else:
        log.info(f"[PRESENCE] {username} disconnected one tab (remaining={remaining})")


def heartbeat(user_id, username):
    """Update heartbeat timestamp for a user."""
    with _lock:
        _user_heartbeats[user_id] = datetime.now()
        old_status = _user_status.get(user_id)
    
    # If coming back from idle, set back to online
    if old_status == 'idle':
        with _lock:
            _user_status[user_id] = 'online'
        _broadcast_status(user_id, username, 'online')
        _persist_status(user_id, 'online')


def set_user_status(user_id, username, status):
    """Manually set status (for DND etc.)."""
    with _lock:
        _user_status[user_id] = status
    _broadcast_status(user_id, username, status)
    _persist_status(user_id, status)


def get_user_status(user_id):
    """Get current status for a user."""
    with _lock:
        return _user_status.get(user_id, 'offline')


def get_bulk_status(user_ids):
    """Get status for multiple users at once."""
    with _lock:
        return {uid: _user_status.get(uid, 'offline') for uid in user_ids}


def get_online_friends(user_id):
    """Get list of online friend IDs for a user."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT CASE WHEN user_id = %s THEN friend_id ELSE user_id END AS fid
                FROM friends
                WHERE user_id = %s OR friend_id = %s
            """, (user_id, user_id, user_id))
            friend_ids = [row['fid'] for row in cur.fetchall()]
        
        with _lock:
            return {fid: _user_status.get(fid, 'offline') for fid in friend_ids}
    except Exception as e:
        log.error(f"[PRESENCE] Error getting online friends: {e}")
        return {}
    finally:
        if conn:
            conn.close()


def _broadcast_status(user_id, username, status):
    """Broadcast status change to all connected clients."""
    if _socketio:
        _socketio.emit('user_status', {
            'username': username,
            'user_id': user_id,
            'status': status,
        }, namespace='/')


def _persist_status(user_id, status):
    """Persist status to database."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            if status == 'offline':
                cur.execute("""
                    UPDATE users SET status = %s, last_seen = NOW()
                    WHERE id = %s
                """, (status, user_id))
            else:
                cur.execute("""
                    UPDATE users SET status = %s WHERE id = %s
                """, (status, user_id))
        conn.commit()
    except Exception as e:
        log.error(f"[PRESENCE] Failed to persist status: {e}")
    finally:
        if conn:
            conn.close()


def _get_username(user_id):
    """Reverse lookup username from user_id."""
    with _lock:
        for uname, uid in _username_to_id.items():
            if uid == user_id:
                return uname
    return None


def _monitor_loop():
    """Background thread that checks for idle/offline users."""
    while True:
        try:
            time.sleep(30)  # Check every 30 seconds
            now = datetime.now()
            
            with _lock:
                users_to_check = list(_user_heartbeats.items())
            
            for user_id, last_hb in users_to_check:
                with _lock:
                    connections = len(_user_connections.get(user_id, set()))
                    current_status = _user_status.get(user_id)
                
                elapsed = now - last_hb
                username = _get_username(user_id)
                
                if connections == 0 and elapsed > OFFLINE_THRESHOLD:
                    # No connections and past grace period → offline
                    if current_status != 'offline':
                        with _lock:
                            _user_status[user_id] = 'offline'
                            _user_heartbeats.pop(user_id, None)
                        if username:
                            _broadcast_status(user_id, username, 'offline')
                            _persist_status(user_id, 'offline')
                            log.info(f"[PRESENCE] {username} marked offline (no connections)")
                
                elif connections > 0 and elapsed > IDLE_THRESHOLD:
                    # Has connections but no heartbeat → idle
                    if current_status == 'online':
                        with _lock:
                            _user_status[user_id] = 'idle'
                        if username:
                            _broadcast_status(user_id, username, 'idle')
                            _persist_status(user_id, 'idle')
                            log.info(f"[PRESENCE] {username} marked idle")

                        # Publish user.idle on the autonomous-agent event
                        # bus. Best-effort — never blocks presence logic.
                        try:
                            from agents import event_bus as _agent_bus
                            _agent_bus.publish(_agent_bus.TOPIC_USER_IDLE, {
                                'user_id':      user_id,
                                'username':     username,
                                'last_seen_ts': last_hb.timestamp() if hasattr(last_hb, 'timestamp') else None,
                            })
                        except Exception as _bus_err:
                            log.debug(f"[event_bus] user.idle publish skipped: {_bus_err}")

        except Exception as e:
            log.error(f"[PRESENCE] Monitor error: {e}")


# ── Channel-silence probe ────────────────────────────────────────────
# One MAX(created_at) GROUP BY channel_id query per minute against the
# messages table. Channels whose silence has just crossed a 15 / 60 /
# 240-minute bucket emit one `channel.silent` event — the bucketing
# keeps the firing rate bounded even if a channel stays silent for days.

_SILENCE_BUCKETS_MIN = (15, 60, 240)         # silence thresholds (minutes)
_SILENCE_PROBE_INTERVAL = 60                  # seconds between probes
_silence_last_fired: dict = {}                # (channel_id, bucket) -> ts


def _silence_probe_loop():
    while True:
        try:
            time.sleep(_SILENCE_PROBE_INTERVAL)
            _run_silence_probe_once()
        except Exception as exc:
            log.debug(f"[PRESENCE] silence probe error: {exc}")


def _run_silence_probe_once():
    """One pass: find each channel's silence minutes; emit on bucket crossing."""
    try:
        from agents import event_bus as _agent_bus
    except Exception:
        return  # bus unavailable — skip

    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Limit to channels that have had at least one message ever,
            # and skip channels older than 7 days of silence — those will
            # never wake up from this probe and shouldn't churn the bus.
            cur.execute("""
                SELECT c.id AS channel_id,
                       c.community_id AS community_id,
                       TIMESTAMPDIFF(MINUTE, MAX(m.created_at), NOW()) AS silent_minutes
                FROM channels c
                JOIN messages m ON m.channel_id = c.id
                GROUP BY c.id, c.community_id
                HAVING silent_minutes BETWEEN 15 AND 10080
            """)
            rows = cur.fetchall() or []
    except Exception as exc:
        log.debug(f"[PRESENCE] silence probe query failed: {exc}")
        return
    finally:
        if conn:
            conn.close()

    now_ts = time.time()
    for row in rows:
        silent = int(row.get('silent_minutes') or 0)
        # Highest bucket whose threshold the silence has crossed.
        bucket = max((b for b in _SILENCE_BUCKETS_MIN if silent >= b), default=None)
        if bucket is None:
            continue
        key = (row['channel_id'], bucket)
        last = _silence_last_fired.get(key, 0)
        # Re-emit at most once per hour per bucket.
        if now_ts - last < 3600:
            continue
        _silence_last_fired[key] = now_ts
        try:
            _agent_bus.publish(_agent_bus.TOPIC_CHANNEL_SILENT, {
                'channel_id':     row['channel_id'],
                'community_id':   row.get('community_id'),
                'silent_minutes': silent,
                'bucket':         bucket,
            })
        except Exception as _bus_err:
            log.debug(f"[event_bus] channel.silent publish skipped: {_bus_err}")
