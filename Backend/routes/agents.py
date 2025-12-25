"""
AI Agents API Routes
====================
RESTful endpoints for AI agent functionalities
"""

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import get_db_connection
import json

# Import agents
from agents.summarizer import SummarizerAgent
from agents.mood_tracker import MoodTrackerAgent
from agents.moderation import ModerationAgent

# Create blueprint
agents_bp = Blueprint('agents', __name__, url_prefix='/api/agents')

# Initialize agents
summarizer = SummarizerAgent()
mood_tracker = MoodTrackerAgent()
moderation_agent = ModerationAgent()


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


# =====================================
# MODERATION AGENT ROUTES
# =====================================

@agents_bp.route('/moderation/check', methods=['POST'])
@jwt_required()
def check_moderation():
    """Check message for moderation"""
    try:
        username = get_jwt_identity()
        data = request.get_json()
        
        if not data or 'text' not in data:
            return jsonify({'error': 'Message text is required'}), 400
        
        text = data.get('text')
        channel_id = data.get('channel_id', 0)
        
        # Get user ID
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']
        conn.close()
        
        # Run moderation
        result = moderation_agent.moderate_message(text, user_id, channel_id)
        
        return jsonify({
            'success': True,
            'moderation': result
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in check_moderation: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/moderation/history', methods=['GET'])
@jwt_required()
def get_moderation_history():
    """Get moderation action history (OWNER ONLY, community-scoped)"""
    try:
        username = get_jwt_identity()
        limit = request.args.get('limit', 10, type=int)
        community_id = request.args.get('community_id', type=int)
        channel_id = request.args.get('channel_id', type=int)
        
        if not community_id:
            return jsonify({'error': 'community_id is required'}), 400
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get user ID
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']
            
            # OWNER-ONLY CHECK: Only community owners can view moderation logs
            cur.execute("""
                SELECT role FROM community_members
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            
            member = cur.fetchone()
            if not member or member['role'] != 'owner':
                return jsonify({'error': 'Access denied. Only community owners can view moderation logs.'}), 403
            
            # Build query with community and optional channel filtering
            query = """
                SELECT 
                    l.id, l.input_text, l.output_text, l.confidence_score,
                    l.created_at, l.message_id,
                    u.username, u.display_name,
                    c.name as channel_name, c.id as channel_id
                FROM ai_agent_logs l
                LEFT JOIN users u ON l.user_id = u.id
                LEFT JOIN channels c ON l.channel_id = c.id
                WHERE l.action_type = 'moderation'
                    AND c.community_id = %s
            """
            params = [community_id]
            
            if channel_id:
                query += " AND l.channel_id = %s"
                params.append(channel_id)
            
            query += " ORDER BY l.created_at DESC LIMIT %s"
            params.append(limit)
            
            cur.execute(query, params)
            logs = cur.fetchall()
            
            history = []
            for log in logs:
                try:
                    output_data = json.loads(log['output_text']) if log['output_text'] else {}
                except:
                    output_data = {}
                
                history.append({
                    'id': log['id'],
                    'message': log['input_text'][:100] + '...' if len(log['input_text'] or '') > 100 else log['input_text'],
                    'action': output_data.get('action', 'unknown'),
                    'severity': output_data.get('severity', 'none'),
                    'reasons': output_data.get('reasons', []),
                    'confidence': log['confidence_score'],
                    'timestamp': log['created_at'].isoformat() if log['created_at'] else None,
                    'message_id': log['message_id'],
                    'user': {
                        'username': log['username'],
                        'display_name': log['display_name']
                    },
                    'channel': {
                        'id': log['channel_id'],
                        'name': log['channel_name']
                    }
                })
        
        conn.close()
        
        return jsonify({
            'success': True,
            'history': history,
            'count': len(history)
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_moderation_history: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/moderation/stats', methods=['GET'])
@jwt_required()
def get_moderation_stats():
    """Get moderation statistics (OWNER ONLY, community-scoped)"""
    try:
        username = get_jwt_identity()
        days = request.args.get('days', 7, type=int)
        community_id = request.args.get('community_id', type=int)
        
        if not community_id:
            return jsonify({'error': 'community_id is required'}), 400
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get user ID
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']
            
            # OWNER-ONLY CHECK
            cur.execute("""
                SELECT role FROM community_members
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            
            member = cur.fetchone()
            if not member or member['role'] != 'owner':
                return jsonify({'error': 'Access denied. Only community owners can view moderation stats.'}), 403
            
            # Get stats for the last N days from ai_agent_logs (community-scoped)
            cur.execute("""
                SELECT COUNT(*) as total_checked
                FROM ai_agent_logs l
                JOIN channels c ON l.channel_id = c.id
                WHERE l.action_type = 'moderation'
                    AND c.community_id = %s
                    AND l.created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
            """, (community_id, days))
            
            stats_row = cur.fetchone()
            total_checked = stats_row['total_checked'] or 0
            
            # Parse output_text to get action counts
            cur.execute("""
                SELECT l.output_text
                FROM ai_agent_logs l
                JOIN channels c ON l.channel_id = c.id
                WHERE l.action_type = 'moderation'
                    AND c.community_id = %s
                    AND l.created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
            """, (community_id, days))
            
            rows = cur.fetchall()
            
            blocked = 0
            flagged = 0
            warned = 0
            reasons_count = {}
            
            for row in rows:
                try:
                    data = json.loads(row['output_text']) if row['output_text'] else {}
                    action = data.get('action', 'allow')
                    
                    if action == 'block':
                        blocked += 1
                    elif action == 'flag':
                        flagged += 1
                    elif action == 'warn':
                        warned += 1
                    
                    # Count reasons
                    for reason in data.get('reasons', []):
                        reasons_count[reason] = reasons_count.get(reason, 0) + 1
                except:
                    pass
        
        conn.close()
        
        stats = {
            'total_messages_checked': total_checked,
            'flagged_messages': flagged,
            'blocked_messages': blocked,
            'warnings_issued': warned,
            'reasons_breakdown': reasons_count
        }
        
        return jsonify({
            'success': True,
            'stats': stats
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_moderation_stats: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500


# =====================================
# ENGAGEMENT AGENT ROUTES
# =====================================

@agents_bp.route('/engagement/metrics/<int:channel_id>', methods=['GET'])
@jwt_required()
def get_engagement_metrics(channel_id):
    """Get engagement metrics for a channel"""
    try:
        username = get_jwt_identity()
        days = request.args.get('days', 7, type=int)
        
        # Check access
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']
            
            cur.execute("""
                SELECT 1 FROM channel_members 
                WHERE channel_id = %s AND user_id = %s
            """, (channel_id, user_id))
            
            if not cur.fetchone():
                return jsonify({'error': 'Access denied'}), 403
        
        conn.close()
        
        # Mock data for now
        return jsonify({
            'success': True,
            'metrics': {
                'total_messages': 0,
                'active_users': 0,
                'average_response_time': 0,
                'engagement_score': 0
            }
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_engagement_metrics: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/engagement/trends/<int:channel_id>', methods=['GET'])
@jwt_required()
def get_engagement_trends(channel_id):
    """Get engagement trends for a channel"""
    try:
        username = get_jwt_identity()
        period = request.args.get('period', 'week', type=str)
        
        # Check access
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']
            
            cur.execute("""
                SELECT 1 FROM channel_members 
                WHERE channel_id = %s AND user_id = %s
            """, (channel_id, user_id))
            
            if not cur.fetchone():
                return jsonify({'error': 'Access denied'}), 403
        
        conn.close()
        
        # Mock data for now
        return jsonify({
            'success': True,
            'trends': []
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_engagement_trends: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# =====================================
# WELLNESS AGENT ROUTES
# =====================================

@agents_bp.route('/wellness/analyze/<int:user_id>', methods=['POST'])
@jwt_required()
def analyze_wellness(user_id):
    """Analyze user wellness"""
    try:
        username = get_jwt_identity()
        
        # Get requesting user's ID
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            requester = cur.fetchone()
            if not requester:
                return jsonify({'error': 'User not found'}), 404
            
            if requester['id'] != user_id:
                return jsonify({'error': 'Unauthorized'}), 403
        
        conn.close()
        
        data = request.get_json() or {}
        time_period = data.get('time_period_hours', 24)
        
        # Mock data for now
        return jsonify({
            'success': True,
            'wellness_score': 75,
            'insights': []
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in analyze_wellness: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/wellness/recommendations/<int:user_id>', methods=['GET'])
@jwt_required()
def get_wellness_recommendations(user_id):
    """Get wellness recommendations"""
    try:
        username = get_jwt_identity()
        
        # Get requesting user's ID
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            requester = cur.fetchone()
            if not requester:
                return jsonify({'error': 'User not found'}), 404
            
            if requester['id'] != user_id:
                return jsonify({'error': 'Unauthorized'}), 403
        
        conn.close()
        
        # Mock data for now
        return jsonify({
            'success': True,
            'recommendations': []
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_wellness_recommendations: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# =====================================
# KNOWLEDGE BUILDER AGENT ROUTES
# =====================================

@agents_bp.route('/knowledge/insights', methods=['GET'])
@jwt_required()
def get_knowledge_insights():
    """Get knowledge insights"""
    try:
        time_period_hours = request.args.get('time_period_hours', 24, type=int)
        
        # Mock data for now
        return jsonify({
            'success': True,
            'insights': []
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_knowledge_insights: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/knowledge/topics', methods=['GET'])
@jwt_required()
def get_knowledge_topics():
    """Get knowledge topics"""
    try:
        limit = request.args.get('limit', 20, type=int)
        
        # Mock data for now
        return jsonify({
            'success': True,
            'topics': []
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_knowledge_topics: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/knowledge/base/<int:channel_id>', methods=['GET'])
@jwt_required()
def get_knowledge_base(channel_id):
    """Get knowledge base for a channel"""
    try:
        username = get_jwt_identity()
        limit = request.args.get('limit', 20, type=int)
        
        # Check access
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_row = cur.fetchone()
            if not user_row:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_row['id']
            
            cur.execute("""
                SELECT 1 FROM channel_members 
                WHERE channel_id = %s AND user_id = %s
            """, (channel_id, user_id))
            
            if not cur.fetchone():
                return jsonify({'error': 'Access denied'}), 403
        
        conn.close()
        
        # Mock data for now
        return jsonify({
            'success': True,
            'knowledge': []
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_knowledge_base: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# =====================================
# FOCUS AGENT ROUTES
# =====================================

@agents_bp.route('/focus/metrics', methods=['GET'])
@jwt_required()
def get_focus_metrics():
    """Get focus metrics"""
    try:
        days = request.args.get('days', 7, type=int)
        
        # Mock data for now
        return jsonify({
            'success': True,
            'metrics': {
                'total_focus_time': 0,
                'sessions_completed': 0,
                'average_session_length': 0,
                'productivity_score': 0
            }
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_focus_metrics: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/focus/recommendations', methods=['GET'])
@jwt_required()
def get_focus_recommendations():
    """Get focus recommendations"""
    try:
        # Mock data for now
        return jsonify({
            'success': True,
            'recommendations': []
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_focus_recommendations: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/focus/goal', methods=['POST'])
@jwt_required()
def set_focus_goal():
    """Set a focus goal"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'Goal data required'}), 400
        
        # Mock response for now
        return jsonify({
            'success': True,
            'message': 'Focus goal set successfully'
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in set_focus_goal: {e}")
        return jsonify({'error': 'Internal server error'}), 500
