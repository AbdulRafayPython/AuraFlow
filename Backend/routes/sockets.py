# routes/sockets.py (100% fixed – no IndentationError)
from flask_socketio import emit, join_room, leave_room
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
from database import get_db_connection
import logging

log = logging.getLogger(__name__)

def register_socket_events(socketio):
    """
    Register all real‑time Socket.IO events.
    Call this in app.py:
        register_socket_events(socketio)
    """

    @socketio.on('connect')
    def handle_connect():
        conn = None
        try:
            verify_jwt_in_request()
            username = get_jwt_identity()

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

            log.info(f"[SOCKET] {username} connected → online")

        except Exception as e:
            log.error(f"[SOCKET ERROR] connect failed: {e}")
        finally:
            if conn:
                conn.close()

    @socketio.on('disconnect')
    def handle_disconnect():
        conn = None
        try:
            verify_jwt_in_request(optional=True)
            username = get_jwt_identity()

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

            log.info(f"[SOCKET] {username} disconnected → offline")

        except Exception as e:
            log.warning(f"[SOCKET] disconnect cleanup failed: {e}")
        finally:
            if conn:
                conn.close()

    @socketio.on('join_channel')
    def on_join_channel(data):
        conn = None
        try:
            verify_jwt_in_request()
            username = get_jwt_identity()
            channel_id = data.get('channel_id')

            if not channel_id or not str(channel_id).isdigit():
                emit('error', {'msg': 'Invalid channel_id'})
                return

            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM users WHERE username = %s", (username,))
                user = cur.fetchone()
                if not user:
                    return

                cur.execute("""
                    SELECT 1 FROM channel_members 
                    WHERE channel_id = %s AND user_id = %s
                """, (channel_id, user['id']))
                if not cur.fetchone():
                    emit('error', {'msg': 'Access denied to channel'})
                    return

            room = f"channel_{channel_id}"
            join_room(room)

            emit('status', {
                'msg': f"{username} joined the channel",
                'username': username,
                'type': 'join'
            }, room=room)

            log.debug(f"[SOCKET] {username} joined room: {room}")

        except Exception as e:
            log.error(f"[SOCKET ERROR] join_channel: {e}")
            emit('error', {'msg': 'Failed to join channel'})
        finally:
            if conn:
                conn.close()

    @socketio.on('leave_channel')
    def on_leave_channel(data):
        try:
            verify_jwt_in_request()
            username = get_jwt_identity()
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

            log.debug(f"[SOCKET] {username} left room: {room}")

        except Exception as e:
            log.error(f"[SOCKET ERROR] leave_channel: {e}")

    @socketio.on('typing')
    def on_typing(data):
        try:
            verify_jwt_in_request()
            username = get_jwt_identity()
            channel_id = data.get('channel_id')
            is_typing = data.get('is_typing', False)

            if not channel_id:
                return

            room = f"channel_{channel_id}"
            emit('user_typing', {
                'username': username,
                'channel_id': channel_id,
                'is_typing': bool(is_typing)
            }, room=room, include_self=False)

        except Exception as e:
            log.error(f"[SOCKET ERROR] typing event: {e}")

    @socketio.on('new_message')
    def on_new_message(data):
        conn = None
        try:
            verify_jwt_in_request()
            username = get_jwt_identity()
            channel_id = data.get('channel_id')
            message = data.get('message', {})

            if not channel_id or not message:
                return

            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM users WHERE username = %s", (username,))
                user = cur.fetchone()
                if not user:
                    return

                cur.execute("""
                    SELECT 1 FROM channel_members 
                    WHERE channel_id = %s AND user_id = %s
                """, (channel_id, user['id']))
                if not cur.fetchone():
                    emit('error', {'msg': 'Not in channel'})
                    return

            room = f"channel_{channel_id}"
            emit('message_received', {
                'message': message,
                'temp_id': data.get('temp_id'),
                'sent_at': message.get('created_at')
            }, room=room, include_self=True)

            log.debug(f"[SOCKET] Message broadcast to {room}")

        except Exception as e:
            log.error(f"[SOCKET ERROR] new_message broadcast failed: {e}")
        finally:
            if conn:
                conn.close()

    @socketio.on('message_read')
    def on_message_read(data):
        try:
            verify_jwt_in_request()
            username = get_jwt_identity()
            message_ids = data.get('message_ids', [])

            if not message_ids:
                return

            emit('messages_read', {
                'username': username,
                'message_ids': message_ids,
                'read_at': data.get('read_at')
            }, broadcast=True, include_self=False)

        except Exception as e:
            log.error(f"[SOCKET ERROR] message_read: {e}")

    log.info("[SOCKETS] All real‑time events registered (connect, disconnect, typing, messages, read receipts)")
    print("[SOCKETS] Ready – online status, typing, live messages, read receipts")