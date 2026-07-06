"""
AuraFlow Autonomous-Agent Orchestrator
=======================================
Routes events from the Redis-backed event bus to interested agents based
on each agent's `SUBSCRIBES` list (see agents/base.py and §3.4 of
docs/AUTONOMOUS_AGENTS_PLAN.md).

The orchestrator is intentionally lazy:
- agents are registered by **class** (not instance), so importing this
  module is free of heavy ML dependencies; instances are created the
  first time a matching event arrives.
- when the orchestrator long-running task is not running (e.g. during
  unit tests or a dev session without Celery), code paths can still
  call `dispatch(topic, payload)` directly to fan out synchronously.

Phase 0 ships the registry + dispatcher + Celery entry point. No agents
are wired into SUBSCRIBES yet — that lands in Phase 1+.
"""

from __future__ import annotations

import importlib
import logging
import threading
from typing import Dict, List, Optional, Type

from agents import event_bus
from agents.base import AutonomousAgent

log = logging.getLogger(__name__)


# ── Registry ─────────────────────────────────────────────────────────
# Map of agent-name → fully-qualified class path. Resolved lazily.
# Keep this list short and curated; only autonomous agents go here.
_REGISTRY: Dict[str, str] = {
    # Phase 1 — easy autonomous agents (currently 100% on-demand).
    "translator":   "agents.translator:TranslatorAgent",
    "assistant":    "agents.assistant:AssistantAgent",
    "auto_message": "agents.auto_message:AutoMessageAgent",
    "support":      "agents.support:SupportAgent",
    # Phase 2 — perception agents that already run on every message.
    "mood_tracker": "agents.mood_tracker:MoodTrackerAgent",
    # Phase 3 — collaboration / response agents driven by other events.
    "wellness":     "agents.wellness:WellnessAgent",
    # Phase 2 (cont.) — perception agents emitting domain events.
    "moderation":   "agents.moderation:ModerationAgent",
    "focus":        "agents.focus:FocusAgent",
    # Phase 3 (cont.) — reactive scheduling via event-driven nudges.
    "engagement":   "agents.engagement:EngagementAgent",
    "summarizer":   "agents.summarizer:SummarizerAgent",
    "knowledge_builder": "agents.knowledge_builder_v2:KnowledgeBuilderAgent",
}

_INSTANCES: Dict[str, AutonomousAgent] = {}
_INSTANCE_LOCK = threading.Lock()


def register(name: str, dotted_path: str) -> None:
    """Register an autonomous agent under `name`. `dotted_path` is
    'module.path:ClassName' — same format Celery uses for imports."""
    _REGISTRY[name] = dotted_path


def _resolve(name: str) -> Optional[AutonomousAgent]:
    """Lazily import + cache one agent instance."""
    if name in _INSTANCES:
        return _INSTANCES[name]
    dotted = _REGISTRY.get(name)
    if not dotted:
        return None
    try:
        mod_path, _, cls_name = dotted.partition(":")
        mod = importlib.import_module(mod_path)
        cls: Type[AutonomousAgent] = getattr(mod, cls_name)
        with _INSTANCE_LOCK:
            if name not in _INSTANCES:
                _INSTANCES[name] = cls()
        return _INSTANCES[name]
    except Exception as exc:
        log.exception(f"[orchestrator] failed to resolve {name} ({dotted}): {exc}")
        return None


def _interested(topic: str) -> List[AutonomousAgent]:
    """Return all registered agents whose SUBSCRIBES list contains topic."""
    out: List[AutonomousAgent] = []
    for name in _REGISTRY:
        agent = _resolve(name)
        if agent is None:
            continue
        if topic in agent.SUBSCRIBES:
            out.append(agent)
    return out


# ── Dispatcher ───────────────────────────────────────────────────────

def dispatch(topic: str, payload: dict) -> None:
    """Fan one event out to every interested agent. Exceptions in one
    agent never block another."""
    for agent in _interested(topic):
        try:
            agent.handle({**payload, "topic": topic})
        except Exception as exc:
            log.exception(f"[orchestrator] {agent.NAME}.handle({topic}) failed: {exc}")


# ── Long-running loop (Celery task entry) ────────────────────────────

def run_loop() -> None:
    """Blocking subscribe-and-dispatch loop. Intended for a dedicated
    Celery task (see tasks/orchestrator_tasks.py:run_orchestrator)."""
    topics = list(event_bus.ALL_TOPICS)
    log.info(f"[orchestrator] starting loop on {len(topics)} topics, "
             f"{len(_REGISTRY)} agent(s) registered")
    event_bus.subscribe(topics, dispatch)
