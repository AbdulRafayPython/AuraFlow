# NOTE: Do NOT monkey_patch here. Production uses wsgi.py which patches before importing this module.
import os
from flask import Flask
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_compress import Compress
from dotenv import load_dotenv
from datetime import timedelta
from flask_socketio import SocketIO
from flask import request, make_response, send_from_directory

# Import all route functions
from routes.auth import (
    signup, login, logout, update_first_login, get_me,
    reset_password, forgot_password, verify_otp_endpoint, update_profile,
    verify_email, resend_verification,
    refresh, get_sessions, revoke_session_endpoint, revoke_all_sessions_endpoint,
    get_notification_settings, update_notification_settings
)
from routes.channels import (
    get_communities, get_community_channels, get_friends,
    create_channel, join_channel, leave_channel,
    create_community, delete_channel,
    # NEW: Member management routes
    search_users, get_community_members, add_community_member,
    # NEW: Channel and community management
    update_channel, delete_community, leave_community,
    # NEW: Community discovery and joining
    discover_communities, join_community,
    # NEW: Community images
    get_community, update_community,
    upload_community_logo, upload_community_banner,
    remove_community_logo, remove_community_banner
)
from routes.messages import (
    get_channel_messages, send_message,
    get_direct_messages, send_direct_message,
    get_dm_conversations,
    mark_as_read, delete_message, edit_message
)
from routes.friends import (
    send_friend_request, get_pending_requests, get_sent_requests,
    accept_friend_request, reject_friend_request,
    cancel_friend_request, remove_friend, block_friend, unblock_friend, get_blocked_friends
)
from routes.reactions import reactions_bp
from routes.uploads import uploads_bp
from routes.sockets import register_socket_events
from routes.agents import agents_bp
from routes.admin import admin_bp
from routes.community_admin import community_admin_bp
from routes.search import search_bp
from routes.pins import pins_bp
from routes.status import status_bp
from routes.notifications import notifications_bp

load_dotenv()

app = Flask(__name__)

# Gzip compression for all responses > 500 bytes
Compress(app)

# CORS Configuration — restrict origins in production
import config as _cfg
_raw_origins = os.getenv('ALLOWED_ORIGINS', '').strip()
if _raw_origins == '*':
    _ALLOWED_ORIGINS = '*'
elif _raw_origins:
    _ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(',') if o.strip()]
else:
    _ALLOWED_ORIGINS = [_cfg.FRONTEND_URL] if _cfg.FRONTEND_URL else '*'

if not _cfg.IS_PRODUCTION:
    _ALLOWED_ORIGINS = '*'  # Allow all in development
else:
    # Always include known Vercel deployment URLs
    _vercel_origins = [
        "https://auraflow-ai.vercel.app",
    ]
    if isinstance(_ALLOWED_ORIGINS, list):
        for _u in _vercel_origins:
            if _u not in _ALLOWED_ORIGINS:
                _ALLOWED_ORIGINS.append(_u)
    # if '*', already wide open

CORS(app,
     origins=_ALLOWED_ORIGINS,
     supports_credentials=True,
     allow_headers=["Content-Type", "Authorization", "ngrok-skip-browser-warning"],
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     expose_headers=["Content-Type", "Authorization"],
     max_age=3600
)

# Security headers on EVERY response
@app.after_request
def add_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    if _cfg.IS_PRODUCTION:
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response

# Handle OPTIONS preflight requests + HTTPS redirect in production
@app.before_request
def handle_preflight():
    if _cfg.IS_PRODUCTION and request.headers.get('X-Forwarded-Proto', 'https') != 'https':
        from flask import redirect
        url = request.url.replace('http://', 'https://', 1)
        return redirect(url, code=301)
    if request.method == 'OPTIONS':
        response = app.make_default_options_response()
        return response

# JWT Configuration
if _cfg.IS_PRODUCTION and not os.getenv("JWT_SECRET_KEY"):
    raise RuntimeError("JWT_SECRET_KEY must be set in production")
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "dev-only-secret-key")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(minutes=int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", "15")))
app.config["JWT_REFRESH_TOKEN_EXPIRES"] = timedelta(days=int(os.getenv("JWT_REFRESH_TOKEN_EXPIRES_DAYS", "7")))

jwt = JWTManager(app)

# ── Session Management: Token blocklist ──────────────────────────────
from services.session_manager import is_token_revoked, load_blocklist_from_db

@jwt.token_in_blocklist_loader
def check_if_token_revoked(jwt_header, jwt_payload):
    return is_token_revoked(jwt_header, jwt_payload)

try:
    load_blocklist_from_db()
except Exception:
    pass  # Tables may not exist yet on first run
# ── End Session Management ───────────────────────────────────────────

# Initialize SocketIO with Redis message_queue for cross-process emit from Celery
# Use threading mode locally (no monkey-patching needed); production uses gevent via wsgi.py
REDIS_URL = os.getenv('REDIS_URL', 'redis://127.0.0.1:6379/0')
import sys
_async_mode = 'gevent' if 'gevent' in sys.modules else 'threading'
socketio = SocketIO(
    app, 
    cors_allowed_origins=_ALLOWED_ORIGINS,
    logger=False,
    engineio_logger=False,
    ping_timeout=25,
    ping_interval=15,
    message_queue=REDIS_URL,
    async_mode=_async_mode,
)

# ======================================================================
# AUTH ROUTES
# ======================================================================
app.route("/api/signup", methods=["POST"])(signup)
app.route("/api/login", methods=["POST"])(login)
app.route("/api/first-login", methods=["POST"])(update_first_login)
app.route("/api/user/profile", methods=['PUT'])(update_profile)
app.route("/api/logout", methods=["POST"])(logout)
app.route("/api/me", methods=["GET"])(get_me)
app.route("/api/user/update-first-login", methods=["POST"])(update_first_login)
app.route("/api/reset-password",methods=["POST"])(reset_password)
app.route("/api/forgot-password", methods=["POST"])(forgot_password)
app.route("/api/verify-otp", methods=["POST"])(verify_otp_endpoint)
app.route("/api/verify-email", methods=["GET", "POST"])(verify_email)
app.route("/api/resend-verification", methods=["POST"])(resend_verification)

# ── Session Management Routes ────────────────────────────────────────
app.route("/api/token/refresh", methods=["POST"])(refresh)
app.route("/api/sessions", methods=["GET"])(get_sessions)
app.route("/api/sessions/revoke", methods=["POST"])(revoke_session_endpoint)
app.route("/api/sessions/revoke-all", methods=["POST"])(revoke_all_sessions_endpoint)

# ── Notification Settings Routes ─────────────────────────────────────
app.route("/api/users/settings/notifications", methods=["GET"])(get_notification_settings)
app.route("/api/users/settings/notifications", methods=["PATCH"])(update_notification_settings)

# ======================================================================
# COMMUNITY & CHANNEL ROUTES
# ======================================================================
app.route("/api/channels/communities", methods=["GET"])(get_communities)
app.route("/api/channels/communities/discover", methods=["GET"])(discover_communities)
app.route("/api/channels/communities/<int:community_id>/join", methods=["POST"])(join_community)
app.route("/api/channels/communities/<int:community_id>/channels", methods=["GET"])(get_community_channels)
app.route("/api/channels/communities/<int:community_id>/channels", methods=["POST"])(create_channel)
app.route("/api/channels/communities", methods=["POST"])(create_community)
app.route("/api/channels/<int:channel_id>/join", methods=["POST"])(join_channel)
app.route("/api/channels/<int:channel_id>/leave", methods=["POST"])(leave_channel)
app.route("/api/channels/<int:channel_id>", methods=["DELETE"])(delete_channel)
app.route("/api/channels/<int:channel_id>", methods=["PUT"])(update_channel)
app.route("/api/channels/communities/<int:community_id>", methods=["DELETE"])(delete_community)
app.route("/api/channels/communities/<int:community_id>/leave", methods=["POST"])(leave_community)

# ======================================================================
# COMMUNITY SETTINGS & IMAGE ROUTES (NEW)
# ======================================================================
app.route("/api/channels/communities/<int:community_id>", methods=["GET"])(get_community)
app.route("/api/channels/communities/<int:community_id>", methods=["PUT"])(update_community)
app.route("/api/channels/communities/<int:community_id>/logo", methods=["POST"])(upload_community_logo)
app.route("/api/channels/communities/<int:community_id>/logo", methods=["DELETE"])(remove_community_logo)
app.route("/api/channels/communities/<int:community_id>/banner", methods=["POST"])(upload_community_banner)
app.route("/api/channels/communities/<int:community_id>/banner", methods=["DELETE"])(remove_community_banner)

# ======================================================================
# COMMUNITY MEMBER ROUTES (NEW)
# ======================================================================
app.route("/api/channels/users/search", methods=["GET"])(search_users)
app.route("/api/channels/community/members", methods=["GET"])(get_community_members)
app.route("/api/channels/community/add-member", methods=["POST"])(add_community_member)

# ======================================================================
# MESSAGE ROUTES
# ======================================================================
app.route("/api/messages/channel/<int:channel_id>", methods=["GET"])(get_channel_messages)
app.route("/api/messages/send", methods=["POST"])(send_message)
app.route("/api/messages/direct/conversations", methods=["GET"])(get_dm_conversations)
app.route("/api/messages/direct/<int:user_id>", methods=["GET"])(get_direct_messages)
app.route("/api/messages/direct/send", methods=["POST"])(send_direct_message)
app.route("/api/messages/read", methods=["POST"])(mark_as_read)
app.route("/api/messages/<int:message_id>", methods=["DELETE"])(delete_message)
app.route("/api/messages/<int:message_id>", methods=["PUT"])(edit_message)

# ======================================================================
# REACTIONS ROUTES
# ======================================================================
app.register_blueprint(reactions_bp)

# ======================================================================
# FILE UPLOAD ROUTES
# ======================================================================
app.register_blueprint(uploads_bp)

# ======================================================================
# AI AGENTS ROUTES
# ======================================================================
app.register_blueprint(agents_bp)

# ======================================================================
# ADMIN DASHBOARD ROUTES
# ======================================================================
app.register_blueprint(admin_bp)

# ======================================================================
# COMMUNITY ADMIN DASHBOARD ROUTES
# ======================================================================
app.register_blueprint(community_admin_bp)

# ======================================================================
# SEARCH, PINS, STATUS & UNREAD ROUTES
# ======================================================================
app.register_blueprint(search_bp)
app.register_blueprint(pins_bp)
app.register_blueprint(status_bp)
app.register_blueprint(notifications_bp)

# ======================================================================
# FRIEND ROUTES
# ======================================================================

# Friend routes
app.route("/api/channels/friends", methods=["GET"])(get_friends)
app.route("/api/friends/request", methods=["POST"])(send_friend_request)
app.route("/api/friends/requests/pending", methods=["GET"])(get_pending_requests)
app.route("/api/friends/requests/sent", methods=["GET"])(get_sent_requests)
app.route("/api/friends/request/<int:request_id>/accept", methods=["POST"])(accept_friend_request)
app.route("/api/friends/request/<int:request_id>/reject", methods=["POST"])(reject_friend_request)
app.route("/api/friends/request/<int:request_id>/cancel", methods=["POST"])(cancel_friend_request)
app.route("/api/friends/<int:friend_id>", methods=["DELETE"])(remove_friend)
app.route("/api/friends/block/<int:friend_id>", methods=["POST"])(block_friend)
app.route("/api/friends/unblock/<int:friend_id>", methods=["POST"])(unblock_friend)
app.route("/api/friends/blocked", methods=["GET"])(get_blocked_friends)

# ======================================================================
# SOCKET EVENTS
# ======================================================================
register_socket_events(socketio)

# Initialize notification service with socketio
from services.notification_service import init as init_notifications
init_notifications(socketio)

# ======================================================================
# ERROR HANDLERS
# ======================================================================
@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_data):
    return {"error": "Token has expired"}, 401

@jwt.invalid_token_loader
def invalid_token_callback(error):
    return {"error": f"Invalid token: {str(error)}"}, 401

@jwt.unauthorized_loader
def missing_token_callback(error):
    return {"error": "Missing authorization token"}, 401

@jwt.revoked_token_loader
def revoked_token_callback(jwt_header, jwt_data):
    return {"error": "Token has been revoked"}, 401

@app.errorhandler(404)
def not_found(error):
    return {"error": "Route not found"}, 404

@app.errorhandler(500)
def internal_error(error):
    return {"error": "Internal server error"}, 500

# ======================================================================
# HEALTH CHECK
# ======================================================================
@app.route("/api/health", methods=["GET"])
def health():
    from services.redis_client import redis_health
    redis_status = redis_health()
    return {
        "status": "ok",
        "redis": redis_status,
    }, 200

# ======================================================================
# DEBUG: Socket Room Test
# ======================================================================
@app.route("/api/debug/socket-rooms", methods=["GET"])
def debug_socket_rooms():
    """Debug endpoint to check active socket rooms"""
    from routes.sockets import user_socket_sessions, user_rooms
    return {
        "active_sessions": list(user_socket_sessions.keys()),
        "session_count": len(user_socket_sessions),
        "sessions": {username: sid for username, sid in user_socket_sessions.items()},
        "user_rooms": {username: list(r) if r else [] for username, r in user_rooms.items()}
    }, 200

@app.route("/api/debug/test-friend-request/<int:user_id>", methods=["POST"])
def test_friend_request_emission(user_id):
    """Test endpoint to manually emit a friend request event"""
    from datetime import datetime
    
    test_data = {
        'id': 99999,
        'sender_id': 1,
        'receiver_id': user_id,
        'status': 'pending',
        'created_at': datetime.now().isoformat(),
        'sender': {
            'username': 'test_user',
            'display_name': 'Test User',
            'avatar_url': None
        }
    }
    
    room = f"user_{user_id}"
    print(f"[DEBUG] Testing emission to room: {room}")
    print(f"[DEBUG] Payload: {test_data}")
    
    # Emit to specific room
    socketio.emit('friend_request_received', test_data, to=room, namespace='/')
    
    return {
        "message": "Test event emitted",
        "room": room,
        "data": test_data
    }, 200
def health_check():
    return {"status": "ok", "message": "AuraFlow API is running"}, 200

# ======================================================================
# STATIC FILE SERVING - Avatar uploads
# ======================================================================
@app.route("/uploads/avatars/<filename>", methods=["GET"])
def serve_avatar(filename):
    """Serve uploaded avatar images"""
    upload_dir = os.path.join(os.path.dirname(__file__), 'uploads', 'avatars')
    response = send_from_directory(upload_dir, filename)
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Cache-Control'] = 'public, max-age=31536000'
    return response

# ======================================================================
# STATIC FILE SERVING - Community uploads (Logo & Banner)
# ======================================================================
@app.route("/uploads/communities/<filename>", methods=["GET"])
def serve_community_image(filename):
    """Serve uploaded community logo and banner images"""
    upload_dir = os.path.join(os.path.dirname(__file__), 'uploads', 'communities')
    response = send_from_directory(upload_dir, filename)
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Cache-Control'] = 'public, max-age=31536000'
    return response

# ======================================================================
# BACKGROUND TASKS - Monitor inactive users
# ======================================================================
import threading
import time
from datetime import datetime, timedelta
from database import get_db_connection

def monitor_inactive_users():
    """Background task to mark users as offline if they haven't sent heartbeat in 2 minutes"""
    from routes.sockets import user_heartbeats
    
    while True:
        try:
            time.sleep(60)  # Check every minute
            
            now = datetime.now()
            inactive_threshold = timedelta(minutes=2)  # 2 minutes without heartbeat = offline
            
            inactive_users = []
            for username, last_heartbeat in list(user_heartbeats.items()):
                if now - last_heartbeat > inactive_threshold:
                    inactive_users.append(username)
            
            if inactive_users:
                conn = get_db_connection()
                try:
                    with conn.cursor() as cur:
                        for username in inactive_users:
                            # Mark as offline in database
                            cur.execute("""
                                UPDATE users
                                SET status = 'offline', last_seen = NOW()
                                WHERE username = %s
                            """, (username,))
                            
                            # Remove from heartbeat tracking
                            del user_heartbeats[username]
                            
                            # Emit status update
                            socketio.emit('user_status', {
                                'username': username,
                                'status': 'offline'
                            }, broadcast=True, namespace='/')
                            
                            print(f"[MONITOR] Marked {username} as offline due to inactivity")
                    
                    conn.commit()
                finally:
                    conn.close()
                    
        except Exception as e:
            print(f"[MONITOR] Error in inactive user monitoring: {e}")

# Start background monitoring thread
monitor_thread = threading.Thread(target=monitor_inactive_users, daemon=True)
monitor_thread.start()
print("[MONITOR] Started inactive user monitoring thread")

# ── Periodic token cleanup (every 6 hours) ───────────────────────────
def _periodic_token_cleanup():
    from services.session_manager import cleanup_expired_tokens
    while True:
        time.sleep(6 * 3600)
        try:
            cleanup_expired_tokens()
        except Exception as e:
            print(f"[CLEANUP] Token cleanup error: {e}")

threading.Thread(target=_periodic_token_cleanup, daemon=True).start()
print("[CLEANUP] Started periodic token cleanup thread")

# ── Initialize messaging enhancement services ────────────────────────
try:
    from services.pin_timer import init as init_pin_timer
    init_pin_timer(socketio)
    print("[PIN_TIMER] Pin timer service initialized")
except Exception as e:
    print(f"[PIN_TIMER] Failed to initialize: {e}")

try:
    from services.unread_tracker import init as init_unread_tracker
    init_unread_tracker(socketio)
    print("[UNREAD] Unread tracker service initialized")
except Exception as e:
    print(f"[UNREAD] Failed to initialize: {e}")

try:
    from services.presence import init as init_presence
    init_presence(socketio)
    print("[PRESENCE] Presence service initialized")
except Exception as e:
    print(f"[PRESENCE] Failed to initialize: {e}")

# ── Session cleanup thread ───────────────────────────────────────────
def session_cleanup_job():
    """Periodically clean up expired refresh tokens and blocklist entries."""
    from services.session_manager import cleanup_expired_tokens, cleanup_blocklist_cache
    while True:
        try:
            time.sleep(3600)  # Run every hour
            cleanup_expired_tokens()
            cleanup_blocklist_cache()
        except Exception as e:
            print(f"[SESSION] Cleanup error: {e}")

session_thread = threading.Thread(target=session_cleanup_job, daemon=True)
session_thread.start()
print("[SESSION] Started session cleanup thread")

# ── User summary schedule checker (runs every 60s, no Celery needed) ─
def user_schedule_checker():
    """Check for due user summary schedules and generate summaries."""
    import time as _time
    _time.sleep(30)  # Wait for full server startup
    while True:
        try:
            _time.sleep(60)  # Check every minute
            from datetime import datetime as dt, timezone as tz
            from zoneinfo import ZoneInfo
            now_utc = dt.now(tz.utc)

            conn = None
            try:
                conn = get_db_connection()
                with conn.cursor() as cur:
                    # Fetch ALL active schedules with their timezone
                    cur.execute("""
                        SELECT s.id, s.user_id, s.channel_id, s.community_id,
                               s.schedule_time, s.timezone,
                               s.last_triggered_at,
                               c.name AS channel_name
                        FROM user_summary_schedules s
                        JOIN channels c ON c.id = s.channel_id
                        WHERE s.is_active = TRUE
                    """)
                    all_schedules = cur.fetchall()

                # Filter in Python using proper timezone conversion
                due = []
                for sched in all_schedules:
                    try:
                        user_tz = ZoneInfo(sched['timezone'] or 'UTC')
                    except Exception:
                        user_tz = ZoneInfo('UTC')

                    # Convert current UTC time to the user's local timezone
                    user_now = now_utc.astimezone(user_tz)
                    user_current_time = user_now.strftime('%H:%M')

                    # Parse stored schedule_time (timedelta from MySQL TIME)
                    sched_time = sched['schedule_time']
                    if hasattr(sched_time, 'total_seconds'):
                        # MySQL TIME comes as timedelta
                        total_secs = int(sched_time.total_seconds())
                        sched_hh_mm = f"{total_secs // 3600:02d}:{(total_secs % 3600) // 60:02d}"
                    else:
                        sched_hh_mm = str(sched_time)[:5]

                    if user_current_time != sched_hh_mm:
                        continue

                    # Check if already triggered today in the user's local date
                    last = sched['last_triggered_at']
                    if last:
                        if hasattr(last, 'replace'):
                            last_aware = last.replace(tzinfo=tz.utc)
                        else:
                            last_aware = dt.fromisoformat(str(last)).replace(tzinfo=tz.utc)
                        last_local = last_aware.astimezone(user_tz).date()
                        if last_local >= user_now.date():
                            continue

                    due.append(sched)

                if not due:
                    continue

                print(f"[USER_SCHEDULES] Found {len(due)} due schedule(s) at {now_utc.strftime('%H:%M')} UTC")

                for schedule in due:
                    try:
                        from agents.summarizer import SummarizerAgent
                        from tasks.agent_tasks import _format_summary_as_bot_message
                        summarizer = SummarizerAgent()
                        result = summarizer.summarize_channel(
                            channel_id=schedule['channel_id'],
                            message_count=100,
                            user_id=schedule['user_id']
                        )
                        if not result.get('success'):
                            continue

                        content = _format_summary_as_bot_message(result, schedule['channel_name'])

                        conn2 = get_db_connection()
                        try:
                            with conn2.cursor() as cur2:
                                cur2.execute("""
                                    INSERT INTO scheduled_summaries
                                        (schedule_id, user_id, channel_id, community_id, content, method, message_count)
                                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                                """, (
                                    schedule['id'], schedule['user_id'], schedule['channel_id'],
                                    schedule['community_id'], content,
                                    result.get('method', 'extractive'), result.get('message_count', 0)
                                ))
                                cur2.execute("UPDATE user_summary_schedules SET last_triggered_at = NOW() WHERE id = %s", (schedule['id'],))
                                conn2.commit()

                            # Deliver via socket if online
                            from routes.sockets import user_socket_sessions
                            with conn2.cursor() as cur2:
                                cur2.execute("SELECT username FROM users WHERE id = %s", (schedule['user_id'],))
                                u = cur2.fetchone()
                            if u:
                                user_sid = user_socket_sessions.get(u['username'])
                                if user_sid:
                                    socketio.emit('summary_result', {
                                        'channel_id': schedule['channel_id'],
                                        'content': content,
                                        'method': result.get('method', 'extractive'),
                                        'message_count': result.get('message_count', 0),
                                        'created_at': now_utc.isoformat(),
                                        'scheduled': True,
                                    }, room=user_sid, namespace='/')
                                    print(f"[USER_SCHEDULES] ✅ Delivered to {u['username']}")
                        finally:
                            conn2.close()

                        print(f"[USER_SCHEDULES] ✅ Summary for user {schedule['user_id']}, #{schedule['channel_name']}")
                    except Exception as sched_err:
                        print(f"[USER_SCHEDULES] ❌ Error: {sched_err}")
            finally:
                if conn:
                    conn.close()
        except Exception as e:
            print(f"[USER_SCHEDULES] Loop error: {e}")

_enable_inprocess_schedule_checker = os.getenv('ENABLE_INPROCESS_SCHEDULE_CHECKER')
if _enable_inprocess_schedule_checker is None:
    # Safe default: enabled only in local/dev unless explicitly configured.
    _enable_inprocess_schedule_checker = '1' if not _cfg.IS_PRODUCTION else '0'

if str(_enable_inprocess_schedule_checker).lower() in ('1', 'true', 'yes', 'on'):
    schedule_thread = threading.Thread(target=user_schedule_checker, daemon=True)
    schedule_thread.start()
    print("[USER_SCHEDULES] Started schedule checker thread")
else:
    print("[USER_SCHEDULES] In-process schedule checker disabled")

# ======================================================================
# RUN APPLICATION
# ======================================================================
if __name__ == "__main__":
    print("=" * 60)
    print("AuroFlow Backend Server Starting...")
    print(f"Server: http://0.0.0.0:5000")
    print(f"WebSocket: ws://0.0.0.0:5000")
    print(f"CORS Enabled for: localhost:8080, localhost:3000")
    print("=" * 60)
    
    # Use socketio.run() without SSL
    # Frontend uses HTTPS via @vitejs/plugin-basic-ssl
    # API calls use HTTP (safe on local network)
    port = int(os.getenv('PORT', 5000))
    socketio.run(
        app, 
        debug=not os.getenv('FLASK_ENV') == 'production', 
        host='0.0.0.0', 
        port=port,
        allow_unsafe_werkzeug=True
    )


