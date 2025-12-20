"""
AI Agents API Routes
====================
RESTful endpoints for AI agent functionalities
"""

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import get_db_connection

# Import agents
from agents.summarizer import SummarizerAgent
from agents.mood_tracker import MoodTrackerAgent

# Create blueprint
agents_bp = Blueprint('agents', __name__, url_prefix='/api/agents')

# Initialize agents
summarizer = SummarizerAgent()
mood_tracker = MoodTrackerAgent()


# =====================================
# SUMMARIZER AGENT ROUTES
# =====================================

@agents_bp.route('/summarize/channel/<int:channel_id>', methods=['POST'])
@jwt_required()
def summarize_channel(channel_id):
    """
    Generate summary for a channel's recent messages
    
    Body (optional):
        - message_count: Number of messages to analyze (default: 100)
    
    Returns:
        Summary with key points and metadata
    """
    try:
        username = get_jwt_identity()
        
        # Get user ID
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']
            
            # Check channel access
            cur.execute("""
                SELECT 1 FROM channel_members 
                WHERE channel_id = %s AND user_id = %s
            """, (channel_id, user_id))
            
            if not cur.fetchone():
                return jsonify({'error': 'Access denied to this channel'}), 403
        
        conn.close()
        
        # Get parameters
        data = request.get_json() or {}
        message_count = min(data.get('message_count', 100), 200)  # Max 200 messages
        
        # Generate summary
        result = summarizer.summarize_channel(
            channel_id=channel_id,
            message_count=message_count,
            user_id=user_id
        )
        
        if result['success']:
            return jsonify({
                'success': True,
                'summary_id': result['summary_id'],
                'summary': result['summary'],
                'key_points': result.get('key_points', []),
                'message_count': result['message_count'],
                'participants': result.get('participants', []),
                'time_range': result.get('time_range')
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to generate summary')
            }), 400
            
    except Exception as e:
        print(f"[AGENTS API] Error in summarize_channel: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/summaries/channel/<int:channel_id>', methods=['GET'])
@jwt_required()
def get_channel_summaries(channel_id):
    """
    Get recent summaries for a channel
    
    Query params:
        - limit: Maximum number of summaries (default: 5)
    
    Returns:
        List of recent summaries
    """
    try:
        username = get_jwt_identity()
        
        # Get user ID and check access
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']
            
            # Check channel access
            cur.execute("""
                SELECT 1 FROM channel_members 
                WHERE channel_id = %s AND user_id = %s
            """, (channel_id, user_id))
            
            if not cur.fetchone():
                return jsonify({'error': 'Access denied to this channel'}), 403
        
        conn.close()
        
        # Get limit parameter
        limit = min(request.args.get('limit', 5, type=int), 20)
        
        # Fetch summaries
        summaries = summarizer.get_recent_summaries(channel_id, limit)
        
        return jsonify({
            'success': True,
            'summaries': summaries,
            'count': len(summaries)
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_channel_summaries: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/summary/<int:summary_id>', methods=['GET'])
@jwt_required()
def get_summary(summary_id):
    """
    Get a specific summary by ID
    
    Returns:
        Summary details
    """
    try:
        username = get_jwt_identity()
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get user ID
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']
            
            # Get summary with access check
            cur.execute("""
                SELECT 
                    cs.id, cs.channel_id, cs.summary,
                    cs.generated_by, cs.created_at
                FROM conversation_summaries cs
                JOIN channel_members cm ON cs.channel_id = cm.channel_id
                WHERE cs.id = %s AND cm.user_id = %s
            """, (summary_id, user_id))
            
            summary = cur.fetchone()
            
            if not summary:
                return jsonify({'error': 'Summary not found or access denied'}), 404
            
            return jsonify({
                'success': True,
                'summary': {
                    'id': summary['id'],
                    'channel_id': summary['channel_id'],
                    'summary': summary['summary'],
                    'created_at': summary['created_at'].isoformat() if summary['created_at'] else None,
                    'created_by': summary['generated_by']
                }
            }), 200
            
    except Exception as e:
        print(f"[AGENTS API] Error in get_summary: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# HEALTH CHECK
# =====================================

@agents_bp.route('/health', methods=['GET'])
def health_check():
    """Check if AI agents are operational"""
    return jsonify({
        'success': True,
        'agents': {
            'summarizer': 'active',
            'mood_tracker': 'active',
            'moderation': 'pending',
            'wellness': 'pending',
            'engagement': 'pending',
            'knowledge_builder': 'pending',
            'focus': 'pending'
        }
    }), 200


# =====================================
# MOOD TRACKING ENDPOINTS
# =====================================

@agents_bp.route('/mood/track/<int:user_id>', methods=['POST'])
@jwt_required()
def track_mood(user_id):
    """
    Track a user's mood over a time period
    
    Request body:
        - time_period_hours: Hours to analyze (default: 24)
    
    Returns:
        Mood analysis with trends and insights
    """
    try:
        username = get_jwt_identity()
        
        # Get requesting user's ID
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            requester = cur.fetchone()
            if not requester:
                return jsonify({'error': 'User not found'}), 404
            
            # Users can only track their own mood (privacy)
            if requester['id'] != user_id:
                return jsonify({'error': 'Unauthorized'}), 403
        
        conn.close()
        
        # Get time period from request
        data = request.get_json() or {}
        time_period = data.get('time_period_hours', 24)
        
        # Track mood
        result = mood_tracker.track_user_mood(user_id, time_period)
        
        if result.get('success'):
            return jsonify(result), 200
        else:
            return jsonify(result), 400
            
    except Exception as e:
        print(f"[AGENTS API] Error in track_mood: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/mood/history/<int:user_id>', methods=['GET'])
@jwt_required()
def get_mood_history(user_id):
    """
    Get user's mood history
    
    Query params:
        - limit: Number of records (default: 10)
    
    Returns:
        List of mood analyses
    """
    try:
        username = get_jwt_identity()
        
        # Get requesting user's ID
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            requester = cur.fetchone()
            if not requester:
                return jsonify({'error': 'User not found'}), 404
            
            # Users can only view their own mood history
            if requester['id'] != user_id:
                return jsonify({'error': 'Unauthorized'}), 403
        
        conn.close()
        
        # Get limit from query params
        limit = request.args.get('limit', 10, type=int)
        
        # Get mood history
        history = mood_tracker.get_mood_history(user_id, limit)
        
        return jsonify({
            'success': True,
            'mood_history': history,
            'count': len(history)
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_mood_history: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/mood/analyze-message', methods=['POST'])
@jwt_required()
def analyze_message():
    """
    Analyze sentiment of a single message
    
    Request body:
        - text: Message text to analyze
    
    Returns:
        Sentiment analysis results
    """
    try:
        data = request.get_json()
        
        if not data or 'text' not in data:
            return jsonify({'error': 'Message text is required'}), 400
        
        text = data['text']
        
        # Analyze the message
        result = mood_tracker.analyze_message(text)
        
        return jsonify({
            'success': True,
            'analysis': result
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in analyze_message: {e}")
        return jsonify({'error': 'Internal server error'}), 500
