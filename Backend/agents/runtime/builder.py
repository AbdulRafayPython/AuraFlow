"""
Agent Builder service layer
===========================
Validation, quotas, permissions and database writes behind
``routes/agent_builder.py``. Routes stay thin; everything that decides *whether*
something is allowed lives here so it can be tested without HTTP.

Rules worth knowing:

* A user may give an agent **read** and **write** tools. A write tool never runs
  by itself: each use waits for the approver (see ``agents.runtime.approvals``).
  ``admin`` tools cannot be attached.
* Community agents are created and managed by that community's owner/admins;
  personal agents (no community) by their owner. System admins manage any.
* Quotas (``AGENT_MAX_PER_USER`` / ``AGENT_MAX_PER_COMMUNITY``) cap how many
  agents exist, schedules cannot fire more often than every 15 minutes and every
  agent has a ``daily_run_cap``: together they bound LLM cost.
"""

from __future__ import annotations

import json
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

from agents.runtime import builtin_tools, legacy_tools, write_tools  # noqa: F401  (registers the tools)
from agents.runtime.definitions import AgentDefinition, create_bot_user, invalidate_cache
from agents.runtime.schedules import next_run_utc, validate_schedule
from agents.runtime.templates import AgentTemplate
from agents.runtime.tools import RISK_ADMIN, TOOL_REGISTRY

MIN_NAME, MAX_NAME = 2, 60
MAX_DESCRIPTION = 300
MIN_INSTRUCTIONS, MAX_INSTRUCTIONS = 10, 4000
MAX_TOOLS = 12
MAX_TRIGGERS = 10
MAX_KEYWORDS, MAX_KEYWORD_CHARS = 20, 40
MAX_ALLOWED_CHANNELS = 50
TRIGGER_TYPES = ("mention", "keyword", "channel_message", "schedule", "member_joined",
                 "channel_silent", "focus_drift")

# channel_silent: the quietest a channel must be before the agent wakes (minutes).
MIN_SILENT_MINUTES, MAX_SILENT_MINUTES = 10, 1440
CHANNEL_EVENT_TYPES = ("channel_silent", "focus_drift")
MODEL_TIERS = ("fast", "smart")


class BuilderError(Exception):
    def __init__(self, message: str, status: int = 400, details: Optional[List[str]] = None):
        super().__init__(message)
        self.message, self.status, self.details = message, status, details or []


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name) or default)
    except ValueError:
        return default


# ── catalog ─────────────────────────────────────────────────────────────

def tool_catalog() -> List[Dict[str, Any]]:
    """Tools a user may attach to an agent (read and write; write ones need approval)."""
    return [{"name": t.name, "description": t.description, "risk": t.risk, "parameters": t.parameters}
            for t in TOOL_REGISTRY.values() if t.risk != RISK_ADMIN and not t.name.startswith("mcp_")]


def allowed_tool_names() -> List[str]:
    return [t["name"] for t in tool_catalog()]


# ── validation ──────────────────────────────────────────────────────────

def validate_fields(data: Dict[str, Any], *, partial: bool = False,
                    extra_tools: Iterable[str] = ()) -> Tuple[Dict[str, Any], List[str]]:
    """Validate agent fields. With ``partial`` only the given keys are checked.

    ``extra_tools`` are tool names that exist only for this agent (its MCP tools)."""
    clean: Dict[str, Any] = {}
    errors: List[str] = []

    def need(key: str) -> bool:
        return key in data or not partial

    if need("name"):
        name = str(data.get("name") or "").strip()
        if not MIN_NAME <= len(name) <= MAX_NAME:
            errors.append(f"name must be {MIN_NAME} to {MAX_NAME} characters")
        else:
            clean["name"] = name
    if "description" in data:
        clean["description"] = str(data.get("description") or "").strip()[:MAX_DESCRIPTION]
    if need("instructions"):
        text = str(data.get("instructions") or "").strip()
        if not MIN_INSTRUCTIONS <= len(text) <= MAX_INSTRUCTIONS:
            errors.append(f"instructions must be {MIN_INSTRUCTIONS} to {MAX_INSTRUCTIONS} characters")
        else:
            clean["instructions"] = text
    if "model_tier" in data:
        if data["model_tier"] not in MODEL_TIERS:
            errors.append(f"model_tier must be one of {list(MODEL_TIERS)}")
        else:
            clean["model_tier"] = data["model_tier"]
    if "tools" in data:
        tools = data.get("tools")
        known = set(allowed_tool_names()) | set(extra_tools)
        if not isinstance(tools, list) or len(tools) > MAX_TOOLS:
            errors.append(f"tools must be a list of at most {MAX_TOOLS} names")
        else:
            bad = [t for t in tools if t not in known]
            if bad:
                errors.append(f"unknown or not allowed tools: {', '.join(map(str, bad))}")
            else:
                clean["tools"] = list(dict.fromkeys(tools))
    if "daily_run_cap" in data:
        cap = data["daily_run_cap"]
        if isinstance(cap, bool) or not isinstance(cap, int) or not 1 <= cap <= 2000:
            errors.append("daily_run_cap must be a whole number from 1 to 2000")
        else:
            clean["daily_run_cap"] = cap
    if "permissions" in data:
        perms = data.get("permissions")
        ids = perms.get("channel_ids", []) if isinstance(perms, dict) else None
        if ids is None or not isinstance(ids, list) or len(ids) > MAX_ALLOWED_CHANNELS \
                or any(isinstance(i, bool) or not isinstance(i, int) for i in ids):
            errors.append("permissions must look like {\"channel_ids\": [1, 2]}")
        else:
            clean["permissions"] = {"channel_ids": sorted(set(ids))}
    if "avatar_url" in data:
        url = str(data.get("avatar_url") or "").strip()
        if url and not (url.startswith("/uploads/") or url.startswith("https://")) or len(url) > 500:
            errors.append("avatar_url must be an /uploads/ path or an https URL")
        else:
            clean["avatar_url"] = url or None
    return clean, errors


def validate_triggers(triggers: Any, *, community_id: Optional[int],
                      channel_ok: Callable[[int], bool]) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Validate a trigger list; returns cleaned triggers (with ``next_run_at`` for schedules)."""
    errors: List[str] = []
    out: List[Dict[str, Any]] = []
    if not isinstance(triggers, list) or len(triggers) > MAX_TRIGGERS:
        return [], [f"triggers must be a list of at most {MAX_TRIGGERS}"]

    for i, t in enumerate(triggers):
        label = f"trigger {i + 1}"
        if not isinstance(t, dict) or t.get("type") not in TRIGGER_TYPES:
            errors.append(f"{label}: type must be one of {list(TRIGGER_TYPES)}")
            continue
        ttype = t["type"]
        channel_id = t.get("channel_id")
        if channel_id is not None:
            if isinstance(channel_id, bool) or not isinstance(channel_id, int) or not channel_ok(channel_id):
                errors.append(f"{label}: channel_id is not a channel you can use for this agent")
                continue
        config: Dict[str, Any] = {}
        next_run: Optional[datetime] = None

        if ttype == "keyword":
            kws = (t.get("config") or {}).get("keywords")
            if not isinstance(kws, list) or not kws or len(kws) > MAX_KEYWORDS \
                    or any(not isinstance(k, str) or not 1 <= len(k.strip()) <= MAX_KEYWORD_CHARS for k in kws):
                errors.append(f"{label}: keywords must be 1 to {MAX_KEYWORDS} words of up to {MAX_KEYWORD_CHARS} characters")
                continue
            config = {"keywords": [k.strip() for k in kws]}
        elif ttype == "schedule":
            if channel_id is None:
                errors.append(f"{label}: a schedule needs the channel to post in")
                continue
            config, problems = validate_schedule(t.get("config") or {})
            if problems:
                errors.extend(f"{label}: {p}" for p in problems)
                continue
            next_run = next_run_utc(config)
        elif ttype == "channel_message":
            if channel_id is None:
                errors.append(f"{label}: channel_message must be limited to one channel")
                continue
        elif ttype == "member_joined" and community_id is None:
            errors.append(f"{label}: member_joined only works for community agents")
            continue
        elif ttype in CHANNEL_EVENT_TYPES:
            if community_id is None:
                errors.append(f"{label}: {ttype} only works for community agents")
                continue
            minutes = (t.get("config") or {}).get("min_minutes") if ttype == "channel_silent" else None
            if minutes is not None:
                if isinstance(minutes, bool) or not isinstance(minutes, int) \
                        or not MIN_SILENT_MINUTES <= minutes <= MAX_SILENT_MINUTES:
                    errors.append(f"{label}: min_minutes must be a whole number from {MIN_SILENT_MINUTES} to {MAX_SILENT_MINUTES}")
                    continue
                config = {"min_minutes": minutes}

        out.append({"type": ttype, "channel_id": channel_id, "config": config, "next_run_at": next_run,
                    "enabled": bool(t.get("enabled", True))})
    return out, errors


# ── permissions ─────────────────────────────────────────────────────────

def community_role(cur: Any, user_id: int, community_id: Optional[int]) -> Optional[str]:
    if community_id is None:
        return None
    cur.execute("SELECT role FROM community_members WHERE community_id = %s AND user_id = %s",
                (community_id, user_id))
    row = cur.fetchone()
    return row["role"] if row else None


def is_system_admin(cur: Any, user_id: int) -> bool:
    cur.execute("SELECT 1 FROM users WHERE id = %s AND role = 'system_admin'", (user_id,))
    return cur.fetchone() is not None


def can_create(cur: Any, user_id: int, community_id: Optional[int]) -> bool:
    if community_id is None:
        return True
    return community_role(cur, user_id, community_id) in ("owner", "admin") or is_system_admin(cur, user_id)


def can_manage(cur: Any, user_id: int, defn: AgentDefinition) -> bool:
    if defn.is_builtin:
        return is_system_admin(cur, user_id)
    if defn.owner_user_id == user_id:
        return True
    if defn.community_id is not None and community_role(cur, user_id, defn.community_id) in ("owner", "admin"):
        return True
    return is_system_admin(cur, user_id)


def can_view(cur: Any, user_id: int, defn: AgentDefinition) -> bool:
    if can_manage(cur, user_id, defn):
        return True
    return defn.status == "active" and defn.community_id is not None \
        and community_role(cur, user_id, defn.community_id) is not None


def channel_checker(cur: Any, user_id: int, community_id: Optional[int]) -> Callable[[int], bool]:
    """``f(channel_id)``: the channel is in the agent's community and the user belongs to it."""
    def check(channel_id: int) -> bool:
        cur.execute("SELECT community_id FROM channels WHERE id = %s", (channel_id,))
        ch = cur.fetchone()
        if not ch or (community_id is not None and ch["community_id"] != community_id):
            return False
        cur.execute("SELECT 1 FROM channel_members WHERE channel_id = %s AND user_id = %s", (channel_id, user_id))
        return cur.fetchone() is not None or is_system_admin(cur, user_id)
    return check


def check_quota(cur: Any, owner_id: int, community_id: Optional[int]) -> None:
    cur.execute("SELECT COUNT(*) AS n FROM agent_definitions WHERE owner_user_id = %s "
                "AND status <> 'archived' AND (template_key IS NULL OR template_key <> 'aura')", (owner_id,))
    if int((cur.fetchone() or {}).get("n") or 0) >= _int_env("AGENT_MAX_PER_USER", 5):
        raise BuilderError(f"You already have the maximum of {_int_env('AGENT_MAX_PER_USER', 5)} agents. "
                           "Archive one first.", 409)
    if community_id is not None:
        cur.execute("SELECT COUNT(*) AS n FROM agent_definitions WHERE community_id = %s AND status <> 'archived'",
                    (community_id,))
        if int((cur.fetchone() or {}).get("n") or 0) >= _int_env("AGENT_MAX_PER_COMMUNITY", 10):
            raise BuilderError("This community has reached its agent limit.", 409)


# ── writes ──────────────────────────────────────────────────────────────

def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_") or "agent"


def create_agent(cur: Any, *, owner_id: int, community_id: Optional[int], fields: Dict[str, Any],
                 triggers: List[Dict[str, Any]], template_key: Optional[str]) -> Tuple[int, str]:
    """Insert bot user + draft definition + triggers. Returns ``(agent_id, public_id)``."""
    bot_id, _ = create_bot_user(cur, slugify(fields["name"]), fields["name"])
    public_id = str(uuid.uuid4())
    cur.execute(
        "INSERT INTO agent_definitions (public_id, bot_user_id, owner_user_id, community_id, name, description, "
        "avatar_url, instructions, model_tier, tools, permissions, template_key, status, daily_run_cap) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'draft', %s)",
        (public_id, bot_id, owner_id, community_id, fields["name"], fields.get("description", ""),
         fields.get("avatar_url"), fields["instructions"], fields.get("model_tier", "fast"),
         json.dumps(fields.get("tools", [])), json.dumps(fields.get("permissions", {})),
         template_key, fields.get("daily_run_cap", 200)))
    agent_id = cur.lastrowid
    insert_triggers(cur, agent_id, triggers)
    return agent_id, public_id


def insert_triggers(cur: Any, agent_id: int, triggers: List[Dict[str, Any]]) -> None:
    for t in triggers:
        cur.execute(
            "INSERT INTO agent_triggers (agent_id, type, channel_id, config, next_run_at, enabled) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (agent_id, t["type"], t.get("channel_id"), json.dumps(t.get("config") or {}) if t.get("config") else None,
             t.get("next_run_at"), 1 if t.get("enabled", True) else 0))


def replace_triggers(cur: Any, agent_id: int, triggers: List[Dict[str, Any]]) -> None:
    cur.execute("DELETE FROM agent_triggers WHERE agent_id = %s", (agent_id,))
    insert_triggers(cur, agent_id, triggers)
    bump_version(cur, agent_id)


def update_agent(cur: Any, agent_id: int, clean: Dict[str, Any]) -> None:
    if not clean:
        return
    sets, params = [], []
    for key, value in clean.items():
        if key in ("tools", "permissions"):
            value = json.dumps(value)
        sets.append(f"{key} = %s")
        params.append(value)
    cur.execute(f"UPDATE agent_definitions SET {', '.join(sets)}, version = version + 1 WHERE id = %s",
                tuple(params + [agent_id]))
    if "name" in clean:
        cur.execute("UPDATE users u JOIN agent_definitions d ON d.bot_user_id = u.id "
                    "SET u.display_name = %s WHERE d.id = %s", (clean["name"], agent_id))


def bump_version(cur: Any, agent_id: int) -> None:
    cur.execute("UPDATE agent_definitions SET version = version + 1 WHERE id = %s", (agent_id,))


def set_status(cur: Any, defn: AgentDefinition, status: str) -> None:
    cur.execute("UPDATE agent_definitions SET status = %s, version = version + 1 WHERE id = %s", (status, defn.id))
    if status == "archived":
        cur.execute("UPDATE agent_triggers SET enabled = 0 WHERE agent_id = %s", (defn.id,))
        cur.execute("UPDATE users SET account_status = 'suspended' WHERE id = %s", (defn.bot_user_id,))
    elif status == "active":
        cur.execute("UPDATE users SET account_status = 'active' WHERE id = %s", (defn.bot_user_id,))


# ── output ──────────────────────────────────────────────────────────────

def serialize(defn: AgentDefinition, *, community_public_id: Optional[str] = None,
              include_private: bool = True) -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "id": defn.public_id, "name": defn.name, "description": defn.description,
        "username": defn.bot_username, "avatar_url": defn.avatar_url,
        "community_id": community_public_id, "status": defn.status,
        "template_key": defn.template_key, "is_builtin": defn.is_builtin,
    }
    if include_private:
        out.update({
            "instructions": defn.instructions, "model_tier": defn.model_tier, "tools": list(defn.tools),
            "permissions": defn.permissions, "daily_run_cap": defn.daily_run_cap, "version": defn.version,
            "triggers": [{"id": t.id, "type": t.type, "channel_id": t.channel_id, "config": t.config,
                          "enabled": t.enabled} for t in defn.triggers],
        })
    return out
