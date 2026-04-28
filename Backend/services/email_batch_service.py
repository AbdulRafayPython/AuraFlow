"""
Email Batch Service
====================
Queues email notification events into Redis and schedules a Celery task
to send a batched digest email after a configurable interval (default 5 min).

Flow:
  1. queue_email_notification(user_id, event_type, metadata)
  2.   → Checks user's notification_settings (respects master switch + per-type toggles)
  3.   → Pushes event JSON to Redis list  `pending_emails:{user_id}`
  4.   → If no timer exists (`email_timer:{user_id}`), sets one + schedules Celery task
  5. After the interval, Celery task `process_email_batch` fires and sends one digest email.
"""

import json
import logging
from datetime import datetime

log = logging.getLogger(__name__)


_DEFAULTS = {
    "email_alerts_enabled": True,
    "email_dms_and_calls": True,
    "email_community_messages": False,
    "email_agent_notifications": True,
    "email_agent_summaries": True,
    "email_batch_interval_minutes": 5,
}

# Map event_type → settings key that controls it
_EVENT_TYPE_MAP = {
    "dm": "email_dms_and_calls",
    "missed_call": "email_dms_and_calls",
    "community_message": "email_community_messages",
    "mention": "email_community_messages",
    "agent_notification": "email_agent_notifications",
    "agent_summary": "email_agent_summaries",
    "summary_ready": "email_agent_summaries",
}


def _get_user_notification_settings(user_id: int) -> dict:
    """Fetch notification_settings for a user from the normalized table, merged with defaults."""
    from database import get_db_connection
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM user_notification_settings WHERE user_id = %s",
                (user_id,),
            )
            row = cur.fetchone()
            if not row:
                return dict(_DEFAULTS)
            return {
                "email_alerts_enabled": bool(row.get("email_alerts_enabled", True)),
                "email_dms_and_calls": bool(row.get("email_dms_and_calls", True)),
                "email_community_messages": bool(row.get("email_community_messages", False)),
                "email_agent_notifications": bool(row.get("email_agent_notifications", True)),
                "email_agent_summaries": bool(row.get("email_agent_summaries", True)),
                "email_batch_interval_minutes": row.get("email_batch_interval_minutes", 5),
            }
    finally:
        conn.close()


def queue_email_notification(user_id: int, event_type: str, metadata: dict):
    """
    Queue an email notification event for batched delivery.

    Parameters
    ----------
    user_id : int
        Target user's DB id.
    event_type : str
        One of 'dm', 'missed_call', 'community_message', 'mention',
        'agent_notification', 'agent_summary', 'summary_ready'.
    metadata : dict
        Arbitrary data describing the event (sender, message preview, etc.).
    """
    from services.redis_client import get_redis

    # 1. Check user preferences
    settings = _get_user_notification_settings(user_id)

    if not settings.get("email_alerts_enabled", True):
        log.debug(f"[EMAIL BATCH] User {user_id} has email alerts disabled — skipping")
        return

    pref_key = _EVENT_TYPE_MAP.get(event_type)
    if pref_key and not settings.get(pref_key, True):
        log.debug(f"[EMAIL BATCH] User {user_id} has {pref_key} disabled — skipping {event_type}")
        return

    # 2. Push event to Redis list
    r = get_redis()
    if r is None:
        log.warning("[EMAIL BATCH] Redis unavailable — cannot queue email notification")
        return

    list_key = f"pending_emails:{user_id}"
    timer_key = f"email_timer:{user_id}"

    event = {
        "event_type": event_type,
        "metadata": metadata,
        "queued_at": datetime.utcnow().isoformat(),
    }

    try:
        r.rpush(list_key, json.dumps(event, default=str))
        log.info(f"[EMAIL BATCH] Queued {event_type} for user {user_id}")
    except Exception as e:
        log.error(f"[EMAIL BATCH] Failed to push event to Redis: {e}")
        return

    # 3. Schedule Celery task if no timer running
    try:
        if not r.exists(timer_key):
            batch_minutes = settings.get("email_batch_interval_minutes", 5)
            r.setex(timer_key, batch_minutes * 60, "1")

            from tasks.email_tasks import process_email_batch
            process_email_batch.apply_async(
                args=[user_id],
                countdown=batch_minutes * 60,
            )
            log.info(
                f"[EMAIL BATCH] Scheduled digest for user {user_id} in {batch_minutes} min"
            )
    except Exception as e:
        log.error(f"[EMAIL BATCH] Failed to schedule Celery task: {e}")
