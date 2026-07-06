"""
Celery glue for the autonomous-agent orchestrator
=================================================
Two entries:

- `publish_minute_tick` — Beat-scheduled every minute. Publishes a
  `tick.minute` event onto the bus so adaptive-schedule agents (those
  that decide their own cadence) can re-evaluate.

- `run_orchestrator` — long-running task that subscribes to every topic
  and fans out to interested agents. Submit it manually (e.g. on worker
  boot via a signal handler, or via `celery call`) — Beat does not own
  long-lived tasks. The function is idempotent: a duplicate invocation
  simply blocks on Redis pub/sub like the first one and will receive
  the same events.

NOTE: until agents register themselves in `agents/orchestrator.py:_REGISTRY`,
`run_orchestrator` is a no-op subscriber that just drains events. That is
intentional for Phase 0.
"""

from __future__ import annotations

import logging
import time

from celery_app import celery_app

log = logging.getLogger(__name__)


@celery_app.task(name="tasks.orchestrator_tasks.publish_minute_tick",
                 queue="periodic", ignore_result=True)
def publish_minute_tick() -> dict:
    """Publish a single `tick.minute` event. Cheap; runs every minute."""
    from agents import event_bus
    now = time.gmtime()
    payload = {
        "minute": now.tm_min,
        "hour":   now.tm_hour,
        "wday":   now.tm_wday,
    }
    ok = event_bus.publish(event_bus.TOPIC_TICK_MINUTE, payload)
    return {"published": ok, **payload}


@celery_app.task(name="tasks.orchestrator_tasks.run_orchestrator",
                 queue="periodic", ignore_result=True)
def run_orchestrator() -> None:
    """Blocking orchestrator loop. Run as a dedicated long-lived task."""
    from agents.orchestrator import run_loop
    try:
        run_loop()
    except Exception as exc:
        log.exception(f"[orchestrator_tasks] run_loop crashed: {exc}")
        raise
