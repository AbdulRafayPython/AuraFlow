# Email Notification Batching & Preferences Implementation

This document details the implementation plan for the Email Notification system with user preferences and a 5-minute batching (debounce) rule.

## Background Context
Currently, notifications in AuroFlow are real-time via websockets or Web Push. For email notifications, platforms like Discord and Slack do not email users immediately per message. Instead, they batch unread messages and send a single summary email after a period of inactivity (typically 5 to 15 minutes). We will implement a similar 5-minute batching system using Celery and Redis.

## User Review Required

> [!IMPORTANT]
> Please review the **Proposed User Settings Schema** and the **Notification Batching Logic** below. 
> Should the batching be strictly "5 minutes after the first unread message", or should it be "5 minutes after the user goes offline"? The plan below uses "5 minutes after the first unread event".

---

## Proposed Changes

### 1. Database Schema
We will add a new JSON column `notification_settings` to the `users` table, which allows dynamic addition of settings without database migrations for every new toggle.

*Schema update via Python script or pure SQL:*
```sql
ALTER TABLE users ADD COLUMN notification_settings JSON DEFAULT NULL;
```
Default JSON structure:
```json
{
  "email_alerts_enabled": true,
  "email_dms_and_calls": true,
  "email_community_messages": false,
  "email_agent_notifications": true,
  "email_agent_summaries": true,
  "email_batch_interval_minutes": 5
}
```

---

### 2. Backend (Python/Flask)

#### [MODIFY] `Backend/routes/auth.py`
- Modify `get_me()` and profile queries to include the `notification_settings` column.
- Create a new endpoint `PATCH /api/users/settings/notifications` to allow users to update their notification preferences.

#### [NEW] `Backend/services/email_batch_service.py`
- A new service handling the queuing mechanism.
- `queue_email_notification(user_id, event_type, metadata)`:
  - Validates user settings (e.g., if `email_alerts_enabled` is false, abort).
  - Pushes the event to a Redis List (`pending_emails:{user_id}`).
  - If a timer key `email_timer:{user_id}` does not exist:
    - Sets the timer key with a 5-minute expiration.
    - Schedules a Celery task `process_email_batch` with a 5-minute countdown.

#### [NEW] `Backend/tasks/email_tasks.py`
- `process_email_batch(user_id)`:
  - Fetches all items from the Redis List `pending_emails:{user_id}` and deletes the key.
  - Groups the events (e.g., 3 Direct Messages, 1 Missed Call, 1 Agent Summary).
  - Uses `services.email_service` to render an HTML email digest and dispatch it to the user's email.

#### [MODIFY] Various Event Triggers
- Update DM routing, calls, and agent summary completion tasks to call `queue_email_notification(user_id, ...)` when events happen.

---

### 3. Frontend (React/Vite)

#### [MODIFY] `Frontend/src/pages/Settings.tsx`
- Expand the `NotificationSettings` component.
- Fetch initial settings from the `user.notification_settings` object.
- Add an "Email Notifications" Card containing the new sub-options:
  - Toggle: "Send Email Notifications" (Master switch)
  - Toggle: "Direct Messages & Missed Calls"
  - Toggle: "Community Channel Mentions"
  - Toggle: "System & Random Notifications"
  - Toggle: "Agent Summaries & Notifications" 
- Wire up the UI to call the new `PATCH /api/users/settings/notifications` endpoint with a debounce on save to avoid excessive API calls.

## Open Questions

1. **Email Templates**: Do you already have an HTML email template for notifications, or should I create a minimal responsive template for the batch summary email?
2. **Community Messages Rule**: Should we only batch *mentions* in community channels to avoid spamming the user, or literally any message in channels they haven't muted?

## Verification Plan

### Automated Tests
- Test the new `PATCH` endpoint to confirm it saves JSON properly into MySQL.
- Unit test the Redis queuing logic to ensure it doesn't spawn duplicate Celery tasks during the 5-minute window.

### Manual Verification
1. Start Redis and Celery workers locally.
2. Update the user preferences in the Settings panel.
3. Send a few DMs and trigger a missed call to the target user.
4. Verify via Redis CLI that the items are queued.
5. Wait 5 minutes and verify that a single digest email is received merging all the events.
