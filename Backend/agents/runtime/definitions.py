"""
Agent definitions
=================
Loads agents (built-in Aura and, later, user-created ones) from
``agent_definitions`` + ``agent_triggers`` and turns them into
:class:`AgentSpec` objects for the loop.

The active set is cached for ``CACHE_TTL`` seconds per process because the
router consults it for every message. A definition edited elsewhere therefore
takes effect within that window.

Every function tolerates a database without the M2 migration: it returns an
empty result and logs once, so agents simply stay off.
"""

from __future__ import annotations

import json
import logging
import secrets
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from agents.runtime.specs import AURA, AgentSpec
from database import get_db_connection

log = logging.getLogger(__name__)

CACHE_TTL = 10.0
AURA_TEMPLATE = "aura"

TRIGGER_TYPES = ("mention", "keyword", "channel_message", "schedule", "member_joined",
                 "channel_silent", "focus_drift")


@dataclass(frozen=True)
class TriggerDef:
    id: int
    type: str
    channel_id: Optional[int] = None
    config: Dict[str, Any] = field(default_factory=dict)
    enabled: bool = True


@dataclass(frozen=True)
class AgentDefinition:
    id: int
    public_id: str
    bot_user_id: int
    bot_username: str
    name: str
    instructions: str = ""
    owner_user_id: Optional[int] = None
    community_id: Optional[int] = None
    description: str = ""
    avatar_url: Optional[str] = None
    model_tier: str = "fast"
    tools: Tuple[str, ...] = ()
    permissions: Dict[str, Any] = field(default_factory=dict)
    template_key: Optional[str] = None
    status: str = "active"
    daily_run_cap: int = 200
    version: int = 1
    triggers: Tuple[TriggerDef, ...] = ()

    @property
    def channel_allowlist(self) -> set:
        ids = self.permissions.get("channel_ids") or []
        return {int(i) for i in ids if str(i).lstrip("-").isdigit()}

    @property
    def is_builtin(self) -> bool:
        return self.template_key == AURA_TEMPLATE


def to_spec(defn: AgentDefinition) -> AgentSpec:
    """The loop's view of a definition. Built-in Aura's prompt lives in code."""
    if defn.is_builtin:
        return AURA
    return AgentSpec(
        key=defn.public_id, name=defn.name, instructions=defn.instructions,
        tools=defn.tools, model_tier=defn.model_tier)


# ── loading ─────────────────────────────────────────────────────────────

def _json(value: Any, default: Any) -> Any:
    if value is None:
        return default
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return default


_warned = False
_cache_lock = threading.Lock()
_cache: Dict[str, Any] = {"at": 0.0, "defs": []}


def _warn_once(exc: Exception) -> None:
    global _warned
    if not _warned:
        _warned = True
        log.warning("[RUNTIME] agent definitions unavailable (is add_agent_definitions.sql "
                    "applied?): %s", exc)


def _fetch(where: str, params: tuple, *, all_triggers: bool = False) -> List[AgentDefinition]:
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT d.*, u.username AS bot_username FROM agent_definitions d "
                "JOIN users u ON u.id = d.bot_user_id " + where, params)
            rows = list(cur.fetchall() or [])
            triggers: Dict[int, List[TriggerDef]] = {}
            if rows:
                ids = [r["id"] for r in rows]
                cur.execute(
                    "SELECT id, agent_id, type, channel_id, config, enabled FROM agent_triggers "
                    f"WHERE {'' if all_triggers else 'enabled = 1 AND '}agent_id IN ({','.join(['%s'] * len(ids))}) "
                    "ORDER BY id", tuple(ids))
                for t in cur.fetchall() or []:
                    triggers.setdefault(t["agent_id"], []).append(TriggerDef(
                        id=t["id"], type=t["type"], channel_id=t["channel_id"],
                        config=_json(t["config"], {}), enabled=bool(t["enabled"])))
    finally:
        conn.close()

    out = []
    for r in rows:
        out.append(AgentDefinition(
            id=r["id"], public_id=r["public_id"], bot_user_id=r["bot_user_id"],
            bot_username=r["bot_username"], name=r["name"],
            instructions=r.get("instructions") or "",
            owner_user_id=r.get("owner_user_id"), community_id=r.get("community_id"),
            description=r.get("description") or "", avatar_url=r.get("avatar_url"),
            model_tier=r.get("model_tier") or "fast",
            tools=tuple(_json(r.get("tools"), [])),
            permissions=_json(r.get("permissions"), {}),
            template_key=r.get("template_key"), status=r.get("status") or "draft",
            daily_run_cap=int(r.get("daily_run_cap") or 200),
            version=int(r.get("version") or 1),
            triggers=tuple(triggers.get(r["id"], []))))
    return out


def load_active_definitions(force: bool = False) -> List[AgentDefinition]:
    """All ``active`` agents with their enabled triggers (cached)."""
    now = time.monotonic()
    with _cache_lock:
        if not force and now - _cache["at"] < CACHE_TTL:
            return list(_cache["defs"])
    try:
        defs = _fetch("WHERE d.status = 'active'", ())
    except Exception as exc:  # noqa: BLE001
        _warn_once(exc)
        defs = []
    with _cache_lock:
        _cache["at"], _cache["defs"] = now, defs
    return list(defs)


def get_definition(agent_id: int, *, include_inactive: bool = False) -> Optional[AgentDefinition]:
    try:
        rows = _fetch("WHERE d.id = %s" + ("" if include_inactive else " AND d.status = 'active'"),
                      (agent_id,))
    except Exception as exc:  # noqa: BLE001
        _warn_once(exc)
        return None
    return rows[0] if rows else None


def get_definition_by_public_id(public_id: str) -> Optional[AgentDefinition]:
    """Any status, including disabled triggers (used by the Agent Builder)."""
    try:
        rows = _fetch("WHERE d.public_id = %s", (public_id,), all_triggers=True)
    except Exception as exc:  # noqa: BLE001
        _warn_once(exc)
        return None
    return rows[0] if rows else None


def invalidate_cache() -> None:
    with _cache_lock:
        _cache["at"], _cache["defs"] = 0.0, []


# ── bot users + built-in Aura ───────────────────────────────────────────

def create_bot_user(cur: Any, username_base: str, display_name: str) -> Tuple[int, str]:
    """Insert a ``users`` row for an agent and return ``(user_id, username)``.

    The password is a random bcrypt hash nobody knows; bots cannot log in
    (``routes/auth.py`` rejects them explicitly as well).
    """
    import bcrypt
    password = bcrypt.hashpw(secrets.token_hex(16).encode(), bcrypt.gensalt()).decode()
    base = "".join(ch for ch in username_base.lower() if ch.isalnum() or ch == "_")[:40] or "agent"
    candidates = [base, f"{base}_ai"] + [f"{base}_ai{i}" for i in range(2, 50)]
    for username in candidates:
        cur.execute("SELECT 1 FROM users WHERE username = %s", (username,))
        if cur.fetchone():
            continue
        cur.execute(
            "INSERT INTO users (public_id, username, display_name, password, bio, status, "
            "email_verified, is_first_login, role, is_bot) "
            "VALUES (%s, %s, %s, %s, %s, 'offline', 1, 0, 'user', 1)",
            (str(uuid.uuid4()), username, display_name, password, f"{display_name}, an AI agent."))
        return cur.lastrowid, username
    raise RuntimeError("could not find a free username for the agent")


_aura_checked = False
_last_try = 0.0
_aura_lock = threading.Lock()


def ensure_aura() -> Optional[AgentDefinition]:
    """Create the built-in Aura agent (bot user, definition, @mention trigger) once.

    Idempotent and safe to call from every process. Returns None when the M2
    migration is missing or the database is unreachable.
    """
    global _aura_checked
    from services.bots import bots_supported
    if not bots_supported():
        return None

    existing = _find_aura()
    if existing is not None:
        _aura_checked = True
        return existing

    with _aura_lock:
        existing = _find_aura()
        if existing is not None:
            _aura_checked = True
            return existing
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                bot_id, username = create_bot_user(cur, "aura", "Aura")
                cur.execute("SELECT id FROM users WHERE role = 'system_admin' AND is_bot = 0 "
                            "ORDER BY id LIMIT 1")
                owner = cur.fetchone()
                cur.execute(
                    "INSERT INTO agent_definitions (public_id, bot_user_id, owner_user_id, community_id, "
                    "name, description, instructions, model_tier, tools, permissions, template_key, "
                    "status, version) VALUES (%s, %s, %s, NULL, %s, %s, %s, 'fast', %s, %s, %s, 'active', 1)",
                    (str(uuid.uuid4()), bot_id, owner["id"] if owner else bot_id, "Aura",
                     "The built-in AI teammate. Mention @aura in any channel.", AURA.instructions,
                     json.dumps(list(AURA.tools)), json.dumps({}), AURA_TEMPLATE))
                agent_id = cur.lastrowid
                cur.execute("INSERT INTO agent_triggers (agent_id, type, channel_id, config, enabled) "
                            "VALUES (%s, 'mention', NULL, NULL, 1)", (agent_id,))
            conn.commit()
            log.info("[RUNTIME] created built-in agent Aura as @%s", username)
        except Exception as exc:  # noqa: BLE001
            if conn:
                conn.rollback()
            log.warning("[RUNTIME] ensure_aura failed: %s", exc)
        finally:
            if conn:
                conn.close()
        invalidate_cache()
        return _find_aura()


def _find_aura() -> Optional[AgentDefinition]:
    try:
        rows = _fetch("WHERE d.template_key = %s ORDER BY d.id LIMIT 1", (AURA_TEMPLATE,))
    except Exception as exc:  # noqa: BLE001
        _warn_once(exc)
        return None
    return rows[0] if rows else None


def ensure_builtin_agents_once() -> None:
    """Called lazily by the router; runs :func:`ensure_aura` once per process."""
    global _last_try
    if _aura_checked:
        return
    now = time.monotonic()
    if now - _last_try < 30.0:      # do not hit the database for every message while it is not ready
        return
    _last_try = now
    ensure_aura()
