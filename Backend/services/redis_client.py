"""
AuraFlow Redis Client
======================
Redis wrapper for caching agent settings, rate limiting, and general cache.

Features:
    - Agent settings cache (5 min TTL)
    - Installed agents cache per community
    - Personal agents cache per user
    - Rate limiting helpers
    - Graceful fallback when Redis is unavailable
"""

import json
import os
from functools import wraps
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')

# ── Redis Connection ─────────────────────────────────────────────────
_redis_client = None
_redis_available = False


def get_redis():
    """Get or create Redis connection. Returns None if Redis is unavailable."""
    global _redis_client, _redis_available
    
    if _redis_client is not None:
        return _redis_client if _redis_available else None
    
    try:
        import redis
        _redis_client = redis.from_url(
            REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=3,
            socket_timeout=3,
            retry_on_timeout=True,
        )
        # Test connection
        _redis_client.ping()
        _redis_available = True
        print(f"[REDIS] Connected to {REDIS_URL}")
        return _redis_client
    except Exception as e:
        print(f"[REDIS] Not available ({e}). Running without cache.")
        _redis_available = False
        _redis_client = True  # Sentinel to avoid retrying
        return None


# ── Generic Cache Operations ─────────────────────────────────────────

def cache_get(key):
    """Get a value from Redis cache. Returns None if not found or Redis unavailable."""
    r = get_redis()
    if r is None:
        return None
    try:
        val = r.get(key)
        if val:
            return json.loads(val)
        return None
    except Exception:
        return None


def cache_set(key, value, ttl=300):
    """Set a value in Redis cache with TTL (default 5 minutes)."""
    r = get_redis()
    if r is None:
        return False
    try:
        r.setex(key, ttl, json.dumps(value, default=str))
        return True
    except Exception:
        return False


def cache_delete(key):
    """Delete a key from Redis cache."""
    r = get_redis()
    if r is None:
        return False
    try:
        r.delete(key)
        return True
    except Exception:
        return False


def cache_delete_pattern(pattern):
    """Delete all keys matching a pattern (e.g., 'agent:settings:5:*')."""
    r = get_redis()
    if r is None:
        return False
    try:
        keys = r.keys(pattern)
        if keys:
            r.delete(*keys)
        return True
    except Exception:
        return False


# ── Agent Settings Cache ─────────────────────────────────────────────

def get_agent_settings(community_id, agent_type):
    """Get cached agent settings for a community."""
    key = f"agent:settings:{community_id}:{agent_type}"
    return cache_get(key)


def set_agent_settings(community_id, agent_type, settings):
    """Cache agent settings (5 min TTL)."""
    key = f"agent:settings:{community_id}:{agent_type}"
    return cache_set(key, settings, ttl=300)


def invalidate_agent_settings(community_id, agent_type=None):
    """Invalidate cached agent settings."""
    if agent_type:
        cache_delete(f"agent:settings:{community_id}:{agent_type}")
    else:
        cache_delete_pattern(f"agent:settings:{community_id}:*")


# ── Installed Agents Cache ───────────────────────────────────────────

def get_installed_agents(community_id):
    """Get cached list of installed agents for a community."""
    key = f"agent:installed:{community_id}"
    return cache_get(key)


def set_installed_agents(community_id, agents):
    """Cache installed agents list (5 min TTL)."""
    key = f"agent:installed:{community_id}"
    return cache_set(key, agents, ttl=300)


def invalidate_installed_agents(community_id):
    """Invalidate installed agents cache."""
    cache_delete(f"agent:installed:{community_id}")


# ── Personal Agents Cache ────────────────────────────────────────────

def get_personal_agents(user_id):
    """Get cached personal agents for a user."""
    key = f"agent:personal:{user_id}"
    return cache_get(key)


def set_personal_agents(user_id, agents):
    """Cache personal agents (10 min TTL)."""
    key = f"agent:personal:{user_id}"
    return cache_set(key, agents, ttl=600)


def invalidate_personal_agents(user_id):
    """Invalidate personal agents cache."""
    cache_delete(f"agent:personal:{user_id}")


# ── Rate Limiting ────────────────────────────────────────────────────

def check_rate_limit(agent_type, entity_id, max_requests=30, window_seconds=60):
    """
    Check if rate limit is exceeded for an agent action.
    
    Returns:
        tuple: (allowed: bool, remaining: int, reset_in: int)
    """
    r = get_redis()
    if r is None:
        return (True, max_requests, 0)  # No Redis = no rate limiting
    
    key = f"agent:rate:{agent_type}:{entity_id}"
    try:
        pipe = r.pipeline()
        pipe.incr(key)
        pipe.ttl(key)
        results = pipe.execute()
        
        current = results[0]
        ttl = results[1]
        
        # Set expiry if this is the first request in the window
        if ttl == -1:
            r.expire(key, window_seconds)
            ttl = window_seconds
        
        allowed = current <= max_requests
        remaining = max(0, max_requests - current)
        
        return (allowed, remaining, max(0, ttl))
    except Exception:
        return (True, max_requests, 0)


# ── Health Check ─────────────────────────────────────────────────────

def redis_health():
    """Check Redis health status."""
    r = get_redis()
    if r is None:
        return {'status': 'unavailable', 'message': 'Redis not connected'}
    try:
        info = r.info('server')
        return {
            'status': 'healthy',
            'version': info.get('redis_version', 'unknown'),
            'uptime_seconds': info.get('uptime_in_seconds', 0),
            'connected_clients': r.info('clients').get('connected_clients', 0),
        }
    except Exception as e:
        return {'status': 'error', 'message': str(e)}


# ── Channel Membership Cache ─────────────────────────────────────────
# FIX 9: Cache "SELECT 1 FROM channel_members WHERE channel_id=? AND user_id=?"
# Avoids 51+ repeated membership checks per diagnostic window.
# TTL=120s — short enough to reflect join/leave within 2 minutes.

def get_channel_membership(channel_id, user_id):
    """Return cached membership bool, or None if not in cache."""
    return cache_get(f"channel_member:{channel_id}:{user_id}")


def set_channel_membership(channel_id, user_id, is_member):
    """Cache channel membership result (TTL=120s)."""
    cache_set(f"channel_member:{channel_id}:{user_id}", is_member, ttl=120)


def invalidate_channel_membership(channel_id, user_id):
    """Invalidate channel membership cache entry (call on join/leave)."""
    cache_delete(f"channel_member:{channel_id}:{user_id}")


# ── Community Member Role Cache ───────────────────────────────────────
# FIX 6: Cache "SELECT 1 FROM community_members WHERE user_id=? AND role=? LIMIT 1"
# Avoids 48+ role-check queries per diagnostic window.
# TTL=300s — acceptable staleness for a role promotion/demotion.

def get_member_role(community_id, user_id):
    """Return cached role string or None if not in cache."""
    return cache_get(f"member_role:{community_id}:{user_id}")


def set_member_role(community_id, user_id, role):
    """Cache community member role (TTL=300s)."""
    cache_set(f"member_role:{community_id}:{user_id}", role, ttl=300)


def invalidate_member_role(community_id, user_id):
    """Invalidate role cache (call on role change, kick, or leave)."""
    cache_delete(f"member_role:{community_id}:{user_id}")


# ── Community public_id <-> internal id Cache ─────────────────────────
# Communities are addressed externally (URLs, API) by an opaque UUID
# `public_id`, but internally (FKs, joins, Socket.IO rooms) by the int `id`.
# The mapping is immutable once a community is created, so a long TTL is safe.

def get_community_id_by_public_id(public_id):
    """Return cached internal int id for a public_id, or None if not in cache."""
    return cache_get(f"community_pid:{public_id}")


def set_community_id_by_public_id(public_id, community_id):
    """Cache public_id -> internal id (TTL=3600s)."""
    cache_set(f"community_pid:{public_id}", community_id, ttl=3600)


def get_community_public_id(community_id):
    """Return cached public_id for an internal int id, or None if not in cache."""
    return cache_get(f"community_id_pid:{community_id}")


def set_community_public_id(community_id, public_id):
    """Cache internal id -> public_id (TTL=3600s)."""
    cache_set(f"community_id_pid:{community_id}", public_id, ttl=3600)


# ── User public_id <-> internal id Cache ───────────────────────────────
# Same rationale as communities: users are addressed externally (DM URLs,
# API) by an opaque UUID `public_id`, internally by the int `id`. The
# mapping is immutable once an account is created, so a long TTL is safe.

def get_user_id_by_public_id(public_id):
    """Return cached internal int id for a user public_id, or None if not in cache."""
    return cache_get(f"user_pid:{public_id}")


def set_user_id_by_public_id(public_id, user_id):
    """Cache public_id -> internal id (TTL=3600s)."""
    cache_set(f"user_pid:{public_id}", user_id, ttl=3600)


def get_user_public_id(user_id):
    """Return cached public_id for an internal int user id, or None if not in cache."""
    return cache_get(f"user_id_pid:{user_id}")


def set_user_public_id(user_id, public_id):
    """Cache internal id -> public_id (TTL=3600s)."""
    cache_set(f"user_id_pid:{user_id}", public_id, ttl=3600)


# ── Channel Message Cache ─────────────────────────────────────────────────────
# Stores the last 100 messages per channel as a Redis List (newest = head).
# Key: channel_msgs:{channel_id}  |  TTL: 30 min (refreshed on every push)
# Eliminates the DB round-trip for GET /messages/channel/{id}?offset=0
# (the 541-call hot path from the slow-query diagnosis).
#
# Layout: LPUSH prepends new messages; LRANGE 0 N returns newest-first,
# matching the existing DB ORDER BY created_at DESC so the frontend reverse()
# call continues to work without change.

_MSGS_KEY = "channel_msgs:{}"
_MSGS_MAX = 100       # keep last 100 messages per channel
_MSGS_TTL = 1800      # 30 minutes idle expiry


def get_channel_messages_cache(channel_id):
    """Return list of message dicts (newest-first), or None on cache miss."""
    r = get_redis()
    if r is None:
        return None
    try:
        raw = r.lrange(f"channel_msgs:{channel_id}", 0, _MSGS_MAX - 1)
        if not raw:
            return None
        return [json.loads(m) for m in raw]
    except Exception:
        return None


def push_channel_message_cache(channel_id, msg_dict):
    """Prepend a newly sent message to the channel cache (atomic pipeline).

    Skips the push if the cache key does not already exist — this prevents
    a single new message from creating a 1-item cache after the key has been
    invalidated (delete/edit) or naturally expired, which would cause only
    that message to appear on the next channel load.
    """
    r = get_redis()
    if r is None:
        return
    try:
        key = f"channel_msgs:{channel_id}"
        # Only update an existing cache; never create a 1-message cache
        if not r.exists(key):
            return
        pipe = r.pipeline()
        pipe.lpush(key, json.dumps(msg_dict, default=str))
        pipe.ltrim(key, 0, _MSGS_MAX - 1)
        pipe.expire(key, _MSGS_TTL)
        pipe.execute()
    except Exception:
        pass


def seed_channel_messages_cache(channel_id, msgs_list):
    """Seed cache from DB results.

    msgs_list must be newest-first (DB ORDER BY created_at DESC).
    RPUSH in that order so LRANGE returns newest-first, consistent with
    future LPUSH calls from push_channel_message_cache.
    """
    r = get_redis()
    if r is None:
        return
    try:
        key = f"channel_msgs:{channel_id}"
        pipe = r.pipeline()
        pipe.delete(key)
        for msg in msgs_list:
            pipe.rpush(key, json.dumps(msg, default=str))
        pipe.ltrim(key, 0, _MSGS_MAX - 1)
        pipe.expire(key, _MSGS_TTL)
        pipe.execute()
    except Exception:
        pass


def invalidate_channel_messages_cache(channel_id):
    """Invalidate the channel message cache (call on delete/edit/pin)."""
    cache_delete(f"channel_msgs:{channel_id}")
