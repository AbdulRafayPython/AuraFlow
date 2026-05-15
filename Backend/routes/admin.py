"""
Admin Dashboard API Routes
==========================
Comprehensive admin endpoints for platform management.
Includes: Overview stats, moderation, user management, analytics, reports.

Security: All endpoints require JWT + admin/owner role verification.
"""

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import get_db_connection
from services.audit_logger import log_admin_action
from datetime import datetime, timedelta
from functools import wraps
import json
import logging

log = logging.getLogger(__name__)

# Create blueprint
admin_bp = Blueprint('admin', __name__, url_prefix='/api/admin')


# =====================================
# SECURITY DECORATORS
# =====================================

def require_system_admin(f):
    """
    Decorator to require system-level admin access.
    - If user has users.role = 'system_admin': full platform access (no community scoping).
    - Otherwise, if user owns any community: scoped access to owned communities only.
    
    Attaches to request context:
      - admin_user_id, admin_username
      - is_system_admin (bool)
      - owned_community_ids (list, empty for true system admins who see ALL)
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        username = get_jwt_identity()
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT id, role FROM users WHERE username = %s", (username,))
                user = cur.fetchone()
                if not user:
                    return jsonify({'error': 'User not found'}), 404
                
                is_sys_admin = (user['role'] == 'system_admin')
                
                if is_sys_admin:
                    # True system admin — full platform access
                    request.admin_user_id = user['id']
                    request.admin_username = username
                    request.is_system_admin = True
                    request.owned_community_ids = []  # empty = ALL communities
                else:
                    # Check if user is owner of any community (community admin access)
                    cur.execute("""
                        SELECT community_id FROM community_members 
                        WHERE user_id = %s AND role = 'owner'
                    """, (user['id'],))
                    
                    owned_communities = cur.fetchall()
                    if not owned_communities:
                        return jsonify({'error': 'Admin access required'}), 403
                    
                    request.admin_user_id = user['id']
                    request.admin_username = username
                    request.is_system_admin = False
                    request.owned_community_ids = [c['community_id'] for c in owned_communities]
                
        finally:
            conn.close()
        
        return f(*args, **kwargs)
    return decorated_function


def require_community_admin(f):
    """
    Decorator to require community-level admin/owner access.
    Expects community_id in route or request body.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        username = get_jwt_identity()
        community_id = kwargs.get('community_id') or request.args.get('community_id') or (request.get_json() or {}).get('community_id')
        
        if not community_id:
            return jsonify({'error': 'community_id is required'}), 400
        
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT id, role FROM users WHERE username = %s", (username,))
                user = cur.fetchone()
                if not user:
                    return jsonify({'error': 'User not found'}), 404
                
                # System admins can access any community
                if user['role'] == 'system_admin':
                    request.admin_user_id = user['id']
                    request.admin_username = username
                    request.admin_role = 'system_admin'
                    return f(*args, **kwargs)
                
                # Check role in this community
                cur.execute("""
                    SELECT role FROM community_members 
                    WHERE user_id = %s AND community_id = %s
                """, (user['id'], community_id))
                
                membership = cur.fetchone()
                if not membership or membership['role'] not in ['owner', 'admin']:
                    return jsonify({'error': 'Admin access required for this community'}), 403
                
                request.admin_user_id = user['id']
                request.admin_username = username
                request.admin_role = membership['role']
                
        finally:
            conn.close()
        
        return f(*args, **kwargs)
    return decorated_function


# =====================================
# OVERVIEW STATS
# =====================================

@admin_bp.route('/overview/stats', methods=['GET'])
@jwt_required()
@require_system_admin
def get_overview_stats():
    """
    Get comprehensive statistics for admin dashboard.
    System admins see ALL data; community admins see only their communities.
    """
    conn = None
    try:
        conn = get_db_connection()
        is_sys_admin = getattr(request, 'is_system_admin', False)
        owned_community_ids = request.owned_community_ids
        
        with conn.cursor() as cur:
            now = datetime.now()
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            week_ago = now - timedelta(days=7)
            
            if is_sys_admin:
                # System admin: ALL channels
                cur.execute("SELECT id FROM channels")
                owned_channels = [c['id'] for c in cur.fetchall()]
                
                # Total users on platform
                cur.execute("SELECT COUNT(*) as count FROM users")
                total_users = cur.fetchone()['count']
                
                # Total communities
                cur.execute("SELECT COUNT(*) as count FROM communities")
                total_communities = cur.fetchone()['count']
            else:
                # Community admin: scoped channels
                if owned_community_ids:
                    placeholders = ','.join(['%s'] * len(owned_community_ids))
                    cur.execute(f"""
                        SELECT id FROM channels WHERE community_id IN ({placeholders})
                    """, owned_community_ids)
                    owned_channels = [c['id'] for c in cur.fetchall()]
                else:
                    owned_channels = []
                
                # Total users IN OWNED COMMUNITIES
                if owned_community_ids:
                    placeholders = ','.join(['%s'] * len(owned_community_ids))
                    cur.execute(f"""
                        SELECT COUNT(DISTINCT user_id) as count 
                        FROM community_members 
                        WHERE community_id IN ({placeholders})
                    """, owned_community_ids)
                    total_users = cur.fetchone()['count']
                else:
                    total_users = 0
                
                total_communities = len(owned_community_ids)
            
            # Active users (last 24 hours)
            if owned_channels:
                channel_placeholders = ','.join(['%s'] * len(owned_channels))
                cur.execute(f"""
                    SELECT COUNT(DISTINCT sender_id) as count 
                    FROM messages 
                    WHERE channel_id IN ({channel_placeholders})
                    AND created_at >= %s
                """, owned_channels + [today_start])
                active_users_today = cur.fetchone()['count']
            elif is_sys_admin:
                cur.execute("""
                    SELECT COUNT(DISTINCT sender_id) as count 
                    FROM messages WHERE created_at >= %s
                """, (today_start,))
                active_users_today = cur.fetchone()['count']
            else:
                active_users_today = 0
            
            # Online users
            if is_sys_admin:
                cur.execute("SELECT COUNT(*) as count FROM users WHERE status = 'online'")
                online_users = cur.fetchone()['count']
            elif owned_community_ids:
                placeholders = ','.join(['%s'] * len(owned_community_ids))
                cur.execute(f"""
                    SELECT COUNT(DISTINCT u.id) as count 
                    FROM users u
                    JOIN community_members cm ON u.id = cm.user_id
                    WHERE cm.community_id IN ({placeholders})
                    AND u.status = 'online'
                """, owned_community_ids)
                online_users = cur.fetchone()['count']
            else:
                online_users = 0
            
            # Total messages today
            if owned_channels:
                channel_placeholders = ','.join(['%s'] * len(owned_channels))
                cur.execute(f"""
                    SELECT COUNT(*) as count FROM messages 
                    WHERE channel_id IN ({channel_placeholders})
                    AND created_at >= %s
                """, owned_channels + [today_start])
                messages_today = cur.fetchone()['count']
            elif is_sys_admin:
                cur.execute("SELECT COUNT(*) as count FROM messages WHERE created_at >= %s", (today_start,))
                messages_today = cur.fetchone()['count']
            else:
                messages_today = 0
            
            # Total messages this week
            if owned_channels:
                cur.execute(f"""
                    SELECT COUNT(*) as count FROM messages 
                    WHERE channel_id IN ({channel_placeholders})
                    AND created_at >= %s
                """, owned_channels + [week_ago])
                messages_week = cur.fetchone()['count']
            elif is_sys_admin:
                cur.execute("SELECT COUNT(*) as count FROM messages WHERE created_at >= %s", (week_ago,))
                messages_week = cur.fetchone()['count']
            else:
                messages_week = 0
            
            # Total channels
            if is_sys_admin:
                cur.execute("SELECT COUNT(*) as count FROM channels")
                total_channels = cur.fetchone()['count']
            else:
                total_channels = len(owned_channels)
            
            # Moderation stats - from ai_agent_logs
            if owned_channels:
                channel_placeholders = ','.join(['%s'] * len(owned_channels))
                cur.execute(f"""
                    SELECT COUNT(*) as count FROM ai_agent_logs l
                    JOIN ai_agents a ON l.agent_id = a.id
                    WHERE a.type = 'moderator'
                    AND l.channel_id IN ({channel_placeholders})
                    AND l.created_at >= %s 
                    AND l.output_text NOT LIKE '%%"action": "allow"%%'
                    AND l.output_text NOT LIKE '%%"action":"allow"%%'
                """, owned_channels + [today_start])
                flagged_today = cur.fetchone()['count']
            elif is_sys_admin:
                cur.execute("""
                    SELECT COUNT(*) as count FROM ai_agent_logs l
                    JOIN ai_agents a ON l.agent_id = a.id
                    WHERE a.type = 'moderator'
                    AND l.created_at >= %s 
                    AND l.output_text NOT LIKE '%%"action": "allow"%%'
                    AND l.output_text NOT LIKE '%%"action":"allow"%%'
                """, (today_start,))
                flagged_today = cur.fetchone()['count']
            else:
                flagged_today = 0
            
            # Blocked users
            if is_sys_admin:
                cur.execute("SELECT COUNT(*) as count FROM blocked_users")
                blocked_users = cur.fetchone()['count']
            elif owned_community_ids:
                placeholders = ','.join(['%s'] * len(owned_community_ids))
                cur.execute(f"""
                    SELECT COUNT(*) as count FROM blocked_users 
                    WHERE community_id IN ({placeholders})
                """, owned_community_ids)
                blocked_users = cur.fetchone()['count']
            else:
                blocked_users = 0
            
            # Recent high severity violations - from ai_agent_logs
            if owned_channels:
                channel_placeholders = ','.join(['%s'] * len(owned_channels))
                cur.execute(f"""
                    SELECT COUNT(*) as count FROM ai_agent_logs l
                    JOIN ai_agents a ON l.agent_id = a.id
                    WHERE a.type = 'moderator'
                    AND l.channel_id IN ({channel_placeholders})
                    AND l.created_at >= %s
                    AND (l.output_text LIKE '%%"severity": "high"%%' 
                         OR l.output_text LIKE '%%"severity":"high"%%'
                         OR l.output_text LIKE '%%"severity": "critical"%%'
                         OR l.output_text LIKE '%%"severity":"critical"%%')
                """, owned_channels + [week_ago])
                high_severity_count = cur.fetchone()['count']
            elif is_sys_admin:
                cur.execute("""
                    SELECT COUNT(*) as count FROM ai_agent_logs l
                    JOIN ai_agents a ON l.agent_id = a.id
                    WHERE a.type = 'moderator'
                    AND l.created_at >= %s
                    AND (l.output_text LIKE '%%"severity": "high"%%' 
                         OR l.output_text LIKE '%%"severity":"high"%%'
                         OR l.output_text LIKE '%%"severity": "critical"%%'
                         OR l.output_text LIKE '%%"severity":"critical"%%')
                """, (week_ago,))
                high_severity_count = cur.fetchone()['count']
            else:
                high_severity_count = 0
            
            # AI Agent health
            if is_sys_admin:
                agent_query = """
                    SELECT 
                        COALESCE(a.type, 
                            CASE 
                                WHEN l.action_type LIKE 'summar%%' THEN 'summarizer'
                                WHEN l.action_type LIKE 'moderat%%' THEN 'moderator'
                                WHEN l.action_type LIKE 'mood%%' THEN 'mood_tracker'
                                WHEN l.action_type LIKE 'engagem%%' THEN 'engagement'
                                WHEN l.action_type LIKE 'wellness%%' THEN 'wellness'
                                WHEN l.action_type LIKE 'knowledge%%' THEN 'knowledge'
                                WHEN l.action_type LIKE 'focus%%' THEN 'focus'
                                ELSE 'unknown'
                            END
                        ) as agent_type, 
                        COUNT(*) as activity_count,
                        MAX(l.created_at) as last_activity
                    FROM ai_agent_logs l
                    LEFT JOIN ai_agents a ON l.agent_id = a.id
                    WHERE l.created_at >= %s
                    GROUP BY agent_type
                """
                cur.execute(agent_query, (today_start,))
                agent_activity = cur.fetchall()
            elif owned_channels:
                agent_query = """
                    SELECT 
                        COALESCE(a.type, 
                            CASE 
                                WHEN l.action_type LIKE 'summar%%' THEN 'summarizer'
                                WHEN l.action_type LIKE 'moderat%%' THEN 'moderator'
                                WHEN l.action_type LIKE 'mood%%' THEN 'mood_tracker'
                                WHEN l.action_type LIKE 'engagem%%' THEN 'engagement'
                                WHEN l.action_type LIKE 'wellness%%' THEN 'wellness'
                                WHEN l.action_type LIKE 'knowledge%%' THEN 'knowledge'
                                WHEN l.action_type LIKE 'focus%%' THEN 'focus'
                                ELSE 'unknown'
                            END
                        ) as agent_type, 
                        COUNT(*) as activity_count,
                        MAX(l.created_at) as last_activity
                    FROM ai_agent_logs l
                    LEFT JOIN ai_agents a ON l.agent_id = a.id
                    WHERE l.channel_id IN (""" + channel_placeholders + """)
                    AND l.created_at >= %s
                    GROUP BY agent_type
                """
                cur.execute(agent_query, owned_channels + [today_start])
                agent_activity = cur.fetchall()
            else:
                agent_activity = []
            
            agent_status = {}
            for agent in agent_activity:
                agent_type = agent['agent_type'] or 'unknown'
                # Normalize moderator -> moderation for frontend display
                if agent_type == 'moderator':
                    agent_type = 'moderation'
                agent_status[agent_type] = {
                    'status': 'active' if agent['activity_count'] > 0 else 'idle',
                    'activity_count': agent['activity_count'],
                    'last_activity': agent['last_activity'].isoformat() if agent['last_activity'] else None
                }
            
            # Fill in missing agents with default status
            default_agents = ['summarizer', 'mood_tracker', 'moderation', 'engagement', 'wellness', 'knowledge_builder', 'focus']
            for agent in default_agents:
                if agent not in agent_status:
                    agent_status[agent] = {'status': 'idle', 'activity_count': 0, 'last_activity': None}
            
            # Calculate trends (compare to previous day)
            if owned_channels:
                channel_placeholders = ','.join(['%s'] * len(owned_channels))
                yesterday_start = today_start - timedelta(days=1)
                cur.execute(f"""
                    SELECT COUNT(*) as count FROM messages 
                    WHERE channel_id IN ({channel_placeholders})
                    AND created_at >= %s AND created_at < %s
                """, owned_channels + [yesterday_start, today_start])
                messages_yesterday = cur.fetchone()['count']
            elif is_sys_admin:
                yesterday_start = today_start - timedelta(days=1)
                cur.execute("""
                    SELECT COUNT(*) as count FROM messages 
                    WHERE created_at >= %s AND created_at < %s
                """, (yesterday_start, today_start))
                messages_yesterday = cur.fetchone()['count']
            else:
                messages_yesterday = 0
            
            message_trend = 0
            if messages_yesterday > 0:
                message_trend = round(((messages_today - messages_yesterday) / messages_yesterday) * 100, 1)
            
            return jsonify({
                'success': True,
                'stats': {
                    'users': {
                        'total': total_users,
                        'active_today': active_users_today,
                        'online': online_users
                    },
                    'messages': {
                        'today': messages_today,
                        'this_week': messages_week,
                        'trend_percent': message_trend
                    },
                    'communities': {
                        'total': total_communities,
                        'channels': total_channels
                    },
                    'moderation': {
                        'flagged_today': flagged_today,
                        'blocked_users': blocked_users,
                        'high_severity': high_severity_count
                    },
                    'agents': agent_status
                },
                'scope': {
                    'is_system_admin': is_sys_admin,
                    'community_ids': owned_community_ids if not is_sys_admin else 'all',
                    'community_count': total_communities
                },
                'generated_at': now.isoformat()
            }), 200
            
    except Exception as e:
        log.error(f"[ADMIN] Error getting overview stats: {e}")
        return jsonify({'error': 'Failed to fetch statistics'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/overview/recent-alerts', methods=['GET'])
@jwt_required()
@require_system_admin
def get_recent_alerts():
    """
    Get recent moderation alerts requiring attention.
    System admins see ALL; community admins see owned communities only.
    """
    conn = None
    try:
        limit = min(request.args.get('limit', 10, type=int), 50)
        is_sys_admin = getattr(request, 'is_system_admin', False)
        owned_community_ids = request.owned_community_ids
        
        if not is_sys_admin and not owned_community_ids:
            return jsonify({'success': True, 'alerts': [], 'count': 0}), 200
        
        conn = get_db_connection()
        
        with conn.cursor() as cur:
            if is_sys_admin:
                cur.execute("""
                    SELECT 
                        l.id, l.user_id, l.channel_id, l.input_text as message_text,
                        JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.reasons[0]')) as flag_type,
                        JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.severity')) as severity,
                        l.confidence_score as confidence,
                        JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.action')) as action_taken,
                        JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.reasons')) as reason,
                        l.created_at,
                        u.username, u.avatar_url,
                        ch.name as channel_name,
                        c.name as community_name, c.id as community_id
                    FROM ai_agent_logs l
                    JOIN users u ON l.user_id = u.id
                    LEFT JOIN channels ch ON l.channel_id = ch.id
                    LEFT JOIN communities c ON ch.community_id = c.id
                    WHERE l.agent_name = 'moderation'
                    AND JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.severity')) IN ('medium', 'high', 'critical')
                    ORDER BY l.created_at DESC
                    LIMIT %s
                """, (limit,))
            else:
                placeholders = ','.join(['%s'] * len(owned_community_ids))
                cur.execute(f"""
                    SELECT 
                        l.id, l.user_id, l.channel_id, l.input_text as message_text,
                        JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.reasons[0]')) as flag_type,
                        JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.severity')) as severity,
                        l.confidence_score as confidence,
                        JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.action')) as action_taken,
                        JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.reasons')) as reason,
                        l.created_at,
                        u.username, u.avatar_url,
                        ch.name as channel_name,
                        c.name as community_name, c.id as community_id
                    FROM ai_agent_logs l
                    JOIN users u ON l.user_id = u.id
                    LEFT JOIN channels ch ON l.channel_id = ch.id
                    LEFT JOIN communities c ON ch.community_id = c.id
                    WHERE l.agent_name = 'moderation'
                    AND JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.severity')) IN ('medium', 'high', 'critical')
                    AND c.id IN ({placeholders})
                    ORDER BY l.created_at DESC
                    LIMIT %s
                """, owned_community_ids + [limit])
            
            alerts = cur.fetchall()
            
            result = [{
                'id': a['id'],
                'user': {
                    'id': a['user_id'],
                    'username': a['username'],
                    'avatar_url': a['avatar_url']
                },
                'channel': {
                    'id': a['channel_id'],
                    'name': a['channel_name']
                },
                'community': {
                    'id': a['community_id'],
                    'name': a['community_name']
                },
                'message_preview': a['message_text'][:100] + '...' if len(a['message_text'] or '') > 100 else a['message_text'],
                'flag_type': a['flag_type'],
                'severity': a['severity'],
                'confidence': a['confidence'],
                'action_taken': a['action_taken'],
                'reason': a['reason'],
                'created_at': a['created_at'].isoformat() if a['created_at'] else None
            } for a in alerts]
            
            return jsonify({
                'success': True,
                'alerts': result,
                'count': len(result)
            }), 200
            
    except Exception as e:
        log.error(f"[ADMIN] Error getting recent alerts: {e}")
        return jsonify({'error': 'Failed to fetch alerts'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# MODERATION MANAGEMENT
# =====================================

@admin_bp.route('/moderation/flagged', methods=['GET'])
@jwt_required()
@require_system_admin
def get_flagged_messages():
    """
    Get flagged messages with filtering options.
    Query params: status, severity, flag_type, community_id, limit, offset
    """
    conn = None
    try:
        # Parse filters
        status = request.args.get('status')  # flagged, warned, resolved
        severity = request.args.get('severity')  # low, medium, high, critical
        flag_type = request.args.get('flag_type')  # toxic, spam, harassment, etc.
        community_id = request.args.get('community_id', type=int)
        limit = min(request.args.get('limit', 20, type=int), 100)
        offset = max(request.args.get('offset', 0, type=int), 0)
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Build query with filters - using ai_agent_logs
            select_cols = """
                SELECT 
                    l.id, l.user_id, l.channel_id, l.input_text as message_text,
                    JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.reasons[0]')) as flag_type,
                    JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.severity')) as severity,
                    l.confidence_score as confidence,
                    JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.action')) as action_taken,
                    JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.reasons')) as reason,
                    l.created_at,
                    u.username, u.display_name, u.avatar_url,
                    ch.name as channel_name,
                    c.name as community_name, c.id as community_id,
                    (SELECT COUNT(*) FROM ai_agent_logs l2 
                     WHERE l2.user_id = l.user_id AND l2.agent_name = 'moderation'
                     AND JSON_UNQUOTE(JSON_EXTRACT(l2.output_data, '$.action')) != 'allow') as user_violation_count"""
            
            from_clause = """
                FROM ai_agent_logs l
                JOIN users u ON l.user_id = u.id
                LEFT JOIN channels ch ON l.channel_id = ch.id
                LEFT JOIN communities c ON ch.community_id = c.id
                WHERE l.agent_name = 'moderation'
            """
            query = select_cols + from_clause
            params = []
            
            if status:
                query += " AND JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.action')) = %s"
                params.append(status)
            
            if severity:
                query += " AND JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.severity')) = %s"
                params.append(severity)
            
            if flag_type:
                query += " AND JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.reasons')) LIKE %s"
                params.append(f'%{flag_type}%')
            
            if community_id:
                query += " AND c.id = %s"
                params.append(community_id)
            
            # Get total count for pagination
            count_query = "SELECT COUNT(*) as total" + from_clause
            count_params = []
            if status:
                count_query += " AND JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.action')) = %s"
                count_params.append(status)
            if severity:
                count_query += " AND JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.severity')) = %s"
                count_params.append(severity)
            if flag_type:
                count_query += " AND JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.reasons')) LIKE %s"
                count_params.append(f'%{flag_type}%')
            if community_id:
                count_query += " AND c.id = %s"
                count_params.append(community_id)
            
            cur.execute(count_query, count_params)
            total = cur.fetchone()['total']
            
            # Add ordering and pagination
            query += " ORDER BY l.created_at DESC LIMIT %s OFFSET %s"
            params.extend([limit, offset])
            
            cur.execute(query, params)
            flagged = cur.fetchall()
            
            result = [{
                'id': f['id'],
                'user': {
                    'id': f['user_id'],
                    'username': f['username'],
                    'display_name': f['display_name'],
                    'avatar_url': f['avatar_url'],
                    'violation_count': f['user_violation_count']
                },
                'channel': {
                    'id': f['channel_id'],
                    'name': f['channel_name']
                },
                'community': {
                    'id': f['community_id'],
                    'name': f['community_name']
                },
                'message_text': f['message_text'],
                'flag_type': f['flag_type'],
                'severity': f['severity'],
                'confidence': f['confidence'],
                'action_taken': f['action_taken'],
                'reason': f['reason'],
                'created_at': f['created_at'].isoformat() if f['created_at'] else None
            } for f in flagged]
            
            return jsonify({
                'success': True,
                'flagged_messages': result,
                'pagination': {
                    'total': total,
                    'limit': limit,
                    'offset': offset,
                    'has_more': offset + limit < total
                }
            }), 200
            
    except Exception as e:
        log.error(f"[ADMIN] Error getting flagged messages: {e}")
        return jsonify({'error': 'Failed to fetch flagged messages'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/moderation/resolve/<int:log_id>', methods=['POST'])
@jwt_required()
@require_system_admin
def resolve_moderation(log_id):
    """
    Resolve a moderation flag with admin action.
    Body: action (approve, warn, delete, ban), note (optional)
    """
    conn = None
    try:
        data = request.get_json() or {}
        action = data.get('action')  # approve, warn, delete, ban
        note = data.get('note', '')
        
        if action not in ['approve', 'warn', 'delete', 'ban', 'mute']:
            return jsonify({'error': 'Invalid action'}), 400
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get the moderation log entry from ai_agent_logs
            cur.execute("""
                SELECT l.id, l.user_id, l.channel_id, l.community_id,
                    l.input_text as message_text,
                    l.output_data, l.confidence_score
                FROM ai_agent_logs l
                WHERE l.id = %s AND l.agent_name = 'moderation'
            """, (log_id,))
            
            log_entry = cur.fetchone()
            if not log_entry:
                return jsonify({'error': 'Moderation log not found'}), 404
            
            # Map action to database value
            action_mapping = {
                'approve': 'allow',
                'warn': 'warned',
                'delete': 'deleted',
                'ban': 'banned',
                'mute': 'warned'
            }
            
            # Update ai_agent_logs output_data with admin action
            import json as _json
            output_data = log_entry.get('output_data') or '{}'
            if isinstance(output_data, str):
                output_data = _json.loads(output_data)
            output_data['action'] = action_mapping[action]
            output_data['admin_note'] = note
            
            cur.execute("""
                UPDATE ai_agent_logs 
                SET output_data = %s, output_text = %s
                WHERE id = %s
            """, (_json.dumps(output_data), _json.dumps(output_data), log_id))
            
            # If banning user, add to blocked_users
            if action == 'ban' and log_entry['community_id']:
                cur.execute("""
                    INSERT IGNORE INTO blocked_users (community_id, user_id, blocked_at)
                    VALUES (%s, %s, NOW())
                """, (log_entry['community_id'], log_entry['user_id']))
                
                # Increment violation count
                cur.execute("""
                    UPDATE community_members 
                    SET violation_count = violation_count + 1
                    WHERE community_id = %s AND user_id = %s
                """, (log_entry['community_id'], log_entry['user_id']))
            
            # If warning, increment violation count
            if action == 'warn' and log_entry['community_id']:
                cur.execute("""
                    UPDATE community_members 
                    SET violation_count = violation_count + 1
                    WHERE community_id = %s AND user_id = %s
                """, (log_entry['community_id'], log_entry['user_id']))
            
            conn.commit()

            log_admin_action(
                actor_user_id=request.admin_user_id,
                actor_role='system_admin' if request.is_system_admin else 'community_admin',
                action='flag.resolve',
                target_type='message',
                target_id=log_id,
                community_id=log_entry.get('community_id'),
                metadata={'action': action, 'note': note, 'target_user_id': log_entry.get('user_id')},
            )

            return jsonify({
                'success': True,
                'message': f'Moderation resolved with action: {action}',
                'log_id': log_id
            }), 200

    except Exception as e:
        log.error(f"[ADMIN] Error resolving moderation: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to resolve moderation'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/moderation/blocked-users', methods=['GET'])
@jwt_required()
@require_system_admin
def get_blocked_users():
    """Get all blocked users across communities."""
    conn = None
    try:
        community_id = request.args.get('community_id', type=int)
        limit = min(request.args.get('limit', 20, type=int), 100)
        offset = max(request.args.get('offset', 0, type=int), 0)
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            query = """
                SELECT 
                    bu.id, bu.user_id, bu.community_id, bu.blocked_at,
                    u.username, u.display_name, u.avatar_url, u.email,
                    c.name as community_name,
                    (SELECT COUNT(*) FROM ai_agent_logs l 
                     WHERE l.user_id = bu.user_id AND l.agent_name = 'moderation'
                     AND JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.action')) != 'allow') as total_violations
                FROM blocked_users bu
                JOIN users u ON bu.user_id = u.id
                JOIN communities c ON bu.community_id = c.id
                WHERE 1=1
            """
            params = []
            
            if community_id:
                query += " AND bu.community_id = %s"
                params.append(community_id)
            
            query += " ORDER BY bu.blocked_at DESC LIMIT %s OFFSET %s"
            params.extend([limit, offset])
            
            cur.execute(query, params)
            blocked = cur.fetchall()
            
            result = [{
                'id': b['id'],
                'user': {
                    'id': b['user_id'],
                    'username': b['username'],
                    'display_name': b['display_name'],
                    'avatar_url': b['avatar_url'],
                    'email': b['email']
                },
                'community': {
                    'id': b['community_id'],
                    'name': b['community_name']
                },
                'blocked_at': b['blocked_at'].isoformat() if b['blocked_at'] else None,
                'total_violations': b['total_violations']
            } for b in blocked]
            
            return jsonify({
                'success': True,
                'blocked_users': result,
                'count': len(result)
            }), 200
            
    except Exception as e:
        log.error(f"[ADMIN] Error getting blocked users: {e}")
        return jsonify({'error': 'Failed to fetch blocked users'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/moderation/unblock/<int:block_id>', methods=['DELETE'])
@jwt_required()
@require_system_admin
def unblock_user(block_id):
    """Unblock a user from a community."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT user_id, community_id FROM blocked_users WHERE id = %s", (block_id,))
            block_row = cur.fetchone()
            if not block_row:
                return jsonify({'error': 'Block record not found'}), 404

            cur.execute("DELETE FROM blocked_users WHERE id = %s", (block_id,))
            conn.commit()

            try:
                from services.redis_client import get_redis as _get_redis
                _r = _get_redis()
                if _r:
                    _r.delete(f"blocked:{block_row.get('community_id')}:{block_row['user_id']}")
            except Exception:
                pass

            log_admin_action(
                actor_user_id=request.admin_user_id,
                actor_role='system_admin' if request.is_system_admin else 'community_admin',
                action='user.unblock',
                target_type='user',
                target_id=block_row['user_id'],
                community_id=block_row.get('community_id'),
                metadata={'block_id': block_id},
            )

            return jsonify({
                'success': True,
                'message': 'User unblocked successfully'
            }), 200
            
    except Exception as e:
        log.error(f"[ADMIN] Error unblocking user: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to unblock user'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# USER MANAGEMENT
# =====================================

@admin_bp.route('/users', methods=['GET'])
@jwt_required()
@require_system_admin
def get_all_users():
    """
    Get all users. System admins see ALL platform users;
    community admins see only members of their communities.
    """
    conn = None
    try:
        status = request.args.get('status')  # online, offline, idle
        account_status = request.args.get('account_status')  # active, suspended, banned
        search = request.args.get('search', '')
        limit = min(request.args.get('limit', 20, type=int), 100)
        offset = max(request.args.get('offset', 0, type=int), 0)
        
        is_sys_admin = getattr(request, 'is_system_admin', False)
        owned_community_ids = request.owned_community_ids
        
        if not is_sys_admin and not owned_community_ids:
            return jsonify({
                'success': True,
                'users': [],
                'pagination': {'total': 0, 'limit': limit, 'offset': offset, 'has_more': False}
            }), 200
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            if is_sys_admin:
                # System admin: ALL users
                query = """
                    SELECT 
                        u.id, u.username, u.display_name, u.email, u.avatar_url,
                        u.status, u.created_at, u.last_seen, u.role as system_role,
                        u.account_status, u.account_status_reason, u.account_status_until,
                        (SELECT COUNT(*) FROM messages WHERE sender_id = u.id) as message_count,
                        (SELECT COUNT(*) FROM community_members WHERE user_id = u.id) as community_count,
                        (SELECT COUNT(*) FROM ai_agent_logs WHERE user_id = u.id 
                         AND agent_name = 'moderation'
                         AND JSON_UNQUOTE(JSON_EXTRACT(output_data, '$.action')) != 'allow') as violation_count,
                        (SELECT COUNT(*) FROM blocked_users WHERE user_id = u.id) as ban_count
                    FROM users u
                    WHERE 1=1
                """
                params = []
                
                if status:
                    query += " AND u.status = %s"
                    params.append(status)
                
                if account_status:
                    query += " AND COALESCE(u.account_status, 'active') = %s"
                    params.append(account_status)
                
                if search:
                    query += " AND (u.username LIKE %s OR u.email LIKE %s OR u.display_name LIKE %s)"
                    search_param = f"%{search}%"
                    params.extend([search_param, search_param, search_param])
                
                # Count
                count_query = "SELECT COUNT(*) as total FROM users u WHERE 1=1"
                count_params = []
                if status:
                    count_query += " AND u.status = %s"
                    count_params.append(status)
                if account_status:
                    count_query += " AND COALESCE(u.account_status, 'active') = %s"
                    count_params.append(account_status)
                if search:
                    count_query += " AND (u.username LIKE %s OR u.email LIKE %s OR u.display_name LIKE %s)"
                    search_param = f"%{search}%"
                    count_params.extend([search_param, search_param, search_param])
                
                cur.execute(count_query, count_params)
                total = cur.fetchone()['total']
                
                query += " ORDER BY u.created_at DESC LIMIT %s OFFSET %s"
                params.extend([limit, offset])
                
                cur.execute(query, params)
                users = cur.fetchall()
            else:
                # Community admin: scoped to owned communities
                placeholders = ','.join(['%s'] * len(owned_community_ids))
                
                # Get channels in owned communities for message count
                cur.execute(f"""
                    SELECT id FROM channels WHERE community_id IN ({placeholders})
                """, owned_community_ids)
                owned_channels = [c['id'] for c in cur.fetchall()]
                channel_placeholders = ','.join(['%s'] * len(owned_channels)) if owned_channels else "''"
                
                # Build query to get only users in owned communities
                query = f"""
                    SELECT DISTINCT
                        u.id, u.username, u.display_name, u.email, u.avatar_url,
                        u.status, u.created_at, u.last_seen,
                        (SELECT COUNT(*) FROM messages WHERE sender_id = u.id 
                         {f'AND channel_id IN ({channel_placeholders})' if owned_channels else 'AND 1=0'}) as message_count,
                        (SELECT COUNT(*) FROM community_members WHERE user_id = u.id 
                         AND community_id IN ({placeholders})) as community_count,
                        (SELECT COUNT(*) FROM ai_agent_logs WHERE user_id = u.id 
                         AND agent_name = 'moderation'
                         {f'AND channel_id IN ({channel_placeholders})' if owned_channels else 'AND 1=0'}
                         AND JSON_UNQUOTE(JSON_EXTRACT(output_data, '$.action')) != 'allow') as violation_count,
                        (SELECT COUNT(*) FROM blocked_users WHERE user_id = u.id 
                         AND community_id IN ({placeholders})) as ban_count
                    FROM users u
                    INNER JOIN community_members cm ON u.id = cm.user_id
                    WHERE cm.community_id IN ({placeholders})
                """
                params = []
                if owned_channels:
                    params.extend(owned_channels)
                params.extend(owned_community_ids)
                if owned_channels:
                    params.extend(owned_channels)
                params.extend(owned_community_ids)
                params.extend(owned_community_ids)
                
                if status:
                    query += " AND u.status = %s"
                    params.append(status)
                
                if search:
                    query += " AND (u.username LIKE %s OR u.email LIKE %s OR u.display_name LIKE %s)"
                    search_param = f"%{search}%"
                    params.extend([search_param, search_param, search_param])
                
                # Count total
                count_query = f"""
                    SELECT COUNT(DISTINCT u.id) as total
                    FROM users u
                    INNER JOIN community_members cm ON u.id = cm.user_id
                    WHERE cm.community_id IN ({placeholders})
                """
                count_params = list(owned_community_ids)
                if status:
                    count_query += " AND u.status = %s"
                    count_params.append(status)
                if search:
                    count_query += " AND (u.username LIKE %s OR u.email LIKE %s OR u.display_name LIKE %s)"
                    search_param = f"%{search}%"
                    count_params.extend([search_param, search_param, search_param])
                
                cur.execute(count_query, count_params)
                total = cur.fetchone()['total']
                
                query += " ORDER BY u.created_at DESC LIMIT %s OFFSET %s"
                params.extend([limit, offset])
                
                cur.execute(query, params)
                users = cur.fetchall()
            
            result = [{
                'id': u['id'],
                'username': u['username'],
                'display_name': u['display_name'],
                'email': u['email'],
                'avatar_url': u['avatar_url'],
                'status': u['status'],
                'system_role': u.get('system_role', 'user'),
                'account_status': u.get('account_status') or 'active',
                'account_status_reason': u.get('account_status_reason'),
                'account_status_until': u['account_status_until'].isoformat() if u.get('account_status_until') else None,
                'created_at': u['created_at'].isoformat() if u['created_at'] else None,
                'last_seen': u['last_seen'].isoformat() if u['last_seen'] else None,
                'stats': {
                    'message_count': u['message_count'],
                    'community_count': u['community_count'],
                    'violation_count': u['violation_count'],
                    'ban_count': u['ban_count']
                }
            } for u in users]
            
            return jsonify({
                'success': True,
                'users': result,
                'pagination': {
                    'total': total,
                    'limit': limit,
                    'offset': offset,
                    'has_more': offset + limit < total
                },
                'scope': {
                    'is_system_admin': is_sys_admin,
                    'community_ids': owned_community_ids if not is_sys_admin else 'all'
                }
            }), 200
            
    except Exception as e:
        log.error(f"[ADMIN] Error getting users: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to fetch users'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/users/<int:user_id>', methods=['GET'])
@jwt_required()
@require_system_admin
def get_user_details(user_id):
    """Get detailed information about a specific user."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # User info
            cur.execute("""
                SELECT 
                    id, username, display_name, email, avatar_url, bio,
                    status, custom_status, created_at, last_seen, role,
                    account_status, account_status_reason, account_status_until
                FROM users WHERE id = %s
            """, (user_id,))
            
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404
            
            # Community memberships
            cur.execute("""
                SELECT c.id, c.name, cm.role, cm.joined_at, cm.violation_count
                FROM community_members cm
                JOIN communities c ON cm.community_id = c.id
                WHERE cm.user_id = %s
            """, (user_id,))
            communities = cur.fetchall()
            
            # Recent messages count (last 7 days)
            cur.execute("""
                SELECT COUNT(*) as count FROM messages 
                WHERE sender_id = %s AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            """, (user_id,))
            recent_messages = cur.fetchone()['count']
            
            # Moderation history
            cur.execute("""
                SELECT id, 
                    JSON_UNQUOTE(JSON_EXTRACT(output_data, '$.reasons[0]')) as flag_type,
                    JSON_UNQUOTE(JSON_EXTRACT(output_data, '$.severity')) as severity,
                    JSON_UNQUOTE(JSON_EXTRACT(output_data, '$.action')) as action_taken,
                    created_at
                FROM ai_agent_logs
                WHERE user_id = %s AND agent_name = 'moderation'
                ORDER BY created_at DESC
                LIMIT 10
            """, (user_id,))
            moderation_history = cur.fetchall()
            
            # Block status
            cur.execute("""
                SELECT bu.id, c.name as community_name, bu.blocked_at
                FROM blocked_users bu
                JOIN communities c ON bu.community_id = c.id
                WHERE bu.user_id = %s
            """, (user_id,))
            blocks = cur.fetchall()
            
            # Admin action history
            cur.execute("""
                SELECT aa.id, aa.action_type, aa.reason, aa.details, aa.created_at,
                       u2.username as admin_username
                FROM admin_actions aa
                JOIN users u2 ON u2.id = aa.admin_id
                WHERE aa.target_user_id = %s
                ORDER BY aa.created_at DESC
                LIMIT 10
            """, (user_id,))
            admin_actions = cur.fetchall()
            
            return jsonify({
                'success': True,
                'user': {
                    'id': user['id'],
                    'username': user['username'],
                    'display_name': user['display_name'],
                    'email': user['email'],
                    'avatar_url': user['avatar_url'],
                    'bio': user['bio'],
                    'status': user['status'],
                    'custom_status': user['custom_status'],
                    'role': user.get('role', 'user'),
                    'account_status': user.get('account_status') or 'active',
                    'account_status_reason': user.get('account_status_reason'),
                    'account_status_until': user['account_status_until'].isoformat() if user.get('account_status_until') else None,
                    'created_at': user['created_at'].isoformat() if user['created_at'] else None,
                    'last_seen': user['last_seen'].isoformat() if user['last_seen'] else None
                },
                'communities': [{
                    'id': c['id'],
                    'name': c['name'],
                    'role': c['role'],
                    'joined_at': c['joined_at'].isoformat() if c['joined_at'] else None,
                    'violation_count': c['violation_count']
                } for c in communities],
                'stats': {
                    'recent_messages': recent_messages,
                    'total_communities': len(communities)
                },
                'moderation_history': [{
                    'id': m['id'],
                    'flag_type': m['flag_type'],
                    'severity': m['severity'],
                    'action_taken': m['action_taken'],
                    'created_at': m['created_at'].isoformat() if m['created_at'] else None
                } for m in moderation_history],
                'blocks': [{
                    'id': b['id'],
                    'community_name': b['community_name'],
                    'blocked_at': b['blocked_at'].isoformat() if b['blocked_at'] else None
                } for b in blocks],
                'admin_actions': [{
                    'id': a['id'],
                    'action_type': a['action_type'],
                    'reason': a['reason'],
                    'details': a['details'],
                    'admin_username': a['admin_username'],
                    'created_at': a['created_at'].isoformat() if a['created_at'] else None
                } for a in admin_actions]
            }), 200
            
    except Exception as e:
        log.error(f"[ADMIN] Error getting user details: {e}")
        return jsonify({'error': 'Failed to fetch user details'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# ANALYTICS
# =====================================

@admin_bp.route('/analytics/community-health', methods=['GET'])
@jwt_required()
@require_system_admin
def get_community_health():
    """Get health metrics for all communities."""
    conn = None
    try:
        days = min(request.args.get('days', 7, type=int), 90)
        time_threshold = datetime.now() - timedelta(days=days)
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 
                    c.id, c.name, c.logo_url, c.banner_url, c.description, c.created_at,
                    u.username as creator_name,
                    (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count,
                    (SELECT COUNT(*) FROM channels WHERE community_id = c.id) as channel_count,
                    (SELECT COUNT(*) FROM messages m 
                     JOIN channels ch ON m.channel_id = ch.id 
                     WHERE ch.community_id = c.id AND m.created_at >= %s) as message_count,
                    (SELECT COUNT(DISTINCT m.sender_id) FROM messages m 
                     JOIN channels ch ON m.channel_id = ch.id 
                     WHERE ch.community_id = c.id AND m.created_at >= %s) as active_users,
                    (SELECT COUNT(*) FROM ai_agent_logs l
                     WHERE l.community_id = c.id AND l.agent_name = 'moderation'
                     AND l.created_at >= %s
                     AND JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.action')) != 'allow') as moderation_issues,
                    (SELECT COUNT(*) FROM blocked_users WHERE community_id = c.id) as blocked_count
                FROM communities c
                LEFT JOIN users u ON c.created_by = u.id
                ORDER BY message_count DESC
            """, (time_threshold, time_threshold, time_threshold))
            
            communities = cur.fetchall()
            
            result = []
            for c in communities:
                # Calculate health score (0-100)
                # Factors: activity, low moderation issues, member engagement
                activity_score = min(c['message_count'] / 10, 40)  # Max 40 points
                engagement_score = min((c['active_users'] / max(c['member_count'], 1)) * 40, 40)  # Max 40 points
                safety_score = max(20 - (c['moderation_issues'] * 2), 0)  # Max 20 points
                
                health_score = round(activity_score + engagement_score + safety_score)
                
                health_level = 'healthy' if health_score >= 70 else 'moderate' if health_score >= 40 else 'needs_attention'
                
                result.append({
                    'id': c['id'],
                    'name': c['name'],
                    'logo_url': c['logo_url'],
                    'banner_url': c['banner_url'],
                    'description': c['description'],
                    'creator_name': c['creator_name'],
                    'member_count': c['member_count'],
                    'channel_count': c['channel_count'],
                    'message_count': c['message_count'],
                    'active_users': c['active_users'],
                    'moderation_issues': c['moderation_issues'],
                    'blocked_count': c['blocked_count'],
                    'health_score': health_score,
                    'health_level': health_level,
                    'created_at': c['created_at'].isoformat() if c['created_at'] else None
                })
            
            return jsonify({
                'success': True,
                'communities': result,
                'time_period_days': days
            }), 200
            
    except Exception as e:
        log.error(f"[ADMIN] Error getting community health: {e}")
        return jsonify({'error': 'Failed to fetch community health'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/analytics/mood-trends', methods=['GET'])
@jwt_required()
@require_system_admin
def get_mood_trends():
    """Get platform-wide mood trends."""
    conn = None
    try:
        days = min(request.args.get('days', 7, type=int), 30)
        community_id = request.args.get('community_id', type=int)
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Daily mood distribution
            query = """
                SELECT 
                    DATE(um.created_at) as date,
                    um.mood,
                    COUNT(*) as count
                FROM user_moods um
                WHERE um.created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
            """
            params = [days]
            
            if community_id:
                query += " AND um.channel_id IN (SELECT id FROM channels WHERE community_id = %s)"
                params.append(community_id)
            
            query += " GROUP BY DATE(um.created_at), um.mood ORDER BY date"
            
            cur.execute(query, params)
            daily_moods = cur.fetchall()
            
            # Aggregate sentiment distribution
            cur.execute("""
                SELECT 
                    CASE 
                        WHEN sentiment_score > 0.3 THEN 'positive'
                        WHEN sentiment_score < -0.3 THEN 'negative'
                        ELSE 'neutral'
                    END as sentiment,
                    COUNT(*) as count
                FROM user_moods
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
                GROUP BY sentiment
            """, (days,))
            
            sentiment_dist = cur.fetchall()
            
            # Format daily data for charts
            daily_data = {}
            for m in daily_moods:
                date_str = m['date'].isoformat() if m['date'] else None
                if date_str not in daily_data:
                    daily_data[date_str] = {'date': date_str, 'positive': 0, 'negative': 0, 'neutral': 0}
                
                # Categorize mood
                mood = m['mood'].lower() if m['mood'] else 'neutral'
                if mood in ['happy', 'excited', 'joy', 'love', 'positive']:
                    daily_data[date_str]['positive'] += m['count']
                elif mood in ['sad', 'angry', 'fear', 'anxiety', 'negative']:
                    daily_data[date_str]['negative'] += m['count']
                else:
                    daily_data[date_str]['neutral'] += m['count']
            
            return jsonify({
                'success': True,
                'daily_trends': list(daily_data.values()),
                'sentiment_distribution': {s['sentiment']: s['count'] for s in sentiment_dist},
                'time_period_days': days
            }), 200
            
    except Exception as e:
        log.error(f"[ADMIN] Error getting mood trends: {e}")
        return jsonify({'error': 'Failed to fetch mood trends'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/analytics/engagement', methods=['GET'])
@jwt_required()
@require_system_admin
def get_engagement_analytics():
    """Get engagement metrics and trends."""
    conn = None
    try:
        days = min(request.args.get('days', 7, type=int), 30)
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Daily message counts
            cur.execute("""
                SELECT 
                    DATE(created_at) as date,
                    COUNT(*) as message_count,
                    COUNT(DISTINCT sender_id) as active_users
                FROM messages
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
                GROUP BY DATE(created_at)
                ORDER BY date
            """, (days,))
            
            daily_engagement = cur.fetchall()
            
            # Hourly distribution (for heatmap)
            cur.execute("""
                SELECT 
                    HOUR(created_at) as hour,
                    DAYOFWEEK(created_at) as day_of_week,
                    COUNT(*) as count
                FROM messages
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
                GROUP BY HOUR(created_at), DAYOFWEEK(created_at)
            """, (days,))
            
            hourly_dist = cur.fetchall()
            
            # Top active channels
            cur.execute("""
                SELECT 
                    ch.id, ch.name, c.name as community_name,
                    COUNT(*) as message_count
                FROM messages m
                JOIN channels ch ON m.channel_id = ch.id
                JOIN communities c ON ch.community_id = c.id
                WHERE m.created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
                GROUP BY ch.id, ch.name, c.name
                ORDER BY message_count DESC
                LIMIT 10
            """, (days,))
            
            top_channels = cur.fetchall()
            
            return jsonify({
                'success': True,
                'daily_engagement': [{
                    'date': d['date'].isoformat() if d['date'] else None,
                    'message_count': d['message_count'],
                    'active_users': d['active_users']
                } for d in daily_engagement],
                'hourly_distribution': [{
                    'hour': h['hour'],
                    'day_of_week': h['day_of_week'],
                    'count': h['count']
                } for h in hourly_dist],
                'top_channels': [{
                    'id': c['id'],
                    'name': c['name'],
                    'community_name': c['community_name'],
                    'message_count': c['message_count']
                } for c in top_channels],
                'time_period_days': days
            }), 200
            
    except Exception as e:
        log.error(f"[ADMIN] Error getting engagement analytics: {e}")
        return jsonify({'error': 'Failed to fetch engagement analytics'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# REPORTS
# =====================================

@admin_bp.route('/reports/daily', methods=['GET'])
@jwt_required()
@require_system_admin
def get_daily_report():
    """Generate a comprehensive daily report."""
    conn = None
    try:
        date_str = request.args.get('date')
        if date_str:
            report_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        else:
            report_date = datetime.now().date()
        
        day_start = datetime.combine(report_date, datetime.min.time())
        day_end = datetime.combine(report_date, datetime.max.time())
        prev_day_start = day_start - timedelta(days=1)
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Messages
            cur.execute("""
                SELECT COUNT(*) as count FROM messages 
                WHERE created_at BETWEEN %s AND %s
            """, (day_start, day_end))
            messages_today = cur.fetchone()['count']
            
            cur.execute("""
                SELECT COUNT(*) as count FROM messages 
                WHERE created_at BETWEEN %s AND %s
            """, (prev_day_start, day_start))
            messages_yesterday = cur.fetchone()['count']
            
            # Active users
            cur.execute("""
                SELECT COUNT(DISTINCT sender_id) as count FROM messages 
                WHERE created_at BETWEEN %s AND %s
            """, (day_start, day_end))
            active_users = cur.fetchone()['count']
            
            # New users
            cur.execute("""
                SELECT COUNT(*) as count FROM users 
                WHERE created_at BETWEEN %s AND %s
            """, (day_start, day_end))
            new_users = cur.fetchone()['count']
            
            # Moderation
            cur.execute("""
                SELECT 
                    JSON_UNQUOTE(JSON_EXTRACT(output_data, '$.reasons[0]')) as flag_type, 
                    COUNT(*) as count
                FROM ai_agent_logs
                WHERE agent_name = 'moderation'
                AND created_at BETWEEN %s AND %s
                GROUP BY flag_type
            """, (day_start, day_end))
            moderation_breakdown = {m['flag_type']: m['count'] for m in cur.fetchall()}
            
            # Sentiment distribution
            cur.execute("""
                SELECT 
                    CASE 
                        WHEN sentiment_score > 0.3 THEN 'positive'
                        WHEN sentiment_score < -0.3 THEN 'negative'
                        ELSE 'neutral'
                    END as sentiment,
                    COUNT(*) as count
                FROM user_moods
                WHERE created_at BETWEEN %s AND %s
                GROUP BY sentiment
            """, (day_start, day_end))
            sentiment_data = {s['sentiment']: s['count'] for s in cur.fetchall()}
            
            # AI Agent activity
            cur.execute("""
                SELECT agent_name, COUNT(*) as count
                FROM ai_agent_logs
                WHERE created_at BETWEEN %s AND %s
                GROUP BY agent_name
            """, (day_start, day_end))
            agent_activity = {a['agent_name']: a['count'] for a in cur.fetchall()}
            
            # Calculate trends
            message_trend = 0
            if messages_yesterday > 0:
                message_trend = round(((messages_today - messages_yesterday) / messages_yesterday) * 100, 1)
            
            return jsonify({
                'success': True,
                'report': {
                    'date': report_date.isoformat(),
                    'summary': {
                        'total_messages': messages_today,
                        'message_trend_percent': message_trend,
                        'active_users': active_users,
                        'new_users': new_users
                    },
                    'moderation': {
                        'total_flags': sum(moderation_breakdown.values()),
                        'breakdown': moderation_breakdown
                    },
                    'sentiment': sentiment_data,
                    'ai_agents': agent_activity
                }
            }), 200
            
    except Exception as e:
        log.error(f"[ADMIN] Error generating daily report: {e}")
        return jsonify({'error': 'Failed to generate report'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/reports/weekly', methods=['GET'])
@jwt_required()
@require_system_admin
def get_weekly_report():
    """Generate a comprehensive weekly report."""
    conn = None
    try:
        week_end = datetime.now()
        week_start = week_end - timedelta(days=7)
        prev_week_start = week_start - timedelta(days=7)
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # This week stats
            cur.execute("""
                SELECT COUNT(*) as messages,
                       COUNT(DISTINCT sender_id) as active_users
                FROM messages WHERE created_at >= %s
            """, (week_start,))
            this_week = cur.fetchone()
            
            # Previous week stats
            cur.execute("""
                SELECT COUNT(*) as messages,
                       COUNT(DISTINCT sender_id) as active_users
                FROM messages WHERE created_at >= %s AND created_at < %s
            """, (prev_week_start, week_start))
            prev_week = cur.fetchone()
            
            # New users this week
            cur.execute("""
                SELECT COUNT(*) as count FROM users WHERE created_at >= %s
            """, (week_start,))
            new_users = cur.fetchone()['count']
            
            # Top communities
            cur.execute("""
                SELECT c.id, c.name, COUNT(*) as message_count
                FROM messages m
                JOIN channels ch ON m.channel_id = ch.id
                JOIN communities c ON ch.community_id = c.id
                WHERE m.created_at >= %s
                GROUP BY c.id, c.name
                ORDER BY message_count DESC
                LIMIT 5
            """, (week_start,))
            top_communities = cur.fetchall()
            
            # Calculate trends
            message_trend = 0
            if prev_week['messages'] > 0:
                message_trend = round(((this_week['messages'] - prev_week['messages']) / prev_week['messages']) * 100, 1)
            
            user_trend = 0
            if prev_week['active_users'] > 0:
                user_trend = round(((this_week['active_users'] - prev_week['active_users']) / prev_week['active_users']) * 100, 1)
            
            return jsonify({
                'success': True,
                'report': {
                    'period': {
                        'start': week_start.isoformat(),
                        'end': week_end.isoformat()
                    },
                    'summary': {
                        'total_messages': this_week['messages'],
                        'message_trend_percent': message_trend,
                        'active_users': this_week['active_users'],
                        'user_trend_percent': user_trend,
                        'new_users': new_users
                    },
                    'top_communities': [{
                        'id': c['id'],
                        'name': c['name'],
                        'message_count': c['message_count']
                    } for c in top_communities]
                }
            }), 200
            
    except Exception as e:
        log.error(f"[ADMIN] Error generating weekly report: {e}")
        return jsonify({'error': 'Failed to generate report'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# COMMUNITY-SPECIFIC ADMIN ROUTES
# =====================================

@admin_bp.route('/community/<int:community_id>/stats', methods=['GET'])
@jwt_required()
@require_community_admin
def get_community_admin_stats(community_id):
    """Get admin statistics for a specific community."""
    conn = None
    try:
        days = min(request.args.get('days', 7, type=int), 30)
        time_threshold = datetime.now() - timedelta(days=days)
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Community info
            cur.execute("SELECT * FROM communities WHERE id = %s", (community_id,))
            community = cur.fetchone()
            if not community:
                return jsonify({'error': 'Community not found'}), 404
            
            # Member count
            cur.execute("""
                SELECT COUNT(*) as count FROM community_members WHERE community_id = %s
            """, (community_id,))
            member_count = cur.fetchone()['count']
            
            # Message count
            cur.execute("""
                SELECT COUNT(*) as count FROM messages m
                JOIN channels ch ON m.channel_id = ch.id
                WHERE ch.community_id = %s AND m.created_at >= %s
            """, (community_id, time_threshold))
            message_count = cur.fetchone()['count']
            
            # Active users
            cur.execute("""
                SELECT COUNT(DISTINCT m.sender_id) as count FROM messages m
                JOIN channels ch ON m.channel_id = ch.id
                WHERE ch.community_id = %s AND m.created_at >= %s
            """, (community_id, time_threshold))
            active_users = cur.fetchone()['count']
            
            # Moderation stats
            cur.execute("""
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(output_data, '$.severity')) IN ('high', 'critical') THEN 1 ELSE 0 END) as high_severity
                FROM ai_agent_logs
                WHERE community_id = %s AND agent_name = 'moderation'
                AND created_at >= %s
            """, (community_id, time_threshold))
            mod_stats = cur.fetchone()
            
            # Blocked users in this community
            cur.execute("""
                SELECT COUNT(*) as count FROM blocked_users WHERE community_id = %s
            """, (community_id,))
            blocked_count = cur.fetchone()['count']
            
            return jsonify({
                'success': True,
                'community': {
                    'id': community['id'],
                    'name': community['name']
                },
                'stats': {
                    'member_count': member_count,
                    'message_count': message_count,
                    'active_users': active_users,
                    'moderation_flags': mod_stats['total'] or 0,
                    'high_severity_flags': mod_stats['high_severity'] or 0,
                    'blocked_users': blocked_count
                },
                'time_period_days': days
            }), 200
            
    except Exception as e:
        log.error(f"[ADMIN] Error getting community stats: {e}")
        return jsonify({'error': 'Failed to fetch community stats'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# COMMUNITY-SCOPED ROUTES (for community admin dashboard)
# =====================================

@admin_bp.route('/community/<int:community_id>/overview', methods=['GET'])
@jwt_required()
@require_community_admin
def get_community_overview(community_id):
    """Get overview stats for a specific community (community admin dashboard)."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            now = datetime.now()
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            week_ago = now - timedelta(days=7)
            yesterday_start = today_start - timedelta(days=1)

            # Get channels in this community
            cur.execute("SELECT id FROM channels WHERE community_id = %s", (community_id,))
            channel_ids = [c['id'] for c in cur.fetchall()]
            total_channels = len(channel_ids)

            # Members count
            cur.execute("SELECT COUNT(*) as c FROM community_members WHERE community_id = %s", (community_id,))
            total_members = cur.fetchone()['c']

            if channel_ids:
                ph = ','.join(['%s'] * len(channel_ids))

                # Active users today
                cur.execute(f"SELECT COUNT(DISTINCT sender_id) as c FROM messages WHERE channel_id IN ({ph}) AND created_at >= %s",
                            channel_ids + [today_start])
                active_today = cur.fetchone()['c']

                # Messages today / this week
                cur.execute(f"SELECT COUNT(*) as c FROM messages WHERE channel_id IN ({ph}) AND created_at >= %s",
                            channel_ids + [today_start])
                messages_today = cur.fetchone()['c']

                cur.execute(f"SELECT COUNT(*) as c FROM messages WHERE channel_id IN ({ph}) AND created_at >= %s",
                            channel_ids + [week_ago])
                messages_week = cur.fetchone()['c']

                # Messages yesterday (for trend)
                cur.execute(f"SELECT COUNT(*) as c FROM messages WHERE channel_id IN ({ph}) AND created_at >= %s AND created_at < %s",
                            channel_ids + [yesterday_start, today_start])
                messages_yesterday = cur.fetchone()['c']

                # Flagged today
                cur.execute(f"""SELECT COUNT(*) as c FROM ai_agent_logs l
                    JOIN ai_agents a ON l.agent_id = a.id
                    WHERE a.type = 'moderator' AND l.channel_id IN ({ph}) AND l.created_at >= %s
                    AND l.output_text NOT LIKE '%%"action": "allow"%%'
                    AND l.output_text NOT LIKE '%%"action":"allow"%%'""",
                    channel_ids + [today_start])
                flagged_today = cur.fetchone()['c']

                # High severity this week
                cur.execute(f"""SELECT COUNT(*) as c FROM ai_agent_logs l
                    JOIN ai_agents a ON l.agent_id = a.id
                    WHERE a.type = 'moderator' AND l.channel_id IN ({ph}) AND l.created_at >= %s
                    AND (l.output_text LIKE '%%"severity": "high"%%' OR l.output_text LIKE '%%"severity":"high"%%'
                         OR l.output_text LIKE '%%"severity": "critical"%%' OR l.output_text LIKE '%%"severity":"critical"%%')""",
                    channel_ids + [week_ago])
                high_severity = cur.fetchone()['c']

                # Agent activity
                cur.execute(f"""SELECT COALESCE(a.type, 'unknown') as agent_type, COUNT(*) as activity_count,
                    MAX(l.created_at) as last_activity
                    FROM ai_agent_logs l LEFT JOIN ai_agents a ON l.agent_id = a.id
                    WHERE l.channel_id IN ({ph}) AND l.created_at >= %s
                    GROUP BY agent_type""", channel_ids + [today_start])
                agent_rows = cur.fetchall()
            else:
                active_today = messages_today = messages_week = messages_yesterday = 0
                flagged_today = high_severity = 0
                agent_rows = []

            # Online members
            cur.execute("""SELECT COUNT(DISTINCT u.id) as c FROM users u
                JOIN community_members cm ON u.id = cm.user_id
                WHERE cm.community_id = %s AND u.status = 'online'""", (community_id,))
            online_users = cur.fetchone()['c']

            # Blocked users in community
            cur.execute("SELECT COUNT(*) as c FROM blocked_users WHERE community_id = %s", (community_id,))
            blocked_users = cur.fetchone()['c']

            message_trend = round(((messages_today - messages_yesterday) / messages_yesterday) * 100, 1) if messages_yesterday > 0 else 0

            # Build agent status
            agent_status = {}
            for a in agent_rows:
                t = a['agent_type'] or 'unknown'
                if t == 'moderator': t = 'moderation'
                agent_status[t] = {
                    'status': 'active' if a['activity_count'] > 0 else 'idle',
                    'activity_count': a['activity_count'],
                    'last_activity': a['last_activity'].isoformat() if a['last_activity'] else None
                }
            for ag in ['summarizer', 'mood_tracker', 'moderation', 'engagement', 'wellness', 'knowledge_builder', 'focus']:
                if ag not in agent_status:
                    agent_status[ag] = {'status': 'idle', 'activity_count': 0, 'last_activity': None}

            return jsonify({
                'success': True,
                'stats': {
                    'users': {'total': total_members, 'active_today': active_today, 'online': online_users},
                    'messages': {'today': messages_today, 'this_week': messages_week, 'trend_percent': message_trend},
                    'channels': {'total': total_channels},
                    'moderation': {'flagged_today': flagged_today, 'blocked_users': blocked_users, 'high_severity': high_severity},
                    'agents': agent_status
                }
            }), 200
    except Exception as e:
        log.error(f"[ADMIN] Community overview error: {e}")
        return jsonify({'error': 'Failed to fetch community overview'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/community/<int:community_id>/alerts', methods=['GET'])
@jwt_required()
@require_community_admin
def get_community_alerts(community_id):
    """Get recent moderation alerts for a specific community."""
    conn = None
    try:
        limit = min(request.args.get('limit', 10, type=int), 50)
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT l.id, l.user_id, l.channel_id, l.input_text as message_text,
                    JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.reasons[0]')) as flag_type,
                    JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.severity')) as severity,
                    l.confidence_score as confidence,
                    JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.action')) as action_taken,
                    JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.reasons')) as reason,
                    l.created_at,
                    u.username, u.avatar_url,
                    ch.name as channel_name
                FROM ai_agent_logs l
                JOIN users u ON l.user_id = u.id
                LEFT JOIN channels ch ON l.channel_id = ch.id
                WHERE l.agent_name = 'moderation'
                AND ch.community_id = %s
                AND JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.severity')) IN ('medium', 'high', 'critical')
                ORDER BY l.created_at DESC LIMIT %s
            """, (community_id, limit))
            alerts = cur.fetchall()

            return jsonify({
                'success': True,
                'alerts': [{
                    'id': a['id'],
                    'user': {'id': a['user_id'], 'username': a['username'], 'avatar_url': a['avatar_url']},
                    'channel': {'id': a['channel_id'], 'name': a['channel_name']},
                    'message_preview': (a['message_text'] or '')[:100],
                    'flag_type': a['flag_type'], 'severity': a['severity'],
                    'confidence': a['confidence'], 'action_taken': a['action_taken'],
                    'reason': a['reason'],
                    'created_at': a['created_at'].isoformat() if a['created_at'] else None
                } for a in alerts],
                'count': len(alerts)
            }), 200
    except Exception as e:
        log.error(f"[ADMIN] Community alerts error: {e}")
        return jsonify({'error': 'Failed to fetch alerts'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/community/<int:community_id>/moderation/flagged', methods=['GET'])
@jwt_required()
@require_community_admin
def get_community_flagged(community_id):
    """Get flagged messages scoped to a specific community."""
    conn = None
    try:
        severity = request.args.get('severity')
        flag_type = request.args.get('flag_type')
        status_filter = request.args.get('status')
        limit = min(request.args.get('limit', 20, type=int), 100)
        offset = max(request.args.get('offset', 0, type=int), 0)

        conn = get_db_connection()
        with conn.cursor() as cur:
            base = """FROM ai_agent_logs l
                JOIN users u ON l.user_id = u.id
                LEFT JOIN channels ch ON l.channel_id = ch.id
                WHERE l.agent_name = 'moderation' AND ch.community_id = %s"""
            params = [community_id]

            if status_filter:
                base += " AND JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.action')) = %s"
                params.append(status_filter)
            if severity:
                base += " AND JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.severity')) = %s"
                params.append(severity)
            if flag_type:
                base += " AND JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.reasons')) LIKE %s"
                params.append(f'%{flag_type}%')

            cur.execute("SELECT COUNT(*) as total " + base, params)
            total = cur.fetchone()['total']

            select = """SELECT l.id, l.user_id, l.channel_id, l.input_text as message_text,
                JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.reasons[0]')) as flag_type,
                JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.severity')) as severity,
                l.confidence_score as confidence,
                JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.action')) as action_taken,
                JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.reasons')) as reason,
                l.created_at, u.username, u.display_name, u.avatar_url, ch.name as channel_name,
                (SELECT COUNT(*) FROM ai_agent_logs l2 WHERE l2.user_id = l.user_id
                 AND l2.agent_name = 'moderation'
                 AND JSON_UNQUOTE(JSON_EXTRACT(l2.output_data, '$.action')) != 'allow') as violation_count """
            query = select + base + " ORDER BY l.created_at DESC LIMIT %s OFFSET %s"
            params.extend([limit, offset])
            cur.execute(query, params)
            flagged = cur.fetchall()

            return jsonify({
                'success': True,
                'flagged_messages': [{
                    'id': f['id'],
                    'user': {'id': f['user_id'], 'username': f['username'], 'display_name': f['display_name'],
                             'avatar_url': f['avatar_url'], 'violation_count': f['violation_count']},
                    'channel': {'id': f['channel_id'], 'name': f['channel_name']},
                    'message_text': f['message_text'], 'flag_type': f['flag_type'],
                    'severity': f['severity'], 'confidence': f['confidence'],
                    'action_taken': f['action_taken'], 'reason': f['reason'],
                    'created_at': f['created_at'].isoformat() if f['created_at'] else None
                } for f in flagged],
                'pagination': {'total': total, 'limit': limit, 'offset': offset, 'has_more': offset + limit < total}
            }), 200
    except Exception as e:
        log.error(f"[ADMIN] Community flagged error: {e}")
        return jsonify({'error': 'Failed to fetch flagged messages'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/community/<int:community_id>/moderation/resolve/<int:log_id>', methods=['POST'])
@jwt_required()
@require_community_admin
def resolve_community_flag(community_id, log_id):
    """Resolve a moderation flag within a community."""
    conn = None
    try:
        data = request.get_json() or {}
        action = data.get('action')
        note = data.get('note', '')
        if action not in ['approve', 'warn', 'delete', 'ban', 'mute']:
            return jsonify({'error': 'Invalid action'}), 400

        conn = get_db_connection()
        with conn.cursor() as cur:
            # Verify log belongs to this community
            cur.execute("""SELECT l.id FROM ai_agent_logs l
                LEFT JOIN channels ch ON l.channel_id = ch.id
                WHERE l.id = %s AND ch.community_id = %s""", (log_id, community_id))
            if not cur.fetchone():
                return jsonify({'error': 'Flag not found in this community'}), 404

            cur.execute("""UPDATE ai_agent_logs
                SET output_data = JSON_SET(COALESCE(output_data, '{}'), '$.resolved_action', %s,
                    '$.resolved_note', %s, '$.resolved_at', %s, '$.resolved_by', %s)
                WHERE id = %s""",
                (action, note, datetime.now().isoformat(), request.admin_username, log_id))

            target_user_id = None
            if action == 'ban':
                cur.execute("SELECT user_id FROM ai_agent_logs WHERE id = %s", (log_id,))
                row = cur.fetchone()
                if row:
                    target_user_id = row['user_id']
                    cur.execute("""INSERT IGNORE INTO blocked_users (user_id, community_id, reason, blocked_by, blocked_at)
                        VALUES (%s, %s, %s, %s, NOW())""",
                        (row['user_id'], community_id, note or f'Banned via moderation #{log_id}', request.admin_user_id))
            conn.commit()

            log_admin_action(
                actor_user_id=request.admin_user_id,
                actor_role='system_admin' if getattr(request, 'is_system_admin', False) else 'community_admin',
                action='flag.resolve',
                target_type='message',
                target_id=log_id,
                community_id=community_id,
                metadata={'action': action, 'note': note, 'target_user_id': target_user_id},
            )

            return jsonify({'success': True, 'message': f'Action "{action}" applied'}), 200
    except Exception as e:
        log.error(f"[ADMIN] Resolve community flag error: {e}")
        if conn: conn.rollback()
        return jsonify({'error': 'Failed to resolve flag'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/community/<int:community_id>/moderation/blocked', methods=['GET'])
@jwt_required()
@require_community_admin
def get_community_blocked(community_id):
    """Get blocked users in a specific community."""
    conn = None
    try:
        limit = min(request.args.get('limit', 20, type=int), 100)
        offset = max(request.args.get('offset', 0, type=int), 0)
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""SELECT bu.id, bu.user_id, bu.blocked_at,
                    u.username, u.display_name, u.avatar_url, u.email,
                    (SELECT COUNT(*) FROM ai_agent_logs l WHERE l.user_id = bu.user_id
                     AND l.agent_name = 'moderation'
                     AND JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.action')) != 'allow') as total_violations
                FROM blocked_users bu JOIN users u ON bu.user_id = u.id
                WHERE bu.community_id = %s
                ORDER BY bu.blocked_at DESC LIMIT %s OFFSET %s""",
                (community_id, limit, offset))
            blocked = cur.fetchall()

            cur.execute("SELECT COUNT(*) as c FROM blocked_users WHERE community_id = %s", (community_id,))
            total = cur.fetchone()['c']

            return jsonify({
                'success': True,
                'blocked_users': [{
                    'id': b['id'],
                    'user': {'id': b['user_id'], 'username': b['username'], 'display_name': b['display_name'],
                             'avatar_url': b['avatar_url'], 'email': b['email']},
                    'blocked_at': b['blocked_at'].isoformat() if b['blocked_at'] else None,
                    'reason': '', 'total_violations': b['total_violations']
                } for b in blocked],
                'pagination': {'total': total, 'limit': limit, 'offset': offset, 'has_more': offset + limit < total}
            }), 200
    except Exception as e:
        log.error(f"[ADMIN] Community blocked users error: {e}")
        return jsonify({'error': 'Failed to fetch blocked users'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/community/<int:community_id>/moderation/unblock/<int:user_id>', methods=['DELETE'])
@jwt_required()
@require_community_admin
def unblock_community_user(community_id, user_id):
    """Unblock a user from a specific community."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("DELETE FROM blocked_users WHERE user_id = %s AND community_id = %s", (user_id, community_id))
            if cur.rowcount == 0:
                return jsonify({'error': 'Block record not found'}), 404
            conn.commit()
            try:
                from services.redis_client import get_redis as _get_redis
                _r = _get_redis()
                if _r:
                    _r.delete(f"blocked:{community_id}:{user_id}")
            except Exception:
                pass
            return jsonify({'success': True, 'message': 'User unblocked'}), 200
    except Exception as e:
        log.error(f"[ADMIN] Unblock community user error: {e}")
        if conn: conn.rollback()
        return jsonify({'error': 'Failed to unblock user'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/community/<int:community_id>/moderation/block', methods=['POST'])
@jwt_required()
@require_community_admin
def block_community_user(community_id):
    """Block a user from a specific community."""
    conn = None
    try:
        data = request.get_json() or {}
        user_id = data.get('user_id')
        reason = data.get('reason', '')
        if not user_id:
            return jsonify({'error': 'user_id is required'}), 400

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""INSERT INTO blocked_users (user_id, community_id, reason, blocked_by, blocked_at)
                VALUES (%s, %s, %s, %s, NOW())""",
                (user_id, community_id, reason, request.admin_user_id))
            conn.commit()
            try:
                from services.redis_client import get_redis as _get_redis
                _r = _get_redis()
                if _r:
                    _r.delete(f"blocked:{community_id}:{user_id}")
            except Exception:
                pass
            return jsonify({'success': True, 'message': 'User blocked'}), 200
    except Exception as e:
        log.error(f"[ADMIN] Block community user error: {e}")
        if conn: conn.rollback()
        return jsonify({'error': 'Failed to block user'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/community/<int:community_id>/members', methods=['GET'])
@jwt_required()
@require_community_admin
def get_community_members(community_id):
    """Get members of a specific community."""
    conn = None
    try:
        status_filter = request.args.get('status')
        role_filter = request.args.get('role')
        search = request.args.get('search', '')
        limit = min(request.args.get('limit', 20, type=int), 100)
        offset = max(request.args.get('offset', 0, type=int), 0)

        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get channel IDs for message count
            cur.execute("SELECT id FROM channels WHERE community_id = %s", (community_id,))
            ch_ids = [c['id'] for c in cur.fetchall()]
            ch_ph = ','.join(['%s'] * len(ch_ids)) if ch_ids else "''"

            base_where = "FROM users u JOIN community_members cm ON u.id = cm.user_id WHERE cm.community_id = %s"
            params = [community_id]

            if status_filter:
                base_where += " AND u.status = %s"
                params.append(status_filter)
            if role_filter:
                base_where += " AND cm.role = %s"
                params.append(role_filter)
            if search:
                base_where += " AND (u.username LIKE %s OR u.display_name LIKE %s OR u.email LIKE %s)"
                s = f"%{search}%"
                params.extend([s, s, s])

            cur.execute("SELECT COUNT(DISTINCT u.id) as total " + base_where, params)
            total = cur.fetchone()['total']

            msg_sub = f"(SELECT COUNT(*) FROM messages WHERE sender_id = u.id AND channel_id IN ({ch_ph}))" if ch_ids else "0"
            viol_sub = f"""(SELECT COUNT(*) FROM ai_agent_logs WHERE user_id = u.id AND agent_name = 'moderation'
                {f'AND channel_id IN ({ch_ph})' if ch_ids else 'AND 1=0'}
                AND JSON_UNQUOTE(JSON_EXTRACT(output_data, '$.action')) != 'allow')"""

            select = f"""SELECT u.id, u.username, u.display_name, u.email, u.avatar_url, u.status,
                u.created_at, u.last_seen, cm.role, cm.joined_at,
                {msg_sub} as message_count, {viol_sub} as violation_count """

            query_params = []
            if ch_ids:
                query_params.extend(ch_ids)
            if ch_ids:
                query_params.extend(ch_ids)
            query_params.extend(params)

            query = select + base_where + " ORDER BY cm.joined_at DESC LIMIT %s OFFSET %s"
            query_params.extend([limit, offset])

            cur.execute(query, query_params)
            members = cur.fetchall()

            return jsonify({
                'success': True,
                'members': [{
                    'id': m['id'], 'username': m['username'], 'display_name': m['display_name'],
                    'email': m['email'], 'avatar_url': m['avatar_url'], 'status': m['status'],
                    'role': m['role'], 'joined_at': m['joined_at'].isoformat() if m['joined_at'] else None,
                    'created_at': m['created_at'].isoformat() if m['created_at'] else None,
                    'last_seen': m['last_seen'].isoformat() if m['last_seen'] else None,
                    'stats': {'message_count': m['message_count'], 'violation_count': m['violation_count']}
                } for m in members],
                'pagination': {'total': total, 'limit': limit, 'offset': offset, 'has_more': offset + limit < total}
            }), 200
    except Exception as e:
        log.error(f"[ADMIN] Community members error: {e}")
        import traceback; traceback.print_exc()
        return jsonify({'error': 'Failed to fetch members'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/community/<int:community_id>/members/<int:user_id>', methods=['GET'])
@jwt_required()
@require_community_admin
def get_community_member_details(community_id, user_id):
    """Get details of a specific member in a community."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""SELECT u.id, u.username, u.display_name, u.email, u.avatar_url,
                u.status, u.created_at, u.last_seen, cm.role, cm.joined_at
                FROM users u JOIN community_members cm ON u.id = cm.user_id
                WHERE cm.community_id = %s AND u.id = %s""", (community_id, user_id))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'Member not found'}), 404

            # Stats
            cur.execute("SELECT id FROM channels WHERE community_id = %s", (community_id,))
            ch_ids = [c['id'] for c in cur.fetchall()]
            msg_count = 0
            violation_count = 0
            if ch_ids:
                ph = ','.join(['%s'] * len(ch_ids))
                cur.execute(f"SELECT COUNT(*) as c FROM messages WHERE sender_id = %s AND channel_id IN ({ph})",
                            [user_id] + ch_ids)
                msg_count = cur.fetchone()['c']
                cur.execute(f"""SELECT COUNT(*) as c FROM ai_agent_logs
                    WHERE user_id = %s AND agent_name = 'moderation' AND channel_id IN ({ph})
                    AND JSON_UNQUOTE(JSON_EXTRACT(output_data, '$.action')) != 'allow'""",
                    [user_id] + ch_ids)
                violation_count = cur.fetchone()['c']

            return jsonify({
                'success': True,
                'user': {
                    'id': user['id'], 'username': user['username'], 'display_name': user['display_name'],
                    'email': user['email'], 'avatar_url': user['avatar_url'], 'status': user['status'],
                    'role': user['role'],
                    'joined_at': user['joined_at'].isoformat() if user['joined_at'] else None,
                    'created_at': user['created_at'].isoformat() if user['created_at'] else None,
                    'last_seen': user['last_seen'].isoformat() if user['last_seen'] else None,
                    'stats': {'message_count': msg_count, 'violation_count': violation_count}
                }
            }), 200
    except Exception as e:
        log.error(f"[ADMIN] Community member details error: {e}")
        return jsonify({'error': 'Failed to fetch member details'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/community/<int:community_id>/analytics/health', methods=['GET'])
@jwt_required()
@require_community_admin
def get_community_health_scoped(community_id):
    """Get health metrics for a specific community."""
    conn = None
    try:
        days = min(request.args.get('days', 7, type=int), 90)
        time_threshold = datetime.now() - timedelta(days=days)
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""SELECT c.id, c.name, c.logo_url, c.created_at,
                (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count,
                (SELECT COUNT(*) FROM channels WHERE community_id = c.id) as channel_count,
                (SELECT COUNT(*) FROM messages m JOIN channels ch ON m.channel_id = ch.id
                 WHERE ch.community_id = c.id AND m.created_at >= %s) as message_count,
                (SELECT COUNT(DISTINCT m.sender_id) FROM messages m JOIN channels ch ON m.channel_id = ch.id
                 WHERE ch.community_id = c.id AND m.created_at >= %s) as active_users,
                (SELECT COUNT(*) FROM ai_agent_logs l WHERE l.community_id = c.id AND l.agent_name = 'moderation'
                 AND l.created_at >= %s AND JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.action')) != 'allow') as moderation_issues,
                (SELECT COUNT(*) FROM blocked_users WHERE community_id = c.id) as blocked_count
                FROM communities c WHERE c.id = %s""",
                (time_threshold, time_threshold, time_threshold, community_id))
            c = cur.fetchone()
            if not c:
                return jsonify({'error': 'Community not found'}), 404

            activity_score = min(c['message_count'] / 10, 40)
            engagement_score = min((c['active_users'] / max(c['member_count'], 1)) * 40, 40)
            safety_score = max(20 - (c['moderation_issues'] * 2), 0)
            health_score = round(activity_score + engagement_score + safety_score)
            health_level = 'healthy' if health_score >= 70 else 'moderate' if health_score >= 40 else 'needs_attention'

            return jsonify({
                'success': True,
                'health_score': health_score,
                'health_level': health_level,
                'activity_trend': 'stable',
                'metrics': {
                    'engagement_rate': round((c['active_users'] / max(c['member_count'], 1)) * 100, 1),
                    'retention_rate': 85.0,
                    'growth_rate': 0.0
                },
                'community': {
                    'id': c['id'], 'name': c['name'], 'member_count': c['member_count'],
                    'channel_count': c['channel_count'], 'message_count': c['message_count'],
                    'active_users': c['active_users'], 'health_score': health_score, 'health_level': health_level
                },
                'time_period_days': days
            }), 200
    except Exception as e:
        log.error(f"[ADMIN] Community health error: {e}")
        return jsonify({'error': 'Failed to fetch community health'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/community/<int:community_id>/analytics/mood', methods=['GET'])
@jwt_required()
@require_community_admin
def get_community_mood(community_id):
    """Get mood trends for a specific community."""
    conn = None
    try:
        days = min(request.args.get('days', 7, type=int), 30)
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""SELECT DATE(um.created_at) as date, um.mood, COUNT(*) as count
                FROM user_moods um
                WHERE um.created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
                AND um.channel_id IN (SELECT id FROM channels WHERE community_id = %s)
                GROUP BY DATE(um.created_at), um.mood ORDER BY date""", (days, community_id))
            daily_moods = cur.fetchall()

            cur.execute("""SELECT CASE WHEN sentiment_score > 0.3 THEN 'positive'
                    WHEN sentiment_score < -0.3 THEN 'negative' ELSE 'neutral' END as sentiment,
                    COUNT(*) as count
                FROM user_moods
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
                AND channel_id IN (SELECT id FROM channels WHERE community_id = %s)
                GROUP BY sentiment""", (days, community_id))
            sentiment_dist = cur.fetchall()

            # Build daily data
            daily_data = {}
            for m in daily_moods:
                ds = m['date'].isoformat() if m['date'] else None
                if ds not in daily_data:
                    daily_data[ds] = {'date': ds, 'positive': 0, 'negative': 0, 'neutral': 0}
                mood = (m['mood'] or 'neutral').lower()
                if mood in ['happy', 'excited', 'joy', 'love', 'positive']:
                    daily_data[ds]['positive'] += m['count']
                elif mood in ['sad', 'angry', 'fear', 'anxiety', 'negative']:
                    daily_data[ds]['negative'] += m['count']
                else:
                    daily_data[ds]['neutral'] += m['count']

            total_entries = sum(s['count'] for s in sentiment_dist)
            dist_dict = {s['sentiment']: s['count'] for s in sentiment_dist}

            return jsonify({
                'success': True,
                'daily_trends': list(daily_data.values()),
                'sentiment_distribution': dist_dict,
                'sentiment_percentages': {k: round(v / max(total_entries, 1) * 100, 1) for k, v in dist_dict.items()},
                'trend_direction': 'stable',
                'dominant_mood': max(dist_dict, key=dist_dict.get) if dist_dict else 'neutral',
                'mood_categories': {},
                'hourly_summary': [],
                'total_entries': total_entries,
                'has_data': total_entries > 0,
                'time_period_days': days
            }), 200
    except Exception as e:
        log.error(f"[ADMIN] Community mood error: {e}")
        return jsonify({'error': 'Failed to fetch mood trends'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/community/<int:community_id>/analytics/engagement', methods=['GET'])
@jwt_required()
@require_community_admin
def get_community_engagement(community_id):
    """Get engagement analytics for a specific community."""
    conn = None
    try:
        days = min(request.args.get('days', 7, type=int), 30)
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""SELECT DATE(m.created_at) as date, COUNT(*) as message_count,
                    COUNT(DISTINCT m.sender_id) as active_users
                FROM messages m JOIN channels ch ON m.channel_id = ch.id
                WHERE ch.community_id = %s AND m.created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
                GROUP BY DATE(m.created_at) ORDER BY date""", (community_id, days))
            daily = cur.fetchall()

            cur.execute("""SELECT HOUR(m.created_at) as hour, DAYOFWEEK(m.created_at) as day_of_week,
                    COUNT(*) as count
                FROM messages m JOIN channels ch ON m.channel_id = ch.id
                WHERE ch.community_id = %s AND m.created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
                GROUP BY HOUR(m.created_at), DAYOFWEEK(m.created_at)""", (community_id, days))
            hourly = cur.fetchall()

            cur.execute("""SELECT ch.id, ch.name, COUNT(*) as message_count
                FROM messages m JOIN channels ch ON m.channel_id = ch.id
                WHERE ch.community_id = %s AND m.created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
                GROUP BY ch.id, ch.name ORDER BY message_count DESC LIMIT 10""", (community_id, days))
            top_channels = cur.fetchall()

            return jsonify({
                'success': True,
                'daily_engagement': [{'date': d['date'].isoformat() if d['date'] else None,
                    'message_count': d['message_count'], 'active_users': d['active_users']} for d in daily],
                'hourly_distribution': [{'hour': h['hour'], 'day_of_week': h['day_of_week'],
                    'count': h['count']} for h in hourly],
                'top_channels': [{'id': c['id'], 'name': c['name'],
                    'message_count': c['message_count']} for c in top_channels],
                'time_period_days': days
            }), 200
    except Exception as e:
        log.error(f"[ADMIN] Community engagement error: {e}")
        return jsonify({'error': 'Failed to fetch engagement analytics'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/community/<int:community_id>/reports/daily', methods=['GET'])
@jwt_required()
@require_community_admin
def get_community_daily_report(community_id):
    """Get daily report for a specific community."""
    conn = None
    try:
        date_str = request.args.get('date')
        report_date = datetime.strptime(date_str, '%Y-%m-%d').date() if date_str else datetime.now().date()
        day_start = datetime.combine(report_date, datetime.min.time())
        day_end = datetime.combine(report_date, datetime.max.time())
        prev_start = day_start - timedelta(days=1)

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""SELECT COUNT(*) as c FROM messages m JOIN channels ch ON m.channel_id = ch.id
                WHERE ch.community_id = %s AND m.created_at BETWEEN %s AND %s""",
                (community_id, day_start, day_end))
            msgs_today = cur.fetchone()['c']

            cur.execute("""SELECT COUNT(*) as c FROM messages m JOIN channels ch ON m.channel_id = ch.id
                WHERE ch.community_id = %s AND m.created_at BETWEEN %s AND %s""",
                (community_id, prev_start, day_start))
            msgs_yesterday = cur.fetchone()['c']

            cur.execute("""SELECT COUNT(DISTINCT m.sender_id) as c FROM messages m JOIN channels ch ON m.channel_id = ch.id
                WHERE ch.community_id = %s AND m.created_at BETWEEN %s AND %s""",
                (community_id, day_start, day_end))
            active_users = cur.fetchone()['c']

            cur.execute("""SELECT COUNT(*) as c FROM community_members
                WHERE community_id = %s AND joined_at BETWEEN %s AND %s""",
                (community_id, day_start, day_end))
            new_members = cur.fetchone()['c']

            # Moderation breakdown
            cur.execute("""SELECT JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.reasons[0]')) as flag_type, COUNT(*) as count
                FROM ai_agent_logs l LEFT JOIN channels ch ON l.channel_id = ch.id
                WHERE l.agent_name = 'moderation' AND ch.community_id = %s
                AND l.created_at BETWEEN %s AND %s GROUP BY flag_type""",
                (community_id, day_start, day_end))
            mod_breakdown = {m['flag_type']: m['count'] for m in cur.fetchall()}

            # Agent activity
            cur.execute("""SELECT l.agent_name, COUNT(*) as count
                FROM ai_agent_logs l LEFT JOIN channels ch ON l.channel_id = ch.id
                WHERE ch.community_id = %s AND l.created_at BETWEEN %s AND %s
                GROUP BY l.agent_name""", (community_id, day_start, day_end))
            agent_activity = {a['agent_name']: a['count'] for a in cur.fetchall()}

            trend = round(((msgs_today - msgs_yesterday) / msgs_yesterday) * 100, 1) if msgs_yesterday > 0 else 0

            return jsonify({
                'success': True,
                'report': {
                    'date': report_date.isoformat(),
                    'summary': {'total_messages': msgs_today, 'message_trend_percent': trend,
                                'active_users': active_users, 'new_users': new_members},
                    'moderation': {'total_flags': sum(mod_breakdown.values()), 'breakdown': mod_breakdown},
                    'sentiment': {},
                    'ai_agents': agent_activity
                }
            }), 200
    except Exception as e:
        log.error(f"[ADMIN] Community daily report error: {e}")
        return jsonify({'error': 'Failed to generate report'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/community/<int:community_id>/reports/weekly', methods=['GET'])
@jwt_required()
@require_community_admin
def get_community_weekly_report(community_id):
    """Get weekly report for a specific community."""
    conn = None
    try:
        week_end = datetime.now()
        week_start = week_end - timedelta(days=7)
        prev_start = week_start - timedelta(days=7)

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""SELECT COUNT(*) as messages, COUNT(DISTINCT m.sender_id) as active_users
                FROM messages m JOIN channels ch ON m.channel_id = ch.id
                WHERE ch.community_id = %s AND m.created_at >= %s""", (community_id, week_start))
            this_week = cur.fetchone()

            cur.execute("""SELECT COUNT(*) as messages, COUNT(DISTINCT m.sender_id) as active_users
                FROM messages m JOIN channels ch ON m.channel_id = ch.id
                WHERE ch.community_id = %s AND m.created_at >= %s AND m.created_at < %s""",
                (community_id, prev_start, week_start))
            prev_week = cur.fetchone()

            cur.execute("""SELECT COUNT(*) as c FROM community_members
                WHERE community_id = %s AND joined_at >= %s""", (community_id, week_start))
            new_members = cur.fetchone()['c']

            msg_trend = round(((this_week['messages'] - prev_week['messages']) / prev_week['messages']) * 100, 1) if prev_week['messages'] > 0 else 0
            user_trend = round(((this_week['active_users'] - prev_week['active_users']) / prev_week['active_users']) * 100, 1) if prev_week['active_users'] > 0 else 0

            return jsonify({
                'success': True,
                'report': {
                    'period': {'start': week_start.isoformat(), 'end': week_end.isoformat()},
                    'summary': {
                        'total_messages': this_week['messages'], 'message_trend_percent': msg_trend,
                        'active_users': this_week['active_users'], 'user_trend_percent': user_trend,
                        'new_users': new_members
                    },
                    'top_communities': []
                }
            }), 200
    except Exception as e:
        log.error(f"[ADMIN] Community weekly report error: {e}")
        return jsonify({'error': 'Failed to generate report'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# SYSTEM ADMIN ONLY ENDPOINTS
# =====================================

def require_true_system_admin(f):
    """Decorator that requires users.role = 'system_admin'. No community-owner fallback."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        username = get_jwt_identity()
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT id, role FROM users WHERE username = %s", (username,))
                user = cur.fetchone()
                if not user:
                    return jsonify({'error': 'User not found'}), 404
                if user['role'] != 'system_admin':
                    return jsonify({'error': 'System admin access required'}), 403
                request.admin_user_id = user['id']
                request.admin_username = username
                request.is_system_admin = True
        finally:
            conn.close()
        return f(*args, **kwargs)
    return decorated_function


@admin_bp.route('/system/communities', methods=['GET'])
@jwt_required()
@require_true_system_admin
def get_all_communities():
    """Get ALL communities on the platform. System admin only."""
    conn = None
    try:
        search = request.args.get('search', '')
        limit = min(request.args.get('limit', 20, type=int), 100)
        offset = max(request.args.get('offset', 0, type=int), 0)
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            query = """
                SELECT 
                    c.id, c.name, c.description, c.icon, c.color, c.logo_url, c.created_at,
                    (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count,
                    (SELECT COUNT(*) FROM channels WHERE community_id = c.id) as channel_count,
                    (SELECT u.username FROM users u 
                     JOIN community_members cm ON u.id = cm.user_id 
                     WHERE cm.community_id = c.id AND cm.role = 'owner' LIMIT 1) as owner_username,
                    (SELECT COUNT(*) FROM messages msg
                     JOIN channels ch ON msg.channel_id = ch.id
                     WHERE ch.community_id = c.id AND msg.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) as messages_7d
                FROM communities c
                WHERE 1=1
            """
            params = []
            
            if search:
                query += " AND (c.name LIKE %s OR c.description LIKE %s)"
                search_param = f"%{search}%"
                params.extend([search_param, search_param])
            
            count_query = "SELECT COUNT(*) as total FROM communities c WHERE 1=1"
            count_params = []
            if search:
                count_query += " AND (c.name LIKE %s OR c.description LIKE %s)"
                search_param = f"%{search}%"
                count_params.extend([search_param, search_param])
            
            cur.execute(count_query, count_params)
            total = cur.fetchone()['total']
            
            query += " ORDER BY c.created_at DESC LIMIT %s OFFSET %s"
            params.extend([limit, offset])
            
            cur.execute(query, params)
            communities = cur.fetchall()
            
            result = [{
                'id': c['id'],
                'name': c['name'],
                'description': c['description'],
                'icon': c['icon'],
                'color': c['color'],
                'logo_url': c['logo_url'],
                'created_at': c['created_at'].isoformat() if c['created_at'] else None,
                'member_count': c['member_count'],
                'channel_count': c['channel_count'],
                'owner_username': c['owner_username'],
                'messages_7d': c['messages_7d']
            } for c in communities]
            
            return jsonify({
                'success': True,
                'communities': result,
                'pagination': {
                    'total': total,
                    'limit': limit,
                    'offset': offset,
                    'has_more': offset + limit < total
                }
            }), 200
    except Exception as e:
        log.error(f"[ADMIN] Error getting all communities: {e}")
        return jsonify({'error': 'Failed to fetch communities'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/system/users/<int:user_id>/role', methods=['PUT'])
@jwt_required()
@require_true_system_admin
def update_user_system_role(user_id):
    """Change a user's system role. System admin only."""
    conn = None
    try:
        data = request.get_json() or {}
        new_role = data.get('role')
        
        if new_role not in ['user', 'system_admin']:
            return jsonify({'error': 'Invalid role. Must be user or system_admin'}), 400
        
        # Prevent removing own system admin
        if user_id == request.admin_user_id and new_role != 'system_admin':
            return jsonify({'error': 'Cannot remove your own system admin role'}), 403
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id, username FROM users WHERE id = %s", (user_id,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404
            
            cur.execute("UPDATE users SET role = %s WHERE id = %s", (new_role, user_id))
            conn.commit()

            log_admin_action(
                actor_user_id=request.admin_user_id,
                actor_role='system_admin',
                action='user.role_change',
                target_type='user',
                target_id=user_id,
                metadata={'new_role': new_role, 'target_username': user['username']},
            )

            log.info(f"[ADMIN] System role changed: user {user['username']} (#{user_id}) -> {new_role} by {request.admin_username}")
            
            return jsonify({
                'success': True,
                'message': f"User role updated to {new_role}",
                'user_id': user_id,
                'new_role': new_role
            }), 200
    except Exception as e:
        log.error(f"[ADMIN] Error updating user system role: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to update user role'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/system/users/<int:user_id>/warn', methods=['POST'])
@jwt_required()
@require_true_system_admin
def warn_user(user_id):
    """Send a warning to a user. Logged in admin_actions."""
    conn = None
    try:
        data = request.get_json() or {}
        reason = data.get('reason', '').strip()
        if not reason:
            return jsonify({'error': 'Reason is required'}), 400

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id, username FROM users WHERE id = %s", (user_id,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404

            cur.execute("""
                INSERT INTO admin_actions (admin_id, target_user_id, action_type, reason)
                VALUES (%s, %s, 'warn', %s)
            """, (request.admin_user_id, user_id, reason))
            conn.commit()

            log_admin_action(
                actor_user_id=request.admin_user_id,
                actor_role='system_admin',
                action='user.warn',
                target_type='user',
                target_id=user_id,
                metadata={'reason': reason, 'target_username': user['username']},
            )

            log.info(f"[ADMIN] Warning sent to user {user['username']} (#{user_id}) by {request.admin_username}: {reason}")

            return jsonify({
                'success': True,
                'message': f"Warning sent to {user['username']}"
            }), 200
    except Exception as e:
        log.error(f"[ADMIN] Error warning user: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to send warning'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/system/users/<int:user_id>/suspend', methods=['POST'])
@jwt_required()
@require_true_system_admin
def suspend_user(user_id):
    """Suspend a user for a specified duration."""
    conn = None
    try:
        data = request.get_json() or {}
        reason = data.get('reason', '').strip()
        duration_days = data.get('duration_days', 7)

        if not reason:
            return jsonify({'error': 'Reason is required'}), 400
        if not isinstance(duration_days, int) or duration_days < 1 or duration_days > 365:
            return jsonify({'error': 'Duration must be between 1 and 365 days'}), 400

        if user_id == request.admin_user_id:
            return jsonify({'error': 'Cannot suspend your own account'}), 403

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id, username, role FROM users WHERE id = %s", (user_id,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404
            if user['role'] == 'system_admin':
                return jsonify({'error': 'Cannot suspend a system admin'}), 403

            cur.execute("""
                UPDATE users 
                SET account_status = 'suspended',
                    account_status_reason = %s,
                    account_status_until = DATE_ADD(NOW(), INTERVAL %s DAY),
                    account_status_by = %s
                WHERE id = %s
            """, (reason, duration_days, request.admin_user_id, user_id))

            cur.execute("""
                INSERT INTO admin_actions (admin_id, target_user_id, action_type, reason, details)
                VALUES (%s, %s, 'suspend', %s, JSON_OBJECT('duration_days', %s))
            """, (request.admin_user_id, user_id, reason, duration_days))

            conn.commit()

            log_admin_action(
                actor_user_id=request.admin_user_id,
                actor_role='system_admin',
                action='user.suspend',
                target_type='user',
                target_id=user_id,
                metadata={'reason': reason, 'duration_days': duration_days, 'target_username': user['username']},
            )

            log.info(f"[ADMIN] User {user['username']} (#{user_id}) suspended for {duration_days} days by {request.admin_username}")

            return jsonify({
                'success': True,
                'message': f"User suspended for {duration_days} days",
                'user_id': user_id
            }), 200
    except Exception as e:
        log.error(f"[ADMIN] Error suspending user: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to suspend user'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/system/users/<int:user_id>/ban', methods=['POST'])
@jwt_required()
@require_true_system_admin
def ban_user(user_id):
    """Permanently ban a user from the platform."""
    conn = None
    try:
        data = request.get_json() or {}
        reason = data.get('reason', '').strip()
        if not reason:
            return jsonify({'error': 'Reason is required'}), 400

        if user_id == request.admin_user_id:
            return jsonify({'error': 'Cannot ban your own account'}), 403

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id, username, role FROM users WHERE id = %s", (user_id,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404
            if user['role'] == 'system_admin':
                return jsonify({'error': 'Cannot ban a system admin'}), 403

            cur.execute("""
                UPDATE users 
                SET account_status = 'banned',
                    account_status_reason = %s,
                    account_status_until = NULL,
                    account_status_by = %s
                WHERE id = %s
            """, (reason, request.admin_user_id, user_id))

            cur.execute("""
                INSERT INTO admin_actions (admin_id, target_user_id, action_type, reason)
                VALUES (%s, %s, 'ban', %s)
            """, (request.admin_user_id, user_id, reason))

            conn.commit()

            log_admin_action(
                actor_user_id=request.admin_user_id,
                actor_role='system_admin',
                action='user.ban',
                target_type='user',
                target_id=user_id,
                metadata={'reason': reason, 'target_username': user['username']},
            )

            log.info(f"[ADMIN] User {user['username']} (#{user_id}) banned by {request.admin_username}: {reason}")

            return jsonify({
                'success': True,
                'message': f"User {user['username']} has been banned",
                'user_id': user_id
            }), 200
    except Exception as e:
        log.error(f"[ADMIN] Error banning user: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to ban user'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/system/users/<int:user_id>/unsuspend', methods=['POST'])
@jwt_required()
@require_true_system_admin
def unsuspend_user(user_id):
    """Remove suspension or ban from a user."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id, username, account_status FROM users WHERE id = %s", (user_id,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404

            prev_status = user.get('account_status', 'active')
            if prev_status == 'active':
                return jsonify({'error': 'User is not suspended or banned'}), 400

            cur.execute("""
                UPDATE users 
                SET account_status = 'active',
                    account_status_reason = NULL,
                    account_status_until = NULL,
                    account_status_by = NULL
                WHERE id = %s
            """, (user_id,))

            action_type = 'unban' if prev_status == 'banned' else 'unsuspend'
            cur.execute("""
                INSERT INTO admin_actions (admin_id, target_user_id, action_type, reason)
                VALUES (%s, %s, %s, 'Restriction lifted by admin')
            """, (request.admin_user_id, user_id, action_type))

            conn.commit()

            log_admin_action(
                actor_user_id=request.admin_user_id,
                actor_role='system_admin',
                action=f'user.{action_type}',
                target_type='user',
                target_id=user_id,
                metadata={'target_username': user['username'], 'prev_status': prev_status},
            )

            log.info(f"[ADMIN] User {user['username']} (#{user_id}) restored to active by {request.admin_username}")

            return jsonify({
                'success': True,
                'message': f"User {user['username']} has been restored to active",
                'user_id': user_id
            }), 200
    except Exception as e:
        log.error(f"[ADMIN] Error unsuspending user: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to restore user'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/system/users/<int:user_id>/actions', methods=['GET'])
@jwt_required()
@require_true_system_admin
def get_user_admin_actions(user_id):
    """Get admin action history for a user."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT aa.id, aa.action_type, aa.reason, aa.details, aa.created_at,
                       u.username as admin_username, u.display_name as admin_display_name
                FROM admin_actions aa
                JOIN users u ON u.id = aa.admin_id
                WHERE aa.target_user_id = %s
                ORDER BY aa.created_at DESC
                LIMIT 20
            """, (user_id,))
            actions = cur.fetchall()

            for a in actions:
                if a.get('created_at'):
                    a['created_at'] = a['created_at'].isoformat()
                if a.get('details') and isinstance(a['details'], str):
                    import json as _json
                    try:
                        a['details'] = _json.loads(a['details'])
                    except:
                        pass

            return jsonify({
                'success': True,
                'actions': actions
            }), 200
    except Exception as e:
        log.error(f"[ADMIN] Error fetching user actions: {e}")
        return jsonify({'error': 'Failed to fetch user actions'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/system/agents', methods=['GET'])
@jwt_required()
@require_true_system_admin
def get_all_agents():
    """Get all AI agents and their configurations. System admin only."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # All registered agents
            cur.execute("""
                SELECT 
                    a.id, a.name, a.type, a.description, a.is_active, a.created_at,
                    (SELECT COUNT(*) FROM ai_agent_logs WHERE agent_id = a.id 
                     AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) as activity_24h,
                    (SELECT COUNT(*) FROM ai_agent_logs WHERE agent_id = a.id 
                     AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) as activity_7d,
                    (SELECT MAX(created_at) FROM ai_agent_logs WHERE agent_id = a.id) as last_activity
                FROM ai_agents a
                ORDER BY a.name
            """)
            agents = cur.fetchall()
            
            # Agent integration settings (community_agents table)
            cur.execute("""
                SELECT ca.community_id, ca.agent_type, ca.enabled,
                       (SELECT name FROM communities WHERE id = ca.community_id) as community_name,
                       a.id as agent_id
                FROM community_agents ca
                JOIN ai_agents a ON a.type = ca.agent_type COLLATE utf8mb4_unicode_ci
            """)
            integrations = cur.fetchall()
            
            # Group integrations by agent
            agent_integrations = {}
            for i in integrations:
                aid = i['agent_id']
                if aid not in agent_integrations:
                    agent_integrations[aid] = []
                agent_integrations[aid].append({
                    'community_id': i['community_id'],
                    'community_name': i['community_name'],
                    'is_enabled': bool(i['enabled'])
                })
            
            result = [{
                'id': a['id'],
                'name': a['name'],
                'type': a['type'],
                'description': a['description'],
                'is_active': bool(a['is_active']),
                'created_at': a['created_at'].isoformat() if a['created_at'] else None,
                'activity_24h': a['activity_24h'],
                'activity_7d': a['activity_7d'],
                'last_activity': a['last_activity'].isoformat() if a['last_activity'] else None,
                'integrations': agent_integrations.get(a['id'], [])
            } for a in agents]
            
            return jsonify({
                'success': True,
                'agents': result
            }), 200
    except Exception as e:
        log.error(f"[ADMIN] Error getting agents: {e}")
        return jsonify({'error': 'Failed to fetch agents'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/system/agents/<int:agent_id>/toggle', methods=['POST'])
@jwt_required()
@require_true_system_admin
def toggle_agent(agent_id):
    """Enable/disable an AI agent globally. System admin only."""
    conn = None
    try:
        data = request.get_json() or {}
        is_active = data.get('is_active')
        
        if is_active is None:
            return jsonify({'error': 'is_active is required'}), 400
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("UPDATE ai_agents SET is_active = %s WHERE id = %s", (bool(is_active), agent_id))
            if cur.rowcount == 0:
                return jsonify({'error': 'Agent not found'}), 404
            conn.commit()

            log_admin_action(
                actor_user_id=request.admin_user_id,
                actor_role='system_admin',
                action='agent.toggle',
                target_type='agent',
                target_id=agent_id,
                metadata={'is_active': bool(is_active)},
            )

            return jsonify({
                'success': True,
                'message': f"Agent {'enabled' if is_active else 'disabled'}"
            }), 200
    except Exception as e:
        log.error(f"[ADMIN] Error toggling agent: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to toggle agent'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/system/communities/<int:community_id>/activity', methods=['GET'])
@jwt_required()
@require_true_system_admin
def get_community_activity(community_id):
    """Get community activity heatmap and trend data. System admin only."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM communities WHERE id = %s", (community_id,))
            if not cur.fetchone():
                return jsonify({'error': 'Community not found'}), 404

            # Heatmap: messages by day of week (0=Mon) and hour
            cur.execute("""
                SELECT WEEKDAY(msg.created_at) as day_of_week,
                       HOUR(msg.created_at) as hour_of_day,
                       COUNT(*) as msg_count
                FROM messages msg
                JOIN channels ch ON msg.channel_id = ch.id
                WHERE ch.community_id = %s
                  AND msg.created_at >= DATE_SUB(NOW(), INTERVAL 28 DAY)
                GROUP BY WEEKDAY(msg.created_at), HOUR(msg.created_at)
            """, (community_id,))
            heatmap_raw = cur.fetchall()

            heatmap = [[0]*24 for _ in range(7)]
            for row in heatmap_raw:
                heatmap[row['day_of_week']][row['hour_of_day']] = row['msg_count']

            # Trend data
            cur.execute("""
                SELECT
                    (SELECT COUNT(*) FROM messages msg JOIN channels ch ON msg.channel_id = ch.id
                     WHERE ch.community_id = %s AND msg.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) as messages_this_week,
                    (SELECT COUNT(*) FROM messages msg JOIN channels ch ON msg.channel_id = ch.id
                     WHERE ch.community_id = %s AND msg.created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                     AND msg.created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)) as messages_last_week,
                    (SELECT COUNT(*) FROM community_members
                     WHERE community_id = %s AND joined_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) as new_members_7d,
                    (SELECT COUNT(*) FROM community_members
                     WHERE community_id = %s AND joined_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                     AND joined_at < DATE_SUB(NOW(), INTERVAL 7 DAY)) as new_members_prev_7d
            """, (community_id, community_id, community_id, community_id))
            trends = cur.fetchone()

            return jsonify({
                'success': True,
                'heatmap': heatmap,
                'trends': {
                    'messages_this_week': trends['messages_this_week'],
                    'messages_last_week': trends['messages_last_week'],
                    'new_members_7d': trends['new_members_7d'],
                    'new_members_prev_7d': trends['new_members_prev_7d'],
                }
            }), 200
    except Exception as e:
        log.error(f"[ADMIN] Error getting community activity {community_id}: {e}")
        return jsonify({'error': 'Failed to fetch activity data'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/system/communities/<int:community_id>', methods=['GET'])
@jwt_required()
@require_true_system_admin
def get_community_details(community_id):
    """Get detailed info for a single community. System admin only."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT c.id, c.name, c.description, c.icon, c.color, c.logo_url, c.banner_url, c.created_at,
                       (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count,
                       (SELECT COUNT(*) FROM channels WHERE community_id = c.id) as channel_count,
                       (SELECT COUNT(*) FROM blocked_users WHERE community_id = c.id) as blocked_count,
                       (SELECT COUNT(*) FROM messages m
                        JOIN channels ch ON m.channel_id = ch.id
                        WHERE ch.community_id = c.id) as total_messages,
                       (SELECT COUNT(*) FROM messages m
                        JOIN channels ch ON m.channel_id = ch.id
                        WHERE ch.community_id = c.id AND m.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) as messages_7d,
                       (SELECT COUNT(*) FROM ai_agent_logs
                        WHERE community_id = c.id AND action_type = 'moderation_flag') as flagged_count
                FROM communities c
                WHERE c.id = %s
            """, (community_id,))
            community = cur.fetchone()
            if not community:
                return jsonify({'error': 'Community not found'}), 404

            # Get owner info
            cur.execute("""
                SELECT u.id, u.username, u.display_name, u.avatar_url, u.email
                FROM users u
                JOIN community_members cm ON u.id = cm.user_id
                WHERE cm.community_id = %s AND cm.role = 'owner'
                LIMIT 1
            """, (community_id,))
            owner = cur.fetchone()

            # Get channels
            cur.execute("""
                SELECT ch.id, ch.name, ch.type, ch.created_at,
                       (SELECT COUNT(*) FROM messages WHERE channel_id = ch.id) as message_count,
                       (SELECT COUNT(*) FROM channel_members WHERE channel_id = ch.id) as member_count
                FROM channels ch
                WHERE ch.community_id = %s
                ORDER BY ch.created_at ASC
            """, (community_id,))
            channels = cur.fetchall()

            # Get role distribution
            cur.execute("""
                SELECT role, COUNT(*) as count
                FROM community_members
                WHERE community_id = %s
                GROUP BY role
            """, (community_id,))
            role_dist = {r['role']: r['count'] for r in cur.fetchall()}

            return jsonify({
                'success': True,
                'community': {
                    'id': community['id'],
                    'name': community['name'],
                    'description': community['description'],
                    'icon': community['icon'],
                    'color': community['color'],
                    'logo_url': community['logo_url'],
                    'banner_url': community['banner_url'],
                    'created_at': community['created_at'].isoformat() if community['created_at'] else None,
                    'member_count': community['member_count'],
                    'channel_count': community['channel_count'],
                    'blocked_count': community['blocked_count'],
                    'total_messages': community['total_messages'],
                    'messages_7d': community['messages_7d'],
                    'flagged_count': community['flagged_count'],
                    'role_distribution': role_dist,
                    'owner': {
                        'id': owner['id'],
                        'username': owner['username'],
                        'display_name': owner['display_name'],
                        'avatar_url': owner['avatar_url'],
                        'email': owner['email'],
                    } if owner else None,
                    'channels': [{
                        'id': ch['id'],
                        'name': ch['name'],
                        'type': ch['type'],
                        'created_at': ch['created_at'].isoformat() if ch['created_at'] else None,
                        'message_count': ch['message_count'],
                        'member_count': ch['member_count'],
                    } for ch in channels],
                }
            }), 200
    except Exception as e:
        log.error(f"[ADMIN] Error getting community details {community_id}: {e}")
        return jsonify({'error': 'Failed to fetch community details'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/system/communities/<int:community_id>', methods=['PUT'])
@jwt_required()
@require_true_system_admin
def update_community_details(community_id):
    """Update a community's name/description. System admin only."""
    conn = None
    try:
        data = request.get_json() or {}
        name = data.get('name', '').strip()
        description = data.get('description', '').strip()

        if not name:
            return jsonify({'error': 'Community name is required'}), 400
        if len(name) > 100:
            return jsonify({'error': 'Name must be 100 characters or less'}), 400

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM communities WHERE id = %s", (community_id,))
            if not cur.fetchone():
                return jsonify({'error': 'Community not found'}), 404

            cur.execute(
                "UPDATE communities SET name = %s, description = %s WHERE id = %s",
                (name, description, community_id)
            )
            conn.commit()

            log_admin_action(
                actor_user_id=request.admin_user_id,
                actor_role='system_admin',
                action='community.update',
                target_type='community',
                target_id=community_id,
                community_id=community_id,
                metadata={'name': name, 'description': description},
            )

            log.info(f"[ADMIN] Community #{community_id} updated by {request.admin_username}")
            return jsonify({'success': True, 'message': 'Community updated'}), 200
    except Exception as e:
        log.error(f"[ADMIN] Error updating community {community_id}: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to update community'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/system/communities/<int:community_id>', methods=['DELETE'])
@jwt_required()
@require_true_system_admin
def delete_community(community_id):
    """Delete a community and all its data. System admin only."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id, name FROM communities WHERE id = %s", (community_id,))
            community = cur.fetchone()
            if not community:
                return jsonify({'error': 'Community not found'}), 404

            # CASCADE will handle related tables (community_members, channels, etc.)
            cur.execute("DELETE FROM communities WHERE id = %s", (community_id,))
            conn.commit()

            log_admin_action(
                actor_user_id=request.admin_user_id,
                actor_role='system_admin',
                action='community.delete',
                target_type='community',
                target_id=community_id,
                metadata={'name': community['name']},
            )

            log.info(f"[ADMIN] Community '{community['name']}' (#{community_id}) DELETED by {request.admin_username}")
            return jsonify({'success': True, 'message': f"Community '{community['name']}' deleted"}), 200
    except Exception as e:
        log.error(f"[ADMIN] Error deleting community {community_id}: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to delete community'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/system/communities/<int:community_id>/members', methods=['GET'])
@jwt_required()
@require_true_system_admin
def get_community_members_system(community_id):
    """List members of a community with stats. System admin only."""
    conn = None
    try:
        search = request.args.get('search', '')
        role_filter = request.args.get('role', '')
        limit = min(request.args.get('limit', 20, type=int), 100)
        offset = max(request.args.get('offset', 0, type=int), 0)

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM communities WHERE id = %s", (community_id,))
            if not cur.fetchone():
                return jsonify({'error': 'Community not found'}), 404

            base_where = "WHERE cm.community_id = %s"
            params = [community_id]

            if search:
                base_where += " AND (u.username LIKE %s OR u.display_name LIKE %s OR u.email LIKE %s)"
                s = f"%{search}%"
                params.extend([s, s, s])
            if role_filter and role_filter in ('owner', 'admin', 'member'):
                base_where += " AND cm.role = %s"
                params.append(role_filter)

            cur.execute(f"""
                SELECT COUNT(*) as total
                FROM community_members cm
                JOIN users u ON u.id = cm.user_id
                {base_where}
            """, params)
            total = cur.fetchone()['total']

            query_params = params + [limit, offset]
            cur.execute(f"""
                SELECT u.id, u.username, u.display_name, u.avatar_url, u.email, u.status,
                       u.last_seen, u.created_at as user_created_at,
                       cm.role, cm.violation_count, cm.joined_at,
                       (SELECT COUNT(*) FROM messages msg
                        JOIN channels ch ON msg.channel_id = ch.id
                        WHERE msg.sender_id = u.id AND ch.community_id = cm.community_id) as message_count
                FROM community_members cm
                JOIN users u ON u.id = cm.user_id
                {base_where}
                ORDER BY cm.role = 'owner' DESC, cm.role = 'admin' DESC, cm.joined_at DESC
                LIMIT %s OFFSET %s
            """, query_params)
            members = cur.fetchall()

            return jsonify({
                'success': True,
                'members': [{
                    'id': m['id'],
                    'username': m['username'],
                    'display_name': m['display_name'],
                    'avatar_url': m['avatar_url'],
                    'email': m['email'],
                    'status': m['status'],
                    'last_seen': m['last_seen'].isoformat() if m['last_seen'] else None,
                    'role': m['role'],
                    'violation_count': m['violation_count'],
                    'joined_at': m['joined_at'].isoformat() if m['joined_at'] else None,
                    'message_count': m['message_count'],
                } for m in members],
                'pagination': {
                    'total': total,
                    'limit': limit,
                    'offset': offset,
                    'has_more': offset + limit < total
                }
            }), 200
    except Exception as e:
        log.error(f"[ADMIN] Error listing community {community_id} members: {e}")
        return jsonify({'error': 'Failed to fetch community members'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/system/communities/<int:community_id>/members/<int:user_id>/role', methods=['PUT'])
@jwt_required()
@require_true_system_admin
def update_community_member_role(community_id, user_id):
    """Change a member's role in a community. System admin only."""
    conn = None
    try:
        data = request.get_json() or {}
        new_role = data.get('role')

        if new_role not in ('admin', 'member'):
            return jsonify({'error': 'Invalid role. Must be admin or member'}), 400

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT cm.id, cm.role, u.username
                FROM community_members cm
                JOIN users u ON u.id = cm.user_id
                WHERE cm.community_id = %s AND cm.user_id = %s
            """, (community_id, user_id))
            member = cur.fetchone()
            if not member:
                return jsonify({'error': 'Member not found in this community'}), 404

            if member['role'] == 'owner':
                return jsonify({'error': 'Cannot change the owner role'}), 403

            cur.execute(
                "UPDATE community_members SET role = %s WHERE community_id = %s AND user_id = %s",
                (new_role, community_id, user_id)
            )
            conn.commit()

            log_admin_action(
                actor_user_id=request.admin_user_id,
                actor_role='system_admin',
                action='community.member_role_change',
                target_type='user',
                target_id=user_id,
                community_id=community_id,
                metadata={'new_role': new_role, 'target_username': member['username'], 'prev_role': member['role']},
            )

            log.info(f"[ADMIN] Community #{community_id} member {member['username']} role -> {new_role} by {request.admin_username}")
            return jsonify({'success': True, 'message': f"Role updated to {new_role}"}), 200
    except Exception as e:
        log.error(f"[ADMIN] Error updating member role: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to update member role'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/system/communities/<int:community_id>/members/<int:user_id>', methods=['DELETE'])
@jwt_required()
@require_true_system_admin
def remove_community_member(community_id, user_id):
    """Remove a member from a community. System admin only. Cannot remove owner."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT cm.id, cm.role, u.username
                FROM community_members cm
                JOIN users u ON u.id = cm.user_id
                WHERE cm.community_id = %s AND cm.user_id = %s
            """, (community_id, user_id))
            member = cur.fetchone()
            if not member:
                return jsonify({'error': 'Member not found in this community'}), 404

            if member['role'] == 'owner':
                return jsonify({'error': 'Cannot remove the community owner'}), 403

            cur.execute(
                "DELETE FROM community_members WHERE community_id = %s AND user_id = %s",
                (community_id, user_id)
            )
            conn.commit()

            log_admin_action(
                actor_user_id=request.admin_user_id,
                actor_role='system_admin',
                action='community.member_remove',
                target_type='user',
                target_id=user_id,
                community_id=community_id,
                metadata={'target_username': member['username'], 'prev_role': member['role']},
            )

            log.info(f"[ADMIN] Removed {member['username']} from community #{community_id} by {request.admin_username}")
            return jsonify({'success': True, 'message': f"{member['username']} removed from community"}), 200
    except Exception as e:
        log.error(f"[ADMIN] Error removing community member: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to remove member'}), 500
    finally:
        if conn:
            conn.close()


@admin_bp.route('/system/platform-stats', methods=['GET'])
@jwt_required()
@require_true_system_admin
def get_platform_stats():
    """Get comprehensive platform-wide statistics. System admin only."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            stats = {}
            
            # Total users
            cur.execute("SELECT COUNT(*) as c FROM users")
            stats['total_users'] = cur.fetchone()['c']
            
            # New users (last 7 days)
            cur.execute("SELECT COUNT(*) as c FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)")
            stats['new_users_7d'] = cur.fetchone()['c']
            
            # Total communities
            cur.execute("SELECT COUNT(*) as c FROM communities")
            stats['total_communities'] = cur.fetchone()['c']
            
            # Total messages
            cur.execute("SELECT COUNT(*) as c FROM messages")
            stats['total_messages'] = cur.fetchone()['c']
            
            # Messages today
            cur.execute("SELECT COUNT(*) as c FROM messages WHERE created_at >= CURDATE()")
            stats['messages_today'] = cur.fetchone()['c']
            
            # Total channels
            cur.execute("SELECT COUNT(*) as c FROM channels")
            stats['total_channels'] = cur.fetchone()['c']
            
            # Online users
            cur.execute("SELECT COUNT(*) as c FROM users WHERE status = 'online'")
            stats['online_users'] = cur.fetchone()['c']
            
            # System admins
            cur.execute("SELECT COUNT(*) as c FROM users WHERE role = 'system_admin'")
            stats['system_admins'] = cur.fetchone()['c']
            
            # Total AI agent invocations (24h)
            cur.execute("SELECT COUNT(*) as c FROM ai_agent_logs WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)")
            stats['agent_invocations_24h'] = cur.fetchone()['c']
            
            return jsonify({'success': True, 'stats': stats}), 200
    except Exception as e:
        log.error(f"[ADMIN] Error getting platform stats: {e}")
        return jsonify({'error': 'Failed to fetch platform stats'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# AUDIT LOGS
# =====================================

@admin_bp.route('/system/audit-logs', methods=['GET'])
@jwt_required()
@require_true_system_admin
def get_audit_logs():
    """
    Get paginated audit log of admin actions. System admin only.

    Reads from admin_audit_logs (canonical) with filters:
      - action: exact action (e.g. 'user.suspend', 'flag.resolve')
      - target_type: 'user' | 'community' | 'message' | 'agent' | 'setting'
      - community_id: scope to a community
      - search: actor or target username substring
      - action_type: legacy compat (maps to action prefix on 'user.')
    """
    conn = None
    try:
        action = request.args.get('action')
        action_type = request.args.get('action_type')  # legacy: 'warn', 'suspend', etc.
        target_type = request.args.get('target_type')
        community_id = request.args.get('community_id', type=int)
        search = request.args.get('search', '')
        limit = min(request.args.get('limit', 20, type=int), 100)
        offset = max(request.args.get('offset', 0, type=int), 0)

        conn = get_db_connection()
        with conn.cursor() as cur:
            where_clauses = []
            params = []

            if action:
                where_clauses.append("al.action = %s")
                params.append(action)
            elif action_type:
                # Back-compat with the old UI which filtered by 'warn', 'suspend', etc.
                where_clauses.append("al.action = %s")
                params.append(f"user.{action_type}")

            if target_type:
                where_clauses.append("al.target_type = %s")
                params.append(target_type)

            if community_id:
                where_clauses.append("al.community_id = %s")
                params.append(community_id)

            if search:
                where_clauses.append(
                    "(actor_u.username LIKE %s OR actor_u.display_name LIKE %s "
                    "OR target_u.username LIKE %s OR target_u.display_name LIKE %s)"
                )
                s = f"%{search}%"
                params.extend([s, s, s, s])

            where_sql = (" WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

            cur.execute(f"""
                SELECT COUNT(*) as c
                FROM admin_audit_logs al
                JOIN users actor_u ON al.actor_user_id = actor_u.id
                LEFT JOIN users target_u
                       ON (al.target_type = 'user' AND al.target_id = target_u.id)
                {where_sql}
            """, params)
            total = cur.fetchone()['c']

            cur.execute(f"""
                SELECT
                    al.id, al.action, al.target_type, al.target_id,
                    al.community_id, al.metadata, al.actor_role, al.created_at,
                    actor_u.username as admin_username,
                    actor_u.display_name as admin_display_name,
                    target_u.username as target_username,
                    target_u.display_name as target_display_name,
                    c.name as community_name
                FROM admin_audit_logs al
                JOIN users actor_u ON al.actor_user_id = actor_u.id
                LEFT JOIN users target_u
                       ON (al.target_type = 'user' AND al.target_id = target_u.id)
                LEFT JOIN communities c ON al.community_id = c.id
                {where_sql}
                ORDER BY al.created_at DESC
                LIMIT %s OFFSET %s
            """, params + [limit, offset])
            rows = cur.fetchall()

            logs = []
            for r in rows:
                metadata = r['metadata']
                if isinstance(metadata, str):
                    try:
                        metadata = json.loads(metadata)
                    except Exception:
                        metadata = None
                reason = ''
                if isinstance(metadata, dict):
                    reason = metadata.get('reason') or metadata.get('note') or ''
                logs.append({
                    'id': r['id'],
                    'admin_username': r['admin_username'],
                    'admin_display_name': r['admin_display_name'],
                    'target_username': r['target_username'],
                    'target_display_name': r['target_display_name'],
                    'action_type': r['action'],
                    'action': r['action'],
                    'target_type': r['target_type'],
                    'target_id': r['target_id'],
                    'community_id': r['community_id'],
                    'community_name': r['community_name'],
                    'actor_role': r['actor_role'],
                    'reason': reason,
                    'details': metadata,
                    'created_at': r['created_at'].isoformat() if r['created_at'] else None,
                })

            return jsonify({
                'success': True,
                'logs': logs,
                'total': total,
                'pagination': {
                    'total': total,
                    'limit': limit,
                    'offset': offset,
                    'has_more': offset + limit < total,
                }
            }), 200
    except Exception as e:
        log.error(f"[ADMIN] Error fetching audit logs: {e}")
        return jsonify({'error': 'Failed to fetch audit logs'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# PLATFORM SETTINGS
# =====================================

# Canonical platform settings schema
PLATFORM_SETTINGS_DEFAULTS = {
    'registration_enabled': True,
    'maintenance_mode': False,
    'max_communities_per_user': 10,
    'max_channels_per_community': 50,
    'max_file_size_mb': 10,
    'message_rate_limit': 30,
    'auto_moderation_enabled': True,
    'moderation_sensitivity': 'medium',
    'auto_ban_threshold': 5,
    'email_notifications_enabled': True,
}

# Backward-compatible aliases from earlier seed/UI drift
PLATFORM_SETTINGS_ALIASES = {
    'allow_registration': 'registration_enabled',
    'rate_limit_per_minute': 'message_rate_limit',
}


def _normalize_platform_settings_input(payload):
    """Normalize incoming payload to canonical settings with validation."""
    raw = dict(payload or {})
    nested = raw.pop('settings', None)
    raw.pop('success', None)
    if isinstance(nested, dict):
        # Prefer nested settings object while preserving compatible top-level keys.
        raw.update(nested)
    valid = {}
    rejected = []

    for in_key, value in (raw or {}).items():
        key = PLATFORM_SETTINGS_ALIASES.get(in_key, in_key)
        if key not in PLATFORM_SETTINGS_DEFAULTS:
            rejected.append(in_key)
            continue

        try:
            if key in ('registration_enabled', 'maintenance_mode', 'auto_moderation_enabled', 'email_notifications_enabled'):
                if not isinstance(value, bool):
                    raise ValueError('must be boolean')
                valid[key] = value
            elif key in ('max_communities_per_user', 'max_channels_per_community', 'max_file_size_mb', 'message_rate_limit', 'auto_ban_threshold'):
                if not isinstance(value, int):
                    raise ValueError('must be integer')
                if value < 1:
                    raise ValueError('must be >= 1')
                valid[key] = value
            elif key == 'moderation_sensitivity':
                if value not in ('low', 'medium', 'high'):
                    raise ValueError('must be one of low|medium|high')
                valid[key] = value
        except ValueError:
            rejected.append(in_key)

    return valid, rejected

@admin_bp.route('/system/platform-settings', methods=['GET'])
@jwt_required()
@require_true_system_admin
def get_platform_settings():
    """Get platform configuration settings. System admin only."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT setting_key, setting_value FROM platform_settings")
            rows = cur.fetchall()
            settings = dict(PLATFORM_SETTINGS_DEFAULTS)
            for r in rows:
                raw_key = r['setting_key']
                key = PLATFORM_SETTINGS_ALIASES.get(raw_key, raw_key)
                if key not in PLATFORM_SETTINGS_DEFAULTS:
                    # Ignore unknown keys to prevent bad data from leaking to clients.
                    continue

                val = r['setting_value']
                # Try parsing as JSON for booleans/numbers
                try:
                    settings[key] = json.loads(val)
                except (json.JSONDecodeError, TypeError):
                    settings[key] = val
            return jsonify({'success': True, 'settings': settings}), 200
    except Exception as e:
        log.error(f"[ADMIN] Error fetching platform settings: {e}")
        # Return empty defaults if table doesn't exist yet
        return jsonify({'success': True, 'settings': {}}), 200
    finally:
        if conn:
            conn.close()


@admin_bp.route('/system/platform-settings', methods=['PUT'])
@jwt_required()
@require_true_system_admin
def update_platform_settings():
    """Update platform configuration settings. System admin only."""
    conn = None
    try:
        data = request.get_json() or {}
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        normalized, rejected = _normalize_platform_settings_input(data)
        if not normalized:
            return jsonify({'error': 'No valid platform settings provided', 'rejected_keys': rejected}), 400

        conn = get_db_connection()
        with conn.cursor() as cur:
            # Ensure table exists
            cur.execute("""
                CREATE TABLE IF NOT EXISTS platform_settings (
                    setting_key VARCHAR(100) PRIMARY KEY,
                    setting_value TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            """)

            for key, value in normalized.items():
                str_value = json.dumps(value) if isinstance(value, (bool, int, float, list, dict)) else str(value)
                cur.execute("""
                    INSERT INTO platform_settings (setting_key, setting_value)
                    VALUES (%s, %s)
                    ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
                """, (key, str_value))

            conn.commit()

            try:
                from services.platform_config import invalidate_setting
                for k in normalized.keys():
                    invalidate_setting(k)
            except Exception as cache_err:
                log.warning(f"[ADMIN] Failed to invalidate platform settings cache: {cache_err}")

            log_admin_action(
                actor_user_id=request.admin_user_id,
                actor_role='system_admin',
                action='settings.update',
                target_type='setting',
                target_id=None,
                metadata={'updated_keys': list(normalized.keys()), 'values': normalized},
            )

            return jsonify({
                'success': True,
                'message': 'Settings updated',
                'updated_keys': list(normalized.keys()),
                'rejected_keys': rejected,
            }), 200
    except Exception as e:
        log.error(f"[ADMIN] Error updating platform settings: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to update settings'}), 500
    finally:
        if conn:
            conn.close()
