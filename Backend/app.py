from flask import Flask
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from dotenv import load_dotenv
from datetime import timedelta
import os
from flask_socketio import SocketIO

# Import all route functions
from routes.auth import signup, login, logout, update_first_login, get_me, reset_password, forgot_password, verify_otp_endpoint , update_profile
from routes.channels import (
    get_communities, get_community_channels, get_friends,
    create_channel, join_channel, leave_channel,
    create_community, delete_channel,
    # NEW: Member management routes
    search_users, get_community_members, add_community_member
)
from routes.messages import (
    get_channel_messages, send_message,
    get_direct_messages, send_direct_message,
    mark_as_read, delete_message, edit_message
)
from routes.friends import (
    send_friend_request, get_pending_requests,
    accept_friend_request, reject_friend_request,
    cancel_friend_request, remove_friend
)
from routes.sockets import register_socket_events

load_dotenv()

app = Flask(__name__)

# CORS Configuration - Allow both ports for development
CORS(app, resources={
    r"/api/*": {
        "origins": ["http://localhost:8080", "http://localhost:3000"],
        "supports_credentials": True,
        "allow_headers": ["Content-Type", "Authorization"],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    }
})

# JWT Configuration
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "super-secret-key")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(minutes=int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", "10")))

jwt = JWTManager(app)

# Initialize SocketIO with threading mode
socketio = SocketIO(
    app, 
    cors_allowed_origins=["http://localhost:8080", "http://localhost:3000"],
    async_mode="threading",
    logger=True,
    engineio_logger=True
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


# ======================================================================
# COMMUNITY & CHANNEL ROUTES
# ======================================================================
app.route("/api/channels/communities", methods=["GET"])(get_communities)
app.route("/api/channels/communities/<int:community_id>/channels", methods=["GET"])(get_community_channels)
app.route("/api/channels/communities/<int:community_id>/channels", methods=["POST"])(create_channel)
app.route("/api/channels/communities", methods=["POST"])(create_community)
app.route("/api/channels/<int:channel_id>/join", methods=["POST"])(join_channel)
app.route("/api/channels/<int:channel_id>/leave", methods=["POST"])(leave_channel)
app.route("/api/channels/<int:channel_id>", methods=["DELETE"])(delete_channel)

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
app.route("/api/messages/direct/<int:user_id>", methods=["GET"])(get_direct_messages)
app.route("/api/messages/direct/send", methods=["POST"])(send_direct_message)
app.route("/api/messages/read", methods=["POST"])(mark_as_read)
app.route("/api/messages/<int:message_id>", methods=["DELETE"])(delete_message)
app.route("/api/messages/<int:message_id>", methods=["PUT"])(edit_message)

# ======================================================================
# FRIEND ROUTES
# ======================================================================
app.route("/api/channels/friends", methods=["GET"])(get_friends)
app.route("/api/friends/request", methods=["POST"])(send_friend_request)
app.route("/api/friends/requests/pending", methods=["GET"])(get_pending_requests)
app.route("/api/friends/request/<int:request_id>/accept", methods=["POST"])(accept_friend_request)
app.route("/api/friends/request/<int:request_id>/reject", methods=["POST"])(reject_friend_request)
app.route("/api/friends/request/<int:request_id>/cancel", methods=["POST"])(cancel_friend_request)
app.route("/api/friends/<int:friend_id>", methods=["DELETE"])(remove_friend)

# ======================================================================
# SOCKET EVENTS
# ======================================================================
register_socket_events(socketio)

# ======================================================================
# ERROR HANDLERS
# ======================================================================
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
def health_check():
    return {"status": "ok", "message": "AuraFlow API is running"}, 200

# ======================================================================
# RUN APPLICATION
# ======================================================================
if __name__ == "__main__":
    print("=" * 60)
    print("AuraFlow Backend Server Starting...")
    print(f"Server: http://localhost:5000")
    print(f"WebSocket: ws://localhost:5000")
    print(f"CORS Enabled for: localhost:8080, localhost:3000")
    print("=" * 60)
    
    # Use socketio.run() instead of app.run() for WebSocket support
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)