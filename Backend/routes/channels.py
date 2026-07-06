# routes/channels.py - Complete with Member Management
from flask import jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import get_db_connection
from werkzeug.utils import secure_filename
from utils import get_user_id, resolve_public_community_id, get_community_id_from_public_id
# FIX 2/9: member_count updates and channel membership cache invalidation
from services.redis_client import (
    invalidate_channel_membership, invalidate_member_role, get_redis,
    set_community_id_by_public_id, set_community_public_id, get_community_public_id,
    get_community_id_by_public_id,
)
import os
import uuid
import json as _json
from PIL import Image
import io


# ── Lightweight HTTP response cache helpers ──────────────────────────────
# Used to avoid redundant DB hits for hot read endpoints. Falls back to a
# no-op if Redis is unavailable.
def _cache_get(key):
    r = get_redis()
    if r is None:
        return None
    try:
        val = r.get(key)
        return _json.loads(val) if val else None
    except Exception:
        return None


def _cache_set(key, data, ttl=30):
    r = get_redis()
    if r is None:
        return
    try:
        r.set(key, _json.dumps(data, default=str), ex=ttl)
    except Exception:
        pass


def _cache_delete(*keys):
    r = get_redis()
    if r is None or not keys:
        return
    try:
        r.delete(*keys)
    except Exception:
        pass


# ── Intelligence-profile heuristic (G1c) ─────────────────────────────────
# Maps installed-and-enabled community agents → a small badge subset shown on
# discover/featured cards. NULL `communities.intelligence_profile` falls back
# to this; a non-NULL JSON array is an admin override and wins.
_INTEL_AGENT_MAP = {
    'moderation': 'safe',
    'summarizer': 'recaps',
    'translator': 'multilingual',
}
_INTEL_BADGE_ORDER = ['safe', 'recaps', 'multilingual']


def _compute_intel_profile(installed_rows):
    """installed_rows: iterable of (agent_type, enabled) from community_agents.

    Returns the sorted subset of {safe, recaps, multilingual} for which the
    mapped agent is installed AND enabled in the community.
    """
    present = set()
    for agent_type, enabled in installed_rows:
        if not enabled:
            continue
        badge = _INTEL_AGENT_MAP.get(agent_type)
        if badge:
            present.add(badge)
    return [b for b in _INTEL_BADGE_ORDER if b in present]


def _parse_intel_profile_column(raw):
    """Coerce a stored JSON value into a clean badge list, or None on miss.

    MySQL JSON columns come back as either a str (needs json.loads) or already
    a Python list, depending on driver config. Returns None if absent so the
    caller knows to fall back to the heuristic.
    """
    if raw is None:
        return None
    if isinstance(raw, (list, tuple)):
        seq = raw
    elif isinstance(raw, str):
        try:
            seq = _json.loads(raw)
        except Exception:
            return None
    else:
        return None
    if not isinstance(seq, list):
        return None
    allowed = set(_INTEL_BADGE_ORDER)
    return [b for b in _INTEL_BADGE_ORDER if b in seq and b in allowed]


def _intel_profiles_for_communities(cur, community_ids):
    """Bulk-compute heuristic profiles for a list of community_ids.

    One query into community_agents, grouped server-side. Returns
    {community_id: [badges]}. Communities with no enabled mapped agent map to
    an empty list (so caller can distinguish "no badges" from "not looked up").
    """
    result = {cid: [] for cid in community_ids}
    if not community_ids:
        return result
    placeholders = ','.join(['%s'] * len(community_ids))
    cur.execute(
        f"""
        SELECT community_id, agent_type, enabled
        FROM community_agents
        WHERE community_id IN ({placeholders}) AND enabled = 1
        """,
        tuple(community_ids),
    )
    rows_by_cid = {}
    for row in cur.fetchall():
        rows_by_cid.setdefault(row['community_id'], []).append(
            (row['agent_type'], row['enabled'])
        )
    for cid, rows in rows_by_cid.items():
        result[cid] = _compute_intel_profile(rows)
    return result


# Configuration for uploads
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'uploads', 'communities')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
LOGO_SIZE = (256, 256)
BANNER_SIZE = (1200, 400)

# Ensure upload directory exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
print(f"[INFO] Upload folder: {UPLOAD_FOLDER}")

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# ── System event messages ─────────────────────────────────────────────────
def _post_system_message(community_id, content):
    """Insert a message_type='system' row into the community's general channel
    and broadcast it via Socket.IO so all connected members see it live.

    Falls back to the first channel if no channel named 'general' exists.
    Fully best-effort — any exception is swallowed so the calling route
    always succeeds.
    """
    try:
        from datetime import datetime as _dt
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                # Find general (or first) channel for this community
                cur.execute(
                    """
                    SELECT id FROM channels
                    WHERE community_id = %s
                    ORDER BY FIELD(name,'general','main','chat',name), id
                    LIMIT 1
                    """,
                    (community_id,),
                )
                row = cur.fetchone()
                if not row:
                    return
                channel_id = row['id']

                cur.execute(
                    """
                    INSERT INTO messages (channel_id, sender_id, content, message_type)
                    VALUES (%s, NULL, %s, 'system')
                    """,
                    (channel_id, content),
                )
                msg_id = cur.lastrowid
            conn.commit()
        finally:
            conn.close()

        # Invalidate the channel messages Redis cache so next page-load sees this message
        try:
            from services.redis_client import invalidate_channel_messages_cache
            invalidate_channel_messages_cache(channel_id)
        except Exception:
            pass

        # Broadcast to the channel room
        from app import socketio as _sio
        _sio.emit(
            'message_received',
            {
                'id': msg_id,
                'channel_id': channel_id,
                'sender_id': None,
                'content': content,
                'message_type': 'system',
                'reply_to': None,
                'created_at': _dt.now().isoformat(),
                'author': 'System',
                'avatar': None,
                'is_blocked': False,
                'moderation': None,
            },
            room=f"channel_{channel_id}",
            namespace='/',
        )
    except Exception as _sys_err:
        print(f"[SYSTEM MSG] skipped: {_sys_err}")


def _maybe_post_welcome(community_id, community_name, username, user_id,
                        first_channel_id):
    """If the AutoMessage agent is installed AND enabled with welcome_enabled,
    post a welcome message as the AI bot in the first channel. Best-effort.
    """
    if not first_channel_id:
        return
    conn = None
    try:
        import json as _json
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT enabled, settings FROM community_agents "
                "WHERE community_id = %s AND agent_type = 'auto_message' "
                "LIMIT 1",
                (community_id,),
            )
            row = cur.fetchone()
        if not row or not row.get('enabled'):
            return

        settings = row.get('settings') or {}
        if isinstance(settings, str):
            try:
                settings = _json.loads(settings)
            except Exception:
                settings = {}
        if settings.get('welcome_enabled') is False:
            return

        from agents.auto_message import AutoMessageAgent
        AutoMessageAgent().generate_welcome(
            community_name=community_name,
            username=username,
            community_description=None,
            community_id=community_id,
            channel_id=first_channel_id,
            user_id=user_id,
            post=True,
        )
    finally:
        if conn:
            conn.close()

def process_image(file, max_size, maintain_aspect=True):
    """Process and resize image while maintaining quality"""
    try:
        img = Image.open(file)
        
        # Convert to RGB if necessary (for PNG with transparency)
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')
        
        if maintain_aspect:
            img.thumbnail(max_size, Image.Resampling.LANCZOS)
        else:
            img = img.resize(max_size, Image.Resampling.LANCZOS)
        
        # Save to bytes
        output = io.BytesIO()
        img.save(output, format='JPEG', quality=85, optimize=True)
        output.seek(0)
        return output
    except Exception as e:
        print(f"[ERROR] process_image: {e}")
        return None


# =====================================
# GET ALL COMMUNITIES FOR USER
# =====================================
@jwt_required()
def get_communities():
    conn = None
    try:
        username = get_jwt_identity()
        # Resolve user_id from cache (cheap) so we can key the response cache.
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404

            # Response cache (TTL 30s) — invalidated on community join/leave/create.
            _ck = f"communities:{user_id}"
            _cached = _cache_get(_ck)
            if _cached is not None:
                return jsonify(_cached), 200

            cur.execute("""
                SELECT
                    c.id, c.public_id, c.name, c.description, c.icon, c.color,
                    c.logo_url, c.banner_url, cm.role, c.created_at,
                    c.intelligence_profile,
                    COALESCE(mc.member_count, 0) as member_count,
                    COALESCE(cc.channel_count, 0) as channel_count
                FROM communities c
                JOIN community_members cm ON c.id = cm.community_id
                LEFT JOIN blocked_users bu ON c.id = bu.community_id AND bu.user_id = %s
                LEFT JOIN (
                    SELECT community_id, COUNT(*) as member_count
                    FROM community_members GROUP BY community_id
                ) mc ON mc.community_id = c.id
                LEFT JOIN (
                    SELECT community_id, COUNT(*) as channel_count
                    FROM channels GROUP BY community_id
                ) cc ON cc.community_id = c.id
                WHERE cm.user_id = %s AND bu.user_id IS NULL
                ORDER BY c.created_at ASC
            """, (user_id, user_id))
            communities = cur.fetchall()

            # Intelligence-profile resolution: admin override wins; otherwise
            # derive from installed+enabled community_agents (G1c).
            community_ids = [c['id'] for c in communities]
            heuristic_profiles = _intel_profiles_for_communities(cur, community_ids)

        result = []
        for c in communities:
            stored = _parse_intel_profile_column(c.get('intelligence_profile'))
            profile = stored if stored is not None else heuristic_profiles.get(c['id'], [])
            result.append({
                'id': c['public_id'],
                'name': c['name'],
                'description': c['description'],
                'icon': c['icon'],
                'color': c['color'],
                'logo_url': c['logo_url'],
                'banner_url': c['banner_url'],
                'role': c['role'],
                'created_at': c['created_at'].isoformat() if c['created_at'] else None,
                'member_count': c['member_count'],
                'channel_count': c['channel_count'],
                'intelligence_profile': profile,
            })

        _cache_set(_ck, result, ttl=30)
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
@resolve_public_community_id
def get_community_channels(community_id):
    conn = None
    try:
        username = get_jwt_identity()

        # Response cache (TTL 30s) — invalidated on channel create/delete/update.
        _ck = f"channels:{community_id}"
        _cached = _cache_get(_ck)

        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404

            # Membership check is still required even on cache hit (security).
            cur.execute("SELECT 1 FROM community_members WHERE community_id = %s AND user_id = %s",
                        (community_id, user_id))
            if not cur.fetchone():
                return jsonify({'error': 'Access denied'}), 403

            if _cached is not None:
                return jsonify(_cached), 200

            cur.execute("""
                SELECT id, name, type, description, created_at
                FROM channels
                WHERE community_id = %s
                ORDER BY name ASC
                LIMIT 200
            """, (community_id,))
            channels = cur.fetchall()

        result = [{
            'id': ch['id'],
            'name': ch['name'],
            'type': ch['type'],
            'description': ch['description'],
            'created_at': ch['created_at'].isoformat() if ch['created_at'] else None
        } for ch in channels]

        _cache_set(_ck, result, ttl=30)
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
@resolve_public_community_id
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
            # Get user info
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404

            # Check permissions
            cur.execute("SELECT role FROM community_members WHERE community_id = %s AND user_id = %s",
                        (community_id, user_id))
            member = cur.fetchone()
            if not member or member['role'] not in ['admin', 'owner']:
                return jsonify({'error': 'Permission denied'}), 403

            # 1. Create the channel
            cur.execute("""
                INSERT INTO channels (community_id, name, type, description, created_by)
                VALUES (%s, %s, %s, %s, %s)
            """, (community_id, name, channel_type, description, user_id))
            channel_id = cur.lastrowid
            print(f"[INFO] Created channel {channel_id}: {name}")

            # 🔥 FIX: 2. Get ALL members of this community
            cur.execute("""
                SELECT user_id, role FROM community_members 
                WHERE community_id = %s
            """, (community_id,))
            community_members = cur.fetchall()

            # 🔥 FIX: 3. Add ALL community members to this channel
            members_added = 0
            for cm in community_members:
                try:
                    # Community admins/owners become channel admins
                    channel_role = 'admin' if cm['role'] in ['admin', 'owner'] else 'member'
                    
                    cur.execute("""
                        INSERT INTO channel_members (channel_id, user_id, role)
                        VALUES (%s, %s, %s)
                    """, (channel_id, cm['user_id'], channel_role))
                    members_added += 1
                except Exception as mem_err:
                    print(f"[WARNING] Failed to add member {cm['user_id']} to channel: {mem_err}")

            print(f"[INFO] ✅ Added {members_added} members to channel {channel_id}")

        conn.commit()
        # Invalidate the channels-list cache for this community
        _cache_delete(f"channels:{community_id}")
        print(f"[SUCCESS] Channel '{name}' created with {members_added} members")

        return jsonify({
            'id': channel_id,
            'name': name,
            'type': channel_type,
            'description': description,
            'community_id': community_id,
            'members_added': members_added
        }), 201

    except Exception as e:
        print(f"[ERROR] create_channel: {e}")
        import traceback
        traceback.print_exc()
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
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404

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
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404

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
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404

            _ck = f"friends:{user_id}"
            _cached = _cache_get(_ck)
            if _cached is not None:
                return jsonify(_cached), 200

            cur.execute("""
                SELECT DISTINCT u.id, u.public_id, u.username, u.display_name, u.avatar_url,
                       u.status, u.custom_status, u.last_seen
                FROM friends f
                JOIN users u ON u.id = (CASE WHEN f.user_id = %s THEN f.friend_id ELSE f.user_id END)
                WHERE f.user_id = %s OR f.friend_id = %s
                LIMIT 500
            """, (user_id, user_id, user_id))
            friends = cur.fetchall()

        def format_friend(f):
            username = f['username']
            return {
                'id': f['id'],
                'public_id': f['public_id'],
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

        _cache_set(_ck, result, ttl=20)
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
            # Get user ID
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404

            # 1. Create community
            new_public_id = str(uuid.uuid4())
            cur.execute("""
                INSERT INTO communities (public_id, name, description, icon, color, created_by)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (new_public_id, name, description, icon, color, user_id))
            community_id = cur.lastrowid
            print(f"[INFO] Created community {community_id}: {name}")

            # 2. Add creator as owner in community_members
            cur.execute("""
                INSERT INTO community_members (community_id, user_id, role)
                VALUES (%s, %s, 'owner')
            """, (community_id, user_id))
            print(f"[INFO] Added user {user_id} as owner of community {community_id}")

            # 3. Create default "general" channel
            cur.execute("""
                INSERT INTO channels (community_id, name, type, description, created_by)
                VALUES (%s, 'general', 'text', 'General chat', %s)
            """, (community_id, user_id))
            general_channel_id = cur.lastrowid
            print(f"[INFO] Created general channel {general_channel_id}")

            # 🔥 FIX: Add creator to the general channel as member
            cur.execute("""
                INSERT INTO channel_members (channel_id, user_id, role)
                VALUES (%s, %s, 'admin')
            """, (general_channel_id, user_id))
            print(f"[INFO] ✅ Added user {user_id} to channel_members for channel {general_channel_id}")

        conn.commit()
        _cache_delete(f"communities:{user_id}")
        set_community_id_by_public_id(new_public_id, community_id)
        set_community_public_id(community_id, new_public_id)
        print(f"[SUCCESS] Community creation complete for {name}")

        return jsonify({
            'id': new_public_id,
            'name': name,
            'description': description,
            'icon': icon,
            'color': color,
            'role': 'owner'
        }), 201

    except Exception as e:
        print(f"[ERROR] create_community: {e}")
        import traceback
        traceback.print_exc()
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
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404

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
        _cache_delete(f"channels:{channel['community_id']}")
        return jsonify({'message': 'Channel deleted'}), 200

    except Exception as e:
        print(f"[ERROR] delete_channel: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to delete channel'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# UPDATE COMMUNITY (Name, Description, etc.)
# =====================================
@jwt_required()
@resolve_public_community_id
def update_community(community_id):
    conn = None
    try:
        username = get_jwt_identity()
        data = request.get_json() or {}
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get user ID
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            # Check permissions (only owner/admin can update)
            cur.execute("""
                SELECT role FROM community_members 
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            member = cur.fetchone()
            if not member or member['role'] not in ['admin', 'owner']:
                return jsonify({'error': 'Permission denied'}), 403
            
            # Build update query dynamically
            updates = []
            values = []
            
            if 'name' in data and data['name']:
                updates.append("name = %s")
                values.append(data['name'])
            if 'description' in data:
                updates.append("description = %s")
                values.append(data['description'])
            if 'icon' in data:
                updates.append("icon = %s")
                values.append(data['icon'])
            if 'color' in data:
                updates.append("color = %s")
                values.append(data['color'])
            if 'intelligence_profile' in data:
                profile = data['intelligence_profile']
                if profile is None:
                    updates.append("intelligence_profile = NULL")
                elif isinstance(profile, list):
                    allowed = {'safe', 'recaps', 'multilingual'}
                    if not all(isinstance(b, str) and b in allowed for b in profile):
                        return jsonify({
                            'error': 'intelligence_profile must be a subset of '
                                     '[safe, recaps, multilingual]'
                        }), 400
                    # Canonicalise: dedupe + display order.
                    deduped = [b for b in _INTEL_BADGE_ORDER if b in set(profile)]
                    updates.append("intelligence_profile = %s")
                    values.append(_json.dumps(deduped))
                else:
                    return jsonify({
                        'error': 'intelligence_profile must be array or null'
                    }), 400

            if not updates:
                return jsonify({'error': 'No fields to update'}), 400
            
            values.append(community_id)
            cur.execute(f"""
                UPDATE communities SET {', '.join(updates)}
                WHERE id = %s
            """, tuple(values))
            
            # Fetch updated community
            cur.execute("""
                SELECT c.id, c.public_id, c.name, c.description, c.icon, c.color,
                       c.logo_url, c.banner_url, c.created_at,
                       c.intelligence_profile
                FROM communities c
                WHERE c.id = %s
            """, (community_id,))
            community = cur.fetchone()
            # Resolve heuristic fallback so the client gets the effective set.
            heuristic_profiles = _intel_profiles_for_communities(cur, [community_id])

        conn.commit()

        stored = _parse_intel_profile_column(community.get('intelligence_profile'))
        effective_profile = stored if stored is not None else heuristic_profiles.get(community_id, [])

        return jsonify({
            'id': community['public_id'],
            'name': community['name'],
            'description': community['description'],
            'icon': community['icon'],
            'color': community['color'],
            'logo_url': community['logo_url'],
            'banner_url': community['banner_url'],
            'created_at': community['created_at'].isoformat() if community['created_at'] else None,
            'intelligence_profile': effective_profile,
        }), 200
        
    except Exception as e:
        print(f"[ERROR] update_community: {e}")
        import traceback
        traceback.print_exc()
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to update community'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# GET SINGLE COMMUNITY DETAILS
# =====================================
@jwt_required()
@resolve_public_community_id
def get_community(community_id):
    conn = None
    try:
        username = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get user ID
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            # Check membership
            cur.execute("""
                SELECT cm.role FROM community_members cm
                WHERE cm.community_id = %s AND cm.user_id = %s
            """, (community_id, user_id))
            membership = cur.fetchone()
            if not membership:
                return jsonify({'error': 'Access denied'}), 403
            
            # Fetch community details
            cur.execute("""
                SELECT c.id, c.name, c.description, c.icon, c.color, 
                       c.logo_url, c.banner_url, c.created_at, c.created_by,
                       u.username as creator_username, u.display_name as creator_display_name
                FROM communities c
                LEFT JOIN users u ON c.created_by = u.id
                WHERE c.id = %s
            """, (community_id,))
            community = cur.fetchone()
            
            if not community:
                return jsonify({'error': 'Community not found'}), 404
            
            # Get member count
            cur.execute("""
                SELECT COUNT(*) as count FROM community_members 
                WHERE community_id = %s
            """, (community_id,))
            member_count = cur.fetchone()['count']
        
        return jsonify({
            'id': community['id'],
            'name': community['name'],
            'description': community['description'],
            'icon': community['icon'],
            'color': community['color'],
            'logo_url': community['logo_url'],
            'banner_url': community['banner_url'],
            'created_at': community['created_at'].isoformat() if community['created_at'] else None,
            'role': membership['role'],
            'member_count': member_count,
            'creator': {
                'username': community['creator_username'],
                'display_name': community['creator_display_name']
            } if community['creator_username'] else None
        }), 200
        
    except Exception as e:
        print(f"[ERROR] get_community: {e}")
        return jsonify({'error': 'Failed to fetch community'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# UPLOAD COMMUNITY LOGO
# =====================================
@jwt_required()
@resolve_public_community_id
def upload_community_logo(community_id):
    conn = None
    try:
        username = get_jwt_identity()
        
        # Check if file is present
        if 'logo' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['logo']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'Invalid file type. Allowed: png, jpg, jpeg, gif, webp'}), 400
        
        # Check file size
        file.seek(0, 2)
        size = file.tell()
        file.seek(0)
        if size > MAX_FILE_SIZE:
            return jsonify({'error': 'File too large. Maximum 5MB allowed'}), 400
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get user ID
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            # Check permissions (only owner/admin can upload)
            cur.execute("""
                SELECT role FROM community_members 
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            member = cur.fetchone()
            if not member or member['role'] not in ['admin', 'owner']:
                return jsonify({'error': 'Permission denied'}), 403
            
            # Get existing logo to delete
            cur.execute("SELECT logo_url FROM communities WHERE id = %s", (community_id,))
            community = cur.fetchone()
            if not community:
                return jsonify({'error': 'Community not found'}), 404
            
            old_logo = community['logo_url']
            
            # Process and save image
            processed = process_image(file, LOGO_SIZE)
            if not processed:
                return jsonify({'error': 'Failed to process image'}), 500
            
            # Generate unique filename
            filename = f"logo_{community_id}_{uuid.uuid4().hex[:8]}.jpg"
            filepath = os.path.join(UPLOAD_FOLDER, filename)
            
            print(f"[DEBUG] Saving logo to: {filepath}")
            
            with open(filepath, 'wb') as f:
                f.write(processed.read())
            
            print(f"[DEBUG] Logo file saved successfully")
            
            # Update database
            logo_url = f"/uploads/communities/{filename}"
            cur.execute("""
                UPDATE communities SET logo_url = %s WHERE id = %s
            """, (logo_url, community_id))
            
            print(f"[DEBUG] Database updated with logo_url: {logo_url}")
            
            # Delete old logo file if exists
            if old_logo:
                old_path = os.path.join(UPLOAD_FOLDER, os.path.basename(old_logo))
                if os.path.exists(old_path):
                    try:
                        os.remove(old_path)
                        print(f"[DEBUG] Deleted old logo: {old_path}")
                    except Exception as e:
                        print(f"[WARNING] Failed to delete old logo: {e}")
        
        conn.commit()
        print(f"[SUCCESS] Logo uploaded for community {community_id}")
        
        return jsonify({
            'message': 'Logo uploaded successfully',
            'logo_url': logo_url
        }), 200
        
    except Exception as e:
        print(f"[ERROR] upload_community_logo: {e}")
        import traceback
        traceback.print_exc()
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to upload logo'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# UPLOAD COMMUNITY BANNER
# =====================================
@jwt_required()
@resolve_public_community_id
def upload_community_banner(community_id):
    conn = None
    try:
        username = get_jwt_identity()
        
        # Check if file is present
        if 'banner' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['banner']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'Invalid file type. Allowed: png, jpg, jpeg, gif, webp'}), 400
        
        # Check file size
        file.seek(0, 2)
        size = file.tell()
        file.seek(0)
        if size > MAX_FILE_SIZE:
            return jsonify({'error': 'File too large. Maximum 5MB allowed'}), 400
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get user ID
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            # Check permissions (only owner/admin can upload)
            cur.execute("""
                SELECT role FROM community_members 
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            member = cur.fetchone()
            if not member or member['role'] not in ['admin', 'owner']:
                return jsonify({'error': 'Permission denied'}), 403
            
            # Get existing banner to delete
            cur.execute("SELECT banner_url FROM communities WHERE id = %s", (community_id,))
            community = cur.fetchone()
            if not community:
                return jsonify({'error': 'Community not found'}), 404
            
            old_banner = community['banner_url']
            
            # Process and save image
            processed = process_image(file, BANNER_SIZE, maintain_aspect=False)
            if not processed:
                return jsonify({'error': 'Failed to process image'}), 500
            
            # Generate unique filename
            filename = f"banner_{community_id}_{uuid.uuid4().hex[:8]}.jpg"
            filepath = os.path.join(UPLOAD_FOLDER, filename)
            
            print(f"[DEBUG] Saving banner to: {filepath}")
            
            with open(filepath, 'wb') as f:
                f.write(processed.read())
            
            print(f"[DEBUG] Banner file saved successfully")
            
            # Update database
            banner_url = f"/uploads/communities/{filename}"
            cur.execute("""
                UPDATE communities SET banner_url = %s WHERE id = %s
            """, (banner_url, community_id))
            
            print(f"[DEBUG] Database updated with banner_url: {banner_url}")
            
            # Delete old banner file if exists
            if old_banner:
                old_path = os.path.join(UPLOAD_FOLDER, os.path.basename(old_banner))
                if os.path.exists(old_path):
                    try:
                        os.remove(old_path)
                        print(f"[DEBUG] Deleted old banner: {old_path}")
                    except Exception as e:
                        print(f"[WARNING] Failed to delete old banner: {e}")
        
        conn.commit()
        print(f"[SUCCESS] Banner uploaded for community {community_id}")
        
        return jsonify({
            'message': 'Banner uploaded successfully',
            'banner_url': banner_url
        }), 200
        
    except Exception as e:
        print(f"[ERROR] upload_community_banner: {e}")
        import traceback
        traceback.print_exc()
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to upload banner'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# REMOVE COMMUNITY LOGO
# =====================================
@jwt_required()
@resolve_public_community_id
def remove_community_logo(community_id):
    conn = None
    try:
        username = get_jwt_identity()
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get user ID
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            # Check permissions (only owner/admin can remove)
            cur.execute("""
                SELECT role FROM community_members 
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            member = cur.fetchone()
            if not member or member['role'] not in ['admin', 'owner']:
                return jsonify({'error': 'Permission denied'}), 403
            
            # Get existing logo to delete
            cur.execute("SELECT logo_url FROM communities WHERE id = %s", (community_id,))
            community = cur.fetchone()
            if not community:
                return jsonify({'error': 'Community not found'}), 404
            
            old_logo = community['logo_url']
            
            # Update database
            cur.execute("""
                UPDATE communities SET logo_url = NULL WHERE id = %s
            """, (community_id,))
            
            # Delete file if exists
            if old_logo:
                old_path = os.path.join(UPLOAD_FOLDER, os.path.basename(old_logo))
                if os.path.exists(old_path):
                    try:
                        os.remove(old_path)
                        print(f"[DEBUG] Deleted logo file: {old_path}")
                    except Exception as e:
                        print(f"[WARNING] Failed to delete logo file: {e}")
        
        conn.commit()
        print(f"[SUCCESS] Logo removed for community {community_id}")
        
        return jsonify({'message': 'Logo removed successfully'}), 200
        
    except Exception as e:
        print(f"[ERROR] remove_community_logo: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to remove logo'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# REMOVE COMMUNITY BANNER
# =====================================
@jwt_required()
@resolve_public_community_id
def remove_community_banner(community_id):
    conn = None
    try:
        username = get_jwt_identity()
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get user ID
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            # Check permissions (only owner/admin can remove)
            cur.execute("""
                SELECT role FROM community_members 
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            member = cur.fetchone()
            if not member or member['role'] not in ['admin', 'owner']:
                return jsonify({'error': 'Permission denied'}), 403
            
            # Get existing banner to delete
            cur.execute("SELECT banner_url FROM communities WHERE id = %s", (community_id,))
            community = cur.fetchone()
            if not community:
                return jsonify({'error': 'Community not found'}), 404
            
            old_banner = community['banner_url']
            
            # Update database
            cur.execute("""
                UPDATE communities SET banner_url = NULL WHERE id = %s
            """, (community_id,))
            
            # Delete file if exists
            if old_banner:
                old_path = os.path.join(UPLOAD_FOLDER, os.path.basename(old_banner))
                if os.path.exists(old_path):
                    try:
                        os.remove(old_path)
                        print(f"[DEBUG] Deleted banner file: {old_path}")
                    except Exception as e:
                        print(f"[WARNING] Failed to delete banner file: {e}")
        
        conn.commit()
        print(f"[SUCCESS] Banner removed for community {community_id}")
        
        return jsonify({'message': 'Banner removed successfully'}), 200
        
    except Exception as e:
        print(f"[ERROR] remove_community_banner: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to remove banner'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# 🆕 SEARCH USERS (for adding to community)
# =====================================
@jwt_required()
def search_users():
    """
    Search users by username (fuzzy match) or email (exact match).
    Used for finding users to invite to communities.
    
    Query params:
        query: Search term (min 2 characters)
    
    Returns:
        List of matching users (excluding current user)
    """
    conn = None
    try:
        query = request.args.get('query', '').strip()
        
        # Validate query
        if not query or len(query) < 2:
            return jsonify([]), 200

        username = get_jwt_identity()
        conn = get_db_connection()
        
        with conn.cursor() as cur:
            # Get current user ID
            current_user_id = get_user_id(username, cur)
            if current_user_id is None:
                return jsonify({'error': 'User not found'}), 404

            # Search by username (fuzzy) or email (exact)
            search_pattern = f"%{query}%"
            cur.execute("""
                SELECT id, username, email, display_name, avatar_url
                FROM users
                WHERE (username LIKE %s OR email = %s)
                  AND id != %s
                ORDER BY 
                    CASE 
                        WHEN username = %s THEN 1
                        WHEN username LIKE %s THEN 2
                        WHEN email = %s THEN 3
                        ELSE 4
                    END,
                    username ASC
                LIMIT 20
            """, (search_pattern, query, current_user_id, query, f"{query}%", query))
            users = cur.fetchall()

        # Format results
        result = [{
            'id': u['id'],
            'username': u['username'],
            'email': u['email'],
            'display_name': u['display_name'] or u['username'],
            'avatar_url': u['avatar_url'] or f"https://api.dicebear.com/7.x/avataaars/svg?seed={u['username']}"
        } for u in users]

        print(f"[INFO] search_users: Found {len(result)} users for query '{query}'")
        return jsonify(result), 200

    except Exception as e:
        print(f"[ERROR] search_users: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Search failed'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# GET USER BY PUBLIC_ID — resolves an opaque DM-URL id (e.g. /dm/<uuid>)
# to the profile MainLayout needs. DM history can outlive a friendship
# (the friends list alone isn't a reliable source), so this looks the user
# up directly rather than requiring them to still be a current friend.
# =====================================
@jwt_required()
def get_user_by_public_id(public_id):
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, username, display_name, avatar_url, status
                FROM users
                WHERE public_id = %s
            """, (str(public_id),))
            u = cur.fetchone()

        if not u:
            return jsonify({'error': 'User not found'}), 404

        return jsonify({
            'id': u['id'],
            'username': u['username'],
            'display_name': u['display_name'] or u['username'],
            'avatar_url': u['avatar_url'] or f"https://api.dicebear.com/7.x/avataaars/svg?seed={u['username']}",
            'status': u['status'] or 'offline',
        }), 200

    except Exception as e:
        print(f"[ERROR] get_user_by_public_id: {e}")
        return jsonify({'error': 'Lookup failed'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# 🆕 GET COMMUNITY MEMBERS
# =====================================
@jwt_required()
def get_community_members():
    """
    Get all members of a community with their roles.
    
    Query params:
        communityId: ID of the community
    
    Returns:
        List of community members with user info and roles
    """
    conn = None
    try:
        public_id = request.args.get('communityId')
        community_id = get_community_id_from_public_id(public_id) if public_id else None

        # Validate community ID
        if not community_id:
            return jsonify({'error': 'Community ID is required'}), 400

        username = get_jwt_identity()
        conn = get_db_connection()
        
        with conn.cursor() as cur:
            # Get current user
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404

            # Check if user is a member of the community
            cur.execute("""
                SELECT role FROM community_members 
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            membership = cur.fetchone()
            
            if not membership:
                return jsonify({'error': "You don't have permission to view members"}), 403

            # Get all community members
            cur.execute("""
                SELECT 
                    u.id, u.username, u.email, u.display_name, u.avatar_url, 
                    cm.role, cm.joined_at, cm.violation_count,
                    CASE WHEN bu.user_id IS NOT NULL THEN 1 ELSE 0 END as is_blocked
                FROM community_members cm
                JOIN users u ON cm.user_id = u.id
                LEFT JOIN blocked_users bu ON cm.community_id = bu.community_id AND cm.user_id = bu.user_id
                WHERE cm.community_id = %s
                ORDER BY
                    CASE cm.role
                        WHEN 'owner' THEN 1
                        WHEN 'admin' THEN 2
                        ELSE 3
                    END,
                    u.username ASC
                LIMIT 200
            """, (community_id,))
            members = cur.fetchall()

        # Format results
        result = [{
            'id': m['id'],
            'username': m['username'],
            'email': m['email'],
            'display_name': m['display_name'] or m['username'],
            'avatar_url': m['avatar_url'] or f"https://api.dicebear.com/7.x/avataaars/svg?seed={m['username']}",
            'role': m['role'],
            'joined_at': m['joined_at'].isoformat() if m['joined_at'] else None,
            'violation_count': m['violation_count'] if membership['role'] == 'owner' else None,
            'is_blocked': bool(m['is_blocked'])
        } for m in members]

        print(f"[INFO] get_community_members: Found {len(result)} members for community {community_id}")
        return jsonify(result), 200

    except Exception as e:
        print(f"[ERROR] get_community_members: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to load members'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# 🆕 ADD MEMBER TO COMMUNITY
# =====================================
@jwt_required()
def add_community_member():
    """
    Add a user to a community AND all its channels.
    Only owners and admins can add members.
    
    Request body:
        communityId: ID of the community
        userId: ID of the user to add
    
    Returns:
        Success message or error
    """
    conn = None
    try:
        username = get_jwt_identity()
        data = request.get_json() or {}

        public_id = data.get('communityId')
        user_id_to_add = data.get('userId')

        # Validate input
        if not public_id or not user_id_to_add:
            return jsonify({'error': 'Both community ID and user ID are required'}), 400

        community_id = get_community_id_from_public_id(public_id)
        if not community_id:
            return jsonify({'error': 'Community not found'}), 404

        conn = get_db_connection()
        
        with conn.cursor() as cur:
            # Get current user
            current_user_id = get_user_id(username, cur)
            if current_user_id is None:
                return jsonify({'error': 'User not found'}), 404

            # Check if current user has permission (admin or owner)
            cur.execute("""
                SELECT role FROM community_members 
                WHERE community_id = %s AND user_id = %s
            """, (community_id, current_user_id))
            membership = cur.fetchone()
            
            if not membership or membership['role'] not in ['admin', 'owner']:
                role = membership['role'] if membership else 'not-a-member'
                print(f"[ADD-MEMBER] 403 permission: user {username} (id={current_user_id}) "
                      f"role='{role}' in community {community_id} — only owner/admin can add members")
                return jsonify({'error': "You don't have permission to add members"}), 403

            # Check if user to add exists
            cur.execute("SELECT id, username FROM users WHERE id = %s", (user_id_to_add,))
            target_user = cur.fetchone()
            if not target_user:
                return jsonify({'error': 'User not found'}), 404

            # Respect community blocks
            cur.execute(
                "SELECT 1 FROM blocked_users WHERE community_id = %s AND user_id = %s",
                (community_id, user_id_to_add)
            )
            if cur.fetchone():
                return jsonify({'error': 'User is blocked from this community'}), 403

            # Check if user is already a member
            cur.execute("""
                SELECT 1 FROM community_members 
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id_to_add))
            
            if cur.fetchone():
                return jsonify({'error': 'User is already a member'}), 409

            # 1. Add user to community_members
            cur.execute("""
                INSERT INTO community_members (community_id, user_id, role)
                VALUES (%s, %s, 'member')
            """, (community_id, user_id_to_add))
            print(f"[INFO] Added user {user_id_to_add} to community {community_id}")

            # 🔥 FIX: 2. Get all channels in this community
            cur.execute("""
                SELECT id, name FROM channels 
                WHERE community_id = %s
            """, (community_id,))
            channels = cur.fetchall()

            # 🔥 FIX: 3. Add user to ALL channels in the community
            channels_added = 0
            for channel in channels:
                try:
                    cur.execute("""
                        INSERT INTO channel_members (channel_id, user_id, role)
                        VALUES (%s, %s, 'member')
                    """, (channel['id'], user_id_to_add))
                    channels_added += 1
                    print(f"[INFO] ✅ Added user {user_id_to_add} to channel {channel['id']} ({channel['name']})")
                except Exception as ch_err:
                    print(f"[WARNING] Failed to add to channel {channel['id']}: {ch_err}")

        conn.commit()
        print(f"[SUCCESS] User {target_user['username']} added to community {community_id} and {channels_added} channels")

        # System event label in chat feed
        _post_system_message(community_id, f"{target_user['username']} was added to the community")

        # Publish on the autonomous-agent event bus — best-effort.
        try:
            from agents import event_bus as _agent_bus
            _agent_bus.publish(_agent_bus.TOPIC_USER_JOINED, {
                'user_id':        user_id_to_add,
                'username':       target_user.get('username'),
                'community_id':   community_id,
                'first_channel_id': channels[0]['id'] if channels else None,
                'added_by_admin': True,
            })
        except Exception as _bus_err:
            print(f"[event_bus] user.joined_community publish skipped: {_bus_err}")
        
        return jsonify({
            'message': 'Member added successfully',
            'channels_added': channels_added
        }), 201

    except Exception as e:
        print(f"[ERROR] add_community_member: {e}")
        import traceback
        traceback.print_exc()
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to add member'}), 500
    finally:
        if conn:
            conn.close()

# =====================================
# UPDATE CHANNEL
# =====================================
@jwt_required()
def update_channel(channel_id):
    """
    Update channel name, description, or type.
    Only admins/owners can update channels.
    
    Request body:
        name: New channel name (optional)
        description: New description (optional)
        type: Channel type - 'text', 'voice' (optional)
    
    Returns:
        Updated channel object
    """
    conn = None
    try:
        username = get_jwt_identity()
        data = request.get_json() or {}
        
        name = data.get('name')
        description = data.get('description')
        channel_type = data.get('type')

        conn = get_db_connection()
        
        with conn.cursor() as cur:
            # Get user ID
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404

            # Get channel and community
            cur.execute("""
                SELECT community_id FROM channels WHERE id = %s
            """, (channel_id,))
            channel = cur.fetchone()
            if not channel:
                return jsonify({'error': 'Channel not found'}), 404

            # Check permissions (admin or owner of community)
            cur.execute("""
                SELECT role FROM community_members 
                WHERE community_id = %s AND user_id = %s
            """, (channel['community_id'], user_id))
            member = cur.fetchone()
            
            if not member or member['role'] not in ['admin', 'owner']:
                return jsonify({'error': 'Permission denied'}), 403

            # Build update query
            update_fields = []
            update_values = []
            
            if name is not None:
                update_fields.append("name = %s")
                update_values.append(name)
            if description is not None:
                update_fields.append("description = %s")
                update_values.append(description)
            if channel_type is not None:
                if channel_type not in ['text', 'voice']:
                    return jsonify({'error': 'Invalid channel type'}), 400
                update_fields.append("type = %s")
                update_values.append(channel_type)

            if not update_fields:
                return jsonify({'error': 'No fields to update'}), 400

            # Execute update
            update_values.append(channel_id)
            query = f"UPDATE channels SET {', '.join(update_fields)} WHERE id = %s"
            cur.execute(query, update_values)

        conn.commit()
        
        # Fetch and return updated channel
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, name, type, description, created_at
                FROM channels WHERE id = %s
            """, (channel_id,))
            updated = cur.fetchone()

        result = {
            'id': updated['id'],
            'name': updated['name'],
            'type': updated['type'],
            'description': updated['description'],
            'created_at': updated['created_at'].isoformat() if updated['created_at'] else None
        }

        _cache_delete(f"channels:{channel['community_id']}")
        print(f"[SUCCESS] Channel {channel_id} updated")
        return jsonify(result), 200

    except Exception as e:
        print(f"[ERROR] update_channel: {e}")
        import traceback
        traceback.print_exc()
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to update channel'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# DELETE COMMUNITY
# =====================================
@jwt_required()
@resolve_public_community_id
def delete_community(community_id):
    """
    Delete a community and all its channels/messages.
    Only the community owner can delete.
    
    Returns:
        Success message
    """
    conn = None
    try:
        username = get_jwt_identity()
        conn = get_db_connection()
        
        with conn.cursor() as cur:
            # Get user ID
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404

            # Check if user is owner
            cur.execute("""
                SELECT role FROM community_members 
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            member = cur.fetchone()
            
            if not member or member['role'] != 'owner':
                return jsonify({'error': 'Only the owner can delete the community'}), 403

            # Capture public_id before the row is gone — needed for the client-facing
            # socket broadcast below (clients now key communities by public_id, not int).
            cur.execute("SELECT public_id FROM communities WHERE id = %s", (community_id,))
            _row = cur.fetchone()
            community_public_id = _row['public_id'] if _row else None

            # Get all channels in community
            cur.execute("SELECT id FROM channels WHERE community_id = %s", (community_id,))
            channels = cur.fetchall()

            # Delete all messages in those channels
            for channel in channels:
                cur.execute("DELETE FROM messages WHERE channel_id = %s", (channel['id'],))
                cur.execute("DELETE FROM channel_members WHERE channel_id = %s", (channel['id'],))

            # Delete channels
            cur.execute("DELETE FROM channels WHERE community_id = %s", (community_id,))

            # Delete community members
            cur.execute("DELETE FROM community_members WHERE community_id = %s", (community_id,))

            # Delete community
            cur.execute("DELETE FROM communities WHERE id = %s", (community_id,))

        conn.commit()
        _cache_delete(f"communities:{user_id}", f"channels:{community_id}")
        print(f"[SUCCESS] Community {community_id} deleted by {username}")

        # Broadcast deletion to all members via socket
        from app import socketio
        if socketio:
            from datetime import datetime
            socketio.emit('community_deleted', {
                'community_id': community_id,
                'community_public_id': community_public_id,
                'deleted_by': username,
                'timestamp': datetime.now().isoformat()
            }, namespace='/')
            print(f"[SOCKET] Broadcasted community_deleted for community {community_id}")

        return jsonify({'message': 'Community deleted successfully'}), 200

    except Exception as e:
        print(f"[ERROR] delete_community: {e}")
        import traceback
        traceback.print_exc()
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to delete community'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# LEAVE COMMUNITY
# =====================================
@jwt_required()
@resolve_public_community_id
def leave_community(community_id):
    """
    Leave a community (remove yourself from it).
    Owner cannot leave - they must delete or transfer ownership.
    
    Returns:
        Success message or error
    """
    conn = None
    try:
        username = get_jwt_identity()
        conn = get_db_connection()
        
        with conn.cursor() as cur:
            # Get user ID
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404

            # Check membership
            cur.execute("""
                SELECT role FROM community_members 
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            member = cur.fetchone()
            
            if not member:
                return jsonify({'error': 'Not a member of this community'}), 404
            
            if member['role'] == 'owner':
                return jsonify({'error': 'Owner cannot leave. Delete the community instead'}), 403

            # Remove from all channels in this community
            cur.execute("""
                DELETE FROM channel_members 
                WHERE user_id = %s AND channel_id IN (
                    SELECT id FROM channels WHERE community_id = %s
                )
            """, (user_id, community_id))

            # Remove from community
            cur.execute("""
                DELETE FROM community_members 
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))

            # FIX 2: Decrement denormalized member_count.
            cur.execute("""
                UPDATE communities SET member_count = GREATEST(member_count - 1, 0)
                WHERE id = %s
            """, (community_id,))

        conn.commit()
        # FIX 6/9: Invalidate cached role and channel memberships for this user
        invalidate_member_role(community_id, user_id)
        _cache_delete(f"communities:{user_id}")
        print(f"[SUCCESS] User {user_id} ({username}) left community {community_id}")

        # System event label in chat feed
        _post_system_message(community_id, f"{username} left the community")

        # Broadcast leave event via socket to notify remaining members
        from app import socketio
        if socketio:
            from datetime import datetime
            socketio.emit('community_left', {
                'community_id': community_id,
                'community_public_id': get_community_public_id(community_id),
                'user_id': user_id,
                'username': username,
                'timestamp': datetime.now().isoformat()
            }, namespace='/')
            print(f"[SOCKET] Broadcasted community_left for user {username} from community {community_id}")

        return jsonify({'message': 'You have left the community'}), 200

    except Exception as e:
        print(f"[ERROR] leave_community: {e}")
        import traceback
        traceback.print_exc()
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to leave community'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# DISCOVER COMMUNITIES (Public Browse)
# =====================================
@jwt_required()
def discover_communities():
    """
    Get all available communities to join (public communities).
    Excludes communities already joined by the user.
    Supports search and pagination.
    
    Query Parameters:
        - search: Search term for community name/description
        - limit: Number of results (default: 20)
        - offset: Pagination offset (default: 0)
    
    Returns:
        List of available communities with member count
    """
    conn = None
    try:
        username = get_jwt_identity()
        search = request.args.get('search', '').strip()
        limit = int(request.args.get('limit', 20))
        offset = int(request.args.get('offset', 0))
        
        # Validate pagination parameters
        limit = min(limit, 100)  # Max 100 per page
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get user ID
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404

            # Build search query
            search_condition = ""
            search_params = []
            
            if search:
                search_condition = "AND (c.name LIKE %s OR c.description LIKE %s)"
                search_term = f"%{search}%"
                search_params = [search_term, search_term]
            
            # Get communities NOT joined by user with member count
            query = f"""
                SELECT
                    c.id, c.public_id, c.name, c.description, c.icon, c.color,
                    c.logo_url, c.banner_url, c.created_at,
                    ANY_VALUE(c.intelligence_profile) as intelligence_profile,
                    COUNT(DISTINCT cm.user_id) as member_count,
                    ANY_VALUE(u.username) as creator_username,
                    ANY_VALUE(u.display_name) as creator_name,
                    ANY_VALUE(u.avatar_url) as creator_avatar
                FROM communities c
                LEFT JOIN community_members cm ON c.id = cm.community_id
                LEFT JOIN users u ON c.created_by = u.id
                LEFT JOIN blocked_users bu ON c.id = bu.community_id AND bu.user_id = %s
                WHERE c.id NOT IN (
                    SELECT community_id FROM community_members WHERE user_id = %s
                )
                AND bu.user_id IS NULL
                {search_condition}
                GROUP BY c.id
                ORDER BY member_count DESC, c.created_at DESC
                LIMIT %s OFFSET %s
            """

            params = [user_id, user_id] + search_params + [limit, offset]
            cur.execute(query, params)
            communities = cur.fetchall()

            # Heuristic fallback for any community where the override is NULL.
            community_ids = [c['id'] for c in communities]
            heuristic_profiles = _intel_profiles_for_communities(cur, community_ids)

        result = []
        for c in communities:
            stored = _parse_intel_profile_column(c.get('intelligence_profile'))
            profile = stored if stored is not None else heuristic_profiles.get(c['id'], [])
            result.append({
                'id': c['public_id'],
                'name': c['name'],
                'description': c['description'],
                'icon': c['icon'],
                'color': c['color'],
                'logo_url': c['logo_url'],
                'banner_url': c['banner_url'],
                'member_count': c['member_count'],
                'created_at': c['created_at'].isoformat() if c['created_at'] else None,
                'intelligence_profile': profile,
                'creator': {
                    'username': c['creator_username'],
                    'display_name': c['creator_name'],
                    'avatar_url': c['creator_avatar'],
                } if c['creator_username'] else None,
            })

        return jsonify(result), 200

    except Exception as e:
        print(f"[ERROR] discover_communities: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to discover communities'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# JOIN COMMUNITY
# =====================================
@jwt_required()
@resolve_public_community_id
def join_community(community_id):
    """
    Join a community and add user to all public channels in the community.
    
    Returns:
        Success message with community details
    """
    conn = None
    try:
        username = get_jwt_identity()
        conn = get_db_connection()
        
        with conn.cursor() as cur:
            # Get user ID
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404

            # Check if community exists
            cur.execute("SELECT id, name FROM communities WHERE id = %s", (community_id,))
            community = cur.fetchone()
            if not community:
                return jsonify({'error': 'Community not found'}), 404

            # Check if user is blocked from this community
            cur.execute(
                "SELECT 1 FROM blocked_users WHERE community_id = %s AND user_id = %s",
                (community_id, user_id)
            )
            if cur.fetchone():
                return jsonify({'error': 'You are blocked from this community'}), 403

            # Check if already a member
            cur.execute("""
                SELECT id FROM community_members 
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            existing_member = cur.fetchone()
            
            if existing_member:
                return jsonify({'error': 'Already a member of this community'}), 400

            # Add user to community as 'member'
            cur.execute("""
                INSERT INTO community_members (community_id, user_id, role)
                VALUES (%s, %s, 'member')
            """, (community_id, user_id))

            # FIX 2: Increment denormalized member_count. The migration
            # add_sql_perf_v2.sql adds this column; this is a no-op if it
            # doesn't exist yet (caught by the except in the outer block).
            cur.execute("""
                UPDATE communities SET member_count = member_count + 1
                WHERE id = %s
            """, (community_id,))

            # Get all public channels in the community and add user to them
            cur.execute("""
                SELECT id FROM channels 
                WHERE community_id = %s
            """, (community_id,))
            channels = cur.fetchall()
            
            for channel in channels:
                channel_id = channel['id']
                # Check if user is not already in channel
                cur.execute("""
                    SELECT id FROM channel_members 
                    WHERE channel_id = %s AND user_id = %s
                """, (channel_id, user_id))
                if not cur.fetchone():
                    cur.execute("""
                        INSERT INTO channel_members (channel_id, user_id, role)
                        VALUES (%s, %s, 'member')
                    """, (channel_id, user_id))

        conn.commit()
        # FIX 9: Prime channel membership cache for all channels just joined
        for channel in channels:
            invalidate_channel_membership(channel['id'], user_id)
        _cache_delete(f"communities:{user_id}")
        print(f"[SUCCESS] User {user_id} joined community {community_id}")

        # System event label in chat feed
        _post_system_message(community_id, f"{username} joined the community")

        # Publish on the autonomous-agent event bus — the auto_message agent
        # handles welcome posting via the orchestrator (best-effort).
        try:
            from agents import event_bus as _agent_bus
            _agent_bus.publish(_agent_bus.TOPIC_USER_JOINED, {
                'user_id':      user_id,
                'username':     username,
                'community_id': community_id,
                'first_channel_id': channels[0]['id'] if channels else None,
            })
        except Exception as _bus_err:
            print(f"[event_bus] user.joined_community publish skipped: {_bus_err}")

        return jsonify({
            'message': f'Successfully joined {community["name"]}',
            'community_id': community_id
        }), 200

    except Exception as e:
        print(f"[ERROR] join_community: {e}")
        import traceback
        traceback.print_exc()
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to join community'}), 500
    finally:
        if conn:
            conn.close()

