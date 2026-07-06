"""
Community Dashboard API Routes
==============================
Admin endpoints scoped to specific communities.
Only community owners/admins can access their community's data.

Security: All endpoints require JWT + owner/admin role for the specific community.
"""

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import get_db_connection
from services.notification_service import create_notification
from services.audit_logger import log_admin_action, actor_role_from_request
from datetime import datetime, timedelta
from functools import wraps
import logging
# FIX 1/6: Cached user-id and role lookups
from utils import get_user_id, resolve_public_community_id
from services.redis_client import (
    get_member_role, set_member_role, invalidate_member_role,
    get_community_public_id, set_community_public_id,
)

log = logging.getLogger(__name__)

# Create blueprint
community_admin_bp = Blueprint('community_admin', __name__, url_prefix='/api/admin')


# =====================================
# SECURITY DECORATOR
# =====================================

def require_community_owner(f):
    """
    Decorator to require owner/admin role for a specific community.
    Extracts community_id from URL path parameter.
    """
    @wraps(f)
    def decorated_function(community_id, *args, **kwargs):
        username = get_jwt_identity()
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                # FIX 1: Use cached get_user_id — no raw DB lookup needed
                user_id = get_user_id(username, cur)
                if not user_id:
                    return jsonify({'error': 'User not found'}), 404

                # FIX 6: Cache community role to avoid repeated membership scans
                cached_role = get_member_role(community_id, user_id)
                if cached_role is None:
                    cur.execute("""
                        SELECT role FROM community_members 
                        WHERE user_id = %s AND community_id = %s AND role IN ('owner', 'admin')
                    """, (user_id, community_id))
                    membership = cur.fetchone()
                    cached_role = membership['role'] if membership else ''
                    set_member_role(community_id, user_id, cached_role)

                if not cached_role:
                    return jsonify({'error': 'Admin access required for this community'}), 403

                # Attach user info to request
                request.admin_user_id = user_id
                request.admin_username = username
                request.admin_role = cached_role

        finally:
            conn.close()
        
        return f(community_id, *args, **kwargs)
    return decorated_function


# =====================================
# OWNED COMMUNITIES LIST
# =====================================

@community_admin_bp.route('/owned-communities', methods=['GET'])
@jwt_required()
def get_owned_communities():
    """Get list of communities where the current user is owner/admin."""
    log.info("[ADMIN] get_owned_communities endpoint called")
    conn = None
    try:
        username = get_jwt_identity()
        log.info(f"[ADMIN] User requesting owned communities: {username}")
        conn = get_db_connection()
        
        with conn.cursor() as cur:
            # FIX 1: Use cached get_user_id
            user_id = get_user_id(username, cur)
            if not user_id:
                return jsonify({'error': 'User not found'}), 404
            
            # FIX 2: Replace correlated subqueries with derived-table JOINs so the
            # count is computed once per community, not once per row.
            cur.execute("""
                SELECT
                    c.id, c.public_id, c.name, c.icon, c.color, c.logo_url, c.description,
                    cm.role,
                    COALESCE(mc.cnt, 0) as member_count,
                    COALESCE(cc.cnt, 0) as channel_count
                FROM communities c
                INNER JOIN community_members cm ON c.id = cm.community_id
                LEFT JOIN (
                    SELECT community_id, COUNT(*) AS cnt
                    FROM community_members GROUP BY community_id
                ) mc ON mc.community_id = c.id
                LEFT JOIN (
                    SELECT community_id, COUNT(*) AS cnt
                    FROM channels GROUP BY community_id
                ) cc ON cc.community_id = c.id
                WHERE cm.user_id = %s AND cm.role IN ('owner', 'admin')
                ORDER BY c.name
            """, (user_id,))

            communities = cur.fetchall()

            result = [{
                'id': c['public_id'],
                'name': c['name'],
                'icon': c['icon'],
                'color': c['color'],
                'logo_url': c['logo_url'],
                'description': c['description'],
                'role': c['role'],
                'member_count': c['member_count'],
                'channel_count': c['channel_count']
            } for c in communities]
            
            log.info(f"[ADMIN] Found {len(result)} owned communities for {username}")
            
            return jsonify({
                'success': True,
                'communities': result
            }), 200
            
    except Exception as e:
        log.error(f"[ADMIN] Error getting owned communities: {e}")
        return jsonify({'error': 'Failed to fetch communities'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# COMMUNITY OVERVIEW
# =====================================

@community_admin_bp.route('/community/<uuid:public_id>/overview', methods=['GET'])
@jwt_required()
@resolve_public_community_id
@require_community_owner
def get_community_overview(community_id):
    """Get overview stats for a specific community."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            now = datetime.now()
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            week_ago = now - timedelta(days=7)
            
            # Total members in this community (always query first, even if no channels)
            cur.execute("""
                SELECT COUNT(*) as count FROM community_members WHERE community_id = %s
            """, (community_id,))
            total_users = cur.fetchone()['count']
            
            # Online users in this community
            cur.execute("""
                SELECT COUNT(DISTINCT u.id) as count 
                FROM users u
                JOIN community_members cm ON u.id = cm.user_id
                WHERE cm.community_id = %s AND u.status = 'online'
            """, (community_id,))
            online_users = cur.fetchone()['count']
            
            # Get channels in this community
            cur.execute("SELECT id FROM channels WHERE community_id = %s", (community_id,))
            channels = [c['id'] for c in cur.fetchall()]
            
            if not channels:
                # Return stats with member count even if no channels
                return jsonify({
                    'success': True,
                    'stats': {
                        'users': {'total': total_users, 'active_today': 0, 'online': online_users},
                        'messages': {'today': 0, 'this_week': 0, 'trend_percent': 0},
                        'channels': {'total': 0},
                        'moderation': {'flagged_today': 0, 'blocked_users': 0, 'high_severity': 0},
                        'agents': {}
                    }
                }), 200
            
            channel_placeholders = ','.join(['%s'] * len(channels))
            
            # Active users today (sent messages)
            cur.execute(f"""
                SELECT COUNT(DISTINCT sender_id) as count 
                FROM messages 
                WHERE channel_id IN ({channel_placeholders})
                AND created_at >= %s
            """, channels + [today_start])
            active_users_today = cur.fetchone()['count']
            
            # Messages today
            cur.execute(f"""
                SELECT COUNT(*) as count FROM messages 
                WHERE channel_id IN ({channel_placeholders}) AND created_at >= %s
            """, channels + [today_start])
            messages_today = cur.fetchone()['count']
            
            # Messages this week
            cur.execute(f"""
                SELECT COUNT(*) as count FROM messages 
                WHERE channel_id IN ({channel_placeholders}) AND created_at >= %s
            """, channels + [week_ago])
            messages_week = cur.fetchone()['count']
            
            # Total channels
            total_channels = len(channels)
            
            # Moderation stats - flagged messages today from ai_agent_logs
            # The moderation agent stores action in output_text JSON: {"action": "warn/delete/block", ...}
            # Scope by community_id (uses idx_agent_logs_community_created) alongside the channel
            # filter — explicit scoping prevents counts leaking when channels move between communities.
            cur.execute(f"""
                SELECT COUNT(*) as count FROM ai_agent_logs l
                JOIN ai_agents a ON l.agent_id = a.id
                WHERE a.type = 'moderator'
                AND l.community_id = %s
                AND l.channel_id IN ({channel_placeholders})
                AND l.created_at >= %s
                AND l.output_text NOT LIKE '%%"action": "allow"%%'
                AND l.output_text NOT LIKE '%%"action":"allow"%%'
            """, [community_id] + channels + [today_start])
            flagged_today = cur.fetchone()['count']
            
            # Blocked users
            cur.execute("""
                SELECT COUNT(*) as count FROM blocked_users WHERE community_id = %s
            """, (community_id,))
            blocked_users = cur.fetchone()['count']
            
            # High severity violations from ai_agent_logs (same community scoping as flagged_today)
            cur.execute(f"""
                SELECT COUNT(*) as count FROM ai_agent_logs l
                JOIN ai_agents a ON l.agent_id = a.id
                WHERE a.type = 'moderator'
                AND l.community_id = %s
                AND l.channel_id IN ({channel_placeholders})
                AND l.created_at >= %s
                AND (l.output_text LIKE '%%"severity": "high"%%'
                     OR l.output_text LIKE '%%"severity":"high"%%'
                     OR l.output_text LIKE '%%"severity": "critical"%%'
                     OR l.output_text LIKE '%%"severity":"critical"%%')
            """, [community_id] + channels + [week_ago])
            high_severity = cur.fetchone()['count']
            
            # Calculate message trend
            yesterday_start = today_start - timedelta(days=1)
            cur.execute(f"""
                SELECT COUNT(*) as count FROM messages 
                WHERE channel_id IN ({channel_placeholders})
                AND created_at >= %s AND created_at < %s
            """, channels + [yesterday_start, today_start])
            messages_yesterday = cur.fetchone()['count']
            
            trend = 0
            if messages_yesterday > 0:
                trend = round(((messages_today - messages_yesterday) / messages_yesterday) * 100, 1)
            
            # AI Agent activity in this community
            # First, try to match via agent_id join, then fall back to action_type mapping
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
            cur.execute(agent_query, channels + [today_start])
            agent_activity = cur.fetchall()
            
            agent_status = {}
            for agent in agent_activity:
                agent_type = agent['agent_type'] or 'unknown'
                # Normalize moderator -> moderation for frontend display
                if agent_type == 'moderator':
                    agent_type = 'moderation'
                agent_status[agent_type] = {
                    'status': 'active',
                    'activity_count': agent['activity_count'],
                    'last_activity': agent['last_activity'].isoformat() if agent['last_activity'] else None
                }
            
            # Default agent status (include all agents)
            for agent in ['summarizer', 'mood_tracker', 'moderation', 'engagement', 'wellness', 'knowledge_builder', 'focus']:
                if agent not in agent_status:
                    agent_status[agent] = {'status': 'idle', 'activity_count': 0, 'last_activity': None}
            
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
                        'trend_percent': trend
                    },
                    'channels': {
                        'total': total_channels
                    },
                    'moderation': {
                        'flagged_today': flagged_today,
                        'blocked_users': blocked_users,
                        'high_severity': high_severity
                    },
                    'agents': agent_status
                },
                'community_id': community_id,
                'generated_at': now.isoformat()
            }), 200
            
    except Exception as e:
        log.error(f"[ADMIN] Error getting community overview: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to fetch overview'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# RECENT ALERTS
# =====================================

@community_admin_bp.route('/community/<uuid:public_id>/alerts', methods=['GET'])
@jwt_required()
@resolve_public_community_id
@require_community_owner
def get_community_alerts(community_id):
    """Get recent moderation alerts for a community."""
    conn = None
    try:
        limit = min(request.args.get('limit', 10, type=int), 50)
        conn = get_db_connection()
        
        with conn.cursor() as cur:
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
                    ch.name as channel_name
                FROM ai_agent_logs l
                JOIN users u ON l.user_id = u.id
                JOIN channels ch ON l.channel_id = ch.id
                WHERE l.community_id = %s
                AND l.agent_name = 'moderation'
                AND JSON_UNQUOTE(JSON_EXTRACT(l.output_data, '$.severity')) IN ('medium', 'high', 'critical')
                ORDER BY l.created_at DESC
                LIMIT %s
            """, (community_id, limit))
            
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
        log.error(f"[ADMIN] Error getting community alerts: {e}")
        return jsonify({'error': 'Failed to fetch alerts'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# MEMBERS MANAGEMENT
# =====================================

@community_admin_bp.route('/community/<uuid:public_id>/members', methods=['GET'])
@jwt_required()
@resolve_public_community_id
@require_community_owner
def get_community_members(community_id):
    """Get members of a specific community."""
    conn = None
    try:
        status = request.args.get('status')
        role = request.args.get('role')
        search = request.args.get('search', '')
        limit = min(request.args.get('limit', 20, type=int), 100)
        offset = max(request.args.get('offset', 0, type=int), 0)
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get channels for message count
            cur.execute("SELECT id FROM channels WHERE community_id = %s", (community_id,))
            channels = [c['id'] for c in cur.fetchall()]
            channel_placeholders = ','.join(['%s'] * len(channels)) if channels else "''"
            
            query = f"""
                SELECT
                    u.id, u.username, u.display_name, u.email, u.avatar_url,
                    u.status, u.last_seen,
                    cm.role, cm.joined_at, cm.is_muted,
                    (SELECT COUNT(*) FROM messages WHERE sender_id = u.id
                     {f'AND channel_id IN ({channel_placeholders})' if channels else 'AND 1=0'}) as message_count,
                    (SELECT COUNT(*) FROM ai_agent_logs WHERE user_id = u.id
                     AND agent_name = 'moderation'
                     {f'AND channel_id IN ({channel_placeholders})' if channels else 'AND 1=0'}
                     AND JSON_UNQUOTE(JSON_EXTRACT(output_data, '$.action')) != 'allow') as violation_count
                FROM users u
                INNER JOIN community_members cm ON u.id = cm.user_id
                WHERE cm.community_id = %s
            """
            
            params = []
            if channels:
                params.extend(channels)
                params.extend(channels)
            params.append(community_id)
            
            if status:
                query += " AND u.status = %s"
                params.append(status)
            
            if role:
                query += " AND cm.role = %s"
                params.append(role)
            
            if search:
                query += " AND (u.username LIKE %s OR u.display_name LIKE %s OR u.email LIKE %s)"
                search_param = f"%{search}%"
                params.extend([search_param, search_param, search_param])
            
            # Count total
            count_query = f"""
                SELECT COUNT(*) as total
                FROM users u
                INNER JOIN community_members cm ON u.id = cm.user_id
                WHERE cm.community_id = %s
            """
            count_params = [community_id]
            if status:
                count_query += " AND u.status = %s"
                count_params.append(status)
            if role:
                count_query += " AND cm.role = %s"
                count_params.append(role)
            if search:
                count_query += " AND (u.username LIKE %s OR u.display_name LIKE %s OR u.email LIKE %s)"
                count_params.extend([f"%{search}%"] * 3)
            
            cur.execute(count_query, count_params)
            total = cur.fetchone()['total']
            
            query += " ORDER BY cm.joined_at DESC LIMIT %s OFFSET %s"
            params.extend([limit, offset])
            
            cur.execute(query, params)
            members = cur.fetchall()
            
            result = [{
                'id': m['id'],
                'username': m['username'],
                'display_name': m['display_name'],
                'email': m['email'],
                'avatar_url': m['avatar_url'],
                'status': m['status'],
                'role': m['role'],
                'joined_at': m['joined_at'].isoformat() if m['joined_at'] else None,
                'last_seen': m['last_seen'].isoformat() if m['last_seen'] else None,
                'is_muted': bool(m['is_muted']),
                'stats': {
                    'message_count': m['message_count'],
                    'violation_count': m['violation_count']
                }
            } for m in members]
            
            return jsonify({
                'success': True,
                'members': result,
                'pagination': {
                    'total': total,
                    'limit': limit,
                    'offset': offset,
                    'has_more': offset + limit < total
                }
            }), 200
            
    except Exception as e:
        log.error(f"[ADMIN] Error getting community members: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to fetch members'}), 500
    finally:
        if conn:
            conn.close()


@community_admin_bp.route('/community/<uuid:public_id>/members/<int:user_id>', methods=['GET'])
@jwt_required()
@resolve_public_community_id
@require_community_owner
def get_member_details(community_id, user_id):
    """Get detailed information about a specific member."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get channels for message count
            cur.execute("SELECT id FROM channels WHERE community_id = %s", (community_id,))
            channels = [c['id'] for c in cur.fetchall()]
            channel_placeholders = ','.join(['%s'] * len(channels)) if channels else "''"
            
            # Get user details
            query = f"""
                SELECT
                    u.id, u.username, u.display_name, u.email, u.avatar_url,
                    u.status, u.last_seen, u.created_at as user_created_at,
                    cm.role, cm.joined_at, cm.is_muted,
                    (SELECT COUNT(*) FROM messages WHERE sender_id = u.id
                     {f'AND channel_id IN ({channel_placeholders})' if channels else 'AND 1=0'}) as message_count,
                    (SELECT COUNT(*) FROM ai_agent_logs WHERE user_id = u.id
                     AND agent_name = 'moderation'
                     {f'AND channel_id IN ({channel_placeholders})' if channels else 'AND 1=0'}
                     AND JSON_UNQUOTE(JSON_EXTRACT(output_data, '$.action')) != 'allow') as violation_count
                FROM users u
                INNER JOIN community_members cm ON u.id = cm.user_id
                WHERE cm.community_id = %s AND u.id = %s
            """
            
            params = []
            if channels:
                params.extend(channels)
                params.extend(channels)
            params.extend([community_id, user_id])
            
            cur.execute(query, params)
            member = cur.fetchone()
            
            if not member:
                return jsonify({'error': 'Member not found'}), 404
            
            # Get communities the user belongs to
            cur.execute("""
                SELECT c.id, c.name, c.icon, c.color, cm.role, cm.joined_at
                FROM communities c
                INNER JOIN community_members cm ON c.id = cm.community_id
                WHERE cm.user_id = %s
                ORDER BY cm.joined_at DESC
                LIMIT 10
            """, (user_id,))
            communities = cur.fetchall()
            
            # Get recent activity (last 5 messages in this community)
            if channels:
                cur.execute(f"""
                    SELECT m.content, m.created_at, ch.name as channel_name
                    FROM messages m
                    INNER JOIN channels ch ON m.channel_id = ch.id
                    WHERE m.sender_id = %s AND m.channel_id IN ({channel_placeholders})
                    ORDER BY m.created_at DESC
                    LIMIT 5
                """, [user_id] + channels)
                recent_messages = cur.fetchall()
            else:
                recent_messages = []
            
            result = {
                'id': member['id'],
                'username': member['username'],
                'display_name': member['display_name'],
                'email': member['email'],
                'avatar_url': member['avatar_url'],
                'status': member['status'],
                'role': member['role'],
                'joined_at': member['joined_at'].isoformat() if member['joined_at'] else None,
                'last_seen': member['last_seen'].isoformat() if member['last_seen'] else None,
                'account_created': member['user_created_at'].isoformat() if member['user_created_at'] else None,
                'is_muted': bool(member['is_muted']),
                'stats': {
                    'message_count': member['message_count'],
                    'violation_count': member['violation_count']
                },
                'communities': [{
                    'id': c['id'],
                    'name': c['name'],
                    'icon': c['icon'],
                    'color': c['color'],
                    'role': c['role'],
                    'joined_at': c['joined_at'].isoformat() if c['joined_at'] else None
                } for c in communities],
                'recent_activity': [{
                    'content': m['content'][:100] + '...' if len(m['content']) > 100 else m['content'],
                    'channel_name': m['channel_name'],
                    'created_at': m['created_at'].isoformat() if m['created_at'] else None
                } for m in recent_messages]
            }
            
            return jsonify(result), 200
            
    except Exception as e:
        log.error(f"[ADMIN] Error getting member details: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to fetch member details'}), 500
    finally:
        if conn:
            conn.close()


@community_admin_bp.route('/community/<uuid:public_id>/members/<int:user_id>/role', methods=['PUT'])
@jwt_required()
@resolve_public_community_id
@require_community_owner
def update_member_role(community_id, user_id):
    """Update a member's role in the community."""
    conn = None
    try:
        data = request.get_json() or {}
        new_role = data.get('role')
        
        if new_role not in ['member', 'admin']:
            return jsonify({'error': 'Invalid role. Must be member or admin'}), 400
        
        # Cannot change owner role
        if request.admin_role != 'owner':
            return jsonify({'error': 'Only owners can change roles'}), 403
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Check if target user exists in community
            cur.execute("""
                SELECT role FROM community_members 
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            
            member = cur.fetchone()
            if not member:
                return jsonify({'error': 'Member not found'}), 404
            
            if member['role'] == 'owner':
                return jsonify({'error': 'Cannot change owner role'}), 403
            
            cur.execute("""
                UPDATE community_members
                SET role = %s
                WHERE community_id = %s AND user_id = %s
            """, (new_role, community_id, user_id))

        conn.commit()

        log_admin_action(
            actor_user_id=request.admin_user_id,
            actor_role=actor_role_from_request(request),
            action='community.member_role_change',
            target_type='user',
            target_id=user_id,
            community_id=community_id,
            metadata={'new_role': new_role, 'prev_role': member['role']},
        )

        return jsonify({'success': True, 'message': 'Role updated'}), 200
        
    except Exception as e:
        log.error(f"[ADMIN] Error updating member role: {e}")
        return jsonify({'error': 'Failed to update role'}), 500
    finally:
        if conn:
            conn.close()


@community_admin_bp.route('/community/<uuid:public_id>/members/<int:user_id>', methods=['DELETE'])
@jwt_required()
@resolve_public_community_id
@require_community_owner
def remove_member(community_id, user_id):
    """Remove a member from the community."""
    conn = None
    try:
        conn = get_db_connection()
        removed_username = None
        with conn.cursor() as cur:
            # Check if target user exists
            cur.execute("""
                SELECT cm.role, u.username FROM community_members cm
                JOIN users u ON u.id = cm.user_id
                WHERE cm.community_id = %s AND cm.user_id = %s
            """, (community_id, user_id))
            
            member = cur.fetchone()
            if not member:
                return jsonify({'error': 'Member not found'}), 404
            
            if member['role'] == 'owner':
                return jsonify({'error': 'Cannot remove owner'}), 403

            removed_username = member.get('username')

            # Remove from community_members
            cur.execute("""
                DELETE FROM community_members 
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            
            # Remove from channel_members for this community's channels
            cur.execute("""
                DELETE cm FROM channel_members cm
                INNER JOIN channels c ON cm.channel_id = c.id
                WHERE c.community_id = %s AND cm.user_id = %s
            """, (community_id, user_id))

        conn.commit()

        log_admin_action(
            actor_user_id=request.admin_user_id,
            actor_role=actor_role_from_request(request),
            action='community.member_remove',
            target_type='user',
            target_id=user_id,
            community_id=community_id,
            metadata={'prev_role': member['role']},
        )
        
        # Notify the removed user
        try:
            with get_db_connection() as nconn:
                with nconn.cursor() as cur2:
                    cur2.execute("SELECT name FROM communities WHERE id = %s", (community_id,))
                    cname = cur2.fetchone()
                    community_name = cname['name'] if cname else 'a community'
            create_notification(
                user_id=user_id,
                type='community_removal',
                title='Removed from Community',
                body=f'You were removed from {community_name}',
                link='/',
                related_id=community_id,
            )
        except Exception as notif_err:
            log.warning(f"[ADMIN] Removal notification failed: {notif_err}")

        # System event label in chat feed
        try:
            from routes.channels import _post_system_message
            label = removed_username or f"User {user_id}"
            _post_system_message(community_id, f"{label} was removed from the community")
        except Exception as _sm_err:
            log.warning(f"[ADMIN] system msg (remove) failed: {_sm_err}")

        return jsonify({'success': True, 'message': 'Member removed'}), 200

    except Exception as e:
        log.error(f"[ADMIN] Error removing member: {e}")
        return jsonify({'error': 'Failed to remove member'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# WARN / MUTE / UNMUTE (Community Scoped)
# =====================================
# Mirrors the system-admin warn endpoint in routes/admin.py:2813, but scoped to
# one community and gated by require_community_owner. Logs to admin_audit_logs
# (via log_admin_action) for cross-admin auditing; warn also lands in the legacy
# admin_actions table whose enum supports 'warn'. Mute/unmute are NOT in that
# enum, so they log to admin_audit_logs only — adding enum values would be a
# schema change (out of scope per OWL-PLAN ground rules).
# Socket delivery to the target user is handled by create_notification, which
# already emits to room user_<id> on the default namespace.


def _get_community_name(community_id):
    """Look up the community name for notification copy. Returns '' on miss."""
    try:
        with get_db_connection() as nconn:
            with nconn.cursor() as ncur:
                ncur.execute("SELECT name FROM communities WHERE id = %s", (community_id,))
                row = ncur.fetchone()
                return row['name'] if row else ''
    except Exception:
        return ''


def _get_community_public_id(community_id):
    """Resolve internal int id -> external public_id for building client-facing links."""
    cached = get_community_public_id(community_id)
    if cached is not None:
        return cached
    try:
        with get_db_connection() as nconn:
            with nconn.cursor() as ncur:
                ncur.execute("SELECT public_id FROM communities WHERE id = %s", (community_id,))
                row = ncur.fetchone()
                if not row:
                    return None
                set_community_public_id(community_id, row['public_id'])
                return row['public_id']
    except Exception:
        return None


@community_admin_bp.route('/community/<uuid:public_id>/members/<int:user_id>/warn', methods=['POST'])
@jwt_required()
@resolve_public_community_id
@require_community_owner
def warn_member(community_id, user_id):
    """Send a warning to a community member. Logged in admin_actions + admin_audit_logs.
    Body: { reason: string }
    """
    conn = None
    try:
        data = request.get_json() or {}
        reason = (data.get('reason') or '').strip()
        if not reason:
            return jsonify({'error': 'Reason is required'}), 400
        if len(reason) > 1000:
            return jsonify({'error': 'Reason is too long (max 1000 chars)'}), 400

        conn = get_db_connection()
        with conn.cursor() as cur:
            # Confirm target is a member of THIS community (security boundary —
            # the decorator only proves the caller is an admin of community_id).
            cur.execute("""
                SELECT cm.role, u.username
                FROM community_members cm
                INNER JOIN users u ON u.id = cm.user_id
                WHERE cm.community_id = %s AND cm.user_id = %s
            """, (community_id, user_id))
            member = cur.fetchone()
            if not member:
                return jsonify({'error': 'Member not found'}), 404
            if member['role'] == 'owner':
                return jsonify({'error': 'Cannot warn the community owner'}), 403

            # Legacy table — community_id isn't stored here (table predates
            # community scoping); admin_audit_logs below carries the scope.
            cur.execute("""
                INSERT INTO admin_actions (admin_id, target_user_id, action_type, reason)
                VALUES (%s, %s, 'warn', %s)
            """, (request.admin_user_id, user_id, reason))

        conn.commit()

        log_admin_action(
            actor_user_id=request.admin_user_id,
            actor_role=actor_role_from_request(request),
            action='community.member_warn',
            target_type='user',
            target_id=user_id,
            community_id=community_id,
            metadata={'reason': reason, 'target_username': member['username']},
        )

        # Notify the warned user (DB row + socket emit handled inside).
        try:
            community_name = _get_community_name(community_id) or 'your community'
            create_notification(
                user_id=user_id,
                type='community_warning',
                title=f'Warning from {community_name}',
                body=reason,
                link=f'/community/{_get_community_public_id(community_id)}',
                related_id=community_id,
            )
        except Exception as notif_err:
            log.warning(f"[ADMIN] Warn notification failed: {notif_err}")

        log.info(f"[ADMIN] Warning issued in community {community_id} to user #{user_id} by {request.admin_username}: {reason}")
        return jsonify({
            'success': True,
            'message': f"Warning sent to {member['username']}"
        }), 200

    except Exception as e:
        log.error(f"[ADMIN] Error warning member: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to send warning'}), 500
    finally:
        if conn:
            conn.close()


@community_admin_bp.route('/community/<uuid:public_id>/members/<int:user_id>/mute', methods=['POST'])
@jwt_required()
@resolve_public_community_id
@require_community_owner
def mute_member(community_id, user_id):
    """Mute a community member (community_members.is_muted=1).
    Body: { reason: string, duration_minutes?: int }
    NOTE: duration_minutes is accepted and recorded in the audit log for forward
    compatibility, but the current schema has no muted_until column — mutes are
    effectively indefinite until /unmute is called. A timed-mute background job
    would need a schema change (out of scope per OWL-PLAN).
    """
    conn = None
    try:
        data = request.get_json() or {}
        reason = (data.get('reason') or '').strip()
        if not reason:
            return jsonify({'error': 'Reason is required'}), 400
        if len(reason) > 1000:
            return jsonify({'error': 'Reason is too long (max 1000 chars)'}), 400

        duration_minutes = data.get('duration_minutes')
        if duration_minutes is not None:
            try:
                duration_minutes = int(duration_minutes)
            except (TypeError, ValueError):
                return jsonify({'error': 'duration_minutes must be an integer'}), 400
            if duration_minutes < 1 or duration_minutes > 60 * 24 * 30:  # max 30 days
                return jsonify({'error': 'duration_minutes must be between 1 and 43200'}), 400

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT cm.role, cm.is_muted, u.username
                FROM community_members cm
                INNER JOIN users u ON u.id = cm.user_id
                WHERE cm.community_id = %s AND cm.user_id = %s
            """, (community_id, user_id))
            member = cur.fetchone()
            if not member:
                return jsonify({'error': 'Member not found'}), 404
            if member['role'] == 'owner':
                return jsonify({'error': 'Cannot mute the community owner'}), 403
            if member['is_muted']:
                return jsonify({'error': 'Member is already muted'}), 400

            cur.execute("""
                UPDATE community_members
                SET is_muted = 1
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))

        conn.commit()

        log_admin_action(
            actor_user_id=request.admin_user_id,
            actor_role=actor_role_from_request(request),
            action='community.member_mute',
            target_type='user',
            target_id=user_id,
            community_id=community_id,
            metadata={
                'reason': reason,
                'duration_minutes': duration_minutes,
                'target_username': member['username'],
            },
        )

        try:
            community_name = _get_community_name(community_id) or 'your community'
            create_notification(
                user_id=user_id,
                type='community_mute',
                title=f'Muted in {community_name}',
                body=reason,
                link=f'/community/{_get_community_public_id(community_id)}',
                related_id=community_id,
            )
        except Exception as notif_err:
            log.warning(f"[ADMIN] Mute notification failed: {notif_err}")

        log.info(f"[ADMIN] Muted user #{user_id} in community {community_id} by {request.admin_username}")
        return jsonify({
            'success': True,
            'message': f"{member['username']} has been muted",
        }), 200

    except Exception as e:
        log.error(f"[ADMIN] Error muting member: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to mute member'}), 500
    finally:
        if conn:
            conn.close()


@community_admin_bp.route('/community/<uuid:public_id>/members/<int:user_id>/unmute', methods=['POST'])
@jwt_required()
@resolve_public_community_id
@require_community_owner
def unmute_member(community_id, user_id):
    """Lift a mute on a community member (community_members.is_muted=0)."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT cm.is_muted, u.username
                FROM community_members cm
                INNER JOIN users u ON u.id = cm.user_id
                WHERE cm.community_id = %s AND cm.user_id = %s
            """, (community_id, user_id))
            member = cur.fetchone()
            if not member:
                return jsonify({'error': 'Member not found'}), 404
            if not member['is_muted']:
                return jsonify({'error': 'Member is not muted'}), 400

            cur.execute("""
                UPDATE community_members
                SET is_muted = 0
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))

        conn.commit()

        log_admin_action(
            actor_user_id=request.admin_user_id,
            actor_role=actor_role_from_request(request),
            action='community.member_unmute',
            target_type='user',
            target_id=user_id,
            community_id=community_id,
            metadata={'target_username': member['username']},
        )

        try:
            community_name = _get_community_name(community_id) or 'your community'
            create_notification(
                user_id=user_id,
                type='community_unmute',
                title=f'Unmuted in {community_name}',
                body='Your mute has been lifted. You can post again.',
                link=f'/community/{_get_community_public_id(community_id)}',
                related_id=community_id,
            )
        except Exception as notif_err:
            log.warning(f"[ADMIN] Unmute notification failed: {notif_err}")

        log.info(f"[ADMIN] Unmuted user #{user_id} in community {community_id} by {request.admin_username}")
        return jsonify({
            'success': True,
            'message': f"{member['username']} has been unmuted",
        }), 200

    except Exception as e:
        log.error(f"[ADMIN] Error unmuting member: {e}")
        if conn:
            conn.rollback()
        return jsonify({'error': 'Failed to unmute member'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# MODERATION (Community Scoped)
# =====================================

# NEW — v2: POST /api/admin/community/<id>/moderation/scan
@community_admin_bp.route('/community/<uuid:public_id>/moderation/scan', methods=['POST'])  # NEW — v2
@jwt_required()  # NEW — v2
@resolve_public_community_id
@require_community_owner  # NEW — v2
def trigger_retroactive_scan(community_id):  # NEW — v2
    """
    NEW — v2: Queue a retroactive moderation scan for all channels (or a specific channel)
    in this community. Returns the Celery task_id immediately.
    Body (JSON, all optional):
      channel_id  int   — restrict scan to one channel (omit = all channels)
      hours_back  int   — how far back to scan (default 48)
    """
    from tasks.agent_tasks import retroactive_scan_task  # NEW — v2

    data = request.get_json(silent=True) or {}  # NEW — v2
    channel_id = data.get('channel_id')  # None = all channels  # NEW — v2
    hours_back = int(data.get('hours_back', 48))  # NEW — v2
    hours_back = max(1, min(hours_back, 168))  # clamp 1h – 7 days  # NEW — v2

    if channel_id is not None:  # NEW — v2
        # Verify the channel belongs to this community  # NEW — v2
        conn = None  # NEW — v2
        try:  # NEW — v2
            conn = get_db_connection()  # NEW — v2
            with conn.cursor() as cur:  # NEW — v2
                cur.execute(  # NEW — v2
                    "SELECT id FROM channels WHERE id = %s AND community_id = %s",  # NEW — v2
                    (channel_id, community_id)  # NEW — v2
                )  # NEW — v2
                if not cur.fetchone():  # NEW — v2
                    return jsonify({'error': 'Channel not found in this community'}), 404  # NEW — v2
        except Exception as e:  # NEW — v2
            log.error(f"[ADMIN] scan channel verify error: {e}")  # NEW — v2
            return jsonify({'error': 'Database error'}), 500  # NEW — v2
        finally:  # NEW — v2
            if conn:  # NEW — v2
                conn.close()  # NEW — v2

    task = retroactive_scan_task.apply_async(  # NEW — v2
        kwargs={  # NEW — v2
            'channel_id': channel_id,  # NEW — v2
            'community_id': community_id,  # NEW — v2
            'hours_back': hours_back,  # NEW — v2
            'triggered_by': getattr(request, 'admin_user_id', None),  # NEW — v2
        },  # NEW — v2
        queue='high_priority',  # NEW — v2
    )  # NEW — v2

    return jsonify({  # NEW — v2
        'success': True,  # NEW — v2
        'task_id': task.id,  # NEW — v2
        'channel_id': channel_id,  # NEW — v2
        'community_id': community_id,  # NEW — v2
        'hours_back': hours_back,  # NEW — v2
    }), 202  # NEW — v2


# NEW — v2: GET /api/admin/community/<id>/moderation/scan/status
@community_admin_bp.route('/community/<uuid:public_id>/moderation/scan/status', methods=['GET'])  # NEW — v2
@jwt_required()  # NEW — v2
@resolve_public_community_id
@require_community_owner  # NEW — v2
def get_scan_status(community_id):  # NEW — v2
    """
    NEW — v2: Poll the current retroactive scan progress for a channel.
    Query param: channel_id (required)
    Returns progress stored in Redis key mod:scan:<community_id>:<channel_id>.
    """
    from services.redis_client import get_redis  # NEW — v2

    channel_id = request.args.get('channel_id', type=int)  # NEW — v2
    if not channel_id:  # NEW — v2
        return jsonify({'error': 'channel_id query param required'}), 400  # NEW — v2

    r = get_redis()  # NEW — v2
    if r is None:  # NEW — v2
        return jsonify({'error': 'Redis unavailable'}), 503  # NEW — v2

    scan_key = f'mod:scan:{community_id}:{channel_id}'  # NEW — v2
    data = r.hgetall(scan_key)  # NEW — v2

    if not data:  # NEW — v2
        return jsonify({'status': 'idle', 'community_id': community_id, 'channel_id': channel_id}), 200  # NEW — v2

    def _d(key):  # NEW — v2
        val = data.get(key.encode()) or data.get(key)  # bytes or str key  # NEW — v2
        return val.decode() if isinstance(val, bytes) else (val or '')  # NEW — v2

    scanned = int(_d('scanned') or 0)  # NEW — v2
    total = int(_d('total') or 0)  # NEW — v2
    percent = int(scanned / total * 100) if total > 0 else 0  # NEW — v2

    return jsonify({  # NEW — v2
        'status': _d('status') or 'idle',  # NEW — v2
        'community_id': community_id,  # NEW — v2
        'channel_id': channel_id,  # NEW — v2
        'scanned': scanned,  # NEW — v2
        'total': total,  # NEW — v2
        'flagged': int(_d('flagged') or 0),  # NEW — v2
        'percent': percent,  # NEW — v2
        'started_at': _d('started_at'),  # NEW — v2
        'finished_at': _d('finished_at'),  # NEW — v2
        'triggered_by': _d('triggered_by'),  # NEW — v2
    }), 200  # NEW — v2


@community_admin_bp.route('/community/<uuid:public_id>/moderation/flagged', methods=['GET'])
@jwt_required()
@resolve_public_community_id
@require_community_owner
def get_flagged_messages(community_id):
    """Get flagged messages for a specific community from ai_agent_logs."""
    conn = None
    try:
        status = request.args.get('status')
        severity = request.args.get('severity')
        flag_type = request.args.get('flag_type')
        limit = min(request.args.get('limit', 20, type=int), 100)
        offset = max(request.args.get('offset', 0, type=int), 0)
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get channels in this community
            cur.execute("SELECT id FROM channels WHERE community_id = %s", (community_id,))
            channels = [row['id'] for row in cur.fetchall()]
            
            if not channels:
                return jsonify({
                    'success': True,
                    'flagged_messages': [],
                    'pagination': {'total': 0, 'limit': limit, 'offset': offset, 'has_more': False}
                }), 200
            
            channel_placeholders = ','.join(['%s'] * len(channels))
            
            # Query ai_agent_logs for moderation entries (non-allow actions)
            query = """
                SELECT 
                    l.id, l.user_id, l.channel_id, l.message_id,
                    l.input_text as message_text,
                    l.output_text,
                    l.confidence_score as confidence,
                    l.created_at,
                    u.username, u.display_name, u.avatar_url,
                    ch.name as channel_name,
                    (SELECT COUNT(*) FROM ai_agent_logs l2 
                     JOIN ai_agents a2 ON l2.agent_id = a2.id
                     WHERE l2.user_id = l.user_id 
                     AND a2.type = 'moderator'
                     AND l2.output_text NOT LIKE '%%"action": "allow"%%'
                     AND l2.output_text NOT LIKE '%%"action":"allow"%%') as user_violation_count
                FROM ai_agent_logs l
                JOIN ai_agents a ON l.agent_id = a.id
                JOIN users u ON l.user_id = u.id
                JOIN channels ch ON l.channel_id = ch.id
                WHERE a.type = 'moderator'
                AND l.channel_id IN (""" + channel_placeholders + """)
                AND l.output_text NOT LIKE '%%"action": "allow"%%'
                AND l.output_text NOT LIKE '%%"action":"allow"%%'
            """
            params = list(channels)
            
            # Filter by status (action_taken from output_text JSON)
            if status:
                if status == 'pending':
                    # Pending means flagged but not yet reviewed - look for warn/delete actions
                    query += """ AND (l.output_text LIKE '%%"action": "warn"%%' 
                                  OR l.output_text LIKE '%%"action":"warn"%%'
                                  OR l.output_text LIKE '%%"action": "delete"%%'
                                  OR l.output_text LIKE '%%"action":"delete"%%')"""
            
            # Filter by severity
            if severity:
                query += """ AND (l.output_text LIKE %s OR l.output_text LIKE %s)"""
                params.append(f'%%"severity": "{severity}"%%')
                params.append(f'%%"severity":"{severity}"%%')
            
            # Filter by flag_type (mapped from reasons in output_text)
            if flag_type:
                query += """ AND l.output_text LIKE %s"""
                params.append(f'%%{flag_type}%%')
            
            # Count query
            count_query = """
                SELECT COUNT(*) as total
                FROM ai_agent_logs l
                JOIN ai_agents a ON l.agent_id = a.id
                JOIN channels ch ON l.channel_id = ch.id
                WHERE a.type = 'moderator'
                AND l.channel_id IN (""" + channel_placeholders + """)
                AND l.output_text NOT LIKE '%%"action": "allow"%%'
                AND l.output_text NOT LIKE '%%"action":"allow"%%'
            """
            count_params = list(channels)
            
            if status:
                if status == 'pending':
                    count_query += """ AND (l.output_text LIKE '%%"action": "warn"%%' 
                                      OR l.output_text LIKE '%%"action":"warn"%%'
                                      OR l.output_text LIKE '%%"action": "delete"%%'
                                      OR l.output_text LIKE '%%"action":"delete"%%')"""
            
            if severity:
                count_query += """ AND (l.output_text LIKE %s OR l.output_text LIKE %s)"""
                count_params.append(f'%%"severity": "{severity}"%%')
                count_params.append(f'%%"severity":"{severity}"%%')
            
            if flag_type:
                count_query += """ AND l.output_text LIKE %s"""
                count_params.append(f'%%{flag_type}%%')
            
            cur.execute(count_query, count_params)
            total = cur.fetchone()['total']
            
            query += " ORDER BY l.created_at DESC LIMIT %s OFFSET %s"
            params.extend([limit, offset])
            
            cur.execute(query, params)
            flagged = cur.fetchall()
            
            result = []
            for f in flagged:
                # Parse the output_text JSON to extract action, severity, reasons
                import json
                try:
                    output_data = json.loads(f['output_text']) if f['output_text'] else {}
                except:
                    output_data = {}
                
                action = output_data.get('action', 'flagged')
                severity_val = output_data.get('severity', 'medium')
                reasons = output_data.get('reasons', [])
                flag_type_val = reasons[0] if reasons else 'unknown'
                
                result.append({
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
                    'message_text': f['message_text'],
                    'flag_type': flag_type_val,
                    'severity': severity_val,
                    'confidence': f['confidence'],
                    'action_taken': action,
                    'reason': ', '.join(reasons) if reasons else None,
                    'created_at': f['created_at'].isoformat() if f['created_at'] else None
                })
            
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
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to fetch flagged messages'}), 500
    finally:
        if conn:
            conn.close()


# Phase 2.1: thread-context view for a flagged log row.
# Given an ai_agent_logs row id, return its surrounding messages (±N) from the
# same channel so the admin can see the flagged content in conversation context
# without leaving the dashboard. Window is small + bounded — pure window query,
# no schema changes, scoped to channels of the requesting admin's community.
@community_admin_bp.route('/community/<uuid:public_id>/moderation/flagged/<int:log_id>/context', methods=['GET'])
@jwt_required()
@resolve_public_community_id
@require_community_owner
def get_flagged_context(community_id, log_id):
    """Return the flagged message plus ±N surrounding messages from the same channel.

    Query param: `window` (int, default 5, max 20) — messages on each side.
    Cross-community safety: the log row must belong to a channel inside the
    requesting community, else 404 (never leak even existence across tenants).
    """
    conn = None
    try:
        window = min(max(request.args.get('window', 5, type=int), 1), 20)

        conn = get_db_connection()
        with conn.cursor() as cur:
            # 1) Resolve the log row and its channel/message anchor. We also pull
            #    the moderator agent's output so the panel can show severity /
            #    reasons / action alongside the flagged text without a second call.
            cur.execute("""
                SELECT
                    l.id AS log_id,
                    l.channel_id,
                    l.message_id,
                    l.user_id,
                    l.input_text,
                    l.output_text,
                    l.confidence_score,
                    l.created_at AS log_created_at,
                    ch.community_id,
                    ch.name AS channel_name
                FROM ai_agent_logs l
                JOIN ai_agents a ON l.agent_id = a.id
                JOIN channels ch ON l.channel_id = ch.id
                WHERE l.id = %s AND a.type = 'moderator'
            """, (log_id,))
            log_row = cur.fetchone()

            if not log_row or log_row['community_id'] != community_id:
                return jsonify({'error': 'Flagged log not found in this community'}), 404

            channel_id = log_row['channel_id']
            anchor_message_id = log_row['message_id']
            anchor_created_at = log_row['log_created_at']

            # 2) Pick the anchor we'll window around.
            #    Prefer the original message row (message_id present + still in
            #    the table). If the message was deleted, fall back to the log
            #    timestamp so we still return *something* useful — an empty
            #    panel would just confuse the admin.
            anchor_row = None
            if anchor_message_id:
                cur.execute("""
                    SELECT id, created_at FROM messages
                    WHERE id = %s AND channel_id = %s
                """, (anchor_message_id, channel_id))
                anchor_row = cur.fetchone()

            if anchor_row:
                # Window by id around the anchor message id. Using id (auto-inc)
                # is monotonic per channel and avoids ties on identical created_at.
                cur.execute("""
                    SELECT
                        m.id, m.channel_id, m.sender_id, m.content, m.message_type,
                        m.reply_to, m.created_at, m.edited_at,
                        m.moderation_flagged, m.moderation_score,
                        u.username, u.display_name, u.avatar_url
                    FROM messages m
                    LEFT JOIN users u ON m.sender_id = u.id
                    WHERE m.channel_id = %s
                      AND m.id IN (
                          SELECT id FROM (
                              (SELECT id FROM messages
                                  WHERE channel_id = %s AND id <= %s
                                  ORDER BY id DESC LIMIT %s)
                              UNION
                              (SELECT id FROM messages
                                  WHERE channel_id = %s AND id > %s
                                  ORDER BY id ASC LIMIT %s)
                          ) AS w
                      )
                    ORDER BY m.id ASC
                """, (
                    channel_id,
                    channel_id, anchor_row['id'], window + 1,  # +1 to include the anchor itself
                    channel_id, anchor_row['id'], window,
                ))
            else:
                # Anchor message gone — window by created_at against the log row.
                cur.execute("""
                    SELECT
                        m.id, m.channel_id, m.sender_id, m.content, m.message_type,
                        m.reply_to, m.created_at, m.edited_at,
                        m.moderation_flagged, m.moderation_score,
                        u.username, u.display_name, u.avatar_url
                    FROM messages m
                    LEFT JOIN users u ON m.sender_id = u.id
                    WHERE m.channel_id = %s
                      AND m.id IN (
                          SELECT id FROM (
                              (SELECT id FROM messages
                                  WHERE channel_id = %s AND created_at <= %s
                                  ORDER BY created_at DESC, id DESC LIMIT %s)
                              UNION
                              (SELECT id FROM messages
                                  WHERE channel_id = %s AND created_at > %s
                                  ORDER BY created_at ASC, id ASC LIMIT %s)
                          ) AS w
                      )
                    ORDER BY m.created_at ASC, m.id ASC
                """, (
                    channel_id,
                    channel_id, anchor_created_at, window,
                    channel_id, anchor_created_at, window,
                ))
            window_rows = cur.fetchall()

            messages_payload = [{
                'id': r['id'],
                'channel_id': r['channel_id'],
                'sender': {
                    'id': r['sender_id'],
                    'username': r['username'],
                    'display_name': r['display_name'],
                    'avatar_url': r['avatar_url'],
                } if r['sender_id'] else None,
                'content': r['content'],
                'message_type': r['message_type'],
                'reply_to': r['reply_to'],
                'created_at': r['created_at'].isoformat() if r['created_at'] else None,
                'edited_at': r['edited_at'].isoformat() if r['edited_at'] else None,
                'moderation_flagged': bool(r['moderation_flagged']),
                'moderation_score': r['moderation_score'],
                # Marker the UI uses to highlight the flagged row inside the window.
                'is_flagged_anchor': bool(anchor_row and r['id'] == anchor_row['id']),
            } for r in window_rows]

            # Parse moderator output_text once so the frontend doesn't need to.
            import json
            try:
                output_data = json.loads(log_row['output_text']) if log_row['output_text'] else {}
            except Exception:
                output_data = {}

            reasons = output_data.get('reasons', []) or []

            return jsonify({
                'success': True,
                'log': {
                    'id': log_row['log_id'],
                    'channel': {
                        'id': channel_id,
                        'name': log_row['channel_name'],
                    },
                    'user_id': log_row['user_id'],
                    'message_id': anchor_message_id,
                    'message_deleted': anchor_message_id is not None and anchor_row is None,
                    'flagged_text': log_row['input_text'],
                    'confidence': log_row['confidence_score'],
                    'action': output_data.get('action', 'flagged'),
                    'severity': output_data.get('severity', 'medium'),
                    'reasons': reasons,
                    'flag_type': reasons[0] if reasons else 'unknown',
                    'created_at': anchor_created_at.isoformat() if anchor_created_at else None,
                },
                'context': {
                    'window': window,
                    'messages': messages_payload,
                },
            }), 200

    except Exception as e:
        log.error(f"[ADMIN] Error getting flagged context for log {log_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to fetch flagged context'}), 500
    finally:
        if conn:
            conn.close()


@community_admin_bp.route('/community/<uuid:public_id>/moderation/blocked', methods=['GET'])
@jwt_required()
@resolve_public_community_id
@require_community_owner
def get_blocked_users(community_id):
    """Get blocked users for a specific community."""
    conn = None
    try:
        limit = min(request.args.get('limit', 20, type=int), 100)
        offset = max(request.args.get('offset', 0, type=int), 0)
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Query blocked_users - table only has id, community_id, user_id, blocked_at
            # Get violation count from ai_agent_logs instead of moderation_logs
            cur.execute("""
                SELECT 
                    bu.id, bu.user_id, bu.blocked_at,
                    u.username, u.display_name, u.avatar_url, u.email,
                    (SELECT COUNT(*) FROM ai_agent_logs l
                     JOIN ai_agents a ON l.agent_id = a.id
                     WHERE l.user_id = bu.user_id 
                     AND a.type = 'moderator'
                     AND l.output_text NOT LIKE '%%"action": "allow"%%'
                     AND l.output_text NOT LIKE '%%"action":"allow"%%') as total_violations
                FROM blocked_users bu
                JOIN users u ON bu.user_id = u.id
                WHERE bu.community_id = %s
                ORDER BY bu.blocked_at DESC
                LIMIT %s OFFSET %s
            """, (community_id, limit, offset))
            
            blocked = cur.fetchall()
            
            # Count total
            cur.execute("""
                SELECT COUNT(*) as total FROM blocked_users WHERE community_id = %s
            """, (community_id,))
            total = cur.fetchone()['total']
            
            result = [{
                'id': b['id'],
                'user': {
                    'id': b['user_id'],
                    'username': b['username'],
                    'display_name': b['display_name'],
                    'avatar_url': b['avatar_url'],
                    'email': b['email']
                },
                'reason': None,  # Column doesn't exist in schema
                'blocked_at': b['blocked_at'].isoformat() if b['blocked_at'] else None,
                'total_violations': b['total_violations']
            } for b in blocked]
            
            return jsonify({
                'success': True,
                'blocked_users': result,
                'pagination': {
                    'total': total,
                    'limit': limit,
                    'offset': offset,
                    'has_more': offset + limit < total
                }
            }), 200
            
    except Exception as e:
        log.error(f"[ADMIN] Error getting blocked users: {e}")
        return jsonify({'error': 'Failed to fetch blocked users'}), 500
    finally:
        if conn:
            conn.close()


@community_admin_bp.route('/community/<uuid:public_id>/moderation/unblock/<int:user_id>', methods=['DELETE'])
@jwt_required()
@resolve_public_community_id
@require_community_owner
def unblock_user(community_id, user_id):
    """Unblock a user from a community."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                DELETE FROM blocked_users
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))

        conn.commit()

        # Invalidate Redis cache so the next message from this user
        # in this community no longer reads a stale 'blocked' verdict.
        try:
            from services.redis_client import get_redis as _get_redis
            _r = _get_redis()
            if _r:
                _r.delete(f"blocked:{community_id}:{user_id}")
        except Exception:
            pass

        log_admin_action(
            actor_user_id=request.admin_user_id,
            actor_role=actor_role_from_request(request),
            action='user.unblock',
            target_type='user',
            target_id=user_id,
            community_id=community_id,
        )

        return jsonify({'success': True, 'message': 'User unblocked'}), 200
        
    except Exception as e:
        log.error(f"[ADMIN] Error unblocking user: {e}")
        return jsonify({'error': 'Failed to unblock user'}), 500
    finally:
        if conn:
            conn.close()


@community_admin_bp.route('/community/<uuid:public_id>/moderation/block', methods=['POST'])
@jwt_required()
@resolve_public_community_id
@require_community_owner
def block_user(community_id):
    """Block a user from a community."""
    conn = None
    try:
        data = request.get_json() or {}
        user_id = data.get('user_id')
        reason = data.get('reason', 'No reason provided')
        
        if not user_id:
            return jsonify({'error': 'user_id is required'}), 400
        
        conn = get_db_connection()
        banned_username = None
        with conn.cursor() as cur:
            # Check if user is a member
            cur.execute("""
                SELECT cm.role, u.username FROM community_members cm
                JOIN users u ON u.id = cm.user_id
                WHERE cm.community_id = %s AND cm.user_id = %s
            """, (community_id, user_id))
            
            member = cur.fetchone()
            if not member:
                return jsonify({'error': 'User is not a member'}), 404
            
            if member['role'] == 'owner':
                return jsonify({'error': 'Cannot block owner'}), 403

            banned_username = member.get('username')
            
            # Check if already blocked
            cur.execute("""
                SELECT id FROM blocked_users 
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            
            if cur.fetchone():
                return jsonify({'error': 'User is already blocked'}), 400
            
            # Block the user
            cur.execute("""
                INSERT INTO blocked_users (community_id, user_id, reason, blocked_by, blocked_at)
                VALUES (%s, %s, %s, %s, NOW())
            """, (community_id, user_id, reason, request.admin_user_id))
            
            # Remove from community
            cur.execute("""
                DELETE FROM community_members 
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            
            # Remove from channel members
            cur.execute("""
                DELETE cm FROM channel_members cm
                INNER JOIN channels c ON cm.channel_id = c.id
                WHERE c.community_id = %s AND cm.user_id = %s
            """, (community_id, user_id))

        conn.commit()

        # Invalidate Redis cache for this block — Socket.IO message handler
        # will re-read DB on next message and discover the block.
        try:
            from services.redis_client import get_redis as _get_redis
            _r = _get_redis()
            if _r:
                _r.delete(f"blocked:{community_id}:{user_id}")
        except Exception:
            pass

        log_admin_action(
            actor_user_id=request.admin_user_id,
            actor_role=actor_role_from_request(request),
            action='user.block',
            target_type='user',
            target_id=user_id,
            community_id=community_id,
            metadata={'reason': reason},
        )

        # System event label in chat feed
        try:
            from routes.channels import _post_system_message
            label = banned_username or f"User {user_id}"
            _post_system_message(community_id, f"{label} was banned from the community")
        except Exception as _sm_err:
            log.warning(f"[ADMIN] system msg (ban) failed: {_sm_err}")

        return jsonify({'success': True, 'message': 'User blocked'}), 200
        
    except Exception as e:
        log.error(f"[ADMIN] Error blocking user: {e}")
        return jsonify({'error': 'Failed to block user'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# ANALYTICS (Community Scoped)
# =====================================

@community_admin_bp.route('/community/<uuid:public_id>/analytics/engagement', methods=['GET'])
@jwt_required()
@resolve_public_community_id
@require_community_owner
def get_engagement_analytics(community_id):
    """Get engagement analytics for a community."""
    conn = None
    try:
        days = min(request.args.get('days', 7, type=int), 30)
        conn = get_db_connection()
        
        with conn.cursor() as cur:
            start_date = datetime.now() - timedelta(days=days)
            
            # Get channels
            cur.execute("SELECT id FROM channels WHERE community_id = %s", (community_id,))
            channels = [c['id'] for c in cur.fetchall()]
            
            if not channels:
                return jsonify({
                    'success': True,
                    'daily_engagement': [],
                    'hourly_distribution': [],
                    'top_channels': []
                }), 200
            
            channel_placeholders = ','.join(['%s'] * len(channels))
            
            # Daily engagement
            cur.execute(f"""
                SELECT 
                    DATE(created_at) as date,
                    COUNT(*) as messages,
                    COUNT(DISTINCT sender_id) as active_users
                FROM messages
                WHERE channel_id IN ({channel_placeholders})
                AND created_at >= %s
                GROUP BY DATE(created_at)
                ORDER BY date
            """, channels + [start_date])
            
            daily_engagement = [{
                'date': row['date'].isoformat() if row['date'] else None,
                'messages': row['messages'],
                'active_users': row['active_users'],
                'new_members': 0  # Would need to track join dates
            } for row in cur.fetchall()]
            
            # Hourly distribution (last 7 days)
            cur.execute(f"""
                SELECT 
                    HOUR(created_at) as hour,
                    COUNT(*) as messages
                FROM messages
                WHERE channel_id IN ({channel_placeholders})
                AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                GROUP BY HOUR(created_at)
                ORDER BY hour
            """, channels)
            
            hourly = {row['hour']: row['messages'] for row in cur.fetchall()}
            hourly_distribution = [{'hour': h, 'messages': hourly.get(h, 0)} for h in range(24)]
            
            # Top channels
            cur.execute(f"""
                SELECT 
                    c.id, c.name,
                    COUNT(m.id) as message_count,
                    (SELECT COUNT(*) FROM channel_members WHERE channel_id = c.id) as member_count,
                    MAX(m.created_at) as last_activity
                FROM channels c
                LEFT JOIN messages m ON c.id = m.channel_id AND m.created_at >= %s
                WHERE c.community_id = %s
                GROUP BY c.id, c.name
                ORDER BY message_count DESC
                LIMIT 10
            """, (start_date, community_id))
            
            top_channels = [{
                'id': row['id'],
                'name': row['name'],
                'message_count': row['message_count'],
                'member_count': row['member_count'],
                'last_activity': row['last_activity'].isoformat() if row['last_activity'] else None
            } for row in cur.fetchall()]
            
            return jsonify({
                'success': True,
                'daily_engagement': daily_engagement,
                'hourly_distribution': hourly_distribution,
                'top_channels': top_channels
            }), 200
            
    except Exception as e:
        log.error(f"[ADMIN] Error getting engagement analytics: {e}")
        return jsonify({'error': 'Failed to fetch analytics'}), 500
    finally:
        if conn:
            conn.close()


@community_admin_bp.route('/community/<uuid:public_id>/analytics/mood', methods=['GET'])
@jwt_required()
@resolve_public_community_id
@require_community_owner
def get_mood_trends(community_id):
    """
    Get mood trends for a community using the same logic as the Mood Tracker Agent.
    
    This endpoint provides:
    - Daily sentiment timeline (positive/negative/neutral counts per day)
    - Overall sentiment distribution
    - Trend direction (improving/declining/stable)
    - Dominant mood
    - Mood categories breakdown (joy, sadness, anger, etc.)
    - Hourly mood patterns
    """
    conn = None
    try:
        days = min(request.args.get('days', 7, type=int), 30)
        conn = get_db_connection()
        
        with conn.cursor() as cur:
            start_date = datetime.now() - timedelta(days=days)
            
            # Get channels for this community
            cur.execute("SELECT id FROM channels WHERE community_id = %s", (community_id,))
            channels = [c['id'] for c in cur.fetchall()]
            
            # Get community members
            cur.execute("SELECT user_id FROM community_members WHERE community_id = %s", (community_id,))
            member_ids = [m['user_id'] for m in cur.fetchall()]
            
            if not channels and not member_ids:
                return jsonify({
                    'success': True,
                    'has_data': False,
                    'daily_trends': [],
                    'sentiment_distribution': {'positive': 0, 'neutral': 0, 'negative': 0},
                    'trend_direction': 'stable',
                    'dominant_mood': 'neutral',
                    'total_entries': 0
                }), 200
            
            # Get mood entries from user_moods table
            # Query by channel_id OR by user_id (for moods without channel_id)
            try:
                # Build query to get moods either by channel or by community member
                query_parts = []
                params = []
                
                if channels:
                    channel_placeholders = ','.join(['%s'] * len(channels))
                    query_parts.append(f"channel_id IN ({channel_placeholders})")
                    params.extend(channels)
                
                if member_ids:
                    member_placeholders = ','.join(['%s'] * len(member_ids))
                    query_parts.append(f"user_id IN ({member_placeholders})")
                    params.extend(member_ids)
                
                where_clause = ' OR '.join(query_parts)
                params.append(start_date)
                
                cur.execute(f"""
                    SELECT 
                        mood,
                        sentiment_score,
                        detected_emotions,
                        created_at,
                        DATE(created_at) as mood_date,
                        HOUR(created_at) as mood_hour
                    FROM user_moods
                    WHERE ({where_clause})
                    AND created_at >= %s
                    ORDER BY created_at ASC
                """, params)
                
                moods = cur.fetchall()
                
                if not moods:
                    return jsonify({
                        'success': True,
                        'has_data': False,
                        'daily_trends': [],
                        'sentiment_distribution': {'positive': 0, 'neutral': 0, 'negative': 0},
                        'trend_direction': 'stable',
                        'dominant_mood': 'neutral',
                        'total_entries': 0,
                        'message': 'No mood data for the selected period'
                    }), 200
                
                # Aggregate by day (same logic as mood tracker agent's get_mood_trends)
                daily_data = {}
                hourly_mood = {}
                mood_categories_total = {}
                
                for m in moods:
                    date_str = m['mood_date'].isoformat() if m['mood_date'] else 'unknown'
                    mood_type = m['mood'] or 'neutral'
                    
                    # Daily aggregation
                    if date_str not in daily_data:
                        daily_data[date_str] = {
                            'date': date_str,
                            'positive': 0,
                            'negative': 0,
                            'neutral': 0,
                            'total': 0,
                            'avg_score': 0,
                            'scores': []
                        }
                    
                    daily_data[date_str][mood_type] += 1
                    daily_data[date_str]['total'] += 1
                    if m['sentiment_score']:
                        daily_data[date_str]['scores'].append(float(m['sentiment_score']))
                    
                    # Hourly aggregation
                    hour_key = f"{m['mood_hour']:02d}:00"
                    if hour_key not in hourly_mood:
                        hourly_mood[hour_key] = []
                    hourly_mood[hour_key].append(mood_type)
                    
                    # Mood categories from detected_emotions JSON
                    if m['detected_emotions']:
                        try:
                            emotions = m['detected_emotions'] if isinstance(m['detected_emotions'], dict) else {}
                            for emotion, count in emotions.items():
                                mood_categories_total[emotion] = mood_categories_total.get(emotion, 0) + (count if isinstance(count, int) else 1)
                        except:
                            pass
                
                # Calculate daily averages and build timeline
                daily_trends = []
                for date_str, data in sorted(daily_data.items()):
                    if data['scores']:
                        data['avg_score'] = round(sum(data['scores']) / len(data['scores']), 2)
                    del data['scores']  # Remove raw scores from response
                    daily_trends.append(data)
                
                # Calculate overall statistics
                total_entries = len(moods)
                mood_counts = {'positive': 0, 'negative': 0, 'neutral': 0}
                for m in moods:
                    mood_type = m['mood'] or 'neutral'
                    if mood_type in mood_counts:
                        mood_counts[mood_type] += 1
                
                # Calculate sentiment percentages
                sentiment_percentages = {
                    'positive': round(mood_counts['positive'] / total_entries * 100, 1) if total_entries > 0 else 0,
                    'negative': round(mood_counts['negative'] / total_entries * 100, 1) if total_entries > 0 else 0,
                    'neutral': round(mood_counts['neutral'] / total_entries * 100, 1) if total_entries > 0 else 0
                }
                
                # Calculate trend direction (same logic as mood tracker agent)
                if len(daily_trends) >= 2:
                    recent_avg = daily_trends[-1]['avg_score'] if daily_trends[-1]['avg_score'] else 0
                    earlier_avg = daily_trends[0]['avg_score'] if daily_trends[0]['avg_score'] else 0
                    if recent_avg > earlier_avg + 0.1:
                        trend_direction = 'improving'
                    elif recent_avg < earlier_avg - 0.1:
                        trend_direction = 'declining'
                    else:
                        trend_direction = 'stable'
                else:
                    trend_direction = 'stable'
                
                # Determine dominant mood
                dominant_mood = max(mood_counts, key=mood_counts.get) if any(mood_counts.values()) else 'neutral'
                
                # Calculate hourly summary
                hourly_summary = []
                for hour in sorted(hourly_mood.keys()):
                    counts = {}
                    for mood in hourly_mood[hour]:
                        counts[mood] = counts.get(mood, 0) + 1
                    dominant = max(counts, key=counts.get) if counts else 'neutral'
                    hourly_summary.append({
                        'hour': hour,
                        'dominant_mood': dominant,
                        'message_count': len(hourly_mood[hour])
                    })
                
                # Get top 5 mood categories
                sorted_categories = sorted(mood_categories_total.items(), key=lambda x: x[1], reverse=True)[:5]
                mood_categories = dict(sorted_categories)
                
                return jsonify({
                    'success': True,
                    'has_data': True,
                    'period_days': days,
                    'total_entries': total_entries,
                    'daily_trends': daily_trends,
                    'sentiment_distribution': mood_counts,
                    'sentiment_percentages': sentiment_percentages,
                    'trend_direction': trend_direction,
                    'dominant_mood': dominant_mood,
                    'mood_categories': mood_categories,
                    'hourly_summary': hourly_summary
                }), 200
                
            except Exception as table_error:
                log.error(f"[ADMIN] Error querying user_moods table: {table_error}")
                # Table doesn't exist or different schema - return empty data
                return jsonify({
                    'success': True,
                    'has_data': False,
                    'daily_trends': [],
                    'sentiment_distribution': {'positive': 0, 'neutral': 0, 'negative': 0},
                    'trend_direction': 'stable',
                    'dominant_mood': 'neutral',
                    'total_entries': 0,
                    'message': 'Mood tracking table not available'
                }), 200
            
    except Exception as e:
        log.error(f"[ADMIN] Error getting mood trends: {e}")
        return jsonify({'error': 'Failed to fetch mood trends'}), 500
    finally:
        if conn:
            conn.close()


@community_admin_bp.route('/community/<uuid:public_id>/analytics/health', methods=['GET'])
@jwt_required()
@resolve_public_community_id
@require_community_owner  
def get_community_health(community_id):
    """
    Get community health metrics using the same logic as the Engagement Agent.
    
    Engagement Score Components (same as EngagementAgent._calculate_engagement_score):
    - Frequency Score (30%): Messages per hour normalized
    - Recency Score (30%): How recent was the last message
    - Participation Score (20%): Number of unique participants
    - Balance Score (20%): How evenly distributed messages are among users
    """
    conn = None
    try:
        days = min(request.args.get('days', 7, type=int), 30)
        conn = get_db_connection()
        
        with conn.cursor() as cur:
            # Get channels
            cur.execute("SELECT id FROM channels WHERE community_id = %s", (community_id,))
            channels = [c['id'] for c in cur.fetchall()]
            
            if not channels:
                return jsonify({
                    'success': True,
                    'health_score': 0,
                    'activity_trend': 'stable',
                    'metrics': {
                        'engagement_rate': 0,
                        'retention_rate': 0,
                        'growth_rate': 0
                    },
                    'tips': [{'type': 'warning', 'title': 'No Channels', 'message': 'Create channels to start tracking community health.'}]
                }), 200
            
            channel_placeholders = ','.join(['%s'] * len(channels))
            now = datetime.now()
            period_start = now - timedelta(days=days)
            prev_period_start = period_start - timedelta(days=days)
            time_period_hours = days * 24
            
            # ============ CURRENT PERIOD STATS ============
            cur.execute(f"""
                SELECT 
                    COUNT(*) as message_count,
                    COUNT(DISTINCT sender_id) as participant_count,
                    MAX(created_at) as last_message
                FROM messages
                WHERE channel_id IN ({channel_placeholders}) 
                AND created_at >= %s
                AND message_type = 'text'
            """, channels + [period_start])
            current_stats = cur.fetchone()
            
            current_messages = current_stats['message_count'] or 0
            participant_count = current_stats['participant_count'] or 0
            last_message_time = current_stats['last_message']
            
            # Calculate silence minutes
            if last_message_time:
                silence_minutes = (now - last_message_time).total_seconds() / 60
            else:
                silence_minutes = time_period_hours * 60  # Max silence
            
            # ============ MESSAGE DISTRIBUTION (for balance calculation) ============
            cur.execute(f"""
                SELECT sender_id, COUNT(*) as count
                FROM messages
                WHERE channel_id IN ({channel_placeholders}) 
                AND created_at >= %s
                AND message_type = 'text'
                GROUP BY sender_id
                ORDER BY count DESC
            """, channels + [period_start])
            user_distribution = cur.fetchall()
            
            # Calculate participation balance
            if user_distribution and participant_count > 0:
                max_messages = user_distribution[0]['count']
                avg_per_user = current_messages / participant_count
                participation_balance = avg_per_user / max_messages if max_messages > 0 else 0
            else:
                participation_balance = 0
            
            # ============ PREVIOUS PERIOD STATS ============
            cur.execute(f"""
                SELECT 
                    COUNT(*) as message_count,
                    COUNT(DISTINCT sender_id) as participant_count
                FROM messages
                WHERE channel_id IN ({channel_placeholders}) 
                AND created_at >= %s AND created_at < %s
                AND message_type = 'text'
            """, channels + [prev_period_start, period_start])
            prev_stats = cur.fetchone()
            
            prev_messages = prev_stats['message_count'] or 0
            prev_participant_count = prev_stats['participant_count'] or 0
            
            # ============ RETENTION: Users active in BOTH periods ============
            cur.execute(f"""
                SELECT COUNT(DISTINCT curr.sender_id) as count 
                FROM (
                    SELECT DISTINCT sender_id FROM messages
                    WHERE channel_id IN ({channel_placeholders}) 
                    AND created_at >= %s
                    AND message_type = 'text'
                ) curr
                INNER JOIN (
                    SELECT DISTINCT sender_id FROM messages
                    WHERE channel_id IN ({channel_placeholders}) 
                    AND created_at >= %s AND created_at < %s
                    AND message_type = 'text'
                ) prev ON curr.sender_id = prev.sender_id
            """, channels + [period_start] + channels + [prev_period_start, period_start])
            retained_users = cur.fetchone()['count'] or 0
            
            # Total members
            cur.execute("""
                SELECT COUNT(*) as count FROM community_members WHERE community_id = %s
            """, (community_id,))
            total_members = cur.fetchone()['count'] or 0
            
            # ============ CALCULATE ENGAGEMENT RATE (Same as Engagement Agent) ============
            # Formula mirrors EngagementAgent._calculate_engagement_score()
            
            # 1. Frequency Score: messages per hour, normalized to max 10 msg/hour = 100%
            msg_per_hour = current_messages / time_period_hours if time_period_hours > 0 else 0
            frequency_score = min(msg_per_hour / 10, 1.0) * 100
            
            # 2. Recency Score: how recent was the last message
            if silence_minutes < 60:           # < 1 hour
                recency_score = 100
            elif silence_minutes < 360:        # < 6 hours
                recency_score = 80
            elif silence_minutes < 1440:       # < 24 hours
                recency_score = 60
            elif silence_minutes < 4320:       # < 3 days
                recency_score = 40
            elif silence_minutes < 10080:      # < 7 days
                recency_score = 20
            else:
                recency_score = 5
            
            # 3. Participation Score: unique participants normalized (5+ users = 100%)
            participation_score = min(participant_count / 5, 1.0) * 100
            
            # 4. Balance Score: how evenly distributed messages are
            balance_score = participation_balance * 100
            
            # Combined Engagement Rate (weighted same as Engagement Agent)
            engagement_rate = (
                frequency_score * 0.30 +      # 30% weight
                recency_score * 0.30 +        # 30% weight  
                participation_score * 0.20 +  # 20% weight
                balance_score * 0.20          # 20% weight
            )
            engagement_rate = min(100, max(0, engagement_rate))
            
            # ============ CALCULATE RETENTION RATE ============
            # Retention = % of previously active users who came back this period
            # If no previous activity, we can't measure retention - use member engagement instead
            has_previous_data = prev_participant_count > 0
            
            if prev_participant_count > 0:
                # Normal case: calculate actual retention
                retention_rate = min(100.0, (retained_users / prev_participant_count) * 100)
            elif participant_count > 0 and total_members > 0:
                # No previous period data - estimate based on current engagement
                # How many of our members are currently active?
                retention_rate = min(100.0, (participant_count / total_members) * 100)
            else:
                retention_rate = 0
            
            # ============ CALCULATE GROWTH RATE ============
            # Growth = % change in message volume from previous period
            has_growth_baseline = prev_messages > 0
            
            if prev_messages > 0:
                # Normal case: compare to previous period
                growth_rate = ((current_messages - prev_messages) / prev_messages) * 100
                growth_rate = max(-100.0, min(500.0, growth_rate))
            elif current_messages > 0 and total_members > 0:
                # No previous messages - calculate based on expected activity
                # Expected: at least 1 message per member per period would be "baseline"
                expected_baseline = total_members * 1  # 1 msg per member
                if current_messages >= expected_baseline:
                    # Above baseline = positive growth (capped at 50% for new communities)
                    growth_rate = min(50.0, ((current_messages - expected_baseline) / max(expected_baseline, 1)) * 50)
                else:
                    # Below baseline = room to grow, show as small positive or 0
                    growth_rate = (current_messages / expected_baseline) * 20  # Scale to 0-20%
            else:
                growth_rate = 0
            
            # Determine activity trend
            if growth_rate > 10:
                activity_trend = 'up'
            elif growth_rate < -10:
                activity_trend = 'down'
            else:
                activity_trend = 'stable'
            
            # ============ CALCULATE HEALTH SCORE ============
            # Engagement (50%), Retention (30%), Growth (20%)
            normalized_growth = min(100, max(0, (growth_rate + 100) / 2))
            
            health_score = int(
                (engagement_rate * 0.50) +      # 50% weight - most important
                (retention_rate * 0.30) +        # 30% weight
                (normalized_growth * 0.20)       # 20% weight
            )
            health_score = max(0, min(100, health_score))
            
            # ============ GENERATE HEALTH TIPS ============
            tips = []
            
            # Indicate if metrics are estimated due to lack of historical data
            if not has_previous_data:
                tips.append({'type': 'info', 'title': 'Limited History', 'message': f'Retention is estimated from current activity. More accurate after {days}+ days of data.'})
            
            if not has_growth_baseline:
                tips.append({'type': 'info', 'title': 'New Community', 'message': 'Growth rate is estimated. Will be more accurate as activity history builds.'})
            
            if health_score >= 80:
                tips.append({'type': 'success', 'title': 'Community is Thriving!', 'message': 'Great job! Your community health score is strong. Keep up the good work!'})
            elif health_score >= 50:
                tips.append({'type': 'info', 'title': 'Room for Improvement', 'message': 'Your community is doing okay but there\'s room to grow engagement.'})
            else:
                tips.append({'type': 'warning', 'title': 'Needs Attention', 'message': 'Consider hosting events or discussions to boost engagement.'})
            
            if frequency_score < 30:
                tips.append({'type': 'tip', 'title': 'Boost Message Activity', 'message': f'Message frequency is low ({round(msg_per_hour, 1)} msgs/hour). Try starting more discussions.'})
            
            if recency_score < 40:
                tips.append({'type': 'tip', 'title': 'Revive Conversations', 'message': f'Last message was {int(silence_minutes / 60)} hours ago. Post something to re-engage members.'})
            
            if participation_score < 50:
                tips.append({'type': 'tip', 'title': 'Increase Participation', 'message': f'Only {participant_count} members are active. Encourage more people to join discussions.'})
            
            if balance_score < 30 and participant_count > 1:
                tips.append({'type': 'tip', 'title': 'Balance Conversations', 'message': 'A few users dominate the conversation. Encourage quieter members to participate.'})
            
            if retention_rate < 50 and has_previous_data:
                tips.append({'type': 'warning', 'title': 'Retention Issue', 'message': f'Only {round(retention_rate)}% of previously active members returned. Consider what keeps them engaged.'})
            
            if growth_rate < -20 and has_growth_baseline:
                tips.append({'type': 'warning', 'title': 'Declining Activity', 'message': f'Activity dropped {abs(round(growth_rate))}% from last period. Time to re-energize!'})
            
            return jsonify({
                'success': True,
                'health_score': health_score,
                'activity_trend': activity_trend,
                'metrics': {
                    'engagement_rate': round(engagement_rate, 1),
                    'retention_rate': round(retention_rate, 1),
                    'growth_rate': round(growth_rate, 1)
                },
                'metrics_reliability': {
                    'retention_estimated': not has_previous_data,
                    'growth_estimated': not has_growth_baseline,
                    'note': 'Metrics marked as estimated will become more accurate with more historical data'
                },
                'engagement_breakdown': {
                    'frequency_score': round(frequency_score, 1),
                    'recency_score': round(recency_score, 1),
                    'participation_score': round(participation_score, 1),
                    'balance_score': round(balance_score, 1)
                },
                'raw_data': {
                    'total_members': total_members,
                    'active_users': participant_count,
                    'prev_active_users': prev_participant_count,
                    'retained_users': retained_users,
                    'current_messages': current_messages,
                    'prev_messages': prev_messages,
                    'messages_per_hour': round(msg_per_hour, 2),
                    'silence_minutes': round(silence_minutes, 1),
                    'participation_balance': round(participation_balance, 2),
                    'period_days': days,
                    'has_previous_data': has_previous_data,
                    'has_growth_baseline': has_growth_baseline
                },
                'tips': tips
            }), 200
            
    except Exception as e:
        log.error(f"[ADMIN] Error getting community health: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to fetch health metrics'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# PER-COMMUNITY AGENT SETTINGS (§3.4)
# =====================================

@community_admin_bp.route('/community/<uuid:public_id>/agents', methods=['GET'])
@jwt_required()
@resolve_public_community_id
@require_community_owner
def list_community_agents(community_id):
    """
    List all community-category agents with this community's per-community
    enabled/settings state. If a row doesn't exist in community_agents, the
    agent is treated as enabled by default with no overrides.
    """
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Pull all platform-level community agents from the registry.
            cur.execute("""
                SELECT agent_type, display_name, description, icon, default_settings, is_active
                FROM agent_registry
                WHERE category = 'community' AND is_active = 1
                ORDER BY display_name
            """)
            registry = cur.fetchall()

            # Pull this community's overrides.
            cur.execute("""
                SELECT agent_type, enabled, settings, installed_at, last_active, usage_count
                FROM community_agents
                WHERE community_id = %s
            """, (community_id,))
            overrides_by_type = {r['agent_type']: r for r in cur.fetchall()}

            import json as _json
            agents = []
            for a in registry:
                ov = overrides_by_type.get(a['agent_type'])

                default_settings = a['default_settings']
                if isinstance(default_settings, str):
                    try:
                        default_settings = _json.loads(default_settings)
                    except Exception:
                        default_settings = None

                effective_settings = None
                if ov and ov['settings'] is not None:
                    effective_settings = ov['settings']
                    if isinstance(effective_settings, str):
                        try:
                            effective_settings = _json.loads(effective_settings)
                        except Exception:
                            effective_settings = None
                else:
                    effective_settings = default_settings

                agents.append({
                    'agent_type': a['agent_type'],
                    'display_name': a['display_name'],
                    'description': a['description'],
                    'icon': a['icon'],
                    'default_settings': default_settings,
                    'enabled': bool(ov['enabled']) if ov else True,
                    'has_override': ov is not None,
                    'settings': effective_settings,
                    'usage_count': (ov['usage_count'] if ov else 0),
                    'last_active': ov['last_active'].isoformat() if ov and ov['last_active'] else None,
                })

            return jsonify({'success': True, 'agents': agents}), 200
    except Exception as e:
        log.error(f"[ADMIN] Error listing community agents: {e}")
        return jsonify({'error': 'Failed to fetch community agents'}), 500
    finally:
        if conn:
            conn.close()


@community_admin_bp.route('/community/<uuid:public_id>/agents/<agent_type>', methods=['PUT'])
@jwt_required()
@resolve_public_community_id
@require_community_owner
def update_community_agent(community_id, agent_type):
    """
    Toggle and/or update settings for a per-community agent.
    Body (JSON): { enabled?: bool, settings?: object }
    """
    try:
        from services.community_agent_config import upsert as upsert_community_agent
    except Exception as e:
        return jsonify({'error': f'Agent config service unavailable: {e}'}), 500

    data = request.get_json() or {}
    enabled = data.get('enabled')
    settings = data.get('settings')

    if enabled is None and settings is None:
        return jsonify({'error': 'Provide enabled and/or settings'}), 400
    if enabled is not None and not isinstance(enabled, bool):
        return jsonify({'error': 'enabled must be a boolean'}), 400
    if settings is not None and not isinstance(settings, dict):
        return jsonify({'error': 'settings must be an object'}), 400

    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT agent_type FROM agent_registry WHERE agent_type = %s AND category = 'community' AND is_active = 1",
                (agent_type,),
            )
            if not cur.fetchone():
                return jsonify({'error': 'Unknown community agent type'}), 404

        config = upsert_community_agent(
            community_id=community_id,
            agent_type=agent_type,
            enabled=enabled,
            settings=settings,
            installed_by=request.admin_user_id,
        )

        log_admin_action(
            actor_user_id=request.admin_user_id,
            actor_role=actor_role_from_request(request),
            action='agent.community_toggle',
            target_type='agent',
            target_id=None,
            community_id=community_id,
            metadata={'agent_type': agent_type, 'enabled': enabled, 'settings': settings},
        )

        return jsonify({'success': True, 'config': config}), 200
    except Exception as e:
        log.error(f"[ADMIN] Error updating community agent: {e}")
        return jsonify({'error': 'Failed to update community agent'}), 500
    finally:
        if conn:
            conn.close()


# ------------------------------------------------------------
# §3.6 Announcements (stretch)
# ------------------------------------------------------------

@community_admin_bp.route('/community/<uuid:public_id>/announcements', methods=['GET'])
@jwt_required()
@resolve_public_community_id
@require_community_owner
def list_announcements(community_id):
    """List active announcements for a community."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT a.id, a.title, a.body, a.is_pinned, a.expires_at, a.created_at,
                       u.username as author_name
                FROM community_announcements a
                JOIN users u ON a.author_id = u.id
                WHERE a.community_id = %s AND a.is_active = 1
                  AND (a.expires_at IS NULL OR a.expires_at > NOW())
                ORDER BY a.is_pinned DESC, a.created_at DESC
                """,
                (community_id,)
            )
            rows = cur.fetchall()
        return jsonify({'announcements': rows}), 200
    except Exception as e:
        log.error(f"[ADMIN] Error listing announcements: {e}")
        return jsonify({'error': 'Failed to list announcements'}), 500
    finally:
        if conn:
            conn.close()


@community_admin_bp.route('/community/<uuid:public_id>/announcements', methods=['POST'])
@jwt_required()
@resolve_public_community_id
@require_community_owner
def create_announcement(community_id):
    """Create a new announcement."""
    data = request.get_json()
    title = data.get('title', '').strip()
    body = data.get('body', '').strip()
    is_pinned = bool(data.get('is_pinned', False))
    expires_at = data.get('expires_at')  # ISO string or null

    if not title or not body:
        return jsonify({'error': 'Title and body are required'}), 400

    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO community_announcements
                    (community_id, author_id, title, body, is_pinned, expires_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (community_id, request.admin_user_id, title, body,
                 1 if is_pinned else 0, expires_at)
            )
        conn.commit()

        log_admin_action(
            actor_user_id=request.admin_user_id,
            actor_role=actor_role_from_request(request),
            action='announcement.create',
            target_type='announcement',
            target_id=cur.lastrowid,
            community_id=community_id,
            metadata={'title': title[:50], 'is_pinned': is_pinned},
        )

        return jsonify({'success': True, 'id': cur.lastrowid}), 201
    except Exception as e:
        log.error(f"[ADMIN] Error creating announcement: {e}")
        return jsonify({'error': 'Failed to create announcement'}), 500
    finally:
        if conn:
            conn.close()


@community_admin_bp.route('/community/<uuid:public_id>/announcements/<int:announcement_id>', methods=['PUT'])
@jwt_required()
@resolve_public_community_id
@require_community_owner
def update_announcement(community_id, announcement_id):
    """Update an announcement."""
    data = request.get_json()
    title = data.get('title', '').strip()
    body = data.get('body', '').strip()
    is_pinned = data.get('is_pinned')
    is_active = data.get('is_active')
    expires_at = data.get('expires_at')

    conn = None
    try:
        conn = get_db_connection()
        # Build dynamic update
        updates = []
        params = []
        if title:
            updates.append("title = %s")
            params.append(title)
        if body:
            updates.append("body = %s")
            params.append(body)
        if is_pinned is not None:
            updates.append("is_pinned = %s")
            params.append(1 if is_pinned else 0)
        if is_active is not None:
            updates.append("is_active = %s")
            params.append(1 if is_active else 0)
        if expires_at is not None:
            updates.append("expires_at = %s")
            params.append(expires_at)

        if not updates:
            return jsonify({'error': 'No fields to update'}), 400

        params.extend([announcement_id, community_id])
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE community_announcements SET {', '.join(updates)} "
                "WHERE id = %s AND community_id = %s",
                params
            )
        conn.commit()

        log_admin_action(
            actor_user_id=request.admin_user_id,
            actor_role=actor_role_from_request(request),
            action='announcement.update',
            target_type='announcement',
            target_id=announcement_id,
            community_id=community_id,
            metadata={'fields': list(data.keys())},
        )

        return jsonify({'success': True}), 200
    except Exception as e:
        log.error(f"[ADMIN] Error updating announcement: {e}")
        return jsonify({'error': 'Failed to update announcement'}), 500
    finally:
        if conn:
            conn.close()


@community_admin_bp.route('/community/<uuid:public_id>/announcements/<int:announcement_id>', methods=['DELETE'])
@jwt_required()
@resolve_public_community_id
@require_community_owner
def delete_announcement(community_id, announcement_id):
    """Delete (deactivate) an announcement."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE community_announcements SET is_active = 0 "
                "WHERE id = %s AND community_id = %s",
                (announcement_id, community_id)
            )
        conn.commit()

        log_admin_action(
            actor_user_id=request.admin_user_id,
            actor_role=actor_role_from_request(request),
            action='announcement.delete',
            target_type='announcement',
            target_id=announcement_id,
            community_id=community_id,
        )

        return jsonify({'success': True}), 200
    except Exception as e:
        log.error(f"[ADMIN] Error deleting announcement: {e}")
        return jsonify({'error': 'Failed to delete announcement'}), 500
    finally:
        if conn:
            conn.close()


# ------------------------------------------------------------
# §3.6 Block Appeals (stretch)
# ------------------------------------------------------------

@community_admin_bp.route('/community/<uuid:public_id>/appeals', methods=['GET'])
@jwt_required()
@resolve_public_community_id
@require_community_owner
def list_appeals(community_id):
    """List block appeals for a community."""
    status = request.args.get('status', 'pending')
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # NOTE: `block_appeals.block_id` once referenced a `community_blocks`
            # table that no longer exists. Real blocks live in `blocked_users`,
            # keyed by (community_id, user_id). Join there instead so we can
            # still surface the block reason. LEFT JOIN because an appeal may
            # outlive its block (e.g. user already unblocked) and we still
            # want to show the appeal history.
            cur.execute(
                """
                SELECT a.id, a.user_id, a.message, a.status, a.admin_note,
                       a.created_at, a.reviewed_at,
                       u.username AS user_name,
                       b.reason AS block_reason
                FROM block_appeals a
                JOIN users u ON a.user_id = u.id
                LEFT JOIN blocked_users b
                       ON b.user_id = a.user_id
                      AND b.community_id = a.community_id
                WHERE a.community_id = %s AND a.status = %s
                ORDER BY a.created_at DESC
                """,
                (community_id, status)
            )
            rows = cur.fetchall()
        return jsonify({'appeals': rows}), 200
    except Exception as e:
        log.error(f"[ADMIN] Error listing appeals: {e}")
        return jsonify({'error': 'Failed to list appeals'}), 500
    finally:
        if conn:
            conn.close()


@community_admin_bp.route('/community/<uuid:public_id>/appeals/<int:appeal_id>', methods=['PUT'])
@jwt_required()
@resolve_public_community_id
@require_community_owner
def resolve_appeal(community_id, appeal_id):
    """Resolve a block appeal (approve or reject)."""
    data = request.get_json()
    action = data.get('action')  # 'approve' or 'reject'
    admin_note = data.get('note', '').strip()

    if action not in ('approve', 'reject'):
        return jsonify({'error': 'Invalid action'}), 400

    conn = None
    try:
        conn = get_db_connection()
        new_status = 'approved' if action == 'approve' else 'rejected'

        with conn.cursor() as cur:
            # Update appeal
            cur.execute(
                """
                UPDATE block_appeals
                SET status = %s, reviewed_by = %s, reviewed_at = NOW(), admin_note = %s
                WHERE id = %s AND community_id = %s
                """,
                (new_status, request.admin_user_id, admin_note, appeal_id, community_id)
            )

            # If approved, also unblock the user. The real block lives in
            # `blocked_users` keyed by (user_id, community_id) — `block_appeals.block_id`
            # used to reference the dropped `community_blocks` table, so resolve the
            # user via the appeal row itself.
            if action == 'approve':
                cur.execute(
                    "SELECT user_id FROM block_appeals WHERE id = %s AND community_id = %s",
                    (appeal_id, community_id)
                )
                appeal_row = cur.fetchone()
                if appeal_row:
                    cur.execute(
                        "DELETE FROM blocked_users WHERE user_id = %s AND community_id = %s",
                        (appeal_row['user_id'], community_id)
                    )

        conn.commit()

        log_admin_action(
            actor_user_id=request.admin_user_id,
            actor_role=actor_role_from_request(request),
            action=f'appeal.{action}',
            target_type='appeal',
            target_id=appeal_id,
            community_id=community_id,
            metadata={'admin_note': admin_note[:100]},
        )

        return jsonify({'success': True}), 200
    except Exception as e:
        log.error(f"[ADMIN] Error resolving appeal: {e}")
        return jsonify({'error': 'Failed to resolve appeal'}), 500
    finally:
        if conn:
            conn.close()


# User-facing: submit an appeal when blocked
@community_admin_bp.route('/community/<uuid:public_id>/appeal', methods=['POST'])
@jwt_required()
@resolve_public_community_id
def submit_appeal(community_id):
    """Submit an appeal for a user's block in this community."""
    # Any logged-in user in the community can appeal their block.
    # `get_jwt_identity()` returns the username in this codebase — convert
    # to user_id via the cached helper. Real blocks live in `blocked_users`
    # (the old `community_blocks` table was dropped); `block_appeals.block_id`
    # is NOT NULL but its FK is gone, so we fill it with the blocked_users
    # row id as an opaque reference for forward-compat.
    username = get_jwt_identity()
    data = request.get_json() or {}
    message = data.get('message', '').strip()

    if not message:
        return jsonify({'error': 'Appeal message is required'}), 400

    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if not user_id:
                return jsonify({'error': 'User not found'}), 404

            # Find the active block in blocked_users (community-scoped)
            cur.execute(
                """
                SELECT id FROM blocked_users
                WHERE community_id = %s AND user_id = %s
                """,
                (community_id, user_id)
            )
            block = cur.fetchone()
            if not block:
                return jsonify({'error': 'No active block found'}), 404

            # Check no pending appeal already for this user+community
            cur.execute(
                """
                SELECT id FROM block_appeals
                WHERE community_id = %s AND user_id = %s AND status = 'pending'
                """,
                (community_id, user_id)
            )
            if cur.fetchone():
                return jsonify({'error': 'Appeal already pending'}), 409

            cur.execute(
                """
                INSERT INTO block_appeals (community_id, block_id, user_id, message)
                VALUES (%s, %s, %s, %s)
                """,
                (community_id, block['id'], user_id, message)
            )
            appeal_id = cur.lastrowid
        conn.commit()
        return jsonify({'success': True, 'appeal_id': appeal_id}), 201
    except Exception as e:
        log.error(f"[APPEAL] Error submitting appeal: {e}")
        return jsonify({'error': 'Failed to submit appeal'}), 500
    finally:
        if conn:
            conn.close()
