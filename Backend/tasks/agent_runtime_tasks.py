"""
Celery task that runs one agent for one trigger.

Queued by ``agents.runtime.router_agent.CustomAgentRouter``. The LLM loop runs
here (not in the orchestrator thread) so a slow model call never delays other
agents.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from celery_app import celery_app

log = logging.getLogger(__name__)

_UNAVAILABLE_TEXT = "I can't answer right now because the AI service is not configured."

# Someone is waiting for an answer only when they spoke to the agent directly. Passive runs
# (schedules, welcomes, keyword/channel triggers) stay silent when they fail.
_DIRECT_KINDS = ("mention", "reply", "dm")
# Triggers whose output is a fresh message rather than a reply to someone's message.
_STANDALONE_KINDS = ("member_joined", "schedule", "api", "channel_silent", "focus_drift", "mood_escalation")


def build_user_message(defn: Any, trigger: Dict[str, Any]) -> str:
    """The text the agent should respond to."""
    from agents.runtime.triggers import mention_names, strip_mentions
    kind = trigger.get("type")
    if kind == "schedule":
        return trigger.get("prompt") or "Run your scheduled task now."
    if kind == "member_joined":
        return (f"A new member, @{trigger.get('username')}, just joined the community. "
                "Write a short, friendly welcome message for the channel.")
    if kind == "channel_silent":
        minutes = trigger.get("silent_minutes")
        quiet = f"about {minutes} minutes" if minutes else "a while"
        return (f"This channel has been quiet for {quiet}. Do what your instructions say for this moment. "
                "If they do not cover it, write one short, friendly message that could restart the "
                "conversation, after looking at the recent messages so it fits the channel. "
                "Reply with only the message itself.")
    if kind == "focus_drift":
        old = ", ".join(trigger.get("old_topics") or []) or "an earlier topic"
        new = ", ".join(trigger.get("new_topics") or []) or "something new"
        return (f"The conversation in this channel just moved from {old} to {new}. Do what your "
                "instructions say for this moment. If they do not cover it, write one short, neutral "
                "message that notes the shift and asks whether to carry on with the earlier topic. "
                "Reply with only the message itself.")
    if kind == "mood_escalation":
        mood = trigger.get("primary_mood")
        felt = f" (it reads as {mood})" if mood else ""
        return ("Your owner's recent messages suggest they may be having a hard time" + felt + ". They "
                "turned on mood tracking, and only they will see what you write. Do what your instructions "
                "say for this moment. If they do not cover it, write a short, warm check-in: ask how they "
                "are, offer one small idea, and do not quote their messages or mention scores. "
                "Reply with only the message itself.")
    if kind in ("api", "dm"):
        return (trigger.get("content") or "").strip() or "Hello"
    text = trigger.get("content") or ""
    for name in mention_names(defn):
        text = strip_mentions(text, name)
    return text or "Hello"


@celery_app.task(name="tasks.agent_runtime_tasks.run_agent_task", bind=True,
                 max_retries=0, soft_time_limit=100)
def run_agent_task(self, agent_id: int, trigger: Dict[str, Any]) -> Dict[str, Any]:
    from agents.runtime import integrations
    from agents.runtime.definitions import get_definition, to_spec
    from agents.runtime.loop import run_agent
    from agents.runtime import private
    from agents.runtime.posting import emit_run_event, post_as_agent
    from agents.runtime.store import get_default_store
    from agents.runtime.threads import thread_history
    from agents.runtime.tools import ToolContext

    defn = get_definition(agent_id)
    if defn is None:
        return {"status": "skipped", "reason": "agent_inactive_or_missing"}

    channel_id: Optional[int] = trigger.get("channel_id")
    message_id: Optional[int] = trigger.get("message_id")
    kind = trigger.get("type") or "mention"
    # Private: the answer is a DM to one person, and the run cannot post anywhere (read tools only).
    is_private = private.is_private(trigger)
    to_user = private.recipient(defn, trigger) if is_private else None
    if is_private and not to_user:
        return {"status": "skipped", "reason": "no_recipient"}
    if not channel_id and not is_private:
        return {"status": "skipped", "reason": "no_channel"}

    if not is_private:
        emit_run_event(defn, channel_id, "agent_run_started", message_id=message_id, trigger=kind)
    status, reply_id, run_id = "failed", None, None
    try:
        history = []
        if kind == private.DM_KIND:
            history = private.dm_history(defn.bot_user_id, to_user, before_id=message_id)
        elif trigger.get("reply_to"):
            history = thread_history(trigger["reply_to"], defn.bot_user_id)
        ctx = ToolContext(
            invoked_by=trigger.get("user_id"), community_id=trigger.get("community_id"),
            channel_id=channel_id, approver_id=trigger.get("user_id") or defn.owner_user_id,
            is_dry_run=is_private,
            extra={"invoker_username": trigger.get("username"), "agent_id": defn.id,
                   "builtin": defn.is_builtin})
        spec = private.private_spec(to_spec(defn)) if is_private else to_spec(defn)

        if any(t.startswith("mcp_") for t in defn.tools):
            from agents.runtime import mcp
            mcp.register_for_agent(defn.id)
        result = run_agent(
            spec, build_user_message(defn, trigger), ctx=ctx, history=history,
            store=get_default_store(), trigger_type=kind, agent_id=defn.id,
            trigger_message_id=message_id)
        status, run_id = result.status, result.run_id
        if result.approvals:
            from agents.runtime.approvals import announce_requested
            announce_requested(result.approvals, ctx.approver_id)
            integrations.dispatch(defn.id, defn.public_id, "approval.requested",
                                  {"run_id": run_id, "approval_ids": list(result.approvals), "channel_id": channel_id})

        if (result.ok or kind in _DIRECT_KINDS) and is_private:
            sent = private.deliver_privately(defn, to_user, result.text or _UNAVAILABLE_TEXT, run_id=run_id)
            reply_id = sent["id"] if sent else None
        elif result.ok or kind in _DIRECT_KINDS:
            reply = result.text or _UNAVAILABLE_TEXT
            posted = post_as_agent(
                defn, channel_id, reply,
                reply_to=message_id if kind not in _STANDALONE_KINDS else None, run_id=run_id)
            reply_id = posted["id"] if posted else None
    except Exception:  # noqa: BLE001
        log.exception("[RUNTIME] run_agent_task crashed (agent=%s)", agent_id)
    finally:
        if not is_private:
            emit_run_event(defn, channel_id, "agent_run_finished", message_id=message_id,
                           status=status, reply_message_id=reply_id)
        integrations.dispatch(defn.id, defn.public_id, "run.finished",
                              {"run_id": run_id, "status": status, "channel_id": channel_id,
                               "reply_message_id": reply_id, "trigger": kind})
    return {"status": status, "run_id": run_id, "reply_message_id": reply_id}


@celery_app.task(name="tasks.agent_runtime_tasks.resolve_approval_task", ignore_result=True,
                 max_retries=0, soft_time_limit=60)
def resolve_approval_task(approval_id: int) -> None:
    """After a decision: run the approved tool, or tell the channel it was declined."""
    from agents.runtime import approvals
    try:
        row = approvals.get(approval_id)
        if row is None:
            return
        if row["status"] == approvals.APPROVED:
            approvals.execute(approval_id)
        elif row["status"] == approvals.REJECTED:
            approvals.finish_rejected(approval_id)
    except Exception:  # noqa: BLE001
        log.exception("[RUNTIME] resolve_approval_task failed (approval=%s)", approval_id)


@celery_app.task(name="tasks.agent_runtime_tasks.deliver_webhook_task", bind=True, ignore_result=True,
                 max_retries=3, soft_time_limit=30)
def deliver_webhook_task(self, webhook_id: int, payload: Dict[str, Any]) -> Optional[int]:
    """Send one signed event to one webhook. A receiver that is down or overloaded is tried again
    after 30 s, 2 min and 10 min (``integrations.RETRY_DELAYS``); each try records its outcome."""
    from agents.runtime import integrations
    from database import get_db_connection
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            status, retry = integrations.attempt(cur, webhook_id, payload)
        conn.commit()
    except Exception:  # noqa: BLE001
        log.exception("[RUNTIME] deliver_webhook_task failed (webhook=%s)", webhook_id)
        return None
    finally:
        if conn:
            conn.close()
    tries = self.request.retries
    if retry and tries < len(integrations.RETRY_DELAYS):
        raise self.retry(countdown=integrations.RETRY_DELAYS[tries])
    return status


@celery_app.task(name="tasks.agent_runtime_tasks.expire_approvals", ignore_result=True)
def expire_approvals() -> int:
    """Beat entry (every 5 minutes): expire approvals nobody answered."""
    from agents.runtime import approvals
    try:
        return approvals.expire_due()
    except Exception:  # noqa: BLE001
        log.exception("[RUNTIME] expire_approvals failed")
        return 0


@celery_app.task(name="tasks.agent_runtime_tasks.deliver_reminders", ignore_result=True)
def deliver_reminders() -> int:
    """Beat entry (every minute): post the reminders that have come due."""
    from agents.runtime import reminders
    try:
        return reminders.deliver_due()
    except Exception:  # noqa: BLE001
        log.exception("[RUNTIME] deliver_reminders failed")
        return 0


@celery_app.task(name="tasks.agent_runtime_tasks.run_due_agent_schedules", ignore_result=True)
def run_due_agent_schedules() -> int:
    """Beat entry (every minute): enqueue every agent schedule that is due."""
    from agents.runtime.schedules import run_due_schedules
    try:
        return run_due_schedules()
    except Exception:  # noqa: BLE001
        log.exception("[RUNTIME] run_due_schedules failed")
        return 0
