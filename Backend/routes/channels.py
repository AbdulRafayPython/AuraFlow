# routes/channels.py - Complete with Member Management
from flask import jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import get_db_connection
from werkzeug.utils import secure_filename
import os
import uuid
from PIL import Image
import io

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
                    c.logo_url, c.banner_url, cm.role, c.created_at,
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

        result = [{
            'id': c['id'],
            'name': c['name'],
            'description': c['description'],
            'icon': c['icon'],
            'color': c['color'],
            'logo_url': c['logo_url'],
            'banner_url': c['banner_url'],
            'role': c['role'],
            'created_at': c['created_at'].isoformat() if c['created_at'] else None,
            'member_count': c['member_count'],
            'channel_count': c['channel_count']
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
            # Get user info
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']

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
                SELECT DISTINCT u.id, u.username, u.display_name, u.avatar_url, 
                       u.status, u.custom_status, u.last_seen
                FROM friends f
                JOIN users u ON u.id = (CASE WHEN f.user_id = %s THEN f.friend_id ELSE f.user_id END)
                WHERE f.user_id = %s OR f.friend_id = %s
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
            # Get user ID
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']

            # 1. Create community
            cur.execute("""
                INSERT INTO communities (name, description, icon, color, created_by)
                VALUES (%s, %s, %s, %s, %s)
            """, (name, description, icon, color, user_id))
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
        print(f"[SUCCESS] Community creation complete for {name}")
        
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


# =====================================
# UPDATE COMMUNITY (Name, Description, etc.)
# =====================================
@jwt_required()
def update_community(community_id):
    conn = None
    try:
        username = get_jwt_identity()
        data = request.get_json() or {}
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get user ID
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']
            
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
            
            if not updates:
                return jsonify({'error': 'No fields to update'}), 400
            
            values.append(community_id)
            cur.execute(f"""
                UPDATE communities SET {', '.join(updates)}
                WHERE id = %s
            """, tuple(values))
            
            # Fetch updated community
            cur.execute("""
                SELECT c.id, c.name, c.description, c.icon, c.color, 
                       c.logo_url, c.banner_url, c.created_at
                FROM communities c
                WHERE c.id = %s
            """, (community_id,))
            community = cur.fetchone()
        
        conn.commit()
        
        return jsonify({
            'id': community['id'],
            'name': community['name'],
            'description': community['description'],
            'icon': community['icon'],
            'color': community['color'],
            'logo_url': community['logo_url'],
            'banner_url': community['banner_url'],
            'created_at': community['created_at'].isoformat() if community['created_at'] else None
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
def get_community(community_id):
    conn = None
    try:
        username = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get user ID
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']
            
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
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']
            
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
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']
            
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
def remove_community_logo(community_id):
    conn = None
    try:
        username = get_jwt_identity()
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get user ID
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']
            
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
def remove_community_banner(community_id):
    conn = None
    try:
        username = get_jwt_identity()
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get user ID
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']
            
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
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            current_user_id = user_row['id']

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
        community_id = request.args.get('communityId', type=int)
        
        # Validate community ID
        if not community_id:
            return jsonify({'error': 'Community ID is required'}), 400

        username = get_jwt_identity()
        conn = get_db_connection()
        
        with conn.cursor() as cur:
            # Get current user
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']

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
        
        community_id = data.get('communityId')
        user_id_to_add = data.get('userId')

        # Validate input
        if not community_id or not user_id_to_add:
            return jsonify({'error': 'Both community ID and user ID are required'}), 400

        conn = get_db_connection()
        
        with conn.cursor() as cur:
            # Get current user
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            current_user_id = user_row['id']

            # Check if current user has permission (admin or owner)
            cur.execute("""
                SELECT role FROM community_members 
                WHERE community_id = %s AND user_id = %s
            """, (community_id, current_user_id))
            membership = cur.fetchone()
            
            if not membership or membership['role'] not in ['admin', 'owner']:
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
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']

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
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']

            # Check if user is owner
            cur.execute("""
                SELECT role FROM community_members 
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            member = cur.fetchone()
            
            if not member or member['role'] != 'owner':
                return jsonify({'error': 'Only the owner can delete the community'}), 403

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
        print(f"[SUCCESS] Community {community_id} deleted by {username}")

        # Broadcast deletion to all members via socket
        from app import socketio
        if socketio:
            from datetime import datetime
            socketio.emit('community_deleted', {
                'community_id': community_id,
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
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']

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

        conn.commit()
        print(f"[SUCCESS] User {user_id} ({username}) left community {community_id}")

        # Broadcast leave event via socket to notify remaining members
        from app import socketio
        if socketio:
            from datetime import datetime
            socketio.emit('community_left', {
                'community_id': community_id,
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
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']

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
                    c.id, c.name, c.description, c.icon, c.color, 
                    c.logo_url, c.banner_url, c.created_at,
                    COUNT(DISTINCT cm.user_id) as member_count,
                    u.username as creator_username,
                    u.display_name as creator_name,
                    u.avatar_url as creator_avatar
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

        result = [{
            'id': c['id'],
            'name': c['name'],
            'description': c['description'],
            'icon': c['icon'],
            'color': c['color'],
            'logo_url': c['logo_url'],
            'banner_url': c['banner_url'],
            'member_count': c['member_count'],
            'created_at': c['created_at'].isoformat() if c['created_at'] else None,
            'creator': {
                'username': c['creator_username'],
                'display_name': c['creator_name'],
                'avatar_url': c['creator_avatar']
            } if c['creator_username'] else None
        } for c in communities]

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
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']

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
        print(f"[SUCCESS] User {user_id} joined community {community_id}")
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
