# routes/status.py — User presence, custom status, and unread tracking
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import get_db_connection
from utils import get_avatar_url
import logging

log = logging.getLogger(__name__)

status_bp = Blueprint('status', __name__, url_prefix='/api/status')


# ==================================================
# USER PRESENCE & CUSTOM STATUS
# ==================================================

@status_bp.route('/me', methods=['PUT'])
@jwt_required()
def update_my_status():
    """
    Update current user's presence status and/or custom status.
    Body: { status?, custom_status?, custom_status_emoji? }
    """
    conn = None
    try:
        data = request.get_json() or {}
        username = get_jwt_identity()
        conn = get_db_connection()

        updates = []
        params = []

        if 'status' in data and data['status'] in ('online', 'idle', 'dnd', 'offline'):
            updates.append("status = %s")
            params.append(data['status'])

        if 'custom_status' in data:
            # Allow empty string to clear
            updates.append("custom_status = %s")
            params.append(data['custom_status'] if data['custom_status'] else None)

        if 'custom_status_emoji' in data:
            updates.append("custom_status_emoji = %s")
            params.append(data['custom_status_emoji'] if data['custom_status_emoji'] else None)

        if not updates:
            return jsonify({'error': 'No fields to update'}), 400

        params.append(username)

        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE users SET {', '.join(updates)} WHERE username = %s",
                params
            )
            conn.commit()

            # Return updated status
            cur.execute("""
                SELECT status, custom_status, custom_status_emoji
                FROM users WHERE username = %s
            """, (username,))
            user = cur.fetchone()

        return jsonify({
            'success': True,
            'status': user['status'],
            'custom_status': user['custom_status'],
            'custom_status_emoji': user['custom_status_emoji'],
        }), 200

    except Exception as e:
        log.error(f"[STATUS] Update error: {e}", exc_info=True)
        return jsonify({'error': 'Failed to update status'}), 500
    finally:
        if conn:
            conn.close()


@status_bp.route('/me', methods=['GET'])
@jwt_required()
def get_my_status():
    """Get current user's full status info."""
    conn = None
    try:
        username = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, username, display_name, avatar_url, bio,
                       status, custom_status, custom_status_emoji, last_seen
                FROM users WHERE username = %s
            """, (username,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404

        return jsonify({
            'id': user['id'],
            'username': user['username'],
            'display_name': user['display_name'],
            'avatar_url': get_avatar_url(user['username'], user['avatar_url']),
            'bio': user['bio'],
            'status': user['status'],
            'custom_status': user['custom_status'],
            'custom_status_emoji': user['custom_status_emoji'],
            'last_seen': user['last_seen'].isoformat() if user['last_seen'] else None,
        }), 200

    except Exception as e:
        log.error(f"[STATUS] Get error: {e}", exc_info=True)
        return jsonify({'error': 'Failed to get status'}), 500
    finally:
        if conn:
            conn.close()


@status_bp.route('/user/<username>', methods=['GET'])
@jwt_required()
def get_user_profile(username):
    """
    Get a user's public profile (for profile popover).
    Returns: avatar, bio, status, custom_status, member_since, mutual friends count.
    """
    conn = None
    try:
        current_username = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get target user
            cur.execute("""
                SELECT id, username, display_name, avatar_url, bio,
                       status, custom_status, custom_status_emoji, last_seen, created_at
                FROM users WHERE username = %s
            """, (username,))
            target = cur.fetchone()
            if not target:
                return jsonify({'error': 'User not found'}), 404

            # Get current user id
            cur.execute("SELECT id FROM users WHERE username = %s", (current_username,))
            current_user = cur.fetchone()
            current_user_id = current_user['id'] if current_user else None

            # Check friendship status
            friendship_status = 'none'
            if current_user_id and current_user_id != target['id']:
                cur.execute("""
                    SELECT 1 FROM friends
                    WHERE (user_id = %s AND friend_id = %s)
                       OR (user_id = %s AND friend_id = %s)
                """, (current_user_id, target['id'], target['id'], current_user_id))
                if cur.fetchone():
                    friendship_status = 'friends'
                else:
                    cur.execute("""
                        SELECT status, sender_id FROM friend_requests
                        WHERE ((sender_id = %s AND receiver_id = %s)
                           OR  (sender_id = %s AND receiver_id = %s))
                          AND status = 'pending'
                    """, (current_user_id, target['id'], target['id'], current_user_id))
                    req = cur.fetchone()
                    if req:
                        friendship_status = 'pending_sent' if req['sender_id'] == current_user_id else 'pending_received'

            # Count mutual friends
            mutual_count = 0
            if current_user_id and current_user_id != target['id']:
                cur.execute("""
                    SELECT COUNT(*) AS cnt FROM (
                        SELECT friend_id AS fid FROM friends WHERE user_id = %s
                        UNION SELECT user_id AS fid FROM friends WHERE friend_id = %s
                    ) my_friends
                    INNER JOIN (
                        SELECT friend_id AS fid FROM friends WHERE user_id = %s
                        UNION SELECT user_id AS fid FROM friends WHERE friend_id = %s
                    ) their_friends ON my_friends.fid = their_friends.fid
                """, (current_user_id, current_user_id, target['id'], target['id']))
                mutual_count = cur.fetchone()['cnt']

            # Get shared communities
            shared_communities = []
            if current_user_id and current_user_id != target['id']:
                cur.execute("""
                    SELECT c.id, c.name, c.icon, c.color, c.logo_url
                    FROM communities c
                    JOIN community_members cm1 ON c.id = cm1.community_id AND cm1.user_id = %s
                    JOIN community_members cm2 ON c.id = cm2.community_id AND cm2.user_id = %s
                    LIMIT 5
                """, (current_user_id, target['id']))
                shared_communities = [
                    {'id': c['id'], 'name': c['name'], 'icon': c['icon'],
                     'color': c['color'], 'logo_url': c['logo_url']}
                    for c in cur.fetchall()
                ]

        return jsonify({
            'id': target['id'],
            'username': target['username'],
            'display_name': target['display_name'],
            'avatar_url': get_avatar_url(target['username'], target['avatar_url']),
            'bio': target['bio'],
            'status': target['status'],
            'custom_status': target['custom_status'],
            'custom_status_emoji': target['custom_status_emoji'],
            'last_seen': target['last_seen'].isoformat() if target['last_seen'] else None,
            'member_since': target['created_at'].isoformat() if target['created_at'] else None,
            'friendship_status': friendship_status,
            'mutual_friends_count': mutual_count,
            'shared_communities': shared_communities,
            'is_self': current_username == username,
        }), 200

    except Exception as e:
        log.error(f"[STATUS] Profile error: {e}", exc_info=True)
        return jsonify({'error': 'Failed to get user profile'}), 500
    finally:
        if conn:
            conn.close()


# ==================================================
# CHANNEL UNREAD TRACKING
# ==================================================

@status_bp.route('/unread', methods=['GET'])
@jwt_required()
def get_unread_counts():
    """
    Get unread message counts for all channels the user is a member of.
    Returns: { channel_id: { unread_count, last_message_id, last_message_at } }
    """
    conn = None
    try:
        username = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404
            user_id = user['id']

            # Get all channels user is in, with unread count
            cur.execute("""
                SELECT 
                    cm.channel_id,
                    COALESCE(crs.last_read_message_id, 0) AS last_read_id,
                    (
                        SELECT COUNT(*) FROM messages m
                        WHERE m.channel_id = cm.channel_id
                          AND m.id > COALESCE(crs.last_read_message_id, 0)
                          AND m.sender_id != %s
                    ) AS unread_count,
                    (
                        SELECT MAX(m2.id) FROM messages m2
                        WHERE m2.channel_id = cm.channel_id
                    ) AS last_message_id,
                    (
                        SELECT MAX(m3.created_at) FROM messages m3
                        WHERE m3.channel_id = cm.channel_id
                    ) AS last_message_at
                FROM channel_members cm
                LEFT JOIN channel_read_status crs 
                    ON crs.channel_id = cm.channel_id AND crs.user_id = %s
                WHERE cm.user_id = %s
            """, (user_id, user_id, user_id))

            unread = {}
            for row in cur.fetchall():
                if row['unread_count'] > 0:
                    unread[row['channel_id']] = {
                        'unread_count': row['unread_count'],
                        'last_message_id': row['last_message_id'],
                        'last_message_at': row['last_message_at'].isoformat() if row['last_message_at'] else None,
                    }

        return jsonify(unread), 200

    except Exception as e:
        log.error(f"[UNREAD] Get error: {e}", exc_info=True)
        return jsonify({'error': 'Failed to get unread counts'}), 500
    finally:
        if conn:
            conn.close()


@status_bp.route('/unread/mark-read', methods=['POST'])
@jwt_required()
def mark_channel_read():
    """
    Mark a channel as read up to a specific message.
    Body: { channel_id, message_id }
    """
    conn = None
    try:
        data = request.get_json() or {}
        channel_id = data.get('channel_id')
        message_id = data.get('message_id')

        if not channel_id:
            return jsonify({'error': 'channel_id required'}), 400

        username = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404
            user_id = user['id']

            # If no message_id given, use the latest message in channel
            if not message_id:
                cur.execute(
                    "SELECT MAX(id) AS max_id FROM messages WHERE channel_id = %s",
                    (channel_id,)
                )
                result = cur.fetchone()
                message_id = result['max_id'] if result else None

            if message_id:
                cur.execute("""
                    INSERT INTO channel_read_status (user_id, channel_id, last_read_message_id)
                    VALUES (%s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        last_read_message_id = GREATEST(last_read_message_id, VALUES(last_read_message_id)),
                        last_read_at = CURRENT_TIMESTAMP
                """, (user_id, channel_id, message_id))
                conn.commit()

        return jsonify({'success': True, 'channel_id': channel_id, 'message_id': message_id}), 200

    except Exception as e:
        log.error(f"[UNREAD] Mark read error: {e}", exc_info=True)
        return jsonify({'error': 'Failed to mark as read'}), 500
    finally:
        if conn:
            conn.close()
