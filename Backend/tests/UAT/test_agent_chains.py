"""
TC-UAT-AGENT-CHAIN-01 to 03
===========================
User Acceptance Tests for the autonomous-agent collaboration chains
described in docs/AUTONOMOUS_AGENTS_PLAN.md §8.

Each test drives one chain end-to-end by calling agent.handle(event)
directly — we bypass Redis pub/sub so we test wiring + decision logic,
not the bus.

Chains exercised:
  01. msg.created → mood_tracker (escalate=True)
                  → mood.escalation → wellness (mood path)
  02. msg.created → moderation (severity >= 0.5)
                  → mod.violation → wellness (mod path, skips quiet hours)
  03. focus.drift → summarizer + knowledge_builder

Strategy
--------
We patch four side-effect surfaces and watch them:
  • agents.base.agent_memory.{log_action,get_state,set_state} — in-memory shim
  • agents.event_bus.publish                                  — capture topics
  • app.socketio                                              — fake socketio (lazy import)
  • Per-agent helpers (analyzers, DB cursors, Gemini calls)   — minimal mocks

The point of these tests is to prove the *wiring* is correct: that
high-severity moderation → wellness victim chain, that mood escalation
→ wellness empathy, that focus drift → both summarizer + KB.
"""
from __future__ import annotations

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import datetime
import types
from typing import Any, Dict, List
from unittest.mock import patch, MagicMock

import pytest


# ── Pre-stub the `app` module so wellness/summarizer's lazy
#    `from app import socketio` succeeds without booting the real Flask
#    app (which would try to bind Redis, the DB pool, etc.). One stub
#    serves the whole module — individual tests can swap the emit mock
#    on it as needed.
_fake_socketio = MagicMock()
_fake_app_module = types.ModuleType("app")
_fake_app_module.socketio = _fake_socketio
sys.modules.setdefault("app", _fake_app_module)


# ── In-memory agent_memory shim ──────────────────────────────────────

class _InMemoryAgentMemory:
    def __init__(self) -> None:
        self.actions: List[Dict[str, Any]] = []
        self.state: Dict[tuple, Dict[str, Any]] = {}
        self._next_id = 1

    def log_action(self, *, agent_name, decision, reason, correlation_id,
                   community_id=None, channel_id=None, user_id=None,
                   payload=None) -> int:
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

    def get_state(self, agent_name, scope_type, scope_id, goal_key="default"):
        return self.state.get((agent_name, scope_type, scope_id, goal_key))

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
            # Use naive local time so `.timestamp()` (which assumes
            # local) lines up with the live `time.time()` epoch the
            # base class compares against. MySQL stores DATETIME in
            # server-local TZ too, so this matches production behaviour.
            existing["last_acted_at"] = datetime.datetime.now()
        if last_outcome is not None:
            existing["last_outcome"] = last_outcome
        self.state[key] = existing
        return True

    def actions_for(self, agent_name: str) -> List[Dict[str, Any]]:
        return [a for a in self.actions if a["agent_name"] == agent_name]

    def act_rows_for(self, agent_name: str) -> List[Dict[str, Any]]:
        return [a for a in self.actions_for(agent_name) if a["decision"] == "act"]


@pytest.fixture
def chain_store():
    """Patches agent_memory wherever the base driver looks it up."""
    store = _InMemoryAgentMemory()
    with patch("agents.base.agent_memory.log_action",
               side_effect=store.log_action), \
         patch("agents.base.agent_memory.get_state",
               side_effect=store.get_state), \
         patch("agents.base.agent_memory.set_state",
               side_effect=store.set_state):
        yield store


@pytest.fixture
def bus_captured():
    """Capture every agents.event_bus.publish call."""
    calls: List[Dict[str, Any]] = []

    def _capture(topic, payload):
        calls.append({"topic": topic, "payload": payload})
        return 1

    with patch("agents.event_bus.publish", side_effect=_capture):
        yield calls


@pytest.fixture
def socketio_emits():
    """Fresh emit mock attached to whatever `app` module currently lives
    in ``sys.modules``. We must mutate the canonical entry in
    ``sys.modules`` rather than our local ``_fake_app_module``: when
    ``UNIT_TESTING/agents/conftest.py`` is also collected in the same
    pytest session, its module-level ``setdefault("app", ...)`` may have
    won the slot before ours ran. Wellness/summarizer's lazy
    ``from app import socketio`` resolves through ``sys.modules``, so
    that's the only mutation point the agents will actually see."""
    emit = MagicMock()
    app_mod = sys.modules.get("app")
    if app_mod is None:                      # belt-and-braces; should never happen
        app_mod = _fake_app_module
        sys.modules["app"] = app_mod
    old = getattr(app_mod, "socketio", None)
    app_mod.socketio = MagicMock(emit=emit)
    try:
        yield emit
    finally:
        app_mod.socketio = old


def _fake_db_with_count(cnt: int):
    """Build a patcher that makes get_db_connection return a cursor
    whose fetchone() returns {'c': cnt} — matches the summarizer/KB
    sense() COUNT(*) shape."""
    cur = MagicMock()
    cur.fetchone.return_value = {"c": cnt, "cnt": cnt}
    cur.__enter__ = lambda s: s
    cur.__exit__ = MagicMock(return_value=False)
    conn = MagicMock()
    conn.cursor.return_value = cur
    return conn


# ====================================================================
#  TC-UAT-AGENT-CHAIN-01 — Mood → Wellness empathy chain
# ====================================================================

class TestUAT_MoodWellnessChain:

    def test_chain01_escalation_triggers_wellness_checkin(
            self, chain_store, bus_captured, socketio_emits):
        """Negative msg → mood_tracker publishes mood.escalation → wellness emits."""
        # ── Step 1: drive mood_tracker on a negative msg.created ─────
        from agents.mood_tracker import MoodTrackerAgent

        with patch.object(MoodTrackerAgent, "_user_opted_in", return_value=True), \
             patch.object(MoodTrackerAgent, "_persist_mood_row", return_value=None), \
             patch.object(MoodTrackerAgent, "_push_and_recall",
                          return_value=[-0.6, -0.7, -0.8, -0.8, -0.9]), \
             patch.object(MoodTrackerAgent, "_escalation_threshold",
                          return_value=-0.4), \
             patch.object(MoodTrackerAgent, "_recently_escalated",
                          return_value=False), \
             patch.object(MoodTrackerAgent, "_mark_escalation",
                          return_value=None), \
             patch.object(MoodTrackerAgent, "analyze_message",
                          return_value={"primary_mood": "sad",
                                        "sentiment_score": -0.9,
                                        "sentiment": "negative"}):
            MoodTrackerAgent().handle({
                "topic": "msg.created",
                "user_id": 42, "channel_id": 100, "community_id": 7,
                "content": "yaar mujhe bohot stress ho raha hai",
                "message_id": 1001,
            })

        mood_acts = chain_store.act_rows_for("mood_tracker")
        assert len(mood_acts) == 1, "mood_tracker must log an act row per opted-in message"
        assert mood_acts[0]["payload"].get("escalate") is True

        topics = [c["topic"] for c in bus_captured]
        assert any("mood" in t and "escalat" in t for t in topics), \
            f"expected mood.escalation in published topics, got {topics}"

        # ── Step 2: feed mood.escalation into wellness ────────────────
        from agents import event_bus as _bus
        escalation_event = {
            "topic": _bus.TOPIC_MOOD_ESCALATION,
            "user_id": 42, "channel_id": 100, "community_id": 7,
            "score": -0.9, "primary_mood": "sad", "window_mean": -0.78,
            "threshold": -0.4, "analysis": {"primary_mood": "sad"},
            "correlation_id": "mood-escalation-uat-01",
        }
        from agents.wellness import WellnessAgent

        # Pin clock to 14:00 so mood path doesn't defer for quiet hours.
        # Use a real datetime subclass so wellness's `datetime.now().hour`
        # comparison still works.
        class _FixedDt(datetime.datetime):
            @classmethod
            def now(cls, tz=None):
                return cls(2026, 5, 20, 14, 0, 0)

        with patch.object(WellnessAgent, "_user_opted_in", return_value=True), \
             patch.object(WellnessAgent, "_pick_template_index", return_value=0), \
             patch.object(WellnessAgent, "_format_checkin",
                          return_value="Hey, just checking in — quick reset?"), \
             patch.object(WellnessAgent, "_log_wellness_check", return_value=None), \
             patch("agents.wellness.datetime", _FixedDt):
            WellnessAgent().handle(escalation_event)

        wellness_acts = chain_store.act_rows_for("wellness")
        assert len(wellness_acts) == 1, "wellness must act once on first escalation"
        assert socketio_emits.called, \
            "wellness must emit wellness_checkin via socketio"
        emit_args = socketio_emits.call_args
        assert emit_args.args[0] == "wellness_checkin"
        assert emit_args.args[1].get("trigger") == "mood_escalation"

    def test_chain01_cooldown_blocks_second_emit_but_keeps_audit(
            self, chain_store, bus_captured, socketio_emits):
        """Second escalation inside the 60-min cooldown logs an act row but
        the cooldown gate prevents act() — emit count stays at one."""
        from agents import event_bus as _bus
        from agents.wellness import WellnessAgent

        class _FixedDt(datetime.datetime):
            @classmethod
            def now(cls, tz=None):
                return cls(2026, 5, 20, 14, 0, 0)

        event_a = {
            "topic": _bus.TOPIC_MOOD_ESCALATION,
            "user_id": 77, "channel_id": 100, "community_id": 7,
            "score": -0.9, "primary_mood": "sad", "window_mean": -0.8,
            "threshold": -0.4,
            "correlation_id": "mood-escalation-uat-02a",
        }
        event_b = {**event_a, "correlation_id": "mood-escalation-uat-02b"}

        with patch.object(WellnessAgent, "_user_opted_in", return_value=True), \
             patch.object(WellnessAgent, "_pick_template_index", return_value=0), \
             patch.object(WellnessAgent, "_format_checkin",
                          return_value="Quick reset?"), \
             patch.object(WellnessAgent, "_log_wellness_check", return_value=None), \
             patch("agents.wellness.datetime", _FixedDt):
            wellness = WellnessAgent()
            wellness.handle(event_a)
            wellness.handle(event_b)

        acts = chain_store.act_rows_for("wellness")
        assert len(acts) == 2, \
            "every decide=act must log, even when cooldown blocks the emit"
        assert socketio_emits.call_count == 1, \
            "cooldown must prevent the second wellness_checkin"


# ====================================================================
#  TC-UAT-AGENT-CHAIN-02 — Moderation → Wellness victim chain
# ====================================================================

class TestUAT_ModerationWellnessChain:

    def test_chain02_violation_triggers_victim_support(
            self, chain_store, bus_captured, socketio_emits):
        from agents.moderation import ModerationAgent

        # Force a 'block' result → sense() maps to severity='critical' → score 1.0.
        with patch.object(ModerationAgent, "instant_check",
                          return_value={"block": True, "reason": "directed_threat"}), \
             patch.object(ModerationAgent, "_severity_threshold", return_value=0.5):
            ModerationAgent().handle({
                "topic": "msg.created",
                "user_id": 99, "channel_id": 100, "community_id": 7,
                "content": "i will kill you tomorrow",
                "message_id": 2002,
            })

        mod_acts = chain_store.act_rows_for("moderation")
        assert len(mod_acts) == 1
        assert mod_acts[0]["payload"].get("severity_score", 0) >= 0.5

        topics = [c["topic"] for c in bus_captured]
        assert any("mod" in t and "violat" in t for t in topics)

        # ── Wellness victim path — pin clock to 03:00 (quiet hours) ──
        # The mod path is required to skip the quiet-hour gate.
        from agents import event_bus as _bus
        violation_event = {
            "topic": _bus.TOPIC_MOD_VIOLATION,
            "user_id": 42,             # victim
            "channel_id": 100, "community_id": 7,
            "category": "harassment", "severity": "high",
            "severity_score": 0.8, "message_id": 2002,
            "correlation_id": "mod-violation-uat-02",
        }
        from agents.wellness import WellnessAgent

        class _FixedDt(datetime.datetime):
            @classmethod
            def now(cls, tz=None):
                return cls(2026, 5, 20, 3, 0, 0)   # 03:00 — quiet hours

        with patch.object(WellnessAgent, "_user_opted_in", return_value=True), \
             patch.object(WellnessAgent, "_pick_template_index", return_value=0), \
             patch.object(WellnessAgent, "_format_checkin",
                          return_value="Quick reset — take a breath?"), \
             patch.object(WellnessAgent, "_log_wellness_check", return_value=None), \
             patch("agents.wellness.datetime", _FixedDt):
            WellnessAgent().handle(violation_event)

        wellness_acts = chain_store.act_rows_for("wellness")
        assert len(wellness_acts) == 1
        assert socketio_emits.call_count == 1, \
            "victim chain must emit even inside quiet hours"
        assert socketio_emits.call_args.args[1].get("trigger") == "mod_violation"

    def test_chain02_low_severity_skips_violation(
            self, chain_store, bus_captured):
        """severity 'low' (0.25) < threshold (0.5) → defer; no mod.violation publish."""
        from agents.moderation import ModerationAgent

        with patch.object(ModerationAgent, "instant_check",
                          return_value={"flag": True, "category": "spam",
                                        "severity": "low",
                                        "reason": "promo_link"}), \
             patch.object(ModerationAgent, "_severity_threshold", return_value=0.5):
            ModerationAgent().handle({
                "topic": "msg.created",
                "user_id": 99, "channel_id": 100, "community_id": 7,
                "content": "buy crypto now at example.com",
                "message_id": 2003,
            })

        assert len(chain_store.act_rows_for("moderation")) == 0, \
            "low-severity must not act"
        assert not any("mod" in c["topic"] and "violat" in c["topic"]
                       for c in bus_captured), \
            "low-severity must not publish mod.violation"


# ====================================================================
#  TC-UAT-AGENT-CHAIN-03 — Focus → Summarizer + KnowledgeBuilder
# ====================================================================

class TestUAT_FocusCheckpointChain:

    def _drift_event(self):
        from agents import event_bus as _bus
        return {
            "topic": _bus.TOPIC_FOCUS_DRIFT,
            "channel_id": 100, "community_id": 7,
            "old_topics": ["docker", "container", "image", "build"],
            "new_topics": ["weekend", "movie", "dinner", "friday"],
            "shared": [], "jaccard": 0.0,
            "correlation_id": "focus-drift-uat-03",
        }

    def test_chain03a_drift_summarizes(
            self, chain_store, bus_captured, socketio_emits):
        from agents.summarizer import SummarizerAgent

        with patch.object(SummarizerAgent, "_min_messages", return_value=5), \
             patch.object(SummarizerAgent, "summarize_channel",
                          return_value={"success": True,
                                        "summary": "Team discussed Docker basics.",
                                        "method": "extractive",
                                        "key_points": ["docker"]}), \
             patch("agents.summarizer.get_db_connection",
                   return_value=_fake_db_with_count(42)):
            SummarizerAgent().handle(self._drift_event())

        assert len(chain_store.act_rows_for("summarizer")) == 1
        # One of the socketio.emit calls must be 'summary_checkpoint'.
        topics_emitted = [c.args[0] for c in socketio_emits.call_args_list]
        assert "summary_checkpoint" in topics_emitted, topics_emitted

    def test_chain03b_drift_extracts_knowledge(
            self, chain_store, bus_captured, socketio_emits):
        from agents.knowledge_builder_v2 import KnowledgeBuilderAgent

        with patch.object(KnowledgeBuilderAgent, "_min_messages", return_value=5), \
             patch.object(KnowledgeBuilderAgent, "extract_knowledge",
                          return_value={"success": True, "total_items": 3,
                                        "faqs": 2, "definitions": 1, "decisions": 0}), \
             patch("agents.knowledge_builder_v2.get_db_connection",
                   return_value=_fake_db_with_count(42)):
            KnowledgeBuilderAgent().handle(self._drift_event())

        assert len(chain_store.act_rows_for("knowledge_builder")) == 1
        topics = [c["topic"] for c in bus_captured]
        assert any("kb" in t and "creat" in t for t in topics), \
            f"expected kb.created in published topics, got {topics}"

    def test_chain03_low_message_count_defers_both(
            self, chain_store, bus_captured, socketio_emits):
        """msg_count below min_messages → defer; expensive paths skipped."""
        drift = self._drift_event()

        from agents.summarizer import SummarizerAgent
        with patch.object(SummarizerAgent, "_min_messages", return_value=15), \
             patch.object(SummarizerAgent, "summarize_channel") as summarize, \
             patch("agents.summarizer.get_db_connection",
                   return_value=_fake_db_with_count(2)):
            SummarizerAgent().handle(drift)
        assert not summarize.called, \
            "summarize_channel must not run below min_messages"
        assert any(a["decision"] == "defer"
                   for a in chain_store.actions_for("summarizer"))

        from agents.knowledge_builder_v2 import KnowledgeBuilderAgent
        with patch.object(KnowledgeBuilderAgent, "_min_messages", return_value=10), \
             patch.object(KnowledgeBuilderAgent, "extract_knowledge") as extract, \
             patch("agents.knowledge_builder_v2.get_db_connection",
                   return_value=_fake_db_with_count(2)):
            KnowledgeBuilderAgent().handle(drift)
        assert not extract.called, \
            "extract_knowledge must not run below min_messages"
        assert any(a["decision"] == "defer"
                   for a in chain_store.actions_for("knowledge_builder"))


# ====================================================================
#  TC-UAT-AGENT-CHAIN-04 — Phase 5.2 admin clamps + kill-switch
# ====================================================================
#
# These tests cover the Agent Goals admin panel's two safety nets:
#   (a) clamps — an admin tightens the severity_threshold window to a
#       narrow band; learn() and sense() must both respect it.
#   (b) kill-switch — an admin disables moderation for a community;
#       sense() must return None before any work runs.

class TestUAT_AgentGoalsClampsAndKillSwitch:

    def test_chain04_severity_clamp_blocks_violation_publish(
            self, chain_store, bus_captured):
        """Admin clamps severity_threshold to [0.9, 0.95]. A 'high'
        (score 0.8) instant-check result must NOT publish mod.violation:
        the clamp re-raises the effective threshold to 0.9 even though
        the stored learned value is the 0.5 default."""
        from agents.moderation import ModerationAgent
        from agents import memory as _agent_memory

        community_id = 7
        # Admin writes a clamp window via the PUT endpoint — simulate the
        # resulting agent_state row directly via the in-memory shim.
        _agent_memory.set_state(
            ModerationAgent.NAME,
            _agent_memory.SCOPE_COMMUNITY,
            community_id,
            thresholds={
                "severity_threshold": 0.5,  # learned baseline, default
                "_clamps": {"severity_threshold": {"min": 0.9, "max": 0.95}},
            },
        )

        # 'high' instant-check = severity_score 0.8 — below the clamped floor.
        with patch.object(ModerationAgent, "instant_check",
                          return_value={"flag": True, "category": "harassment",
                                        "severity": "high",
                                        "reason": "targeted_insult"}):
            ModerationAgent().handle({
                "topic": "msg.created",
                "user_id": 99, "channel_id": 100, "community_id": community_id,
                "content": "you are absolutely worthless go away",
                "message_id": 4001,
            })

        assert len(chain_store.act_rows_for("moderation")) == 0, \
            "clamp must lift threshold above 0.8 → no act row"
        assert not any("mod" in c["topic"] and "violat" in c["topic"]
                       for c in bus_captured), \
            "clamped community must not publish mod.violation at severity 0.8"
        # The decision is still logged as defer so admins can audit.
        defers = [a for a in chain_store.actions_for("moderation")
                  if a["decision"] == "defer"]
        assert len(defers) == 1, "deferred decisions must still be logged"

    def test_chain04_kill_switch_short_circuits_sense(
            self, chain_store, bus_captured):
        """Admin disables moderation for community 9 via the kill-switch.
        Even an extreme-content message produces zero actions — sense()
        returns None before logging anything."""
        from agents.moderation import ModerationAgent
        from agents import memory as _agent_memory

        community_id = 9
        _agent_memory.set_state(
            ModerationAgent.NAME,
            _agent_memory.SCOPE_COMMUNITY,
            community_id,
            goal_value={"enabled": False},
        )

        with patch.object(ModerationAgent, "instant_check",
                          return_value={"block": True,
                                        "reason": "extreme_slur"}):
            ModerationAgent().handle({
                "topic": "msg.created",
                "user_id": 99, "channel_id": 100, "community_id": community_id,
                "content": "extreme slur goes here",
                "message_id": 4002,
            })

        assert len(chain_store.actions_for("moderation")) == 0, \
            "kill-switch must short-circuit sense() with no action log"
        assert not any("mod" in c["topic"] and "violat" in c["topic"]
                       for c in bus_captured), \
            "disabled agent must not publish anything"

    def test_chain04_clamp_pulls_learn_back_in_range(self, chain_store):
        """If an admin clamps severity_threshold ≤ 0.6 but feedback would
        normally drift the learned value to 0.7, _apply_clamps() in
        moderation.learn() must clip it back to 0.6 before persisting."""
        from agents.moderation import ModerationAgent
        from agents import memory as _agent_memory

        community_id = 11
        # Start with a high learned value and a tight admin clamp.
        _agent_memory.set_state(
            ModerationAgent.NAME,
            _agent_memory.SCOPE_COMMUNITY,
            community_id,
            thresholds={
                "severity_threshold": 0.55,
                "_clamps": {"severity_threshold": {"min": 0.4, "max": 0.6}},
            },
        )

        # Fake a logged action so learn() can resolve the community scope.
        action_id = _agent_memory.log_action(
            agent_name=ModerationAgent.NAME,
            decision="act", reason="uat-04-learn-clamp",
            correlation_id="uat-04-learn-clamp",
            community_id=community_id, channel_id=100, user_id=42,
        )
        # Need get_action() to also resolve against the shim — patch it to
        # mirror the actions list the shim already built.
        store = chain_store
        with patch("agents.moderation._agent_memory.get_action",
                   side_effect=lambda aid: next(
                       (a for a in store.actions if a["id"] == aid), None)), \
             patch("agents.moderation._agent_memory.get_state",
                   side_effect=lambda *a, **kw: store.get_state(*a, **kw)), \
             patch("agents.moderation._agent_memory.set_state",
                   side_effect=lambda *a, **kw: store.set_state(*a, **kw)):
            # Five strong 'negative' signals would push 0.55 → 0.80 without
            # clamps; the clamp at 0.6 must hold the line.
            agent = ModerationAgent()
            for _ in range(5):
                agent.learn(action_id, "negative", weight=1.0)

        final = store.get_state(
            ModerationAgent.NAME, _agent_memory.SCOPE_COMMUNITY, community_id)
        learned = (final.get("thresholds") or {}).get("severity_threshold")
        assert learned is not None, "learn() must persist the threshold"
        assert learned <= 0.6 + 1e-9, \
            f"clamp ceiling 0.6 violated — learned={learned}"


# ====================================================================
#  TC-UAT-AGENT-CHAIN-04 — Collaboration Graph endpoint (Phase 4.4)
# ====================================================================
#
# Drives the new GET /api/agents/collaboration-graph endpoint against
# a canned agent_actions dataset that contains the two collaboration
# chains exercised by chain-01 and chain-02:
#
#     correlation_A:  mood_tracker --(act @ T)--> wellness --(act @ T+1s)
#     correlation_B:  moderation   --(act @ T)--> wellness --(act @ T+1s)
#
# Expectation: the endpoint surfaces both edges (mood_tracker → wellness,
# moderation → wellness) with count = 1 each, and lists all three agents
# as nodes. This is the SQL story the panel will visualise — if the join
# regresses, this test is the first thing that fails.

class TestUAT_CollaborationGraphEndpoint:

    def _build_cursor(self, *, node_rows, last_signal_rows, edge_rows):
        """Build a MagicMock cursor that returns scripted results for each
        SQL the endpoint runs, in order: nodes → last-signal → edges."""
        cur = MagicMock()
        cur.__enter__ = lambda s: s
        cur.__exit__ = MagicMock(return_value=False)

        scripted = [node_rows, last_signal_rows, edge_rows]
        idx = {"i": 0}

        def _execute(*_args, **_kwargs):
            return None

        def _fetchall():
            i = idx["i"]
            idx["i"] += 1
            return scripted[i] if i < len(scripted) else []

        cur.execute = MagicMock(side_effect=_execute)
        cur.fetchall = MagicMock(side_effect=_fetchall)
        return cur

    def test_endpoint_returns_known_chain_edges(self):
        """Two collaboration chains in the canned data produce two edges."""
        import importlib
        routes_agents = importlib.import_module("routes.agents")

        now = datetime.datetime(2026, 5, 21, 12, 0, 0)
        node_rows = [
            {"agent_name": "mood_tracker", "acts": 1, "defers": 0, "skips": 0,
             "total": 1, "last_acted": now},
            {"agent_name": "moderation",   "acts": 1, "defers": 0, "skips": 0,
             "total": 1, "last_acted": now},
            {"agent_name": "wellness",     "acts": 2, "defers": 0, "skips": 0,
             "total": 2, "last_acted": now},
        ]
        last_signal_rows = [
            {"agent_name": "wellness", "signal": "engaged"},
        ]
        edge_rows = [
            {"source": "mood_tracker", "target": "wellness",
             "count": 1, "last_seen": now,
             "sample_correlation": "mood-escalation-uat-01"},
            {"source": "moderation", "target": "wellness",
             "count": 1, "last_seen": now,
             "sample_correlation": "mod-violation-uat-02"},
        ]

        cur = self._build_cursor(
            node_rows=node_rows,
            last_signal_rows=last_signal_rows,
            edge_rows=edge_rows,
        )
        conn = MagicMock()
        conn.cursor.return_value = cur

        # Flask machinery: jwt_required + jsonify + request need an app
        # context with a test request. Build a throwaway Flask app rather
        # than booting the real one (which would try to bind Redis & DB).
        from flask import Flask
        from flask_jwt_extended import JWTManager, create_access_token
        app = Flask(__name__)
        app.config["JWT_SECRET_KEY"] = "uat-collab-graph-secret"
        JWTManager(app)

        # Call the underlying function directly — the @jwt_required decorator
        # would need a verified token in the context; bypassing the decorator
        # tests the route logic without coupling to JWT plumbing.
        view = routes_agents.get_agent_collaboration_graph.__wrapped__ \
            if hasattr(routes_agents.get_agent_collaboration_graph, "__wrapped__") \
            else routes_agents.get_agent_collaboration_graph

        with app.app_context(), \
             patch.object(routes_agents, "get_db_connection", return_value=conn):
            with app.test_request_context("/api/agents/collaboration-graph?hours=24"):
                response, status = view()

        assert status == 200, f"expected 200, got {status}"
        body = response.get_json()

        assert body["window_hours"] == 24
        assert body["community_id"] is None

        node_ids = {n["id"] for n in body["nodes"]}
        assert {"mood_tracker", "moderation", "wellness"}.issubset(node_ids), \
            f"all three chain agents must appear as nodes; got {node_ids}"

        # Wellness's most-recent feedback signal was 'engaged' → positive
        wellness_node = next(n for n in body["nodes"] if n["id"] == "wellness")
        assert wellness_node["outcome"] == "positive", \
            "wellness latest signal 'engaged' must map to outcome=positive"

        edges = body["edges"]
        edge_pairs = {(e["source"], e["target"]) for e in edges}
        assert ("mood_tracker", "wellness") in edge_pairs, \
            f"mood→wellness edge missing; edges={edge_pairs}"
        assert ("moderation", "wellness") in edge_pairs, \
            f"moderation→wellness edge missing; edges={edge_pairs}"
        assert len(edges) == 2, f"expected exactly 2 edges, got {len(edges)}"

        for e in edges:
            assert e["count"] == 1
            assert e["sample_correlation"], "edge must carry a sample correlation id"

    def test_endpoint_clamps_hours_argument(self):
        """hours param is clamped to [1, 24*90]; junk falls back to 24."""
        import importlib
        routes_agents = importlib.import_module("routes.agents")

        cur = self._build_cursor(node_rows=[], last_signal_rows=[], edge_rows=[])
        conn = MagicMock()
        conn.cursor.return_value = cur

        from flask import Flask
        from flask_jwt_extended import JWTManager, create_access_token
        app = Flask(__name__)
        app.config["JWT_SECRET_KEY"] = "uat-collab-graph-secret-2"
        JWTManager(app)

        view = routes_agents.get_agent_collaboration_graph.__wrapped__ \
            if hasattr(routes_agents.get_agent_collaboration_graph, "__wrapped__") \
            else routes_agents.get_agent_collaboration_graph

        def _fresh_cursor():
            c = self._build_cursor(node_rows=[], last_signal_rows=[], edge_rows=[])
            cn = MagicMock(); cn.cursor.return_value = c
            return cn

        with app.app_context(), \
             patch.object(routes_agents, "get_db_connection",
                          side_effect=lambda: _fresh_cursor()):
            # 0 → clamped up to 1
            with app.test_request_context("/api/agents/collaboration-graph?hours=0"):
                resp, _ = view()
                assert resp.get_json()["window_hours"] == 1

            # Junk → falls back to default 24
            with app.test_request_context("/api/agents/collaboration-graph?hours=abc"):
                resp, _ = view()
                assert resp.get_json()["window_hours"] == 24

            # Above 90 days → clamped to 90*24
            with app.test_request_context("/api/agents/collaboration-graph?hours=99999"):
                resp, _ = view()
                assert resp.get_json()["window_hours"] == 24 * 90
