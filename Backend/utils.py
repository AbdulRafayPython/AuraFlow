# utils.py - Helper functions for AuraFlow backend

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