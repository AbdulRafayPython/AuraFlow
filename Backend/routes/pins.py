# routes/pins.py — Pinned messages management with timer support & DM pins
# Production-grade: single active pin per channel/DM, owner-only unpin,
# auto-unpin previous, rate limiting, race-condition handling
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import get_db_connection
from utils import get_avatar_url
from datetime import datetime, timedelta
import logging
import time

log = logging.getLogger(__name__)

pins_bp = Blueprint('pins', __name__, url_prefix='/api/pins')

# ── Rate limiter (per-user, in-memory) ──────────────────────────────────────
_pin_rate = {}          # username → last_pin_timestamp
_PIN_COOLDOWN = 5       # seconds between pin/unpin actions per user

def _check_rate_limit(username: str) -> bool:
    """Return True if action is allowed, False if rate-limited."""
    now = time.time()
    last = _pin_rate.get(username, 0)
    if now - last < _PIN_COOLDOWN:
        return False
    _pin_rate[username] = now
    return True

# Duration whitelist (minutes) — only these 3 options allowed
ALLOWED_DURATIONS = {
    1440,     # 24 hours
    10080,    # 7 days
    43200,    # 30 days (~1 month)
}


# ══════════════════════════════════════════════════════════════════════════════
# CHANNEL PINS
# ══════════════════════════════════════════════════════════════════════════════

@pins_bp.route('/channel/<int:channel_id>', methods=['GET'])
@jwt_required()
def get_pinned_messages(channel_id):
    """Get all pinned messages for a channel, newest pin first."""
    conn = None
    try:
        username = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404

            # Verify channel access
            cur.execute(
                "SELECT 1 FROM channel_members WHERE channel_id = %s AND user_id = %s",
                (channel_id, user['id'])
            )
            if not cur.fetchone():
                return jsonify({'error': 'Access denied'}), 403

            cur.execute("""
                SELECT 
                    p.id AS pin_id, p.pinned_at, p.expires_at, p.pinned_by,
                    m.id, m.sender_id, m.content, m.message_type, m.created_at,
                    u.username AS author, u.display_name, u.avatar_url,
                    pu.username AS pinned_by_username, pu.display_name AS pinned_by_display_name,
                    a.file_name AS att_file_name, a.file_path AS att_file_url,
                    a.file_size AS att_file_size, a.mime_type AS att_mime_type
                FROM pinned_messages p
                JOIN messages m ON p.message_id = m.id
                JOIN users u ON m.sender_id = u.id
                JOIN users pu ON p.pinned_by = pu.id
                LEFT JOIN attachments a ON a.message_id = m.id
                WHERE p.channel_id = %s
                ORDER BY p.pinned_at DESC
            """, (channel_id,))

            pins = []
            for row in cur.fetchall():
                pin = {
                    'pin_id': row['pin_id'],
                    'pinned_at': row['pinned_at'].isoformat() if row['pinned_at'] else None,
                    'expires_at': row['expires_at'].isoformat() if row.get('expires_at') else None,
                    'pinned_by': {
                        'username': row['pinned_by_username'],
                        'display_name': row['pinned_by_display_name'] or row['pinned_by_username'],
                        'user_id': row['pinned_by'],
                    },
                    'message': {
                        'id': row['id'],
                        'sender_id': row['sender_id'],
                        'content': row['content'],
                        'message_type': row['message_type'],
                        'created_at': row['created_at'].isoformat() if row['created_at'] else None,
                        'author': row['author'],
                        'display_name': row['display_name'] or row['author'],
                        'avatar_url': get_avatar_url(row['author'], row['avatar_url']),
                    }
                }
                if row.get('att_file_name'):
                    pin['message']['attachment'] = {
                        'file_name': row['att_file_name'],
                        'file_url': row['att_file_url'],
                        'file_size': row['att_file_size'],
                        'mime_type': row['att_mime_type'],
                    }
                pins.append(pin)

            count = len(pins)
            return jsonify({'pins': pins, 'count': count}), 200

    except Exception as e:
        log.error(f"[PINS] Get error: {e}", exc_info=True)
        return jsonify({'error': 'Failed to fetch pinned messages'}), 500
    finally:
        if conn:
            conn.close()


@pins_bp.route('/channel/<int:channel_id>/active', methods=['GET'])
@jwt_required()
def get_active_pin(channel_id):
    """Get the single currently-active pinned message for a channel (most recent).
    Returns null if no active pin exists."""
    conn = None
    try:
        username = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404

            cur.execute(
                "SELECT 1 FROM channel_members WHERE channel_id = %s AND user_id = %s",
                (channel_id, user['id'])
            )
            if not cur.fetchone():
                return jsonify({'error': 'Access denied'}), 403

            cur.execute("""
                SELECT 
                    p.id AS pin_id, p.pinned_at, p.expires_at, p.pinned_by,
                    m.id AS message_id, m.sender_id, m.content, m.message_type, m.created_at,
                    u.username AS author, u.display_name, u.avatar_url,
                    pu.username AS pinned_by_username, pu.display_name AS pinned_by_display_name
                FROM pinned_messages p
                JOIN messages m ON p.message_id = m.id
                JOIN users u ON m.sender_id = u.id
                JOIN users pu ON p.pinned_by = pu.id
                WHERE p.channel_id = %s
                  AND (p.expires_at IS NULL OR p.expires_at > NOW())
                ORDER BY p.pinned_at DESC
                LIMIT 1
            """, (channel_id,))
            row = cur.fetchone()

            if not row:
                return jsonify({'pin': None}), 200

            pin = {
                'pin_id': row['pin_id'],
                'pinned_at': row['pinned_at'].isoformat() if row['pinned_at'] else None,
                'expires_at': row['expires_at'].isoformat() if row.get('expires_at') else None,
                'pinned_by': {
                    'username': row['pinned_by_username'],
                    'display_name': row['pinned_by_display_name'] or row['pinned_by_username'],
                    'user_id': row['pinned_by'],
                },
                'message': {
                    'id': row['message_id'],
                    'sender_id': row['sender_id'],
                    'content': row['content'],
                    'message_type': row['message_type'],
                    'created_at': row['created_at'].isoformat() if row['created_at'] else None,
                    'author': row['author'],
                    'display_name': row['display_name'] or row['author'],
                    'avatar_url': get_avatar_url(row['author'], row['avatar_url']),
                }
            }
            return jsonify({'pin': pin}), 200

    except Exception as e:
        log.error(f"[PINS] Active pin error: {e}", exc_info=True)
        return jsonify({'error': 'Failed to fetch active pin'}), 500
    finally:
        if conn:
            conn.close()


@pins_bp.route('/pin', methods=['POST'])
@jwt_required()
def pin_message():
    """Pin a message with a required duration timer.
    Only ONE active pin per channel — previous pin is auto-unpinned.
    Any community member can pin. Only the pinner can unpin."""
    conn = None
    try:
        data = request.get_json()
        message_id = data.get('message_id')
        channel_id = data.get('channel_id')
        duration_minutes = data.get('duration_minutes')

        if not message_id or not channel_id:
            return jsonify({'error': 'message_id and channel_id required'}), 400

        # Validate duration is one of the allowed options
        if not duration_minutes or int(duration_minutes) not in ALLOWED_DURATIONS:
            return jsonify({'error': 'Valid duration required: 1440, 10080, or 43200 minutes'}), 400
        duration_minutes = int(duration_minutes)

        username = get_jwt_identity()

        # Rate limit check
        if not _check_rate_limit(username):
            return jsonify({'error': 'Please wait a few seconds before pinning again'}), 429

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404
            user_id = user['id']

            # Verify user is a member of the channel's community
            cur.execute("""
                SELECT cm.role FROM community_members cm
                JOIN channels ch ON ch.community_id = cm.community_id
                WHERE ch.id = %s AND cm.user_id = %s
            """, (channel_id, user_id))
            membership = cur.fetchone()
            if not membership:
                return jsonify({'error': 'You must be a community member to pin messages'}), 403

            # Verify message belongs to channel and is not deleted
            cur.execute(
                "SELECT id, sender_id, content FROM messages WHERE id = %s AND channel_id = %s",
                (message_id, channel_id)
            )
            msg_row = cur.fetchone()
            if not msg_row:
                return jsonify({'error': 'Message not found in this channel'}), 404

            # Check if this message is already pinned
            cur.execute(
                "SELECT id FROM pinned_messages WHERE channel_id = %s AND message_id = %s",
                (channel_id, message_id)
            )
            if cur.fetchone():
                return jsonify({'error': 'Message is already pinned'}), 409

            # ── Auto-unpin any existing active pin in this channel ──
            cur.execute("""
                SELECT id, message_id FROM pinned_messages WHERE channel_id = %s
                ORDER BY pinned_at DESC
            """, (channel_id,))
            existing_pins = cur.fetchall()
            for old_pin in existing_pins:
                # Cancel timer for old pin
                try:
                    from services.pin_timer import cancel_pin_expiration
                    cancel_pin_expiration(old_pin['id'], 'channel')
                except Exception:
                    pass
                # Remove old pin
                cur.execute("DELETE FROM pinned_messages WHERE id = %s", (old_pin['id'],))
                cur.execute("UPDATE messages SET is_pinned = FALSE WHERE id = %s", (old_pin['message_id'],))

                # Notify channel about auto-unpin
                try:
                    from app import socketio
                    socketio.emit('message_unpinned', {
                        'channel_id': channel_id,
                        'message_id': old_pin['message_id'],
                        'reason': 'replaced',
                    }, room=f"channel_{channel_id}", namespace='/')
                except Exception:
                    pass

            # ── Calculate expiration timestamp ──
            expires_at = datetime.now() + timedelta(minutes=duration_minutes)

            # ── Insert new pin ──
            cur.execute("""
                INSERT INTO pinned_messages (channel_id, message_id, pinned_by, expires_at)
                VALUES (%s, %s, %s, %s)
            """, (channel_id, message_id, user_id, expires_at))
            pin_id = cur.lastrowid

            # Update is_pinned flag on message
            cur.execute(
                "UPDATE messages SET is_pinned = TRUE WHERE id = %s",
                (message_id,)
            )
            conn.commit()

            # Schedule timer expiration
            try:
                from services.pin_timer import schedule_pin_expiration
                schedule_pin_expiration(
                    'channel', pin_id, channel_id, message_id, expires_at
                )
            except Exception as timer_err:
                log.warning(f"[PINS] Failed to schedule timer: {timer_err}")

            # Emit socket event for real-time update
            try:
                from app import socketio
                cur2_data = {
                    'channel_id': channel_id,
                    'message_id': message_id,
                    'pin_id': pin_id,
                    'pinned_by': username,
                    'pinned_by_user_id': user_id,
                    'pinned_at': datetime.now().isoformat(),
                    'expires_at': expires_at.isoformat(),
                    'message_content': msg_row['content'][:200] if msg_row['content'] else '',
                    'message_sender_id': msg_row['sender_id'],
                }
                socketio.emit('message_pinned', cur2_data,
                              room=f"channel_{channel_id}", namespace='/')
            except Exception as socket_err:
                log.warning(f"[PINS] Socket emit failed: {socket_err}")

            return jsonify({
                'success': True,
                'message': 'Message pinned',
                'pin_id': pin_id,
                'message_id': message_id,
                'pinned_by': username,
                'pinned_by_user_id': user_id,
                'expires_at': expires_at.isoformat(),
            }), 201

    except Exception as e:
        if 'Duplicate' in str(e):
            return jsonify({'error': 'Message is already pinned'}), 409
        log.error(f"[PINS] Pin error: {e}", exc_info=True)
        return jsonify({'error': 'Failed to pin message'}), 500
    finally:
        if conn:
            conn.close()


@pins_bp.route('/unpin', methods=['POST'])
@jwt_required()
def unpin_message():
    """Unpin a message. Only the user who pinned it can unpin."""
    conn = None
    try:
        data = request.get_json()
        message_id = data.get('message_id')
        channel_id = data.get('channel_id')

        if not message_id or not channel_id:
            return jsonify({'error': 'message_id and channel_id required'}), 400

        username = get_jwt_identity()

        # Rate limit check
        if not _check_rate_limit(username):
            return jsonify({'error': 'Please wait a few seconds before unpinning again'}), 429

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404
            user_id = user['id']

            # Verify user is a member of the channel's community
            cur.execute("""
                SELECT cm.role FROM community_members cm
                JOIN channels ch ON ch.community_id = cm.community_id
                WHERE ch.id = %s AND cm.user_id = %s
            """, (channel_id, user_id))
            membership = cur.fetchone()
            if not membership:
                return jsonify({'error': 'You must be a community member to unpin messages'}), 403

            # ── PERMISSION CHECK: Only the pinner can unpin ──
            cur.execute(
                "SELECT id, pinned_by FROM pinned_messages WHERE channel_id = %s AND message_id = %s",
                (channel_id, message_id)
            )
            pin_row = cur.fetchone()
            if not pin_row:
                return jsonify({'error': 'Message is not pinned'}), 404

            if pin_row['pinned_by'] != user_id:
                return jsonify({'error': 'Only the user who pinned this message can unpin it'}), 403

            pin_id = pin_row['id']

            # Unpin
            cur.execute("DELETE FROM pinned_messages WHERE id = %s", (pin_id,))
            cur.execute("UPDATE messages SET is_pinned = FALSE WHERE id = %s", (message_id,))
            conn.commit()

            # Cancel any pending timer
            try:
                from services.pin_timer import cancel_pin_expiration
                cancel_pin_expiration(pin_id, 'channel')
            except Exception:
                pass

            # Emit socket event
            try:
                from app import socketio
                socketio.emit('message_unpinned', {
                    'channel_id': channel_id,
                    'message_id': message_id,
                }, room=f"channel_{channel_id}", namespace='/')
            except Exception:
                pass

            return jsonify({
                'success': True,
                'message': 'Message unpinned',
                'message_id': message_id,
            }), 200

    except Exception as e:
        log.error(f"[PINS] Unpin error: {e}", exc_info=True)
        return jsonify({'error': 'Failed to unpin message'}), 500
    finally:
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# DM PINNED MESSAGES
# ══════════════════════════════════════════════════════════════════════════════

@pins_bp.route('/dm/<int:other_user_id>', methods=['GET'])
@jwt_required()
def get_dm_pinned_messages(other_user_id):
    """Get all pinned messages in a DM conversation."""
    conn = None
    try:
        username = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404
            user_id = user['id']

            cur.execute("""
                SELECT 
                    dp.id AS pin_id, dp.pinned_at, dp.expires_at, dp.pinned_by,
                    dm.id AS message_id, dm.sender_id, dm.receiver_id,
                    dm.content, dm.message_type, dm.created_at,
                    su.username AS author, su.display_name AS author_display,
                    su.avatar_url AS author_avatar,
                    pu.username AS pinned_by_username, pu.display_name AS pinned_by_display
                FROM dm_pinned_messages dp
                JOIN direct_messages dm ON dp.message_id = dm.id
                JOIN users su ON dm.sender_id = su.id
                JOIN users pu ON dp.pinned_by = pu.id
                WHERE (dp.sender_id = %s AND dp.receiver_id = %s)
                   OR (dp.sender_id = %s AND dp.receiver_id = %s)
                ORDER BY dp.pinned_at DESC
            """, (user_id, other_user_id, other_user_id, user_id))

            pins = []
            for row in cur.fetchall():
                pins.append({
                    'pin_id': row['pin_id'],
                    'pinned_at': row['pinned_at'].isoformat() if row['pinned_at'] else None,
                    'expires_at': row['expires_at'].isoformat() if row.get('expires_at') else None,
                    'pinned_by': {
                        'username': row['pinned_by_username'],
                        'display_name': row['pinned_by_display'] or row['pinned_by_username'],
                        'user_id': row['pinned_by'],
                    },
                    'message': {
                        'id': row['message_id'],
                        'sender_id': row['sender_id'],
                        'receiver_id': row['receiver_id'],
                        'content': row['content'],
                        'message_type': row['message_type'],
                        'created_at': row['created_at'].isoformat() if row['created_at'] else None,
                        'author': row['author'],
                        'display_name': row['author_display'] or row['author'],
                        'avatar_url': get_avatar_url(row['author'], row['author_avatar']),
                    }
                })

        return jsonify({'pins': pins, 'count': len(pins)}), 200

    except Exception as e:
        log.error(f"[DM_PINS] Get error: {e}", exc_info=True)
        return jsonify({'error': 'Failed to fetch DM pinned messages'}), 500
    finally:
        if conn:
            conn.close()


@pins_bp.route('/dm/<int:other_user_id>/active', methods=['GET'])
@jwt_required()
def get_dm_active_pin(other_user_id):
    """Get the single currently-active pinned message for a DM conversation."""
    conn = None
    try:
        username = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404
            user_id = user['id']

            cur.execute("""
                SELECT 
                    dp.id AS pin_id, dp.pinned_at, dp.expires_at, dp.pinned_by,
                    dm.id AS message_id, dm.sender_id, dm.receiver_id,
                    dm.content, dm.message_type, dm.created_at,
                    su.username AS author, su.display_name AS author_display,
                    su.avatar_url AS author_avatar,
                    pu.username AS pinned_by_username, pu.display_name AS pinned_by_display
                FROM dm_pinned_messages dp
                JOIN direct_messages dm ON dp.message_id = dm.id
                JOIN users su ON dm.sender_id = su.id
                JOIN users pu ON dp.pinned_by = pu.id
                WHERE ((dp.sender_id = %s AND dp.receiver_id = %s)
                   OR (dp.sender_id = %s AND dp.receiver_id = %s))
                  AND (dp.expires_at IS NULL OR dp.expires_at > NOW())
                ORDER BY dp.pinned_at DESC
                LIMIT 1
            """, (user_id, other_user_id, other_user_id, user_id))

            row = cur.fetchone()
            if not row:
                return jsonify({'pin': None}), 200

            pin = {
                'pin_id': row['pin_id'],
                'pinned_at': row['pinned_at'].isoformat() if row['pinned_at'] else None,
                'expires_at': row['expires_at'].isoformat() if row.get('expires_at') else None,
                'pinned_by': {
                    'username': row['pinned_by_username'],
                    'display_name': row['pinned_by_display'] or row['pinned_by_username'],
                    'user_id': row['pinned_by'],
                },
                'message': {
                    'id': row['message_id'],
                    'sender_id': row['sender_id'],
                    'receiver_id': row['receiver_id'],
                    'content': row['content'],
                    'message_type': row['message_type'],
                    'created_at': row['created_at'].isoformat() if row['created_at'] else None,
                    'author': row['author'],
                    'display_name': row['author_display'] or row['author'],
                    'avatar_url': get_avatar_url(row['author'], row['author_avatar']),
                }
            }
            return jsonify({'pin': pin}), 200

    except Exception as e:
        log.error(f"[DM_PINS] Active pin error: {e}", exc_info=True)
        return jsonify({'error': 'Failed to fetch active DM pin'}), 500
    finally:
        if conn:
            conn.close()


@pins_bp.route('/dm/pin', methods=['POST'])
@jwt_required()
def pin_dm_message():
    """Pin a direct message with required duration timer.
    Only ONE active pin per DM conversation.
    Either participant can pin. Only the pinner can unpin."""
    conn = None
    try:
        data = request.get_json()
        message_id = data.get('message_id')
        other_user_id = data.get('other_user_id')
        duration_minutes = data.get('duration_minutes')

        if not message_id or not other_user_id:
            return jsonify({'error': 'message_id and other_user_id required'}), 400

        # Validate duration
        if not duration_minutes or int(duration_minutes) not in ALLOWED_DURATIONS:
            return jsonify({'error': 'Valid duration required: 1440, 10080, or 43200 minutes'}), 400
        duration_minutes = int(duration_minutes)

        username = get_jwt_identity()

        if not _check_rate_limit(username):
            return jsonify({'error': 'Please wait a few seconds before pinning again'}), 429

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404
            user_id = user['id']

            # Verify message belongs to this DM conversation
            cur.execute("""
                SELECT id, content FROM direct_messages
                WHERE id = %s
                AND ((sender_id = %s AND receiver_id = %s) OR (sender_id = %s AND receiver_id = %s))
            """, (message_id, user_id, other_user_id, other_user_id, user_id))
            dm_msg = cur.fetchone()
            if not dm_msg:
                return jsonify({'error': 'Message not found in this conversation'}), 404

            # Check if already pinned
            cur.execute("SELECT id FROM dm_pinned_messages WHERE message_id = %s", (message_id,))
            if cur.fetchone():
                return jsonify({'error': 'Message is already pinned'}), 409

            # Consistent ordering for sender/receiver pair
            s_id = min(user_id, other_user_id)
            r_id = max(user_id, other_user_id)

            # ── Auto-unpin any existing active pin in this DM ──
            cur.execute("""
                SELECT id, message_id FROM dm_pinned_messages
                WHERE (sender_id = %s AND receiver_id = %s)
                   OR (sender_id = %s AND receiver_id = %s)
                ORDER BY pinned_at DESC
            """, (s_id, r_id, r_id, s_id))
            existing_pins = cur.fetchall()
            for old_pin in existing_pins:
                try:
                    from services.pin_timer import cancel_pin_expiration
                    cancel_pin_expiration(old_pin['id'], 'dm')
                except Exception:
                    pass
                cur.execute("DELETE FROM dm_pinned_messages WHERE id = %s", (old_pin['id'],))
                # Notify both users about auto-unpin
                try:
                    from app import socketio
                    evt = {
                        'message_id': old_pin['message_id'],
                        'type': 'dm',
                        'sender_id': s_id,
                        'receiver_id': r_id,
                        'reason': 'replaced',
                    }
                    socketio.emit('dm_message_unpinned', evt, room=f"user_{user_id}", namespace='/')
                    socketio.emit('dm_message_unpinned', evt, room=f"user_{other_user_id}", namespace='/')
                except Exception:
                    pass

            # Calculate expiration
            expires_at = datetime.now() + timedelta(minutes=duration_minutes)

            # Insert new pin
            cur.execute("""
                INSERT INTO dm_pinned_messages (sender_id, receiver_id, message_id, pinned_by, expires_at)
                VALUES (%s, %s, %s, %s, %s)
            """, (s_id, r_id, message_id, user_id, expires_at))
            pin_id = cur.lastrowid
            conn.commit()

            # Schedule timer
            try:
                from services.pin_timer import schedule_pin_expiration
                schedule_pin_expiration(
                    'dm', pin_id, None, message_id, expires_at,
                    {'sender_id': s_id, 'receiver_id': r_id}
                )
            except Exception as timer_err:
                log.warning(f"[DM_PINS] Timer schedule failed: {timer_err}")

            # Emit socket event to both users
            try:
                from app import socketio
                event_data = {
                    'message_id': message_id,
                    'pin_id': pin_id,
                    'pinned_by': username,
                    'pinned_by_user_id': user_id,
                    'pinned_at': datetime.now().isoformat(),
                    'expires_at': expires_at.isoformat(),
                    'message_content': dm_msg['content'][:200] if dm_msg['content'] else '',
                    'type': 'dm',
                    'sender_id': s_id,
                    'receiver_id': r_id,
                }
                socketio.emit('dm_message_pinned', event_data,
                             room=f"user_{user_id}", namespace='/')
                socketio.emit('dm_message_pinned', event_data,
                             room=f"user_{other_user_id}", namespace='/')
            except Exception:
                pass

            return jsonify({
                'success': True,
                'message': 'DM message pinned',
                'pin_id': pin_id,
                'message_id': message_id,
                'pinned_by': username,
                'pinned_by_user_id': user_id,
                'expires_at': expires_at.isoformat(),
            }), 201

    except Exception as e:
        if 'Duplicate' in str(e):
            return jsonify({'error': 'Message is already pinned'}), 409
        log.error(f"[DM_PINS] Pin error: {e}", exc_info=True)
        return jsonify({'error': 'Failed to pin DM message'}), 500
    finally:
        if conn:
            conn.close()


@pins_bp.route('/dm/unpin', methods=['POST'])
@jwt_required()
def unpin_dm_message():
    """Unpin a direct message. Only the user who pinned it can unpin."""
    conn = None
    try:
        data = request.get_json()
        message_id = data.get('message_id')
        other_user_id = data.get('other_user_id')

        if not message_id or not other_user_id:
            return jsonify({'error': 'message_id and other_user_id required'}), 400

        username = get_jwt_identity()

        if not _check_rate_limit(username):
            return jsonify({'error': 'Please wait a few seconds before unpinning again'}), 429

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404
            user_id = user['id']

            # ── PERMISSION CHECK: Only the pinner can unpin ──
            cur.execute("""
                SELECT id, pinned_by FROM dm_pinned_messages WHERE message_id = %s
            """, (message_id,))
            pin_row = cur.fetchone()
            if not pin_row:
                return jsonify({'error': 'Message is not pinned'}), 404

            if pin_row['pinned_by'] != user_id:
                return jsonify({'error': 'Only the user who pinned this message can unpin it'}), 403

            pin_id = pin_row['id']

            # Delete pin
            cur.execute("DELETE FROM dm_pinned_messages WHERE id = %s", (pin_id,))
            conn.commit()

            # Cancel timer
            try:
                from services.pin_timer import cancel_pin_expiration
                cancel_pin_expiration(pin_id, 'dm')
            except Exception:
                pass

            # Emit socket event
            s_id = min(user_id, other_user_id)
            r_id = max(user_id, other_user_id)
            try:
                from app import socketio
                event_data = {
                    'message_id': message_id,
                    'type': 'dm',
                    'sender_id': s_id,
                    'receiver_id': r_id,
                }
                socketio.emit('dm_message_unpinned', event_data,
                             room=f"user_{user_id}", namespace='/')
                socketio.emit('dm_message_unpinned', event_data,
                             room=f"user_{other_user_id}", namespace='/')
            except Exception:
                pass

            return jsonify({
                'success': True,
                'message': 'DM message unpinned',
                'message_id': message_id,
            }), 200

    except Exception as e:
        log.error(f"[DM_PINS] Unpin error: {e}", exc_info=True)
        return jsonify({'error': 'Failed to unpin DM message'}), 500
    finally:
        if conn:
            conn.close()
