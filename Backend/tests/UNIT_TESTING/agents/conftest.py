"""
Shared fixtures for Phase 6.1 per-agent autonomous unit tests.

Lifted from `Backend/UAT/test_agent_chains.py` and broadened so that the
named-import lookups (`from agents import memory as _agent_memory`) used
by moderation / mood_tracker / wellness / focus / summarizer / engagement
/ knowledge_builder / auto_message also resolve to the in-memory shim.

Design choices worth remembering:

* `_InMemoryAgentMemory.set_state` stores `last_acted_at` as a **naive
  local-time** datetime. The base class's `_cooldown_active` calls
  `.timestamp()` on it which, for naive datetimes, is interpreted as
  local — matching MySQL's `DATETIME` storage in server-local TZ. Using
  `utcnow()` here would silently skip cooldowns by an hour or more.

* `sys.modules["app"]` is pre-stubbed so any lazy `from app import
  socketio` inside an agent's `act()` resolves to a fake without booting
  Flask (which would try to bind Redis + the DB pool).

* `chain_store` patches BOTH `agents.base.agent_memory.*` AND every
  named-import `agents.<module>._agent_memory.*` we know about. That
  way the test doesn't have to care which lookup the agent uses; the
  shim catches them all.
"""
from __future__ import annotations

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))))

import datetime
import types
from contextlib import ExitStack
from typing import Any, Dict, List
from unittest.mock import patch, MagicMock

import pytest


# ── Pre-stub `app` so lazy `from app import socketio` works ─────────
_fake_socketio = MagicMock()
_fake_app_module = types.ModuleType("app")
_fake_app_module.socketio = _fake_socketio
sys.modules.setdefault("app", _fake_app_module)


# ── In-memory agent_memory shim ─────────────────────────────────────

class _InMemoryAgentMemory:
    """Drop-in replacement for `agents.memory` good enough to drive a
    single agent's sense→decide→act→learn pipeline in tests."""

    def __init__(self) -> None:
        self.actions: List[Dict[str, Any]] = []
        self.state: Dict[tuple, Dict[str, Any]] = {}
        self._next_id = 1

    # — agent_memory.log_action ——————————————————————————————
    def log_action(self, *, agent_name, decision, reason, correlation_id,
                   community_id=None, channel_id=None, user_id=None,
                   payload=None, emit_socket=True) -> int:
        row = {
            "id": self._next_id,
            "agent_name": agent_name,
            "decision": decision,
            "reason": reason,
            "correlation_id": correlation_id,
            "community_id": community_id,
            "channel_id": channel_id,
            "user_id": user_id,
            "payload": payload or {},
        }
        self._next_id += 1
        self.actions.append(row)
        return row["id"]

    # — agent_memory.get_state ——————————————————————————————
    def get_state(self, agent_name, scope_type, scope_id, goal_key="default"):
        return self.state.get((agent_name, scope_type, scope_id, goal_key))

    # — agent_memory.set_state ——————————————————————————————
    def set_state(self, agent_name, scope_type, scope_id, *,
                  goal_key="default", goal_value=None, thresholds=None,
                  last_acted=False, last_outcome=None):
        key = (agent_name, scope_type, scope_id, goal_key)
        existing = self.state.get(key, {})
        if thresholds is not None:
            existing["thresholds"] = thresholds
        if goal_value is not None:
            existing["goal_value"] = goal_value
        if last_acted:
            # naive local time — see module docstring
            existing["last_acted_at"] = datetime.datetime.now()
        if last_outcome is not None:
            existing["last_outcome"] = last_outcome
        self.state[key] = existing
        return True

    # — agent_memory.get_action ————————————————————————————
    def get_action(self, action_id):
        return next((a for a in self.actions if a["id"] == action_id), None)

    # — agent_memory.get_action_by_correlation ——————————————
    def get_action_by_correlation(self, agent_name, correlation_id):
        return next(
            (a for a in self.actions
             if a["agent_name"] == agent_name
             and a["correlation_id"] == correlation_id),
            None,
        )

    # — agent_memory.record_feedback ————————————————————————
    def record_feedback(self, action_id, signal, user_id=None, weight=1.0):
        return action_id  # cheap stub; the tests inspect state, not this row

    # — convenience helpers for assertions —————————————————
    def actions_for(self, agent_name: str) -> List[Dict[str, Any]]:
        return [a for a in self.actions if a["agent_name"] == agent_name]

    def act_rows_for(self, agent_name: str) -> List[Dict[str, Any]]:
        return [a for a in self.actions_for(agent_name) if a["decision"] == "act"]


# Modules that bind `from agents import memory as _agent_memory` at
# import time. We patch each one defensively — if the agent isn't
# importable in this test (no transformers, no sklearn, etc.) we skip
# the patch silently.
_NAMED_IMPORT_MODULES = (
    "agents.moderation",
    "agents.mood_tracker",
    "agents.wellness",
    "agents.focus",
    "agents.summarizer",
    "agents.engagement",
    "agents.knowledge_builder_v2",
    "agents.auto_message",
    "agents.support",
)


@pytest.fixture
def chain_store():
    """In-memory agent_memory shim, patched at every known lookup point."""
    store = _InMemoryAgentMemory()
    with ExitStack() as stack:
        # Always patch the base-class lookup.
        for fn_name in ("log_action", "get_state", "set_state",
                        "get_action", "get_action_by_correlation",
                        "record_feedback"):
            stack.enter_context(patch(
                f"agents.base.agent_memory.{fn_name}",
                side_effect=getattr(store, fn_name),
            ))
        # Patch the canonical `agents.memory` module too. Support and a
        # few helpers do `from agents import memory as _mem` *inside*
        # functions, which bypasses any module-level alias we'd patch.
        for fn_name in ("log_action", "get_state", "set_state",
                        "get_action", "get_action_by_correlation",
                        "record_feedback"):
            stack.enter_context(patch(
                f"agents.memory.{fn_name}",
                side_effect=getattr(store, fn_name),
            ))
        # Also patch every named-import `_agent_memory` reference. If
        # the module isn't loaded yet, patch will create the attribute
        # path lazily once imported — but to be safe we only attempt
        # for modules already in sys.modules; otherwise the test that
        # imports the agent first will pick up the base.* patches.
        for mod in _NAMED_IMPORT_MODULES:
            if mod not in sys.modules:
                continue
            module = sys.modules[mod]
            if not hasattr(module, "_agent_memory"):
                continue
            for fn_name in ("log_action", "get_state", "set_state",
                            "get_action", "get_action_by_correlation",
                            "record_feedback"):
                try:
                    stack.enter_context(patch(
                        f"{mod}._agent_memory.{fn_name}",
                        side_effect=getattr(store, fn_name),
                    ))
                except (AttributeError, ModuleNotFoundError):
                    pass
        yield store


@pytest.fixture
def bus_captured():
    """Capture every `agents.event_bus.publish(topic, payload)` call."""
    calls: List[Dict[str, Any]] = []

    def _capture(topic, payload):
        calls.append({"topic": topic, "payload": payload})
        return 1

    with patch("agents.event_bus.publish", side_effect=_capture):
        yield calls


@pytest.fixture
def socketio_emits():
    """Fresh emit mock attached to whichever ``app`` module currently
    occupies ``sys.modules["app"]``. Mutating our local
    ``_fake_app_module`` isn't sufficient — when UAT/test_agent_chains.py
    is collected in the same session, its conftest-style module-level
    setdefault may have won the slot first. Agents resolve their lazy
    ``from app import socketio`` through ``sys.modules``, so that's the
    only mutation point they will actually see."""
    emit = MagicMock()
    app_mod = sys.modules.get("app")
    if app_mod is None:
        app_mod = _fake_app_module
        sys.modules["app"] = app_mod
    old = getattr(app_mod, "socketio", None)
    app_mod.socketio = MagicMock(emit=emit)
    try:
        yield emit
    finally:
        app_mod.socketio = old


# ── Reusable helpers (not fixtures — call directly) ─────────────────

def fake_db_with_count(cnt: int):
    """Build a connection whose cursor().fetchone() returns {'c': cnt}.
    Matches the summarizer + knowledge_builder COUNT(*) sense() shape."""
    cur = MagicMock()
    cur.fetchone.return_value = {"c": cnt, "cnt": cnt}
    cur.__enter__ = lambda s: s
    cur.__exit__ = MagicMock(return_value=False)
    conn = MagicMock()
    conn.cursor.return_value = cur
    return conn


def fake_db_with_rows(rows):
    """Connection whose cursor returns `rows` from fetchall and the
    first row from fetchone. Use for agents that read message lists."""
    cur = MagicMock()
    cur.fetchall.return_value = list(rows)
    cur.fetchone.return_value = rows[0] if rows else None
    cur.__enter__ = lambda s: s
    cur.__exit__ = MagicMock(return_value=False)
    conn = MagicMock()
    conn.cursor.return_value = cur
    return conn


class FixedDt(datetime.datetime):
    """`datetime.datetime` subclass with a pinnable `now()`. Tests that
    need a specific clock subclass this and override `now`:

        class _MidnightDt(FixedDt):
            @classmethod
            def now(cls, tz=None): return cls(2026, 5, 21, 3, 0, 0)

        with patch("agents.wellness.datetime", _MidnightDt):
            ...

    A `MagicMock` won't work — `<` / `>` comparisons against real
    datetime objects break.
    """

    @classmethod
    def now(cls, tz=None):  # pragma: no cover — must be overridden
        raise NotImplementedError("Subclass and override now() in the test")


def make_fixed_dt(year=2026, month=5, day=20, hour=14, minute=0, second=0):
    """Build a FixedDt subclass pinned to the given instant. Avoids the
    boilerplate of declaring a new class per test."""
    pinned = (year, month, day, hour, minute, second)

    class _Pinned(datetime.datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(*pinned)

    return _Pinned
