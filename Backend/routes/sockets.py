# routes/sockets.py - Complete Socket.IO event handlers
from flask_socketio import emit, join_room, leave_room, rooms
from flask_jwt_extended import decode_token
from flask import request
from database import get_db_connection
import logging
from datetime import datetime

log = logging.getLogger(__name__)

# Track socket sessions: username -> socket_id
user_socket_sessions = {}
# Track last heartbeat: username -> timestamp
user_heartbeats = {}
# Track user rooms: username -> list of rooms
user_rooms = {}

def register_socket_events(socketio):
    """Register all real-time Socket.IO events including voice channel operations."""

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
                    return False
                
                user_id = user_row['id']
                
                # Join personal notification room
                personal_room = f"user_{user_id}"
                join_room(personal_room)
                
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
    def handle_disconnect():
        conn = None
        try:
            username = get_user_from_socket()
            if not username:
                return

            # Remove socket session mapping
            if username in user_socket_sessions:
                del user_socket_sessions[username]
                log.info(f"[SOCKET] Removed session mapping for {username}")
            
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
                            
                            log.info(f"[VOICE] Cleaned up voice session for {username} from channel {channel_id}")
                
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

            log.info(f"[SOCKET] {username} disconnected - offline and cleaned up voice sessions")

        except Exception as e:
            log.error(f"[SOCKET] Disconnect error: {e}", exc_info=True)
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

    # ============================================================================
    # CHANNEL ROOM MANAGEMENT
    # ============================================================================

    @socketio.on('join_channel')
    def on_join_channel(data):
        conn = None
        try:
            username = get_user_from_socket()
            if not username:
                return

            channel_id = data.get('channel_id')
            log.info(f"[SOCKET] User {username} attempting to join channel {channel_id}")

            if not channel_id or not str(channel_id).isdigit():
                log.error(f"[SOCKET] Invalid channel_id: {channel_id}")
                return

            # Verify user is member of the channel
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 1 FROM channel_members
                    WHERE user_id = (SELECT id FROM users WHERE username = %s)
                    AND channel_id = %s
                """, (username, channel_id))
                is_member = cur.fetchone()

            if not is_member:
                log.warning(f"[SOCKET] User {username} NOT a member of channel {channel_id}")
                return

            room = f"channel_{channel_id}"
            join_room(room)

            emit('status', {
                'msg': f"{username} joined the channel",
                'username': username,
                'type': 'join'
            }, room=room)

            log.info(f"[SOCKET] {username} joined room: {room}")

        except Exception as e:
            log.error(f"[SOCKET] join_channel error: {e}")
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
        try:
            username = get_user_from_socket()
            if not username:
                return

            channel_id = data.get('channel_id')
            message = data.get('message')

            room = f"channel_{channel_id}"
            emit('message_received', {
                **message,
                'author': username
            }, room=room)

            log.info(f"[SOCKET] Message from {username} to channel {channel_id}")

        except Exception as e:
            log.error(f"[SOCKET] new_message error: {e}")

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
        conn = None
        try:
            username = get_user_from_socket()
            if not username:
                log.error("[SOCKET] typing_dm: No user found")
                return

            user_id = data.get('user_id')
            is_typing = data.get('is_typing', True)
            
            log.info(f"[SOCKET] 🔤 {username} typing_dm={is_typing} to user_id: {user_id}")
            
            # Get current user's ID
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM users WHERE username = %s", (username,))
                result = cur.fetchone()
                current_user_id = result['id'] if result else None
            
            if not current_user_id:
                log.error(f"[SOCKET] Could not find user ID for {username}")
                return
            
            # Create consistent room name
            room = f"dm_{min(current_user_id, user_id)}_{max(current_user_id, user_id)}"
            
            # Emit typing indicator to all users in the room EXCEPT sender
            log.info(f"[SOCKET] 🔤 Broadcasting typing indicator to room {room}")
            emit('user_typing_dm', {
                'user_id': current_user_id,
                'username': username,
                'is_typing': is_typing
            }, room=room, include_self=False)
            
            log.debug(f"[SOCKET] 🔤 Typing indicator sent to room {room}")

        except Exception as e:
            log.error(f"[SOCKET] typing_dm error: {e}", exc_info=True)
        finally:
            if conn:
                conn.close()

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
            log.info(f"[SOCKET] 📤 Emitting receive_direct_message to room {room}")
            emit('receive_direct_message', message_data, room=room, include_self=True)
            log.info(f"[SOCKET] 📤✅ Broadcasted message to DM room: {room}")

            # ALSO emit to receiver's personal room for notifications
            # This ensures they get the message even if they're not in the DM conversation
            receiver_room = f"user_{receiver_id}"
            log.info(f"[SOCKET] 🔔 Emitting receive_direct_message to receiver's personal room: {receiver_room}")
            socketio.emit('receive_direct_message', message_data, to=receiver_room, namespace='/')
            log.info(f"[SOCKET] 🔔✅ Notification sent to receiver room: {receiver_room}")

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
        """Send WebRTC offer to peer - FIXED."""
        try:
            username = get_user_from_socket()
            if not username:
                log.error("[VOICE] send_offer: No username")
                return

            channel_id = data.get('channel_id')
            target_user = data.get('target_user')  # This is a username
            offer = data.get('offer')

            log.info(f"[VOICE] 📤 Offer from {username} to {target_user}")
            log.info(f"[VOICE] 📤 Current sessions: {list(user_socket_sessions.keys())}")

            # Get target user's socket ID
            target_sid = user_socket_sessions.get(target_user)
            
            if not target_sid:
                log.error(f"[VOICE] ❌ No socket session for {target_user}")
                log.error(f"[VOICE] ❌ Available sessions: {user_socket_sessions}")
                emit('voice_error', {'message': f'User {target_user} not connected'})
                return

            # Send to specific socket ID
            log.info(f"[VOICE] 📤 Sending offer to SID: {target_sid}")
            
            # Use room broadcast as fallback to ensure delivery
            voice_room = f"voice_{channel_id}"
            emit('receive_offer', {
                'from': username,  # Sender's username
                'offer': offer,
                'channel_id': channel_id,
                'target': target_user  # Add explicit target
            }, room=voice_room)

            log.info(f"[VOICE] ✅ Offer broadcasted from {username} to room {voice_room}")

        except Exception as e:
            log.error(f"[VOICE] send_offer error: {e}", exc_info=True)

    @socketio.on('send_answer')
    def on_send_answer(data):
        """Send WebRTC answer to peer - FIXED."""
        try:
            username = get_user_from_socket()
            if not username:
                log.error("[VOICE] send_answer: No username")
                return

            channel_id = data.get('channel_id')
            target_user = data.get('target_user')
            answer = data.get('answer')

            log.info(f"[VOICE] 📤 Answer from {username} to {target_user}")
            log.info(f"[VOICE] 📤 Current sessions: {list(user_socket_sessions.keys())}")

            target_sid = user_socket_sessions.get(target_user)
            
            if not target_sid:
                log.error(f"[VOICE] ❌ No socket session for {target_user}")
                log.error(f"[VOICE] ❌ Available sessions: {user_socket_sessions}")
                return

            log.info(f"[VOICE] 📤 Sending answer to SID: {target_sid}")
            
            # Use room broadcast to ensure delivery
            voice_room = f"voice_{channel_id}"
            emit('receive_answer', {
                'from': username,
                'answer': answer,
                'channel_id': channel_id,
                'target': target_user
            }, room=voice_room)

            log.info(f"[VOICE] ✅ Answer broadcasted from {username} to room {voice_room}")

        except Exception as e:
            log.error(f"[VOICE] send_answer error: {e}", exc_info=True)

    @socketio.on('send_ice_candidate')
    def on_send_ice_candidate(data):
        """Send ICE candidate to peer - FIXED."""
        try:
            username = get_user_from_socket()
            if not username:
                return

            channel_id = data.get('channel_id')
            target_user = data.get('target_user')
            candidate = data.get('candidate')

            log.debug(f"[VOICE] 📤 ICE from {username} to {target_user}")

            target_sid = user_socket_sessions.get(target_user)
            
            if not target_sid:
                log.warning(f"[VOICE] ⚠️ No socket for {target_user} (ICE)")
                return

            # Use room broadcast for ICE candidates too
            voice_room = f"voice_{channel_id}"
            emit('receive_ice_candidate', {
                'from': username,
                'candidate': candidate,
                'channel_id': channel_id,
                'target': target_user
            }, room=voice_room)

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

    @socketio.on('message_reaction_added')
    def handle_message_reaction_added(data):
        """Handle real-time reaction addition to community messages"""
        try:
            username = get_user_from_socket()
            if not username:
                emit('error', {'message': 'Unauthorized'})
                return

            message_id = data.get('message_id')
            channel_id = data.get('channel_id')
            emoji = data.get('emoji')
            user_id = data.get('user_id')
            
            log.info(f"[REACTION] {username} reacted to message {message_id} with {emoji}")
            
            # Broadcast reaction to all users in the channel
            emit('message_reaction_update', {
                'message_id': message_id,
                'channel_id': channel_id,
                'emoji': emoji,
                'user_id': user_id,
                'username': username,
                'action': 'added'
            }, broadcast=True, include_self=True)
            
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
            
            log.info(f"[REACTION] {username} removed reaction from message {message_id}")
            
            # Broadcast reaction removal to all users in the channel
            emit('message_reaction_update', {
                'message_id': message_id,
                'channel_id': channel_id,
                'emoji': emoji,
                'user_id': user_id,
                'username': username,
                'action': 'removed'
            }, broadcast=True, include_self=True)
            
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
            other_user = data.get('other_user')  # The other person in the DM
            
            log.info(f"[DM_REACTION] {username} reacted to DM {dm_id} with {emoji}")
            
            # Send to both users in the DM
            emit('dm_reaction_update', {
                'dm_id': dm_id,
                'emoji': emoji,
                'user_id': user_id,
                'username': username,
                'action': 'added'
            }, broadcast=True, include_self=True)
            
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
            
            log.info(f"[DM_REACTION] {username} removed reaction from DM {dm_id}")
            
            # Send to both users in the DM
            emit('dm_reaction_update', {
                'dm_id': dm_id,
                'emoji': emoji,
                'user_id': user_id,
                'username': username,
                'action': 'removed'
            }, broadcast=True, include_self=True)
            
        except Exception as e:
            log.error(f"[DM_REACTION] Error handling DM reaction removal: {e}")
            emit('error', {'message': 'Failed to remove reaction'})

    log.info("[SOCKET] All socket events registered successfully")