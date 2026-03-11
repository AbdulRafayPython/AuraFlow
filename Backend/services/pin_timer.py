# services/pin_timer.py — Background pin expiration service (thread-based, no Redis required)
"""
Pin Timer Service
=================
Handles timed pin expiration using a background daemon thread.
On startup, loads all unexpired pins from DB and schedules them.
Uses an in-memory priority queue (heapq) for O(log n) scheduling.
On server restart, all pending expirations are reloaded from DB.
"""
import threading
import heapq
import time
import logging
from datetime import datetime, timedelta
from database import get_db_connection

log = logging.getLogger(__name__)

# Priority queue: [(expires_at_timestamp, pin_type, pin_id, channel_id, message_id, extra)]
_pin_queue = []
_queue_lock = threading.Lock()
_queue_event = threading.Event()  # Signal new items added
_socketio = None  # Will be set by init()


def init(socketio_instance):
    """Initialize the pin timer service and start the background thread."""
    global _socketio
    _socketio = socketio_instance
    
    # Load pending timed pins from DB
    _load_pending_pins()
    
    # Start daemon thread
    t = threading.Thread(target=_expiration_loop, daemon=True, name="PinTimerThread")
    t.start()
    log.info("[PIN_TIMER] Service started")


def schedule_pin_expiration(pin_type, pin_id, channel_id, message_id, expires_at, extra=None):
    """
    Schedule a pin for automatic expiration.
    
    Args:
        pin_type: 'channel' or 'dm'
        pin_id: The pinned_messages/dm_pinned_messages row ID
        channel_id: channel_id (for channel pins) or None for DM
        message_id: The message that was pinned
        expires_at: datetime when pin should expire
        extra: dict with additional data (e.g. sender_id, receiver_id for DM)
    """
    ts = expires_at.timestamp()
    with _queue_lock:
        heapq.heappush(_pin_queue, (ts, pin_type, pin_id, channel_id, message_id, extra or {}))
    _queue_event.set()  # Wake up the loop
    log.info(f"[PIN_TIMER] Scheduled {pin_type} pin {pin_id} to expire at {expires_at.isoformat()}")


def cancel_pin_expiration(pin_id, pin_type='channel'):
    """Cancel a scheduled pin expiration (when manually unpinned before timer)."""
    with _queue_lock:
        # Mark as cancelled by removing from queue (rebuild without it)
        global _pin_queue
        _pin_queue = [(ts, pt, pid, cid, mid, ex) for ts, pt, pid, cid, mid, ex in _pin_queue
                      if not (pid == pin_id and pt == pin_type)]
        heapq.heapify(_pin_queue)
    log.info(f"[PIN_TIMER] Cancelled expiration for {pin_type} pin {pin_id}")


def _load_pending_pins():
    """Load all unexpired timed pins from database on startup."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Channel pins with expiration
            cur.execute("""
                SELECT id, channel_id, message_id, expires_at
                FROM pinned_messages
                WHERE expires_at IS NOT NULL AND expires_at > NOW()
            """)
            for row in cur.fetchall():
                ts = row['expires_at'].timestamp()
                with _queue_lock:
                    heapq.heappush(_pin_queue, (
                        ts, 'channel', row['id'], row['channel_id'],
                        row['message_id'], {}
                    ))
            
            # DM pins with expiration
            cur.execute("""
                SELECT id, sender_id, receiver_id, message_id, expires_at
                FROM dm_pinned_messages
                WHERE expires_at IS NOT NULL AND expires_at > NOW()
            """)
            for row in cur.fetchall():
                ts = row['expires_at'].timestamp()
                with _queue_lock:
                    heapq.heappush(_pin_queue, (
                        ts, 'dm', row['id'], None,
                        row['message_id'], {
                            'sender_id': row['sender_id'],
                            'receiver_id': row['receiver_id']
                        }
                    ))
        
        log.info(f"[PIN_TIMER] Loaded {len(_pin_queue)} pending pin expirations from DB")
    except Exception as e:
        log.error(f"[PIN_TIMER] Failed to load pending pins: {e}")
    finally:
        if conn:
            conn.close()


def _expiration_loop():
    """Background loop that processes pin expirations."""
    while True:
        try:
            with _queue_lock:
                if not _pin_queue:
                    next_ts = None
                else:
                    next_ts = _pin_queue[0][0]
            
            if next_ts is None:
                # No pins scheduled, wait for signal
                _queue_event.wait(timeout=60)
                _queue_event.clear()
                continue
            
            now = time.time()
            wait_time = next_ts - now
            
            if wait_time > 0:
                # Wait until next expiration (or new item signal)
                _queue_event.wait(timeout=min(wait_time, 30))
                _queue_event.clear()
                continue
            
            # Time to expire a pin
            with _queue_lock:
                if _pin_queue and _pin_queue[0][0] <= time.time():
                    _, pin_type, pin_id, channel_id, message_id, extra = heapq.heappop(_pin_queue)
                else:
                    continue
            
            _expire_pin(pin_type, pin_id, channel_id, message_id, extra)
            
        except Exception as e:
            log.error(f"[PIN_TIMER] Expiration loop error: {e}")
            time.sleep(5)  # Backoff on error


def _expire_pin(pin_type, pin_id, channel_id, message_id, extra):
    """Execute pin expiration: remove from DB and notify via socket."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            if pin_type == 'channel':
                # Remove channel pin
                cur.execute("DELETE FROM pinned_messages WHERE id = %s", (pin_id,))
                cur.execute("UPDATE messages SET is_pinned = FALSE WHERE id = %s", (message_id,))
                conn.commit()
                
                # Emit socket event to channel room
                if _socketio and channel_id:
                    _socketio.emit('pin_expired', {
                        'channel_id': channel_id,
                        'message_id': message_id,
                        'pin_id': pin_id,
                        'type': 'channel'
                    }, room=f"channel_{channel_id}", namespace='/')
                
                log.info(f"[PIN_TIMER] Channel pin {pin_id} expired (msg {message_id} in ch {channel_id})")
                
            elif pin_type == 'dm':
                # Remove DM pin
                cur.execute("DELETE FROM dm_pinned_messages WHERE id = %s", (pin_id,))
                conn.commit()
                
                sender_id = extra.get('sender_id')
                receiver_id = extra.get('receiver_id')
                
                # Notify both DM participants
                if _socketio and sender_id and receiver_id:
                    event_data = {
                        'message_id': message_id,
                        'pin_id': pin_id,
                        'type': 'dm',
                        'sender_id': sender_id,
                        'receiver_id': receiver_id
                    }
                    _socketio.emit('pin_expired', event_data,
                                  room=f"user_{sender_id}", namespace='/')
                    _socketio.emit('pin_expired', event_data,
                                  room=f"user_{receiver_id}", namespace='/')
                
                log.info(f"[PIN_TIMER] DM pin {pin_id} expired (msg {message_id})")
                
    except Exception as e:
        log.error(f"[PIN_TIMER] Failed to expire pin {pin_id}: {e}")
    finally:
        if conn:
            conn.close()
