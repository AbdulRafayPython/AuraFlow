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
    For now, we'll check if user is owner of any community.
    In FYP-2, implement proper system roles table.
    
    Also attaches the list of owned community IDs to request context
    for scoping data to only the admin's communities.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        username = get_jwt_identity()
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM users WHERE username = %s", (username,))
                user = cur.fetchone()
                if not user:
                    return jsonify({'error': 'User not found'}), 404
                
                # Check if user is owner of any community (admin access)
                cur.execute("""
                    SELECT community_id FROM community_members 
                    WHERE user_id = %s AND role = 'owner'
                """, (user['id'],))
                
                owned_communities = cur.fetchall()
                if not owned_communities:
                    return jsonify({'error': 'Admin access required'}), 403
                
                # Attach user_id and owned community IDs to request context
                request.admin_user_id = user['id']
                request.admin_username = username
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
                cur.execute("SELECT id FROM users WHERE username = %s", (username,))
                user = cur.fetchone()
                if not user:
                    return jsonify({'error': 'User not found'}), 404
                
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
    SCOPED to communities owned by the current admin user.
    Returns: User counts, message stats, community stats, moderation alerts.
    """
    conn = None
    try:
        conn = get_db_connection()
        owned_community_ids = request.owned_community_ids
        
        with conn.cursor() as cur:
            now = datetime.now()
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            week_ago = now - timedelta(days=7)
            
            # Get channels in owned communities
            if owned_community_ids:
                placeholders = ','.join(['%s'] * len(owned_community_ids))
                cur.execute(f"""
                    SELECT id FROM channels WHERE community_id IN ({placeholders})
                """, owned_community_ids)
                owned_channels = [c['id'] for c in cur.fetchall()]
            else:
                owned_channels = []
            
            # Total users IN OWNED COMMUNITIES (unique members)
            if owned_community_ids:
                cur.execute(f"""
                    SELECT COUNT(DISTINCT user_id) as count 
                    FROM community_members 
                    WHERE community_id IN ({placeholders})
                """, owned_community_ids)
                total_users = cur.fetchone()['count']
            else:
                total_users = 0
            
            # Active users in owned communities (last 24 hours)
            if owned_channels:
                channel_placeholders = ','.join(['%s'] * len(owned_channels))
                cur.execute(f"""
                    SELECT COUNT(DISTINCT sender_id) as count 
                    FROM messages 
                    WHERE channel_id IN ({channel_placeholders})
                    AND created_at >= %s
                """, owned_channels + [today_start])
                active_users_today = cur.fetchone()['count']
            else:
                active_users_today = 0
            
            # Online users in owned communities
            if owned_community_ids:
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
            
            # Total messages today in owned channels
            if owned_channels:
                cur.execute(f"""
                    SELECT COUNT(*) as count FROM messages 
                    WHERE channel_id IN ({channel_placeholders})
                    AND created_at >= %s
                """, owned_channels + [today_start])
                messages_today = cur.fetchone()['count']
            else:
                messages_today = 0
            
            # Total messages this week in owned channels
            if owned_channels:
                cur.execute(f"""
                    SELECT COUNT(*) as count FROM messages 
                    WHERE channel_id IN ({channel_placeholders})
                    AND created_at >= %s
                """, owned_channels + [week_ago])
                messages_week = cur.fetchone()['count']
            else:
                messages_week = 0
            
            # Total owned communities
            total_communities = len(owned_community_ids)
            
            # Total channels in owned communities
            total_channels = len(owned_channels)
            
            # Moderation stats for owned channels - from ai_agent_logs
            if owned_channels:
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
            else:
                flagged_today = 0
            
            # Blocked users in owned communities
            if owned_community_ids:
                cur.execute(f"""
                    SELECT COUNT(*) as count FROM blocked_users 
                    WHERE community_id IN ({placeholders})
                """, owned_community_ids)
                blocked_users = cur.fetchone()['count']
            else:
                blocked_users = 0
            
            # Recent high severity violations in owned channels - from ai_agent_logs
            if owned_channels:
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
            else:
                high_severity_count = 0
            
            # AI Agent health (check recent activity in owned channels)
            if owned_channels:
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
                yesterday_start = today_start - timedelta(days=1)
                cur.execute(f"""
                    SELECT COUNT(*) as count FROM messages 
                    WHERE channel_id IN ({channel_placeholders})
                    AND created_at >= %s AND created_at < %s
                """, owned_channels + [yesterday_start, today_start])
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
                    'community_ids': owned_community_ids,
                    'community_count': len(owned_community_ids)
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
    SCOPED to owned communities.
    """
    conn = None
    try:
        limit = min(request.args.get('limit', 10, type=int), 50)
        owned_community_ids = request.owned_community_ids
        
        if not owned_community_ids:
            return jsonify({'success': True, 'alerts': [], 'count': 0}), 200
        
        conn = get_db_connection()
        
        with conn.cursor() as cur:
            placeholders = ','.join(['%s'] * len(owned_community_ids))
            
            cur.execute(f"""
                SELECT 
                    ml.id, ml.user_id, ml.channel_id, ml.message_text,
                    ml.flag_type, ml.severity, ml.confidence, ml.action_taken,
                    ml.reason, ml.created_at,
                    u.username, u.avatar_url,
                    ch.name as channel_name,
                    c.name as community_name, c.id as community_id
                FROM moderation_logs ml
                JOIN users u ON ml.user_id = u.id
                LEFT JOIN channels ch ON ml.channel_id = ch.id
                LEFT JOIN communities c ON ch.community_id = c.id
                WHERE ml.severity IN ('medium', 'high', 'critical')
                AND c.id IN ({placeholders})
                ORDER BY ml.created_at DESC
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
            # Build query with filters
            query = """
                SELECT 
                    ml.id, ml.user_id, ml.channel_id, ml.message_text,
                    ml.flag_type, ml.severity, ml.confidence, ml.action_taken,
                    ml.reason, ml.created_at,
                    u.username, u.display_name, u.avatar_url,
                    ch.name as channel_name,
                    c.name as community_name, c.id as community_id,
                    (SELECT COUNT(*) FROM moderation_logs ml2 
                     WHERE ml2.user_id = ml.user_id AND ml2.action_taken != 'none') as user_violation_count
                FROM moderation_logs ml
                JOIN users u ON ml.user_id = u.id
                LEFT JOIN channels ch ON ml.channel_id = ch.id
                LEFT JOIN communities c ON ch.community_id = c.id
                WHERE 1=1
            """
            params = []
            
            if status:
                query += " AND ml.action_taken = %s"
                params.append(status)
            
            if severity:
                query += " AND ml.severity = %s"
                params.append(severity)
            
            if flag_type:
                query += " AND ml.flag_type = %s"
                params.append(flag_type)
            
            if community_id:
                query += " AND c.id = %s"
                params.append(community_id)
            
            # Get total count for pagination
            count_query = query.replace(
                "SELECT \n                    ml.id, ml.user_id, ml.channel_id, ml.message_text,\n                    ml.flag_type, ml.severity, ml.confidence, ml.action_taken,\n                    ml.reason, ml.created_at,\n                    u.username, u.display_name, u.avatar_url,\n                    ch.name as channel_name,\n                    c.name as community_name, c.id as community_id,\n                    (SELECT COUNT(*) FROM moderation_logs ml2 \n                     WHERE ml2.user_id = ml.user_id AND ml2.action_taken != 'none') as user_violation_count",
                "SELECT COUNT(*) as total"
            )
            cur.execute(count_query, params)
            total = cur.fetchone()['total']
            
            # Add ordering and pagination
            query += " ORDER BY ml.created_at DESC LIMIT %s OFFSET %s"
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
            # Get the moderation log entry
            cur.execute("""
                SELECT ml.*, ch.community_id
                FROM moderation_logs ml
                LEFT JOIN channels ch ON ml.channel_id = ch.id
                WHERE ml.id = %s
            """, (log_id,))
            
            log_entry = cur.fetchone()
            if not log_entry:
                return jsonify({'error': 'Moderation log not found'}), 404
            
            # Map action to database value
            action_mapping = {
                'approve': 'none',
                'warn': 'warned',
                'delete': 'deleted',
                'ban': 'banned',
                'mute': 'warned'
            }
            
            # Update moderation log
            cur.execute("""
                UPDATE moderation_logs 
                SET action_taken = %s, reason = CONCAT(IFNULL(reason, ''), ' | Admin: ', %s)
                WHERE id = %s
            """, (action_mapping[action], note, log_id))
            
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
                    (SELECT COUNT(*) FROM moderation_logs ml 
                     WHERE ml.user_id = bu.user_id) as total_violations
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
            cur.execute("DELETE FROM blocked_users WHERE id = %s", (block_id,))
            
            if cur.rowcount == 0:
                return jsonify({'error': 'Block record not found'}), 404
            
            conn.commit()
            
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
    Get all users in communities owned by this admin.
    SCOPED to only show members of owned communities.
    """
    conn = None
    try:
        status = request.args.get('status')  # online, offline, idle
        search = request.args.get('search', '')
        limit = min(request.args.get('limit', 20, type=int), 100)
        offset = max(request.args.get('offset', 0, type=int), 0)
        
        owned_community_ids = request.owned_community_ids
        
        if not owned_community_ids:
            return jsonify({
                'success': True,
                'users': [],
                'pagination': {'total': 0, 'limit': limit, 'offset': offset, 'has_more': False}
            }), 200
        
        conn = get_db_connection()
        with conn.cursor() as cur:
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
                    (SELECT COUNT(*) FROM moderation_logs WHERE user_id = u.id 
                     {f'AND channel_id IN ({channel_placeholders})' if owned_channels else 'AND 1=0'}
                     AND action_taken != 'none') as violation_count,
                    (SELECT COUNT(*) FROM blocked_users WHERE user_id = u.id 
                     AND community_id IN ({placeholders})) as ban_count
                FROM users u
                INNER JOIN community_members cm ON u.id = cm.user_id
                WHERE cm.community_id IN ({placeholders})
            """
            # Build params list: owned_channels (for messages), owned_community_ids (for community_count),
            # owned_channels (for violations), owned_community_ids (for bans), owned_community_ids (for join)
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
            
            # Count total (simplified)
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
                    'community_ids': owned_community_ids
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
                    status, custom_status, created_at, last_seen
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
                SELECT id, flag_type, severity, action_taken, created_at
                FROM moderation_logs
                WHERE user_id = %s
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
                } for b in blocks]
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
                    c.id, c.name, c.logo_url, c.created_at,
                    (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count,
                    (SELECT COUNT(*) FROM channels WHERE community_id = c.id) as channel_count,
                    (SELECT COUNT(*) FROM messages m 
                     JOIN channels ch ON m.channel_id = ch.id 
                     WHERE ch.community_id = c.id AND m.created_at >= %s) as message_count,
                    (SELECT COUNT(DISTINCT m.sender_id) FROM messages m 
                     JOIN channels ch ON m.channel_id = ch.id 
                     WHERE ch.community_id = c.id AND m.created_at >= %s) as active_users,
                    (SELECT COUNT(*) FROM moderation_logs ml
                     JOIN channels ch ON ml.channel_id = ch.id
                     WHERE ch.community_id = c.id AND ml.created_at >= %s
                     AND ml.action_taken != 'none') as moderation_issues,
                    (SELECT COUNT(*) FROM blocked_users WHERE community_id = c.id) as blocked_count
                FROM communities c
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
                    flag_type, 
                    COUNT(*) as count
                FROM moderation_logs
                WHERE created_at BETWEEN %s AND %s
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
                    SUM(CASE WHEN severity = 'high' OR severity = 'critical' THEN 1 ELSE 0 END) as high_severity
                FROM moderation_logs ml
                JOIN channels ch ON ml.channel_id = ch.id
                WHERE ch.community_id = %s AND ml.created_at >= %s
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
