"""
Email Tasks
============
Celery tasks for processing batched email notifications.

The main task `process_email_batch` is scheduled by `email_batch_service`
after the user's configured batch interval (default 5 min). It pulls all
queued events from Redis, groups them, renders an HTML digest, and sends
one email via SMTP.
"""

import json
import logging
from celery_app import celery_app

log = logging.getLogger(__name__)


@celery_app.task(name="tasks.email_tasks.process_email_batch", bind=True, max_retries=2)
def process_email_batch(self, user_id: int):
    """
    Drain the pending_emails:{user_id} Redis list and send a single
    digest email to the user.
    """
    from services.redis_client import get_redis
    from database import get_db_connection

    r = get_redis()
    if r is None:
        log.warning("[EMAIL TASK] Redis unavailable — cannot process batch")
        return

    list_key = f"pending_emails:{user_id}"
    timer_key = f"email_timer:{user_id}"

    # Drain all queued events atomically
    pipe = r.pipeline()
    pipe.lrange(list_key, 0, -1)
    pipe.delete(list_key)
    pipe.delete(timer_key)
    results = pipe.execute()

    raw_events = results[0]
    if not raw_events:
        log.info(f"[EMAIL TASK] No pending events for user {user_id} — skipping")
        return

    events = []
    for raw in raw_events:
        try:
            events.append(json.loads(raw))
        except (json.JSONDecodeError, TypeError):
            continue

    if not events:
        return

    # Fetch user email
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT email, username, display_name FROM users WHERE id = %s",
                (user_id,),
            )
            user = cur.fetchone()
    finally:
        conn.close()

    if not user or not user.get("email"):
        log.warning(f"[EMAIL TASK] User {user_id} has no email — skipping")
        return

    # Group events by type
    grouped = {}
    for ev in events:
        et = ev.get("event_type", "other")
        grouped.setdefault(et, []).append(ev.get("metadata", {}))

    # Render and send
    try:
        html = _render_digest_html(user, grouped, len(events))
        _send_digest_email(user["email"], html)
        log.info(
            f"[EMAIL TASK] Digest sent to {user['email']} ({len(events)} events)"
        )
    except Exception as exc:
        log.error(f"[EMAIL TASK] Failed to send digest: {exc}", exc_info=True)
        raise self.retry(exc=exc, countdown=60)


# ── Rendering ────────────────────────────────────────────────────────

_EVENT_LABELS = {
    "dm": "Direct Messages",
    "missed_call": "Missed Calls",
    "community_message": "Community Messages",
    "mention": "Mentions",
    "agent_notification": "Agent Notifications",
    "agent_summary": "Agent Summaries",
    "summary_ready": "Summaries Ready",
}

_EVENT_ICONS = {
    "dm": "💬",
    "missed_call": "📞",
    "community_message": "📢",
    "mention": "@",
    "agent_notification": "🤖",
    "agent_summary": "📄",
    "summary_ready": "📄",
}


def _render_digest_html(user: dict, grouped: dict, total: int) -> str:
    display = user.get("display_name") or user.get("username", "there")

    sections_html = ""
    for etype, items in grouped.items():
        label = _EVENT_LABELS.get(etype, etype.replace("_", " ").title())
        icon = _EVENT_ICONS.get(etype, "🔔")
        count = len(items)

        # Build item rows (max 5 per section to keep email short)
        item_rows = ""
        for item in items[:5]:
            sender = item.get("sender_name") or item.get("sender", "Someone")
            preview = item.get("preview") or item.get("title") or item.get("message", "")
            if len(preview) > 120:
                preview = preview[:117] + "..."
            context = item.get("community_name") or item.get("channel_name") or ""
            context_html = f'<span style="color:#6b7280;font-size:12px;"> in {context}</span>' if context else ""

            item_rows += f"""
            <tr>
              <td style="padding:8px 12px;border-bottom:1px solid #374151;">
                <strong style="color:#e2e8f0;">{sender}</strong>{context_html}<br/>
                <span style="color:#9ca3af;font-size:13px;">{preview}</span>
              </td>
            </tr>"""

        if count > 5:
            item_rows += f"""
            <tr>
              <td style="padding:8px 12px;color:#818cf8;font-size:13px;">
                … and {count - 5} more
              </td>
            </tr>"""

        sections_html += f"""
        <div style="margin-bottom:20px;">
          <h3 style="color:#a78bfa;font-size:16px;margin:0 0 8px;">
            {icon} {label} ({count})
          </h3>
          <table width="100%" cellpadding="0" cellspacing="0"
                 style="background:#1e1b4b;border-radius:8px;overflow:hidden;">
            {item_rows}
          </table>
        </div>"""

    return f"""
    <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#1a0b2e;border-radius:12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <h1 style="color:#a78bfa;margin:0;font-size:28px;">AuraFlow</h1>
        <p style="color:#9ca3af;font-size:14px;margin-top:4px;">Notification Digest</p>
      </div>
      <div style="background:#2d1b69;border-radius:8px;padding:24px;margin-bottom:24px;">
        <p style="color:#e2e8f0;font-size:15px;margin:0 0 16px;">
          Hey <strong>{display}</strong>, here's what you missed:
        </p>
        {sections_html}
      </div>
      <p style="color:#4b5563;font-size:11px;text-align:center;">
        You can change email notification preferences in
        <strong style="color:#818cf8;">Settings → Notifications</strong>.
      </p>
    </div>
    """


# ── Sending ──────────────────────────────────────────────────────────

def _send_digest_email(to_email: str, html_body: str):
    """Send the digest email via SMTP (reuses existing config)."""
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    from config import SMTP_EMAIL, SMTP_SERVER, SMTP_PORT, SMTP_APP_PASSWORD

    subject = "AuraFlow — You have new notifications"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = SMTP_EMAIL or "no-reply@auraflow.local"
    msg["To"] = to_email

    plain = "You have new notifications on AuraFlow. Log in to see them."
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    if not SMTP_EMAIL or not SMTP_APP_PASSWORD:
        log.info(f"[DEV] Digest email for {to_email}:\n{plain}")
        return

    with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT) as server:
        server.login(SMTP_EMAIL, SMTP_APP_PASSWORD)
        server.sendmail(SMTP_EMAIL, [to_email], msg.as_string())
