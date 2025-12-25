# routes/messages.py (Fixed + Enhanced with get_db_connection())
from flask import jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import get_db_connection
from utils import get_avatar_url
import sys
import os

# Import moderation agent
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from agents.moderation import ModerationAgent

# Initialize moderation agent
moderation_agent = ModerationAgent()


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

            cur.execute("SELECT id, community_id FROM channels WHERE id = %s", (channel_id,))
            channel_row = cur.fetchone()
            if not channel_row:
                return jsonify({'error': 'Channel not found'}), 404
            community_id = channel_row['community_id']

            cur.execute("SELECT 1 FROM channel_members WHERE channel_id = %s AND user_id = %s",
                        (channel_id, user_id))
            if not cur.fetchone():
                return jsonify({'error': 'Access denied'}), 403

            # Check block list first
            cur.execute(
                "SELECT id FROM blocked_users WHERE community_id = %s AND user_id = %s",
                (community_id, user_id)
            )
            if cur.fetchone():
                return jsonify({
                    'moderation': {
                        'action': 'block_user',
                        'severity': 'high',
                        'reasons': ['blocked_user'],
                        'message': 'You are blocked from this community.'
                    }
                }), 403

            cur.execute(
                "SELECT violation_count FROM community_members WHERE community_id = %s AND user_id = %s",
                (community_id, user_id)
            )
            membership_row = cur.fetchone()
            if not membership_row:
                return jsonify({'error': 'Access denied'}), 403
            violation_count = membership_row.get('violation_count') or 0

            # Get user role in community
            cur.execute(
                "SELECT role FROM community_members WHERE community_id = %s AND user_id = %s",
                (community_id, user_id)
            )
            role_row = cur.fetchone()
            user_role = role_row['role'] if role_row else 'member'

            # OWNER IMMUNITY: Skip all moderation for community owners
            if user_role == 'owner':
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

                avatar_url = get_avatar_url(msg['username'], msg['avatar_url'])
                return jsonify({
                    'message': {
                        'id': msg['id'],
                        'channel_id': msg['channel_id'],
                        'sender_id': user_id,
                        'content': msg['content'],
                        'message_type': msg['message_type'],
                        'reply_to': msg['reply_to'],
                        'created_at': msg['created_at'].isoformat(),
                        'author': msg['username'],
                        'display_name': msg['display_name'] or msg['username'],
                        'avatar_url': avatar_url
                    }
                }), 201

            moderation_result = moderation_agent.moderate_message(content, user_id, channel_id, log=False)

            # Escalation ladder
            final_action = 'allow'
            user_message = None
            if moderation_result['action'] != 'allow':
                violation_count += 1
                cur.execute(
                    "UPDATE community_members SET violation_count = %s WHERE community_id = %s AND user_id = %s",
                    (violation_count, community_id, user_id)
                )

                if violation_count == 1:
                    final_action = 'warn'
                    user_message = 'Warning issued. Continued violations will lead to removal.'
                elif violation_count == 2:
                    final_action = 'remove_message'
                    user_message = 'Message removed due to repeated violations.'
                elif violation_count == 3:
                    final_action = 'remove_user'
                    user_message = 'You were removed from this community for repeated violations.'
                else:
                    final_action = 'block_user'
                    user_message = 'You were blocked from this community for repeated violations.'
            else:
                final_action = 'allow'

            # Actions that still allow the message to go through
            if final_action in ['allow', 'warn']:
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

                if final_action != 'allow':
                    moderation_agent.log_moderation_action(
                        user_id, channel_id, content, final_action,
                        moderation_result['severity'], moderation_result.get('reasons', []),
                        moderation_result.get('confidence', 0), message_id
                    )

                avatar_url = get_avatar_url(msg['username'], msg['avatar_url'])
                return jsonify({
                    'message': {
                        'id': msg['id'],
                        'channel_id': msg['channel_id'],
                        'sender_id': user_id,
                        'content': msg['content'],
                        'message_type': msg['message_type'],
                        'reply_to': msg['reply_to'],
                        'created_at': msg['created_at'].isoformat(),
                        'author': msg['username'],
                        'display_name': msg['display_name'] or msg['username'],
                        'avatar_url': avatar_url,
                        'moderation': {
                            'action': final_action,
                            'severity': moderation_result['severity'],
                            'flagged': final_action == 'warn',
                            'reasons': moderation_result.get('reasons', []),
                            'violation_count': violation_count
                        }
                    },
                    'moderation': {
                        'action': final_action,
                        'severity': moderation_result['severity'],
                        'reasons': moderation_result.get('reasons', []),
                        'message': user_message,
                        'violation_count': violation_count
                    }
                }), 201

            # Remove message (no insert)
            if final_action == 'remove_message':
                conn.commit()
                moderation_agent.log_moderation_action(
                    user_id, channel_id, content, 'remove_message',
                    moderation_result['severity'], moderation_result.get('reasons', []),
                    moderation_result.get('confidence', 0), None
                )
                return jsonify({
                    'moderation': {
                        'action': 'remove_message',
                        'severity': moderation_result['severity'],
                        'reasons': moderation_result.get('reasons', []),
                        'message': user_message,
                        'violation_count': violation_count
                    }
                }), 200

            # Remove user from community and all its channels
            if final_action == 'remove_user':
                cur.execute(
                    "DELETE FROM channel_members WHERE user_id = %s AND channel_id IN (SELECT id FROM channels WHERE community_id = %s)",
                    (user_id, community_id)
                )
                cur.execute(
                    "DELETE FROM community_members WHERE community_id = %s AND user_id = %s",
                    (community_id, user_id)
                )
                conn.commit()
                
                # Emit socket event to disconnect user from community
                from flask_socketio import emit
                emit('community:removed', {
                    'community_id': community_id,
                    'user_id': user_id,
                    'reason': 'moderation',
                    'message': user_message
                }, to=f"user_{user_id}", namespace='/')
                
                moderation_agent.log_moderation_action(
                    user_id, channel_id, content, 'remove_user',
                    'high', moderation_result.get('reasons', []),
                    moderation_result.get('confidence', 0), None
                )
                return jsonify({
                    'moderation': {
                        'action': 'remove_user',
                        'severity': 'high',
                        'reasons': moderation_result.get('reasons', []),
                        'message': user_message,
                        'violation_count': violation_count,
                        'removed_from_community': True
                    }
                }), 403

            # Block user (default case once count >= 4)
            cur.execute(
                "INSERT IGNORE INTO blocked_users (community_id, user_id) VALUES (%s, %s)",
                (community_id, user_id)
            )
            cur.execute(
                "DELETE FROM channel_members WHERE user_id = %s AND channel_id IN (SELECT id FROM channels WHERE community_id = %s)",
                (user_id, community_id)
            )
            cur.execute(
                "DELETE FROM community_members WHERE community_id = %s AND user_id = %s",
                (community_id, user_id)
            )
            conn.commit()
            
            # Emit socket event to disconnect user from community
            from flask_socketio import emit
            emit('community:removed', {
                'community_id': community_id,
                'user_id': user_id,
                'reason': 'blocked',
                'message': user_message,
                'blocked': True
            }, to=f"user_{user_id}", namespace='/')
            
            moderation_agent.log_moderation_action(
                user_id, channel_id, content, 'block_user',
                'high', moderation_result.get('reasons', []),
                moderation_result.get('confidence', 0), None
            )
            return jsonify({
                'moderation': {
                    'action': 'block_user',
                    'severity': 'high',
                    'reasons': moderation_result.get('reasons', []),
                    'message': user_message,
                    'violation_count': violation_count,
                    'blocked': True
                }
            }), 403

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
            'sender': {
                'id': m['sender_id'],
                'username': m['username'],
                'display_name': m['display_name'] or m['username'],
                'avatar_url': get_avatar_url(m['username'], m['avatar_url'])
            }
        } for m in rows]

        print("[DEBUG] GET DM Response:", result)
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
        avatar_url = get_avatar_url(msg['username'], msg['avatar_url'])
        
        # Get receiver info too
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, username, display_name, avatar_url FROM users WHERE id = %s
            """, (receiver_id,))
            receiver_row = cur.fetchone()
            receiver_avatar = get_avatar_url(receiver_row['username'], receiver_row['avatar_url']) if receiver_row else None
        
        return jsonify({
            'id': msg['id'],
            'sender_id': msg['sender_id'],
            'receiver_id': msg['receiver_id'],
            'content': msg['content'],
            'message_type': msg['message_type'],
            'created_at': msg['created_at'].isoformat(),
            'is_read': bool(msg['is_read']),
            'edited_at': None,
            'sender': {
                'id': msg['sender_id'],
                'username': msg['username'],
                'display_name': msg['display_name'] or msg['username'],
                'avatar_url': avatar_url
            },
            'receiver': {
                'id': receiver_row['id'],
                'username': receiver_row['username'],
                'display_name': receiver_row['display_name'] or receiver_row['username'],
                'avatar_url': receiver_avatar
            } if receiver_row else None
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