# Email Notification Batching — Testing Guide

## Prerequisites

| Service | Required? | How to Check |
|---------|-----------|--------------|
| **Redis** | Yes | `redis-cli ping` → PONG |
| **Celery Worker** | Yes | `start_celery.bat` |
| **Flask Backend** | Yes | `python app.py` |
| **Frontend** | Yes (for UI tests) | `npm run dev` / `bun dev` |
| **SMTP Credentials** | Yes (for real email) | `.env` → `SMTP_EMAIL` + `SMTP_APP_PASSWORD` |

> Your `.env` already has Gmail SMTP configured. If SMTP is missing, the system prints the digest to the console instead of sending an email.

---

## 1. Start All Services

Open **4 terminals** from `Backend/`:

```powershell
# Terminal 1 — Redis (if not already running)
redis-server

# Terminal 2 — Flask backend
cd Backend
.\venv\Scripts\activate
python app.py

# Terminal 3 — Celery worker
cd Backend
.\venv\Scripts\activate
celery -A celery_app worker --loglevel=info --pool=solo

# Terminal 4 — Frontend
cd Frontend
bun dev
```

---

## 2. Test the API Endpoints (cURL / Postman)

### 2a. Login to get a JWT token

```bash
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username": "YOUR_USERNAME", "password": "YOUR_PASSWORD"}'
```

Copy the `token` from the response.

### 2b. GET notification settings (should return defaults)

```bash
curl http://localhost:5000/api/users/settings/notifications \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected response:**
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

### 2c. PATCH — update a setting

```bash
curl -X PATCH http://localhost:5000/api/users/settings/notifications \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email_community_messages": true}'
```

**Expected:** returns the merged settings with `email_community_messages: true`.

### 2d. PATCH — disable all email alerts

```bash
curl -X PATCH http://localhost:5000/api/users/settings/notifications \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email_alerts_enabled": false}'
```

### 2e. Verify in DB

```sql
SELECT username, notification_settings FROM users WHERE username = 'YOUR_USERNAME';
```

---

## 3. Test the Email Batching Queue (Python Script)

This script simulates queuing email events directly, bypassing the UI. Run it from `Backend/`:

```powershell
cd Backend
.\venv\Scripts\activate
python
```

```python
# -- Paste in Python REPL --

# First, enable email alerts for the test user
from database import get_db_connection
import json

USER_ID = 1  # Change to your user's ID

conn = get_db_connection()
with conn.cursor() as cur:
    cur.execute(
        "UPDATE users SET notification_settings = %s WHERE id = %s",
        (json.dumps({
            "email_alerts_enabled": True,
            "email_dms_and_calls": True,
            "email_community_messages": True,
            "email_agent_summaries": True,
            "email_batch_interval_minutes": 1  # 1 min for faster testing
        }), USER_ID)
    )
conn.commit()
conn.close()
print("Settings updated!")

# Now queue some test events
from services.email_batch_service import queue_email_notification

queue_email_notification(USER_ID, 'dm', {
    'sender_name': 'Ali Raza',
    'preview': 'Hey! Are you coming to the meeting today?',
})

queue_email_notification(USER_ID, 'dm', {
    'sender_name': 'Sarah Dev',
    'preview': 'Check out the new feature I pushed',
})

queue_email_notification(USER_ID, 'missed_call', {
    'sender_name': 'Ahmed Khan',
    'preview': 'Missed audio call',
})

queue_email_notification(USER_ID, 'mention', {
    'sender_name': 'alirazadev',
    'preview': 'mentioned you in #general',
    'community_name': 'AuraFlow Dev',
    'channel_name': 'general',
})

print("4 events queued! Check Celery terminal in ~1 minute for digest delivery.")
```

### What to watch

| Terminal | Expected Output |
|----------|----------------|
| **Celery worker** | `[EMAIL TASK] Digest sent to user@email.com (4 events)` |
| **Your inbox** | One email with sections: "💬 Direct Messages (2)", "📞 Missed Calls (1)", "@ Mentions (1)" |

> **If SMTP is not configured**, the Celery worker will print `[DEV] Digest email for ...` to the console instead.

---

## 4. Test via Redis CLI (Inspect Queue)

```bash
# Check what's queued for user 1
redis-cli LRANGE pending_emails:1 0 -1

# Check if the timer key exists
redis-cli TTL email_timer:1

# Manually drain the queue (simulate what Celery does)
redis-cli LRANGE pending_emails:1 0 -1
redis-cli DEL pending_emails:1
redis-cli DEL email_timer:1
```

---

## 5. Test via the Frontend UI

1. Open `http://localhost:5173` and log in
2. Go to **Settings → Notifications**
3. Scroll to the **"Email Notifications"** card at the bottom
4. You should see:
   - **Send Email Notifications** (master toggle)
   - **Direct Messages & Missed Calls**
   - **Community Channel Mentions**
   - **Agent Notifications**
   - **Agent Summaries**
5. Toggle any switch — the card description should briefly show **"✓ Saved"**
6. Refresh the page — the toggles should retain their state (persisted to backend)
7. Turn OFF the master switch — all sub-toggles should hide
8. Turn it back ON — sub-toggles reappear with their last values

### Frontend Verification Checklist

| Action | Expected |
|--------|----------|
| Toggle any switch | Status shows "✓ Saved" after ~600ms |
| Reload page | Toggles retain their saved state |
| Turn off master switch | Sub-toggles disappear |
| Turn on master switch | Sub-toggles reappear |
| Open DevTools → Network | PATCH request to `/api/users/settings/notifications` with correct body |

---

## 6. End-to-End Test (DM Trigger)

This is the real test — send a DM and verify the full pipeline:

1. **Ensure Celery worker is running** (Terminal 3)
2. **Set batch interval to 1 minute** for faster testing:
   ```bash
   curl -X PATCH http://localhost:5000/api/users/settings/notifications \
     -H "Authorization: Bearer RECEIVER_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"email_batch_interval_minutes": 1, "email_dms_and_calls": true, "email_alerts_enabled": true}'
   ```
3. **Log in as User A** on the frontend
4. **Send 2–3 DMs** to User B (the receiver)
5. **Wait ~1 minute**
6. **Check User B's email inbox** — should receive a single digest with all DMs grouped

---

## 7. Test Preference Enforcement

Verify that disabling a category prevents emails:

1. Disable DM emails:
   ```bash
   curl -X PATCH http://localhost:5000/api/users/settings/notifications \
     -H "Authorization: Bearer TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"email_dms_and_calls": false}'
   ```
2. Send a DM to that user
3. Check Redis — `pending_emails:{user_id}` should be **empty** (event was skipped)
4. Check Celery logs — should see `[EMAIL BATCH] User X has email_dms_and_calls disabled — skipping dm`

---

## 8. Test Validation

```bash
# Should fail — invalid key
curl -X PATCH http://localhost:5000/api/users/settings/notifications \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"invalid_key": true}'
# Expected: 400 "No valid notification settings provided"

# Should fail — wrong type
curl -X PATCH http://localhost:5000/api/users/settings/notifications \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email_alerts_enabled": "yes"}'
# Expected: 400 "email_alerts_enabled must be a boolean"

# Should fail — batch interval out of range
curl -X PATCH http://localhost:5000/api/users/settings/notifications \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email_batch_interval_minutes": 999}'
# Expected: 400 "email_batch_interval_minutes must be an integer between 1 and 60"
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Redis unavailable` in logs | Start Redis: `redis-server` or Docker: `docker run -d -p 6379:6379 redis` |
| No email received | Check Celery terminal for `[DEV] Digest email for ...` (means SMTP not configured) |
| `No pending events — skipping` | Events already drained, or batch_interval hasn't elapsed yet |
| Frontend toggles don't save | Open DevTools → Network → check for 401 (token expired) or CORS errors |
| PATCH returns 404 | Make sure the route is registered — check `python -c "from app import app"` |
| Celery task never fires | Ensure `tasks.email_tasks` is in the `include` list in `celery_app.py` |
