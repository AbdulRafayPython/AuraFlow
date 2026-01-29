=====================================
BACKEND API ENDPOINTS TO ADD
=====================================

Add these endpoints to your Flask app.py after the existing channel routes:

1. UPDATE CHANNEL - PUT /api/channels/<int:channel_id>
   - Allows admins/owners to update channel name, description, type
   - Code in routes/channels.py below

2. DELETE COMMUNITY - DELETE /api/channels/communities/<int:community_id>
   - Allows only the owner to delete a community
   - Deletes all channels, messages, and members
   - Code in routes/channels.py below

3. LEAVE COMMUNITY - POST /api/channels/communities/<int:community_id>/leave
   - Allows members to leave a community
   - Removes them from community and all its channels
   - Code in routes/channels.py below


=====================================
ADD THESE TO routes/channels.py
=====================================

# =====================================
# UPDATE CHANNEL
# =====================================
@jwt_required()
def update_channel(channel_id):
    conn = None
    try:
        username = get_jwt_identity()
        data = request.get_json() or {}
        
        name = data.get('name')
        description = data.get('description')
        channel_type = data.get('type')

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

            update_values.append(channel_id)
            query = f"UPDATE channels SET {', '.join(update_fields)} WHERE id = %s"
            cur.execute(query, update_values)

        conn.commit()
        
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
        print(f"[SUCCESS] Community {community_id} deleted")
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
        print(f"[SUCCESS] User {user_id} left community {community_id}")
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


=====================================
ADD THESE ROUTES TO app.py
=====================================

# Import the new functions
from routes.channels import (
    # ... existing imports ...
    update_channel,
    delete_community,
    leave_community
)

# Add these route registrations
app.route("/api/channels/<int:channel_id>", methods=["PUT"])(update_channel)
app.route("/api/channels/communities/<int:community_id>", methods=["DELETE"])(delete_community)
app.route("/api/channels/communities/<int:community_id>/leave", methods=["POST"])(leave_community)


=====================================
TESTING THE FEATURES
=====================================

1. CREATE CHANNEL
   - Click the + button next to "Text Channels" or "Voice Channels"
   - Modal opens to create text or voice channel
   - All community members auto-added to new channel

2. EDIT CHANNEL
   - Right-click on any channel
   - Click "Channel Settings"
   - Edit name, description, type
   - Only admins/owners can edit

3. DELETE CHANNEL
   - Right-click on any channel
   - Click "Channel Settings"
   - Click "Delete Channel"
   - Confirm deletion

4. COMMUNITY SETTINGS
   - Click the settings icon in channel sidebar header
   - Shows your role in community
   - Owner can delete community
   - Members can leave community

5. LEAVE CHANNEL
   - Use "Leave Channel" button in channel management modal
   - (You need to add this UI if needed)

=====================================
FEATURES IMPLEMENTED
=====================================

✅ ADMIN/OWNER can:
   - Create text and voice channels
   - Edit channel name and description
   - Delete channels
   - Delete communities (owner only)
   - Manage members

✅ MEMBERS can:
   - Leave channels
   - Leave communities (members only, not owners)
   - Create communities (and become owner)

✅ ALL USERS:
   - See their role in community (Owner/Admin/Member)
   - Get professional toasts for all actions
   - See real-time updates via socket

=====================================
