# routes/friends.py
from flask import jsonify, request, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import get_db_connection
from datetime import datetime


# =====================================
# SEND FRIEND REQUEST
# =====================================
@jwt_required()
def send_friend_request():
    conn = None
    try:
        current_user = get_jwt_identity()
        data = request.get_json() or {}
        target_username = data.get('username')

        if not target_username:
            return jsonify({'error': 'username is required'}), 400

        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get sender ID
            cur.execute("SELECT id FROM users WHERE username = %s", (current_user,))
            sender_row = cur.fetchone()
            if not sender_row:
                return jsonify({'error': 'Sender not found'}), 404
            sender_id = sender_row['id']

            # Get receiver ID
            cur.execute("SELECT id FROM users WHERE username = %s", (target_username,))
            receiver_row = cur.fetchone()
            if not receiver_row:
                return jsonify({'error': 'Target user not found'}), 404
            receiver_id = receiver_row['id']

            if sender_id == receiver_id:
                return jsonify({'error': 'Cannot send friend request to yourself'}), 400

            # Check if already friends
            cur.execute("""
                SELECT 1 FROM friends
                WHERE (user_id = %s AND friend_id = %s) 
                   OR (user_id = %s AND friend_id = %s)
            """, (sender_id, receiver_id, receiver_id, sender_id))
            if cur.fetchone():
                return jsonify({'error': 'Already friends'}), 400

            # Check existing friend request (any direction)
            cur.execute("""
                SELECT id, status, sender_id, receiver_id 
                FROM friend_requests
                WHERE (sender_id = %s AND receiver_id = %s)
                   OR (sender_id = %s AND receiver_id = %s)
            """, (sender_id, receiver_id, receiver_id, sender_id))
            existing = cur.fetchone()

            if existing:
                if existing['status'] == 'pending':
                    return jsonify({'error': 'Friend request already pending'}), 400
                elif existing['status'] == 'rejected':
                    # Resend: update existing rejected request
                    cur.execute("""
                        UPDATE friend_requests 
                        SET status = 'pending', created_at = NOW()
                        WHERE id = %s
                    """, (existing['id'],))
                    conn.commit()
                    return jsonify({'message': 'Friend request re-sent successfully'}), 200
                elif existing['status'] in ('accepted', 'cancelled'):
                    # Should not happen, but clean up
                    cur.execute("DELETE FROM friend_requests WHERE id = %s", (existing['id'],))

            # Insert new request
            cur.execute("""
                INSERT INTO friend_requests (sender_id, receiver_id, status)
                VALUES (%s, %s, 'pending')
            """, (sender_id, receiver_id))
            request_id = cur.lastrowid
            
            # Get full sender data for notification
            cur.execute("""
                SELECT id, username, display_name, avatar_url
                FROM users 
                WHERE id = %s
            """, (sender_id,))
            sender_info = cur.fetchone()
            
            # Get receiver's username for socket lookup
            cur.execute("SELECT username FROM users WHERE id = %s", (receiver_id,))
            receiver_user = cur.fetchone()
            receiver_username = receiver_user['username'] if receiver_user else None

        conn.commit()
        
        # Emit socket event to notify receiver in real-time
        try:
            from app import socketio
            from routes.sockets import user_socket_sessions
            
            notification_data = {
                'id': request_id,
                'sender_id': sender_id,
                'receiver_id': receiver_id,
                'status': 'pending',
                'created_at': datetime.now().isoformat(),
                'sender': {
                    'username': sender_info['username'],
                    'display_name': sender_info['display_name'] or sender_info['username'],
                    'avatar_url': sender_info['avatar_url']
                } if sender_info else None
            }
            
            receiver_room = f"user_{receiver_id}"
            
            print(f"[FRIEND_REQUEST] 📤 Sending to room: {receiver_room}")
            print(f"[FRIEND_REQUEST] 📦 Payload: {notification_data}")
            print(f"[FRIEND_REQUEST] 👥 Active sessions: {list(user_socket_sessions.keys())}")
            
            # Try room-based emit first
            socketio.emit('friend_request_received', notification_data, 
                         to=receiver_room, namespace='/')
            print(f"[FRIEND_REQUEST] ✅ Event emitted to room {receiver_room}")
            
            # Also emit directly to the user's socket ID
            if receiver_username and receiver_username in user_socket_sessions:
                receiver_sid = user_socket_sessions[receiver_username]
                print(f"[FRIEND_REQUEST] 🎯 Direct emit to {receiver_username} (SID: {receiver_sid})")
                socketio.emit('friend_request_received', notification_data,
                             to=receiver_sid, namespace='/')
                print(f"[FRIEND_REQUEST] ✅ Direct emit completed")
            else:
                print(f"[FRIEND_REQUEST] ⚠️ Receiver {receiver_username} not in active sessions")
            
        except Exception as socket_error:
            print(f"[FRIEND_REQUEST] ❌ Failed to emit event: {socket_error}")
            import traceback
            traceback.print_exc()
        
        return jsonify({
            'message': 'Friend request sent',
            'request_id': request_id
        }), 201

    except Exception as e:
        print(f"[ERROR] send_friend_request: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# GET PENDING FRIEND REQUESTS
# =====================================
@jwt_required()
def get_pending_requests():
    conn = None
    try:
        current_user = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (current_user,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']

            # Incoming requests (received from others)
            cur.execute("""
                SELECT fr.id, fr.sender_id, u.username, u.display_name, u.avatar_url, fr.created_at
                FROM friend_requests fr
                JOIN users u ON fr.sender_id = u.id
                WHERE fr.receiver_id = %s AND fr.status = 'pending'
                ORDER BY fr.created_at DESC
            """, (user_id,))
            requests = cur.fetchall()

        def format_user(user_row):
            username = user_row['username']
            return {
                'username': username,
                'display_name': user_row['display_name'] or username,
                'avatar_url': user_row['avatar_url'] or 
                             f"https://api.dicebear.com/7.x/avataaars/svg?seed={username}"
            }

        result = [
            {
                'id': r['id'],
                'sender_id': r['sender_id'],
                'username': r['username'],
                'display_name': r['display_name'] or r['username'],
                'avatar_url': r['avatar_url'] or f"https://api.dicebear.com/7.x/avataaars/svg?seed={r['username']}",
                'created_at': r['created_at'].isoformat() if r['created_at'] else None
            } for r in requests
        ]

        return jsonify(result), 200

    except Exception as e:
        print(f"[ERROR] get_pending_requests: {e}")
        return jsonify({'error': 'Failed to fetch requests'}), 500
    finally:
        if conn:
            conn.close()


# GET SENT FRIEND REQUESTS
# =====================================
@jwt_required()
def get_sent_requests():
    conn = None
    try:
        current_user = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (current_user,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']

            # Outgoing requests (sent by current user)
            cur.execute("""
                SELECT fr.id, fr.receiver_id, u.username, u.display_name, u.avatar_url, fr.created_at
                FROM friend_requests fr
                JOIN users u ON fr.receiver_id = u.id
                WHERE fr.sender_id = %s AND fr.status = 'pending'
                ORDER BY fr.created_at DESC
            """, (user_id,))
            requests = cur.fetchall()

        def format_user(user_row):
            username = user_row['username']
            return {
                'username': username,
                'display_name': user_row['display_name'] or username,
                'avatar_url': user_row['avatar_url'] or 
                             f"https://api.dicebear.com/7.x/avataaars/svg?seed={username}"
            }

        result = [
            {
                'id': r['id'],
                'receiver_id': r['receiver_id'],
                'username': r['username'],
                'display_name': r['display_name'] or r['username'],
                'avatar_url': r['avatar_url'] or f"https://api.dicebear.com/7.x/avataaars/svg?seed={r['username']}",
                'created_at': r['created_at'].isoformat() if r['created_at'] else None
            } for r in requests
        ]

        return jsonify(result), 200

    except Exception as e:
        print(f"[ERROR] get_sent_requests: {e}")
        return jsonify({'error': 'Failed to fetch sent requests'}), 500
    finally:
        if conn:
            conn.close()



# =====================================
# ACCEPT FRIEND REQUEST
# =====================================
@jwt_required()
def accept_friend_request(request_id):
    conn = None
    try:
        current_user = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (current_user,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']

            cur.execute("""
                SELECT sender_id, receiver_id, status 
                FROM friend_requests 
                WHERE id = %s AND receiver_id = %s
            """, (request_id, user_id))
            req = cur.fetchone()
            if not req:
                return jsonify({'error': 'Friend request not found or access denied'}), 404
            if req['status'] != 'pending':
                return jsonify({'error': f"Request is {req['status']}" }), 400

            # Update request
            cur.execute("UPDATE friend_requests SET status = 'accepted' WHERE id = %s", (request_id,))

            # Add bidirectional friendship
            cur.execute("""
                INSERT INTO friends (user_id, friend_id) 
                VALUES (%s, %s), (%s, %s)
                ON DUPLICATE KEY UPDATE user_id = user_id
            """, (user_id, req['sender_id'], req['sender_id'], user_id))
            
            # Get acceptor info for notification
            cur.execute("""
                SELECT username, display_name, avatar_url
                FROM users
                WHERE id = %s
            """, (user_id,))
            acceptor_info = cur.fetchone()

        conn.commit()
        
        # Emit socket event to notify sender that request was accepted
        try:
            from app import socketio
            
            notification_data = {
                'request_id': request_id,
                'sender_id': req['sender_id'],
                'acceptor_id': user_id,
                'username': acceptor_info['username'],
                'display_name': acceptor_info['display_name'] or acceptor_info['username'],
                'avatar_url': acceptor_info['avatar_url']
            }
            
            # Notify the original sender
            socketio.emit('friend_request_accepted', notification_data,
                         room=f"user_{req['sender_id']}", namespace='/')
            
            # Also emit friend_status to both users
            socketio.emit('friend_status', {'friend_id': user_id, 'status': 'accepted'},
                         room=f"user_{req['sender_id']}", namespace='/')
            socketio.emit('friend_status', {'friend_id': req['sender_id'], 'status': 'accepted'},
                         room=f"user_{user_id}", namespace='/')
            
            print(f"[SOCKET] Emitted friend_request_accepted to user_{req['sender_id']}")
        except Exception as socket_error:
            print(f"[WARNING] Failed to emit friend_request_accepted event: {socket_error}")
        
        return jsonify({'message': 'Friend request accepted'}), 200

    except Exception as e:
        print(f"[ERROR] accept_friend_request: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to accept request'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# REJECT / CANCEL / REMOVE
# =====================================
@jwt_required()
def reject_friend_request(request_id):
    return _update_request_status(request_id, 'rejected', "receiver_id")

@jwt_required()
def cancel_friend_request(request_id):
    return _update_request_status(request_id, 'cancelled', "sender_id")

def _update_request_status(request_id, status, role_field):
    conn = None
    try:
        current_user = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (current_user,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']

            cur.execute(f"""
                UPDATE friend_requests 
                SET status = %s 
                WHERE id = %s AND {role_field} = %s AND status = 'pending'
            """, (status, request_id, user_id))
            
            if cur.rowcount == 0:
                return jsonify({'error': 'Request not found or already processed'}), 404

        conn.commit()
        return jsonify({'message': f'Friend request {status}'}), 200

    except Exception as e:
        print(f"[ERROR] update_request_status ({status}): {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Operation failed'}), 500
    finally:
        if conn:
            conn.close()


@jwt_required()
def remove_friend(friend_id):
    conn = None
    try:
        current_user = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (current_user,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']

            cur.execute("""
                DELETE FROM friends 
                WHERE (user_id = %s AND friend_id = %s) 
                   OR (user_id = %s AND friend_id = %s)
            """, (user_id, friend_id, friend_id, user_id))
            
            if cur.rowcount == 0:
                return jsonify({'error': 'Not friends'}), 404

        conn.commit()
        return jsonify({'message': 'Friend removed'}), 200

    except Exception as e:
        print(f"[ERROR] remove_friend: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to remove friend'}), 500
    finally:
        if conn:
            conn.close()