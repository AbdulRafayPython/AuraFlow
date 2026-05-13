"""
Platform Config Service
=======================
Read-through cached access to `platform_settings`.

Other modules (moderation, message handlers, auth, agents) consume canonical
platform settings through `get_setting(key, default)`. The system-admin
UI updates `platform_settings` via `PUT /api/admin/system/platform-settings`,
which calls `invalidate_setting(key)` to evict the cache.

Cache: in-memory dict with a 60-second TTL. If Redis becomes the preferred
shared cache later, swap the `_cache_*` helpers — the public API stays the same.

Canonical keys (see Backend/routes/admin.py PLATFORM_SETTINGS_DEFAULTS):
    registration_enabled        bool   — accept new signups
    maintenance_mode            bool   — block non-admin requests
    max_communities_per_user    int    — cap on owned communities per user
    max_channels_per_community  int    — cap on channels in a community
    max_file_size_mb            int    — upload size limit
    message_rate_limit          int    — messages/minute per user
    auto_moderation_enabled     bool   — run moderation agent on each message
    moderation_sensitivity      str    — 'low' | 'medium' | 'high'
    auto_ban_threshold          int    — violations before auto-ban
    email_notifications_enabled bool   — send transactional email
"""

import json
import logging
import time
from threading import Lock
from typing import Any, Optional

from database import get_db_connection

log = logging.getLogger(__name__)

# Canonical defaults — must stay in sync with PLATFORM_SETTINGS_DEFAULTS in admin.py
DEFAULTS: dict = {
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

# Maps moderation_sensitivity string to a confidence cutoff used by the
# moderation agent. Lower cutoff = more aggressive flagging.
MODERATION_SENSITIVITY_CUTOFF = {
    'low': 0.85,
    'medium': 0.70,
    'high': 0.55,
}

_TTL_SECONDS = 60
_cache: dict = {}
_cache_expires: dict = {}
_lock = Lock()


def _cache_get(key: str) -> Optional[Any]:
    now = time.time()
    if key in _cache_expires and _cache_expires[key] > now:
        return _cache.get(key)
    return None


def _cache_set(key: str, value: Any) -> None:
    _cache[key] = value
    _cache_expires[key] = time.time() + _TTL_SECONDS


def _load_from_db(key: str) -> Optional[Any]:
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT setting_value FROM platform_settings WHERE setting_key = %s", (key,))
            row = cur.fetchone()
            if not row:
                return None
            raw = row['setting_value']
            try:
                return json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                return raw
    except Exception as e:
        log.warning(f"[CFG] Failed to load setting {key}: {e}")
        return None
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass


def get_setting(key: str, default: Any = None) -> Any:
    """
    Return the current value of a platform setting.

    Lookup order:
      1. In-memory cache (if fresh).
      2. platform_settings table.
      3. DEFAULTS map.
      4. Caller-provided default.
    """
    with _lock:
        cached = _cache_get(key)
        if cached is not None:
            return cached

    value = _load_from_db(key)
    if value is None:
        value = DEFAULTS.get(key, default)

    with _lock:
        _cache_set(key, value)
    return value


def invalidate_setting(key: str) -> None:
    """Drop a key from the in-memory cache. Call after a write."""
    with _lock:
        _cache.pop(key, None)
        _cache_expires.pop(key, None)


def invalidate_all() -> None:
    """Clear the entire settings cache."""
    with _lock:
        _cache.clear()
        _cache_expires.clear()


# Convenience accessors — keep call sites concise and self-documenting.

def is_registration_enabled() -> bool:
    return bool(get_setting('registration_enabled', True))


def is_maintenance_mode() -> bool:
    return bool(get_setting('maintenance_mode', False))


def is_auto_moderation_enabled() -> bool:
    return bool(get_setting('auto_moderation_enabled', True))


def moderation_confidence_cutoff() -> float:
    sensitivity = str(get_setting('moderation_sensitivity', 'medium')).lower()
    return MODERATION_SENSITIVITY_CUTOFF.get(sensitivity, 0.70)


def message_rate_limit_per_minute() -> int:
    try:
        return int(get_setting('message_rate_limit', 30))
    except (TypeError, ValueError):
        return 30


def max_file_size_bytes() -> int:
    try:
        mb = int(get_setting('max_file_size_mb', 10))
    except (TypeError, ValueError):
        mb = 10
    return mb * 1024 * 1024


def auto_ban_threshold() -> int:
    try:
        return int(get_setting('auto_ban_threshold', 5))
    except (TypeError, ValueError):
        return 5


def email_notifications_enabled() -> bool:
    return bool(get_setting('email_notifications_enabled', True))
