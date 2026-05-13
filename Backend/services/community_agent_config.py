"""
Community Agent Config Service
==============================
Per-community AI agent enable/disable + config tunables.

Reads from the existing `community_agents` table (community_id, agent_type,
enabled, settings JSON). When no row exists, the agent is treated as enabled
by default — community admins opt OUT, not in.

Use `is_agent_enabled(community_id, agent_type)` from an agent's entry point
to honour per-community toggles. `get_agent_settings(...)` returns the
per-community settings JSON for tunables like sensitivity overrides.
"""

import json
import logging
import time
from threading import Lock
from typing import Any, Optional

from database import get_db_connection

log = logging.getLogger(__name__)

_TTL_SECONDS = 60
_cache: dict = {}
_cache_expires: dict = {}
_lock = Lock()


def _cache_key(community_id: int, agent_type: str) -> str:
    return f"{community_id}:{agent_type}"


def _cache_get(key: str):
    if key in _cache_expires and _cache_expires[key] > time.time():
        return _cache.get(key)
    return None


def _cache_set(key: str, value):
    _cache[key] = value
    _cache_expires[key] = time.time() + _TTL_SECONDS


def _load(community_id: int, agent_type: str) -> dict:
    """Return {'enabled': bool, 'settings': dict|None}. Default-enabled if no row."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT enabled, settings
                FROM community_agents
                WHERE community_id = %s AND agent_type = %s
                """,
                (community_id, agent_type),
            )
            row = cur.fetchone()
            if not row:
                return {'enabled': True, 'settings': None, 'exists': False}
            settings = row['settings']
            if isinstance(settings, str):
                try:
                    settings = json.loads(settings)
                except Exception:
                    settings = None
            return {
                'enabled': bool(row['enabled']),
                'settings': settings,
                'exists': True,
            }
    except Exception as e:
        log.warning(f"[CAGENT] Failed to load config for {community_id}/{agent_type}: {e}")
        return {'enabled': True, 'settings': None, 'exists': False}
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass


def get_config(community_id: int, agent_type: str) -> dict:
    """Read-through cached. Returns {'enabled', 'settings', 'exists'}."""
    if community_id is None or not agent_type:
        return {'enabled': True, 'settings': None, 'exists': False}
    key = _cache_key(community_id, agent_type)
    with _lock:
        hit = _cache_get(key)
        if hit is not None:
            return hit
    value = _load(community_id, agent_type)
    with _lock:
        _cache_set(key, value)
    return value


def is_agent_enabled(community_id: Optional[int], agent_type: str) -> bool:
    """
    Convenience: true if the community has not explicitly disabled the agent.
    If community_id is None, returns True (we can't scope without one).
    """
    if community_id is None or not agent_type:
        return True
    return bool(get_config(community_id, agent_type).get('enabled', True))


def get_agent_settings(community_id: int, agent_type: str) -> Optional[dict]:
    """Per-community settings JSON for this agent (or None if unset)."""
    return get_config(community_id, agent_type).get('settings')


def upsert(
    community_id: int,
    agent_type: str,
    enabled: Optional[bool] = None,
    settings: Optional[dict] = None,
    installed_by: Optional[int] = None,
) -> dict:
    """Insert or update community_agents row, then invalidate cache."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, enabled, settings, installed_by FROM community_agents WHERE community_id = %s AND agent_type = %s",
                (community_id, agent_type),
            )
            existing = cur.fetchone()

            new_enabled = enabled if enabled is not None else (bool(existing['enabled']) if existing else True)
            if settings is not None:
                new_settings_json = json.dumps(settings)
            elif existing and existing['settings'] is not None:
                new_settings_json = existing['settings'] if isinstance(existing['settings'], str) else json.dumps(existing['settings'])
            else:
                new_settings_json = None

            if existing:
                cur.execute(
                    "UPDATE community_agents SET enabled = %s, settings = %s WHERE id = %s",
                    (1 if new_enabled else 0, new_settings_json, existing['id']),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO community_agents (community_id, agent_type, enabled, settings, installed_by)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (community_id, agent_type, 1 if new_enabled else 0, new_settings_json, installed_by or 0),
                )
        conn.commit()
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass

    invalidate(community_id, agent_type)
    return get_config(community_id, agent_type)


def invalidate(community_id: int, agent_type: Optional[str] = None) -> None:
    with _lock:
        if agent_type:
            key = _cache_key(community_id, agent_type)
            _cache.pop(key, None)
            _cache_expires.pop(key, None)
        else:
            keys = [k for k in _cache if k.startswith(f"{community_id}:")]
            for k in keys:
                _cache.pop(k, None)
                _cache_expires.pop(k, None)
