# routes/pins.py — Pinned messages management
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import get_db_connection
from utils import get_avatar_url
import logging

log = logging.getLogger(__name__)

pins_bp = Blueprint('pins', __name__, url_prefix='/api/pins')


@pins_bp.route('/channel/<int:channel_id>', methods=['GET'])
@jwt_required()
def get_pinned_messages(channel_id):
    """Get all pinned messages for a channel, newest pin first."""
    conn = None
    try:
        username = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404

            # Verify channel access
            cur.execute(
                "SELECT 1 FROM channel_members WHERE channel_id = %s AND user_id = %s",
                (channel_id, user['id'])
            )
            if not cur.fetchone():
                return jsonify({'error': 'Access denied'}), 403

            cur.execute("""
                SELECT 
                    p.id AS pin_id, p.pinned_at,
                    m.id, m.sender_id, m.content, m.message_type, m.created_at,
                    u.username AS author, u.display_name, u.avatar_url,
                    pu.username AS pinned_by_username, pu.display_name AS pinned_by_display_name,
                    a.file_name AS att_file_name, a.file_path AS att_file_url,
                    a.file_size AS att_file_size, a.mime_type AS att_mime_type
                FROM pinned_messages p
                JOIN messages m ON p.message_id = m.id
                JOIN users u ON m.sender_id = u.id
                JOIN users pu ON p.pinned_by = pu.id
                LEFT JOIN attachments a ON a.message_id = m.id
                WHERE p.channel_id = %s
                ORDER BY p.pinned_at DESC
            """, (channel_id,))

            pins = []
            for row in cur.fetchall():
                pin = {
                    'pin_id': row['pin_id'],
                    'pinned_at': row['pinned_at'].isoformat() if row['pinned_at'] else None,
                    'pinned_by': {
                        'username': row['pinned_by_username'],
                        'display_name': row['pinned_by_display_name'] or row['pinned_by_username'],
                    },
                    'message': {
                        'id': row['id'],
                        'sender_id': row['sender_id'],
                        'content': row['content'],
                        'message_type': row['message_type'],
                        'created_at': row['created_at'].isoformat() if row['created_at'] else None,
                        'author': row['author'],
                        'display_name': row['display_name'] or row['author'],
                        'avatar_url': get_avatar_url(row['author'], row['avatar_url']),
                    }
                }
                if row.get('att_file_name'):
                    pin['message']['attachment'] = {
                        'file_name': row['att_file_name'],
                        'file_url': row['att_file_url'],
                        'file_size': row['att_file_size'],
                        'mime_type': row['att_mime_type'],
                    }
                pins.append(pin)

            # Also get count
            cur.execute(
                "SELECT COUNT(*) AS cnt FROM pinned_messages WHERE channel_id = %s",
                (channel_id,)
            )
            count = cur.fetchone()['cnt']

            return jsonify({'pins': pins, 'count': count}), 200

    except Exception as e:
        log.error(f"[PINS] Get error: {e}", exc_info=True)
        return jsonify({'error': 'Failed to fetch pinned messages'}), 500
    finally:
        if conn:
            conn.close()


@pins_bp.route('/pin', methods=['POST'])
@jwt_required()
def pin_message():
    """Pin a message. Requires admin/owner role in the community."""
    conn = None
    try:
        data = request.get_json()
        message_id = data.get('message_id')
        channel_id = data.get('channel_id')

        if not message_id or not channel_id:
            return jsonify({'error': 'message_id and channel_id required'}), 400

        username = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404
            user_id = user['id']

            # Verify user is a member of the channel's community
            cur.execute("""
                SELECT cm.role FROM community_members cm
                JOIN channels ch ON ch.community_id = cm.community_id
                WHERE ch.id = %s AND cm.user_id = %s
            """, (channel_id, user_id))
            membership = cur.fetchone()
            if not membership:
                return jsonify({'error': 'You must be a community member to pin messages'}), 403

            # Verify message belongs to channel
            cur.execute(
                "SELECT id FROM messages WHERE id = %s AND channel_id = %s",
                (message_id, channel_id)
            )
            if not cur.fetchone():
                return jsonify({'error': 'Message not found in this channel'}), 404

            # Check max pins per channel (production limit: 50)
            cur.execute(
                "SELECT COUNT(*) AS cnt FROM pinned_messages WHERE channel_id = %s",
                (channel_id,)
            )
            if cur.fetchone()['cnt'] >= 50:
                return jsonify({'error': 'Maximum 50 pinned messages per channel'}), 400

            # Pin the message
            cur.execute("""
                INSERT INTO pinned_messages (channel_id, message_id, pinned_by)
                VALUES (%s, %s, %s)
            """, (channel_id, message_id, user_id))

            # Update is_pinned flag on message
            cur.execute(
                "UPDATE messages SET is_pinned = TRUE WHERE id = %s",
                (message_id,)
            )
            conn.commit()

            return jsonify({
                'success': True,
                'message': 'Message pinned',
                'message_id': message_id,
                'pinned_by': username,
            }), 201

    except Exception as e:
        if 'Duplicate' in str(e):
            return jsonify({'error': 'Message is already pinned'}), 409
        log.error(f"[PINS] Pin error: {e}", exc_info=True)
        return jsonify({'error': 'Failed to pin message'}), 500
    finally:
        if conn:
            conn.close()


@pins_bp.route('/unpin', methods=['POST'])
@jwt_required()
def unpin_message():
    """Unpin a message. Requires admin/owner role."""
    conn = None
    try:
        data = request.get_json()
        message_id = data.get('message_id')
        channel_id = data.get('channel_id')

        if not message_id or not channel_id:
            return jsonify({'error': 'message_id and channel_id required'}), 400

        username = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404
            user_id = user['id']

            # Verify user is a member of the channel's community
            cur.execute("""
                SELECT cm.role FROM community_members cm
                JOIN channels ch ON ch.community_id = cm.community_id
                WHERE ch.id = %s AND cm.user_id = %s
            """, (channel_id, user_id))
            membership = cur.fetchone()
            if not membership:
                return jsonify({'error': 'You must be a community member to unpin messages'}), 403

            # Unpin
            cur.execute(
                "DELETE FROM pinned_messages WHERE channel_id = %s AND message_id = %s",
                (channel_id, message_id)
            )
            cur.execute(
                "UPDATE messages SET is_pinned = FALSE WHERE id = %s",
                (message_id,)
            )
            conn.commit()

            return jsonify({
                'success': True,
                'message': 'Message unpinned',
                'message_id': message_id,
            }), 200

    except Exception as e:
        log.error(f"[PINS] Unpin error: {e}", exc_info=True)
        return jsonify({'error': 'Failed to unpin message'}), 500
    finally:
        if conn:
            conn.close()
