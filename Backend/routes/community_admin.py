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
from datetime import datetime, timedelta
from functools import wraps
import logging

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
                cur.execute("SELECT id FROM users WHERE username = %s", (username,))
                user = cur.fetchone()
                if not user:
                    return jsonify({'error': 'User not found'}), 404
                
                # Check if user is owner or admin of this specific community
                cur.execute("""
                    SELECT role FROM community_members 
                    WHERE user_id = %s AND community_id = %s AND role IN ('owner', 'admin')
                """, (user['id'], community_id))
                
                membership = cur.fetchone()
                if not membership:
                    return jsonify({'error': 'Admin access required for this community'}), 403
                
                # Attach user info to request
                request.admin_user_id = user['id']
                request.admin_username = username
                request.admin_role = membership['role']
                
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
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404
            
            cur.execute("""
                SELECT 
                    c.id, c.name, c.icon, c.color, c.logo_url, c.description,
                    cm.role,
                    (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count,
                    (SELECT COUNT(*) FROM channels WHERE community_id = c.id) as channel_count
                FROM communities c
                INNER JOIN community_members cm ON c.id = cm.community_id
                WHERE cm.user_id = %s AND cm.role IN ('owner', 'admin')
                ORDER BY c.name
            """, (user['id'],))
            
            communities = cur.fetchall()
            
            result = [{
                'id': c['id'],
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

@community_admin_bp.route('/community/<int:community_id>/overview', methods=['GET'])
@jwt_required()
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
            cur.execute(f"""
                SELECT COUNT(*) as count FROM ai_agent_logs l
                JOIN ai_agents a ON l.agent_id = a.id
                WHERE a.type = 'moderator'
                AND l.channel_id IN ({channel_placeholders})
                AND l.created_at >= %s
                AND l.output_text NOT LIKE '%%"action": "allow"%%'
                AND l.output_text NOT LIKE '%%"action":"allow"%%'
            """, channels + [today_start])
            flagged_today = cur.fetchone()['count']
            
            # Blocked users
            cur.execute("""
                SELECT COUNT(*) as count FROM blocked_users WHERE community_id = %s
            """, (community_id,))
            blocked_users = cur.fetchone()['count']
            
            # High severity violations from ai_agent_logs
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
            """, channels + [week_ago])
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

@community_admin_bp.route('/community/<int:community_id>/alerts', methods=['GET'])
@jwt_required()
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
                    ml.id, ml.user_id, ml.channel_id, ml.message_text,
                    ml.flag_type, ml.severity, ml.confidence, ml.action_taken,
                    ml.reason, ml.created_at,
                    u.username, u.avatar_url,
                    ch.name as channel_name
                FROM moderation_logs ml
                JOIN users u ON ml.user_id = u.id
                JOIN channels ch ON ml.channel_id = ch.id
                WHERE ch.community_id = %s
                AND ml.severity IN ('medium', 'high', 'critical')
                ORDER BY ml.created_at DESC
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

@community_admin_bp.route('/community/<int:community_id>/members', methods=['GET'])
@jwt_required()
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
                    cm.role, cm.joined_at,
                    (SELECT COUNT(*) FROM messages WHERE sender_id = u.id 
                     {f'AND channel_id IN ({channel_placeholders})' if channels else 'AND 1=0'}) as message_count,
                    (SELECT COUNT(*) FROM moderation_logs WHERE user_id = u.id 
                     {f'AND channel_id IN ({channel_placeholders})' if channels else 'AND 1=0'}
                     AND action_taken != 'none') as violation_count
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


@community_admin_bp.route('/community/<int:community_id>/members/<int:user_id>', methods=['GET'])
@jwt_required()
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
                    cm.role, cm.joined_at,
                    (SELECT COUNT(*) FROM messages WHERE sender_id = u.id 
                     {f'AND channel_id IN ({channel_placeholders})' if channels else 'AND 1=0'}) as message_count,
                    (SELECT COUNT(*) FROM moderation_logs WHERE user_id = u.id 
                     {f'AND channel_id IN ({channel_placeholders})' if channels else 'AND 1=0'}
                     AND action_taken != 'none') as violation_count
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


@community_admin_bp.route('/community/<int:community_id>/members/<int:user_id>/role', methods=['PUT'])
@jwt_required()
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
        return jsonify({'success': True, 'message': 'Role updated'}), 200
        
    except Exception as e:
        log.error(f"[ADMIN] Error updating member role: {e}")
        return jsonify({'error': 'Failed to update role'}), 500
    finally:
        if conn:
            conn.close()


@community_admin_bp.route('/community/<int:community_id>/members/<int:user_id>', methods=['DELETE'])
@jwt_required()
@require_community_owner
def remove_member(community_id, user_id):
    """Remove a member from the community."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Check if target user exists
            cur.execute("""
                SELECT role FROM community_members 
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            
            member = cur.fetchone()
            if not member:
                return jsonify({'error': 'Member not found'}), 404
            
            if member['role'] == 'owner':
                return jsonify({'error': 'Cannot remove owner'}), 403
            
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
        return jsonify({'success': True, 'message': 'Member removed'}), 200
        
    except Exception as e:
        log.error(f"[ADMIN] Error removing member: {e}")
        return jsonify({'error': 'Failed to remove member'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# MODERATION (Community Scoped)
# =====================================

@community_admin_bp.route('/community/<int:community_id>/moderation/flagged', methods=['GET'])
@jwt_required()
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


@community_admin_bp.route('/community/<int:community_id>/moderation/blocked', methods=['GET'])
@jwt_required()
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


@community_admin_bp.route('/community/<int:community_id>/moderation/unblock/<int:user_id>', methods=['DELETE'])
@jwt_required()
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
        return jsonify({'success': True, 'message': 'User unblocked'}), 200
        
    except Exception as e:
        log.error(f"[ADMIN] Error unblocking user: {e}")
        return jsonify({'error': 'Failed to unblock user'}), 500
    finally:
        if conn:
            conn.close()


@community_admin_bp.route('/community/<int:community_id>/moderation/block', methods=['POST'])
@jwt_required()
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
        with conn.cursor() as cur:
            # Check if user is a member
            cur.execute("""
                SELECT role FROM community_members 
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            
            member = cur.fetchone()
            if not member:
                return jsonify({'error': 'User is not a member'}), 404
            
            if member['role'] == 'owner':
                return jsonify({'error': 'Cannot block owner'}), 403
            
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

@community_admin_bp.route('/community/<int:community_id>/analytics/engagement', methods=['GET'])
@jwt_required()
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


@community_admin_bp.route('/community/<int:community_id>/analytics/mood', methods=['GET'])
@jwt_required()
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


@community_admin_bp.route('/community/<int:community_id>/analytics/health', methods=['GET'])
@jwt_required()
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
