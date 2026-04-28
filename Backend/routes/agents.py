"""
AI Agents API Routes
====================
RESTful endpoints for AI agent functionalities
"""

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import get_db_connection
from utils import get_user_id
import json

# Create blueprint
agents_bp = Blueprint('agents', __name__, url_prefix='/api/agents')

# Lazy agent singletons â€” created on first access, not at import time
_agents: dict = {}

def _get_agent(name: str):
    """Return a cached agent instance, creating it on first call."""
    if name not in _agents:
        if name == 'summarizer':
            from agents.summarizer import SummarizerAgent
            _agents[name] = SummarizerAgent()
        elif name == 'mood_tracker':
            from agents.mood_tracker import MoodTrackerAgent
            _agents[name] = MoodTrackerAgent()
        elif name == 'moderation':
            from agents.moderation import ModerationAgent
            _agents[name] = ModerationAgent()
        elif name == 'knowledge_builder':
            from agents.knowledge_builder import KnowledgeBuilderAgent
            _agents[name] = KnowledgeBuilderAgent()
        elif name == 'knowledge_builder_v2':
            from agents.knowledge_builder_v2 import KnowledgeBuilderAgent as KnowledgeBuilderV2
            _agents[name] = KnowledgeBuilderV2()
        elif name == 'focus':
            from agents.focus import FocusAgent
            _agents[name] = FocusAgent()
        elif name == 'engagement':
            from agents.engagement import EngagementAgent
            _agents[name] = EngagementAgent()
        elif name == 'wellness':
            from agents.wellness import WellnessAgent
            _agents[name] = WellnessAgent()
    return _agents[name]

# â”€â”€ Agent-type alias map â”€â”€
# Frontend may use e.g. 'mood_tracker' but agent_registry stores 'mood'.
AGENT_TYPE_ALIASES: dict[str, str] = {
    'mood_tracker': 'mood',
    'knowledge_builder': 'knowledge',
}

# Reverse: DB name â†’ frontend-friendly name (for catalog responses)
AGENT_TYPE_DISPLAY: dict[str, str] = {v: k for k, v in AGENT_TYPE_ALIASES.items()}

def _normalize_agent_type(agent_type: str) -> str:
    """Resolve frontend alias â†’ DB agent_type."""
    return AGENT_TYPE_ALIASES.get(agent_type, agent_type)

def _display_agent_type(agent_type: str) -> str:
    """Resolve DB agent_type â†’ frontend display name."""
    return AGENT_TYPE_DISPLAY.get(agent_type, agent_type)


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
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
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
        result = _get_agent("summarizer").summarize_channel(
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
        print(f"[AGENTS API] Getting summaries for channel {channel_id} by user {username}")
        
        # Get user ID and check access
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
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
        summaries = _get_agent("summarizer").get_recent_summaries(channel_id, limit)
        print(f"[AGENTS API] Found {len(summaries)} summaries for channel {channel_id}")
        
        return jsonify({
            'success': True,
            'summaries': summaries,
            'count': len(summaries)
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_channel_summaries: {e}")
        import traceback
        traceback.print_exc()
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
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
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
            requester_id = get_user_id(username, cur)
            if requester_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            # Users can only track their own mood (privacy)
            if requester_id != user_id:
                return jsonify({'error': 'Unauthorized'}), 403
        
        conn.close()
        
        # Get time period from request
        data = request.get_json() or {}
        time_period = data.get('time_period_hours', 24)
        
        # Track mood
        result = _get_agent("mood_tracker").track_user_mood(user_id, time_period)
        
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
            requester_id = get_user_id(username, cur)
            if requester_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            # Users can only view their own mood history
            if requester_id != user_id:
                return jsonify({'error': 'Unauthorized'}), 403
        
        conn.close()
        
        # Get limit from query params
        limit = request.args.get('limit', 10, type=int)
        
        # Get mood history
        history = _get_agent("mood_tracker").get_mood_history(user_id, limit)
        
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
        result = _get_agent("mood_tracker").analyze_message(text)
        
        return jsonify({
            'success': True,
            'analysis': result
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in analyze_message: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/mood/trends/<int:user_id>', methods=['GET'])
@jwt_required()
def get_mood_trends(user_id):
    """
    Get mood trends over time for visualization
    
    Query params:
        - days: Number of days to look back (default: 7)
    
    Returns:
        Time-series mood data for charts
    """
    try:
        username = get_jwt_identity()
        
        # Verify user access
        conn = get_db_connection()
        with conn.cursor() as cur:
            requester_id = get_user_id(username, cur)
            if requester_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            # Users can only view their own trends
            if requester_id != user_id:
                return jsonify({'error': 'Unauthorized'}), 403
        
        conn.close()
        
        days = request.args.get('days', 7, type=int)
        result = _get_agent("mood_tracker").get_mood_trends(user_id, days)
        
        return jsonify(result), 200 if result.get('success') else 400
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_mood_trends: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/mood/reanalyze/<int:user_id>', methods=['POST'])
@jwt_required()
def reanalyze_mood_history(user_id):
    """
    Re-analyze all user messages and rebuild mood history.
    Useful when the analysis algorithm is updated.
    
    Query params:
        - days: Number of days of history to process (default: 30)
    
    Returns:
        Summary of re-analysis results
    """
    try:
        username = get_jwt_identity()
        
        # Verify user access
        conn = get_db_connection()
        with conn.cursor() as cur:
            requester_id = get_user_id(username, cur)
            if requester_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            # Users can only re-analyze their own data
            if requester_id != user_id:
                return jsonify({'error': 'Unauthorized'}), 403
        
        conn.close()
        
        days = request.args.get('days', 30, type=int)
        result = _get_agent("mood_tracker").reanalyze_user_history(user_id, days)
        
        return jsonify(result), 200 if result.get('success') else 400
        
    except Exception as e:
        print(f"[AGENTS API] Error in reanalyze_mood_history: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/mood/community', methods=['GET'])
@jwt_required()
def get_community_mood():
    """
    Get aggregated mood analytics for a community or channel
    
    Query params:
        - community_id: Community ID (optional)
        - channel_id: Channel ID (optional)
        - hours: Hours to look back (default: 24)
    
    Returns:
        Community-wide mood statistics
    """
    try:
        community_id = request.args.get('community_id', type=int)
        channel_id = request.args.get('channel_id', type=int)
        hours = request.args.get('hours', 24, type=int)
        
        if not community_id and not channel_id:
            return jsonify({'error': 'community_id or channel_id required'}), 400
        
        result = _get_agent("mood_tracker").get_community_mood(
            community_id=community_id,
            channel_id=channel_id,
            hours=hours
        )
        
        return jsonify(result), 200 if result.get('success') else 400
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_community_mood: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/mood/recommendations/<int:user_id>', methods=['GET'])
@jwt_required()
def get_mood_recommendations(user_id):
    """
    Get personalized wellness recommendations based on mood patterns
    
    Returns:
        Wellness recommendations and alerts
    """
    try:
        username = get_jwt_identity()
        
        # Verify user access
        conn = get_db_connection()
        with conn.cursor() as cur:
            requester_id = get_user_id(username, cur)
            if requester_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            if requester_id != user_id:
                return jsonify({'error': 'Unauthorized'}), 403
        
        conn.close()
        
        result = _get_agent("mood_tracker").get_wellness_recommendations(user_id)
        
        return jsonify(result), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_mood_recommendations: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/mood/insights/<int:user_id>', methods=['GET'])
@jwt_required()
def get_mood_insights(user_id):
    """
    Get detailed insights about user's mood patterns
    
    Returns:
        Comprehensive mood insights including day/time analysis
    """
    try:
        username = get_jwt_identity()
        
        # Verify user access
        conn = get_db_connection()
        with conn.cursor() as cur:
            requester_id = get_user_id(username, cur)
            if requester_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            if requester_id != user_id:
                return jsonify({'error': 'Unauthorized'}), 403
        
        conn.close()
        
        result = _get_agent("mood_tracker").get_mood_insights(user_id)
        
        return jsonify(result), 200 if result.get('success') else 400
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_mood_insights: {e}")
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
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
        conn.close()
        
        # Run moderation
        result = _get_agent("moderation").moderate_message(text, user_id, channel_id)
        
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
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
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
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
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

@agents_bp.route('/engagement/analyze', methods=['POST'])
@jwt_required()
def analyze_engagement():
    """Analyze engagement in a channel"""
    try:
        username = get_jwt_identity()
        data = request.get_json()
        
        time_period_hours = data.get('time_period_hours', 6)
        channel_id = data.get('channel_id')
        
        print(f"[ENGAGEMENT] Analyzing engagement for user {username}, channel={channel_id}, hours={time_period_hours}")
        
        # Get user ID
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            # If no channel_id provided, try to get user's default/first channel
            if not channel_id:
                cur.execute("""
                    SELECT c.id 
                    FROM channels c
                    JOIN channel_members cm ON c.id = cm.channel_id
                    WHERE cm.user_id = %s
                    AND c.is_dm = false
                    ORDER BY c.created_at DESC
                    LIMIT 1
                """, (user_id,))
                channel_row = cur.fetchone()
                if channel_row:
                    channel_id = channel_row['id']
                else:
                    conn.close()
                    return jsonify({'error': 'No channels found. Please specify a channel_id.'}), 400
            
            # Verify user has access to the channel
            cur.execute("""
                SELECT 1 FROM channel_members 
                WHERE channel_id = %s AND user_id = %s
            """, (channel_id, user_id))
            
            if not cur.fetchone():
                conn.close()
                return jsonify({'error': 'Access denied to this channel'}), 403
        
        conn.close()
        
        # Analyze engagement
        result = _get_agent("engagement").analyze_engagement(channel_id, time_period_hours)
        
        if not result.get('success'):
            return jsonify(result), 400
        
        # Format response with safe defaults
        engagement_score = result.get('engagement_score', 0)
        response = {
            'success': True,
            'analysis': {
                'engagement_level': result.get('engagement_level', 'inactive'),
                'engagement_score': int(engagement_score * 100) if engagement_score else 0,  # Convert to 0-100
                'message_count': result.get('message_count', 0),
                'participant_count': result.get('participant_count', 0),
                'avg_messages_per_user': result.get('avg_messages_per_user', 0),
                'silence_minutes': result.get('silence_minutes', 0),
                'participation_balance': result.get('participation_balance', 0),
                'suggestions': result.get('suggestions', []),
                'time_period_hours': result.get('time_period_hours', time_period_hours)
            }
        }
        
        print(f"[ENGAGEMENT] Analysis complete: {result.get('engagement_level', 'unknown')} ({result.get('engagement_score', 0)})")
        
        return jsonify(response), 200
        
    except Exception as e:
        print(f"[ENGAGEMENT] Error analyzing engagement: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/engagement/metrics/<int:channel_id>', methods=['GET'])
@jwt_required()
def get_engagement_metrics(channel_id):
    """Get engagement metrics for a channel"""
    try:
        username = get_jwt_identity()
        hours = request.args.get('hours', 24, type=int)
        
        # Check access
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            cur.execute("""
                SELECT 1 FROM channel_members 
                WHERE channel_id = %s AND user_id = %s
            """, (channel_id, user_id))
            
            if not cur.fetchone():
                # Return empty metrics instead of 403 for better UX
                return jsonify({
                    'success': True,
                    'metrics': {
                        'total_messages': 0,
                        'active_users': 0,
                        'engagement_score': 0,
                        'silence_minutes': 0,
                        'avg_messages_per_user': 0
                    }
                }), 200
        
        conn.close()
        
        # Get real engagement metrics
        result = _get_agent("engagement").analyze_engagement(channel_id, hours)
        
        if not result.get('success'):
            return jsonify({
                'success': True,
                'metrics': {
                    'total_messages': 0,
                    'active_users': 0,
                    'engagement_score': 0,
                    'silence_minutes': 0,
                    'avg_messages_per_user': 0
                }
            }), 200
        
        return jsonify({
            'success': True,
            'metrics': {
                'total_messages': result.get('message_count', 0),
                'active_users': result.get('participant_count', 0),
                'engagement_score': int(result.get('engagement_score', 0) * 100),
                'silence_minutes': result.get('silence_minutes', 0),
                'avg_messages_per_user': result.get('avg_messages_per_user', 0)
            }
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_engagement_metrics: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/engagement/trends/<int:channel_id>', methods=['GET'])
@jwt_required()
def get_engagement_trends(channel_id):
    """Get engagement trends for a channel"""
    try:
        username = get_jwt_identity()
        limit = request.args.get('limit', 10, type=int)
        
        # Check access
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            cur.execute("""
                SELECT 1 FROM channel_members 
                WHERE channel_id = %s AND user_id = %s
            """, (channel_id, user_id))
            
            if not cur.fetchone():
                return jsonify({'error': 'Access denied'}), 403
        
        conn.close()
        
        # Get engagement history
        history = _get_agent("engagement").get_engagement_history(channel_id, limit)
        
        return jsonify({
            'success': True,
            'trends': history
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_engagement_trends: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# =====================================
# ICE-BREAKER ACTIVITIES ROUTES
# =====================================

@agents_bp.route('/engagement/icebreaker', methods=['GET'])
@jwt_required()
def get_icebreaker():
    """Get a random ice-breaker activity"""
    try:
        activity_type = request.args.get('type', 'random')
        result = _get_agent("engagement").get_icebreaker_activity(activity_type)
        return jsonify(result), 200 if result.get('success') else 400
    except Exception as e:
        print(f"[AGENTS API] Error in get_icebreaker: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/engagement/icebreaker/categories', methods=['GET'])
@jwt_required()
def get_icebreaker_categories():
    """Get all ice-breaker categories"""
    try:
        result = _get_agent("engagement").get_all_icebreaker_categories()
        return jsonify(result), 200 if result.get('success') else 400
    except Exception as e:
        print(f"[AGENTS API] Error in get_icebreaker_categories: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/engagement/poll', methods=['GET'])
@jwt_required()
def get_quick_poll():
    """Get a quick poll"""
    try:
        category = request.args.get('category', 'random')
        result = _get_agent("engagement").get_quick_poll(category)
        return jsonify(result), 200 if result.get('success') else 400
    except Exception as e:
        print(f"[AGENTS API] Error in get_quick_poll: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/engagement/challenge', methods=['GET'])
@jwt_required()
def get_fun_challenge():
    """Get a fun challenge"""
    try:
        challenge_type = request.args.get('type', 'random')
        result = _get_agent("engagement").get_fun_challenge(challenge_type)
        return jsonify(result), 200 if result.get('success') else 400
    except Exception as e:
        print(f"[AGENTS API] Error in get_fun_challenge: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/engagement/starters', methods=['GET'])
@jwt_required()
def get_conversation_starters():
    """Get conversation starters by category"""
    try:
        category = request.args.get('category', 'general')
        result = _get_agent("engagement").get_conversation_starter_by_category(category)
        return jsonify(result), 200 if result.get('success') else 400
    except Exception as e:
        print(f"[AGENTS API] Error in get_conversation_starters: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/engagement/booster-pack', methods=['GET'])
@jwt_required()
def get_booster_pack():
    """Get engagement booster pack based on engagement level"""
    try:
        engagement_level = request.args.get('level', 'low')
        result = _get_agent("engagement").get_engagement_booster_pack(engagement_level)
        return jsonify(result), 200 if result.get('success') else 400
    except Exception as e:
        print(f"[AGENTS API] Error in get_booster_pack: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/engagement/activity/log', methods=['POST'])
@jwt_required()
def log_activity():
    """Log when an activity is used"""
    try:
        username = get_jwt_identity()
        data = request.get_json()
        
        channel_id = data.get('channel_id')
        activity_type = data.get('activity_type')
        activity_title = data.get('activity_title')
        
        if not all([channel_id, activity_type, activity_title]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        # Get user ID
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
        conn.close()
        
        success = _get_agent("engagement").log_activity_usage(
            channel_id, activity_type, activity_title, user_id
        )
        
        return jsonify({
            'success': success,
            'message': 'Activity logged' if success else 'Failed to log activity'
        }), 200 if success else 500
        
    except Exception as e:
        print(f"[AGENTS API] Error in log_activity: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/engagement/activity/stats/<int:channel_id>', methods=['GET'])
@jwt_required()
def get_activity_stats(channel_id):
    """Get activity usage statistics for a channel"""
    try:
        days = request.args.get('days', 7, type=int)
        result = _get_agent("engagement").get_activity_stats(channel_id, days)
        return jsonify(result), 200 if result.get('success') else 400
    except Exception as e:
        print(f"[AGENTS API] Error in get_activity_stats: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# =====================================
# WELLNESS AGENT ROUTES
# =====================================

@agents_bp.route('/wellness/check', methods=['GET'])
@jwt_required()
def check_wellness():
    """
    Check current user's wellness status
    
    Returns:
        Wellness assessment with suggestions and metrics
    """
    try:
        username = get_jwt_identity()
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
        conn.close()
        
        result = _get_agent("wellness").check_user_wellness(user_id)
        
        return jsonify(result), 200 if result.get('success') else 400
        
    except Exception as e:
        print(f"[AGENTS API] Error in check_wellness: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/wellness/analyze', methods=['POST'])
@jwt_required()
def analyze_wellness():
    """
    Comprehensive wellness analysis for current user with mood integration
    
    Body (optional):
        - time_period_hours: Analysis time window (default: 24)
    
    Returns:
        Detailed wellness analysis with scores, mood data, and insights
    """
    try:
        username = get_jwt_identity()
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
        conn.close()
        
        data = request.get_json() or {}
        time_period_hours = data.get('time_period_hours', 24)
        
        # Get wellness check
        wellness_check = _get_agent("wellness").check_user_wellness(user_id)
        
        if not wellness_check.get('success'):
            return jsonify(wellness_check), 400
        
        # Get activity suggestions
        suggestions = _get_agent("wellness").suggest_wellness_activity(user_id, wellness_check)
        
        # === MOOD INTEGRATION ===
        # Get mood trends from mood tracker
        mood_trends = _get_agent("mood_tracker").get_mood_trends(user_id, days=7)
        mood_recommendations = _get_agent("mood_tracker").get_wellness_recommendations(user_id)
        mood_insights = _get_agent("mood_tracker").get_mood_insights(user_id)
        
        # Calculate comprehensive scores
        metrics = wellness_check.get('metrics', {})
        concerns = wellness_check.get('concerns', [])
        
        # Calculate category scores with mood data integration
        base_activity_score = _calculate_activity_score(metrics)
        base_stress_score = _calculate_stress_score(concerns)
        base_communication_score = _calculate_communication_score(metrics)
        base_digital_score = _calculate_digital_wellbeing_score(metrics, concerns)
        
        # Adjust scores based on mood data
        mood_adjustment = _calculate_mood_wellness_adjustment(mood_trends, mood_recommendations)
        
        category_scores = {
            'activity_balance': min(1.0, max(0, base_activity_score)),
            'stress_level': min(1.0, max(0, base_stress_score * mood_adjustment.get('stress_multiplier', 1.0))),
            'communication_health': min(1.0, max(0, base_communication_score)),
            'digital_wellbeing': min(1.0, max(0, base_digital_score)),
            'emotional_wellness': mood_adjustment.get('emotional_score', 0.65)
        }
        
        # Overall wellness score (weighted average)
        weights = {'activity_balance': 0.2, 'stress_level': 0.25, 'communication_health': 0.15, 
                   'digital_wellbeing': 0.15, 'emotional_wellness': 0.25}
        overall_score = sum(category_scores[k] * weights[k] for k in category_scores) / sum(weights.values())
        
        # Identify risk factors including mood-based ones
        risk_factors = _identify_risk_factors(concerns, metrics)
        mood_risk_factors = _identify_mood_risk_factors(mood_trends, mood_recommendations)
        risk_factors.extend(mood_risk_factors)
        
        # Positive indicators including mood-based ones
        positive_indicators = _identify_positive_indicators(wellness_check)
        mood_positive = _identify_mood_positive_indicators(mood_trends, mood_recommendations)
        positive_indicators.extend(mood_positive)
        
        # Build mood summary for response
        mood_summary = {
            'has_mood_data': mood_trends.get('has_data', False),
            'dominant_mood': mood_trends.get('dominant_mood'),
            'mood_trend': mood_trends.get('trend_direction'),
            'sentiment_distribution': mood_trends.get('distribution', {}),
            'average_sentiment': mood_trends.get('average_sentiment', 0),
            'mood_alerts': mood_recommendations.get('alerts', []) if mood_recommendations.get('has_recommendations') else []
        }
        
        # Combine suggestions from wellness and mood
        # Wellness suggestions can be dicts or strings, mood recommendations are strings
        all_suggestions = []
        
        # Add wellness suggestions (could be dicts with 'message' key or strings)
        for s in wellness_check.get('suggestions', []):
            if isinstance(s, dict):
                all_suggestions.append(s.get('message', str(s)))
            else:
                all_suggestions.append(str(s))
        
        # Add activity suggestions
        for s in suggestions.get('suggestions', []):
            if isinstance(s, dict):
                all_suggestions.append(s.get('message', str(s)))
            else:
                all_suggestions.append(str(s))
        
        # Add mood recommendations (should be strings)
        if mood_recommendations.get('has_recommendations'):
            for r in mood_recommendations.get('recommendations', []):
                if isinstance(r, str):
                    all_suggestions.append(r)
                elif isinstance(r, dict):
                    all_suggestions.append(r.get('message', r.get('title', str(r))))
        
        # Deduplicate and limit
        unique_suggestions = list(dict.fromkeys(all_suggestions))[:10]
        
        return jsonify({
            'success': True,
            'analysis': {
                'overall_wellness_score': round(overall_score, 2),
                'wellness_level': _get_wellness_level_from_score(overall_score),
                'category_scores': category_scores,
                'risk_factors': risk_factors,
                'positive_indicators': positive_indicators,
                'time_period_hours': time_period_hours
            },
            'mood_summary': mood_summary,
            'mood_insights': mood_insights if mood_insights.get('has_insights') else None,
            'metrics': metrics,
            'suggestions': unique_suggestions,
            'concerns': concerns
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in analyze_wellness: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500


def _calculate_mood_wellness_adjustment(mood_trends: dict, mood_recommendations: dict) -> dict:
    """Calculate wellness score adjustments based on mood data"""
    adjustment = {
        'stress_multiplier': 1.0,
        'emotional_score': 0.65  # Default neutral score
    }
    
    if not mood_trends.get('has_data'):
        return adjustment
    
    # Get mood distribution
    distribution = mood_trends.get('distribution', {})
    total = sum(distribution.values())
    
    if total > 0:
        positive_ratio = distribution.get('positive', 0) / total
        negative_ratio = distribution.get('negative', 0) / total
        
        # Calculate emotional wellness score (0-1)
        adjustment['emotional_score'] = max(0.2, min(0.95, 0.5 + (positive_ratio - negative_ratio) * 0.5))
        
        # Adjust stress multiplier based on negative mood patterns
        if negative_ratio > 0.5:
            adjustment['stress_multiplier'] = 0.7  # Lower stress score if highly negative
        elif negative_ratio > 0.3:
            adjustment['stress_multiplier'] = 0.85
        elif positive_ratio > 0.6:
            adjustment['stress_multiplier'] = 1.15  # Boost if mostly positive
    
    # Adjust based on trend direction
    trend = mood_trends.get('trend_direction')
    if trend == 'declining':
        adjustment['emotional_score'] *= 0.9
    elif trend == 'improving':
        adjustment['emotional_score'] = min(0.95, adjustment['emotional_score'] * 1.1)
    
    return adjustment


def _identify_mood_risk_factors(mood_trends: dict, mood_recommendations: dict) -> list:
    """Identify risk factors based on mood patterns"""
    risk_factors = []
    
    if not mood_trends.get('has_data'):
        return risk_factors
    
    distribution = mood_trends.get('distribution', {})
    total = sum(distribution.values())
    
    if total > 0:
        negative_ratio = distribution.get('negative', 0) / total
        
        if negative_ratio > 0.6:
            risk_factors.append({
                'factor': 'High Negative Mood Pattern',
                'description': 'Over 60% of your recent messages show negative sentiment. Consider practicing self-care.',
                'severity': 'high',
                'impact_score': 0.8,
                'category': 'emotional_wellness'
            })
        elif negative_ratio > 0.4:
            risk_factors.append({
                'factor': 'Elevated Negative Sentiment',
                'description': 'Your recent communications show moderately negative patterns.',
                'severity': 'medium',
                'impact_score': 0.5,
                'category': 'emotional_wellness'
            })
    
    if mood_trends.get('trend_direction') == 'declining':
        risk_factors.append({
            'factor': 'Declining Mood Trend',
            'description': 'Your mood has been trending downward over the past week.',
            'severity': 'medium',
            'impact_score': 0.6,
            'category': 'emotional_wellness'
        })
    
    # Check for mood alerts
    alerts = mood_recommendations.get('alerts', []) if mood_recommendations.get('has_recommendations') else []
    for alert in alerts:
        if alert.get('severity') == 'warning':
            risk_factors.append({
                'factor': alert.get('type', 'Mood Alert').replace('_', ' ').title(),
                'description': alert.get('message', 'Mood pattern requires attention'),
                'severity': 'medium',
                'impact_score': 0.55,
                'category': 'emotional_wellness'
            })
    
    return risk_factors


def _identify_mood_positive_indicators(mood_trends: dict, mood_recommendations: dict) -> list:
    """Identify positive indicators based on mood patterns"""
    positive_indicators = []
    
    if not mood_trends.get('has_data'):
        return positive_indicators
    
    distribution = mood_trends.get('distribution', {})
    total = sum(distribution.values())
    
    if total > 0:
        positive_ratio = distribution.get('positive', 0) / total
        
        if positive_ratio > 0.6:
            positive_indicators.append('Consistently positive communication patterns')
        
        if positive_ratio > 0.7:
            positive_indicators.append('Excellent emotional expression in messages')
    
    if mood_trends.get('trend_direction') == 'improving':
        positive_indicators.append('Mood trend is improving over recent days')
    
    dominant = mood_trends.get('dominant_mood')
    if dominant == 'positive':
        positive_indicators.append('Overall positive dominant mood detected')
    
    return positive_indicators


def _get_wellness_level_from_score(score: float) -> str:
    """Convert numeric score to wellness level label"""
    if score >= 0.85:
        return 'excellent'
    elif score >= 0.70:
        return 'good'
    elif score >= 0.50:
        return 'moderate'
    elif score >= 0.35:
        return 'concerning'
    else:
        return 'poor'


@agents_bp.route('/wellness/recommendations', methods=['GET'])
@jwt_required()
def get_wellness_recommendations():
    """
    Get personalized wellness recommendations
    
    Returns:
        List of wellness recommendations based on user's state
    """
    try:
        username = get_jwt_identity()
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
        conn.close()
        
        # Get current wellness state
        wellness_check = _get_agent("wellness").check_user_wellness(user_id)
        activity_suggestions = _get_agent("wellness").suggest_wellness_activity(user_id, wellness_check)
        
        # Build recommendations based on state
        recommendations = []
        concerns = wellness_check.get('concerns', [])
        wellness_level = wellness_check.get('wellness_level', 'good')
        
        # Add recommendations based on concerns
        if 'high_activity' in concerns:
            recommendations.append({
                'title': 'Take Regular Breaks',
                'description': 'Your messaging activity is higher than usual. Schedule short breaks every hour to maintain focus and reduce eye strain.',
                'priority': 'high',
                'category': 'break',
                'icon': 'coffee'
            })
        
        if 'continuous_activity' in concerns:
            recommendations.append({
                'title': 'Time for a Breather',
                'description': 'You\'ve been active for an extended period. Step away from the screen for 15 minutes to recharge.',
                'priority': 'high',
                'category': 'break',
                'icon': 'pause'
            })
        
        if 'stress_indicators' in concerns:
            recommendations.append({
                'title': 'Practice Mindfulness',
                'description': 'Your recent messages suggest some stress. Try a quick breathing exercise or a short walk.',
                'priority': 'high',
                'category': 'mental_health',
                'icon': 'brain'
            })
        
        if 'late_night_activity' in concerns:
            recommendations.append({
                'title': 'Prioritize Sleep',
                'description': 'Late-night screen time can affect sleep quality. Consider wrapping up and getting rest.',
                'priority': 'medium',
                'category': 'sleep',
                'icon': 'moon'
            })
        
        # Add general wellness recommendations
        if wellness_level == 'good' or len(recommendations) == 0:
            recommendations.extend([
                {
                    'title': 'Stay Hydrated',
                    'description': 'Remember to drink water regularly while you work.',
                    'priority': 'low',
                    'category': 'health',
                    'icon': 'droplet'
                },
                {
                    'title': 'Posture Check',
                    'description': 'Take a moment to check your posture. Sit up straight and relax your shoulders.',
                    'priority': 'low',
                    'category': 'physical',
                    'icon': 'activity'
                },
                {
                    'title': 'Eye Rest',
                    'description': 'Follow the 20-20-20 rule: Every 20 minutes, look at something 20 feet away for 20 seconds.',
                    'priority': 'low',
                    'category': 'health',
                    'icon': 'eye'
                }
            ])
        
        # Add activity suggestions
        for suggestion in activity_suggestions.get('suggestions', []):
            recommendations.append({
                'title': 'Wellness Activity',
                'description': suggestion,
                'priority': 'medium',
                'category': 'activity',
                'icon': 'sparkles'
            })
        
        return jsonify({
            'success': True,
            'recommendations': recommendations[:8],  # Limit to 8 recommendations
            'wellness_level': wellness_level,
            'concerns_count': len(concerns)
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_wellness_recommendations: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/wellness/insights/<int:user_id>', methods=['GET'])
@jwt_required()
def get_wellness_insights(user_id):
    """
    Get wellness insights and history
    
    Query params:
        - days: Number of days of history (default: 7)
    
    Returns:
        Wellness insights and historical data
    """
    try:
        username = get_jwt_identity()
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            requester_id = get_user_id(username, cur)
            if requester_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            if requester_id != user_id:
                return jsonify({'error': 'Unauthorized'}), 403
        conn.close()
        
        days = request.args.get('days', 7, type=int)
        
        # Get wellness history
        history = _get_agent("wellness").get_wellness_history(user_id, limit=days * 2)
        
        # Calculate insights from history
        insights = _calculate_wellness_insights(history)
        
        return jsonify({
            'success': True,
            'insights': insights,
            'history': history,
            'days': days
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_wellness_insights: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/wellness/history', methods=['GET'])
@jwt_required()
def get_wellness_history():
    """
    Get user's wellness check history
    
    Query params:
        - limit: Number of records (default: 10)
    
    Returns:
        List of past wellness checks
    """
    try:
        username = get_jwt_identity()
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
        conn.close()
        
        limit = request.args.get('limit', 10, type=int)
        history = _get_agent("wellness").get_wellness_history(user_id, limit=limit)
        
        return jsonify({
            'success': True,
            'history': history,
            'count': len(history)
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_wellness_history: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/wellness/trends', methods=['GET'])
@jwt_required()
def get_wellness_trends():
    """
    Get wellness trends over time
    
    Query params:
        - days: Number of days (default: 7)
    
    Returns:
        Wellness trend data for charts
    """
    try:
        username = get_jwt_identity()
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
        conn.close()
        
        days = request.args.get('days', 7, type=int)
        history = _get_agent("wellness").get_wellness_history(user_id, limit=days * 3)
        
        # Aggregate by day
        from collections import defaultdict
        daily_data = defaultdict(list)
        
        for record in history:
            if record.get('created_at'):
                date_str = record['created_at'][:10] if isinstance(record['created_at'], str) else record['created_at'].strftime('%Y-%m-%d')
                check_result = record.get('check_result', {})
                wellness_level = check_result.get('wellness_level', 'unknown')
                score = 1.0 if wellness_level == 'good' else 0.7 if wellness_level == 'monitor' else 0.4
                daily_data[date_str].append({
                    'score': score,
                    'level': wellness_level,
                    'concerns': len(check_result.get('concerns', []))
                })
        
        # Build trend data
        trends = []
        for date, records in sorted(daily_data.items()):
            avg_score = sum(r['score'] for r in records) / len(records)
            avg_concerns = sum(r['concerns'] for r in records) / len(records)
            trends.append({
                'date': date,
                'wellness_score': round(avg_score * 100),
                'checks_count': len(records),
                'avg_concerns': round(avg_concerns, 1),
                'dominant_level': max(set(r['level'] for r in records), key=lambda x: [r['level'] for r in records].count(x))
            })
        
        return jsonify({
            'success': True,
            'trends': trends,
            'days': days,
            'total_checks': len(history)
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_wellness_trends: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500


# Helper functions for wellness calculations
def _calculate_activity_score(metrics):
    """Calculate activity balance score (0-1)"""
    if not metrics:
        return 0.8  # Default good score
    
    avg_per_hour = metrics.get('avg_messages_per_hour', 0)
    # Ideal range: 10-30 messages per hour
    if 10 <= avg_per_hour <= 30:
        return 0.9
    elif avg_per_hour < 10:
        return 0.7  # Low activity
    elif avg_per_hour <= 50:
        return 0.6  # Slightly high
    else:
        return 0.4  # Too high


def _calculate_stress_score(concerns):
    """Calculate stress level score (0-1, higher is better/less stress)"""
    if 'stress_indicators' in concerns:
        return 0.3
    elif 'high_activity' in concerns or 'continuous_activity' in concerns:
        return 0.5
    elif 'late_night_activity' in concerns:
        return 0.6
    return 0.9


def _calculate_communication_score(metrics):
    """Calculate communication health score (0-1)"""
    if not metrics:
        return 0.7
    
    messages = metrics.get('messages_today', 0)
    duration = metrics.get('active_duration_hours', 0)
    
    if duration == 0:
        return 0.8
    
    # Check for balanced communication
    messages_per_hour = messages / max(duration, 1)
    if 5 <= messages_per_hour <= 40:
        return 0.85
    elif messages_per_hour < 5:
        return 0.6
    else:
        return 0.5


def _calculate_digital_wellbeing_score(metrics, concerns):
    """Calculate digital wellbeing score (0-1)"""
    score = 0.8  # Start with good score
    
    if 'late_night_activity' in concerns:
        score -= 0.2
    if 'continuous_activity' in concerns:
        score -= 0.15
    if 'high_activity' in concerns:
        score -= 0.1
    
    # Check time since last break
    if metrics:
        time_since_last = metrics.get('time_since_last_message_min', 0)
        if time_since_last > 30:  # Had a break
            score += 0.1
    
    return max(0.2, min(1.0, score))


def _identify_risk_factors(concerns, metrics):
    """Identify wellness risk factors"""
    risk_factors = []
    
    if 'high_activity' in concerns:
        risk_factors.append({
            'factor': 'High Message Volume',
            'description': 'You\'re sending more messages than usual, which may lead to fatigue.',
            'severity': 'medium',
            'impact_score': 0.6
        })
    
    if 'continuous_activity' in concerns:
        risk_factors.append({
            'factor': 'Extended Screen Time',
            'description': 'You\'ve been active without significant breaks.',
            'severity': 'high',
            'impact_score': 0.75
        })
    
    if 'stress_indicators' in concerns:
        risk_factors.append({
            'factor': 'Stress Detected',
            'description': 'Your recent messages show signs of stress or frustration.',
            'severity': 'high',
            'impact_score': 0.8
        })
    
    if 'late_night_activity' in concerns:
        risk_factors.append({
            'factor': 'Late Night Usage',
            'description': 'Using devices late at night can affect sleep quality.',
            'severity': 'medium',
            'impact_score': 0.5
        })
    
    return risk_factors


def _identify_positive_indicators(wellness_check):
    """Identify positive wellness indicators"""
    indicators = []
    metrics = wellness_check.get('metrics', {})
    concerns = wellness_check.get('concerns', [])
    
    if not concerns or len(concerns) == 0:
        indicators.append('No wellness concerns detected')
    
    if metrics.get('time_since_last_message_min', 0) > 15:
        indicators.append('Taking regular breaks')
    
    if metrics.get('active_duration_hours', 0) < 3:
        indicators.append('Healthy activity duration')
    
    if metrics.get('avg_messages_per_hour', 0) <= 30:
        indicators.append('Balanced communication pace')
    
    if wellness_check.get('wellness_level') == 'good':
        indicators.append('Overall wellness is good')
    
    return indicators if indicators else ['Keep maintaining your current habits']


def _calculate_wellness_insights(history):
    """Calculate insights from wellness history"""
    if not history:
        return {
            'has_insights': False,
            'message': 'Not enough data to generate insights'
        }
    
    # Analyze patterns
    levels = []
    total_concerns = 0
    concern_types = {}
    
    for record in history:
        check_result = record.get('check_result', {})
        levels.append(check_result.get('wellness_level', 'unknown'))
        
        concerns = check_result.get('concerns', [])
        total_concerns += len(concerns)
        for c in concerns:
            concern_types[c] = concern_types.get(c, 0) + 1
    
    # Calculate stats
    good_count = levels.count('good')
    total = len(levels)
    good_percentage = (good_count / total * 100) if total > 0 else 0
    
    # Find most common concern
    most_common_concern = max(concern_types.items(), key=lambda x: x[1])[0] if concern_types else None
    
    insights = []
    if good_percentage >= 70:
        insights.append('Your wellness has been consistently good')
    elif good_percentage >= 50:
        insights.append('Your wellness is moderate with room for improvement')
    else:
        insights.append('Your wellness could use more attention')
    
    if most_common_concern:
        concern_messages = {
            'high_activity': 'You tend to have high messaging activity',
            'continuous_activity': 'You often work for extended periods without breaks',
            'stress_indicators': 'Stress patterns have been detected in your messages',
            'late_night_activity': 'You frequently use the platform late at night'
        }
        insights.append(concern_messages.get(most_common_concern, f'Common pattern: {most_common_concern}'))
    
    return {
        'has_insights': True,
        'good_wellness_percentage': round(good_percentage),
        'total_checks': total,
        'avg_concerns_per_check': round(total_concerns / max(total, 1), 1),
        'most_common_concern': most_common_concern,
        'insights': insights
    }


# =====================================
# KNOWLEDGE BUILDER AGENT ROUTES
# =====================================

@agents_bp.route('/knowledge/base/<int:channel_id>', methods=['GET'])
@jwt_required()
def get_knowledge_base(channel_id):
    """
    Get knowledge base entries for a channel.
    This endpoint is used by the AIAgentContext.
    
    Query params:
        - limit: Maximum number of entries (default: 20)
    
    Returns:
        List of knowledge base entries
    """
    conn = None
    try:
        username = get_jwt_identity()
        limit = min(request.args.get('limit', 20, type=int), 100)
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get user ID
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            # Check if user is member of the channel
            cur.execute("""
                SELECT 1 FROM channel_members 
                WHERE channel_id = %s AND user_id = %s
            """, (channel_id, user_id))
            
            if not cur.fetchone():
                # Return empty result instead of 403 for better UX
                return jsonify({
                    'success': True,
                    'knowledge': [],
                    'total': 0
                }), 200
            
            # Get the community_id for this channel
            cur.execute("SELECT community_id FROM channels WHERE id = %s", (channel_id,))
            channel_row = cur.fetchone()
            if not channel_row:
                return jsonify({
                    'success': True,
                    'knowledge': [],
                    'total': 0
                }), 200
            
            community_id = channel_row['community_id']
            
            # Get knowledge base entries for this channel or community
            cur.execute("""
                SELECT 
                    kb.id, kb.title, kb.content, kb.source, kb.related_channel,
                    kb.created_at, kb.updated_at,
                    c.name as channel_name
                FROM knowledge_base kb
                LEFT JOIN channels c ON kb.related_channel = c.id
                WHERE kb.related_channel = %s
                ORDER BY kb.created_at DESC
                LIMIT %s
            """, (channel_id, limit))
            
            entries = cur.fetchall()
            
            result = []
            for entry in entries:
                result.append({
                    'id': entry['id'],
                    'title': entry['title'],
                    'content': entry['content'],
                    'source': entry['source'],
                    'channel_id': entry['related_channel'],
                    'channel_name': entry['channel_name'],
                    'created_at': entry['created_at'].isoformat() if entry['created_at'] else None,
                    'updated_at': entry['updated_at'].isoformat() if entry['updated_at'] else None
                })
            
            return jsonify({
                'success': True,
                'knowledge': result,
                'total': len(result)
            }), 200
            
    except Exception as e:
        print(f"[AGENTS API] Error in get_knowledge_base: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/knowledge/insights', methods=['GET'])
@jwt_required()
def get_knowledge_insights():
    """Get knowledge insights scoped to a community"""
    conn = None
    try:
        username = get_jwt_identity()
        time_period_hours = request.args.get('time_period_hours', 24, type=int)
        community_id = request.args.get('community_id', type=int)

        if not community_id:
            return jsonify({'error': 'community_id is required'}), 400

        conn = get_db_connection()
        insights = {
            'total_knowledge_items': 0,
            'unique_topics': 0,
            'avg_relevance': 0,
            'growth_rate': 0,
            'insights': []
        }
        with conn.cursor() as cur:
            # Validate membership in the community
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404

            cur.execute(
                """
                SELECT 1 FROM community_members
                WHERE community_id = %s AND user_id = %s
                """,
                (community_id, user_id)
            )
            if not cur.fetchone():
                conn.close()
                return jsonify({'error': 'Access denied to this community'}), 403

            # Fetch knowledge entries for channels in this community
            cur.execute(
                """
                SELECT kb.id, kb.title, kb.content, kb.created_at
                FROM knowledge_base kb
                JOIN channels c ON kb.related_channel = c.id
                WHERE c.community_id = %s
                  AND kb.created_at >= DATE_SUB(NOW(), INTERVAL %s HOUR)
                ORDER BY kb.created_at DESC
                """,
                (community_id, time_period_hours)
            )
            rows = cur.fetchall()
            insights['total_knowledge_items'] = len(rows)
            topics = []
            relevance_scores = []
            types = set()
            
            for r in rows:
                try:
                    payload = json.loads(r['content']) if r['content'] else {}
                except Exception:
                    payload = {}
                
                # Collect all types
                item_type = payload.get('type', 'unknown')
                if item_type:
                    types.add(item_type)
                
                # Collect topics from various sources
                if item_type == 'topic' and payload.get('topic'):
                    topics.append(payload.get('topic'))
                elif item_type in ['faq', 'qa'] and payload.get('tags'):
                    topics.extend(payload.get('tags', []))
                elif item_type == 'decision' and payload.get('tags'):
                    topics.extend(payload.get('tags', []))
                elif item_type == 'definition' and payload.get('tags'):
                    topics.extend(payload.get('tags', []))
                
                # Collect relevance scores
                if 'relevance_score' in payload and isinstance(payload['relevance_score'], (int, float)):
                    relevance_scores.append(float(payload['relevance_score']))
            
            insights['unique_topics'] = len(set(topics))
            insights['avg_relevance'] = (sum(relevance_scores) / len(relevance_scores)) if relevance_scores else 0
            
            # Calculate growth rate (compare with previous period)
            cur.execute(
                """
                SELECT COUNT(*) as prev_count
                FROM knowledge_base kb
                JOIN channels c ON kb.related_channel = c.id
                WHERE c.community_id = %s
                  AND kb.created_at >= DATE_SUB(NOW(), INTERVAL %s HOUR)
                  AND kb.created_at < DATE_SUB(NOW(), INTERVAL %s HOUR)
                """,
                (community_id, time_period_hours * 2, time_period_hours)
            )
            prev_result = cur.fetchone()
            prev_count = prev_result['prev_count'] if prev_result else 0
            
            if prev_count > 0:
                insights['growth_rate'] = (len(rows) - prev_count) / prev_count
            else:
                insights['growth_rate'] = 1.0 if len(rows) > 0 else 0
            
            # Generate insights
            if len(rows) > 0:
                insights['insights'] = [
                    f"Found {len(rows)} knowledge items in the last {time_period_hours} hours",
                    f"Covering {len(set(topics))} unique topics" if topics else "No topics tagged yet",
                    f"Knowledge types: {', '.join(types)}" if types else "No categorized items"
                ]
        conn.close()
        return jsonify({'success': True, 'insights': insights}), 200

    except Exception as e:
        print(f"[AGENTS API] Error in get_knowledge_insights: {e}")
        import traceback
        traceback.print_exc()
        if conn:
            conn.close()
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/knowledge/topics', methods=['GET'])
@jwt_required()
def get_knowledge_topics():
    """Get knowledge topics scoped to a community"""
    conn = None
    try:
        username = get_jwt_identity()
        limit = request.args.get('limit', 20, type=int)
        community_id = request.args.get('community_id', type=int)

        if not community_id:
            return jsonify({'error': 'community_id is required'}), 400

        conn = get_db_connection()
        topics_counter = {}
        with conn.cursor() as cur:
            # Validate membership in the community
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            cur.execute(
                """
                SELECT 1 FROM community_members
                WHERE community_id = %s AND user_id = %s
                """,
                (community_id, user_id)
            )
            if not cur.fetchone():
                conn.close()
                return jsonify({'error': 'Access denied to this community'}), 403

            # Fetch topics for channels within the community
            cur.execute(
                """
                SELECT kb.content
                FROM knowledge_base kb
                JOIN channels c ON kb.related_channel = c.id
                WHERE c.community_id = %s
                ORDER BY kb.created_at DESC
                LIMIT 500
                """,
                (community_id,)
            )
            rows = cur.fetchall()
            for r in rows:
                try:
                    payload = json.loads(r['content']) if r['content'] else {}
                except Exception:
                    payload = {}
                
                item_type = payload.get('type', 'unknown')
                
                # Extract topics from 'topic' type items
                if item_type == 'topic' and payload.get('topic'):
                    key = payload['topic']
                    topics_counter[key] = topics_counter.get(key, 0) + 1
                
                # Extract topics from tags in all item types (faq, definition, decision, qa)
                if item_type in ['faq', 'qa', 'definition', 'decision']:
                    tags = payload.get('tags', [])
                    if isinstance(tags, list):
                        for tag in tags:
                            if tag and isinstance(tag, str):
                                topics_counter[tag] = topics_counter.get(tag, 0) + 1
                
                # Also extract from question text for FAQs (for better topic detection)
                if item_type in ['faq', 'qa'] and payload.get('question'):
                    question = payload['question'].lower()
                    # Extract common tech keywords
                    tech_keywords = ['docker', 'react', 'mysql', 'python', 'flask', 
                                   'database', 'authentication', 'deployment', 'api',
                                   'javascript', 'typescript', 'node', 'express']
                    for keyword in tech_keywords:
                        if keyword in question:
                            topics_counter[keyword.capitalize()] = topics_counter.get(keyword.capitalize(), 0) + 1
                            
        conn.close()
        topics_sorted = sorted(topics_counter.items(), key=lambda x: x[1], reverse=True)[:limit]
        topics = [{'topic': t[0], 'count': t[1]} for t in topics_sorted]
        return jsonify({'success': True, 'topics': topics}), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_knowledge_topics: {e}")
        import traceback
        traceback.print_exc()
        if conn:
            conn.close()
@jwt_required()
def get_knowledge_base(channel_id):
    """Get knowledge base for a channel"""
    try:
        username = get_jwt_identity()
        limit = request.args.get('limit', 20, type=int)
        
        # Check access
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            cur.execute("""
                SELECT 1 FROM channel_members 
                WHERE channel_id = %s AND user_id = %s
            """, (channel_id, user_id))
            
            if not cur.fetchone():
                return jsonify({'error': 'Access denied'}), 403
        
        # Fetch knowledge_base entries for channel
        knowledge_items = []
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, title, content, created_at
                FROM knowledge_base
                WHERE related_channel = %s
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (channel_id, limit)
            )
            rows = cur.fetchall()
            for r in rows:
                try:
                    payload = json.loads(r['content']) if r['content'] else {}
                except Exception:
                    payload = {}
                # Map payload to frontend KnowledgeEntry shape
                if payload.get('type') == 'qa':
                    knowledge_items.append({
                        'id': r['id'],
                        'question': payload.get('question') or r['title'] or 'Q/A',
                        'answer': payload.get('answer') or '',
                        'tags': payload.get('tags') or [],
                        'relevance_score': payload.get('relevance_score') or 0,
                        'usage_count': payload.get('usage_count') or 0,
                        'created_at': r['created_at'].isoformat() if r.get('created_at') else None
                    })
                elif payload.get('type') == 'topic':
                    knowledge_items.append({
                        'id': r['id'],
                        'question': f"Topic: {payload.get('topic', r['title'] or 'Topic')}",
                        'answer': payload.get('summary') or '',
                        'tags': [payload.get('topic')] if payload.get('topic') else [],
                        'relevance_score': 0,
                        'usage_count': payload.get('message_count') or 0,
                        'created_at': r['created_at'].isoformat() if r.get('created_at') else None
                    })
                elif payload.get('type') == 'decision':
                    knowledge_items.append({
                        'id': r['id'],
                        'question': payload.get('decision') or r['title'] or 'Decision',
                        'answer': '',
                        'tags': payload.get('tags') or [],
                        'relevance_score': 0,
                        'usage_count': 0,
                        'created_at': r['created_at'].isoformat() if r.get('created_at') else None
                    })
                elif payload.get('type') == 'resource':
                    knowledge_items.append({
                        'id': r['id'],
                        'question': r['title'] or 'Resource',
                        'answer': payload.get('url') or '',
                        'tags': [],
                        'relevance_score': 0,
                        'usage_count': 0,
                        'created_at': r['created_at'].isoformat() if r.get('created_at') else None
                    })
                else:
                    knowledge_items.append({
                        'id': r['id'],
                        'question': r['title'] or 'Knowledge',
                        'answer': '',
                        'tags': [],
                        'relevance_score': 0,
                        'usage_count': 0,
                        'created_at': r['created_at'].isoformat() if r.get('created_at') else None
                    })
        conn.close()
        return jsonify({'success': True, 'knowledge': knowledge_items}), 200

    except Exception as e:
        print(f"[AGENTS API] Error in get_knowledge_base: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/knowledge/extract/<int:channel_id>', methods=['POST'])
@jwt_required()
def extract_knowledge_channel(channel_id):
    """Extract knowledge from a specific channel within a time window."""
    try:
        username = get_jwt_identity()
        data = request.get_json() or {}
        # Use time_period_hours if provided, else default to 24
        time_period_hours = int(data.get('time_period_hours', 24))

        # Access checks
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404

            cur.execute(
                """
                SELECT 1 FROM channel_members WHERE channel_id = %s AND user_id = %s
                """,
                (channel_id, user_id)
            )
            if not cur.fetchone():
                return jsonify({'error': 'Access denied'}), 403

        conn.close()

        # Perform extraction
        result = _get_agent("knowledge_builder").extract_knowledge(channel_id=channel_id, time_period_hours=time_period_hours)
        if not result.get('success'):
            return jsonify({'success': False, 'error': result.get('error', 'Extraction failed')}), 400

        # Build simple list for immediate response (QA + decisions + topics)
        knowledge_out = []
        for qa in result.get('qa_pairs', []):
            knowledge_out.append({
                'id': 0,
                'question': qa.get('question'),
                'answer': qa.get('answer'),
                'tags': [],
                'relevance_score': 0,
                'usage_count': 0,
                'created_at': qa.get('timestamp')
            })
        for dec in result.get('decisions', []):
            knowledge_out.append({
                'id': 0,
                'question': dec.get('decision'),
                'answer': '',
                'tags': [],
                'relevance_score': 0,
                'usage_count': 0,
                'created_at': dec.get('timestamp')
            })
        for entry in result.get('knowledge_entries', []):
            knowledge_out.append({
                'id': 0,
                'question': f"Topic: {entry.get('topic', 'General')}",
                'answer': entry.get('summary', ''),
                'tags': [entry.get('topic')] if entry.get('topic') else [],
                'relevance_score': 0,
                'usage_count': entry.get('message_count', 0),
                'created_at': entry.get('timestamp')
            })

        return jsonify({'success': True, 'knowledge': knowledge_out}), 200
    except Exception as e:
        print(f"[AGENTS API] Error in extract_knowledge_channel: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/knowledge/extract', methods=['POST'])
@jwt_required()
def extract_knowledge_time():
    """Extract knowledge across accessible channels within a time window (community-scoped)."""
    try:
        username = get_jwt_identity()
        data = request.get_json() or {}
        time_period_hours = int(data.get('time_period_hours', 24))
        topic_filter = data.get('topic')
        community_id = data.get('community_id')

        if not community_id:
            return jsonify({'error': 'community_id is required'}), 400

        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404

            # Ensure membership in the requested community
            cur.execute(
                """
                SELECT 1 FROM community_members
                WHERE community_id = %s AND user_id = %s
                """,
                (community_id, user_id)
            )
            if not cur.fetchone():
                return jsonify({'error': 'Access denied to this community'}), 403

            # Get channels user is member of within the specified community
            cur.execute(
                """
                SELECT cm.channel_id
                FROM channel_members cm
                JOIN channels c ON cm.channel_id = c.id
                WHERE cm.user_id = %s AND c.community_id = %s
                """,
                (user_id, community_id)
            )
            channel_rows = cur.fetchall()
            channel_ids = [r['channel_id'] for r in channel_rows]

        conn.close()

        # Use v2 agent for better extraction
        total_faqs = 0
        total_definitions = 0
        total_decisions = 0
        extracted_channels = []
        
        for cid in channel_ids:
            # Use new v2 agent
            result = _get_agent("knowledge_builder_v2").extract_knowledge(channel_id=cid, time_period_hours=time_period_hours)
            
            if result.get('success'):
                faqs = result.get('faqs', 0)
                definitions = result.get('definitions', 0)
                decisions = result.get('decisions', 0)
                
                total_faqs += faqs
                total_definitions += definitions
                total_decisions += decisions
                
                extracted_channels.append({
                    'channel_id': cid,
                    'faqs': faqs,
                    'definitions': definitions,
                    'decisions': decisions,
                    'total': result.get('total_items', 0)
                })

        return jsonify({
            'success': True,
            'time_period_hours': time_period_hours,
            'channels_processed': extracted_channels,
            'total_items': total_faqs + total_definitions + total_decisions,
            'faqs': total_faqs,
            'definitions': total_definitions,
            'decisions': total_decisions,
            'message': f'Extracted {total_faqs} FAQs, {total_definitions} definitions, and {total_decisions} decisions'
        }), 200
    except Exception as e:
        print(f"[AGENTS API] Error in extract_knowledge_time: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/knowledge/search', methods=['GET'])
@jwt_required()
def search_knowledge():
    """Search knowledge base entries by text with optional channel/community filter."""
    try:
        username = get_jwt_identity()
        query = request.args.get('query', '', type=str)
        channel_id = request.args.get('channel_id', None, type=int)
        community_id = request.args.get('community_id', None, type=int)

        # Basic access validation if channel_id provided
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            if channel_id:
                cur.execute(
                    """
                    SELECT 1 FROM channel_members WHERE channel_id = %s AND user_id = %s
                    """,
                    (channel_id, user_id)
                )
                if not cur.fetchone():
                    return jsonify({'error': 'Access denied'}), 403
            elif community_id:
                # Validate community membership
                cur.execute(
                    """
                    SELECT 1 FROM community_members WHERE community_id = %s AND user_id = %s
                    """,
                    (community_id, user_id)
                )
                if not cur.fetchone():
                    return jsonify({'error': 'Access denied to this community'}), 403

        results = []
        with conn.cursor() as cur:
            if channel_id:
                cur.execute(
                    """
                    SELECT id, title, content, created_at
                    FROM knowledge_base
                    WHERE related_channel = %s AND (title LIKE %s OR content LIKE %s)
                    ORDER BY created_at DESC
                    LIMIT 50
                    """,
                    (channel_id, f"%{query}%", f"%{query}%")
                )
            elif community_id:
                cur.execute(
                    """
                    SELECT kb.id, kb.title, kb.content, kb.created_at
                    FROM knowledge_base kb
                    JOIN channels c ON kb.related_channel = c.id
                    WHERE c.community_id = %s
                      AND (kb.title LIKE %s OR kb.content LIKE %s)
                    ORDER BY kb.created_at DESC
                    LIMIT 50
                    """,
                    (community_id, f"%{query}%", f"%{query}%")
                )
            else:
                cur.execute(
                    """
                    SELECT id, title, content, created_at
                    FROM knowledge_base
                    WHERE (title LIKE %s OR content LIKE %s)
                    ORDER BY created_at DESC
                    LIMIT 50
                    """,
                    (f"%{query}%", f"%{query}%")
                )
            rows = cur.fetchall()
            for r in rows:
                try:
                    payload = json.loads(r['content']) if r['content'] else {}
                except Exception:
                    payload = {}
                # Map similar to get_knowledge_base
                entry = {
                    'id': r['id'],
                    'question': r['title'] or 'Knowledge',
                    'answer': '',
                    'tags': [],
                    'relevance_score': 0,
                    'usage_count': 0,
                    'created_at': r['created_at'].isoformat() if r.get('created_at') else None
                }
                if payload.get('type') == 'qa':
                    entry.update({
                        'question': payload.get('question') or entry['question'],
                        'answer': payload.get('answer') or entry['answer'],
                        'tags': payload.get('tags') or []
                    })
                elif payload.get('type') == 'topic':
                    entry.update({
                        'question': f"Topic: {payload.get('topic', entry['question'])}",
                        'answer': payload.get('summary') or entry['answer'],
                        'tags': [payload.get('topic')] if payload.get('topic') else []
                    })
                elif payload.get('type') == 'decision':
                    entry.update({
                        'question': payload.get('decision') or entry['question'],
                        'answer': ''
                    })
                elif payload.get('type') == 'resource':
                    entry.update({
                        'answer': payload.get('url') or ''
                    })
                results.append(entry)
        conn.close()
        return jsonify({'success': True, 'results': results}), 200
    except Exception as e:
        print(f"[AGENTS API] Error in search_knowledge: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# =====================================
# FOCUS AGENT ROUTES
# =====================================

@agents_bp.route('/focus/analyze', methods=['POST'])
@jwt_required()
def analyze_focus():
    """Analyze conversation focus for a channel within a time window."""
    conn = None
    try:
        data = request.get_json() or {}
        time_period_hours = data.get('time_period_hours', 1)
        channel_id = data.get('channel_id')

        print(f"[AGENTS API] Focus analyze request: channel_id={channel_id}, hours={time_period_hours}")

        # Identify current user
        username = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                print(f'[AGENTS API] User not found: {username}')
                return jsonify({'error': 'User not found'}), 404

            # Resolve channel if not provided: pick most recent channel the user chatted in
            if not channel_id:
                cur.execute(
                    """
                    SELECT m.channel_id
                    FROM messages m
                    WHERE m.sender_id = %s
                    ORDER BY m.created_at DESC
                    LIMIT 1
                    """,
                    (user_id,)
                )
                recent = cur.fetchone()
                if recent:
                    channel_id = recent['channel_id']
                else:
                    # fallback to any channel the user is a member of
                    cur.execute(
                        "SELECT channel_id FROM channel_members WHERE user_id = %s LIMIT 1",
                        (user_id,)
                    )
                    member = cur.fetchone()
                    if member:
                        channel_id = member['channel_id']

            if not channel_id:
                print(f"[AGENTS API] No channel found for user {user_id}")
                return jsonify({'error': 'No channel activity found. Provide channel_id to analyze focus.'}), 400

            print(f"[AGENTS API] Analyzing channel {channel_id} for user {user_id}")

        # Run analysis (focus_agent opens its own DB connection)
        result = _get_agent("focus").analyze_focus(channel_id=channel_id, time_period_hours=time_period_hours)

        print(f"[AGENTS API] Focus analysis result: success={result.get('success')}, error={result.get('error')}")

        # Format response to match frontend expectations
        if result.get('success'):
            # Convert focus_score from 0-1 to 0-100 scale
            raw_score = result.get('focus_score', 0)
            focus_score_100 = int(raw_score * 100) if raw_score <= 1 else int(raw_score)
            
            # Get topic shifts count (it's an array of shift objects)
            topic_shifts = result.get('topic_shifts', [])
            shifts_count = len(topic_shifts) if isinstance(topic_shifts, list) else topic_shifts
            
            response_data = {
                'success': True,
                'analysis': {
                    'focus_score': focus_score_100,
                    'main_topics': result.get('dominant_topics', []),
                    'focus_shifts': shifts_count,
                    'analysis_period_hours': result.get('time_period_hours', time_period_hours),
                    'total_messages': result.get('message_count', 0),
                    'recommendations': [result.get('recommendation', 'No recommendations available')]
                }
            }
            print(f"[AGENTS API] Returning successful analysis: score={response_data['analysis']['focus_score']}")
            return jsonify(response_data), 200
        else:
            print(f"[AGENTS API] Analysis failed: {result.get('error')}")
            return jsonify(result), 400

    except Exception as e:
        print(f"[AGENTS API] Error in analyze_focus: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            conn.close()

@agents_bp.route('/focus/metrics', methods=['GET'])
@jwt_required()
def get_focus_metrics():
    """Get focus metrics"""
    try:
        username = get_jwt_identity()
        days = request.args.get('days', 7, type=int)
        
        print(f"[AGENTS API] Getting focus metrics for user: {username}, days: {days}")
        
        # Return mock data with proper structure
        metrics = {
            'totalSessions': 0,
            'totalFocusTime': 0,
            'averageSessionLength': 0,
            'completionRate': 0,
            'weeklyStreak': 0,
            'monthlyHours': 0
        }
        
        return jsonify(metrics), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_focus_metrics: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@agents_bp.route('/focus/recommendations', methods=['GET'])
@jwt_required()
def get_focus_recommendations():
    """Get focus recommendations"""
    try:
        username = get_jwt_identity()
        
        print(f"[AGENTS API] Getting focus recommendations for user: {username}")
        
        # Return helpful mock recommendations
        recommendations = [
            {
                'type': 'technique',
                'title': 'Try the Pomodoro Technique',
                'description': 'Work in 25-minute focused sessions with 5-minute breaks',
                'priority': 'high'
            },
            {
                'type': 'environment',
                'title': 'Minimize Distractions',
                'description': 'Turn off notifications and create a dedicated workspace',
                'priority': 'medium'
            },
            {
                'type': 'break',
                'title': 'Take Regular Breaks',
                'description': 'Step away from your screen every hour to maintain focus',
                'priority': 'medium'
            }
        ]
        
        return jsonify(recommendations), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_focus_recommendations: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


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


# =====================================
# KNOWLEDGE BUILDER V2 ROUTES
# =====================================

@agents_bp.route('/knowledge/stats', methods=['GET'])
@jwt_required()
def get_knowledge_stats():
    """
    Get knowledge base statistics
    
    Query Params:
        - community_id: Filter by community (required for scoping)
    
    Returns:
        Statistics about stored knowledge items
    """
    conn = None
    try:
        username = get_jwt_identity()
        community_id = request.args.get('community_id', type=int)
        
        if not community_id:
            return jsonify({'error': 'community_id is required'}), 400
        
        # Get user ID
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            # Verify community membership
            cur.execute("""
                SELECT 1 FROM community_members
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            
            if not cur.fetchone():
                return jsonify({'error': 'Access denied to this community'}), 403
            
            # Get stats scoped to community
            cur.execute("""
                SELECT content FROM knowledge_base kb
                JOIN channels c ON kb.related_channel = c.id
                WHERE c.community_id = %s
            """, (community_id,))
            
            items = cur.fetchall()
            
            # Count by type (support both old and new types)
            by_type = {'faq': 0, 'definition': 0, 'decision': 0}
            
            for item in items:
                try:
                    content = json.loads(item['content'])
                    item_type = content.get('type', 'unknown')
                    
                    # Map old types to new categories for backward compatibility
                    if item_type == 'qa':  # Old Q&A type maps to FAQ
                        by_type['faq'] += 1
                    elif item_type == 'topic':  # Old topic type (skip or count separately)
                        pass  # Topics are not FAQs, so don't count
                    elif item_type in by_type:  # New types: faq, definition, decision
                        by_type[item_type] += 1
                except:
                    continue
            
            return jsonify({
                'success': True,
                'total_items': len(items),
                'by_type': by_type,
                'note': 'Stats include both legacy (qa) and new (faq/definition/decision) types'
            }), 200
            
    except Exception as e:
        print(f"[AGENTS API] Error in get_knowledge_stats: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/knowledge/recent', methods=['GET'])
@jwt_required()
def get_recent_knowledge():
    """
    Get recent knowledge items
    
    Query Params:
        - community_id: Filter by community (required)
        - limit: Max results (optional, default 20)
    
    Returns:
        List of recent knowledge items with parsed content
    """
    conn = None
    try:
        username = get_jwt_identity()
        community_id = request.args.get('community_id', type=int)
        limit = request.args.get('limit', default=20, type=int)
        
        if not community_id:
            return jsonify({'error': 'community_id is required'}), 400
        
        # Get user ID
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            # Verify community membership
            cur.execute("""
                SELECT 1 FROM community_members
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            
            if not cur.fetchone():
                return jsonify({'error': 'Access denied to this community'}), 403
            
            # Get recent items scoped to community
            cur.execute("""
                SELECT 
                    kb.id,
                    kb.title,
                    kb.content,
                    kb.source,
                    kb.created_at,
                    c.name as channel_name
                FROM knowledge_base kb
                JOIN channels c ON kb.related_channel = c.id
                WHERE c.community_id = %s
                ORDER BY kb.created_at DESC
                LIMIT %s
            """, (community_id, limit))
            
            items = cur.fetchall()
            
            # Parse and format items
            formatted_items = []
            for item in items:
                try:
                    content = json.loads(item['content'])
                    formatted_items.append({
                        'id': item['id'],
                        'title': item['title'],
                        'type': content.get('type', 'unknown'),
                        'question': content.get('question', item['title']),
                        'answer': content.get('answer', ''),
                        'tags': content.get('tags', []),
                        'channel_name': item['channel_name'],
                        'created_at': item['created_at'].isoformat() if hasattr(item['created_at'], 'isoformat') else str(item['created_at'])
                    })
                except Exception as e:
                    print(f"[KB Recent] Error parsing item {item['id']}: {e}")
                    continue
            
            return jsonify({
                'success': True,
                'items': formatted_items
            }), 200
            
    except Exception as e:
        print(f"[AGENTS API] Error in get_recent_knowledge: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


# ======================================================================
# AGENT CATALOG & MANAGEMENT ROUTES
# ======================================================================

def _get_user_id(username):
    """Helper: Get user ID from username."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            row = cur.fetchone()
            return row['id'] if row else None
    finally:
        conn.close()


def _check_community_admin(user_id, community_id):
    """Helper: Check if user is admin or owner of a community."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT role FROM community_members
                WHERE community_id = %s AND user_id = %s AND role IN ('admin', 'owner')
            """, (community_id, user_id))
            return cur.fetchone() is not None
    finally:
        conn.close()


def _check_community_member(user_id, community_id):
    """Helper: Check if user is a member of a community."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 1 FROM community_members
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            return cur.fetchone() is not None
    finally:
        conn.close()


@agents_bp.route('/catalog', methods=['GET'])
@jwt_required()
def get_agent_catalog():
    """
    Get the full agent catalog with install status per community/user.
    
    Query params:
        - community_id (optional): Show install status for this community
    
    Returns:
        List of all agents with metadata, features, and install status
    """
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404
        
        community_id = request.args.get('community_id', type=int)
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get all agents from registry
            cur.execute("""
                SELECT agent_type, display_name, description, category, icon,
                       default_settings, features, is_active
                FROM agent_registry
                WHERE is_active = TRUE
                ORDER BY category, display_name
            """)
            agents = cur.fetchall()
            
            # Get user's personal agents
            cur.execute("""
                SELECT agent_type, enabled, settings, activated_at, last_used, usage_count
                FROM user_agents WHERE user_id = %s
            """, (user_id,))
            personal = {r['agent_type']: r for r in cur.fetchall()}
            
            # Get community agents if community_id provided
            community_installed = {}
            if community_id:
                cur.execute("""
                    SELECT ca.agent_type, ca.enabled, ca.settings, ca.installed_at,
                           ca.last_active, ca.usage_count, u.username as installed_by
                    FROM community_agents ca
                    JOIN users u ON ca.installed_by = u.id
                    WHERE ca.community_id = %s
                """, (community_id,))
                community_installed = {r['agent_type']: r for r in cur.fetchall()}
        
        catalog = []
        for agent in agents:
            frontend_type = _display_agent_type(agent['agent_type'])
            entry = {
                'agent_type': frontend_type,
                'display_name': agent['display_name'],
                'description': agent['description'],
                'category': agent['category'],
                'icon': agent['icon'],
                'default_settings': json.loads(agent['default_settings']) if agent['default_settings'] else {},
                'features': json.loads(agent['features']) if agent['features'] else [],
            }
            
            # Add personal install status
            if agent['category'] == 'personal' and agent['agent_type'] in personal:
                p = personal[agent['agent_type']]
                entry['personal_status'] = {
                    'activated': True,
                    'enabled': p['enabled'],
                    'settings': json.loads(p['settings']) if p['settings'] else None,
                    'activated_at': p['activated_at'].isoformat() if p['activated_at'] else None,
                    'last_used': p['last_used'].isoformat() if p['last_used'] else None,
                    'usage_count': p['usage_count'],
                }
            else:
                entry['personal_status'] = {'activated': False}
            
            # Add community install status
            if community_id and agent['agent_type'] in community_installed:
                c = community_installed[agent['agent_type']]
                entry['community_status'] = {
                    'installed': True,
                    'enabled': c['enabled'],
                    'settings': json.loads(c['settings']) if c['settings'] else None,
                    'installed_by': c['installed_by'],
                    'installed_at': c['installed_at'].isoformat() if c['installed_at'] else None,
                    'last_active': c['last_active'].isoformat() if c['last_active'] else None,
                    'usage_count': c['usage_count'],
                }
            elif community_id:
                entry['community_status'] = {'installed': False}
            
            catalog.append(entry)
        
        return jsonify({'success': True, 'agents': catalog}), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_agent_catalog: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/install/community/<int:community_id>', methods=['POST'])
@jwt_required()
def install_community_agent(community_id):
    """
    Install an agent for a community. Only admins/owners can install.
    
    Body:
        - agent_type: str (required)
        - settings: dict (optional, overrides defaults)
    """
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404
        
        # Check admin permission
        if not _check_community_admin(user_id, community_id):
            return jsonify({'error': 'Only community admins can install agents'}), 403
        
        data = request.get_json() or {}
        agent_type = data.get('agent_type')
        if not agent_type:
            return jsonify({'error': 'agent_type is required'}), 400
        agent_type = _normalize_agent_type(agent_type)
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Verify agent exists and is a community agent
            cur.execute("""
                SELECT agent_type, category, default_settings FROM agent_registry
                WHERE agent_type = %s AND is_active = TRUE
            """, (agent_type,))
            agent = cur.fetchone()
            
            if not agent:
                return jsonify({'error': 'Agent not found'}), 404
            if agent['category'] != 'community':
                return jsonify({'error': 'This is a personal agent, use /activate/personal instead'}), 400
            
            # Check if already installed
            cur.execute("""
                SELECT id FROM community_agents
                WHERE community_id = %s AND agent_type = %s
            """, (community_id, agent_type))
            if cur.fetchone():
                return jsonify({'error': 'Agent already installed in this community'}), 409
            
            # Merge provided settings with defaults
            default_settings = json.loads(agent['default_settings']) if agent['default_settings'] else {}
            custom_settings = data.get('settings', {})
            merged_settings = {**default_settings, **custom_settings}
            
            # Install
            cur.execute("""
                INSERT INTO community_agents (community_id, agent_type, enabled, settings, installed_by)
                VALUES (%s, %s, TRUE, %s, %s)
            """, (community_id, agent_type, json.dumps(merged_settings), user_id))
            conn.commit()
        
        # Invalidate cache
        try:
            from services.redis_client import invalidate_installed_agents, invalidate_agent_settings
            invalidate_installed_agents(community_id)
            invalidate_agent_settings(community_id, agent_type)
        except Exception:
            pass
        
        return jsonify({
            'success': True,
            'message': f'{agent_type} agent installed successfully',
            'agent_type': agent_type,
            'community_id': community_id,
        }), 201
        
    except Exception as e:
        print(f"[AGENTS API] Error installing agent: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/uninstall/community/<int:community_id>/<agent_type>', methods=['DELETE'])
@jwt_required()
def uninstall_community_agent(community_id, agent_type):
    """Uninstall an agent from a community. Admins/owners only."""
    agent_type = _normalize_agent_type(agent_type)
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404
        
        if not _check_community_admin(user_id, community_id):
            return jsonify({'error': 'Only community admins can uninstall agents'}), 403
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                DELETE FROM community_agents
                WHERE community_id = %s AND agent_type = %s
            """, (community_id, agent_type))
            
            if cur.rowcount == 0:
                return jsonify({'error': 'Agent not installed in this community'}), 404
            
            conn.commit()
        
        try:
            from services.redis_client import invalidate_installed_agents, invalidate_agent_settings
            invalidate_installed_agents(community_id)
            invalidate_agent_settings(community_id, agent_type)
        except Exception:
            pass
        
        return jsonify({
            'success': True,
            'message': f'{agent_type} agent uninstalled',
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error uninstalling agent: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/configure/community/<int:community_id>/<agent_type>', methods=['PUT'])
@jwt_required()
def configure_community_agent(community_id, agent_type):
    """
    Update settings for an installed community agent. Admins/owners only.
    
    Body:
        - settings: dict (merged with existing)
        - enabled: bool (optional)
    """
    agent_type = _normalize_agent_type(agent_type)
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404
        
        if not _check_community_admin(user_id, community_id):
            return jsonify({'error': 'Only community admins can configure agents'}), 403
        
        data = request.get_json() or {}
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get current settings
            cur.execute("""
                SELECT id, settings, enabled FROM community_agents
                WHERE community_id = %s AND agent_type = %s
            """, (community_id, agent_type))
            current = cur.fetchone()
            
            if not current:
                return jsonify({'error': 'Agent not installed in this community'}), 404
            
            # Merge settings
            current_settings = json.loads(current['settings']) if current['settings'] else {}
            new_settings = data.get('settings', {})
            merged = {**current_settings, **new_settings}
            
            # Update
            enabled = data.get('enabled', current['enabled'])
            cur.execute("""
                UPDATE community_agents
                SET settings = %s, enabled = %s
                WHERE community_id = %s AND agent_type = %s
            """, (json.dumps(merged), enabled, community_id, agent_type))
            conn.commit()
        
        try:
            from services.redis_client import invalidate_agent_settings, invalidate_installed_agents
            invalidate_agent_settings(community_id, agent_type)
            invalidate_installed_agents(community_id)
        except Exception:
            pass
        
        return jsonify({
            'success': True,
            'settings': merged,
            'enabled': enabled,
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error configuring agent: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


# â”€â”€ Summarizer Scheduler Endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@agents_bp.route('/summarizer/schedule/<int:community_id>', methods=['GET'])
@jwt_required()
def get_summarizer_schedule(community_id):
    """Get the auto-summarize schedule settings for a community."""
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404

        if not _check_community_member(user_id, community_id):
            return jsonify({'error': 'Access denied'}), 403

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT settings, enabled FROM community_agents
                WHERE community_id = %s AND agent_type = 'summarizer'
            """, (community_id,))
            row = cur.fetchone()

        if not row:
            return jsonify({'error': 'Summarizer agent not installed'}), 404

        settings = json.loads(row['settings']) if row['settings'] else {}
        return jsonify({
            'success': True,
            'auto_summarize_enabled': settings.get('auto_summarize_enabled', False),
            'schedule_time': settings.get('schedule_time', '21:00'),
            'auto_summarize_message_count': settings.get('auto_summarize_message_count', 200),
            'last_auto_summary_date': settings.get('last_auto_summary_date', ''),
            'agent_enabled': row['enabled'],
        }), 200

    except Exception as e:
        print(f"[AGENTS API] Error getting summarizer schedule: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/summarizer/trigger/<int:community_id>', methods=['POST'])
@jwt_required()
def trigger_auto_summarize(community_id):
    """Manually trigger auto-summarize for a community (admin only). Posts bot messages."""
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404

        if not _check_community_admin(user_id, community_id):
            return jsonify({'error': 'Only community admins can trigger auto-summarize'}), 403

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT settings, enabled, installed_by FROM community_agents
                WHERE community_id = %s AND agent_type = 'summarizer'
            """, (community_id,))
            row = cur.fetchone()

        if not row:
            return jsonify({'error': 'Summarizer agent not installed'}), 404
        if not row['enabled']:
            return jsonify({'error': 'Summarizer agent is disabled'}), 400

        conn.close()
        conn = None

        settings = json.loads(row['settings']) if row['settings'] else {}
        message_count = settings.get('auto_summarize_message_count', 200)
        sender_id = row['installed_by']

        from agents.summarizer import SummarizerAgent
        from tasks.agent_tasks import _format_summary_as_bot_message, _post_bot_message

        agent = SummarizerAgent()
        c = get_db_connection()
        try:
            with c.cursor() as cur:
                cur.execute("""
                    SELECT id, name FROM channels 
                    WHERE community_id = %s AND type = 'text'
                """, (community_id,))
                channels = cur.fetchall()
        finally:
            c.close()

        results = []
        for channel in channels:
            try:
                result = agent.summarize_channel(channel['id'], message_count, user_id)
                if result and result.get('success'):
                    bot_message = _format_summary_as_bot_message(result, channel['name'])
                    msg_id = _post_bot_message(channel['id'], community_id, bot_message, sender_id)
                    results.append({
                        'channel_id': channel['id'],
                        'channel_name': channel['name'],
                        'success': True,
                        'message_id': msg_id,
                    })
                else:
                    results.append({
                        'channel_id': channel['id'],
                        'channel_name': channel['name'],
                        'success': False,
                        'reason': 'No messages to summarize',
                    })
            except Exception as ch_err:
                results.append({
                    'channel_id': channel['id'],
                    'channel_name': channel['name'],
                    'success': False,
                    'reason': str(ch_err),
                })

        return jsonify({
            'success': True,
            'channels_processed': len(results),
            'results': results,
        }), 200

    except Exception as e:
        print(f"[AGENTS API] Error triggering auto-summarize: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/status/community/<int:community_id>', methods=['GET'])
@jwt_required()
def get_community_agent_status(community_id):
    """Get all installed agents for a community with their status."""
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404
        
        # Members can view, but must be a member
        if not _check_community_member(user_id, community_id):
            return jsonify({'error': 'Access denied'}), 403
        
        # Try cache first
        try:
            from services.redis_client import get_installed_agents, set_installed_agents
            cached = get_installed_agents(community_id)
            if cached:
                return jsonify({'success': True, 'agents': cached}), 200
        except Exception:
            pass
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT ca.agent_type, ca.enabled, ca.settings, ca.installed_at,
                       ca.last_active, ca.usage_count,
                       ar.display_name, ar.description, ar.icon, ar.category, ar.features,
                       u.username as installed_by
                FROM community_agents ca
                JOIN agent_registry ar ON ca.agent_type = ar.agent_type
                JOIN users u ON ca.installed_by = u.id
                WHERE ca.community_id = %s
                ORDER BY ca.installed_at DESC
            """, (community_id,))
            agents = cur.fetchall()
        
        result = []
        for a in agents:
            result.append({
                'agent_type': _display_agent_type(a['agent_type']),
                'display_name': a['display_name'],
                'description': a['description'],
                'icon': a['icon'],
                'category': a['category'],
                'features': json.loads(a['features']) if a['features'] else [],
                'enabled': a['enabled'],
                'settings': json.loads(a['settings']) if a['settings'] else {},
                'installed_by': a['installed_by'],
                'installed_at': a['installed_at'].isoformat() if a['installed_at'] else None,
                'last_active': a['last_active'].isoformat() if a['last_active'] else None,
                'usage_count': a['usage_count'],
            })
        
        # Cache the result
        try:
            set_installed_agents(community_id, result)
        except Exception:
            pass
        
        return jsonify({'success': True, 'agents': result}), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error getting community status: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/activate/personal', methods=['POST'])
@jwt_required()
def activate_personal_agent():
    """
    Activate a personal agent for the current user.
    
    Body:
        - agent_type: str (required)
        - settings: dict (optional)
    """
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404
        
        data = request.get_json() or {}
        agent_type = data.get('agent_type')
        if not agent_type:
            return jsonify({'error': 'agent_type is required'}), 400
        agent_type = _normalize_agent_type(agent_type)
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Verify agent exists and is a personal agent
            cur.execute("""
                SELECT agent_type, category, default_settings FROM agent_registry
                WHERE agent_type = %s AND is_active = TRUE
            """, (agent_type,))
            agent = cur.fetchone()
            
            if not agent:
                return jsonify({'error': 'Agent not found'}), 404
            if agent['category'] != 'personal':
                return jsonify({'error': 'This is a community agent, use /install/community instead'}), 400
            
            # Check if already activated
            cur.execute("""
                SELECT id, enabled FROM user_agents
                WHERE user_id = %s AND agent_type = %s
            """, (user_id, agent_type))
            existing = cur.fetchone()
            
            if existing:
                if existing['enabled']:
                    return jsonify({'error': 'Agent already activated'}), 409
                # Re-activate if disabled
                cur.execute("""
                    UPDATE user_agents SET enabled = TRUE WHERE id = %s
                """, (existing['id'],))
                conn.commit()
                return jsonify({'success': True, 'message': f'{agent_type} re-activated'}), 200
            
            # Merge settings
            default_settings = json.loads(agent['default_settings']) if agent['default_settings'] else {}
            custom_settings = data.get('settings', {})
            merged_settings = {**default_settings, **custom_settings}
            
            cur.execute("""
                INSERT INTO user_agents (user_id, agent_type, enabled, settings)
                VALUES (%s, %s, TRUE, %s)
            """, (user_id, agent_type, json.dumps(merged_settings)))
            conn.commit()
        
        try:
            from services.redis_client import invalidate_personal_agents
            invalidate_personal_agents(user_id)
        except Exception:
            pass
        
        return jsonify({
            'success': True,
            'message': f'{agent_type} activated',
        }), 201
        
    except Exception as e:
        print(f"[AGENTS API] Error activating personal agent: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/deactivate/personal/<agent_type>', methods=['DELETE'])
@jwt_required()
def deactivate_personal_agent(agent_type):
    """Deactivate a personal agent for the current user."""
    agent_type = _normalize_agent_type(agent_type)
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE user_agents SET enabled = FALSE
                WHERE user_id = %s AND agent_type = %s
            """, (user_id, agent_type))
            
            if cur.rowcount == 0:
                return jsonify({'error': 'Agent not activated'}), 404
            conn.commit()
        
        try:
            from services.redis_client import invalidate_personal_agents
            invalidate_personal_agents(user_id)
        except Exception:
            pass
        
        return jsonify({'success': True, 'message': f'{agent_type} deactivated'}), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error deactivating agent: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/status/personal', methods=['GET'])
@jwt_required()
def get_personal_agent_status():
    """Get all personal agents for the current user with their status."""
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404
        
        # Try cache first
        try:
            from services.redis_client import get_personal_agents, set_personal_agents
            cached = get_personal_agents(user_id)
            if cached:
                return jsonify({'success': True, 'agents': cached}), 200
        except Exception:
            pass
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT ua.agent_type, ua.enabled, ua.settings, ua.activated_at,
                       ua.last_used, ua.usage_count,
                       ar.display_name, ar.description, ar.icon, ar.features
                FROM user_agents ua
                JOIN agent_registry ar ON ua.agent_type = ar.agent_type
                WHERE ua.user_id = %s
                ORDER BY ua.activated_at DESC
            """, (user_id,))
            agents = cur.fetchall()
        
        result = []
        for a in agents:
            result.append({
                'agent_type': _display_agent_type(a['agent_type']),
                'display_name': a['display_name'],
                'description': a['description'],
                'icon': a['icon'],
                'features': json.loads(a['features']) if a['features'] else [],
                'enabled': a['enabled'],
                'settings': json.loads(a['settings']) if a['settings'] else {},
                'activated_at': a['activated_at'].isoformat() if a['activated_at'] else None,
                'last_used': a['last_used'].isoformat() if a['last_used'] else None,
                'usage_count': a['usage_count'],
            })
        
        try:
            set_personal_agents(user_id, result)
        except Exception:
            pass
        
        return jsonify({'success': True, 'agents': result}), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error getting personal status: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/configure/personal/<agent_type>', methods=['PUT'])
@jwt_required()
def configure_personal_agent(agent_type):
    """
    Update settings for a personal agent.
    
    Body:
        - settings: dict (merged with existing)
        - enabled: bool (optional)
    """
    agent_type = _normalize_agent_type(agent_type)
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404
        
        data = request.get_json() or {}
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, settings, enabled FROM user_agents
                WHERE user_id = %s AND agent_type = %s
            """, (user_id, agent_type))
            current = cur.fetchone()
            
            if not current:
                return jsonify({'error': 'Agent not activated'}), 404
            
            current_settings = json.loads(current['settings']) if current['settings'] else {}
            new_settings = data.get('settings', {})
            merged = {**current_settings, **new_settings}
            enabled = data.get('enabled', current['enabled'])
            
            cur.execute("""
                UPDATE user_agents SET settings = %s, enabled = %s
                WHERE user_id = %s AND agent_type = %s
            """, (json.dumps(merged), enabled, user_id, agent_type))
            conn.commit()
        
        try:
            from services.redis_client import invalidate_personal_agents
            invalidate_personal_agents(user_id)
        except Exception:
            pass
        
        return jsonify({'success': True, 'settings': merged, 'enabled': enabled}), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error configuring personal agent: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/logs', methods=['GET'])
@jwt_required()
def get_agent_logs():
    """
    Get paginated agent execution logs.
    
    Query params:
        - agent_type: Filter by agent type
        - community_id: Filter by community
        - status: Filter by status (success/error/partial)
        - page: Page number (default 1)
        - limit: Items per page (default 20, max 100)
    """
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404
        
        agent_type = request.args.get('agent_type')
        community_id = request.args.get('community_id', type=int)
        status = request.args.get('status')
        page = max(1, request.args.get('page', 1, type=int))
        limit = min(100, max(1, request.args.get('limit', 20, type=int)))
        offset = (page - 1) * limit
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Build query
            where = ["1=1"]
            params = []
            
            if agent_type:
                where.append("agent_name = %s")
                params.append(agent_type)
            if community_id:
                where.append("community_id = %s")
                params.append(community_id)
            if status:
                where.append("status = %s")
                params.append(status)
            
            where_clause = " AND ".join(where)
            
            # Count total
            cur.execute(f"SELECT COUNT(*) as total FROM ai_agent_logs WHERE {where_clause}", params)
            total = cur.fetchone()['total']
            
            # Get page
            cur.execute(f"""
                SELECT id, agent_name, action_type, input_data, output_data,
                       status, execution_time_ms, community_id, user_id, created_at
                FROM ai_agent_logs
                WHERE {where_clause}
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
            """, params + [limit, offset])
            logs = cur.fetchall()
        
        result = []
        for log in logs:
            result.append({
                'id': log['id'],
                'agent_name': log['agent_name'],
                'action_type': log['action_type'],
                'input_data': log['input_data'][:500] if log['input_data'] else None,
                'output_data': log['output_data'][:500] if log['output_data'] else None,
                'status': log['status'],
                'execution_time_ms': log['execution_time_ms'],
                'community_id': log['community_id'],
                'user_id': log['user_id'],
                'created_at': log['created_at'].isoformat() if log['created_at'] else None,
            })
        
        return jsonify({
            'success': True,
            'logs': result,
            'pagination': {
                'page': page,
                'limit': limit,
                'total': total,
                'pages': (total + limit - 1) // limit,
            }
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error getting logs: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


# ======================================================================
# MY SUMMARIES â€” User's generated summary history
# ======================================================================

@agents_bp.route('/my-summaries', methods=['GET'])
@jwt_required()
def get_my_summaries():
    """Get all summaries generated by the current user, optionally filtered by channel."""
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404

        channel_id = request.args.get('channel_id', type=int)
        limit = min(request.args.get('limit', 20, type=int), 50)

        conn = get_db_connection()
        with conn.cursor() as cur:
            if channel_id:
                cur.execute("""
                    SELECT cs.id, cs.channel_id, cs.summary, cs.generated_by, cs.created_at,
                           cs.message_count, cs.method, cs.participants, c.name AS channel_name
                    FROM conversation_summaries cs
                    LEFT JOIN channels c ON c.id = cs.channel_id
                    WHERE cs.created_by = %s AND cs.channel_id = %s
                    ORDER BY cs.created_at DESC
                    LIMIT %s
                """, (user_id, channel_id, limit))
            else:
                cur.execute("""
                    SELECT cs.id, cs.channel_id, cs.summary, cs.generated_by, cs.created_at,
                           cs.message_count, cs.method, cs.participants, c.name AS channel_name
                    FROM conversation_summaries cs
                    LEFT JOIN channels c ON c.id = cs.channel_id
                    WHERE cs.created_by = %s
                    ORDER BY cs.created_at DESC
                    LIMIT %s
                """, (user_id, limit))

            rows = cur.fetchall()
            import json
            summaries = []
            for r in rows:
                participants = r.get('participants', '[]')
                if isinstance(participants, str):
                    try:
                        participants = json.loads(participants)
                    except Exception:
                        participants = []
                summaries.append({
                    'id': r['id'],
                    'channel_id': r['channel_id'],
                    'channel_name': r.get('channel_name', ''),
                    'summary': r['summary'],
                    'generated_by': r['generated_by'],
                    'created_at': r['created_at'].isoformat() if r['created_at'] else None,
                    'message_count': r.get('message_count', 0),
                    'method': r.get('method', 'extractive'),
                    'participants': participants,
                })

        return jsonify({'success': True, 'summaries': summaries}), 200

    except Exception as e:
        print(f"[AGENTS API] Error getting my summaries: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/my-summaries/<int:summary_id>', methods=['DELETE'])
@jwt_required()
def delete_my_summary(summary_id):
    """Delete a summary the current user generated."""
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM conversation_summaries WHERE id = %s AND created_by = %s", (summary_id, user_id))
            if not cur.fetchone():
                return jsonify({'error': 'Summary not found or access denied'}), 404
            cur.execute("DELETE FROM conversation_summaries WHERE id = %s AND created_by = %s", (summary_id, user_id))
            conn.commit()

        return jsonify({'success': True}), 200

    except Exception as e:
        print(f"[AGENTS API] Error deleting summary: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


# ======================================================================
# SUMMARY SCHEDULE ENDPOINTS â€” Per-user scheduled auto-summaries
# ======================================================================

@agents_bp.route('/summary-schedules', methods=['GET'])
@jwt_required()
def get_summary_schedules():
    """Get all summary schedules for the current user."""
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT s.id, s.channel_id, s.community_id, s.schedule_time,
                       s.timezone, s.is_active, s.last_triggered_at,
                       s.created_at, s.updated_at,
                       c.name AS channel_name, cm.name AS community_name
                FROM user_summary_schedules s
                JOIN channels c ON c.id = s.channel_id
                JOIN communities cm ON cm.id = s.community_id
                WHERE s.user_id = %s
                ORDER BY s.created_at DESC
            """, (user_id,))
            rows = cur.fetchall()

        schedules = []
        for r in rows:
            # MySQL TIME column returns timedelta; convert to HH:MM string
            sched_time = r['schedule_time']
            if hasattr(sched_time, 'total_seconds'):
                total_secs = int(sched_time.total_seconds())
                sched_time_str = f"{total_secs // 3600:02d}:{(total_secs % 3600) // 60:02d}"
            else:
                sched_time_str = str(sched_time)[:5]

            schedules.append({
                'id': r['id'],
                'channel_id': r['channel_id'],
                'community_id': r['community_id'],
                'channel_name': r['channel_name'],
                'community_name': r['community_name'],
                'schedule_time': sched_time_str,
                'timezone': r['timezone'],
                'is_active': bool(r['is_active']),
                'last_triggered_at': r['last_triggered_at'].isoformat() if r['last_triggered_at'] else None,
                'created_at': r['created_at'].isoformat() if r['created_at'] else None,
            })

        return jsonify({'success': True, 'schedules': schedules}), 200

    except Exception as e:
        print(f"[AGENTS API] Error getting schedules: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/summary-schedules', methods=['POST'])
@jwt_required()
def create_summary_schedule():
    """Create or update a summary schedule for a channel."""
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404

        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        channel_id = data.get('channel_id')
        schedule_time = data.get('schedule_time')  # "HH:MM" or "HH:MM:SS"

        if not channel_id or not schedule_time:
            return jsonify({'error': 'channel_id and schedule_time required'}), 400

        timezone = data.get('timezone', 'UTC')

        conn = get_db_connection()
        with conn.cursor() as cur:
            # Verify channel exists and get community_id
            cur.execute("SELECT id, community_id FROM channels WHERE id = %s", (channel_id,))
            ch = cur.fetchone()
            if not ch:
                return jsonify({'error': 'Channel not found'}), 404
            community_id = ch['community_id']

            # Verify user is a member of the community
            cur.execute("""
                SELECT 1 FROM community_members WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            if not cur.fetchone():
                return jsonify({'error': 'Not a member of this community'}), 403

            # Upsert â€” one schedule per user per channel
            cur.execute("""
                INSERT INTO user_summary_schedules
                    (user_id, channel_id, community_id, schedule_time, timezone, is_active)
                VALUES (%s, %s, %s, %s, %s, TRUE)
                ON DUPLICATE KEY UPDATE
                    schedule_time = VALUES(schedule_time),
                    timezone = VALUES(timezone),
                    is_active = TRUE,
                    updated_at = NOW()
            """, (user_id, channel_id, community_id, schedule_time, timezone))
            conn.commit()

            # Get the created/updated record
            cur.execute("""
                SELECT id, schedule_time, timezone, is_active, created_at
                FROM user_summary_schedules
                WHERE user_id = %s AND channel_id = %s
            """, (user_id, channel_id))
            row = cur.fetchone()

        return jsonify({
            'success': True,
            'schedule': {
                'id': row['id'],
                'channel_id': channel_id,
                'community_id': community_id,
                'schedule_time': str(row['schedule_time']),
                'timezone': row['timezone'],
                'is_active': bool(row['is_active']),
            }
        }), 201

    except Exception as e:
        print(f"[AGENTS API] Error creating schedule: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/summary-schedules/<int:schedule_id>', methods=['PUT'])
@jwt_required()
def update_summary_schedule(schedule_id):
    """Update an existing summary schedule (time, active status)."""
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404

        data = request.get_json() or {}

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id FROM user_summary_schedules WHERE id = %s AND user_id = %s
            """, (schedule_id, user_id))
            if not cur.fetchone():
                return jsonify({'error': 'Schedule not found'}), 404

            updates = []
            params = []
            if 'schedule_time' in data:
                updates.append("schedule_time = %s")
                params.append(data['schedule_time'])
            if 'timezone' in data:
                updates.append("timezone = %s")
                params.append(data['timezone'])
            if 'is_active' in data:
                updates.append("is_active = %s")
                params.append(bool(data['is_active']))

            if not updates:
                return jsonify({'error': 'No fields to update'}), 400

            params.append(schedule_id)
            cur.execute(f"UPDATE user_summary_schedules SET {', '.join(updates)} WHERE id = %s", params)
            conn.commit()

        return jsonify({'success': True, 'message': 'Schedule updated'}), 200

    except Exception as e:
        print(f"[AGENTS API] Error updating schedule: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/summary-schedules/<int:schedule_id>', methods=['DELETE'])
@jwt_required()
def delete_summary_schedule(schedule_id):
    """Delete a summary schedule."""
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("DELETE FROM user_summary_schedules WHERE id = %s AND user_id = %s", (schedule_id, user_id))
            if cur.rowcount == 0:
                return jsonify({'error': 'Schedule not found'}), 404
            conn.commit()

        return jsonify({'success': True, 'message': 'Schedule deleted'}), 200

    except Exception as e:
        print(f"[AGENTS API] Error deleting schedule: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/summary-schedules/pending', methods=['GET'])
@jwt_required()
def get_pending_summaries():
    """Get undelivered scheduled summaries for the current user, optionally filtered by channel."""
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404

        channel_id = request.args.get('channel_id', type=int)

        conn = get_db_connection()
        with conn.cursor() as cur:
            if channel_id:
                cur.execute("""
                    SELECT id, channel_id, community_id, content, method, message_count, created_at
                    FROM scheduled_summaries
                    WHERE user_id = %s AND channel_id = %s AND is_delivered = FALSE
                    ORDER BY created_at DESC LIMIT 5
                """, (user_id, channel_id))
            else:
                cur.execute("""
                    SELECT id, channel_id, community_id, content, method, message_count, created_at
                    FROM scheduled_summaries
                    WHERE user_id = %s AND is_delivered = FALSE
                    ORDER BY created_at DESC LIMIT 20
                """, (user_id,))
            rows = cur.fetchall()

            # Mark as delivered
            if rows:
                ids = [r['id'] for r in rows]
                placeholders = ','.join(['%s'] * len(ids))
                cur.execute(f"UPDATE scheduled_summaries SET is_delivered = TRUE WHERE id IN ({placeholders})", ids)
                conn.commit()

        summaries = [{
            'id': r['id'],
            'channel_id': r['channel_id'],
            'community_id': r['community_id'],
            'content': r['content'],
            'method': r['method'],
            'message_count': r['message_count'],
            'created_at': r['created_at'].isoformat() if r['created_at'] else None,
        } for r in rows]

        return jsonify({'success': True, 'summaries': summaries}), 200

    except Exception as e:
        print(f"[AGENTS API] Error getting pending summaries: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/summary-schedules/pending/<int:summary_id>', methods=['DELETE'])
@jwt_required()
def delete_scheduled_summary(summary_id):
    """Delete a generated scheduled summary."""
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM scheduled_summaries WHERE id = %s AND user_id = %s",
                (summary_id, user_id),
            )
            if cur.rowcount == 0:
                return jsonify({'error': 'Summary not found'}), 404
            conn.commit()

        return jsonify({'success': True, 'message': 'Scheduled summary deleted'}), 200

    except Exception as e:
        print(f"[AGENTS API] Error deleting scheduled summary: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()
