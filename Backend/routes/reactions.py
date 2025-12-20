# ============================================================================
# routes/reactions.py - Message Reactions API
# Handles emoji reactions for both community messages and direct messages
# ============================================================================

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
import logging
from database import get_db_connection

reactions_bp = Blueprint('reactions', __name__)

# ============================================================================
# COMMUNITY MESSAGE REACTIONS
# ============================================================================

@reactions_bp.route('/api/messages/<int:message_id>/reactions', methods=['GET'])
@jwt_required()
def get_message_reactions(message_id):
    """Get all reactions for a community message"""
    conn = None
    try:
        current_user = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 
                    mr.id,
                    mr.emoji,
                    mr.user_id,
                    u.username,
                    u.display_name,
                    u.avatar_url,
                    mr.created_at
                FROM message_reactions mr
                JOIN users u ON mr.user_id = u.id
                WHERE mr.message_id = %s
                ORDER BY mr.created_at ASC
            """, (message_id,))
            
            reactions = cur.fetchall()
            
            # Group reactions by emoji
            reactions_grouped = {}
            for reaction in reactions:
                emoji = reaction['emoji']
                if emoji not in reactions_grouped:
                    reactions_grouped[emoji] = {
                        'emoji': emoji,
                        'count': 0,
                        'users': [],
                        'reacted_by_current_user': False
                    }
                
                reactions_grouped[emoji]['count'] += 1
                reactions_grouped[emoji]['users'].append({
                    'user_id': reaction['user_id'],
                    'username': reaction['username'],
                    'display_name': reaction['display_name'],
                    'avatar_url': reaction['avatar_url']
                })
                
                if reaction['username'] == current_user:
                    reactions_grouped[emoji]['reacted_by_current_user'] = True
            
            return jsonify({
                'reactions': list(reactions_grouped.values())
            }), 200
            
    except Exception as e:
        logging.error(f"Error fetching message reactions: {str(e)}")
        return jsonify({'error': 'Failed to fetch reactions'}), 500
    finally:
        if conn:
            conn.close()

@reactions_bp.route('/api/messages/<int:message_id>/reactions', methods=['POST'])
@jwt_required()
def add_message_reaction(message_id):
    """Add a reaction to a community message"""
    conn = None
    try:
        current_user = get_jwt_identity()
        data = request.json
        emoji = data.get('emoji')
        
        if not emoji:
            return jsonify({'error': 'Emoji is required'}), 400
        
        conn = get_db_connection()
        
        # Get user_id
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (current_user,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404
            user_id = user['id']
            
            # Check if reaction already exists
            cur.execute("""
                SELECT id FROM message_reactions 
                WHERE message_id = %s AND user_id = %s AND emoji = %s
            """, (message_id, user_id, emoji))
            
            existing_reaction = cur.fetchone()
            
            if existing_reaction:
                # Remove reaction (toggle off)
                cur.execute("""
                    DELETE FROM message_reactions 
                    WHERE message_id = %s AND user_id = %s AND emoji = %s
                """, (message_id, user_id, emoji))
                conn.commit()
                return jsonify({
                    'message': 'Reaction removed',
                    'action': 'removed'
                }), 200
            else:
                # Add reaction
                cur.execute("""
                    INSERT INTO message_reactions (message_id, user_id, emoji)
                    VALUES (%s, %s, %s)
                """, (message_id, user_id, emoji))
                conn.commit()
                
                return jsonify({
                    'message': 'Reaction added',
                    'action': 'added',
                    'reaction': {
                        'emoji': emoji,
                        'user_id': user_id,
                        'username': current_user
                    }
                }), 201
            
    except Exception as e:
        logging.error(f"Error adding message reaction: {str(e)}")
        return jsonify({'error': 'Failed to add reaction'}), 500
    finally:
        if conn:
            conn.close()

@reactions_bp.route('/api/messages/<int:message_id>/reactions/<emoji>', methods=['DELETE'])
@jwt_required()
def remove_message_reaction(message_id, emoji):
    """Remove a reaction from a community message"""
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
            
            cur.execute("""
                DELETE FROM message_reactions 
                WHERE message_id = %s AND user_id = %s AND emoji = %s
            """, (message_id, user_id, emoji))
            
            conn.commit()
            
            if cur.rowcount == 0:
                return jsonify({'error': 'Reaction not found'}), 404
            
            return jsonify({'message': 'Reaction removed'}), 200
            
    except Exception as e:
        logging.error(f"Error removing message reaction: {str(e)}")
        return jsonify({'error': 'Failed to remove reaction'}), 500
    finally:
        if conn:
            conn.close()

# ============================================================================
# DIRECT MESSAGE REACTIONS
# ============================================================================

@reactions_bp.route('/api/direct-messages/<int:dm_id>/reactions', methods=['GET'])
@jwt_required()
def get_dm_reactions(dm_id):
    """Get all reactions for a direct message"""
    conn = None
    try:
        current_user = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 
                    dmr.id,
                    dmr.emoji,
                    dmr.user_id,
                    u.username,
                    u.display_name,
                    u.avatar_url,
                    dmr.created_at
                FROM direct_message_reactions dmr
                JOIN users u ON dmr.user_id = u.id
                WHERE dmr.direct_message_id = %s
                ORDER BY dmr.created_at ASC
            """, (dm_id,))
            
            reactions = cur.fetchall()
            
            # Group reactions by emoji
            reactions_grouped = {}
            for reaction in reactions:
                emoji = reaction['emoji']
                if emoji not in reactions_grouped:
                    reactions_grouped[emoji] = {
                        'emoji': emoji,
                        'count': 0,
                        'users': [],
                        'reacted_by_current_user': False
                    }
                
                reactions_grouped[emoji]['count'] += 1
                reactions_grouped[emoji]['users'].append({
                    'user_id': reaction['user_id'],
                    'username': reaction['username'],
                    'display_name': reaction['display_name'],
                    'avatar_url': reaction['avatar_url']
                })
                
                if reaction['username'] == current_user:
                    reactions_grouped[emoji]['reacted_by_current_user'] = True
            
            return jsonify({
                'reactions': list(reactions_grouped.values())
            }), 200
            
    except Exception as e:
        logging.error(f"Error fetching DM reactions: {str(e)}")
        return jsonify({'error': 'Failed to fetch reactions'}), 500
    finally:
        if conn:
            conn.close()

@reactions_bp.route('/api/direct-messages/<int:dm_id>/reactions', methods=['POST'])
@jwt_required()
def add_dm_reaction(dm_id):
    """Add a reaction to a direct message"""
    conn = None
    try:
        current_user = get_jwt_identity()
        data = request.json
        emoji = data.get('emoji')
        
        if not emoji:
            return jsonify({'error': 'Emoji is required'}), 400
        
        conn = get_db_connection()
        
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (current_user,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404
            user_id = user['id']
            
            # Check if reaction already exists
            cur.execute("""
                SELECT id FROM direct_message_reactions 
                WHERE direct_message_id = %s AND user_id = %s AND emoji = %s
            """, (dm_id, user_id, emoji))
            
            existing_reaction = cur.fetchone()
            
            if existing_reaction:
                # Remove reaction (toggle off)
                cur.execute("""
                    DELETE FROM direct_message_reactions 
                    WHERE direct_message_id = %s AND user_id = %s AND emoji = %s
                """, (dm_id, user_id, emoji))
                conn.commit()
                return jsonify({
                    'message': 'Reaction removed',
                    'action': 'removed'
                }), 200
            else:
                # Add reaction
                cur.execute("""
                    INSERT INTO direct_message_reactions (direct_message_id, user_id, emoji)
                    VALUES (%s, %s, %s)
                """, (dm_id, user_id, emoji))
                conn.commit()
                
                return jsonify({
                    'message': 'Reaction added',
                    'action': 'added',
                    'reaction': {
                        'emoji': emoji,
                        'user_id': user_id,
                        'username': current_user
                    }
                }), 201
            
    except Exception as e:
        logging.error(f"Error adding DM reaction: {str(e)}")
        return jsonify({'error': 'Failed to add reaction'}), 500
    finally:
        if conn:
            conn.close()

@reactions_bp.route('/api/direct-messages/<int:dm_id>/reactions/<emoji>', methods=['DELETE'])
@jwt_required()
def remove_dm_reaction(dm_id, emoji):
    """Remove a reaction from a direct message"""
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
            
            cur.execute("""
                DELETE FROM direct_message_reactions 
                WHERE direct_message_id = %s AND user_id = %s AND emoji = %s
            """, (dm_id, user_id, emoji))
            
            conn.commit()
            
            if cur.rowcount == 0:
                return jsonify({'error': 'Reaction not found'}), 404
            
            return jsonify({'message': 'Reaction removed'}), 200
            
    except Exception as e:
        logging.error(f"Error removing DM reaction: {str(e)}")
        return jsonify({'error': 'Failed to remove reaction'}), 500
    finally:
        if conn:
            conn.close()
