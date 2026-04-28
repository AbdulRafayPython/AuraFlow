# routes/messages.py (Fixed + Enhanced with get_db_connection())
from flask import jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import get_db_connection
from utils import get_avatar_url, get_user_id
from utils.encryption import encrypt as _encrypt, decrypt as _decrypt
from services.notification_service import create_notification
from datetime import datetime
import re
import sys
import os
import logging

log = logging.getLogger(__name__)

# Moderation agent is used on every message — lazy singleton
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

_moderation_agent = None

def _get_moderation_agent():
    global _moderation_agent
    if _moderation_agent is None:
        from agents.moderation import ModerationAgent
        _moderation_agent = ModerationAgent()
    return _moderation_agent


# -- @mention + reply notification helpers ----------------------------
_MENTION_RE = re.compile(r'@(\w+)')


def _notify_mentions(content, sender_id, sender_username, channel_id, community_id, message_id):
    """Parse @username mentions in content and create notifications for each."""
    try:
        mentioned_usernames = set(_MENTION_RE.findall(content))
        if not mentioned_usernames:
            return
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                # Look up channel/community names for the notification body
                cur.execute(
                    "SELECT c.name AS channel_name, co.name AS community_name "
                    "FROM channels c JOIN communities co ON c.community_id = co.id "
                    "WHERE c.id = %s", (channel_id,)
                )
                names = cur.fetchone() or {}
                channel_name = names.get('channel_name', 'general')
                community_name = names.get('community_name', 'Community')

                for uname in mentioned_usernames:
                    cur.execute("SELECT id FROM users WHERE username = %s", (uname,))
                    row = cur.fetchone()
                    if not row or row['id'] == sender_id:
                        continue
                    # Only notify users who are members of the community
                    cur.execute(
                        "SELECT 1 FROM community_members WHERE community_id = %s AND user_id = %s",
                        (community_id, row['id'])
                    )
                    if not cur.fetchone():
                        continue
                    create_notification(
                        user_id=row['id'],
                        type='mention',
                        title=f'Mentioned in #{channel_name}',
                        body=f'{sender_username} mentioned you in #{channel_name} � {community_name}',
                        link=f'/community/{community_id}/channel/{channel_id}',
                        related_id=message_id,
                    )
                    # Queue batched email notification for mention
                    try:
                        from services.email_batch_service import queue_email_notification
                        queue_email_notification(row['id'], 'mention', {
                            'sender_name': sender_username,
                            'preview': f'mentioned you in #{channel_name}',
                            'community_name': community_name,
                            'channel_name': channel_name,
                        })
                    except Exception:
                        pass
        finally:
            conn.close()
    except Exception as e:
        log.warning(f"[MENTIONS] notify_mentions failed: {e}")


def _notify_reply(reply_to_id, sender_id, sender_username, channel_id, community_id, message_id):
    """If message is a reply, notify the original message author."""
    if not reply_to_id:
        return
    try:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT sender_id FROM messages WHERE id = %s", (reply_to_id,)
                )
                parent = cur.fetchone()
                if not parent or parent['sender_id'] == sender_id:
                    return
                cur.execute(
                    "SELECT c.name AS channel_name, co.name AS community_name "
                    "FROM channels c JOIN communities co ON c.community_id = co.id "
                    "WHERE c.id = %s", (channel_id,)
                )
                names = cur.fetchone() or {}
                channel_name = names.get('channel_name', 'general')
                community_name = names.get('community_name', 'Community')

                create_notification(
                    user_id=parent['sender_id'],
                    type='reply',
                    title=f'Reply in #{channel_name}',
                    body=f'{sender_username} replied to your message in #{channel_name} � {community_name}',
                    link=f'/community/{community_id}/channel/{channel_id}',
                    related_id=message_id,
                )
        finally:
            conn.close()
    except Exception as e:
        log.warning(f"[REPLY] notify_reply failed: {e}")


def _dispatch_agent_tasks(content, user_id, channel_id, community_id, message_type='text'):
    """
    Fire-and-forget Celery tasks for AI agent auto-execution.
    Called after a message is successfully saved. Truly non-blocking:
    runs in a daemon thread so the HTTP response is never delayed
    by broker (Redis) connection issues.
    """
    if message_type != 'text' or not content:
        return

    import threading

    def _do_dispatch():
        try:
            from tasks.agent_tasks import track_mood_task
            track_mood_task.delay(content, user_id, channel_id)
        except Exception as e:
            log.debug(f"[AGENT_DISPATCH] Mood task dispatch skipped: {e}")

        try:
            from tasks.agent_tasks import analyze_focus_task
            from database import get_db_connection as _gdb
            c = _gdb()
            try:
                with c.cursor() as cur:
                    cur.execute("""
                        SELECT COUNT(*) as cnt FROM messages
                        WHERE channel_id = %s AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
                    """, (channel_id,))
                    msg_count = cur.fetchone()['cnt']
                if msg_count > 0 and msg_count % 50 == 0:
                    analyze_focus_task.delay(channel_id, community_id)
            finally:
                c.close()
        except Exception as e:
            log.debug(f"[AGENT_DISPATCH] Focus task dispatch skipped: {e}")

    threading.Thread(target=_do_dispatch, daemon=True).start()

def _emit_unread_tracking(socketio, channel_id, community_id, sender_id, message_id, content=None):
    """Emit enriched channel_activity + increment in-memory unread cache.
    
    Called from the HTTP send_message endpoint after a message is saved and
    broadcast via message_received.  This is the ONLY place unread tracking
    fires -- the socket on_new_message handler is NOT used by the frontend.
    
    Enriches the payload with community branding (name, logo, icon, color),
    sender info (display_name, avatar), and content preview so the frontend
    can render rich browser notifications without extra API calls.
    """
    log.info(f"[UNREAD-TRACK] _emit_unread_tracking called ch={channel_id} comm={community_id} sender={sender_id}")
    
    try:
        if community_id:
            # Enrich with channel + community branding and sender info
            channel_name = None
            community_name = None
            community_logo = None
            community_icon = None
            community_color = None
            sender_name = None
            sender_avatar = None

            try:
                conn = get_db_connection()
                try:
                    with conn.cursor() as cur:
                        cur.execute("""
                            SELECT c.name AS channel_name,
                                   cm.name AS community_name,
                                   cm.logo_url AS community_logo,
                                   cm.icon AS community_icon,
                                   cm.color AS community_color
                            FROM channels c
                            LEFT JOIN communities cm ON cm.id = c.community_id
                            WHERE c.id = %s
                        """, (channel_id,))
                        ch_row = cur.fetchone()
                        if ch_row:
                            channel_name = ch_row['channel_name']
                            community_name = ch_row['community_name']
                            community_logo = ch_row['community_logo']
                            community_icon = ch_row['community_icon']
                            community_color = ch_row['community_color']

                        cur.execute("""
                            SELECT display_name, avatar_url FROM users WHERE id = %s
                        """, (sender_id,))
                        user_row = cur.fetchone()
                        if user_row:
                            sender_name = user_row['display_name']
                            sender_avatar = user_row['avatar_url']
                finally:
                    conn.close()
            except Exception as e:
                log.warning(f"[UNREAD-TRACK] Enrichment query failed (fallback to basic): {e}")

            content_preview = None
            if content:
                content_preview = (content[:120] + '\u2026') if len(content) > 120 else content

            event_data = {
                'channel_id': channel_id,
                'community_id': community_id,
                'sender_id': sender_id,
                'message_id': message_id,
                'sender_name': sender_name,
                'sender_avatar': sender_avatar,
                'channel_name': channel_name,
                'community_name': community_name,
                'community_logo': community_logo,
                'community_icon': community_icon,
                'community_color': community_color,
                'content_preview': content_preview,
            }
            target_room = f"community_{community_id}"
            log.info(f"[UNREAD-TRACK] EMITTING channel_activity to room={target_room}")
            socketio.emit('channel_activity', event_data, room=target_room, namespace='/')
            log.info(f"[UNREAD-TRACK] channel_activity EMITTED successfully")
        else:
            log.warning("[UNREAD-TRACK] community_id is None/falsy -- skipping channel_activity emit")
    except Exception as e:
        log.error(f"[UNREAD-TRACK] channel_activity emit FAILED: {e}", exc_info=True)

    try:
        from services.unread_tracker import increment_channel_unread
        increment_channel_unread(channel_id, sender_id, community_id)
    except Exception as e:
        log.error(f"[UNREAD-TRACK] increment_channel_unread FAILED: {e}", exc_info=True)
    
    log.info("[UNREAD-TRACK] _emit_unread_tracking done")

def handle_ai_command(content: str, username: str, user_id: int, channel_id: int, community_id: int = None):
    """Handle AI commands from chat (/summarize, /help, etc.)
    
    /summarize is ephemeral — only the sender sees the result (not saved to DB).
    Returns a dict with 'ephemeral': True for private delivery.
    """
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
            from agents.summarizer import SummarizerAgent
            summarizer = SummarizerAgent()
            result = summarizer.summarize_channel(
                channel_id=channel_id,
                message_count=message_count,
                user_id=user_id
            )
            
            log.info(f"[HTTP COMMAND] Summarizer returned success={result.get('success')}")
            
            if result.get('success'):
                from tasks.agent_tasks import _format_summary_as_bot_message

                # Get channel name
                channel_name = ''
                conn2 = None
                try:
                    conn2 = get_db_connection()
                    with conn2.cursor() as cur2:
                        cur2.execute("SELECT name FROM channels WHERE id = %s", (channel_id,))
                        row = cur2.fetchone()
                        if row:
                            channel_name = row['name']
                finally:
                    if conn2:
                        conn2.close()

                bot_content = _format_summary_as_bot_message(result, channel_name)

                # Ephemeral: don't save to DB, return content for private delivery
                return {
                    'type': 'summarize',
                    'success': True,
                    'ephemeral': True,
                    'summary_content': bot_content,
                    'message_count': result['message_count'],
                    'method': result.get('method', 'extractive'),
                }
            else:
                return {
                    'type': 'summarize',
                    'success': False,
                    'error': result.get('error', 'Failed to generate summary')
                }
        
        elif command == '/mood':
            # Parse optional time period in hours
            time_period = 24
            if len(command_parts) > 1 and command_parts[1].isdigit():
                time_period = min(int(command_parts[1]), 168)  # Max 7 days
            
            log.info(f"[HTTP COMMAND] /mood requested by {username} (user_id={user_id}) for {time_period}h")
            
            # Check if user has mood tracker activated
            conn = None
            try:
                from database import get_db_connection as _gdb
                conn = _gdb()
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT enabled FROM user_agents WHERE user_id = %s AND agent_type = 'mood'",
                        (user_id,)
                    )
                    agent_row = cur.fetchone()
                    if not agent_row or not agent_row.get('enabled'):
                        return {
                            'type': 'mood',
                            'success': False,
                            'error': 'Mood Tracker is not activated. Activate it from Explore → Personal Agents.'
                        }
            finally:
                if conn:
                    conn.close()
            
            from agents.mood_tracker import MoodTrackerAgent
            mood_agent = MoodTrackerAgent()
            result = mood_agent.track_user_mood(user_id=user_id, time_period_hours=time_period)
            
            if result.get('success', True) and not result.get('error'):
                mood = result.get('overall_mood', result.get('mood', 'neutral'))
                confidence = result.get('confidence', 0)
                message_count = result.get('messages_analyzed', result.get('message_count', 0))
                
                mood_emoji = {'happy': '😊', 'sad': '😢', 'angry': '😠', 'neutral': '😐',
                              'excited': '🤩', 'anxious': '😰', 'calm': '😌', 'frustrated': '😤'}.get(mood, '🎭')
                
                response_text = f"{mood_emoji} **Your Mood Analysis** (last {time_period}h)\n\n"
                response_text += f"• **Overall Mood:** {mood.capitalize()}\n"
                response_text += f"• **Confidence:** {confidence:.0%}\n"
                response_text += f"• **Messages Analyzed:** {message_count}\n"
                
                if result.get('emotions'):
                    emotions = ', '.join(result['emotions'][:5])
                    response_text += f"• **Detected Emotions:** {emotions}\n"
                
                if result.get('trend'):
                    response_text += f"• **Trend:** {result['trend']}\n"
                
                return {
                    'type': 'mood',
                    'success': True,
                    'mood': mood,
                    'confidence': confidence,
                    'message_count': message_count,
                    'message': response_text
                }
            else:
                return {
                    'type': 'mood',
                    'success': False,
                    'error': result.get('error', 'Failed to analyze mood. Try again later.')
                }
        
        elif command == '/wellness':
            log.info(f"[HTTP COMMAND] /wellness requested by {username} (user_id={user_id})")
            
            # Check if user has wellness agent activated
            conn = None
            try:
                from database import get_db_connection as _gdb
                conn = _gdb()
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT enabled FROM user_agents WHERE user_id = %s AND agent_type = 'wellness'",
                        (user_id,)
                    )
                    agent_row = cur.fetchone()
                    if not agent_row or not agent_row.get('enabled'):
                        return {
                            'type': 'wellness',
                            'success': False,
                            'error': 'Wellness Agent is not activated. Activate it from Explore → Personal Agents.'
                        }
            finally:
                if conn:
                    conn.close()
            
            from agents.wellness import WellnessAgent
            wellness_agent = WellnessAgent()
            result = wellness_agent.check_user_wellness(user_id=user_id)
            
            if result.get('success', True) and not result.get('error'):
                score = result.get('wellness_score', result.get('score', 0))
                status = result.get('status', 'unknown')
                
                status_emoji = {'excellent': '🌟', 'good': '✨', 'moderate': '💛',
                                'concerning': '⚠️', 'critical': '🚨'}.get(status, '💫')
                
                response_text = f"{status_emoji} **Your Wellness Check**\n\n"
                response_text += f"• **Wellness Score:** {score}/100\n"
                response_text += f"• **Status:** {status.capitalize()}\n"
                
                if result.get('activity_level'):
                    response_text += f"• **Activity Level:** {result['activity_level'].capitalize()}\n"
                
                if result.get('suggestions'):
                    response_text += "\n**Suggestions:**\n"
                    for suggestion in result['suggestions'][:3]:
                        response_text += f"  💡 {suggestion}\n"
                
                if result.get('break_recommended'):
                    response_text += "\n🧘 *Consider taking a short break!*"
                
                return {
                    'type': 'wellness',
                    'success': True,
                    'score': score,
                    'status': status,
                    'message': response_text
                }
            else:
                return {
                    'type': 'wellness',
                    'success': False,
                    'error': result.get('error', 'Failed to check wellness. Try again later.')
                }
        
        elif command == '/help':
            return {
                'type': 'help',
                'success': True,
                'message': """**AuraFlow AI Commands:**

**Personal Agent Commands:**
• `/summarize [count]` - Summarize recent messages (default: 100)
• `/mood [hours]` - Analyze your mood over a time period (default: 24h)
• `/wellness` - Check your current wellness score and get suggestions

**General:**
• `/help` - Show this help message

*Personal agents must be activated from Explore → Personal Agents to use their commands.*"""
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
            user_id = get_user_id(current_user, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404

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
            'content': _decrypt(m['content']) if m['content'] else m['content'],
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
                'content': _decrypt((m['reply_content'] or ''))[:150],
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
            'content': _decrypt(parent['content'] or '')[:150],
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

        if len(content) > 5000:
            return jsonify({'error': 'Message too long (max 5000 characters)'}), 400

        log.info(f"[HTTP SEND] User {current_user} sending message to channel {channel_id}: {content[:50]}...")

        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(current_user, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
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
                    from flask import current_app
                    socketio = current_app.extensions.get('socketio')
                    command_name = content.strip().split()[0].lower()

                    # For /summarize, emit typing indicator to sender before processing
                    user_sid = None
                    if socketio:
                        try:
                            from routes.sockets import user_socket_sessions
                            user_sid = user_socket_sessions.get(current_user)
                        except Exception:
                            pass

                    if command_name == '/summarize' and socketio and user_sid:
                        socketio.emit('summary_generating', {
                            'channel_id': channel_id,
                            'status': 'generating'
                        }, room=user_sid, namespace='/')
                        log.info(f"[HTTP] ✅ Typing indicator sent to {current_user}")

                    command_result = handle_ai_command(content, current_user, user_id, channel_id, community_id)
                    log.info(f"[HTTP] ✅ Command handler returned: {command_result}")
                    
                    if command_result:
                        # ── Ephemeral commands (e.g. /summarize) ─────────────
                        # Don't save to DB, don't broadcast — emit privately to sender only
                        if command_result.get('ephemeral'):
                            if socketio and user_sid:
                                socketio.emit('summary_result', {
                                    'channel_id': channel_id,
                                    'content': command_result.get('summary_content', ''),
                                    'method': command_result.get('method', 'extractive'),
                                    'message_count': command_result.get('message_count', 0),
                                    'created_at': datetime.now().isoformat(),
                                }, room=user_sid, namespace='/')
                                log.info(f"[HTTP] ✅ Ephemeral summary sent privately to {current_user}")

                            return jsonify({
                                'command_result': command_result,
                                'ephemeral': True,
                            }), 200

                        # ── Non-ephemeral commands (/mood, /wellness, /help) ─
                        # Save command message and broadcast as before
                        cur.execute("""
                            INSERT INTO messages (channel_id, sender_id, content, message_type, reply_to)
                            VALUES (%s, %s, %s, %s, %s)
                        """, (channel_id, user_id, content, 'text', reply_to or None))
                        message_id = cur.lastrowid
                        conn.commit()
                        log.info(f"[HTTP] ✅ Command message saved with ID {message_id}")

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

                        if command_result.get('posted_as_bot') and command_result.get('bot_payload'):
                            if socketio:
                                socketio.emit('message_received', command_result['bot_payload'], room=f"channel_{channel_id}", namespace='/')
                        elif not command_result.get('success'):
                            if socketio and user_sid:
                                socketio.emit('command_result', command_result, room=user_sid, namespace='/')

                        if socketio:
                            _emit_unread_tracking(socketio, channel_id, community_id, user_id, message_id, content)

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

            # OWNER: Still moderate but log that owner sent it
            if user_role == 'owner':
                log.info(f"[HTTP SEND] Owner {current_user} message — moderation still applied")

            # -- Batch moderation: instant-check only, Gemini reviews in batch later --
            try:
                _get_moderation_agent()
                moderation_installed = True
            except Exception:
                moderation_installed = False
            instant_result = _get_moderation_agent().instant_check(content) if moderation_installed else {'block': False, 'reason': ''}
            
            if instant_result.get('block'):
                # Extreme content � block immediately, don't insert
                conn.commit()
                _get_moderation_agent().log_moderation_action(
                    user_id, channel_id, content, 'block', 'high',
                    [instant_result.get('reason', 'extreme_content')], 1.0, None
                )
                return jsonify({
                    'moderation': {
                        'action': 'block',
                        'severity': 'high',
                        'reasons': [instant_result.get('reason', 'extreme_content')],
                        'message': 'Your message was blocked due to extreme content.',
                        'violation_count': violation_count
                    }
                }), 200

            # -- Allow: insert message and broadcast --
            final_action = 'allow'
            cur.execute("""
                INSERT INTO messages (channel_id, sender_id, content, message_type, reply_to)
                VALUES (%s, %s, %s, %s, %s)
            """, (channel_id, user_id, _encrypt(content), message_type, reply_to or None))
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
                    'content': content,  # broadcast plaintext (DB stores encrypted)
                    'message_type': msg['message_type'],
                    'reply_to': msg['reply_to'],
                    'created_at': msg['created_at'].isoformat(),
                    'author': msg['username'],
                    'avatar': get_avatar_url(msg['username'], msg['avatar_url']),
                    'is_blocked': False,
                    'moderation': {
                        'action': 'allow',
                        'severity': 'none',
                        'flagged': False,
                        'reasons': [],
                        'violation_count': violation_count,
                        'pending_ai_review': moderation_installed
                    },
                    **(({'reply_to_preview': rtp}) if rtp else {}),
                }
                log.info(f"[SOCKET-EMIT] Emitting message_received (id={msg['id']}) to channel_{channel_id}")
                socketio.emit('message_received', payload, room=f"channel_{channel_id}", namespace='/')
                log.info(f"[SOCKET-EMIT] Emit complete for message {msg['id']}")
                _emit_unread_tracking(socketio, channel_id, community_id, user_id, message_id, content)

                # @mention + reply notifications (fire-and-forget)
                import threading
                threading.Thread(target=_notify_mentions, args=(content, user_id, msg['username'], channel_id, community_id, message_id), daemon=True).start()
                threading.Thread(target=_notify_reply, args=(reply_to, user_id, msg['username'], channel_id, community_id, message_id), daemon=True).start()
            else:
                log.warning("[SOCKET-EMIT] socketio extension not found � message_received NOT emitted!")

            # Push to Redis buffer for batch Gemini review
            if moderation_installed and content and message_id:
                try:
                    import time as _time
                    mod_agent = _get_moderation_agent()
                    buf_len = mod_agent.push_to_buffer(channel_id, {
                        'msg_id': message_id,
                        'user_id': user_id,
                        'username': current_user,
                        'content': content[:1000],
                        'timestamp': _time.time()
                    })
                    log.info(f"[MODERATION] Buffer push OK for channel {channel_id}, buf_len={buf_len}")
                    if buf_len >= mod_agent.BATCH_SIZE:
                        from tasks.agent_tasks import batch_moderation_task
                        batch_moderation_task.delay(channel_id, community_id)
                        log.info(f"[MODERATION] Batch triggered for channel {channel_id} ({buf_len} msgs)")
                except Exception as buf_err:
                    log.warning(f"[MODERATION] Buffer push failed: {buf_err}")

            # Agent auto-execution (fire-and-forget)
            _dispatch_agent_tasks(content, user_id, channel_id, community_id, message_type)

            avatar_url = get_avatar_url(msg['username'], msg['avatar_url'])
            return jsonify({
                'message': {
                    'id': msg['id'],
                    'channel_id': msg['channel_id'],
                    'sender_id': user_id,
                    'content': content,
                    'message_type': msg['message_type'],
                    'reply_to': msg['reply_to'],
                    'created_at': msg['created_at'].isoformat(),
                    'author': msg['username'],
                    'display_name': msg['display_name'] or msg['username'],
                    'avatar_url': avatar_url,
                    'is_blocked': False,
                    'moderation': {
                        'action': 'allow',
                        'severity': 'none',
                        'flagged': False,
                        'reasons': [],
                        'violation_count': violation_count,
                        'pending_ai_review': moderation_installed
                    }
                },
                'moderation': {
                    'action': 'allow',
                    'severity': 'none',
                    'reasons': [],
                    'message': None,
                    'violation_count': violation_count
                }
            }), 201

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
            current_user_id = get_user_id(current_user, cur)
            if current_user_id is None:
                return jsonify({'error': 'User not found'}), 404

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
            'content': _decrypt(m['content']) if m['content'] else m['content'],
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
                'content': _decrypt(m['reply_content'] or '')[:150],
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
# GET DM CONVERSATIONS (last message per partner)
# =====================================
@jwt_required()
def get_dm_conversations():
    conn = None
    try:
        current_user = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            uid = get_user_id(current_user, cur)
            if uid is None:
                return jsonify({'error': 'User not found'}), 404

            # Most recent message per conversation partner
            cur.execute("""
                SELECT
                    dm.id, dm.sender_id, dm.receiver_id, dm.content, dm.message_type,
                    dm.created_at, dm.is_read,
                    CASE WHEN dm.sender_id = %s THEN dm.receiver_id ELSE dm.sender_id END AS partner_id
                FROM direct_messages dm
                INNER JOIN (
                    SELECT MAX(id) AS max_id
                    FROM direct_messages
                    WHERE sender_id = %s OR receiver_id = %s
                    GROUP BY LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id)
                ) latest ON dm.id = latest.max_id
                ORDER BY dm.created_at DESC
            """, (uid, uid, uid))
            rows = cur.fetchall()

        result = []
        for m in rows:
            content = m['content']
            if content:
                try:
                    content = _decrypt(content)
                except Exception:
                    pass
            result.append({
                'partner_id': m['partner_id'],
                'last_message': {
                    'id': m['id'],
                    'sender_id': m['sender_id'],
                    'receiver_id': m['receiver_id'],
                    'content': content,
                    'message_type': m['message_type'],
                    'created_at': m['created_at'].isoformat() if m['created_at'] else None,
                    'is_read': bool(m['is_read']),
                }
            })
        return jsonify(result), 200

    except Exception as e:
        print(f"[ERROR] get_dm_conversations: {e}")
        return jsonify({'error': 'Failed to get conversations'}), 500
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

        if len(content) > 5000:
            return jsonify({'error': 'Message too long (max 5000 characters)'}), 400

        conn = get_db_connection()
        with conn.cursor() as cur:
            sender_id = get_user_id(current_user, cur)
            if sender_id is None:
                return jsonify({'error': 'User not found'}), 404

            cur.execute("SELECT 1 FROM users WHERE id = %s", (receiver_id,))
            if not cur.fetchone():
                return jsonify({'error': 'Receiver not found'}), 404

            cur.execute("""
                INSERT INTO direct_messages (sender_id, receiver_id, content, message_type, reply_to)
                VALUES (%s, %s, %s, %s, %s)
            """, (sender_id, receiver_id, _encrypt(content), message_type, reply_to or None))
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
                        'content': _decrypt(parent['content'] or '')[:150],
                        'author': parent['username'],
                        'message_type': parent['message_type'],
                    }

        # Persist DM notification for receiver (emit=False to avoid duplicate �
        # the real-time notification is handled by the frontend via the
        # receive_direct_message socket event ? newMessageReceived CustomEvent)
        try:
            sender_display = msg['display_name'] or msg['username']
            preview = content[:80] if message_type == 'text' else f'Sent a {message_type}'
            create_notification(
                user_id=receiver_id,
                type='message',
                title=f'Message from {sender_display}',
                body=preview,
                icon_url=msg['avatar_url'],
                link=f'/dm/{sender_id}',
                related_id=message_id,
                emit=False,
            )
        except Exception as notif_err:
            log.warning(f"[DM] Notification persistence failed: {notif_err}")

        # Queue batched email notification for receiver
        try:
            from services.email_batch_service import queue_email_notification
            sender_display = msg['display_name'] or msg['username']
            preview = content[:80] if message_type == 'text' else f'Sent a {message_type}'
            queue_email_notification(receiver_id, 'dm', {
                'sender_name': sender_display,
                'preview': preview,
            })
        except Exception as email_err:
            log.warning(f"[DM] Email batch queue failed: {email_err}")

        return jsonify({
            'id': msg['id'],
            'sender_id': msg['sender_id'],
            'receiver_id': msg['receiver_id'],
            'content': _decrypt(msg['content']) if msg['content'] else msg['content'],
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
            user_id = get_user_id(current_user, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404

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
            user_id = get_user_id(current_user, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404

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
            user_id = get_user_id(current_user, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404

            cur.execute("SELECT sender_id FROM messages WHERE id = %s", (message_id,))
            msg = cur.fetchone()
            if not msg:
                return jsonify({'error': 'Message not found'}), 404
            if msg['sender_id'] != user_id:
                return jsonify({'error': 'Access denied'}), 403

            cur.execute("UPDATE messages SET content = %s WHERE id = %s", (_encrypt(new_content), message_id))

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
            'content': _decrypt(updated['content']) if updated['content'] else updated['content'],
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

