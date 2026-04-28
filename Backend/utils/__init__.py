"""
Utils Package
=============
Utility functions and helpers
"""
from services.redis_client import cache_get, cache_set, cache_delete

_USER_ID_TTL = 3600  # 1 hour — user IDs are immutable


def get_user_id(username, cur=None):
    """
    Return the integer user ID for a username.
    FIX 1: Cached in Redis for 1 hour to eliminate repeated DB lookups on every
    authenticated request. cur is optional; if omitted, opens its own DB connection.
    Falls back to a DB query when Redis is unavailable or cache is cold.
    """
    cache_key = f"user:id:{username}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    if cur is not None:
        # Use the caller's open cursor — no extra connection needed
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        row = cur.fetchone()
    else:
        # No cursor provided — open a short-lived connection just for this lookup
        from database import get_db_connection
        conn = get_db_connection()
        try:
            with conn.cursor() as _cur:
                _cur.execute("SELECT id FROM users WHERE username = %s", (username,))
                row = _cur.fetchone()
        finally:
            conn.close()

    if row is None:
        return None
    user_id = row['id']
    cache_set(cache_key, user_id, ttl=_USER_ID_TTL)
    return user_id


def invalidate_user_id_cache(username):
    """
    Invalidate the cached user ID for a username.
    Call on password change, account deactivation, or any identity change.
    """
    cache_delete(f"user:id:{username}")


def get_avatar_url(username, custom_url=None):
    """
    Generate a working avatar URL for a user.
    
    Args:
        username: User's username
        custom_url: Custom avatar URL from database (if exists)
    
    Returns:
        Valid avatar URL string
    """
    # If custom URL exists and is valid, use it
    if custom_url and custom_url.strip() and custom_url != 'https://api.dicebear.com/7.x/avataaars/svg?seed=%s':
        return custom_url
    
    # Otherwise generate default avatar based on username
    return f"https://api.dicebear.com/7.x/avataaars/svg?seed={username}"


def format_user_data(user_row):
    """
    Format user data with proper avatar URL fallback.
    Use this helper when returning user data from any endpoint.
    
    Args:
        user_row: Dictionary/row from database query
    
    Returns:
        Formatted user dictionary
    """
    username = user_row.get('username')
    avatar = user_row.get('avatar_url')
    
    return {
        'id': user_row.get('id'),
        'username': username,
        'email': user_row.get('email'),
        'display_name': user_row.get('display_name') or username,
        'avatar_url': get_avatar_url(username, avatar),
        'status': user_row.get('status', 'offline'),
        'custom_status': user_row.get('custom_status'),
        'bio': user_row.get('bio'),
        'last_seen': user_row.get('last_seen').isoformat() if user_row.get('last_seen') else None
    }

__all__ = ['get_avatar_url', 'format_user_data', 'get_user_id', 'invalidate_user_id_cache']

