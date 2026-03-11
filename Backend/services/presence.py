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
                            
        except Exception as e:
            log.error(f"[PRESENCE] Monitor error: {e}")
