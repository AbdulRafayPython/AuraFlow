"""
Shared helpers for reading per-agent JSON settings rows.

Every agent persists user-configurable preferences in
``user_agents.settings`` (personal scope) or ``community_agents.settings``
(community scope) as a JSON column. The columns are nullable and may come
back from PyMySQL either pre-decoded (dict) or as a raw string depending on
driver/server version, so callers historically hand-rolled a 6-line
``SELECT … row.get('settings') … json.loads`` dance every time.

This module centralises that read with a typed-default fallback so each
agent's act/run/handle method can do:

    from agents._settings import get_personal_settings
    cfg = get_personal_settings(user_id, 'translator', defaults={'auto_detect': True})
    if not cfg['auto_detect']:
        ...

Design notes:
- Best-effort by design. A DB outage MUST NOT take an agent down; we log
  and fall back to ``defaults`` so behaviour matches a never-configured
  user rather than an exception path. This matches the prior idiom in
  ``Backend/agents/assistant.py::_memory_paused``.
- No caching layer. Settings are read once per agent invocation; the
  pooled connection makes that essentially free, and a stale-cache class
  of bug would silently hide UI changes — exactly what this workstream
  is fixing.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional

from database import get_db_connection

logger = logging.getLogger(__name__)


def _decode_settings_blob(raw: Any) -> Dict[str, Any]:
    """Coerce a PyMySQL ``settings`` cell into a dict.

    PyMySQL returns JSON columns as a dict when the server speaks the new
    protocol and as a UTF-8 string otherwise. NULL comes back as None.
    """
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, (bytes, bytearray)):
        try:
            raw = raw.decode('utf-8')
        except UnicodeDecodeError:
            return {}
    if isinstance(raw, str):
        raw = raw.strip()
        if not raw:
            return {}
        try:
            decoded = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            return {}
        return decoded if isinstance(decoded, dict) else {}
    return {}


def _merge(defaults: Optional[Dict[str, Any]], settings: Dict[str, Any]) -> Dict[str, Any]:
    """Return ``defaults`` overlaid with ``settings`` (settings wins)."""
    if not defaults:
        return dict(settings)
    merged = dict(defaults)
    merged.update(settings)
    return merged


def get_personal_settings(
    user_id: Optional[int],
    agent_type: str,
    defaults: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Load ``user_agents.settings`` for (user, agent_type).

    Returns ``defaults`` (or an empty dict) on any failure, missing row, or
    malformed JSON — agents stay functional with built-in defaults if the
    DB is unreachable or the user has never touched settings.
    """
    if not user_id:
        return dict(defaults or {})
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT settings FROM user_agents "
                "WHERE user_id=%s AND agent_type=%s",
                (user_id, agent_type),
            )
            row = cur.fetchone()
        if not row:
            return dict(defaults or {})
        raw = row.get('settings') if isinstance(row, dict) else row[0]
        return _merge(defaults, _decode_settings_blob(raw))
    except Exception as exc:  # noqa: BLE001 — best-effort by design
        logger.debug("get_personal_settings(%s,%s) failed: %s", user_id, agent_type, exc)
        return dict(defaults or {})
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:  # noqa: BLE001
                pass


def get_community_settings(
    community_id: Optional[int],
    agent_type: str,
    defaults: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Load ``community_agents.settings`` for (community, agent_type)."""
    if not community_id:
        return dict(defaults or {})
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT settings FROM community_agents "
                "WHERE community_id=%s AND agent_type=%s",
                (community_id, agent_type),
            )
            row = cur.fetchone()
        if not row:
            return dict(defaults or {})
        raw = row.get('settings') if isinstance(row, dict) else row[0]
        return _merge(defaults, _decode_settings_blob(raw))
    except Exception as exc:  # noqa: BLE001
        logger.debug("get_community_settings(%s,%s) failed: %s", community_id, agent_type, exc)
        return dict(defaults or {})
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:  # noqa: BLE001
                pass


def is_personal_enabled(user_id: Optional[int], agent_type: str) -> bool:
    """Return True when the user has installed and not disabled this agent.

    A missing row is treated as not-installed (False). DB errors return
    True so an outage doesn't strip personal automations the user already
    chose to enable.
    """
    if not user_id:
        return False
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT enabled FROM user_agents "
                "WHERE user_id=%s AND agent_type=%s",
                (user_id, agent_type),
            )
            row = cur.fetchone()
        if not row:
            return False
        enabled = row.get('enabled') if isinstance(row, dict) else row[0]
        return bool(enabled)
    except Exception:  # noqa: BLE001
        return True
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:  # noqa: BLE001
                pass


def is_community_enabled(community_id: Optional[int], agent_type: str) -> bool:
    """Return True when the community has installed and not disabled this agent."""
    if not community_id:
        return False
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT enabled FROM community_agents "
                "WHERE community_id=%s AND agent_type=%s",
                (community_id, agent_type),
            )
            row = cur.fetchone()
        if not row:
            return False
        enabled = row.get('enabled') if isinstance(row, dict) else row[0]
        return bool(enabled)
    except Exception:  # noqa: BLE001
        return True
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:  # noqa: BLE001
                pass


__all__ = [
    'get_personal_settings',
    'get_community_settings',
    'is_personal_enabled',
    'is_community_enabled',
]
