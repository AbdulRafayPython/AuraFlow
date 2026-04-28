# routes/sockets.py - Complete Socket.IO event handlers
from flask_socketio import emit, join_room, leave_room, rooms, disconnect
from flask_jwt_extended import decode_token
from flask import request
from database import get_db_connection
import logging
from datetime import datetime
import sys
import os
import time
from collections import defaultdict
# FIX 1: Use cached user-id helper and Redis seed on connect
from utils import get_user_id
from services.redis_client import cache_set as _redis_cache_set

# Add agents directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

log = logging.getLogger(__name__)

# Track socket sessions: username -> socket_id
user_socket_sessions = {}
# Track last heartbeat: username -> timestamp
user_heartbeats = {}
# Track user rooms: username -> list of rooms
user_rooms = {}
# Cache user IDs: username -> user_id  (avoids DB hit on every keystroke / event)
user_id_cache = {}

# ── Socket Rate Limiter ──────────────────────────────────────────────
_socket_rate_buckets = defaultdict(list)  # sid -> list of timestamps
SOCKET_RATE_LIMIT = 30   # max events
SOCKET_RATE_WINDOW = 10  # per N seconds

def _socket_rate_limited(sid: str) -> bool:
    """Return True if this socket id has exceeded the rate limit."""
    now = time.monotonic()
    bucket = _socket_rate_buckets[sid]
    # Prune expired timestamps
    _socket_rate_buckets[sid] = bucket = [t for t in bucket if now - t < SOCKET_RATE_WINDOW]
    if len(bucket) >= SOCKET_RATE_LIMIT:
        return True
    bucket.append(now)
    return False


def handle_ai_command(content: str, username: str, user_id: int, channel_id: int, community_id: int = None):
    """Handle AI commands from chat (/summarize, /help, etc.)
    
    /summarize posts the result as a bot message in the channel (message_type='ai').
    """
    try:
        log.info(f"[COMMAND HANDLER] Processing command: {content}")
        command_parts = content.strip().split()
        command = command_parts[0].lower()
        log.info(f"[COMMAND HANDLER] Parsed command: {command}")
        
        if command == '/summarize':
            # Parse optional message count
            message_count = 100
            if len(command_parts) > 1 and command_parts[1].isdigit():
                message_count = min(int(command_parts[1]), 200)  # Cap at 200
            
            log.info(f"[COMMAND] /summarize requested by {username} for channel {channel_id} with {message_count} messages")
            
            # Generate summary
            from agents.summarizer import SummarizerAgent
            summarizer = SummarizerAgent()
            result = summarizer.summarize_channel(
                channel_id=channel_id,
                message_count=message_count,
                user_id=user_id
            )
            
            log.info(f"[COMMAND] Summarizer returned success={result.get('success')}")
            
            if result.get('success'):
                # Format as a bot message and post into the channel
                from tasks.agent_tasks import _format_summary_as_bot_message

                # Get channel name for the header
                channel_name = ''
                conn = None
                try:
                    conn = get_db_connection()
                    with conn.cursor() as cur:
                        cur.execute("SELECT name FROM channels WHERE id = %s", (channel_id,))
                        row = cur.fetchone()
                        if row:
                            channel_name = row['name']
                finally:
                    if conn:
                        conn.close()

                bot_content = _format_summary_as_bot_message(result, channel_name)

                # Insert as message_type='ai' and broadcast to the channel
                conn = None
                try:
                    conn = get_db_connection()
                    with conn.cursor() as cur:
                        cur.execute("""
                            INSERT INTO messages (channel_id, sender_id, content, message_type)
                            VALUES (%s, %s, %s, 'ai')
                        """, (channel_id, user_id, bot_content))
                        message_id = cur.lastrowid

                        cur.execute("""
                            SELECT m.*, u.username, u.display_name, u.avatar_url
                            FROM messages m JOIN users u ON m.sender_id = u.id
                            WHERE m.id = %s
                        """, (message_id,))
                        msg = cur.fetchone()
                        conn.commit()

                    if msg:
                        payload = {
                            'id': msg['id'],
                            'channel_id': msg['channel_id'],
                            'sender_id': user_id,
                            'content': msg['content'],
                            'message_type': 'ai',
                            'reply_to': None,
                            'created_at': msg['created_at'].isoformat() if hasattr(msg['created_at'], 'isoformat') else str(msg['created_at']),
                            'author': 'Summarizer Agent',
                            'avatar': None,
                            'is_blocked': False,
                            'moderation': None,
                        }
                        room = f"channel_{channel_id}"
                        emit('message_received', payload, room=room, namespace='/')
                        log.info(f"[COMMAND] ✅ Bot summary posted to channel {channel_id}")
                finally:
                    if conn:
                        conn.close()

                # Return success (no popup, message is already in the chat)
                return {
                    'type': 'summarize',
                    'success': True,
                    'posted_as_bot': True,
                    'message_count': result['message_count'],
                    'method': result.get('method', 'extractive'),
                }
            else:
                return {
                    'type': 'summarize',
                    'success': False,
                    'error': result.get('error', 'Failed to generate summary')
                }
        
        elif command == '/help':
            return {
                'type': 'help',
                'success': True,
                'message': """**AuraFlow AI Commands:**
• `/summarize [count]` - Summarize recent messages (default: 100)
• `/help` - Show this help message

More commands coming soon!"""
            }
        
        else:
            return None  # Unknown command, let it be treated as regular message
            
    except Exception as e:
        log.error(f"[COMMAND] Error handling command: {e}")
        return {
            'type': 'error',
            'success': False,
            'error': str(e)
        }


def register_socket_events(socketio):
    """Register all real-time Socket.IO events including voice channel operations."""
    
    # Initialize moderation agent (lazy)
    from agents.moderation import ModerationAgent
    moderation_agent = ModerationAgent()
    log.info("[MODERATION] Smart Moderation Agent initialized")

    # Store auth data from connect handler so get_user_from_socket can access it
    _socket_auth = {}

    def get_user_from_socket():
        """Extract and verify JWT from socket connection."""
        try:
            auth = None
            
            # Check auth data passed from connect handler (Flask-SocketIO 5.x)
            sid = getattr(request, 'sid', None)
            if sid and sid in _socket_auth:
                auth = _socket_auth[sid].get('token') if isinstance(_socket_auth[sid], dict) else None
            # Check Socket.IO auth transport on request object
            if not auth and hasattr(request, 'auth') and isinstance(getattr(request, 'auth', None), dict):
                auth = request.auth.get('token')
            # Check request args (legacy query-string approach)
            if not auth and hasattr(request, 'args') and request.args.get('token'):
                auth = request.args.get('token')
            # Check headers
            if not auth and hasattr(request, 'headers') and request.headers.get('Authorization'):
                auth = request.headers.get('Authorization')

            if not auth:
                log.warning("[SOCKET] ⚠️  No token found in request")
                return None

            # Clean up the token
            token = auth.replace('Bearer ', '') if isinstance(auth, str) and auth.startswith('Bearer ') else auth
            
            if not token:
                log.error("[SOCKET] Token is empty")
                return None

            try:
                decoded = decode_token(token)
            except Exception as decode_err:
                error_msg = str(decode_err)
                if 'expired' in error_msg.lower():
                    log.warning(f"[SOCKET] Token expired - client should refresh")
                else:
                    log.error(f"[SOCKET] Token decode failed: {decode_err}")
                return None
                
            username = decoded.get('sub')

            if not username:
                log.error("[SOCKET] No username in token")
                return None

            log.info(f"[SOCKET] ✅ Token valid for user: {username}")
            return username

        except Exception as e:
            log.error(f"[SOCKET] ❌ Unexpected error in get_user_from_socket: {e}")
            return None

    # ============================================================================
    # CONNECTION EVENTS
    # ============================================================================

    @socketio.on('connect')
    def handle_connect(auth=None):
        conn = None
        try:
            # Store auth data so get_user_from_socket can read it
            if auth and request.sid:
                _socket_auth[request.sid] = auth

            username = get_user_from_socket()
            if not username:
                log.error("[SOCKET] Connect rejected: Invalid token")
                # Return False to reject the connection cleanly
                return False

            # Store socket session ID for this user
            user_socket_sessions[username] = request.sid
            log.info(f"[SOCKET] Mapped {username} -> SID {request.sid}")

            conn = get_db_connection()
            with conn.cursor() as cur:
                # FIX 1: Use cached get_user_id; also seed Redis so HTTP handlers
                # skip the DB on the first request after this socket connection.
                user_id = get_user_id(username, cur)
                if not user_id:
                    log.error(f"[SOCKET] User not found: {username}")
                    disconnect()
                    return

                # Also write to Redis for cross-worker cache sharing
                _redis_cache_set(f"user:id:{username}", user_id, ttl=3600)

                # Cache user_id so typing / DM handlers skip the DB lookup
                user_id_cache[username] = user_id
                
                # Join personal notification room
                personal_room = f"user_{user_id}"
                join_room(personal_room)

                # Join username-based room for call signaling
                # Both socket.ts and socketService.ts join this room,
                # so call events reach CallContext regardless of which SID is stored
                call_room = f"calluser_{username}"
                join_room(call_room)
                
                # Join community rooms for unread tracking
                cur.execute("""
                    SELECT community_id FROM community_members WHERE user_id = %s
                """, (user_id,))
                community_rows = cur.fetchall()
                log.info(f"[SOCKET] 🏘️ User {username} (ID: {user_id}) joining {len(community_rows)} community rooms")
                for cm_row in community_rows:
                    room_name = f"community_{cm_row['community_id']}"
                    join_room(room_name)
                    log.info(f"[SOCKET] ├─ Joined room: {room_name}")
                
                # Track user's rooms
                user_rooms[username] = rooms()
                
                log.info(f"[SOCKET] ✅ {username} (ID: {user_id}) joined personal room: {personal_room}")
                log.info(f"[SOCKET] 📍 SID: {request.sid} is now in room: {personal_room}")
                log.info(f"[SOCKET] 🏠 All rooms for {username}: {user_rooms[username]}")
                
                # FIX 5: UPDATE by PK (id) instead of username for the online status
                cur.execute("""
                    UPDATE users
                    SET status = 'online', last_seen = NOW()
                    WHERE id = %s
                """, (user_id,))
            conn.commit()

            # Register with presence service
            try:
                from services.presence import user_connected
                user_connected(user_id, username, request.sid)
            except ImportError:
                pass
            
            # Load unread counts for this user
            try:
                from services.unread_tracker import load_user_unreads, get_user_unreads
                load_user_unreads(user_id)
                unreads = get_user_unreads(user_id)
                log.info(f"[SOCKET] 📊 Emitting initial_unreads to {username} (ID: {user_id}): {unreads}")
                emit('initial_unreads', unreads)
            except ImportError:
                log.error(f"[SOCKET] ❌ Failed to import unread_tracker")
            except Exception as e:
                log.error(f"[SOCKET] ❌ Failed to load/emit initial_unreads: {e}", exc_info=True)

            socketio.emit('user_status', {
                'username': username,
                'status': 'online'
            }, namespace='/', skip_sid=request.sid)

            log.info(f"[SOCKET] {username} connected - online")

        except Exception as e:
            log.error(f"[SOCKET] Connection error: {e}")
        finally:
            if conn:
                conn.close()

    @socketio.on('heartbeat')
    def handle_heartbeat():
        """Track user activity via heartbeat to determine if they're truly active"""
        try:
            username = get_user_from_socket()
            if not username:
                return
            
            # Update heartbeat timestamp
            user_heartbeats[username] = datetime.now()
            log.debug(f"[HEARTBEAT] Received from {username}")
            
            # Update presence service
            try:
                uid = user_id_cache.get(username)
                if uid:
                    from services.presence import heartbeat as presence_heartbeat
                    presence_heartbeat(uid, username)
            except ImportError:
                pass
            
            # Emit acknowledgment
            emit('heartbeat_ack', {'timestamp': datetime.now().isoformat()})
            
        except Exception as e:
            log.error(f"[HEARTBEAT] Error: {e}")

    @socketio.on('disconnect')
    def handle_disconnect(reason=None):
        conn = None
        try:
            if reason:
                log.info(f"[SOCKET] Disconnect reason: {reason}")
            
            # Clean up stored auth data
            _socket_auth.pop(request.sid, None)
            _socket_rate_buckets.pop(request.sid, None)
            
            # Try to get username from session first, then from token
            username = None
            sid = request.sid
            
            # Find username by session ID
            for user, session_id in user_socket_sessions.items():
                if session_id == sid:
                    username = user
                    break
            
            # If not found in sessions, try to get from token
            if not username:
                username = get_user_from_socket()
            
            if not username:
                log.warning(f"[SOCKET] Disconnect called but no username found for SID {sid}")
                return

            # Only remove socket session mapping if THIS socket's SID matches
            # (prevents a second socket's disconnect from nuking the primary session)
            if username in user_socket_sessions and user_socket_sessions[username] == sid:
                del user_socket_sessions[username]
                user_id_cache_uid = user_id_cache.pop(username, None)
                log.info(f"[SOCKET] Removed session mapping for {username}")
                
                # Notify presence service
                try:
                    from services.presence import user_disconnected
                    if user_id_cache_uid:
                        user_disconnected(user_id_cache_uid, username, sid)
                except ImportError:
                    pass
            elif username in user_socket_sessions:
                log.info(f"[SOCKET] Skipping session removal for {username} - SID mismatch (disconnect: {sid}, stored: {user_socket_sessions[username]})")
                # Another socket is still active for this user, don't mark offline
                return
            
            # Remove heartbeat tracking
            if username in user_heartbeats:
                del user_heartbeats[username]
                log.info(f"[SOCKET] Removed heartbeat tracking for {username}")

            conn = get_db_connection()
            with conn.cursor() as cur:
                # FIX 1: Use cached get_user_id
                user_id = get_user_id(username, cur)

                if user_id:
                    
                    # Get all active voice channels this user is in
                    cur.execute("""
                        SELECT DISTINCT vp.voice_channel_id, vc.channel_id
                        FROM voice_participants vp
                        JOIN voice_channels vc ON vp.voice_channel_id = vc.id
                        WHERE vp.user_id = %s AND vp.left_at IS NULL
                    """, (user_id,))
                    active_voice_sessions = cur.fetchall()
                    
                    # Clear voice_participation entries for this user
                    if active_voice_sessions:
                        for session in active_voice_sessions:
                            voice_channel_id = session['voice_channel_id']
                            channel_id = session['channel_id']
                            
                            # Delete from voice_participants
                            cur.execute("""
                                DELETE FROM voice_participants
                                WHERE user_id = %s AND voice_channel_id = %s
                            """, (user_id, voice_channel_id))
                            
                            # Delete from voice_sessions
                            cur.execute("""
                                DELETE FROM voice_sessions
                                WHERE user_id = %s AND channel_id = %s
                            """, (user_id, channel_id))
                            
                            # Broadcast user_left_voice to remaining participants
                            voice_room = f"voice_{channel_id}"
                            emit('user_left_voice', {
                                'username': username,
                                'channel_id': channel_id,
                                'timestamp': datetime.now().isoformat()
                            }, room=voice_room)
                            
                            # Get remaining members and broadcast updated list
                            cur.execute("""
                                SELECT u.id, u.username, u.display_name, u.avatar_url,
                                       COALESCE(vs.is_muted, 0) as is_muted,
                                       COALESCE(vs.is_deaf, 0) as is_deaf
                                FROM voice_participants vp
                                JOIN users u ON vp.user_id = u.id
                                LEFT JOIN voice_sessions vs ON vs.channel_id = %s AND vs.user_id = u.id
                                WHERE vp.voice_channel_id = %s AND vp.left_at IS NULL
                                GROUP BY u.id, u.username, u.display_name, u.avatar_url, vs.is_muted, vs.is_deaf
                            """, (channel_id, voice_channel_id))
                            remaining = cur.fetchall()
                            remaining_list = [{
                                'id': m['id'],
                                'username': m['username'],
                                'display_name': m['display_name'],
                                'avatar_url': m['avatar_url'],
                                'is_muted': bool(m['is_muted']),
                                'is_deaf': bool(m['is_deaf'])
                            } for m in remaining] if remaining else []
                            
                            emit('voice_members_update', {
                                'channel_id': channel_id,
                                'members': remaining_list,
                                'total_members': len(remaining_list)
                            }, room=voice_room)
                            
                            log.info(f"[VOICE] Cleaned up voice session for {username} from channel {channel_id}, notified room")
                
                # Update user status to offline
                cur.execute("""
                    UPDATE users
                    SET status = 'offline', last_seen = NOW()
                    WHERE username = %s
                """, (username,))
            conn.commit()

            socketio.emit('user_status', {
                'username': username,
                'status': 'offline'
            }, namespace='/')

            # Clean up any active 1-to-1 calls for this user + persist call logs
            calls_to_remove = []
            for cid, c in active_calls.items():
                if username in (c['caller'], c['callee']):
                    other = c['caller'] if username == c['callee'] else c['callee']
                    other_sid = user_socket_sessions.get(other)
                    if other_sid:
                        emit('call:ended', {
                            'callId': cid,
                            'by': username,
                            'reason': 'disconnected',
                        }, room=other_sid)
                    # Persist call log based on state when user disconnected
                    if c['status'] == 'connected' and c.get('connected_at'):
                        duration = int((datetime.utcnow() - datetime.fromisoformat(c['connected_at'])).total_seconds())
                        _emit_call_log(c, 'attended', max(duration, 1))
                    elif c['status'] == 'ringing':
                        _emit_call_log(c, 'missed', 0)
                    calls_to_remove.append(cid)
            for cid in calls_to_remove:
                del active_calls[cid]
            if calls_to_remove:
                log.info(f"[CALL] Cleaned up {len(calls_to_remove)} call(s) for disconnected user {username}")

            log.info(f"[SOCKET] {username} disconnected - offline and cleaned up voice sessions")

        except Exception as e:
            log.error(f"[SOCKET] Disconnect error: {e}", exc_info=True)
        finally:
            if conn:
                conn.close()

    # ============================================================================
    # MESSAGING EVENTS
    # ============================================================================

    # ============================================================================
    # CHANNEL ROOM MANAGEMENT
    # ============================================================================

    @socketio.on('join_channel')
    def on_join_channel(data):
        conn = None
        try:
            username = get_user_from_socket()
            if not username:
                log.error(f"[SOCKET] join_channel: Could not get user from socket")
                return

            channel_id = data.get('channel_id')
            log.info(f"[SOCKET] User {username} attempting to join channel {channel_id}")

            if not channel_id or not str(channel_id).isdigit():
                log.error(f"[SOCKET] Invalid channel_id: {channel_id}")
                return

            # Verify user can access the channel
            conn = get_db_connection()
            with conn.cursor() as cur:
                # FIX 1: Use cached get_user_id
                user_id = get_user_id(username, cur)
                if not user_id:
                    log.warning(f"[SOCKET] User {username} not found when joining channel {channel_id}")
                    return

                cur.execute("SELECT community_id FROM channels WHERE id = %s", (channel_id,))
                channel_row = cur.fetchone()
                if not channel_row:
                    log.warning(f"[SOCKET] Channel {channel_id} not found")
                    return
                community_id = channel_row['community_id']

                # Check channel membership OR community ownership/admin role
                cur.execute("""
                    SELECT 1 FROM channel_members
                    WHERE user_id = %s AND channel_id = %s
                """, (user_id, channel_id))
                is_channel_member = cur.fetchone()

                cur.execute("""
                    SELECT role FROM community_members
                    WHERE community_id = %s AND user_id = %s
                """, (community_id, user_id))
                role_row = cur.fetchone()
                user_role = role_row['role'] if role_row else None

                if not (is_channel_member or user_role in ('owner', 'admin')):
                    log.warning(f"[SOCKET] User {username} NOT allowed in channel {channel_id} (role={user_role})")
                    return

            room = f"channel_{channel_id}"
            join_room(room)
            
            # Verify room membership and log current rooms
            from flask_socketio import rooms as get_rooms
            from flask import request as flask_request
            current_rooms = get_rooms(sid=flask_request.sid, namespace='/')
            log.info(f"[SOCKET] ✓ {username} (SID: {flask_request.sid}) joined room: {room}")
            log.info(f"[SOCKET] 🔍 User {username} is now in rooms: {current_rooms}")

            emit('status', {
                'msg': f"{username} joined the channel",
                'username': username,
                'type': 'join'
            }, room=room)

            log.info(f"[SOCKET] Status event emitted to room {room}")

        except Exception as e:
            log.error(f"[SOCKET] join_channel error: {e}", exc_info=True)
        finally:
            if conn:
                conn.close()

    @socketio.on('leave_channel')
    def on_leave_channel(data):
        try:
            username = get_user_from_socket()
            if not username:
                return

            channel_id = data.get('channel_id')
            room = f"channel_{channel_id}"

            leave_room(room)
            emit('status', {
                'msg': f"{username} left the channel",
                'username': username,
                'type': 'leave'
            }, room=room)

            log.info(f"[SOCKET] {username} left room: {room}")

        except Exception as e:
            log.error(f"[SOCKET] leave_channel error: {e}")

    # ============================================================================
    # TYPING INDICATORS
    # ============================================================================

    @socketio.on('typing')
    def on_typing(data):
        try:
            username = get_user_from_socket()
            if not username:
                return

            channel_id = data.get('channel_id')
            is_typing = data.get('is_typing', True)

            room = f"channel_{channel_id}"
            emit('user_typing', {
                'username': username,
                'channel_id': channel_id,
                'is_typing': is_typing
            }, room=room, include_self=False)

            log.debug(f"[SOCKET] {username} typing={is_typing} in channel {channel_id}")

        except Exception as e:
            log.error(f"[SOCKET] typing error: {e}")

    # ============================================================================
    # MESSAGE EVENTS
    # ============================================================================

    @socketio.on('new_message')
    def on_new_message(data):
        conn = None
        try:
            username = get_user_from_socket()
            if not username:
                log.error(f"[SOCKET] new_message: Could not get user from socket")
                return

            # Rate limiting
            if _socket_rate_limited(request.sid):
                emit('error', {'message': 'Rate limit exceeded. Slow down.'})
                return

            channel_id = data.get('channel_id')
            message = data.get('message')
            content = message.get('content', '')
            message_id = message.get('id')

            # Message length validation
            if len(content) > 5000:
                emit('error', {'message': 'Message too long (max 5000 characters)'})
                return

            # Ensure essential fields are present on the message payload
            message['channel_id'] = channel_id
            if not message.get('created_at'):
                message['created_at'] = datetime.now().isoformat()

            log.info(f"[SOCKET] new_message received: message_id={message_id}, channel_id={channel_id}, user={username}")

            # Get user ID and community ID for moderation
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("SELECT id, display_name, avatar_url FROM users WHERE username = %s", (username,))
                user_row = cur.fetchone()
                if not user_row:
                    log.error(f"[SOCKET] User not found: {username}")
                    return
                user_id = user_row['id']
                sender_display_name = user_row.get('display_name') or username
                sender_avatar = user_row.get('avatar_url')
                log.info(f"[SOCKET] User {username} has id {user_id}")
                
                # Get community_id + channel name from channel
                cur.execute("""
                    SELECT c.community_id, c.name AS channel_name,
                           cm.name AS community_name, cm.logo_url AS community_logo,
                           cm.icon AS community_icon, cm.color AS community_color
                    FROM channels c
                    LEFT JOIN communities cm ON cm.id = c.community_id
                    WHERE c.id = %s
                """, (channel_id,))
                channel_row = cur.fetchone()
                community_id = channel_row['community_id'] if channel_row else None
                channel_name = channel_row['channel_name'] if channel_row else None
                community_name = channel_row['community_name'] if channel_row else None
                community_logo = channel_row['community_logo'] if channel_row else None
                community_icon = channel_row['community_icon'] if channel_row else None
                community_color = channel_row['community_color'] if channel_row else None
                log.info(f"[SOCKET] Channel {channel_id} belongs to community {community_id}")
                
                # Check if user is blocked from this community
                is_blocked = False
                if community_id:
                    cur.execute("""
                        SELECT 1 FROM blocked_users 
                        WHERE community_id = %s AND user_id = %s
                    """, (community_id, user_id))
                    is_blocked = cur.fetchone() is not None
                    
                    if is_blocked:
                        log.info(f"[SOCKET] User {username} is BLOCKED in community {community_id}")
            
            # 🛡️ BATCH MODERATION — instant-check → broadcast → Redis buffer → Gemini batch
            # Messages broadcast INSTANTLY (only extreme content blocked pre-broadcast).
            # All messages pushed to a per-channel Redis buffer.
            # When buffer reaches 10 msgs or 30s timeout, Celery batch-reviews with Gemini.
            moderation_installed = False
            final_action = 'allow'
            if community_id:
                try:
                    chk_conn = get_db_connection()
                    with chk_conn.cursor() as chk_cur:
                        chk_cur.execute("""
                            SELECT 1 FROM community_agents
                            WHERE community_id = %s AND agent_type = 'moderation' AND enabled = TRUE
                        """, (community_id,))
                        moderation_installed = chk_cur.fetchone() is not None
                    chk_conn.close()
                except Exception:
                    moderation_installed = True

            instant_result = None
            if moderation_installed and content:
                instant_result = moderation_agent.instant_check(content)
                if instant_result.get('block'):
                    final_action = 'block'

            message['moderation'] = {
                'action': final_action,
                'severity': 'high' if final_action == 'block' else 'none',
                'confidence': 1.0 if final_action == 'block' else 0,
                'reasons': [instant_result['reason']] if final_action == 'block' and instant_result else [],
                'violation_count': 0,
                'message': None,
                'explanation': '',
                'pending_ai_review': moderation_installed and final_action == 'allow'
            }
            message['is_blocked'] = is_blocked

            room = f"channel_{channel_id}"
            
            # 🤖 AI COMMAND HANDLING
            if content.strip().startswith('/'):
                log.info(f"[COMMAND] Detected command: {content}")
                try:
                    command_result = handle_ai_command(content, username, user_id, channel_id, community_id)
                    if command_result:
                        emit('command_result', command_result, room=request.sid)
                        emit('message_received', {
                            **message, 'author': username
                        }, room=room, include_self=True)
                        return
                except Exception as cmd_error:
                    log.error(f"[COMMAND] Error: {cmd_error}", exc_info=True)
                    emit('command_result', {
                        'type': 'error', 'success': False,
                        'error': f'Command failed: {str(cmd_error)}'
                    }, room=request.sid)
            
            # ── BROADCAST or BLOCK ──
            if final_action == 'block':
                # Extreme content — don't broadcast
                emit('message_blocked', {
                    'message_id': message_id,
                    'reason': 'Your message was blocked: ' + (instant_result.get('reason', 'extreme content') if instant_result else 'policy violation'),
                    'severity': 'high',
                    'appeal_available': True
                })
                if community_id:
                    socketio.emit('moderation_action_logged', {
                        'community_id': community_id, 'channel_id': channel_id,
                        'action': 'block', 'severity': 'high',
                        'timestamp': datetime.now().isoformat()
                    }, room=f"community_{community_id}", namespace='/')
                # Log the instant block
                try:
                    moderation_agent.log_moderation_action(
                        user_id, channel_id, content, 'block', 'high',
                        [instant_result.get('reason', 'extreme_content')] if instant_result else ['extreme_content'],
                        1.0, message_id
                    )
                except Exception:
                    pass
            else:
                # ✅ BROADCAST INSTANTLY — Gemini will review in batch later
                emit('message_received', {
                    **message, 'author': username
                }, room=room, include_self=True)
                
                # Push to Redis buffer for batch Gemini review
                if moderation_installed and content and message_id:
                    try:
                        import time as _time
                        buf_len = moderation_agent.push_to_buffer(channel_id, {
                            'msg_id': message_id,
                            'user_id': user_id,
                            'username': username,
                            'content': content[:1000],
                            'timestamp': _time.time()
                        })
                        
                        # Check if we should trigger a batch review
                        if buf_len >= moderation_agent.BATCH_SIZE:
                            from tasks.agent_tasks import batch_moderation_task
                            batch_moderation_task.delay(channel_id, community_id)
                            log.info(f"[MODERATION] Batch triggered for channel {channel_id} ({buf_len} msgs)")
                    except Exception as buf_err:
                        log.warning(f"[MODERATION] Buffer push failed: {buf_err}")

            # ── Real-time unread delivery ──────────────────────────────────
            if final_action != 'block':
                if community_id:
                    socketio.emit('channel_activity', {
                        'channel_id': channel_id,
                        'community_id': community_id,
                        'sender_id': user_id,
                        'message_id': message_id,
                        'sender_name': sender_display_name,
                        'sender_avatar': sender_avatar,
                        'channel_name': channel_name,
                        'community_name': community_name,
                        'community_logo': community_logo,
                        'community_icon': community_icon,
                        'community_color': community_color,
                        'content_preview': (content[:120] + '…') if len(content) > 120 else content,
                    }, room=f"community_{community_id}", namespace='/')

                try:
                    from services.unread_tracker import increment_channel_unread
                    increment_channel_unread(channel_id, user_id, community_id)
                except Exception as unread_err:
                    log.warning(f"[UNREAD] increment_channel_unread failed: {unread_err}")

            log.info(f"[SOCKET] Message from {username} to channel {channel_id} - Action: {final_action}")

            # 🤖 AGENT AUTO-EXECUTION (fire-and-forget via Celery)
            # Only dispatch for text messages that weren't blocked
            if content and final_action != 'block' and not content.strip().startswith('/'):
                # Mood tracking — personal agent
                try:
                    from tasks.agent_tasks import track_mood_task
                    track_mood_task.delay(content, user_id, channel_id)
                except Exception as e:
                    log.debug(f"[AGENT_DISPATCH] Mood task skipped: {e}")

                # Focus analysis — community agent (every 50th message in past hour)
                try:
                    from tasks.agent_tasks import analyze_focus_task
                    focus_conn = get_db_connection()
                    try:
                        with focus_conn.cursor() as fc:
                            fc.execute("""
                                SELECT COUNT(*) as cnt FROM messages
                                WHERE channel_id = %s AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
                            """, (channel_id,))
                            msg_count = fc.fetchone()['cnt']
                        if msg_count > 0 and msg_count % 50 == 0:
                            analyze_focus_task.delay(channel_id, community_id)
                    finally:
                        focus_conn.close()
                except Exception as e:
                    log.debug(f"[AGENT_DISPATCH] Focus task skipped: {e}")

        except Exception as e:
            log.error(f"[SOCKET] new_message error: {e}", exc_info=True)
        finally:
            if conn:
                conn.close()

    # ============================================================================
    # DIRECT MESSAGE EVENTS
    # ============================================================================

    @socketio.on('join_dm')
    def on_join_dm(data):
        """Join a direct message conversation room."""
        conn = None
        try:
            log.info("[SOCKET] 🚪 join_dm event RECEIVED")
            
            username = get_user_from_socket()
            if not username:
                log.error("[SOCKET] join_dm: No user found")
                return

            user_id = data.get('user_id')
            log.info(f"[SOCKET] 🚪 {username} joining DM with user_id: {user_id}")
            
            # FIX 1: Use cached get_user_id (avoids DB per DM join/leave)
            current_user_id = user_id_cache.get(username) or get_user_id(username)
            if not current_user_id:
                log.error(f"[SOCKET] Could not find user ID for {username}")
                return
            
            # Create a consistent room name using IDs (smallest ID first)
            room = f"dm_{min(current_user_id, user_id)}_{max(current_user_id, user_id)}"
            join_room(room)
            
            log.info(f"[SOCKET] 🚪✅ {username} (ID: {current_user_id}) joined room: {room}")

        except Exception as e:
            log.error(f"[SOCKET] join_dm error: {e}", exc_info=True)
        finally:
            if conn:
                conn.close()

    @socketio.on('leave_dm')
    def on_leave_dm(data):
        """Leave a direct message conversation room."""
        conn = None
        try:
            username = get_user_from_socket()
            if not username:
                log.error("[SOCKET] leave_dm: No user found")
                return

            user_id = data.get('user_id')
            log.info(f"[SOCKET] {username} leaving DM with user_id: {user_id}")
            
            # FIX 1: Use cached get_user_id (avoids DB per DM join/leave)
            current_user_id = user_id_cache.get(username) or get_user_id(username)
            if not current_user_id:
                log.error(f"[SOCKET] Could not find user ID for {username}")
                return
            
            # Create a consistent room name using IDs (smallest ID first)
            room = f"dm_{min(current_user_id, user_id)}_{max(current_user_id, user_id)}"
            leave_room(room)
            
            log.info(f"[SOCKET] {username} (ID: {current_user_id}) left room: {room}")

        except Exception as e:
            log.error(f"[SOCKET] leave_dm error: {e}")
        finally:
            if conn:
                conn.close()

    @socketio.on('typing_dm')
    def on_typing_dm(data):
        """Handle typing indicator in direct messages."""
        try:
            username = get_user_from_socket()
            if not username:
                log.error("[SOCKET] typing_dm: No user found")
                return

            user_id = data.get('user_id')
            is_typing = data.get('is_typing', True)
            
            # Use cached user ID (populated on connect) — avoids DB hit per keystroke
            current_user_id = user_id_cache.get(username)
            if not current_user_id:
                # FIX 1: Use cached get_user_id as fallback
                current_user_id = get_user_id(username)
                if current_user_id:
                    user_id_cache[username] = current_user_id
            
            if not current_user_id:
                log.error(f"[SOCKET] Could not find user ID for {username}")
                return
            
            # Create consistent room name
            room = f"dm_{min(current_user_id, user_id)}_{max(current_user_id, user_id)}"
            
            # Emit typing indicator to all users in the room EXCEPT sender
            emit('user_typing_dm', {
                'user_id': current_user_id,
                'username': username,
                'is_typing': is_typing
            }, room=room, include_self=False)

        except Exception as e:
            log.error(f"[SOCKET] typing_dm error: {e}", exc_info=True)

    @socketio.on('send_direct_message')
    def on_send_direct_message(data):
        """Handle incoming direct message and broadcast to recipient."""
        conn = None
        try:
            log.info("[SOCKET] 📤📤📤 send_direct_message event RECEIVED from frontend")
            log.info(f"[SOCKET] Data received: {data}")
            
            username = get_user_from_socket()
            if not username:
                log.error("[SOCKET] send_direct_message: No user found")
                return

            sender_id = data.get('sender_id')
            receiver_id = data.get('receiver_id')
            content = data.get('content')
            message_id = data.get('id')
            created_at = data.get('created_at')
            sender = data.get('sender')

            log.info(f"[SOCKET] 📤 send_direct_message from {sender_id} to {receiver_id}: {str(content)[:50]}")

            # Get sender's username to verify
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("SELECT username FROM users WHERE id = %s", (sender_id,))
                sender_result = cur.fetchone()
                sender_username = sender_result['username'] if sender_result else None

            if sender_username != username:
                log.error(f"[SOCKET] Sender mismatch: {username} vs {sender_username}")
                return

            # Create consistent room identifier using IDs (smallest first)
            room = f"dm_{min(sender_id, receiver_id)}_{max(sender_id, receiver_id)}"
            
            log.info(f"[SOCKET] 📤 Room name: {room}")

            message_data = {
                'id': message_id,
                'sender_id': sender_id,
                'receiver_id': receiver_id,
                'content': content,
                'message_type': data.get('message_type', 'text'),
                'created_at': created_at,
                'is_read': data.get('is_read', False),
                'sender': sender,
                'receiver': data.get('receiver'),
                'edited_at': data.get('edited_at')
            }

            # Broadcast to the DM room (for users actively in the conversation)
            # Use include_self=False because sender already has it locally
            log.info(f"[SOCKET] 📤 Emitting receive_direct_message to room {room}")
            emit('receive_direct_message', message_data, room=room, include_self=False)
            log.info(f"[SOCKET] 📤✅ Broadcasted message to DM room: {room}")

            # ALSO emit to receiver's personal room for notifications
            # This ensures they get the message even if they're not in the DM conversation
            receiver_room = f"user_{receiver_id}"
            log.info(f"[SOCKET] 🔔 Emitting receive_direct_message to receiver's personal room: {receiver_room}")
            socketio.emit('receive_direct_message', message_data, to=receiver_room, namespace='/')
            
            # Track DM unread count
            try:
                from services.unread_tracker import increment_dm_unread
                increment_dm_unread(receiver_id, sender_id)
            except ImportError:
                pass

        except Exception as e:
            log.error(f"[SOCKET] send_direct_message error: {e}", exc_info=True)
        finally:
            if conn:
                conn.close()

    # ============================================================================
    # COMMUNITY EVENTS
    # ============================================================================

    @socketio.on('community_created')
    def on_community_created(data):
        try:
            username = get_user_from_socket()
            if not username:
                return

            log.info(f"[SOCKET] Community created by {username}: {data.get('name')}")
            emit('community_created', data, broadcast=True)

        except Exception as e:
            log.error(f"[SOCKET] community_created error: {e}")

    # ============================================================================
    # CHANNEL OPERATIONS
    # ============================================================================

    @socketio.on('channel_created')
    def on_channel_created(data):
        """Broadcast when a new channel is created."""
        try:
            username = get_user_from_socket()
            if not username:
                return

            community_id = data.get('community_id')
            channel_id = data.get('id')
            channel_name = data.get('name')

            emit('channel_created', {
                'id': channel_id,
                'community_id': community_id,
                'name': channel_name,
                'type': data.get('type', 'text'),
                'description': data.get('description'),
                'created_at': data.get('created_at'),
            }, broadcast=True)

            log.info(f"[SOCKET] Channel created: {channel_name} (ID: {channel_id}) in community {community_id}")

        except Exception as e:
            log.error(f"[SOCKET] channel_created error: {e}")

    @socketio.on('channel_updated')
    def on_channel_updated(data):
        """Broadcast when a channel is updated."""
        try:
            username = get_user_from_socket()
            if not username:
                return

            channel_id = data.get('id')
            community_id = data.get('community_id')

            emit('channel_updated', {
                'id': channel_id,
                'community_id': community_id,
                'name': data.get('name'),
                'type': data.get('type'),
                'description': data.get('description'),
                'updated_at': datetime.now().isoformat(),
            }, broadcast=True)

            log.info(f"[SOCKET] Channel updated: {channel_id}")

        except Exception as e:
            log.error(f"[SOCKET] channel_updated error: {e}")

    @socketio.on('channel_deleted')
    def on_channel_deleted(data):
        """Broadcast when a channel is deleted."""
        try:
            username = get_user_from_socket()
            if not username:
                return

            channel_id = data.get('id')
            community_id = data.get('community_id')

            room = f"channel_{channel_id}"
            emit('status', {
                'msg': f"Channel has been deleted",
                'type': 'delete'
            }, room=room)

            emit('channel_deleted', {
                'id': channel_id,
                'community_id': community_id,
            }, broadcast=True)

            log.info(f"[SOCKET] Channel deleted: {channel_id}")

        except Exception as e:
            log.error(f"[SOCKET] channel_deleted error: {e}")

    @socketio.on('community_member_added')
    def on_community_member_added(data):
        """Broadcast when a member is added to a community."""
        try:
            username = get_user_from_socket()
            if not username:
                return

            community_id = data.get('community_id')
            member_id = data.get('member_id')
            member_username = data.get('member_username')

            emit('community_member_added', {
                'community_id': community_id,
                'member_id': member_id,
                'member_username': member_username,
                'added_at': datetime.now().isoformat(),
            }, broadcast=True)

            log.info(f"[SOCKET] Member {member_username} added to community {community_id}")

        except Exception as e:
            log.error(f"[SOCKET] community_member_added error: {e}")

    # ============================================================================
    # VOICE CHANNEL EVENTS - FIXED SIGNALING
    # ============================================================================

    @socketio.on('join_voice_channel')
    def on_join_voice_channel(data):
        """User joins a voice channel."""
        conn = None
        try:
            username = get_user_from_socket()
            if not username:
                log.error("[VOICE] No username from socket")
                return

            channel_id = data.get('channel_id')
            log.info(f"[VOICE] {username} joining channel {channel_id}")

            if not channel_id or not str(channel_id).isdigit():
                log.error(f"[VOICE] Invalid channel_id: {channel_id}")
                emit('voice_error', {'message': 'Invalid channel'})
                return

            conn = get_db_connection()
            with conn.cursor() as cur:
                # Verify channel is voice type and user is member
                cur.execute("""
                    SELECT ch.id, ch.name, ch.type, u.id as user_id, u.display_name, u.avatar_url
                    FROM channels ch
                    JOIN channel_members cm ON ch.id = cm.channel_id
                    JOIN users u ON cm.user_id = u.id
                    WHERE ch.id = %s AND u.username = %s AND ch.type = 'voice'
                """, (channel_id, username))
                channel_info = cur.fetchone()

                if not channel_info:
                    log.warning(f"[VOICE] {username} NOT member of voice channel {channel_id}")
                    emit('voice_error', {'message': 'Not a member of this voice channel'})
                    return

                user_id = channel_info['user_id']
                display_name = channel_info['display_name']
                avatar_url = channel_info['avatar_url']
                channel_name = channel_info['name']

                # Create or get voice_channels entry
                cur.execute("""
                    SELECT id FROM voice_channels WHERE channel_id = %s
                """, (channel_id,))
                voice_channel = cur.fetchone()
                
                if not voice_channel:
                    cur.execute("""
                        INSERT INTO voice_channels (name, channel_id, is_active)
                        VALUES (%s, %s, 1)
                    """, (channel_name, channel_id))
                    conn.commit()
                    voice_channel_id = cur.lastrowid
                    log.info(f"[VOICE] Created voice_channels entry {voice_channel_id} for channel {channel_id}")
                else:
                    voice_channel_id = voice_channel['id']

                # Insert user into voice_participants
                cur.execute("""
                    INSERT INTO voice_participants (voice_channel_id, user_id, joined_at)
                    VALUES (%s, %s, CURRENT_TIMESTAMP)
                    ON DUPLICATE KEY UPDATE 
                        joined_at = CURRENT_TIMESTAMP,
                        left_at = NULL
                """, (voice_channel_id, user_id))
                conn.commit()
                log.info(f"[VOICE] {username} inserted into voice_participants")

                # Also insert into voice_sessions for state tracking
                cur.execute("""
                    INSERT INTO voice_sessions (channel_id, user_id, is_muted, is_deaf)
                    VALUES (%s, %s, 0, 0)
                    ON DUPLICATE KEY UPDATE 
                        joined_at = CURRENT_TIMESTAMP,
                        last_activity = CURRENT_TIMESTAMP,
                        is_muted = 0,
                        is_deaf = 0
                """, (channel_id, user_id))
                conn.commit()
                log.info(f"[VOICE] {username} inserted into voice_sessions")

                # Get all active participants (use GROUP BY to avoid duplicates)
                cur.execute("""
                    SELECT u.id, u.username, u.display_name, u.avatar_url,
                           COALESCE(vs.is_muted, 0) as is_muted,
                           COALESCE(vs.is_deaf, 0) as is_deaf,
                           MIN(vp.joined_at) as joined_at
                    FROM voice_participants vp
                    JOIN users u ON vp.user_id = u.id
                    LEFT JOIN voice_sessions vs ON vs.channel_id = %s AND vs.user_id = u.id
                    WHERE vp.voice_channel_id = %s AND vp.left_at IS NULL
                    GROUP BY u.id, u.username, u.display_name, u.avatar_url, vs.is_muted, vs.is_deaf
                    ORDER BY MIN(vp.joined_at) ASC
                """, (channel_id, voice_channel_id))
                members = cur.fetchall()
                log.info(f"[VOICE] Found {len(members) if members else 0} active members in channel")

            voice_room = f"voice_{channel_id}"
            join_room(voice_room)
            log.info(f"[VOICE] {username} joined socket room: {voice_room}")

            # Build members list safely
            members_list = []
            if members:
                members_list = [{
                    'id': m['id'],
                    'username': m['username'],
                    'display_name': m['display_name'],
                    'avatar_url': m['avatar_url'],
                    'is_muted': bool(m['is_muted']),
                    'is_deaf': bool(m['is_deaf'])
                } for m in members]

            # Send members list to joining user
            log.info(f"[VOICE] About to emit voice_members_update with {len(members_list)} members")
            emit('voice_members_update', {
                'channel_id': channel_id,
                'members': members_list,
                'total_members': len(members_list)
            })
            log.info(f"[VOICE] Sent members update to {username}: {len(members_list)} members")

            # Notify others
            emit('user_joined_voice', {
                'username': username,
                'user_id': user_id,
                'display_name': display_name,
                'avatar_url': avatar_url,
                'channel_id': channel_id,
                'timestamp': datetime.now().isoformat()
            }, room=voice_room, include_self=False)

            log.info(f"[VOICE] {username} successfully joined voice channel {channel_id}")

        except Exception as e:
            log.error(f"[VOICE] join_voice_channel error: {e}", exc_info=True)
            emit('voice_error', {'message': f'Failed to join: {str(e)}'})
        finally:
            if conn:
                conn.close()

    @socketio.on('leave_voice_channel')
    def on_leave_voice_channel(data):
        """User leaves a voice channel."""
        conn = None
        try:
            username = get_user_from_socket()
            if not username:
                return

            channel_id = data.get('channel_id')
            voice_room = f"voice_{channel_id}"
            log.info(f"[VOICE] {username} leaving channel {channel_id}")

            conn = get_db_connection()
            with conn.cursor() as cur:
                # FIX 1: Use cached get_user_id
                user_id = get_user_id(username, cur)

                if user_id:
                    
                    # Delete from voice_participants completely
                    cur.execute("""
                        DELETE FROM voice_participants
                        WHERE user_id = %s 
                        AND voice_channel_id = (SELECT id FROM voice_channels WHERE channel_id = %s)
                    """, (user_id, channel_id))
                    conn.commit()
                    log.info(f"[VOICE] Deleted {username} from voice_participants for channel {channel_id}")
                    
                    # Delete from voice_sessions
                    cur.execute("""
                        DELETE FROM voice_sessions 
                        WHERE channel_id = %s AND user_id = %s
                    """, (channel_id, user_id))
                    conn.commit()
                    log.info(f"[VOICE] Removed {username} from voice_sessions")
                    
                    # Get remaining active members
                    cur.execute("""
                        SELECT u.id, u.username, u.display_name, u.avatar_url,
                               COALESCE(vs.is_muted, 0) as is_muted,
                               COALESCE(vs.is_deaf, 0) as is_deaf,
                               MIN(vp.joined_at) as joined_at
                        FROM voice_participants vp
                        JOIN users u ON vp.user_id = u.id
                        LEFT JOIN voice_sessions vs ON vs.channel_id = %s AND vs.user_id = u.id
                        WHERE vp.voice_channel_id = (SELECT id FROM voice_channels WHERE channel_id = %s)
                        GROUP BY u.id, u.username, u.display_name, u.avatar_url, vs.is_muted, vs.is_deaf
                        ORDER BY MIN(vp.joined_at) ASC
                    """, (channel_id, channel_id))
                    remaining_members = cur.fetchall()
                    
                    members_list = [{
                        'id': m['id'],
                        'username': m['username'],
                        'display_name': m['display_name'],
                        'avatar_url': m['avatar_url'],
                        'is_muted': bool(m['is_muted']),
                        'is_deaf': bool(m['is_deaf'])
                    } for m in remaining_members]
                else:
                    members_list = []

            leave_room(voice_room)
            log.info(f"[VOICE] {username} left socket room: {voice_room}")

            # Notify others
            emit('user_left_voice', {
                'username': username,
                'channel_id': channel_id,
                'timestamp': datetime.now().isoformat()
            }, room=voice_room)

            # Send updated members list
            emit('voice_members_update', {
                'channel_id': channel_id,
                'members': members_list,
                'total_members': len(members_list)
            }, room=voice_room)

            log.info(f"[VOICE] {username} successfully left channel {channel_id}")

        except Exception as e:
            log.error(f"[VOICE] leave_voice_channel error: {e}", exc_info=True)
        finally:
            if conn:
                conn.close()

    @socketio.on('send_offer')
    def on_send_offer(data):
        """Send WebRTC offer to target peer via the voice room."""
        try:
            username = get_user_from_socket()
            if not username:
                log.error("[VOICE] send_offer: No username")
                return
            if _socket_rate_limited(request.sid):
                return

            channel_id = data.get('channel_id')
            target_user = data.get('target_user')  # This is a username
            offer = data.get('offer')

            log.info(f"[VOICE] 📤 Offer from {username} to {target_user}")

            # Route through the voice room — guarantees delivery to the
            # socketService socket that VoiceContext is listening on,
            # regardless of which socket registered last in user_socket_sessions.
            voice_room = f"voice_{channel_id}"
            log.info(f"[VOICE] 📤 Sending offer to {target_user} via room {voice_room}")
            emit('receive_offer', {
                'from': username,
                'offer': offer,
                'channel_id': channel_id,
                'target': target_user
            }, room=voice_room, include_self=False)

            log.info(f"[VOICE] ✅ Offer sent from {username} to {target_user}")

        except Exception as e:
            log.error(f"[VOICE] send_offer error: {e}", exc_info=True)

    @socketio.on('send_answer')
    def on_send_answer(data):
        """Send WebRTC answer to target peer via the voice room."""
        try:
            username = get_user_from_socket()
            if not username:
                log.error("[VOICE] send_answer: No username")
                return
            if _socket_rate_limited(request.sid):
                return

            channel_id = data.get('channel_id')
            target_user = data.get('target_user')
            answer = data.get('answer')

            log.info(f"[VOICE] 📤 Answer from {username} to {target_user}")

            voice_room = f"voice_{channel_id}"
            log.info(f"[VOICE] 📤 Sending answer to {target_user} via room {voice_room}")
            emit('receive_answer', {
                'from': username,
                'answer': answer,
                'channel_id': channel_id,
                'target': target_user
            }, room=voice_room, include_self=False)

            log.info(f"[VOICE] ✅ Answer sent from {username} to {target_user}")

        except Exception as e:
            log.error(f"[VOICE] send_answer error: {e}", exc_info=True)

    @socketio.on('send_ice_candidate')
    def on_send_ice_candidate(data):
        """Send ICE candidate to target peer via the voice room."""
        try:
            username = get_user_from_socket()
            if not username:
                return

            channel_id = data.get('channel_id')
            target_user = data.get('target_user')
            candidate = data.get('candidate')

            voice_room = f"voice_{channel_id}"
            emit('receive_ice_candidate', {
                'from': username,
                'candidate': candidate,
                'channel_id': channel_id,
                'target': target_user
            }, room=voice_room, include_self=False)

        except Exception as e:
            log.error(f"[VOICE] send_ice_candidate error: {e}")

    @socketio.on('voice_state_changed')
    def on_voice_state_changed(data):
        """Broadcast voice state changes (mute/deaf)."""
        conn = None
        try:
            username = get_user_from_socket()
            if not username:
                return
            if _socket_rate_limited(request.sid):
                return

            channel_id = data.get('channel_id')
            is_muted = data.get('is_muted', False)
            is_deaf = data.get('is_deaf', False)

            # Update voice_sessions in database
            conn = get_db_connection()
            with conn.cursor() as cur:
                # FIX 1: Use cached user_id instead of subquery
                _uid = user_id_cache.get(username) or get_user_id(username)
                cur.execute("""
                    UPDATE voice_sessions 
                    SET is_muted = %s, is_deaf = %s, last_activity = CURRENT_TIMESTAMP
                    WHERE channel_id = %s AND user_id = %s
                """, (is_muted, is_deaf, channel_id, _uid))
                conn.commit()
                log.info(f"[VOICE] Updated voice_sessions for {username}: muted={is_muted}, deaf={is_deaf}")

            voice_room = f"voice_{channel_id}"

            emit('voice_state_update', {
                'username': username,
                'channel_id': channel_id,
                'is_muted': is_muted,
                'is_deaf': is_deaf,
                'timestamp': datetime.now().isoformat()
            }, room=voice_room)

            log.info(f"[VOICE] {username} voice state updated - muted: {is_muted}, deaf: {is_deaf}")

        except Exception as e:
            log.error(f"[VOICE] voice_state_changed error: {e}", exc_info=True)
        finally:
            if conn:
                conn.close()

    @socketio.on('get_voice_channel_members')
    def on_get_voice_channel_members(data):
        """Get list of active users in voice channel."""
        conn = None
        try:
            username = get_user_from_socket()
            if not username:
                return

            channel_id = data.get('channel_id')
            log.info(f"[VOICE] Getting members for channel {channel_id}")

            conn = get_db_connection()
            with conn.cursor() as cur:
                # Fetch active participants from voice_participants table
                cur.execute("""
                    SELECT u.id, u.username, u.display_name, u.avatar_url,
                           COALESCE(vs.is_muted, 0) as is_muted,
                           COALESCE(vs.is_deaf, 0) as is_deaf,
                           MIN(vp.joined_at) as joined_at
                    FROM voice_participants vp
                    JOIN users u ON vp.user_id = u.id
                    LEFT JOIN voice_sessions vs ON vs.channel_id = %s AND vs.user_id = u.id
                    WHERE vp.voice_channel_id = (SELECT id FROM voice_channels WHERE channel_id = %s)
                    AND vp.left_at IS NULL
                    GROUP BY u.id, u.username, u.display_name, u.avatar_url, vs.is_muted, vs.is_deaf
                    ORDER BY MIN(vp.joined_at) ASC
                """, (channel_id, channel_id))
                members = cur.fetchall()
                log.info(f"[VOICE] Found {len(members) if members else 0} active members")

            members_list = [{
                'id': m['id'],
                'username': m['username'],
                'display_name': m['display_name'],
                'avatar_url': m['avatar_url'],
                'is_muted': bool(m['is_muted']),
                'is_deaf': bool(m['is_deaf'])
            } for m in (members or [])]

            emit('voice_channel_members', {
                'channel_id': channel_id,
                'members': members_list,
                'total_members': len(members_list)
            })

            log.info(f"[VOICE] Sent members list: {len(members_list)} users")

        except Exception as e:
            log.error(f"[VOICE] get_voice_channel_members error: {e}", exc_info=True)
            emit('voice_error', {'message': 'Failed to get channel members'})
        finally:
            if conn:
                conn.close()

    # ============================================================================
    # REACTION EVENTS
    # ============================================================================

    @socketio.on('voice:speaking')
    def on_voice_speaking(data):
        """Relay speaking state to other voice channel participants."""
        try:
            username = get_user_from_socket()
            if not username:
                return

            channel_id = data.get('channel_id')
            is_speaking = data.get('is_speaking', False)

            voice_room = f"voice_{channel_id}"
            emit('voice:speaking', {
                'username': username,
                'channel_id': channel_id,
                'is_speaking': is_speaking,
            }, room=voice_room, include_self=False)

        except Exception as e:
            log.error(f"[VOICE] voice:speaking error: {e}")

    @socketio.on('get_voice_participants')
    def on_get_voice_participants(data):
        """Get active voice participants for multiple channels (sidebar cards)."""
        conn = None
        try:
            username = get_user_from_socket()
            if not username:
                return

            channel_ids = data.get('channel_ids', [])
            if not channel_ids:
                emit('voice_participants_update', {'channels': {}})
                return

            conn = get_db_connection()
            result = {}
            with conn.cursor() as cur:
                for ch_id in channel_ids:
                    cur.execute("""
                        SELECT u.id, u.username, u.display_name, u.avatar_url
                        FROM voice_participants vp
                        JOIN voice_channels vc ON vp.voice_channel_id = vc.id
                        JOIN users u ON vp.user_id = u.id
                        WHERE vc.channel_id = %s AND vp.left_at IS NULL
                        ORDER BY vp.joined_at ASC
                        LIMIT 5
                    """, (ch_id,))
                    members = cur.fetchall()
                    
                    # Also get total count
                    cur.execute("""
                        SELECT COUNT(*) as cnt
                        FROM voice_participants vp
                        JOIN voice_channels vc ON vp.voice_channel_id = vc.id
                        WHERE vc.channel_id = %s AND vp.left_at IS NULL
                    """, (ch_id,))
                    count_row = cur.fetchone()
                    
                    result[str(ch_id)] = {
                        'members': [{
                            'id': m['id'],
                            'username': m['username'],
                            'display_name': m['display_name'],
                            'avatar_url': m['avatar_url'],
                        } for m in (members or [])],
                        'total': count_row['cnt'] if count_row else 0
                    }

            emit('voice_participants_update', {'channels': result})

        except Exception as e:
            log.error(f"[VOICE] get_voice_participants error: {e}", exc_info=True)
            emit('voice_error', {'message': 'Failed to get voice participants'})
        finally:
            if conn:
                conn.close()

    @socketio.on('message_reaction_added')
    def handle_message_reaction_added(data):
        """Handle real-time reaction addition to community messages.
        Broadcasts the full aggregated reactions so every client can replace
        its local state without needing a follow-up GET."""
        try:
            username = get_user_from_socket()
            if not username:
                emit('error', {'message': 'Unauthorized'})
                return

            message_id = data.get('message_id')
            channel_id = data.get('channel_id')
            emoji = data.get('emoji')
            user_id = data.get('user_id')

            # Pull the fresh aggregation from cache (written by the HTTP
            # toggle endpoint moments ago).  Every viewer stamps their own
            # reacted_by_current_user flag client-side.
            from services.reaction_cache import get_reactions
            reactions = get_reactions("msg", message_id, username)

            room = f"channel_{channel_id}"
            emit('message_reaction_update', {
                'message_id': message_id,
                'channel_id': channel_id,
                'emoji': emoji,
                'user_id': user_id,
                'username': username,
                'action': 'added',
                'reactions': reactions,
            }, room=room, include_self=True)

        except Exception as e:
            log.error(f"[REACTION] Error handling message reaction: {e}")
            emit('error', {'message': 'Failed to add reaction'})

    @socketio.on('message_reaction_removed')
    def handle_message_reaction_removed(data):
        """Handle real-time reaction removal from community messages"""
        try:
            username = get_user_from_socket()
            if not username:
                emit('error', {'message': 'Unauthorized'})
                return

            message_id = data.get('message_id')
            channel_id = data.get('channel_id')
            emoji = data.get('emoji')
            user_id = data.get('user_id')

            from services.reaction_cache import get_reactions
            reactions = get_reactions("msg", message_id, username)

            room = f"channel_{channel_id}"
            emit('message_reaction_update', {
                'message_id': message_id,
                'channel_id': channel_id,
                'emoji': emoji,
                'user_id': user_id,
                'username': username,
                'action': 'removed',
                'reactions': reactions,
            }, room=room, include_self=True)

        except Exception as e:
            log.error(f"[REACTION] Error handling message reaction removal: {e}")
            emit('error', {'message': 'Failed to remove reaction'})

    @socketio.on('dm_reaction_added')
    def handle_dm_reaction_added(data):
        """Handle real-time reaction addition to direct messages"""
        try:
            username = get_user_from_socket()
            if not username:
                emit('error', {'message': 'Unauthorized'})
                return

            dm_id = data.get('dm_id')
            emoji = data.get('emoji')
            user_id = data.get('user_id')
            other_user_id = data.get('other_user_id')

            from services.reaction_cache import get_reactions
            reactions = get_reactions("dm", dm_id, username)

            reaction_data = {
                'dm_id': dm_id,
                'emoji': emoji,
                'user_id': user_id,
                'username': username,
                'action': 'added',
                'reactions': reactions,
            }

            if other_user_id:
                socketio.emit('dm_reaction_update', reaction_data,
                             to=f"user_{other_user_id}", namespace='/')
            emit('dm_reaction_update', reaction_data)

        except Exception as e:
            log.error(f"[DM_REACTION] Error handling DM reaction: {e}")
            emit('error', {'message': 'Failed to add reaction'})

    @socketio.on('dm_reaction_removed')
    def handle_dm_reaction_removed(data):
        """Handle real-time reaction removal from direct messages"""
        try:
            username = get_user_from_socket()
            if not username:
                emit('error', {'message': 'Unauthorized'})
                return

            dm_id = data.get('dm_id')
            emoji = data.get('emoji')
            user_id = data.get('user_id')
            other_user_id = data.get('other_user_id')

            from services.reaction_cache import get_reactions
            reactions = get_reactions("dm", dm_id, username)

            reaction_data = {
                'dm_id': dm_id,
                'emoji': emoji,
                'user_id': user_id,
                'username': username,
                'action': 'removed',
                'reactions': reactions,
            }

            if other_user_id:
                socketio.emit('dm_reaction_update', reaction_data,
                             to=f"user_{other_user_id}", namespace='/')
            emit('dm_reaction_update', reaction_data)

        except Exception as e:
            log.error(f"[DM_REACTION] Error handling DM reaction removal: {e}")
            emit('error', {'message': 'Failed to remove reaction'})
    
    # ============================================================================
    # PIN / UNPIN EVENTS  
    # ============================================================================

    @socketio.on('pin_message')
    def handle_pin_message(data):
        """Broadcast pin event to channel members."""
        try:
            channel_id = data.get('channel_id')
            message_id = data.get('message_id')
            pinned_by = data.get('pinned_by')
            
            room = f"channel_{channel_id}"
            emit('message_pinned', {
                'channel_id': channel_id,
                'message_id': message_id,
                'pinned_by': pinned_by,
            }, to=room, include_self=True)
            log.info(f"[PIN] Message {message_id} pinned in channel {channel_id} by {pinned_by}")
        except Exception as e:
            log.error(f"[PIN] Error: {e}")

    @socketio.on('unpin_message')
    def handle_unpin_message(data):
        """Broadcast unpin event to channel members."""
        try:
            channel_id = data.get('channel_id')
            message_id = data.get('message_id')
            
            room = f"channel_{channel_id}"
            emit('message_unpinned', {
                'channel_id': channel_id,
                'message_id': message_id,
            }, to=room, include_self=True)
            log.info(f"[UNPIN] Message {message_id} unpinned in channel {channel_id}")
        except Exception as e:
            log.error(f"[UNPIN] Error: {e}")

    # ============================================================================
    # CUSTOM STATUS BROADCAST  
    # ============================================================================

    @socketio.on('update_custom_status')
    def handle_custom_status(data):
        """Broadcast custom status change to all connected users."""
        try:
            username = get_user_from_socket()
            if not username:
                return
            
            emit('user_custom_status', {
                'username': username,
                'custom_status': data.get('custom_status'),
                'custom_status_emoji': data.get('custom_status_emoji'),
            }, broadcast=True, include_self=False)
            log.info(f"[STATUS] {username} updated custom status")
        except Exception as e:
            log.error(f"[STATUS] Error: {e}")

    # ============================================================================
    # UNREAD TRACKING SOCKET EVENTS
    # ============================================================================

    @socketio.on('mark_channel_read')
    def handle_mark_channel_read(data):
        """Mark a channel as read for the current user."""
        try:
            username = get_user_from_socket()
            if not username:
                return
            
            channel_id = data.get('channel_id')
            message_id = data.get('message_id')
            user_id = user_id_cache.get(username)
            
            if not user_id or not channel_id:
                return
            
            try:
                from services.unread_tracker import mark_channel_read
                mark_channel_read(user_id, channel_id, message_id)
            except ImportError:
                # Fallback to direct DB update
                conn = get_db_connection()
                try:
                    with conn.cursor() as cur:
                        if not message_id:
                            cur.execute("SELECT MAX(id) AS max_id FROM messages WHERE channel_id = %s", (channel_id,))
                            result = cur.fetchone()
                            message_id = result['max_id'] if result else 0
                        if message_id:
                            cur.execute("""
                                INSERT INTO channel_read_status (user_id, channel_id, last_read_message_id)
                                VALUES (%s, %s, %s)
                                ON DUPLICATE KEY UPDATE
                                    last_read_message_id = GREATEST(COALESCE(last_read_message_id, 0), VALUES(last_read_message_id)),
                                    last_read_at = CURRENT_TIMESTAMP
                            """, (user_id, channel_id, message_id))
                    conn.commit()
                finally:
                    conn.close()
            
            log.debug(f"[UNREAD] {username} marked channel {channel_id} as read")
        except Exception as e:
            log.error(f"[UNREAD] mark_channel_read error: {e}")

    @socketio.on('mark_dm_read')
    def handle_mark_dm_read(data):
        """Mark DM conversation as read."""
        try:
            username = get_user_from_socket()
            if not username:
                return
            
            other_user_id = data.get('other_user_id')
            user_id = user_id_cache.get(username)
            
            if not user_id or not other_user_id:
                return
            
            try:
                from services.unread_tracker import mark_dm_read
                mark_dm_read(user_id, other_user_id)
            except ImportError:
                conn = get_db_connection()
                try:
                    with conn.cursor() as cur:
                        cur.execute("""
                            UPDATE direct_messages
                            SET is_read = TRUE, read_at = NOW()
                            WHERE sender_id = %s AND receiver_id = %s AND is_read = FALSE
                        """, (other_user_id, user_id))
                    conn.commit()
                finally:
                    conn.close()
            
            # Notify the sender that their messages were read
            socketio.emit('dm_messages_read', {
                'user_id': user_id,
                'reader_username': username,
            }, room=f"user_{other_user_id}", namespace='/')
            
            log.debug(f"[UNREAD] {username} marked DMs from user {other_user_id} as read")
        except Exception as e:
            log.error(f"[UNREAD] mark_dm_read error: {e}")

    @socketio.on('get_unreads')
    def handle_get_unreads():
        """Get all unread counts for the current user."""
        try:
            username = get_user_from_socket()
            if not username:
                return
            
            user_id = user_id_cache.get(username)
            if not user_id:
                return
            
            try:
                from services.unread_tracker import load_user_unreads, get_user_unreads, _channel_unread
                if user_id not in _channel_unread:
                    load_user_unreads(user_id)
                unreads = get_user_unreads(user_id)
                emit('initial_unreads', unreads)
            except ImportError:
                pass
        except Exception as e:
            log.error(f"[UNREAD] get_unreads error: {e}")

    # ============================================================================
    # FRIEND STATUS ROOM
    # ============================================================================

    @socketio.on('join_friend_status')
    def handle_join_friend_status():
        """Join friend status room for presence tracking."""
        try:
            username = get_user_from_socket()
            if not username:
                return
            
            user_id = user_id_cache.get(username)
            if not user_id:
                return
            
            # Send current friend statuses
            try:
                from services.presence import get_online_friends
                friend_statuses = get_online_friends(user_id)
                emit('friends_status_bulk', friend_statuses)
            except ImportError:
                pass
            
            log.debug(f"[SOCKET] {username} requested friend statuses")
        except Exception as e:
            log.error(f"[SOCKET] join_friend_status error: {e}")

    # ============================================================================
    # 1-TO-1 AUDIO / VIDEO CALL SIGNALING  (with persistent call logs)
    # ============================================================================
    # Active calls: call_id -> { caller, callee, caller_id, callee_id, status, type, started_at, connected_at }
    active_calls = {}

    def _get_user_id(username):
        """Get user id from username. FIX 1: delegates to Redis-cached helper."""
        # Fast path: in-process cache
        if username in user_id_cache:
            return user_id_cache[username]
        uid = get_user_id(username)
        if uid:
            user_id_cache[username] = uid
        return uid

    def _persist_call_log(caller_id, callee_id, call_type, status, duration, call_id):
        """Insert a call log entry into direct_messages for BOTH participants.
        Returns the created DM row dict or None."""
        import json
        content = json.dumps({
            'call_type': call_type,   # 'audio' | 'video'
            'status': status,         # 'attended' | 'missed' | 'rejected' | 'canceled'
            'duration': duration,     # seconds (0 for non-attended)
            'call_id': call_id,
        })
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO direct_messages (sender_id, receiver_id, content, message_type)
                    VALUES (%s, %s, %s, 'call')
                """, (caller_id, callee_id, content))
                msg_id = cur.lastrowid
                cur.execute("""
                    SELECT dm.*, u.username, u.display_name, u.avatar_url
                    FROM direct_messages dm
                    JOIN users u ON dm.sender_id = u.id
                    WHERE dm.id = %s
                """, (msg_id,))
                row = cur.fetchone()
                # Get receiver info
                cur.execute("SELECT id, username, display_name, avatar_url FROM users WHERE id = %s", (callee_id,))
                recv = cur.fetchone()
            conn.commit()

            if not row:
                return None

            from utils import get_avatar_url
            sender_avatar = get_avatar_url(row['username'], row['avatar_url'])
            recv_avatar = get_avatar_url(recv['username'], recv['avatar_url']) if recv else None

            return {
                'id': row['id'],
                'sender_id': row['sender_id'],
                'receiver_id': row['receiver_id'],
                'content': row['content'],
                'message_type': 'call',
                'created_at': row['created_at'].isoformat() if row['created_at'] else None,
                'is_read': False,
                'edited_at': None,
                'reply_to': None,
                'sender': {
                    'id': row['sender_id'],
                    'username': row['username'],
                    'display_name': row['display_name'] or row['username'],
                    'avatar_url': sender_avatar,
                },
                'receiver': {
                    'id': recv['id'],
                    'username': recv['username'],
                    'display_name': recv['display_name'] or recv['username'],
                    'avatar_url': recv_avatar,
                } if recv else None,
            }
        except Exception as e:
            log.error(f"[CALL] Failed to persist call log: {e}", exc_info=True)
            if conn:
                conn.rollback()
            return None
        finally:
            if conn:
                conn.close()

    def _emit_call_log(call, status, duration=0):
        """Persist a call log and broadcast it to both participants as a DM."""
        msg = _persist_call_log(
            call['caller_id'], call['callee_id'],
            call['type'], status, duration, call.get('call_id', ''),
        )
        if msg:
            # Use socketio.emit (not bare emit) so it works reliably
            # even inside disconnect handlers where request context is gone
            dm_room = f"dm_{min(call['caller_id'], call['callee_id'])}_{max(call['caller_id'], call['callee_id'])}"
            socketio.emit('receive_direct_message', msg, to=dm_room, namespace='/')
            # Also emit to personal rooms for unread badge / notification
            socketio.emit('receive_direct_message', msg, to=f"user_{call['caller_id']}", namespace='/')
            socketio.emit('receive_direct_message', msg, to=f"user_{call['callee_id']}", namespace='/')
            log.info(f"[CALL] Call log emitted: {status} (call_id={call.get('call_id')}, msg_id={msg['id']})")

            # Queue batched email notification for missed calls
            if status == 'missed':
                try:
                    from services.email_batch_service import queue_email_notification
                    queue_email_notification(call['callee_id'], 'missed_call', {
                        'sender_name': call.get('caller', 'Someone'),
                        'preview': f"Missed {call.get('type', 'audio')} call",
                    })
                except Exception:
                    pass
        else:
            log.error(f"[CALL] Failed to create call log for status={status}, call_id={call.get('call_id')}")
        return msg

    @socketio.on('call:initiate')
    def handle_call_initiate(data):
        """Caller initiates an audio or video call."""
        try:
            caller = get_user_from_socket()
            if not caller:
                emit('call:error', {'message': 'Unauthorized'})
                return

            callee_username = data.get('callee')
            call_type = data.get('type', 'audio')  # 'audio' | 'video'

            if not callee_username:
                emit('call:error', {'message': 'Missing callee'})
                return

            if callee_username == caller:
                emit('call:error', {'message': 'Cannot call yourself'})
                return

            # Check callee is online
            if callee_username not in user_socket_sessions:
                emit('call:error', {'message': 'User is offline'})
                return

            # Prevent duplicate calls — check if either party is already in a call
            for cid, c in active_calls.items():
                if c['status'] in ('ringing', 'connected'):
                    if caller in (c['caller'], c['callee']) or callee_username in (c['caller'], c['callee']):
                        emit('call:error', {'message': 'Already in a call'})
                        return

            # Get caller + callee profile info + IDs
            conn = get_db_connection()
            caller_info = {}
            callee_info = {}
            caller_id = None
            callee_id = None
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT id, username, display_name, avatar_url FROM users WHERE username = %s", (caller,))
                    row = cur.fetchone()
                    if row:
                        caller_id = row['id']
                        caller_info = {
                            'id': row['id'],
                            'username': row['username'],
                            'display_name': row['display_name'] or row['username'],
                            'avatar_url': row['avatar_url'],
                        }
                    cur.execute("SELECT id, username, display_name, avatar_url FROM users WHERE username = %s", (callee_username,))
                    row2 = cur.fetchone()
                    if row2:
                        callee_id = row2['id']
                        callee_info = {
                            'id': row2['id'],
                            'username': row2['username'],
                            'display_name': row2['display_name'] or row2['username'],
                            'avatar_url': row2['avatar_url'],
                        }
            finally:
                conn.close()

            if not caller_id or not callee_id:
                emit('call:error', {'message': 'User not found'})
                return

            import uuid
            call_id = data.get('callId') or str(uuid.uuid4())

            active_calls[call_id] = {
                'call_id': call_id,
                'caller': caller,
                'callee': callee_username,
                'caller_id': caller_id,
                'callee_id': callee_id,
                'type': call_type,
                'status': 'ringing',
                'started_at': datetime.utcnow().isoformat(),
                'connected_at': None,
            }

            # Notify callee via username room (reaches all sockets for that user)
            emit('call:ringing', {
                'callId': call_id,
                'caller': caller_info,
                'type': call_type,
            }, room=f"calluser_{callee_username}")

            # Confirm to caller
            emit('call:initiated', {
                'callId': call_id,
                'callee': callee_info,
                'type': call_type,
            })

            log.info(f"[CALL] {caller} initiated {call_type} call to {callee_username} (call_id={call_id})")

        except Exception as e:
            log.error(f"[CALL] initiate error: {e}", exc_info=True)
            emit('call:error', {'message': 'Failed to initiate call'})

    @socketio.on('call:accept')
    def handle_call_accept(data):
        """Callee accepts an incoming call."""
        try:
            username = get_user_from_socket()
            if not username:
                return

            call_id = data.get('callId')
            call = active_calls.get(call_id)
            if not call or call['callee'] != username:
                emit('call:error', {'message': 'Invalid call'})
                return

            if call['status'] != 'ringing':
                emit('call:error', {'message': 'Call no longer ringing'})
                return

            call['status'] = 'connected'
            call['connected_at'] = datetime.utcnow().isoformat()

            emit('call:accepted', {'callId': call_id}, room=f"calluser_{call['caller']}")

            log.info(f"[CALL] {username} accepted call {call_id}")

        except Exception as e:
            log.error(f"[CALL] accept error: {e}", exc_info=True)

    @socketio.on('call:reject')
    def handle_call_reject(data):
        """Callee rejects an incoming call."""
        try:
            username = get_user_from_socket()
            if not username:
                return

            call_id = data.get('callId')
            call = active_calls.get(call_id)
            if not call:
                return

            # Either party can reject/cancel
            if username not in (call['caller'], call['callee']):
                return

            other = call['caller'] if username == call['callee'] else call['callee']

            # Determine status: callee rejects = 'rejected', caller cancels = 'canceled'
            if username == call['callee']:
                status = 'rejected'
            else:
                status = 'canceled'

            emit('call:rejected', {
                'callId': call_id,
                'by': username,
            }, room=f"calluser_{other}")

            # Persist call log
            _emit_call_log(call, status, 0)

            del active_calls[call_id]
            log.info(f"[CALL] {username} {status} call {call_id}")

        except Exception as e:
            log.error(f"[CALL] reject error: {e}", exc_info=True)

    @socketio.on('call:end')
    def handle_call_end(data):
        """Either party ends an active call."""
        try:
            username = get_user_from_socket()
            if not username:
                return

            call_id = data.get('callId')
            call = active_calls.get(call_id)
            if not call:
                return

            if username not in (call['caller'], call['callee']):
                return

            other = call['caller'] if username == call['callee'] else call['callee']

            emit('call:ended', {
                'callId': call_id,
                'by': username,
            }, room=f"calluser_{other}")

            # Determine status + duration
            if call['status'] == 'connected' and call.get('connected_at'):
                # Call was answered — attended
                duration = int((datetime.utcnow() - datetime.fromisoformat(call['connected_at'])).total_seconds())
                _emit_call_log(call, 'attended', max(duration, 1))
            elif call['status'] == 'ringing':
                # Caller ended before callee picked up — missed
                if username == call['caller']:
                    _emit_call_log(call, 'missed', 0)
                else:
                    # Callee ended while ringing = rejected
                    _emit_call_log(call, 'rejected', 0)
            # else: already handled or unknown state — skip logging

            del active_calls[call_id]
            log.info(f"[CALL] {username} ended call {call_id}")

        except Exception as e:
            log.error(f"[CALL] end error: {e}", exc_info=True)

    @socketio.on('call:ice-candidate')
    def handle_ice_candidate(data):
        """Relay ICE candidate to the other party."""
        try:
            username = get_user_from_socket()
            if not username:
                return

            call_id = data.get('callId')
            call = active_calls.get(call_id)
            if not call or username not in (call['caller'], call['callee']):
                return

            other = call['caller'] if username == call['callee'] else call['callee']
            emit('call:ice-candidate', {
                'callId': call_id,
                'candidate': data.get('candidate'),
            }, room=f"calluser_{other}")

        except Exception as e:
            log.error(f"[CALL] ICE error: {e}", exc_info=True)

    @socketio.on('call:sdp-offer')
    def handle_sdp_offer(data):
        """Relay SDP offer from caller to callee."""
        try:
            username = get_user_from_socket()
            if not username:
                return

            call_id = data.get('callId')
            call = active_calls.get(call_id)
            if not call or username != call['caller']:
                return

            emit('call:sdp-offer', {
                'callId': call_id,
                'sdp': data.get('sdp'),
            }, room=f"calluser_{call['callee']}")

        except Exception as e:
            log.error(f"[CALL] SDP offer error: {e}", exc_info=True)

    @socketio.on('call:sdp-answer')
    def handle_sdp_answer(data):
        """Relay SDP answer from callee to caller."""
        try:
            username = get_user_from_socket()
            if not username:
                return

            call_id = data.get('callId')
            call = active_calls.get(call_id)
            if not call or username != call['callee']:
                return

            emit('call:sdp-answer', {
                'callId': call_id,
                'sdp': data.get('sdp'),
            }, room=f"calluser_{call['caller']}")

        except Exception as e:
            log.error(f"[CALL] SDP answer error: {e}", exc_info=True)

    # ============================================================================
    # ERROR HANDLERS
    # ============================================================================
    
    @socketio.on_error_default
    def default_error_handler(e):
        """Handle all socket errors gracefully"""
        log.error(f"[SOCKET] Error: {e}")
        # Don't emit error if connection isn't established
        if request.sid in user_socket_sessions.values():
            emit('error', {'message': 'An error occurred'})

    log.info("[SOCKET] All socket events registered successfully")
