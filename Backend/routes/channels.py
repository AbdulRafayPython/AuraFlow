# routes/channels.py (Fixed + Enhanced with get_db_connection())
from flask import jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import get_db_connection


# =====================================
# GET ALL COMMUNITIES FOR USER
# =====================================
@jwt_required()
def get_communities():
    conn = None
    try:
        username = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']

            cur.execute("""
                SELECT 
                    c.id, c.name, c.description, c.icon, c.color, 
                    c.banner_url, cm.role, c.created_at
                FROM communities c
                JOIN community_members cm ON c.id = cm.community_id
                WHERE cm.user_id = %s
                ORDER BY c.created_at ASC
            """, (user_id,))
            communities = cur.fetchall()

        result = [{
            'id': c['id'],
            'name': c['name'],
            'description': c['description'],
            'icon': c['icon'],
            'color': c['color'],
            'banner_url': c['banner_url'],
            'role': c['role'],
            'created_at': c['created_at'].isoformat() if c['created_at'] else None
        } for c in communities]

        return jsonify(result), 200

    except Exception as e:
        print(f"[ERROR] get_communities: {e}")
        return jsonify({'error': 'Failed to fetch communities'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# GET CHANNELS IN A COMMUNITY
# =====================================
@jwt_required()
def get_community_channels(community_id):
    conn = None
    try:
        username = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']

            # Check membership
            cur.execute("SELECT 1 FROM community_members WHERE community_id = %s AND user_id = %s",
                        (community_id, user_id))
            if not cur.fetchone():
                return jsonify({'error': 'Access denied'}), 403

            cur.execute("""
                SELECT id, name, type, description, created_at
                FROM channels 
                WHERE community_id = %s
                ORDER BY name ASC
            """, (community_id,))
            channels = cur.fetchall()

        result = [{
            'id': ch['id'],
            'name': ch['name'],
            'type': ch['type'],
            'description': ch['description'],
            'created_at': ch['created_at'].isoformat() if ch['created_at'] else None
        } for ch in channels]

        return jsonify(result), 200

    except Exception as e:
        print(f"[ERROR] get_community_channels: {e}")
        return jsonify({'error': 'Failed to fetch channels'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# CREATE NEW CHANNEL
# =====================================
@jwt_required()
def create_channel(community_id):
    conn = None
    try:
        username = get_jwt_identity()
        data = request.get_json() or {}
        name = data.get('name')
        channel_type = data.get('type', 'text')
        description = data.get('description', '')

        if not name:
            return jsonify({'error': 'Channel name is required'}), 400
        if channel_type not in ['text', 'voice', 'private']:
            return jsonify({'error': 'Invalid channel type'}), 400

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']

            cur.execute("SELECT role FROM community_members WHERE community_id = %s AND user_id = %s",
                        (community_id, user_id))
            member = cur.fetchone()
            if not member or member['role'] not in ['admin', 'owner']:
                return jsonify({'error': 'Permission denied'}), 403

            cur.execute("""
                INSERT INTO channels (community_id, name, type, description, created_by)
                VALUES (%s, %s, %s, %s, %s)
            """, (community_id, name, channel_type, description, user_id))
            channel_id = cur.lastrowid

        conn.commit()
        return jsonify({
            'id': channel_id,
            'name': name,
            'type': channel_type,
            'description': description,
            'community_id': community_id
        }), 201

    except Exception as e:
        print(f"[ERROR] create_channel: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to create channel'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# JOIN CHANNEL
# =====================================
@jwt_required()
def join_channel(channel_id):
    conn = None
    try:
        username = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']

            cur.execute("SELECT community_id FROM channels WHERE id = %s", (channel_id,))
            channel = cur.fetchone()
            if not channel:
                return jsonify({'error': 'Channel not found'}), 404

            cur.execute("SELECT 1 FROM community_members WHERE community_id = %s AND user_id = %s",
                        (channel['community_id'], user_id))
            if not cur.fetchone():
                return jsonify({'error': 'Must be community member'}), 403

            cur.execute("SELECT 1 FROM channel_members WHERE channel_id = %s AND user_id = %s",
                        (channel_id, user_id))
            if cur.fetchone():
                return jsonify({'message': 'Already joined'}), 200

            cur.execute("""
                INSERT INTO channel_members (channel_id, user_id, role)
                VALUES (%s, %s, 'member')
            """, (channel_id, user_id))

        conn.commit()
        return jsonify({'message': 'Joined channel'}), 200

    except Exception as e:
        print(f"[ERROR] join_channel: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to join channel'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# LEAVE CHANNEL
# =====================================
@jwt_required()
def leave_channel(channel_id):
    conn = None
    try:
        username = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']

            cur.execute("""
                DELETE FROM channel_members 
                WHERE channel_id = %s AND user_id = %s
            """, (channel_id, user_id))

            if cur.rowcount == 0:
                return jsonify({'error': 'Not in channel'}), 404

        conn.commit()
        return jsonify({'message': 'Left channel'}), 200

    except Exception as e:
        print(f"[ERROR] leave_channel: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to leave channel'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# GET FRIENDS LIST (with status)
# =====================================
@jwt_required()
def get_friends():
    conn = None
    try:
        username = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']

            cur.execute("""
                SELECT u.id, u.username, u.display_name, u.avatar_url, 
                       u.status, u.custom_status, u.last_seen
                FROM friends f
                JOIN users u ON u.id IN (f.friend_id, f.user_id)
                WHERE (f.user_id = %s OR f.friend_id = %s) AND u.id != %s
            """, (user_id, user_id, user_id))
            friends = cur.fetchall()

        def format_friend(f):
            username = f['username']
            return {
                'id': f['id'],
                'username': username,
                'display_name': f['display_name'] or username,
                'avatar_url': f['avatar_url'] or 
                             f"https://api.dicebear.com/7.x/avataaars/svg?seed={username}",
                'status': f['status'] or 'offline',
                'custom_status': f['custom_status'],
                'last_seen': f['last_seen'].isoformat() if f['last_seen'] else None
            }

        result = sorted(
            [format_friend(f) for f in friends],
            key=lambda x: (x['status'] != 'online', x['display_name'].lower())
        )

        return jsonify(result), 200

    except Exception as e:
        print(f"[ERROR] get_friends: {e}")
        return jsonify({'error': 'Failed to fetch friends'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# CREATE COMMUNITY
# =====================================
@jwt_required()
def create_community():
    conn = None
    try:
        username = get_jwt_identity()
        data = request.get_json() or {}
        name = data.get('name')
        description = data.get('description', '')
        icon = data.get('icon', 'AF')
        color = data.get('color', '#8B5CF6')

        if not name:
            return jsonify({'error': 'Name required'}), 400

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']

            cur.execute("""
                INSERT INTO communities (name, description, icon, color, created_by)
                VALUES (%s, %s, %s, %s, %s)
            """, (name, description, icon, color, user_id))
            community_id = cur.lastrowid

            cur.execute("""
                INSERT INTO community_members (community_id, user_id, role)
                VALUES (%s, %s, 'owner')
            """, (community_id, user_id))

            cur.execute("""
                INSERT INTO channels (community_id, name, type, description, created_by)
                VALUES (%s, 'general', 'text', 'General chat', %s)
            """, (community_id, user_id))

        conn.commit()
        return jsonify({
            'id': community_id,
            'name': name,
            'description': description,
            'icon': icon,
            'color': color,
            'role': 'owner'
        }), 201

    except Exception as e:
        print(f"[ERROR] create_community: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to create community'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# DELETE CHANNEL
# =====================================
@jwt_required()
def delete_channel(channel_id):
    conn = None
    try:
        username = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']

            cur.execute("SELECT community_id FROM channels WHERE id = %s", (channel_id,))
            channel = cur.fetchone()
            if not channel:
                return jsonify({'error': 'Channel not found'}), 404

            cur.execute("""
                SELECT role FROM community_members
                WHERE community_id = %s AND user_id = %s
            """, (channel['community_id'], user_id))
            member = cur.fetchone()
            if not member or member['role'] not in ['admin', 'owner']:
                return jsonify({'error': 'Permission denied'}), 403

            cur.execute("DELETE FROM channels WHERE id = %s", (channel_id,))

        conn.commit()
        return jsonify({'message': 'Channel deleted'}), 200

    except Exception as e:
        print(f"[ERROR] delete_channel: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to delete channel'}), 500
    finally:
        if conn:
            conn.close()