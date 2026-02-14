# ============================================================================
# routes/reactions.py - Optimized Message Reactions API
#
# Changes from original:
#   1.  All reads go through reaction_cache (in-memory, thread-safe, TTL).
#   2.  Toggle writes through reaction_cache.toggle_reaction() which does
#       one DB round-trip, rebuilds aggregation, and updates cache — the
#       response already contains the full grouped reactions so the frontend
#       never needs a follow-up GET.
#   3.  NEW bulk endpoint: POST /api/messages/reactions/bulk  — accepts a
#       list of message IDs and returns all their reactions in ONE query,
#       eliminating the N+1 waterfall on page load.
#   4.  Per-user rate limiting: max 10 toggles / 5 seconds (in-memory).
#   5.  username→user_id is resolved once per request via JWT + single query.
# ============================================================================

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
import logging
import time
import threading
from database import get_db_connection
from services.reaction_cache import (
    get_reactions,
    get_reactions_bulk,
    toggle_reaction,
)

reactions_bp = Blueprint('reactions', __name__)
log = logging.getLogger(__name__)

# ── Per-user rate limiter (in-memory) ──────────────────────────────────
_rate_lock = threading.Lock()
_rate_buckets: dict = {}          # username -> [timestamps]
RATE_WINDOW = 5                   # seconds
RATE_MAX = 10                     # max toggles per window


def _check_rate(username: str) -> bool:
    """Return True if within limits."""
    now = time.time()
    with _rate_lock:
        bucket = _rate_buckets.setdefault(username, [])
        # Prune old entries
        _rate_buckets[username] = bucket = [
            t for t in bucket if now - t < RATE_WINDOW
        ]
        if len(bucket) >= RATE_MAX:
            return False
        bucket.append(now)
        return True


def _resolve_user(username: str):
    """Resolve username to user_id.  Returns (user_id, error_response)."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            row = cur.fetchone()
            if not row:
                return None, (jsonify({'error': 'User not found'}), 404)
            return row['id'], None
    finally:
        conn.close()


# ============================================================================
# COMMUNITY MESSAGE REACTIONS
# ============================================================================

@reactions_bp.route('/api/messages/<int:message_id>/reactions', methods=['GET'])
@jwt_required()
def get_message_reactions(message_id):
    """Get grouped reactions for a community message (cached)."""
    try:
        current_user = get_jwt_identity()
        reactions = get_reactions("msg", message_id, current_user)
        return jsonify({'reactions': reactions}), 200
    except Exception as e:
        log.error(f"Error fetching message reactions: {e}")
        return jsonify({'error': 'Failed to fetch reactions'}), 500


@reactions_bp.route('/api/messages/reactions/bulk', methods=['POST'])
@jwt_required()
def get_message_reactions_bulk():
    """
    Bulk-fetch reactions for multiple messages in ONE query.
    Body: { "message_ids": [1, 2, 3, ...] }
    Response: { "reactions": { "1": [...], "2": [...] } }
    """
    try:
        current_user = get_jwt_identity()
        data = request.get_json() or {}
        message_ids = data.get('message_ids', [])

        if not message_ids or not isinstance(message_ids, list):
            return jsonify({'reactions': {}}), 200

        # Cap to prevent abuse
        message_ids = message_ids[:200]

        bulk = get_reactions_bulk("msg", message_ids, current_user)
        # JSON keys must be strings
        return jsonify({
            'reactions': {str(k): v for k, v in bulk.items()}
        }), 200
    except Exception as e:
        log.error(f"Error bulk-fetching message reactions: {e}")
        return jsonify({'error': 'Failed to fetch reactions'}), 500


@reactions_bp.route('/api/messages/<int:message_id>/reactions', methods=['POST'])
@jwt_required()
def add_message_reaction(message_id):
    """Toggle a reaction on a community message.  Returns fresh aggregation."""
    try:
        current_user = get_jwt_identity()

        if not _check_rate(current_user):
            return jsonify({'error': 'Too many reactions, slow down'}), 429

        data = request.json
        emoji = data.get('emoji') if data else None
        if not emoji:
            return jsonify({'error': 'Emoji is required'}), 400

        user_id, err = _resolve_user(current_user)
        if err:
            return err

        result = toggle_reaction("msg", message_id, user_id, emoji, current_user)

        status = 200 if result['action'] == 'removed' else 201
        return jsonify({
            'message': f"Reaction {result['action']}",
            'action': result['action'],
            'reactions': result['reactions'],
            'reaction': {
                'emoji': emoji,
                'user_id': user_id,
                'username': current_user,
            },
        }), status

    except Exception as e:
        log.error(f"Error toggling message reaction: {e}")
        return jsonify({'error': 'Failed to toggle reaction'}), 500


@reactions_bp.route('/api/messages/<int:message_id>/reactions/<emoji>', methods=['DELETE'])
@jwt_required()
def remove_message_reaction(message_id, emoji):
    """Explicitly remove a reaction from a community message."""
    try:
        current_user = get_jwt_identity()
        user_id, err = _resolve_user(current_user)
        if err:
            return err

        # Use toggle which checks existence first
        result = toggle_reaction("msg", message_id, user_id, emoji, current_user)
        if result['action'] == 'added':
            # Was not present, toggle added it — undo
            toggle_reaction("msg", message_id, user_id, emoji, current_user)
            return jsonify({'error': 'Reaction not found'}), 404

        return jsonify({
            'message': 'Reaction removed',
            'reactions': result['reactions'],
        }), 200

    except Exception as e:
        log.error(f"Error removing message reaction: {e}")
        return jsonify({'error': 'Failed to remove reaction'}), 500


# ============================================================================
# DIRECT MESSAGE REACTIONS
# ============================================================================

@reactions_bp.route('/api/direct-messages/<int:dm_id>/reactions', methods=['GET'])
@jwt_required()
def get_dm_reactions(dm_id):
    """Get grouped reactions for a direct message (cached)."""
    try:
        current_user = get_jwt_identity()
        reactions = get_reactions("dm", dm_id, current_user)
        return jsonify({'reactions': reactions}), 200
    except Exception as e:
        log.error(f"Error fetching DM reactions: {e}")
        return jsonify({'error': 'Failed to fetch reactions'}), 500


@reactions_bp.route('/api/direct-messages/reactions/bulk', methods=['POST'])
@jwt_required()
def get_dm_reactions_bulk():
    """
    Bulk-fetch reactions for multiple DMs in ONE query.
    Body: { "message_ids": [1, 2, 3, ...] }
    """
    try:
        current_user = get_jwt_identity()
        data = request.get_json() or {}
        message_ids = data.get('message_ids', [])

        if not message_ids or not isinstance(message_ids, list):
            return jsonify({'reactions': {}}), 200

        message_ids = message_ids[:200]

        bulk = get_reactions_bulk("dm", message_ids, current_user)
        return jsonify({
            'reactions': {str(k): v for k, v in bulk.items()}
        }), 200
    except Exception as e:
        log.error(f"Error bulk-fetching DM reactions: {e}")
        return jsonify({'error': 'Failed to fetch reactions'}), 500


@reactions_bp.route('/api/direct-messages/<int:dm_id>/reactions', methods=['POST'])
@jwt_required()
def add_dm_reaction(dm_id):
    """Toggle a reaction on a direct message.  Returns fresh aggregation."""
    try:
        current_user = get_jwt_identity()

        if not _check_rate(current_user):
            return jsonify({'error': 'Too many reactions, slow down'}), 429

        data = request.json
        emoji = data.get('emoji') if data else None
        if not emoji:
            return jsonify({'error': 'Emoji is required'}), 400

        user_id, err = _resolve_user(current_user)
        if err:
            return err

        result = toggle_reaction("dm", dm_id, user_id, emoji, current_user)

        status = 200 if result['action'] == 'removed' else 201
        return jsonify({
            'message': f"Reaction {result['action']}",
            'action': result['action'],
            'reactions': result['reactions'],
            'reaction': {
                'emoji': emoji,
                'user_id': user_id,
                'username': current_user,
            },
        }), status

    except Exception as e:
        log.error(f"Error toggling DM reaction: {e}")
        return jsonify({'error': 'Failed to toggle reaction'}), 500


@reactions_bp.route('/api/direct-messages/<int:dm_id>/reactions/<emoji>', methods=['DELETE'])
@jwt_required()
def remove_dm_reaction(dm_id, emoji):
    """Explicitly remove a reaction from a direct message."""
    try:
        current_user = get_jwt_identity()
        user_id, err = _resolve_user(current_user)
        if err:
            return err

        result = toggle_reaction("dm", dm_id, user_id, emoji, current_user)
        if result['action'] == 'added':
            toggle_reaction("dm", dm_id, user_id, emoji, current_user)
            return jsonify({'error': 'Reaction not found'}), 404

        return jsonify({
            'message': 'Reaction removed',
            'reactions': result['reactions'],
        }), 200

    except Exception as e:
        log.error(f"Error removing DM reaction: {e}")
        return jsonify({'error': 'Failed to remove reaction'}), 500
