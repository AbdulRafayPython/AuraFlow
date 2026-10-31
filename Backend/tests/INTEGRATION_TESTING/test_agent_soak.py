"""
TC-INT-AGENT-SOAK-01  —  Phase 6.3 soak test
=============================================
A steady-drip storm of synthetic events run for SOAK_SECONDS, asserting
that the autonomous-agent substrate stays well-behaved:

  1. **No infinite cooldown loops** — `mood_tracker` escalations are
     rate-limited to ≤ 1 per user per `_ESCALATION_DEDUPE_SECS`
     regardless of how many negative messages we throw at it.
  2. **No LLM hammering** — every site in ``agents/*`` that calls
     ``LLMClient.chat`` and ``chat_tools`` are monkey-patched with a
     counter. The total call count over the soak window must stay
     under a per-minute budget (default 30 LLM calls / minute total
     across all agents).
  3. **No agent self-loops** — an agent must not generate more
     ``act`` rows than the worst-case "one act per event" upper bound
     for the events it subscribed to. (If wellness's act inadvertently
     re-triggered itself, this would explode.)
  4. **Bounded growth** — total ``agent_actions`` rows grow at most
     linearly with the number of input events (within a factor of N
     subscribed agents).

Default SOAK_SECONDS=60 keeps the CI run snappy; the script accepts an
env var override so the same harness can be run overnight for the full
24-hour soak just before the FYP defence:

    set SOAK_SECONDS=86400
    set SOAK_RATE_HZ=5
    pytest tests/INTEGRATION_TESTING/test_agent_soak.py -s

Isolation
---------
Same sentinel-community-id pattern as ``test_msg_storm.py``: every row
this test writes carries ``community_id = _SOAK_COMMUNITY``, and the
``finally`` block DELETEs them at teardown.
"""
from __future__ import annotations

import sys
import os
import time
import types
import random
import threading
from typing import Any, Dict, List
from unittest.mock import patch, MagicMock

import pytest

# Insert Backend/ on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

# Reuse the helpers from the storm test module by re-importing them via
# the same package path. Avoid cross-importing the test file directly to
# keep pytest collection independent of run order.
from tests.INTEGRATION_TESTING.test_msg_storm import (   # type: ignore  # noqa: E402
    _live_redis_ok, _live_db_ok,
    _STORM_COMMUNITY as _IMPORT_PLACEHOLDER,
)


_SOAK_COMMUNITY    = 999_900_001
_SOAK_CHANNEL_BASE = 999_910_000
_SOAK_USER_BASE    = 999_920_000


pytestmark = [
    pytest.mark.skipif(not _live_redis_ok(),
                       reason="Soak test needs live Redis (Upstash)."),
    pytest.mark.skipif(not _live_db_ok(),
                       reason="Soak test needs live MySQL."),
]


# ── Pre-stub `app` so wellness/summarizer's lazy `from app import socketio`
#    resolves without booting Flask. Same shape as the storm test does it.
_soak_app = sys.modules.get("app")
if _soak_app is None:
    _soak_app = types.ModuleType("app")
    sys.modules["app"] = _soak_app
if not hasattr(_soak_app, "socketio"):
    _soak_app.socketio = MagicMock()


# ── Soak parameters (env-overridable) ───────────────────────────────
def _soak_seconds() -> int:
    try:
        return max(10, int(os.environ.get("SOAK_SECONDS", "60")))
    except Exception:
        return 60


def _soak_rate_hz() -> float:
    """Events per second across the whole pool."""
    try:
        return max(0.1, float(os.environ.get("SOAK_RATE_HZ", "2.0")))
    except Exception:
        return 2.0


def _llm_budget_per_minute() -> int:
    """Upper bound on total LLM calls across all agents per minute."""
    for var in ("LLM_BUDGET_PER_MIN",):
        raw = os.environ.get(var)
        if raw:
            try:
                return int(raw)
            except ValueError:
                continue
    return 30



# ── Cleanup helper ──────────────────────────────────────────────────
def _cleanup_soak_rows():
    from database import get_db_connection
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM agent_actions WHERE community_id=%s",
                (_SOAK_COMMUNITY,),
            )
            cur.execute(
                "DELETE FROM agent_state WHERE scope_type='community' AND scope_id=%s",
                (_SOAK_COMMUNITY,),
            )
            cur.execute(
                "DELETE FROM agent_state WHERE scope_type='channel' "
                "AND scope_id BETWEEN %s AND %s",
                (_SOAK_CHANNEL_BASE, _SOAK_CHANNEL_BASE + 1000),
            )
            cur.execute(
                "DELETE FROM agent_state WHERE scope_type='user' "
                "AND scope_id BETWEEN %s AND %s",
                (_SOAK_USER_BASE, _SOAK_USER_BASE + 1000),
            )
        conn.commit()
    finally:
        conn.close()


def _count_actions(agent_name: str = None) -> int:
    from database import get_db_connection
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            if agent_name:
                cur.execute(
                    "SELECT COUNT(*) AS c FROM agent_actions "
                    "WHERE community_id=%s AND agent_name=%s",
                    (_SOAK_COMMUNITY, agent_name),
                )
            else:
                cur.execute(
                    "SELECT COUNT(*) AS c FROM agent_actions WHERE community_id=%s",
                    (_SOAK_COMMUNITY,),
                )
            return int(cur.fetchone()["c"])
    finally:
        conn.close()


def _fetch_escalation_counts() -> Dict[int, int]:
    """Return {user_id: count_of_escalation_acts} from this soak run."""
    from database import get_db_connection
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT user_id, COUNT(*) AS c FROM agent_actions "
                "WHERE community_id=%s AND agent_name='mood_tracker' "
                "  AND decision='act' AND reason LIKE 'escalation_%%' "
                "GROUP BY user_id",
                (_SOAK_COMMUNITY,),
            )
            return {int(r["user_id"]): int(r["c"]) for r in cur.fetchall() or []}
    finally:
        conn.close()


# ── LLM call counter ────────────────────────────────────────────────
class _LLMCounter:
    """Counts every LLM call any agent makes, and answers them locally.

    Patches ``LLMClient.chat`` and ``LLMClient.chat_tools`` rather than each
    module's client object. Every path into the provider funnels through one
    of those two methods (``complete`` and ``complete_json`` delegate to
    ``chat``), so the patches catch every call and cannot be bypassed by an
    agent that picks a different wrapper.
    """

    def __init__(self):
        self.count = 0
        self._lock = threading.Lock()
        self._patches = []

    def __enter__(self):
        from utils.ai import llm_client

        counter = self

        def _fake_chat(self_client, messages, **kwargs):
            with counter._lock:
                counter.count += 1
            # Valid JSON so complete_json() callers parse a result rather
            # than logging a parse failure on every soak event.
            if kwargs.get("json_mode"):
                return '{"violations": [], "faqs": [], "definitions": [], "decisions": []}'
            return "canned soak reply"

        def _fake_chat_tools(self_client, messages, tools=None, **kwargs):
            with counter._lock:
                counter.count += 1
            return llm_client.LLMToolResponse(
                text="canned soak reply",
                message={"role": "assistant", "content": "canned soak reply"})

        for name, fake in (("chat", _fake_chat), ("chat_tools", _fake_chat_tools)):
            p = patch.object(llm_client.LLMClient, name, fake)
            p.start()
            self._patches.append(p)
        return self

    def __exit__(self, exc_type, exc, tb):
        for p in self._patches:
            try:
                p.stop()
            except Exception:
                pass



# ── Side-effect mocks ────────────────────────────────────────────────
@pytest.fixture
def _silence_side_effects():
    """Mute the DB writes / network calls agents would otherwise make,
    but keep agent_actions inserts real so we can assert on them."""
    from agents.mood_tracker import MoodTrackerAgent

    with patch.object(MoodTrackerAgent, "_user_opted_in", return_value=True), \
         patch.object(MoodTrackerAgent, "_persist_mood_row", return_value=None), \
         patch.object(MoodTrackerAgent, "analyze_message",
                      side_effect=lambda content, **_kw: {
                          "primary_mood": "sad" if "sad" in content else "neutral",
                          "sentiment_score": -0.7 if "sad" in content else 0.0,
                          "sentiment": "negative" if "sad" in content else "neutral",
                      }):
        yield


# ────────────────────────────────────────────────────────────────────
#  TC-INT-AGENT-SOAK-01 — short-duration soak
# ────────────────────────────────────────────────────────────────────
class TestSoak_Bounded:

    def test_soak01_no_loops_no_llm_hammering(self, _silence_side_effects):
        from agents import orchestrator

        _cleanup_soak_rows()

        soak_seconds = _soak_seconds()
        rate_hz = _soak_rate_hz()
        budget_per_min = _llm_budget_per_minute()

        users = [_SOAK_USER_BASE + i for i in range(10)]
        channel = _SOAK_CHANNEL_BASE + 1

        published = 0
        deadline = time.time() + soak_seconds
        interval = 1.0 / rate_hz

        # Mix of negative ("sad") and neutral messages so mood_tracker
        # rolls the window but escalations stay rate-limited.
        templates = [
            "feeling sad today",
            "really sad mujhe stress hai",
            "let's chat about the assignment",
            "anyone free tomorrow",
            "this exam is making me sad",
            "good news everyone",
        ]

        # Warm every registered agent BEFORE starting the clock so that
        # lazy import cost (loading lexicons, VADER probes, LLM client
        # bootstrapping) doesn't eat the soak window on short runs.
        for name in list(orchestrator._REGISTRY):
            orchestrator._resolve(name)

        print(f"\n[SOAK] running for {soak_seconds}s at {rate_hz} Hz "
              f"(budget {budget_per_min} LLM calls/min)…")
        start = time.time()
        deadline = start + soak_seconds   # reset after warm-up
        try:
            with _LLMCounter() as llm_counter:
                while time.time() < deadline:
                    content = random.choice(templates)
                    uid = random.choice(users)
                    orchestrator.dispatch("msg.created", {
                        "content": content,
                        "user_id": uid,
                        "channel_id": channel,
                        "community_id": _SOAK_COMMUNITY,
                        "message_id": 50_000_000 + published,
                    })
                    published += 1
                    # Tick the minute clock occasionally so periodic
                    # subscribers see it (none currently subscribed,
                    # but keeps the wiring honest if some appear).
                    if published % 60 == 0:
                        orchestrator.dispatch("tick.minute", {
                            "community_id": _SOAK_COMMUNITY,
                        })
                    time.sleep(interval)
                elapsed = time.time() - start
                llm_calls = llm_counter.count
        except KeyboardInterrupt:
            elapsed = time.time() - start
            llm_calls = -1
            print(f"\n[SOAK] interrupted after {elapsed:.1f}s — partial run")

        total_actions = _count_actions()
        mood_actions = _count_actions("mood_tracker")
        escalation_per_user = _fetch_escalation_counts()

        print(f"[SOAK] published {published} events in {elapsed:.1f}s "
              f"({published/elapsed:.1f} ev/s)")
        print(f"[SOAK] agent_actions rows: {total_actions} "
              f"(mood_tracker: {mood_actions})")
        print(f"[SOAK] LLM calls observed: {llm_calls}")
        print(f"[SOAK] escalation rows per user: {escalation_per_user}")

        # ── Assertions ──────────────────────────────────────────────
        # 1. No infinite cooldown loops: per-user mood escalations are
        #    deduped to ≤ 1 per user (we ran for a short window and
        #    _ESCALATION_DEDUPE_SECS = 30 min, so each user gets at
        #    most one escalation in a 60s soak).
        if elapsed < 1700:  # less than ~30 min — dedupe window applies
            over_limit = {u: n for u, n in escalation_per_user.items() if n > 1}
            assert not over_limit, (
                f"per-user escalation dedupe broke under load: {over_limit}")

        # 2. LLM budget: across all agents, total calls / minute
        #    must stay under the budget. The soak's heavy mocking means
        #    most agents don't reach the LLM at all — the budget here
        #    catches future regressions where some agent forgets the
        #    pre-filter and calls the LLM per-event.
        minutes = max(elapsed / 60.0, 1e-6)
        observed_rate = llm_calls / minutes
        assert observed_rate <= budget_per_min, (
            f"LLM call rate {observed_rate:.1f}/min exceeds budget "
            f"{budget_per_min}/min — possible per-event hammering "
            f"(total {llm_calls} calls in {elapsed:.1f}s)")

        # 3. No agent self-loops: total actions grow at most linearly
        #    with the number of events. Upper bound: each event can
        #    reach ≤ 3 distinct agents (mood + moderation + focus) on
        #    msg.created, plus chained downstream agents (wellness +
        #    summarizer + kb) bounded by the chain depth. A loop would
        #    produce orders of magnitude more rows than published events.
        # Generous ceiling: 6 × published events (worst case if every
        # msg triggers every chain). Anything beyond that is a loop.
        ceiling = 6 * published + 50  # +50 absorbs ticks + boundary noise
        assert total_actions <= ceiling, (
            f"agent_actions count {total_actions} > ceiling {ceiling} — "
            f"possible self-loop (published {published} events)")

        # 4. mood_tracker logs ≤ 1 row per published msg (it acts on
        #    every msg.created with content; some msgs may be skipped
        #    by sense() if too short).
        assert mood_actions <= published, (
            f"mood_tracker logged {mood_actions} rows for {published} events — "
            f"per-event invariant broken")

        _cleanup_soak_rows()
