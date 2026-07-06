"""
Utils Package
=============
Utility functions and helpers
"""
from functools import wraps
from flask import jsonify
from services.redis_client import (
    cache_get, cache_set, cache_delete,
    get_community_id_by_public_id, set_community_id_by_public_id,
    get_community_public_id, set_community_public_id,
    get_user_id_by_public_id, set_user_id_by_public_id,
    get_user_public_id, set_user_public_id,
)

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

def get_community_id_from_public_id(public_id):
    """
    Resolve a community's opaque external `public_id` (UUID) to its internal
    int id. Cached (long TTL — the mapping is immutable). Returns None if no
    community has that public_id.
    """
    pid = str(public_id)
    community_id = get_community_id_by_public_id(pid)
    if community_id is not None:
        return community_id

    from database import get_db_connection
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM communities WHERE public_id = %s", (pid,))
            row = cur.fetchone()
    finally:
        conn.close()
    if not row:
        return None
    community_id = row['id']
    set_community_id_by_public_id(pid, community_id)
    return community_id


def get_community_public_id_for(community_id):
    """
    Reverse of get_community_id_from_public_id: resolve an internal int
    community id to its external public_id (UUID). Cached. Returns None if
    the community doesn't exist.
    """
    cached = get_community_public_id(community_id)
    if cached is not None:
        return cached

    from database import get_db_connection
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT public_id FROM communities WHERE id = %s", (community_id,))
            row = cur.fetchone()
    finally:
        conn.close()
    if not row:
        return None
    public_id = row['public_id']
    set_community_public_id(community_id, public_id)
    return public_id


def resolve_public_community_id(f):
    """
    Route decorator: the URL carries a community's opaque `public_id` (UUID);
    this resolves it to the internal int `community_id` and calls the wrapped
    view with that instead. Every downstream handler/decorator (e.g.
    require_community_owner) keeps working with `community_id: int` unchanged.
    Must be applied closer to the route than any decorator expecting an int
    community_id (e.g. directly after @jwt_required()).
    """
    @wraps(f)
    def decorated_function(public_id, *args, **kwargs):
        community_id = get_community_id_from_public_id(public_id)
        if community_id is None:
            return jsonify({'error': 'Community not found'}), 404
        # Pass as a keyword, not positional — some downstream decorators (e.g.
        # admin.py's require_community_admin) read it via kwargs.get('community_id')
        # instead of taking it as a named parameter.
        return f(*args, community_id=community_id, **kwargs)
    return decorated_function


def get_user_id_from_public_id(public_id):
    """
    Resolve a user's opaque external `public_id` (UUID) to its internal
    int id. Cached (long TTL — the mapping is immutable). Returns None if no
    user has that public_id.
    """
    pid = str(public_id)
    user_id = get_user_id_by_public_id(pid)
    if user_id is not None:
        return user_id

    from database import get_db_connection
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE public_id = %s", (pid,))
            row = cur.fetchone()
    finally:
        conn.close()
    if not row:
        return None
    user_id = row['id']
    set_user_id_by_public_id(pid, user_id)
    return user_id


def get_user_public_id_for(user_id):
    """
    Reverse of get_user_id_from_public_id: resolve an internal int user id
    to its external public_id (UUID). Cached. Returns None if the user
    doesn't exist.
    """
    cached = get_user_public_id(user_id)
    if cached is not None:
        return cached

    from database import get_db_connection
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT public_id FROM users WHERE id = %s", (user_id,))
            row = cur.fetchone()
    finally:
        conn.close()
    if not row:
        return None
    public_id = row['public_id']
    set_user_public_id(user_id, public_id)
    return public_id


__all__ = [
    'get_avatar_url', 'format_user_data', 'get_user_id', 'invalidate_user_id_cache',
    'resolve_public_community_id', 'get_community_id_from_public_id',
    'get_community_public_id_for',
    'get_user_id_from_public_id', 'get_user_public_id_for',
]

