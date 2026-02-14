# routes/uploads.py - File Upload API for Chat Messages
# Handles file uploads for both Community channel messages and Direct Messages
# Supports: images, documents, audio, video
# Security: whitelist extensions + size limits + UUID filenames

from flask import Blueprint, jsonify, request, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import get_db_connection
from utils import get_avatar_url
import os
import uuid
import logging
from datetime import datetime
from werkzeug.utils import secure_filename

log = logging.getLogger(__name__)

uploads_bp = Blueprint('uploads', __name__)

# ============================================================================
# CONFIGURATION
# ============================================================================

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'uploads', 'chat')

ALLOWED_EXTENSIONS = {
    # Images
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg',
    # Documents
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'md',
    # Audio
    'mp3', 'wav', 'ogg', 'webm', 'm4a',
    # Video
    'mp4', 'mov', 'avi', 'mkv',
    # Archives
    'zip', 'rar', '7z',
}

IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'}
AUDIO_EXTENSIONS = {'mp3', 'wav', 'ogg', 'webm', 'm4a'}
VIDEO_EXTENSIONS = {'mp4', 'mov', 'avi', 'mkv'}

# Ensure upload directory exists
os.makedirs(UPLOAD_DIR, exist_ok=True)


def get_file_extension(filename: str) -> str:
    """Extract lowercase file extension."""
    return filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''


def get_message_type(extension: str) -> str:
    """Determine message_type based on file extension."""
    if extension in IMAGE_EXTENSIONS:
        return 'image'
    if extension in AUDIO_EXTENSIONS:
        return 'voice'
    if extension in VIDEO_EXTENSIONS:
        return 'video'
    return 'file'


# ============================================================================
# UPLOAD FILE FOR CHANNEL MESSAGE
# ============================================================================

@uploads_bp.route('/api/upload/channel', methods=['POST'])
@jwt_required()
def upload_channel_file():
    """
    Upload a file and create a message in a channel.
    Expects multipart/form-data with:
      - file: the file
      - channel_id: target channel
      - content: optional text caption
    Returns the created message with attachment metadata.
    """
    conn = None
    try:
        current_user = get_jwt_identity()

        # Validate file presence
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if not file or file.filename == '':
            return jsonify({'error': 'Empty file'}), 400

        channel_id = request.form.get('channel_id')
        caption = request.form.get('content', '')
        duration = request.form.get('duration')  # Audio/video duration in seconds

        if not channel_id:
            return jsonify({'error': 'channel_id required'}), 400

        # Validate extension
        original_name = secure_filename(file.filename)
        ext = get_file_extension(file.filename)
        if ext not in ALLOWED_EXTENSIONS:
            return jsonify({'error': f'File type .{ext} not allowed'}), 400

        # Validate size (read into memory, check, then save)
        file.seek(0, os.SEEK_END)
        file_size = file.tell()
        file.seek(0)

        if file_size > MAX_FILE_SIZE:
            return jsonify({'error': f'File too large. Max size is {MAX_FILE_SIZE // (1024*1024)}MB'}), 400

        # Auth + access checks
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (current_user,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404
            user_id = user['id']

            cur.execute("SELECT id, community_id FROM channels WHERE id = %s", (int(channel_id),))
            channel = cur.fetchone()
            if not channel:
                return jsonify({'error': 'Channel not found'}), 404
            community_id = channel['community_id']

            cur.execute(
                "SELECT 1 FROM channel_members WHERE channel_id = %s AND user_id = %s",
                (int(channel_id), user_id)
            )
            if not cur.fetchone():
                return jsonify({'error': 'Access denied'}), 403

            # Check block list
            cur.execute(
                "SELECT id FROM blocked_users WHERE community_id = %s AND user_id = %s",
                (community_id, user_id)
            )
            if cur.fetchone():
                return jsonify({'error': 'You are blocked from this community'}), 403

            # Save file with UUID name
            unique_name = f"{uuid.uuid4().hex}_{original_name}"
            file_path = os.path.join(UPLOAD_DIR, unique_name)
            file.save(file_path)

            file_url = f"/uploads/chat/{unique_name}"
            message_type = get_message_type(ext)
            mime_type = file.content_type or 'application/octet-stream'

            # Build message content: JSON-encoded attachment info
            # Content stores the file URL; clients parse message_type to render appropriately
            message_content = file_url
            if caption:
                message_content = f"{file_url}\n{caption}"

            # Insert message
            cur.execute("""
                INSERT INTO messages (channel_id, sender_id, content, message_type, reply_to)
                VALUES (%s, %s, %s, %s, NULL)
            """, (int(channel_id), user_id, message_content, message_type))
            message_id = cur.lastrowid

            # Insert attachment metadata
            duration_val = float(duration) if duration else None
            cur.execute("""
                INSERT INTO attachments (message_id, direct_message_id, file_name, file_path, file_size, mime_type, uploaded_by, duration)
                VALUES (%s, NULL, %s, %s, %s, %s, %s, %s)
            """, (message_id, original_name, file_url, file_size, mime_type, user_id, duration_val))

            # Fetch the created message for response
            cur.execute("""
                SELECT m.*, u.username, u.display_name, u.avatar_url
                FROM messages m
                JOIN users u ON m.sender_id = u.id
                WHERE m.id = %s
            """, (message_id,))
            msg = cur.fetchone()

        conn.commit()

        avatar_url = get_avatar_url(msg['username'], msg['avatar_url'])

        payload = {
            'id': msg['id'],
            'channel_id': msg['channel_id'],
            'sender_id': user_id,
            'content': msg['content'],
            'message_type': msg['message_type'],
            'reply_to': None,
            'created_at': msg['created_at'].isoformat(),
            'author': msg['username'],
            'display_name': msg['display_name'] or msg['username'],
            'avatar_url': avatar_url,
            'is_blocked': False,
            'attachment': {
                'file_name': original_name,
                'file_url': file_url,
                'file_size': file_size,
                'mime_type': mime_type,
                'duration': duration_val,
            }
        }

        # Broadcast via socket so all channel members see it in real-time
        from flask import current_app
        socketio = current_app.extensions.get('socketio')
        if socketio:
            broadcast_payload = {**payload, 'avatar': avatar_url}
            socketio.emit('message_received', broadcast_payload, room=f"channel_{channel_id}", namespace='/')
            if community_id:
                socketio.emit('message_received', broadcast_payload, room=f"community_{community_id}", namespace='/')
            log.info(f"[UPLOAD] Broadcast file message {message_id} to channel_{channel_id}")

        return jsonify(payload), 201

    except Exception as e:
        log.error(f"[UPLOAD] Channel file upload error: {e}", exc_info=True)
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to upload file'}), 500
    finally:
        if conn:
            conn.close()


# ============================================================================
# UPLOAD FILE FOR DIRECT MESSAGE
# ============================================================================

@uploads_bp.route('/api/upload/dm', methods=['POST'])
@jwt_required()
def upload_dm_file():
    """
    Upload a file and create a direct message.
    Expects multipart/form-data with:
      - file: the file
      - receiver_id: target user
      - content: optional text caption
    """
    conn = None
    try:
        current_user = get_jwt_identity()

        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        if not file or file.filename == '':
            return jsonify({'error': 'Empty file'}), 400

        receiver_id = request.form.get('receiver_id')
        caption = request.form.get('content', '')
        duration = request.form.get('duration')  # Audio/video duration in seconds

        if not receiver_id:
            return jsonify({'error': 'receiver_id required'}), 400

        original_name = secure_filename(file.filename)
        ext = get_file_extension(file.filename)
        if ext not in ALLOWED_EXTENSIONS:
            return jsonify({'error': f'File type .{ext} not allowed'}), 400

        file.seek(0, os.SEEK_END)
        file_size = file.tell()
        file.seek(0)

        if file_size > MAX_FILE_SIZE:
            return jsonify({'error': f'File too large. Max size is {MAX_FILE_SIZE // (1024*1024)}MB'}), 400

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (current_user,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404
            sender_id = user['id']

            cur.execute("SELECT id FROM users WHERE id = %s", (int(receiver_id),))
            if not cur.fetchone():
                return jsonify({'error': 'Receiver not found'}), 404

            # Save file
            unique_name = f"{uuid.uuid4().hex}_{original_name}"
            file_path = os.path.join(UPLOAD_DIR, unique_name)
            file.save(file_path)

            file_url = f"/uploads/chat/{unique_name}"
            message_type = get_message_type(ext)
            mime_type = file.content_type or 'application/octet-stream'

            message_content = file_url
            if caption:
                message_content = f"{file_url}\n{caption}"

            # Insert DM
            cur.execute("""
                INSERT INTO direct_messages (sender_id, receiver_id, content, message_type)
                VALUES (%s, %s, %s, %s)
            """, (sender_id, int(receiver_id), message_content, message_type))
            dm_id = cur.lastrowid

            # Insert attachment metadata
            duration_val = float(duration) if duration else None
            cur.execute("""
                INSERT INTO attachments (message_id, direct_message_id, file_name, file_path, file_size, mime_type, uploaded_by, duration)
                VALUES (NULL, %s, %s, %s, %s, %s, %s, %s)
            """, (dm_id, original_name, file_url, file_size, mime_type, sender_id, duration_val))

            # Fetch created message
            cur.execute("""
                SELECT dm.*, u.username, u.display_name, u.avatar_url
                FROM direct_messages dm
                JOIN users u ON dm.sender_id = u.id
                WHERE dm.id = %s
            """, (dm_id,))
            msg = cur.fetchone()

            # Get receiver info
            cur.execute("SELECT id, username, display_name, avatar_url FROM users WHERE id = %s", (int(receiver_id),))
            receiver = cur.fetchone()

        conn.commit()

        sender_avatar = get_avatar_url(msg['username'], msg['avatar_url'])
        receiver_avatar = get_avatar_url(receiver['username'], receiver['avatar_url']) if receiver else None

        payload = {
            'id': msg['id'],
            'sender_id': msg['sender_id'],
            'receiver_id': msg['receiver_id'],
            'content': msg['content'],
            'message_type': msg['message_type'],
            'created_at': msg['created_at'].isoformat(),
            'is_read': False,
            'edited_at': None,
            'sender': {
                'id': msg['sender_id'],
                'username': msg['username'],
                'display_name': msg['display_name'] or msg['username'],
                'avatar_url': sender_avatar
            },
            'receiver': {
                'id': receiver['id'],
                'username': receiver['username'],
                'display_name': receiver['display_name'] or receiver['username'],
                'avatar_url': receiver_avatar
            } if receiver else None,
            'attachment': {
                'file_name': original_name,
                'file_url': file_url,
                'file_size': file_size,
                'mime_type': mime_type,
                'duration': duration_val,
            }
        }

        return jsonify(payload), 201

    except Exception as e:
        log.error(f"[UPLOAD] DM file upload error: {e}", exc_info=True)
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to upload file'}), 500
    finally:
        if conn:
            conn.close()


# ============================================================================
# SERVE UPLOADED CHAT FILES
# ============================================================================

@uploads_bp.route('/uploads/chat/<filename>', methods=['GET'])
def serve_chat_file(filename):
    """Serve uploaded chat files with caching."""
    response = send_from_directory(UPLOAD_DIR, filename)
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Cache-Control'] = 'public, max-age=31536000'
    return response
