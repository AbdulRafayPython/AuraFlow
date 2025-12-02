# routes/sockets.py - Real-time channel and message events
from flask_socketio import emit, join_room, leave_room
from flask_jwt_extended import decode_token
from flask import request
from database import get_db_connection
import logging
from datetime import datetime
from utils import get_avatar_url

log = logging.getLogger(__name__)

def register_socket_events(socketio):
    """Register all real-time Socket.IO events including channel operations."""

    def get_user_from_socket():
        """Extract and verify JWT from socket connection."""
        try:
            auth = request.args.get('token') or request.headers.get('Authorization')

            if not auth:
                log.error("[SOCKET] No token in connection")
                return None

            token = auth.replace('Bearer ', '') if auth.startswith('Bearer ') else auth
            decoded = decode_token(token)
            username = decoded.get('sub')

            if not username:
                log.error("[SOCKET] No username in token")
                return None

            log.info(f"[SOCKET] Token valid for user: {username}")
            return username

        except Exception as e:
            log.error(f"[SOCKET] Token validation failed: {e}")
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

            conn = get_db_connection()
            with conn.cursor() as cur:
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

    @socketio.on('disconnect')
    def handle_disconnect():
        conn = None
        try:
            username = get_user_from_socket()
            if not username:
                return

            conn = get_db_connection()
            with conn.cursor() as cur:
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

            log.info(f"[SOCKET] {username} disconnected - offline")

        except Exception as e:
            log.error(f"[SOCKET] Disconnect error: {e}")
        finally:
            if conn:
                conn.close()

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
        try:
            log.info("[SOCKET] 🚪🚪🚪 join_dm event RECEIVED")
            
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
                current_user_id = result[0] if result else None
            conn.close()
            
            if not current_user_id:
                log.error(f"[SOCKET] Could not find user ID for {username}")
                return
            
            # Create a consistent room name using IDs (smallest ID first)
            room = f"dm_{min(current_user_id, user_id)}_{max(current_user_id, user_id)}"
            join_room(room)
            
            log.info(f"[SOCKET] 🚪✅✅✅ {username} (ID: {current_user_id}) joined room: {room}")

        except Exception as e:
            log.error(f"[SOCKET] join_dm error: {e}", exc_info=True)

    @socketio.on('leave_dm')
    def on_leave_dm(data):
        """Leave a direct message conversation room."""
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
                current_user_id = result[0] if result else None
            conn.close()
            
            if not current_user_id:
                log.error(f"[SOCKET] Could not find user ID for {username}")
                return
            
            # Create a consistent room name using IDs (smallest ID first)
            room = f"dm_{min(current_user_id, user_id)}_{max(current_user_id, user_id)}"
            leave_room(room)
            
            log.info(f"[SOCKET] {username} (ID: {current_user_id}) left room: {room}")

        except Exception as e:
            log.error(f"[SOCKET] leave_dm error: {e}")

    @socketio.on('send_direct_message')
    def on_send_direct_message(data):
        """Handle incoming direct message and broadcast to recipient."""
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

            # Create consistent room identifier using IDs (smallest first)
            room = f"dm_{min(sender_id, receiver_id)}_{max(sender_id, receiver_id)}"
            
            log.info(f"[SOCKET] 📤 Room name: {room}")

            # Broadcast to both sender and receiver in the DM room
            log.info(f"[SOCKET] 📤 Emitting receive_direct_message to room {room}")
            emit('receive_direct_message', {
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
            }, room=room)

            log.info(f"[SOCKET] 📤✅✅✅ Broadcasted message to room: {room}")

        except Exception as e:
            log.error(f"[SOCKET] send_direct_message error: {e}", exc_info=True)

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
    # CHANNEL OPERATIONS (NEW)
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

            # Broadcast to all users (they'll filter by community on frontend)
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

            # Leave the room before broadcasting deletion
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

    log.info("[SOCKET] All socket events registered successfully")
