# routes/search.py — Production-grade message search with FULLTEXT + pagination
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import get_db_connection
from utils import get_avatar_url
import logging

log = logging.getLogger(__name__)

search_bp = Blueprint('search', __name__, url_prefix='/api/search')


@search_bp.route('/messages', methods=['GET'])
@jwt_required()
def search_messages():
    """
    Global message search across channels the user has access to.
    Supports: FULLTEXT search, channel/community scoping, pagination.
    
    Query params:
      q           — search query (required, min 2 chars)
      community_id — restrict to a specific community (optional)
      channel_id   — restrict to a specific channel (optional)
      scope        — 'channels' | 'dms' | 'all' (default: 'all')
      limit        — results per page (default: 20, max: 50)
      offset       — pagination offset (default: 0)
    """
    conn = None
    try:
        query = request.args.get('q', '').strip()
        if len(query) < 2:
            return jsonify({'error': 'Search query must be at least 2 characters'}), 400

        community_id = request.args.get('community_id', type=int)
        channel_id = request.args.get('channel_id', type=int)
        scope = request.args.get('scope', 'all')
        limit = min(request.args.get('limit', 20, type=int), 50)
        offset = max(request.args.get('offset', 0, type=int), 0)

        username = get_jwt_identity()
        conn = get_db_connection()

        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404
            user_id = user['id']

            results = []
            total_count = 0

            # --- Search channel messages ---
            if scope in ('channels', 'all'):
                channel_results, channel_total = _search_channel_messages(
                    cur, user_id, query, community_id, channel_id, limit, offset
                )
                results.extend(channel_results)
                total_count += channel_total

            # --- Search direct messages ---
            if scope in ('dms', 'all'):
                dm_results, dm_total = _search_direct_messages(
                    cur, user_id, query, limit, offset
                )
                results.extend(dm_results)
                total_count += dm_total

            # Sort combined results by relevance (score desc), then by date desc
            results.sort(key=lambda r: (-r.get('relevance', 0), r['created_at']), reverse=False)
            results.sort(key=lambda r: -r.get('relevance', 0))

            return jsonify({
                'results': results[:limit],
                'total': total_count,
                'query': query,
                'limit': limit,
                'offset': offset,
                'has_more': total_count > offset + limit,
            }), 200

    except Exception as e:
        log.error(f"[SEARCH] Error: {e}", exc_info=True)
        return jsonify({'error': 'Search failed'}), 500
    finally:
        if conn:
            conn.close()


def _search_channel_messages(cur, user_id, query, community_id, channel_id, limit, offset):
    """Search channel messages using MySQL FULLTEXT with access control."""
    
    # Build WHERE clauses dynamically
    where_clauses = ["MATCH(m.content) AGAINST(%s IN BOOLEAN MODE)"]
    params = [f'{query}*']  # Prefix search for partial matches

    # User must be member of the channel
    join_clause = "JOIN channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = %s"
    params.append(user_id)

    if channel_id:
        where_clauses.append("m.channel_id = %s")
        params.append(channel_id)

    if community_id:
        where_clauses.append("ch.community_id = %s")
        params.append(community_id)

    where_sql = " AND ".join(where_clauses)

    # Count total matches
    count_sql = f"""
        SELECT COUNT(*) as total
        FROM messages m
        {join_clause}
        JOIN channels ch ON m.channel_id = ch.id
        WHERE {where_sql}
    """
    cur.execute(count_sql, params)
    total = cur.fetchone()['total']

    # Fetch results with relevance score
    search_params = params + [query + '*', limit, offset]
    results_sql = f"""
        SELECT 
            m.id, m.channel_id, m.sender_id, m.content, m.message_type, 
            m.created_at, m.is_pinned,
            u.username AS author, u.display_name, u.avatar_url,
            ch.name AS channel_name, ch.community_id,
            c.name AS community_name,
            MATCH(m.content) AGAINST(%s IN BOOLEAN MODE) AS relevance
        FROM messages m
        {join_clause}
        JOIN users u ON m.sender_id = u.id
        JOIN channels ch ON m.channel_id = ch.id
        LEFT JOIN communities c ON ch.community_id = c.id
        WHERE {where_sql}
        ORDER BY relevance DESC, m.created_at DESC
        LIMIT %s OFFSET %s
    """
    cur.execute(results_sql, search_params)

    results = []
    for row in cur.fetchall():
        results.append({
            'id': row['id'],
            'type': 'channel',
            'channel_id': row['channel_id'],
            'channel_name': row['channel_name'],
            'community_id': row['community_id'],
            'community_name': row['community_name'],
            'sender_id': row['sender_id'],
            'content': row['content'],
            'message_type': row['message_type'],
            'created_at': row['created_at'].isoformat() if row['created_at'] else None,
            'is_pinned': bool(row.get('is_pinned')),
            'author': row['author'],
            'display_name': row['display_name'] or row['author'],
            'avatar_url': get_avatar_url(row['author'], row['avatar_url']),
            'relevance': float(row.get('relevance', 0)),
        })

    return results, total


def _search_direct_messages(cur, user_id, query, limit, offset):
    """Search direct messages using MySQL FULLTEXT."""

    # Count
    cur.execute("""
        SELECT COUNT(*) as total
        FROM direct_messages dm
        WHERE (dm.sender_id = %s OR dm.receiver_id = %s)
          AND MATCH(dm.content) AGAINST(%s IN BOOLEAN MODE)
    """, (user_id, user_id, f'{query}*'))
    total = cur.fetchone()['total']

    # Results
    cur.execute("""
        SELECT 
            dm.id, dm.sender_id, dm.receiver_id, dm.content, dm.message_type,
            dm.created_at,
            s.username AS sender_username, s.display_name AS sender_display_name, s.avatar_url AS sender_avatar,
            r.username AS receiver_username, r.display_name AS receiver_display_name, r.avatar_url AS receiver_avatar,
            MATCH(dm.content) AGAINST(%s IN BOOLEAN MODE) AS relevance
        FROM direct_messages dm
        JOIN users s ON dm.sender_id = s.id
        JOIN users r ON dm.receiver_id = r.id
        WHERE (dm.sender_id = %s OR dm.receiver_id = %s)
          AND MATCH(dm.content) AGAINST(%s IN BOOLEAN MODE)
        ORDER BY relevance DESC, dm.created_at DESC
        LIMIT %s OFFSET %s
    """, (f'{query}*', user_id, user_id, f'{query}*', limit, offset))

    results = []
    for row in cur.fetchall():
        # Determine the "other" user in the conversation
        if row['sender_id'] == user_id:
            other_username = row['receiver_username']
            other_display = row['receiver_display_name'] or row['receiver_username']
            other_avatar = row['receiver_avatar']
            other_id = row['receiver_id']
        else:
            other_username = row['sender_username']
            other_display = row['sender_display_name'] or row['sender_username']
            other_avatar = row['sender_avatar']
            other_id = row['sender_id']

        results.append({
            'id': row['id'],
            'type': 'dm',
            'sender_id': row['sender_id'],
            'receiver_id': row['receiver_id'],
            'content': row['content'],
            'message_type': row['message_type'],
            'created_at': row['created_at'].isoformat() if row['created_at'] else None,
            'author': row['sender_username'],
            'display_name': row['sender_display_name'] or row['sender_username'],
            'avatar_url': get_avatar_url(row['sender_username'], row['sender_avatar']),
            'conversation_with': {
                'id': other_id,
                'username': other_username,
                'display_name': other_display,
                'avatar_url': get_avatar_url(other_username, other_avatar),
            },
            'relevance': float(row.get('relevance', 0)),
        })

    return results, total


@search_bp.route('/messages/context/<int:message_id>', methods=['GET'])
@jwt_required()
def get_message_context(message_id):
    """
    Get surrounding messages for context when jumping to a search result.
    Returns 5 messages before and 5 after the target message.
    """
    conn = None
    try:
        username = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            user = cur.fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 404

            # Get target message
            cur.execute("SELECT id, channel_id, created_at FROM messages WHERE id = %s", (message_id,))
            target = cur.fetchone()
            if not target:
                return jsonify({'error': 'Message not found'}), 404

            # Verify access
            cur.execute(
                "SELECT 1 FROM channel_members WHERE channel_id = %s AND user_id = %s",
                (target['channel_id'], user['id'])
            )
            if not cur.fetchone():
                return jsonify({'error': 'Access denied'}), 403

            # Get surrounding messages
            cur.execute("""
                (SELECT m.id, m.sender_id, m.content, m.message_type, m.created_at,
                        u.username AS author, u.display_name, u.avatar_url
                 FROM messages m JOIN users u ON m.sender_id = u.id
                 WHERE m.channel_id = %s AND m.created_at <= %s
                 ORDER BY m.created_at DESC LIMIT 6)
                UNION ALL
                (SELECT m.id, m.sender_id, m.content, m.message_type, m.created_at,
                        u.username AS author, u.display_name, u.avatar_url
                 FROM messages m JOIN users u ON m.sender_id = u.id
                 WHERE m.channel_id = %s AND m.created_at > %s
                 ORDER BY m.created_at ASC LIMIT 5)
                ORDER BY created_at ASC
            """, (target['channel_id'], target['created_at'],
                  target['channel_id'], target['created_at']))

            context_messages = [{
                'id': m['id'],
                'sender_id': m['sender_id'],
                'content': m['content'],
                'message_type': m['message_type'],
                'created_at': m['created_at'].isoformat() if m['created_at'] else None,
                'author': m['author'],
                'display_name': m['display_name'] or m['author'],
                'avatar_url': get_avatar_url(m['author'], m['avatar_url']),
                'is_target': m['id'] == message_id,
            } for m in cur.fetchall()]

            return jsonify({
                'target_id': message_id,
                'channel_id': target['channel_id'],
                'messages': context_messages,
            }), 200

    except Exception as e:
        log.error(f"[SEARCH] Context error: {e}", exc_info=True)
        return jsonify({'error': 'Failed to load context'}), 500
    finally:
        if conn:
            conn.close()
