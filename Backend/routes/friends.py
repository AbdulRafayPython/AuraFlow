
# routes/friends.py
import logging
from flask import jsonify, request, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import get_db_connection
from datetime import datetime

log = logging.getLogger(__name__)


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
            cur.execute("SELECT id, username, display_name, avatar_url FROM users WHERE username = %s", (target_username,))
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
                        SET sender_id = %s, receiver_id = %s, status = 'pending', created_at = NOW()
                        WHERE id = %s
                    """, (sender_id, receiver_id, existing['id'],))
                    conn.commit()

                    # Emit socket event so receiver sees it in real-time
                    try:
                        socketio = current_app.extensions.get('socketio')
                        if socketio:
                            resend_data = {
                                'id': existing['id'],
                                'sender_id': sender_id,
                                'receiver_id': receiver_id,
                                'status': 'pending',
                                'created_at': datetime.now().isoformat(),
                                'sender': {
                                    'username': current_user,
                                    'display_name': current_user,
                                    'avatar_url': None
                                }
                            }
                            # Fetch proper sender info
                            with conn.cursor() as cur2:
                                cur2.execute("SELECT username, display_name, avatar_url FROM users WHERE id = %s", (sender_id,))
                                s_info = cur2.fetchone()
                                if s_info:
                                    resend_data['sender'] = {
                                        'username': s_info['username'],
                                        'display_name': s_info['display_name'] or s_info['username'],
                                        'avatar_url': s_info['avatar_url']
                                    }
                            socketio.emit('friend_request_received', resend_data,
                                         room=f"user_{receiver_id}", namespace='/')
                            print(f"[FRIEND_REQUEST] ✅ Re-send event emitted to user_{receiver_id}")
                    except Exception as se:
                        print(f"[FRIEND_REQUEST] ❌ Re-send socket emit failed: {se}")

                    return jsonify({
                        'id': existing['id'],
                        'sender_id': sender_id,
                        'receiver_id': receiver_id,
                        'status': 'pending',
                        'created_at': datetime.now().isoformat(),
                        'username': target_username,
                        'display_name': receiver_row.get('display_name', target_username) if isinstance(receiver_row, dict) else target_username,
                        'avatar_url': receiver_row.get('avatar_url') if isinstance(receiver_row, dict) else None,
                        'message': 'Friend request re-sent successfully'
                    }), 200
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
        
        # Build full response data (matches FriendRequest shape for frontend)
        response_data = {
            'id': request_id,
            'sender_id': sender_id,
            'receiver_id': receiver_id,
            'status': 'pending',
            'created_at': datetime.now().isoformat(),
            'username': target_username,
            'display_name': receiver_row.get('display_name', target_username) if isinstance(receiver_row, dict) else target_username,
            'avatar_url': receiver_row.get('avatar_url') if isinstance(receiver_row, dict) else None,
            'message': 'Friend request sent'
        }
        
        # Emit socket event to notify receiver in real-time
        try:
            # Try current_app.extensions first (standard pattern)
            socketio = current_app.extensions.get('socketio')
            if not socketio:
                # Fallback: direct import from app module
                from app import socketio as app_socketio
                socketio = app_socketio
                log.info(f"[FRIEND_REQUEST] Using fallback direct import for socketio")
            
            log.info(f"[FRIEND_REQUEST] socketio: {type(socketio).__name__} truthy={bool(socketio)}")
            
            if socketio:
                notification_data = {
                    'id': request_id,
                    'sender_id': sender_id,
                    'receiver_id': receiver_id,
                    'status': 'pending',
                    'created_at': response_data['created_at'],
                    'sender': {
                        'username': sender_info['username'],
                        'display_name': sender_info['display_name'] or sender_info['username'],
                        'avatar_url': sender_info['avatar_url']
                    } if sender_info else None
                }
                
                receiver_room = f"user_{receiver_id}"
                log.info(f"[FRIEND_REQUEST] Emitting friend_request_received to room={receiver_room}")
                
                # Diagnostic: check room membership
                try:
                    from routes.sockets import user_socket_sessions, user_rooms
                    log.info(f"[FRIEND_REQUEST] 🔍 user_socket_sessions keys: {list(user_socket_sessions.keys())}")
                    if receiver_username:
                        recv_sid = user_socket_sessions.get(receiver_username)
                        log.info(f"[FRIEND_REQUEST] 🔍 Receiver '{receiver_username}' SID: {recv_sid}")
                        if recv_sid:
                            try:
                                from flask_socketio import rooms as get_rooms
                                recv_rooms = get_rooms(sid=recv_sid, namespace='/')
                                log.info(f"[FRIEND_REQUEST] 🔍 Receiver SID {recv_sid} rooms: {recv_rooms}")
                            except Exception as room_err:
                                log.warning(f"[FRIEND_REQUEST] 🔍 Could not check rooms: {room_err}")
                    else:
                        log.warning(f"[FRIEND_REQUEST] 🔍 receiver_username is None!")
                except Exception as diag_err:
                    log.warning(f"[FRIEND_REQUEST] 🔍 Diagnostic failed: {diag_err}")
                
                # Emit to user's personal room (room-based, reaches all SIDs)
                socketio.emit('friend_request_received', notification_data, 
                             room=receiver_room, namespace='/')
                
                # ALSO emit to the user's direct SID as backup
                try:
                    from routes.sockets import user_socket_sessions
                    if receiver_username and receiver_username in user_socket_sessions:
                        receiver_sid = user_socket_sessions[receiver_username]
                        socketio.emit('friend_request_received', notification_data,
                                     to=receiver_sid, namespace='/')
                        log.info(f"[FRIEND_REQUEST] ✅ Also emitted directly to SID {receiver_sid}")
                except Exception as sid_err:
                    log.warning(f"[FRIEND_REQUEST] Direct SID emit skipped: {sid_err}")
                
                log.info(f"[FRIEND_REQUEST] ✅ Event emitted to room {receiver_room}")
            else:
                log.error(f"[FRIEND_REQUEST] ❌ socketio is None/falsy from both sources")
            
        except Exception as socket_error:
            log.error(f"[FRIEND_REQUEST] ❌ Failed to emit event: {socket_error}", exc_info=True)
        
        return jsonify(response_data), 201

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
            socketio = current_app.extensions.get('socketio')
            if not socketio:
                from app import socketio as app_socketio
                socketio = app_socketio
            if socketio:
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
                
                print(f"[SOCKET] ✅ Emitted friend_request_accepted to user_{req['sender_id']}")
            else:
                print(f"[SOCKET] ❌ socketio not found in app extensions")
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

            # Fetch the request BEFORE updating so we know who to notify
            cur.execute("""
                SELECT id, sender_id, receiver_id, status
                FROM friend_requests
                WHERE id = %s AND status = 'pending'
            """, (request_id,))
            req = cur.fetchone()
            if not req:
                return jsonify({'error': 'Request not found or already processed'}), 404

            # Verify the current user has the right role
            if req[role_field] != user_id:
                return jsonify({'error': 'Request not found or access denied'}), 404

            cur.execute("""
                UPDATE friend_requests 
                SET status = %s 
                WHERE id = %s
            """, (status, request_id))

        conn.commit()

        # Emit socket event to the OTHER party
        try:
            socketio = current_app.extensions.get('socketio')
            if not socketio:
                from app import socketio as app_socketio
                socketio = app_socketio
            if socketio:
                if status == 'rejected':
                    # Notify the SENDER that their request was rejected
                    other_user_id = req['sender_id']
                    socketio.emit('friend_request_rejected', {
                        'request_id': request_id,
                        'rejector_id': user_id,
                        'sender_id': req['sender_id'],
                        'receiver_id': req['receiver_id'],
                    }, room=f"user_{other_user_id}", namespace='/')
                    log.info(f"[FRIEND_REQUEST] ✅ Emitted friend_request_rejected to user_{other_user_id}")
                elif status == 'cancelled':
                    # Notify the RECEIVER that the request was cancelled
                    other_user_id = req['receiver_id']
                    socketio.emit('friend_request_cancelled', {
                        'request_id': request_id,
                        'sender_id': req['sender_id'],
                        'receiver_id': req['receiver_id'],
                    }, room=f"user_{other_user_id}", namespace='/')
                    log.info(f"[FRIEND_REQUEST] ✅ Emitted friend_request_cancelled to user_{other_user_id}")
            else:
                log.warning("[FRIEND_REQUEST] ❌ socketio instance is None - cannot emit")
        except Exception as se:
            log.error(f"[FRIEND_REQUEST] ❌ Failed to emit {status} event: {se}")

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

        # Notify the other user in real-time
        try:
            socketio = current_app.extensions.get('socketio')
            if not socketio:
                from app import socketio as app_socketio
                socketio = app_socketio
            if socketio:
                socketio.emit('friend_removed', {'friend_id': user_id},
                             room=f"user_{friend_id}", namespace='/')
                log.info(f"[FRIEND] ✅ Emitted friend_removed to user_{friend_id}")
            else:
                log.warning("[FRIEND] ❌ socketio is None - cannot emit friend_removed")
        except Exception as se:
            log.error(f"[FRIEND] ❌ Failed to emit friend_removed: {se}")

        return jsonify({'message': 'Friend removed'}), 200

    except Exception as e:
        print(f"[ERROR] remove_friend: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to remove friend'}), 500
    finally:
        if conn:
            conn.close()

# =====================================
# BLOCK FRIEND
# =====================================
from flask import abort
@jwt_required()
def block_friend(friend_id):
    conn = None
    try:
        current_user = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get current user id
            cur.execute("SELECT id FROM users WHERE username = %s", (current_user,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']

            if user_id == friend_id:
                return jsonify({'error': 'Cannot block yourself'}), 400

            # Check if already blocked
            cur.execute("SELECT 1 FROM blocked_friends WHERE blocker_id = %s AND blocked_id = %s", (user_id, friend_id))
            if cur.fetchone():
                return jsonify({'error': 'User already blocked'}), 400

            # Check if friend exists
            cur.execute("SELECT id FROM users WHERE id = %s", (friend_id,))
            if not cur.fetchone():
                return jsonify({'error': 'User to block not found'}), 404

            # Insert block
            cur.execute("INSERT INTO blocked_friends (blocker_id, blocked_id) VALUES (%s, %s)", (user_id, friend_id))

            # Optionally, remove from friends if present
            cur.execute("""
                DELETE FROM friends 
                WHERE (user_id = %s AND friend_id = %s) 
                   OR (user_id = %s AND friend_id = %s)
            """, (user_id, friend_id, friend_id, user_id))

        conn.commit()

        # Notify the blocked user in real-time
        try:
            socketio = current_app.extensions.get('socketio')
            if not socketio:
                from app import socketio as app_socketio
                socketio = app_socketio
            if socketio:
                socketio.emit('user_blocked', {'blocked_user_id': friend_id, 'blocker_id': user_id},
                             room=f"user_{friend_id}", namespace='/')
                log.info(f"[FRIEND] ✅ Emitted user_blocked to user_{friend_id}")
            else:
                log.warning("[FRIEND] ❌ socketio is None - cannot emit user_blocked")
        except Exception as se:
            log.error(f"[FRIEND] ❌ Failed to emit user_blocked: {se}")

        return jsonify({'message': 'User blocked'}), 200

    except Exception as e:
        print(f"[ERROR] block_friend: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to block user'}), 500
    finally:
        if conn:
            conn.close()


@jwt_required()
def get_blocked_friends():
    conn = None
    try:
        current_user = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get current user id
            cur.execute("SELECT id FROM users WHERE username = %s", (current_user,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']

            # Get blocked users
            cur.execute("""
                SELECT u.id, u.username, u.display_name, u.avatar_url
                FROM blocked_friends bf
                JOIN users u ON bf.blocked_id = u.id
                WHERE bf.blocker_id = %s
                ORDER BY bf.created_at DESC
            """, (user_id,))
            blocked = cur.fetchall()

        result = [
            {
                'id': u['id'],
                'username': u['username'],
                'display_name': u['display_name'] or u['username'],
                'avatar_url': u['avatar_url'] or f"https://api.dicebear.com/7.x/avataaars/svg?seed={u['username']}"
            } for u in blocked
        ]
        return jsonify(result), 200

    except Exception as e:
        print(f"[ERROR] get_blocked_friends: {e}")
        return jsonify({'error': 'Failed to fetch blocked users'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# UNBLOCK FRIEND
# =====================================
@jwt_required()
def unblock_friend(friend_id):
    conn = None
    try:
        current_user = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get current user id
            cur.execute("SELECT id FROM users WHERE username = %s", (current_user,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']

            # Check if blocked
            cur.execute("SELECT 1 FROM blocked_friends WHERE blocker_id = %s AND blocked_id = %s", (user_id, friend_id))
            if not cur.fetchone():
                return jsonify({'error': 'User is not blocked'}), 400

            # Remove block
            cur.execute("DELETE FROM blocked_friends WHERE blocker_id = %s AND blocked_id = %s", (user_id, friend_id))

        conn.commit()

        # Notify the unblocked user in real-time
        try:
            socketio = current_app.extensions.get('socketio')
            if not socketio:
                from app import socketio as app_socketio
                socketio = app_socketio
            if socketio:
                socketio.emit('user_unblocked', {'unblocked_user_id': friend_id, 'unblocker_id': user_id},
                             room=f"user_{friend_id}", namespace='/')
                log.info(f"[FRIEND] ✅ Emitted user_unblocked to user_{friend_id}")
            else:
                log.warning("[FRIEND] ❌ socketio is None - cannot emit user_unblocked")
        except Exception as se:
            log.error(f"[FRIEND] ❌ Failed to emit user_unblocked: {se}")

        return jsonify({'message': 'User unblocked'}), 200

    except Exception as e:
        print(f"[ERROR] unblock_friend: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to unblock user'}), 500
    finally:
        if conn:
            conn.close()