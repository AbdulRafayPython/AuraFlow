# routes/messages.py (Fixed + Enhanced with get_db_connection())
from flask import jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import get_db_connection
from utils import get_avatar_url


# Helper: format user avatar fallback
def _avatar_url(username: str, url: str | None) -> str:
    return url or None


# =====================================
# GET CHANNEL MESSAGES
# =====================================
@jwt_required()
def get_channel_messages(channel_id):
    conn = None
    try:
        limit = min(request.args.get('limit', 50, type=int), 100)
        offset = max(request.args.get('offset', 0, type=int), 0)

        current_user = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (current_user,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404
            user_id = user['id']

            # Check channel access
            cur.execute("SELECT 1 FROM channel_members WHERE channel_id = %s AND user_id = %s",
                        (channel_id, user_id))
            if not cur.fetchone():
                return jsonify({'error': 'Access denied'}), 403

            # Fetch messages
            cur.execute("""
                SELECT 
                    m.id, m.sender_id, m.content, m.message_type, m.reply_to, m.created_at,
                    u.username, u.display_name, u.avatar_url
                FROM messages m
                JOIN users u ON m.sender_id = u.id
                WHERE m.channel_id = %s
                ORDER BY m.created_at DESC
                LIMIT %s OFFSET %s
            """, (channel_id, limit, offset))
            rows = cur.fetchall()

        result = [{
            'id': m['id'],
            'channel_id': channel_id,
            'sender_id': m['sender_id'],
            'content': m['content'],
            'message_type': m['message_type'],
            'reply_to': m['reply_to'],
            'created_at': m['created_at'].isoformat() if m['created_at'] else None,
            'author': m['username'],
            'display_name': m['display_name'] or m['username'],
            'avatar_url': get_avatar_url(m['username'], m['avatar_url'])  # ← FIXED!
        } for m in rows]
        print("[DEBUG] Fetched channel messages:", result)
        return jsonify(result), 200

    except Exception as e:
        print(f"[ERROR] get_channel_messages: {e}")
        return jsonify({'error': 'Failed to fetch messages'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# SEND MESSAGE TO CHANNEL
# =====================================
@jwt_required()
def send_message():
    conn = None
    try:
        current_user = get_jwt_identity()
        data = request.get_json() or {}
        channel_id = data.get('channel_id')
        content = data.get('content')
        message_type = data.get('message_type', 'text')
        reply_to = data.get('reply_to')

        if not channel_id or not content:
            return jsonify({'error': 'channel_id and content required'}), 400

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (current_user,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404
            user_id = user['id']

            cur.execute("SELECT 1 FROM channel_members WHERE channel_id = %s AND user_id = %s",
                        (channel_id, user_id))
            if not cur.fetchone():
                return jsonify({'error': 'Access denied'}), 403

            cur.execute("""
                INSERT INTO messages (channel_id, sender_id, content, message_type, reply_to)
                VALUES (%s, %s, %s, %s, %s)
            """, (channel_id, user_id, content, message_type, reply_to or None))
            message_id = cur.lastrowid

            cur.execute("""
                SELECT m.*, u.username, u.display_name, u.avatar_url
                FROM messages m
                JOIN users u ON m.sender_id = u.id
                WHERE m.id = %s
            """, (message_id,))
            msg = cur.fetchone()

        conn.commit()

        # ← CRITICAL: Use get_avatar_url() here too!
        avatar_url = get_avatar_url(msg['username'], msg['avatar_url'])

        response = {
            'id': msg['id'],
            'channel_id': msg['channel_id'],
            'sender_id': user_id,
            'content': msg['content'],
            'message_type': msg['message_type'],
            'reply_to': msg['reply_to'],
            'created_at': msg['created_at'].isoformat(),
            'author': msg['username'],
            'display_name': msg['display_name'] or msg['username'],
            'avatar_url': avatar_url  # ← Now correct!
        }

        return jsonify(response), 201

    except Exception as e:
        print(f"[ERROR] send_message: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to send message'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# GET DIRECT MESSAGES
# =====================================
@jwt_required()
def get_direct_messages(user_id):
    conn = None
    try:
        limit = min(request.args.get('limit', 50, type=int), 100)
        offset = max(request.args.get('offset', 0, type=int), 0)

        current_user = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (current_user,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404
            current_user_id = user['id']

            cur.execute("""
                SELECT 
                    dm.id, dm.sender_id, dm.receiver_id, dm.content, dm.message_type,
                    dm.created_at, dm.is_read, dm.read_at,
                    u.username, u.display_name, u.avatar_url
                FROM direct_messages dm
                JOIN users u ON dm.sender_id = u.id
                WHERE (dm.sender_id = %s AND dm.receiver_id = %s)
                   OR (dm.sender_id = %s AND dm.receiver_id = %s)
                ORDER BY dm.created_at DESC
                LIMIT %s OFFSET %s
            """, (current_user_id, user_id, user_id, current_user_id, limit, offset))
            rows = cur.fetchall()

        result = [{
            'id': m['id'],
            'sender_id': m['sender_id'],
            'receiver_id': m['receiver_id'],
            'content': m['content'],
            'message_type': m['message_type'],
            'created_at': m['created_at'].isoformat() if m['created_at'] else None,
            'is_read': bool(m['is_read']),
            'read_at': m['read_at'].isoformat() if m['read_at'] else None,
            'author': m['username'],
            'display_name': m['display_name'] or m['username'],
            'avatar': _avatar_url(m['username'], m['avatar_url'])
        } for m in rows]

        return jsonify(result), 200

    except Exception as e:
        print(f"[ERROR] get_direct_messages: {e}")
        return jsonify({'error': 'Failed to fetch DMs'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# SEND DIRECT MESSAGE
# =====================================
@jwt_required()
def send_direct_message():
    conn = None
    try:
        current_user = get_jwt_identity()
        data = request.get_json() or {}
        receiver_id = data.get('receiver_id')
        content = data.get('content')
        message_type = data.get('message_type', 'text')

        if not receiver_id or not content:
            return jsonify({'error': 'receiver_id and content required'}), 400

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (current_user,))
            sender = cur.fetchone()
            if not sender:
                return jsonify({'error': 'User not found'}), 404
            sender_id = sender['id']

            cur.execute("SELECT 1 FROM users WHERE id = %s", (receiver_id,))
            if not cur.fetchone():
                return jsonify({'error': 'Receiver not found'}), 404

            cur.execute("""
                INSERT INTO direct_messages (sender_id, receiver_id, content, message_type)
                VALUES (%s, %s, %s, %s)
            """, (sender_id, receiver_id, content, message_type))
            message_id = cur.lastrowid

            cur.execute("""
                SELECT dm.*, u.username, u.display_name, u.avatar_url
                FROM direct_messages dm
                JOIN users u ON dm.sender_id = u.id
                WHERE dm.id = %s
            """, (message_id,))
            msg = cur.fetchone()

        conn.commit()
        return jsonify({
            'id': msg['id'],
            'sender_id': msg['sender_id'],
            'receiver_id': msg['receiver_id'],
            'content': msg['content'],
            'message_type': msg['message_type'],
            'created_at': msg['created_at'].isoformat(),
            'is_read': bool(msg['is_read']),
            'author': msg['username'],
            'display_name': msg['display_name'] or msg['username'],
            'avatar': _avatar_url(msg['username'], msg['avatar_url'])
        }), 201

    except Exception as e:
        print(f"[ERROR] send_direct_message: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to send DM'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# MARK MESSAGES AS READ
# =====================================
@jwt_required()
def mark_as_read():
    conn = None
    try:
        current_user = get_jwt_identity()
        data = request.get_json() or {}
        message_ids = data.get('message_ids', [])

        if not message_ids:
            return jsonify({'error': 'message_ids required'}), 400

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (current_user,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404
            user_id = user['id']

            placeholders = ','.join(['%s'] * len(message_ids))
            query = f"""
                UPDATE direct_messages 
                SET is_read = TRUE, read_at = NOW()
                WHERE id IN ({placeholders}) AND receiver_id = %s AND is_read = FALSE
            """
            cur.execute(query, (*message_ids, user_id))
            updated = cur.rowcount

        conn.commit()
        return jsonify({
            'message': 'Messages marked as read',
            'updated_count': updated
        }), 200

    except Exception as e:
        print(f"[ERROR] mark_as_read: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to mark as read'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# DELETE MESSAGE (channel only)
# =====================================
@jwt_required()
def delete_message(message_id):
    conn = None
    try:
        current_user = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (current_user,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404
            user_id = user['id']

            cur.execute("SELECT sender_id FROM messages WHERE id = %s", (message_id,))
            msg = cur.fetchone()
            if not msg:
                return jsonify({'error': 'Message not found'}), 404
            if msg['sender_id'] != user_id:
                return jsonify({'error': 'Access denied'}), 403

            cur.execute("DELETE FROM messages WHERE id = %s", (message_id,))

        conn.commit()
        return jsonify({'message': 'Message deleted'}), 200

    except Exception as e:
        print(f"[ERROR] delete_message: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to delete message'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# EDIT MESSAGE
# =====================================
@jwt_required()
def edit_message(message_id):
    conn = None
    try:
        current_user = get_jwt_identity()
        data = request.get_json() or {}
        new_content = data.get('content')
        if not new_content:
            return jsonify({'error': 'content required'}), 400

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (current_user,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404
            user_id = user['id']

            cur.execute("SELECT sender_id FROM messages WHERE id = %s", (message_id,))
            msg = cur.fetchone()
            if not msg:
                return jsonify({'error': 'Message not found'}), 404
            if msg['sender_id'] != user_id:
                return jsonify({'error': 'Access denied'}), 403

            cur.execute("UPDATE messages SET content = %s WHERE id = %s", (new_content, message_id))

            cur.execute("""
                SELECT m.*, u.username, u.display_name, u.avatar_url
                FROM messages m
                JOIN users u ON m.sender_id = u.id
                WHERE m.id = %s
            """, (message_id,))
            updated = cur.fetchone()

        conn.commit()
        return jsonify({
            'id': updated['id'],
            'channel_id': updated['channel_id'],
            'sender_id': updated['sender_id'],
            'content': updated['content'],
            'message_type': updated['message_type'],
            'reply_to': updated['reply_to'],
            'created_at': updated['created_at'].isoformat(),
            'author': updated['username'],
            'display_name': updated['display_name'] or updated['username'],
            'avatar': _avatar_url(updated['username'], updated['avatar_url'])
        }), 200

    except Exception as e:
        print(f"[ERROR] edit_message: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to edit message'}), 500
    finally:
        if conn:
            conn.close()