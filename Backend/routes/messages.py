# routes/messages.py (Fixed + Enhanced with get_db_connection())
from flask import jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import get_db_connection
from utils import get_avatar_url
from datetime import datetime
import sys
import os
import logging

log = logging.getLogger(__name__)

# Import moderation agent and summarizer
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from agents.moderation import ModerationAgent
from agents.summarizer import SummarizerAgent

# Initialize agents
moderation_agent = ModerationAgent()


def handle_ai_command(content: str, username: str, user_id: int, channel_id: int, community_id: int = None):
    """Handle AI commands from chat (/summarize, /help, etc.)"""
    try:
        log.info(f"[HTTP COMMAND] Processing command: {content}")
        command_parts = content.strip().split()
        command = command_parts[0].lower()
        log.info(f"[HTTP COMMAND] Parsed command: {command}")
        
        if command == '/summarize':
            # Parse optional message count
            message_count = 100
            if len(command_parts) > 1 and command_parts[1].isdigit():
                message_count = min(int(command_parts[1]), 200)
            
            log.info(f"[HTTP COMMAND] /summarize requested by {username} for channel {channel_id} with {message_count} messages")
            
            # Generate summary
            summarizer = SummarizerAgent()
            result = summarizer.summarize_channel(
                channel_id=channel_id,
                message_count=message_count,
                user_id=user_id
            )
            
            log.info(f"[HTTP COMMAND] Summarizer returned: {result}")
            
            if result.get('success'):
                return {
                    'type': 'summarize',
                    'success': True,
                    'summary': result['summary'],
                    'key_points': result.get('key_points', []),
                    'message_count': result['message_count'],
                    'participants': result.get('participants', []),
                    'method': result.get('method', 'extractive'),
                    'message': f"✨ Summary of last {result['message_count']} messages"
                }
            else:
                return {
                    'type': 'summarize',
                    'success': False,
                    'error': result.get('error', 'Failed to generate summary')
                }
        
        elif command == '/help':
            return {
                'type': 'help',
                'success': True,
                'message': """**AuraFlow AI Commands:**
• `/summarize [count]` - Summarize recent messages (default: 100)
• `/help` - Show this help message

More commands coming soon!"""
            }
        
        else:
            return None
            
    except Exception as e:
        log.error(f"[HTTP COMMAND] Error: {e}", exc_info=True)
        return {
            'type': 'error',
            'success': False,
            'error': str(e)
        }


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

            # Fetch messages with reply-to preview
            cur.execute("""
                SELECT 
                    m.id, m.sender_id, m.content, m.message_type, m.reply_to, m.created_at,
                    m.is_pinned,
                    u.username, u.display_name, u.avatar_url,
                    CASE WHEN bu.user_id IS NOT NULL THEN 1 ELSE 0 END as is_blocked,
                    a.file_name AS att_file_name, a.file_path AS att_file_url,
                    a.file_size AS att_file_size, a.mime_type AS att_mime_type,
                    a.duration AS att_duration,
                    rm.content AS reply_content, rm.message_type AS reply_message_type,
                    ru.username AS reply_author
                FROM messages m
                JOIN users u ON m.sender_id = u.id
                JOIN channels ch ON m.channel_id = ch.id
                LEFT JOIN blocked_users bu ON ch.community_id = bu.community_id AND m.sender_id = bu.user_id
                LEFT JOIN attachments a ON a.message_id = m.id
                LEFT JOIN messages rm ON m.reply_to = rm.id
                LEFT JOIN users ru ON rm.sender_id = ru.id
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
            'avatar_url': get_avatar_url(m['username'], m['avatar_url']),
            'is_blocked': bool(m['is_blocked']),
            'is_pinned': bool(m.get('is_pinned')),
            **({'attachment': {
                'file_name': m['att_file_name'],
                'file_url': m['att_file_url'],
                'file_size': m['att_file_size'],
                'mime_type': m['att_mime_type'],
                'duration': m.get('att_duration'),
            }} if m.get('att_file_name') else {}),
            **({'reply_to_preview': {
                'id': m['reply_to'],
                'content': (m['reply_content'] or '')[:150],
                'author': m['reply_author'],
                'message_type': m['reply_message_type'],
            }} if m.get('reply_to') and m.get('reply_author') else {}),
        } for m in rows]
        
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

def _get_channel_reply_preview(cur, reply_to_id):
    """Fetch parent message preview for reply_to display."""
    if not reply_to_id:
        return None
    cur.execute("""
        SELECT m.content, m.message_type, u.username
        FROM messages m JOIN users u ON m.sender_id = u.id
        WHERE m.id = %s
    """, (reply_to_id,))
    parent = cur.fetchone()
    if parent:
        return {
            'id': reply_to_id,
            'content': (parent['content'] or '')[:150],
            'author': parent['username'],
            'message_type': parent['message_type'],
        }
    return None

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

        log.info(f"[HTTP SEND] User {current_user} sending message to channel {channel_id}: {content[:50]}...")

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (current_user,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404
            user_id = user['id']
            log.info(f"[HTTP SEND] User ID: {user_id}")

            cur.execute("SELECT id, community_id FROM channels WHERE id = %s", (channel_id,))
            channel_row = cur.fetchone()
            if not channel_row:
                return jsonify({'error': 'Channel not found'}), 404
            community_id = channel_row['community_id']
            log.info(f"[HTTP SEND] Channel {channel_id} in community {community_id}")

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
                "SELECT role, violation_count FROM community_members WHERE community_id = %s AND user_id = %s",
                (community_id, user_id)
            )
            membership_row = cur.fetchone()
            if not membership_row:
                return jsonify({'error': 'Access denied'}), 403
            violation_count = membership_row.get('violation_count') or 0
            user_role = membership_row['role'] if membership_row else 'member'

            # 🤖 AI COMMAND DETECTION - Check before any processing
            if content.strip().startswith('/'):
                log.info(f"[HTTP] ✅ COMMAND DETECTED: {content}")
                try:
                    command_result = handle_ai_command(content, current_user, user_id, channel_id, community_id)
                    log.info(f"[HTTP] ✅ Command handler returned: {command_result}")
                    
                    if command_result:
                        # Emit command result via socket to ALL users in the channel
                        from flask import current_app
                        socketio = current_app.extensions.get('socketio')
                        if socketio:
                            log.info(f"[HTTP] ✅ SocketIO found, emitting to channel_{channel_id} and community_{community_id}")
                            
                            # Get all rooms and connected sockets for debugging
                            try:
                                from routes.sockets import user_socket_sessions
                                user_sid = user_socket_sessions.get(current_user)
                                log.info(f"[HTTP] 🔍 User '{current_user}' socket SID: {user_sid}")
                                
                                # Get socket's current rooms
                                if user_sid:
                                    from flask_socketio import rooms as get_rooms
                                    user_rooms = get_rooms(sid=user_sid, namespace='/')
                                    log.info(f"[HTTP] 🔍 Socket {user_sid} is in rooms: {user_rooms}")
                                    
                                    # Direct emission to user's socket as BACKUP
                                    socketio.emit('command_result', command_result, room=user_sid, namespace='/')
                                    log.info(f"[HTTP] ✅ DIRECT EMIT to user socket {user_sid}")
                            except Exception as room_err:
                                log.warning(f"[HTTP] ⚠️  Room check failed: {room_err}")
                            
                            # Emit to both rooms (standard broadcast)
                            socketio.emit('command_result', command_result, room=f"channel_{channel_id}", namespace='/')
                            log.info(f"[HTTP] ✅ ROOM EMIT to channel_{channel_id}")
                            
                            socketio.emit('command_result', command_result, room=f"community_{community_id}", namespace='/')
                            log.info(f"[HTTP] ✅ ROOM EMIT to community_{community_id}")
                        else:
                            log.error(f"[HTTP] ❌ SocketIO not found in app extensions!")
                        
                        # Still save and broadcast the command message for transparency
                        cur.execute("""
                            INSERT INTO messages (channel_id, sender_id, content, message_type, reply_to)
                            VALUES (%s, %s, %s, %s, %s)
                        """, (channel_id, user_id, content, 'text', reply_to or None))
                        message_id = cur.lastrowid
                        conn.commit()
                        log.info(f"[HTTP] ✅ Command message saved with ID {message_id}")
                        
                        # Broadcast the command message itself too
                        if socketio:
                            msg_payload = {
                                'id': message_id,
                                'channel_id': channel_id,
                                'sender_id': user_id,
                                'content': content,
                                'message_type': 'text',
                                'created_at': datetime.now().isoformat(),
                                'author': current_user,
                                'avatar': None
                            }
                            socketio.emit('message_received', msg_payload, room=f"channel_{channel_id}", namespace='/')
                            socketio.emit('message_received', msg_payload, room=f"community_{community_id}", namespace='/')
                            log.info(f"[HTTP] ✅ Command message broadcasted")
                        
                        # Return command result + message info
                        log.info(f"[HTTP] ✅ Returning success response with command_result")
                        return jsonify({
                            'message': {
                                'id': message_id,
                                'channel_id': channel_id,
                                'sender_id': user_id,
                                'content': content,
                                'message_type': 'text',
                                'created_at': datetime.now().isoformat(),
                                'author': current_user
                            },
                            'command_result': command_result
                        }), 201
                    else:
                        log.info(f"[HTTP] ⚠️  Command handler returned None, treating as regular message")
                except Exception as cmd_error:
                    log.error(f"[HTTP] ❌ Command error: {cmd_error}", exc_info=True)
                    return jsonify({
                        'error': f'Command failed: {str(cmd_error)}',
                        'command_result': {
                            'type': 'error',
                            'success': False,
                            'error': str(cmd_error)
                        }
                    }), 500

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

                # Broadcast over socket so all channel members receive instantly
                from flask import current_app
                socketio = current_app.extensions.get('socketio')
                if socketio:
                    rtp = _get_channel_reply_preview(cur, msg['reply_to'])
                    payload = {
                        'id': msg['id'],
                        'channel_id': msg['channel_id'],
                        'sender_id': user_id,
                        'content': msg['content'],
                        'message_type': msg['message_type'],
                        'reply_to': msg['reply_to'],
                        'created_at': msg['created_at'].isoformat(),
                        'author': msg['username'],
                        'avatar': get_avatar_url(msg['username'], msg['avatar_url']),
                        'is_blocked': False,
                        'moderation': None,
                        **(({'reply_to_preview': rtp}) if rtp else {}),
                    }
                    socketio.emit('message_received', payload, room=f"channel_{channel_id}", namespace='/')
                    socketio.emit('message_received', payload, room=f"community_{community_id}", namespace='/')

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

                # Broadcast over socket so all channel members receive instantly
                from flask import current_app
                socketio = current_app.extensions.get('socketio')
                if socketio:
                    rtp = _get_channel_reply_preview(cur, msg['reply_to'])
                    payload = {
                        'id': msg['id'],
                        'channel_id': msg['channel_id'],
                        'sender_id': user_id,
                        'content': msg['content'],
                        'message_type': msg['message_type'],
                        'reply_to': msg['reply_to'],
                        'created_at': msg['created_at'].isoformat(),
                        'author': msg['username'],
                        'avatar': get_avatar_url(msg['username'], msg['avatar_url']),
                        'is_blocked': False,
                        'moderation': {
                            'action': final_action,
                            'severity': moderation_result['severity'],
                            'flagged': final_action == 'warn',
                            'reasons': moderation_result.get('reasons', []),
                            'violation_count': violation_count
                        },
                        **(({'reply_to_preview': rtp}) if rtp else {}),
                    }
                    socketio.emit('message_received', payload, room=f"channel_{channel_id}", namespace='/')
                    socketio.emit('message_received', payload, room=f"community_{community_id}", namespace='/')

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
                        'is_blocked': False,
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
                # Get community details for notification
                cur.execute("""
                    SELECT name, logo_url, color, icon 
                    FROM communities WHERE id = %s
                """, (community_id,))
                community_data = cur.fetchone()
                
                # Add to blocked_users table so they can't rejoin
                cur.execute(
                    "INSERT IGNORE INTO blocked_users (community_id, user_id) VALUES (%s, %s)",
                    (community_id, user_id)
                )
                print(f"[DEBUG] Inserted into blocked_users: community_id={community_id}, user_id={user_id}")
                
                cur.execute(
                    "DELETE FROM channel_members WHERE user_id = %s AND channel_id IN (SELECT id FROM channels WHERE community_id = %s)",
                    (user_id, community_id)
                )
                cur.execute(
                    "DELETE FROM community_members WHERE community_id = %s AND user_id = %s",
                    (community_id, user_id)
                )
                conn.commit()
                print(f"[DEBUG] Committed: User {user_id} removed from community {community_id}")
                
                # Verify the insert worked
                cur.execute("""
                    SELECT id FROM blocked_users 
                    WHERE community_id = %s AND user_id = %s
                """, (community_id, user_id))
                blocked_record = cur.fetchone()
                if blocked_record:
                    print(f"[DEBUG] ✓ Verified blocked_users record exists: {blocked_record}")
                else:
                    print(f"[ERROR] ✗ blocked_users record NOT FOUND after insert!")
                
                # Emit socket event to disconnect user from community with notification data
                from flask_socketio import emit
                from flask import current_app
                socketio = current_app.extensions['socketio']
                
                emit('community:removed', {
                    'community_id': community_id,
                    'user_id': user_id,
                    'reason': 'violation',
                    'message': user_message,
                    'notification': {
                        'community_name': community_data['name'] if community_data else 'Community',
                        'community_logo': community_data['logo_url'] if community_data else None,
                        'community_color': community_data['color'] if community_data else '#8B5CF6',
                        'community_icon': community_data['icon'] if community_data else 'AF'
                    }
                }, to=f"user_{user_id}", namespace='/')
                
                # Notify all community members that this user was removed (so they can update UI)
                socketio.emit('user_blocked_from_community', {
                    'community_id': community_id,
                    'user_id': user_id,
                    'blocked_at': datetime.now().isoformat()
                }, room=f"community_{community_id}", namespace='/')
                
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
            # Get community details for notification
            cur.execute("""
                SELECT name, logo_url, color, icon 
                FROM communities WHERE id = %s
            """, (community_id,))
            community_data = cur.fetchone()
            
            cur.execute(
                "INSERT IGNORE INTO blocked_users (community_id, user_id) VALUES (%s, %s)",
                (community_id, user_id)
            )
            print(f"[DEBUG] Inserted into blocked_users: community_id={community_id}, user_id={user_id}")
            
            cur.execute(
                "DELETE FROM channel_members WHERE user_id = %s AND channel_id IN (SELECT id FROM channels WHERE community_id = %s)",
                (user_id, community_id)
            )
            cur.execute(
                "DELETE FROM community_members WHERE community_id = %s AND user_id = %s",
                (community_id, user_id)
            )
            conn.commit()
            print(f"[DEBUG] Committed: User {user_id} blocked from community {community_id}")
            
            # Verify the insert worked
            cur.execute("""
                SELECT id FROM blocked_users 
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            blocked_record = cur.fetchone()
            if blocked_record:
                print(f"[DEBUG] ✓ Verified blocked_users record exists: {blocked_record}")
            else:
                print(f"[ERROR] ✗ blocked_users record NOT FOUND after insert!")
            
            # Emit socket event to disconnect user from community with notification data
            from flask_socketio import emit
            from flask import current_app
            socketio = current_app.extensions['socketio']
            
            emit('community:removed', {
                'community_id': community_id,
                'user_id': user_id,
                'reason': 'blocked',
                'message': 'You were blocked from this community for repeated violations.',
                'notification': {
                    'community_name': community_data['name'] if community_data else 'Community',
                    'community_logo': community_data['logo_url'] if community_data else None,
                    'community_color': community_data['color'] if community_data else '#8B5CF6',
                    'community_icon': community_data['icon'] if community_data else 'AF'
                }
            }, to=f"user_{user_id}", namespace='/')
            
            # Notify all community members that this user was blocked (so they can update UI)
            socketio.emit('user_blocked_from_community', {
                'community_id': community_id,
                'user_id': user_id,
                'blocked_at': datetime.now().isoformat()
            }, room=f"community_{community_id}", namespace='/')
            
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
                    dm.reply_to, dm.created_at, dm.is_read, dm.read_at,
                    u.username, u.display_name, u.avatar_url,
                    a.file_name AS att_file_name, a.file_path AS att_file_url,
                    a.file_size AS att_file_size, a.mime_type AS att_mime_type,
                    a.duration AS att_duration,
                    rdm.content AS reply_content, rdm.message_type AS reply_message_type,
                    ru.username AS reply_author
                FROM direct_messages dm
                JOIN users u ON dm.sender_id = u.id
                LEFT JOIN attachments a ON a.direct_message_id = dm.id
                LEFT JOIN direct_messages rdm ON dm.reply_to = rdm.id
                LEFT JOIN users ru ON rdm.sender_id = ru.id
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
            'reply_to': m.get('reply_to'),
            'created_at': m['created_at'].isoformat() if m['created_at'] else None,
            'is_read': bool(m['is_read']),
            'read_at': m['read_at'].isoformat() if m['read_at'] else None,
            'sender': {
                'id': m['sender_id'],
                'username': m['username'],
                'display_name': m['display_name'] or m['username'],
                'avatar_url': get_avatar_url(m['username'], m['avatar_url'])
            },
            **({'attachment': {
                'file_name': m['att_file_name'],
                'file_url': m['att_file_url'],
                'file_size': m['att_file_size'],
                'mime_type': m['att_mime_type'],
                'duration': m.get('att_duration'),
            }} if m.get('att_file_name') else {}),
            **({'reply_to_preview': {
                'id': m['reply_to'],
                'content': (m['reply_content'] or '')[:150],
                'author': m['reply_author'],
                'message_type': m['reply_message_type'],
            }} if m.get('reply_to') and m.get('reply_author') else {}),
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
        reply_to = data.get('reply_to')

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
                INSERT INTO direct_messages (sender_id, receiver_id, content, message_type, reply_to)
                VALUES (%s, %s, %s, %s, %s)
            """, (sender_id, receiver_id, content, message_type, reply_to or None))
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
        
        # Build reply_to_preview if replying to a message
        reply_to_preview = None
        if reply_to:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT dm.content, dm.message_type, u.username
                    FROM direct_messages dm
                    JOIN users u ON dm.sender_id = u.id
                    WHERE dm.id = %s
                """, (reply_to,))
                parent = cur.fetchone()
                if parent:
                    reply_to_preview = {
                        'id': reply_to,
                        'content': (parent['content'] or '')[:150],
                        'author': parent['username'],
                        'message_type': parent['message_type'],
                    }

        return jsonify({
            'id': msg['id'],
            'sender_id': msg['sender_id'],
            'receiver_id': msg['receiver_id'],
            'content': msg['content'],
            'message_type': msg['message_type'],
            'reply_to': reply_to,
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
            } if receiver_row else None,
            **(({'reply_to_preview': reply_to_preview}) if reply_to_preview else {}),
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