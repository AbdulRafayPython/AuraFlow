# routes/sockets.py - Complete Socket.IO event handlers
from flask_socketio import emit, join_room, leave_room, rooms, disconnect
from flask_jwt_extended import decode_token
from flask import request
from database import get_db_connection
import logging
from datetime import datetime
import sys
import os

# Add agents directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from agents.moderation import ModerationAgent
from agents.summarizer import SummarizerAgent

log = logging.getLogger(__name__)

# Track socket sessions: username -> socket_id
user_socket_sessions = {}
# Track last heartbeat: username -> timestamp
user_heartbeats = {}
# Track user rooms: username -> list of rooms
user_rooms = {}
# Cache user IDs: username -> user_id  (avoids DB hit on every keystroke / event)
user_id_cache = {}


def handle_ai_command(content: str, username: str, user_id: int, channel_id: int, community_id: int = None):
    """Handle AI commands from chat (/summarize, /help, etc.)"""
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
            log.info(f"[COMMAND] Initializing SummarizerAgent...")
            summarizer = SummarizerAgent()
            log.info(f"[COMMAND] SummarizerAgent initialized, calling summarize_channel...")
            
            result = summarizer.summarize_channel(
                channel_id=channel_id,
                message_count=message_count,
                user_id=user_id
            )
            
            log.info(f"[COMMAND] Summarizer returned: {result}")
            
            if result.get('success'):
                # Add personalized greeting
                greeting = f"Hey {username}! 👋\n\nI know it's a bit of a long chat discussion. Here's the discussion that the chat had:\n\n"
                footer = f"\n\n📊 Summary of last {result['message_count']} messages as requested"
                summary_with_greeting = greeting + result['summary'] + footer
                
                response = {
                    'type': 'summarize',
                    'success': True,
                    'summary': summary_with_greeting,
                    'username': username,
                    'key_points': result.get('key_points', []),
                    'message_count': result['message_count'],
                    'participants': result.get('participants', []),
                    'method': result.get('method', 'extractive'),
                    'message': f"✨ Summary of last {result['message_count']} messages"
                }
                log.info(f"[COMMAND] Returning success response: {response}")
                return response
            else:
                error_response = {
                    'type': 'summarize',
                    'success': False,
                    'error': result.get('error', 'Failed to generate summary')
                }
                log.warning(f"[COMMAND] Returning error response: {error_response}")
                return error_response
        
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
    
    # Initialize moderation agent
    moderation_agent = ModerationAgent()
    log.info("[MODERATION] Smart Moderation Agent initialized")

    def get_user_from_socket():
        """Extract and verify JWT from socket connection."""
        try:
            auth = None
            
            # Check request args first (most common)
            if hasattr(request, 'args') and request.args.get('token'):
                auth = request.args.get('token')
            # Check headers
            elif hasattr(request, 'headers') and request.headers.get('Authorization'):
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
    def handle_connect():
        conn = None
        try:
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
                # Get user ID
                cur.execute("SELECT id FROM users WHERE username = %s", (username,))
                user_row = cur.fetchone()
                if not user_row:
                    log.error(f"[SOCKET] User not found: {username}")
                    disconnect()
                    return
                
                user_id = user_row['id']
                
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
                
                # Track user's rooms
                user_rooms[username] = rooms()
                
                log.info(f"[SOCKET] ✅ {username} (ID: {user_id}) joined personal room: {personal_room}")
                log.info(f"[SOCKET] 📍 SID: {request.sid} is now in room: {personal_room}")
                log.info(f"[SOCKET] 🏠 All rooms for {username}: {user_rooms[username]}")
                
                # Update user status
                cur.execute("""
                    UPDATE users
                    SET status = 'online', last_seen = NOW()
                    WHERE username = %s
                """, (username,))
            conn.commit()

            emit('user_status', {
                'username': username,
                'status': 'online'
            }, broadcast=True, include_self=False)

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
                user_id_cache.pop(username, None)
                log.info(f"[SOCKET] Removed session mapping for {username}")
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
                # Get user ID
                cur.execute("SELECT id FROM users WHERE username = %s", (username,))
                user_result = cur.fetchone()
                
                if user_result:
                    user_id = user_result['id']
                    
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

            emit('user_status', {
                'username': username,
                'status': 'offline'
            }, broadcast=True)

            # Clean up any active 1-to-1 calls for this user
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
                # Get user_id and channel community
                cur.execute("SELECT id FROM users WHERE username = %s", (username,))
                user_row = cur.fetchone()
                if not user_row:
                    log.warning(f"[SOCKET] User {username} not found when joining channel {channel_id}")
                    return
                user_id = user_row['id']

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

            channel_id = data.get('channel_id')
            message = data.get('message')
            content = message.get('content', '')
            message_id = message.get('id')

            # Ensure essential fields are present on the message payload
            message['channel_id'] = channel_id
            if not message.get('created_at'):
                message['created_at'] = datetime.now().isoformat()

            log.info(f"[SOCKET] new_message received: message_id={message_id}, channel_id={channel_id}, user={username}")

            # Get user ID and community ID for moderation
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM users WHERE username = %s", (username,))
                user_row = cur.fetchone()
                if not user_row:
                    log.error(f"[SOCKET] User not found: {username}")
                    return
                user_id = user_row['id']
                log.info(f"[SOCKET] User {username} has id {user_id}")
                
                # Get community_id from channel
                cur.execute("""
                    SELECT community_id FROM channels WHERE id = %s
                """, (channel_id,))
                channel_row = cur.fetchone()
                community_id = channel_row['community_id'] if channel_row else None
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
            
            # 🛡️ SMART MODERATION CHECK (log all checks for accurate stats)
            moderation_result = moderation_agent.moderate_message(
                text=content,
                user_id=user_id,
                channel_id=channel_id,
                message_id=message_id,
                log=True  # Log all moderation checks for stats tracking
            )
            
            log.info(f"[MODERATION] Message {message_id} checked: {moderation_result['action']} (confidence: {moderation_result['confidence']})")
            
            # Add moderation data and blocked status to message
            message['moderation'] = {
                'action': moderation_result['action'],
                'severity': moderation_result['severity'],
                'confidence': moderation_result['confidence'],
                'reasons': moderation_result.get('reasons', [])
            }
            message['is_blocked'] = is_blocked

            room = f"channel_{channel_id}"
            log.info(f"[SOCKET] Broadcasting to room: {room}")
            
            # 🤖 AI COMMAND HANDLING
            if content.strip().startswith('/'):
                log.info(f"[COMMAND] Detected command: {content}")
                try:
                    command_result = handle_ai_command(content, username, user_id, channel_id, community_id)
                    log.info(f"[COMMAND] Handler returned: {command_result}")
                    
                    if command_result:
                        log.info(f"[COMMAND] Emitting command_result to {request.sid}")
                        # Send command result back to user
                        emit('command_result', command_result, room=request.sid)
                        log.info(f"[COMMAND] command_result emitted successfully")
                        
                        # Also broadcast the command message itself
                        emit('message_received', {
                            **message,
                            'author': username
                        }, room=room, include_self=True)
                        log.info(f"[COMMAND] message_received broadcasted to room {room}")
                        return
                    else:
                        log.info(f"[COMMAND] Handler returned None, treating as regular message")
                except Exception as cmd_error:
                    log.error(f"[COMMAND] Error handling command: {cmd_error}", exc_info=True)
                    emit('command_result', {
                        'type': 'error',
                        'success': False,
                        'error': f'Command failed: {str(cmd_error)}'
                    }, room=request.sid)
            
            # Handle different moderation actions
            if moderation_result['action'] == 'block':
                # 🚫 BLOCK: Don't broadcast, notify sender only
                log.warning(f"[MODERATION] ⚠️ Message BLOCKED from {username}: {moderation_result['reasons']}")
                emit('message_blocked', {
                    'message_id': message_id,
                    'reason': 'Your message was blocked due to: ' + ', '.join(moderation_result['reasons']),
                    'severity': moderation_result['severity'],
                    'appeal_available': True
                })
                
                # Notify moderators
                emit('moderation_alert', {
                    'message_id': message_id,
                    'user_id': user_id,
                    'username': username,
                    'channel_id': channel_id,
                    'content': content[:100] + '...' if len(content) > 100 else content,
                    'action': 'blocked',
                    'reasons': moderation_result['reasons'],
                    'severity': moderation_result['severity'],
                    'timestamp': datetime.now().isoformat()
                }, room='moderators', broadcast=True)
                
                # Notify community owners about moderation action
                if community_id:
                    socketio.emit('moderation_action_logged', {
                        'community_id': community_id,
                        'channel_id': channel_id,
                        'action': 'block',
                        'severity': moderation_result['severity'],
                        'timestamp': datetime.now().isoformat()
                    }, room=f"community_{community_id}", namespace='/')
                
            elif moderation_result['action'] == 'flag':
                # ⚠️ FLAG: Allow but notify moderators
                log.warning(f"[MODERATION] ⚠️ Message FLAGGED from {username}: {moderation_result['reasons']}")
                log.info(f"[SOCKET] Emitting message_received to room {room}")
                emit('message_received', {
                    **message,
                    'author': username
                }, room=room, include_self=True)
                
                # Notify moderators for review
                emit('moderation_alert', {
                    'message_id': message_id,
                    'user_id': user_id,
                    'username': username,
                    'channel_id': channel_id,
                    'content': content[:100] + '...' if len(content) > 100 else content,
                    'action': 'flagged',
                    'reasons': moderation_result['reasons'],
                    'severity': moderation_result['severity'],
                    'timestamp': datetime.now().isoformat()
                }, room='moderators', broadcast=True)
                
                # Notify community owners about moderation action
                if community_id:
                    socketio.emit('moderation_action_logged', {
                        'community_id': community_id,
                        'channel_id': channel_id,
                        'action': 'flag',
                        'severity': moderation_result['severity'],
                        'timestamp': datetime.now().isoformat()
                    }, room=f"community_{community_id}", namespace='/')
                
            elif moderation_result['action'] == 'warn':
                # ⚠️ WARN: Allow but send warning to user
                log.info(f"[MODERATION] ⚠️ Message WARNING for {username}")
                log.info(f"[SOCKET] Emitting message_received to room {room}")
                emit('message_received', {
                    **message,
                    'author': username
                }, room=room, include_self=True)
                
                emit('moderation_warning', {
                    'message_id': message_id,
                    'warning': 'Your message contains content that may violate community guidelines.',
                    'reasons': moderation_result['reasons']
                })
                
                # Notify community owners about moderation action
                if community_id:
                    socketio.emit('moderation_action_logged', {
                        'community_id': community_id,
                        'channel_id': channel_id,
                        'action': 'warn',
                        'severity': moderation_result['severity'],
                        'timestamp': datetime.now().isoformat()
                    }, room=f"community_{community_id}", namespace='/')
                
            else:
                # ✅ CLEAN: Normal broadcast
                log.info(f"[SOCKET] Emitting message_received to room {room}")
                emit('message_received', {
                    **message,
                    'author': username
                }, room=room, include_self=True)
                log.info(f"[SOCKET] ✓ Message {message_id} broadcast complete")

            log.info(f"[SOCKET] Message from {username} to channel {channel_id} - Action: {moderation_result['action']}")

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
            
            # Get current user's ID
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM users WHERE username = %s", (username,))
                result = cur.fetchone()
                current_user_id = result['id'] if result else None
            
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
            
            # Get current user's ID
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM users WHERE username = %s", (username,))
                result = cur.fetchone()
                current_user_id = result['id'] if result else None
            
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
                # Fallback: fetch from DB and cache
                conn = get_db_connection()
                try:
                    with conn.cursor() as cur:
                        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
                        result = cur.fetchone()
                        current_user_id = result['id'] if result else None
                        if current_user_id:
                            user_id_cache[username] = current_user_id
                finally:
                    conn.close()
            
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
                # Get user ID
                cur.execute("SELECT id FROM users WHERE username = %s", (username,))
                user_result = cur.fetchone()
                
                if user_result:
                    user_id = user_result['id']
                    
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

            channel_id = data.get('channel_id')
            is_muted = data.get('is_muted', False)
            is_deaf = data.get('is_deaf', False)

            # Update voice_sessions in database
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE voice_sessions 
                    SET is_muted = %s, is_deaf = %s, last_activity = CURRENT_TIMESTAMP
                    WHERE channel_id = %s AND user_id = (SELECT id FROM users WHERE username = %s)
                """, (is_muted, is_deaf, channel_id, username))
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
    # 1-TO-1 AUDIO / VIDEO CALL SIGNALING
    # ============================================================================
    # Active calls: call_id -> { caller, callee, status, type, started_at }
    active_calls = {}

    def _get_user_id(username):
        """Get user id from username."""
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM users WHERE username = %s", (username,))
                row = cur.fetchone()
                return row['id'] if row else None
        except Exception:
            return None
        finally:
            if conn:
                conn.close()

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

            # Get caller profile info
            conn = get_db_connection()
            caller_info = {}
            callee_info = {}
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT id, username, display_name, avatar_url FROM users WHERE username = %s", (caller,))
                    row = cur.fetchone()
                    if row:
                        caller_info = {
                            'id': row['id'],
                            'username': row['username'],
                            'display_name': row['display_name'] or row['username'],
                            'avatar_url': row['avatar_url'],
                        }
                    cur.execute("SELECT id, username, display_name, avatar_url FROM users WHERE username = %s", (callee_username,))
                    row2 = cur.fetchone()
                    if row2:
                        callee_info = {
                            'id': row2['id'],
                            'username': row2['username'],
                            'display_name': row2['display_name'] or row2['username'],
                            'avatar_url': row2['avatar_url'],
                        }
            finally:
                conn.close()

            import uuid
            call_id = str(uuid.uuid4())

            active_calls[call_id] = {
                'caller': caller,
                'callee': callee_username,
                'type': call_type,
                'status': 'ringing',
                'started_at': datetime.utcnow().isoformat(),
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
            emit('call:rejected', {
                'callId': call_id,
                'by': username,
            }, room=f"calluser_{other}")

            del active_calls[call_id]
            log.info(f"[CALL] {username} rejected call {call_id}")

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
