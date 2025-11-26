# routes/sockets.py - DEBUG VERSION with detailed logging
from flask_socketio import emit, join_room, leave_room
from flask_jwt_extended import decode_token
from flask import request
from database import get_db_connection
import logging
from datetime import datetime
from utils import get_avatar_url

log = logging.getLogger(__name__)

def register_socket_events(socketio):
    """Register all real-time Socket.IO events with detailed debugging."""

    def get_user_from_socket():
        """Extract and verify JWT from socket connection."""
        try:
            auth = request.args.get('token') or request.headers.get('Authorization')
            
            if not auth:
                log.error("[SOCKET DEBUG] No token in connection")
                return None
                
            token = auth.replace('Bearer ', '') if auth.startswith('Bearer ') else auth
            decoded = decode_token(token)
            username = decoded.get('sub')
            
            if not username:
                log.error("[SOCKET DEBUG] No username in token")
                return None
            
            log.info(f"[SOCKET DEBUG] ✅ Token valid for user: {username}")
            return username
            
        except Exception as e:
            log.error(f"[SOCKET DEBUG] Token validation failed: {e}")
            return None

    @socketio.on('connect')
    def handle_connect():
        conn = None
        try:
            username = get_user_from_socket()
            if not username:
                log.error("[SOCKET DEBUG] Connect rejected: Invalid token")
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

            log.info(f"[SOCKET DEBUG] ✅ {username} connected → online")

        except Exception as e:
            log.error(f"[SOCKET DEBUG] ❌ connect failed: {e}")
            return False
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
            }, broadcast=True, include_self=False)

            log.info(f"[SOCKET DEBUG] {username} disconnected → offline")

        except Exception as e:
            log.warning(f"[SOCKET DEBUG] disconnect cleanup failed: {e}")
        finally:
            if conn:
                conn.close()

    @socketio.on('join_channel')
    def on_join_channel(data):
        conn = None
        try:
            username = get_user_from_socket()
            if not username:
                log.error("[SOCKET DEBUG] ❌ join_channel: No username")
                emit('error', {'msg': 'Authentication required'})
                return

            channel_id = data.get('channel_id')
            log.info(f"[SOCKET DEBUG] 🔍 User {username} attempting to join channel {channel_id}")

            if not channel_id or not str(channel_id).isdigit():
                log.error(f"[SOCKET DEBUG] ❌ Invalid channel_id: {channel_id}")
                emit('error', {'msg': 'Invalid channel_id'})
                return

            conn = get_db_connection()
            with conn.cursor() as cur:
                # Get user ID
                cur.execute("SELECT id FROM users WHERE username = %s", (username,))
                user = cur.fetchone()
                if not user:
                    log.error(f"[SOCKET DEBUG] ❌ User {username} not found in database")
                    emit('error', {'msg': 'User not found'})
                    return

                user_id = user['id']
                log.info(f"[SOCKET DEBUG] ✅ Found user {username} with ID {user_id}")

                # Check channel membership
                cur.execute("""
                    SELECT 1 FROM channel_members 
                    WHERE channel_id = %s AND user_id = %s
                """, (channel_id, user_id))
                membership = cur.fetchone()
                
                if not membership:
                    # DEBUG: Show what memberships this user HAS
                    cur.execute("""
                        SELECT cm.channel_id, c.name 
                        FROM channel_members cm
                        JOIN channels c ON cm.channel_id = c.id
                        WHERE cm.user_id = %s
                    """, (user_id,))
                    user_channels = cur.fetchall()
                    
                    log.error(f"[SOCKET DEBUG] ❌ User {username} (ID {user_id}) is NOT a member of channel {channel_id}")
                    log.error(f"[SOCKET DEBUG] 📋 User IS a member of channels: {user_channels}")
                    
                    # DEBUG: Show who IS in the requested channel
                    cur.execute("""
                        SELECT u.username, u.id 
                        FROM channel_members cm
                        JOIN users u ON cm.user_id = u.id
                        WHERE cm.channel_id = %s
                    """, (channel_id,))
                    channel_members = cur.fetchall()
                    
                    log.error(f"[SOCKET DEBUG] 📋 Channel {channel_id} members: {channel_members}")
                    
                    emit('error', {'msg': 'Access denied to channel'})
                    return
                
                log.info(f"[SOCKET DEBUG] ✅ User {username} IS a member of channel {channel_id}")

            room = f"channel_{channel_id}"
            join_room(room)

            emit('status', {
                'msg': f"{username} joined the channel",
                'username': username,
                'type': 'join'
            }, room=room)

            log.info(f"[SOCKET DEBUG] ✅ {username} joined room: {room}")

        except Exception as e:
            log.error(f"[SOCKET DEBUG] ❌ join_channel exception: {e}", exc_info=True)
            emit('error', {'msg': 'Failed to join channel'})
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
            if not channel_id:
                return

            room = f"channel_{channel_id}"
            leave_room(room)

            emit('status', {
                'msg': f"{username} left the channel",
                'username': username,
                'type': 'leave'
            }, room=room)

            log.info(f"[SOCKET DEBUG] {username} left room: {room}")

        except Exception as e:
            log.error(f"[SOCKET DEBUG] ❌ leave_channel: {e}")

    @socketio.on('typing')
    def on_typing(data):
        """Handle typing indicators with start/stop support."""
        try:
            username = get_user_from_socket()
            if not username:
                return

            channel_id = data.get('channel_id')
            is_typing = data.get('is_typing', True)

            if not channel_id:
                return

            room = f"channel_{channel_id}"
            emit('user_typing', {
                'username': username,
                'channel_id': channel_id,
                'is_typing': bool(is_typing)
            }, room=room, include_self=False)

            log.debug(f"[SOCKET DEBUG] ⌨️ {username} typing={is_typing} in channel {channel_id}")

        except Exception as e:
            log.error(f"[SOCKET DEBUG] ❌ typing event: {e}")

    @socketio.on('new_message')
    def on_new_message(data):
        """Broadcast message with proper avatar_url using fallback logic."""
        conn = None
        try:
            username = get_user_from_socket()
            if not username:
                emit('error', {'msg': 'Authentication required'})
                return

            channel_id = data.get('channel_id')
            message = data.get('message', {})

            if not channel_id or not message:
                emit('error', {'msg': 'Missing channel_id or message'})
                return

            # Extract raw data
            msg_id = message.get('id')
            content = message.get('content')
            author = message.get('author') or username
            raw_avatar_url = message.get('avatar_url') or message.get('avatar')  # support both
            print("[DEBUG] Raw avatar URL from message:", raw_avatar_url)

            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM users WHERE username = %s", (username,))
                user = cur.fetchone()
                if not user:
                    emit('error', {'msg': 'User not found'})
                    return

                # Verify membership
                cur.execute("""
                    SELECT 1 FROM channel_members 
                    WHERE channel_id = %s AND user_id = %s
                """, (channel_id, user['id']))
                if not cur.fetchone():
                    emit('error', {'msg': 'Not in channel'})
                    return

            room = f"channel_{channel_id}"

            # THIS IS THE KEY: Use the same fallback logic as API!
            from utils import get_avatar_url
            final_avatar_url = get_avatar_url(author, raw_avatar_url)

            # Broadcast with correct avatar_url
            emit('message_received', {
                'id': msg_id,
                'channel_id': channel_id,
                'sender_id': message.get('sender_id'),
                'content': content,
                'message_type': message.get('message_type', 'text'),
                'created_at': message.get('created_at'),
                'author': author,
                'display_name': message.get('display_name') or author,
                'avatar_url': final_avatar_url,  # ← PERFECT NOW!
            }, room=room, include_self=False)

            log.info(f"[SOCKET] Message {msg_id} broadcast with avatar: {final_avatar_url}")

        except Exception as e:
            log.error(f"[SOCKET] new_message broadcast failed: {e}", exc_info=True)
            emit('error', {'msg': 'Failed to broadcast message'})
        finally:
            if conn:
                conn.close()

    @socketio.on('message_read')
    def on_message_read(data):
        try:
            username = get_user_from_socket()
            if not username:
                return

            message_ids = data.get('message_ids', [])
            if not message_ids:
                return

            emit('messages_read', {
                'username': username,
                'message_ids': message_ids,
                'read_at': data.get('read_at') or datetime.utcnow().isoformat()
            }, broadcast=True, include_self=False)

            log.debug(f"[SOCKET DEBUG] {username} read {len(message_ids)} messages")

        except Exception as e:
            log.error(f"[SOCKET DEBUG] ❌ message_read: {e}")

    log.info("[SOCKETS] All real-time events registered with DEBUG logging")
    print("[SOCKETS] 🐛 DEBUG MODE - Detailed logging enabled")