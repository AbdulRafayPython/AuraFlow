# Redis & Celery in AuroFlow — Complete Architecture Guide

## Table of Contents

1. [Overview](#overview)
2. [What is Redis?](#what-is-redis)
3. [What is Celery?](#what-is-celery)
4. [How They Work Together](#how-they-work-together)
5. [Redis Usage in AuroFlow](#redis-usage-in-auraflow)
6. [Celery Tasks in AuroFlow](#celery-tasks-in-auraflow)
7. [Data Flow Diagrams](#data-flow-diagrams)
8. [Configuration Reference](#configuration-reference)
9. [Redis Key Patterns](#redis-key-patterns)
10. [Task Queue Architecture](#task-queue-architecture)
11. [Running in Development](#running-in-development)

---

## Overview

AuroFlow uses **Redis** and **Celery** together to power its background processing pipeline. Redis acts as the central message broker and cache, while Celery provides the task execution framework. Together they handle:

- **6 AI agent background tasks** (moderation, mood tracking, focus, engagement, wellness, knowledge)
- **4 periodic scheduled jobs** (auto-summarization, log cleanup, engagement checks, wellness checks)
- **Email notification batching** (queue → debounce → digest email)
- **Agent settings caching** (5–10 min TTL)
- **Rate limiting** (API + agent invocation throttling)
- **Real-time event broadcasting** from background workers to connected clients via SocketIO

---

## What is Redis?

Redis (Remote Dictionary Server) is an **in-memory data store** that AuroFlow uses for three distinct purposes:

| Role | What It Does in AuroFlow |
|------|--------------------------|
| **Message Broker** | Receives task messages from Flask and delivers them to Celery workers |
| **Cache Layer** | Stores agent settings, installed agent lists, and rate limit counters with automatic expiry |
| **Event Bus** | Lets Celery workers broadcast SocketIO events to connected browser clients |

**Connection URL:** `redis://localhost:6379/0` (configurable via `REDIS_URL` env variable)

### Why Not Just Use the Database?

| Need | MySQL | Redis |
|------|-------|-------|
| Read agent settings 30×/minute | ~15ms per query, DB load | ~0.1ms, zero DB load |
| Queue a task for later | Would need polling | Instant push/pop |
| Rate limit API calls | Complex SQL with timestamps | Single `INCR` command with auto-expiry |
| Broadcast events from background workers | Not possible | Built-in pub/sub |

---

## What is Celery?

Celery is a **distributed task queue** that lets AuroFlow offload slow or scheduled work to background workers. Instead of making the user wait while an AI agent processes a message, Flask says *"handle this later"* and responds immediately.

### The Three Celery Components

```
┌─────────────┐        ┌─────────────┐        ┌─────────────┐
│  Flask App   │──push──│    Redis     │──pull──│   Celery    │
│  (Producer)  │        │  (Broker)   │        │  (Worker)   │
└─────────────┘        └─────────────┘        └─────────────┘
     ▲                                              │
     │              results / SocketIO              │
     └──────────────────────────────────────────────┘
```

| Component | Process | What It Does |
|-----------|---------|-------------|
| **Producer** | `python app.py` | Calls `.delay()` or `.apply_async()` to create tasks |
| **Broker** | `redis-server` | Holds task messages in queues until a worker picks them up |
| **Worker** | `celery -A celery_app worker` | Executes the actual Python function in a separate process |
| **Beat** | `celery -A celery_app beat` | Scheduler that pushes periodic tasks at configured intervals |

---

## How They Work Together

### Example: User Sends a DM

```
1. User sends DM via WebSocket
                │
2. Flask saves message to MySQL
                │
3. Flask calls track_mood_task.delay(text, user_id, channel_id)
   └── This serializes the call to JSON and pushes it to Redis queue
                │
4. Redis holds the task: {"task": "track_mood_task", "args": ["hello", 42, 7]}
                │
5. Celery Worker picks the task from Redis
                │
6. Worker runs MoodTrackerAgent().analyze_message("hello")
   └── Sentiment analysis, emotion detection
                │
7. Worker saves mood record to MySQL (user_moods table)
                │
8. Worker acknowledges task completion → Redis removes it
```

**The user never waits for step 5–8.** They get an instant response at step 2.

### Example: Email Notification Batching

```
1. User A receives 3 DMs in 2 minutes
                │
2. Each DM triggers: queue_email_notification(user_id, 'dm', metadata)
   ├── Event JSON pushed to Redis list: pending_emails:42
   └── First call schedules Celery task with countdown=60s (1 min debounce)
                │
3. Redis holds: pending_emails:42 = [event1, event2, event3]
                │
4. After 60 seconds, Celery executes process_email_batch(42)
   ├── Atomically drains all 3 events from Redis list
   ├── Groups by type (all 3 are DMs)
   ├── Renders one HTML digest email
   └── Sends via Gmail SMTP
                │
5. User receives ONE email: "You have 3 new messages from Ali, Sara, Ahmed"
```

---

## Redis Usage in AuroFlow

### 1. Celery Message Broker & Result Backend

**File:** `Backend/celery_app.py`

Redis serves as both the broker (task queue) and the result backend (task return values):

```python
celery_app = Celery(
    'auraflow',
    broker=REDIS_URL,      # Tasks are pushed here
    backend=REDIS_URL,     # Task results stored here
    include=['tasks.agent_tasks', 'tasks.email_tasks']
)
```

### 2. Agent Settings Cache

**File:** `Backend/services/redis_client.py`

Every time an AI agent processes a message, it needs to know its configuration (is it enabled? what are the thresholds?). Instead of hitting MySQL each time:

| Function | Key Pattern | TTL | Purpose |
|----------|-------------|-----|---------|
| `get_agent_settings(community_id, agent_type)` | `agent:settings:{community_id}:{agent_type}` | 5 min | Cache agent config JSON |
| `get_installed_agents(community_id)` | `agent:installed:{community_id}` | 5 min | Cache list of active agents |
| `get_personal_agents(user_id)` | `agent:personal:{user_id}` | 10 min | Cache per-user agent list |

**Cache invalidation** happens when admin changes agent settings — the relevant keys are deleted so the next read fetches fresh data from MySQL.

### 3. Rate Limiting

**File:** `Backend/services/redis_client.py`

Prevents abuse of AI agent APIs:

```python
check_rate_limit(agent_type, entity_id, max_requests=30, window_seconds=60)
# Key: agent:rate:{agent_type}:{entity_id}
# Uses Redis INCR + TTL — atomic counter with auto-expiry
# Returns: (allowed: bool, remaining: int, reset_in: int)
```

**Example:** If a user hammers the summarizer endpoint, after 30 calls/minute they get a `429 Too Many Requests`.

### 4. Email Notification Queue

**File:** `Backend/services/email_batch_service.py`

Two Redis key patterns work together to batch emails:

| Key Pattern | Type | Purpose |
|-------------|------|---------|
| `pending_emails:{user_id}` | List | Accumulates notification events as JSON |
| `email_timer:{user_id}` | String (with TTL) | Sentinel flag — "a batch task is already scheduled" |

**Why Redis lists?** They support atomic `RPUSH` (add event) and pipeline `LRANGE + DELETE` (drain all events at once). No race conditions, no lost events.

### 5. OTP Rate Limiting

**File:** `Backend/routes/auth.py`

Protects email verification from brute-force:

| Key Pattern | TTL | Limit |
|-------------|-----|-------|
| `otp_attempts:{email}` | 15 min | 5 attempts max |

After 5 wrong OTP codes in 15 minutes → `429 Too Many Requests`.

### 6. SocketIO Event Broadcasting from Workers

**File:** `Backend/tasks/agent_tasks.py`

Celery workers run in a **separate process** from Flask. They can't directly use Flask-SocketIO's `emit()`. Instead, they create a Redis-backed SocketIO instance:

```python
from flask_socketio import SocketIO as FlaskSocketIO
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
sio = FlaskSocketIO(message_queue=REDIS_URL)
sio.emit('message_received', data, room=f"channel_{channel_id}")
```

This pushes the event to Redis pub/sub, and the Flask process (which is subscribed) forwards it to the connected WebSocket client.

**Used for:**
- Auto-summary bot messages → `message_received` event
- Scheduled summary delivery → `summary_result` event  
- Summary notifications → `notification` event

### 7. Health Monitoring

**File:** `Backend/app.py`

The `/api/health` endpoint checks Redis status:

```python
from services.redis_client import redis_health
# Returns: {'status': 'connected', 'version': '3.0.504', 'uptime': 12345, 'clients': 3}
```

---

## Celery Tasks in AuroFlow

### On-Demand Tasks (Triggered by User Actions)

These run **immediately** when a user does something:

| Task | Trigger | Rate Limit | Retries | File |
|------|---------|------------|---------|------|
| `moderate_message_task` | User sends message in community | 60/min | 2 | `tasks/agent_tasks.py` |
| `track_mood_task` | User sends DM or community message | 60/min | 2 | `tasks/agent_tasks.py` |
| `summarize_channel_task` | User requests channel summary | 10/min | 1 | `tasks/agent_tasks.py` |
| `analyze_focus_task` | User sends message (if focus agent active) | 20/min | 1 | `tasks/agent_tasks.py` |
| `process_email_batch` | Scheduled after first notification event (countdown timer) | — | 2 | `tasks/email_tasks.py` |

#### Moderation Task
```
Message → moderate_message_task.delay(text, user_id, channel_id, community_id)
  └── ModerationAgent().moderate_message(text, user_id, channel_id)
      ├── Keyword detection (profanity, slurs, harassment)
      ├── Roman Urdu sentiment analysis
      └── Returns: {flagged: bool, reason: str, severity: str}
          └── If flagged → action taken (warn/mute/delete based on settings)
```

#### Mood Tracking Task
```
Message → track_mood_task.delay(text, user_id, channel_id)
  └── MoodTrackerAgent().analyze_message(text)
      ├── Sentiment scoring (positive/negative/neutral)
      ├── Emotion classification (happy, sad, angry, etc.)
      └── Saves to user_moods table
```

#### Summarization Task
```
Request → summarize_channel_task.delay(channel_id, user_id, message_count)
  └── SummarizerAgent().summarize_channel(channel_id, count, user_id)
      ├── Fetches last N messages from MySQL
      ├── Generates AI summary with key points
      └── Returns: {summary, key_points, participants, message_count}
```

#### Focus Analysis Task
```
Message → analyze_focus_task.delay(channel_id, community_id, hours)
  └── FocusAgent().analyze_focus(channel_id, hours)
      ├── Analyzes conversation topics over time window
      └── Returns: {topics, focus_score, drift_detected}
```

### Periodic Tasks (Celery Beat Schedule)

These run automatically on a schedule, even if no user is active:

| Task | Schedule | What It Does |
|------|----------|-------------|
| `check_engagement_periodic` | **Every 30 min** | Scans all communities with engagement agent → analyzes participation levels per channel |
| `check_wellness_periodic` | **Every hour** (at :00) | Checks all users with wellness agent → flags concerning mood patterns |
| `extract_knowledge_periodic` | **Every 2 hours** | Scans communities with knowledge builder → extracts key facts/definitions from conversations |
| `cleanup_old_logs` | **Daily at 3:00 AM UTC** | Deletes AI agent logs older than 30 days from `ai_agent_logs` table |
| `auto_summarize_communities` | **Every 30 min** | Checks if any community has scheduled auto-summary → generates & posts bot message |
| `check_user_summary_schedules` | **Every 1 minute** | Checks `user_summary_schedules` for due summaries → generates & delivers via SocketIO + notification |

#### Auto-Summarize Flow
```
Beat triggers auto_summarize_communities every 30 min
  │
  ├── Query: communities WHERE summarizer installed AND auto_summarize_enabled
  │
  ├── For each community:
  │   ├── Is current UTC time within ±15 min of schedule_time? (e.g., "21:00")
  │   ├── Has it already run today? (check last_auto_summary_date)
  │   └── If due:
  │       ├── For each text channel:
  │       │   ├── SummarizerAgent().summarize_channel(channel_id, 200)
  │       │   ├── Insert bot message (message_type='ai') into MySQL
  │       │   └── Broadcast via Redis-backed SocketIO:
  │       │       ├── room: channel_{id} → message_received event
  │       │       └── room: community_{id} → message_received event
  │       └── Update last_auto_summary_date = today
  │
  └── Return: {processed: 2, skipped: 15, errors: 0}
```

#### User Summary Schedule Flow
```
Beat triggers check_user_summary_schedules every 1 min
  │
  ├── Query: user_summary_schedules WHERE schedule_time = current HH:MM AND not triggered today
  │
  ├── For each due schedule:
  │   ├── SummarizerAgent().summarize_channel(channel_id, 100, user_id)
  │   ├── Insert into scheduled_summaries table
  │   ├── Update last_triggered_at = NOW()
  │   ├── Emit 'summary_result' via Redis-backed SocketIO → room: user_{user_id}
  │   ├── Create notification in DB
  │   ├── Send web push notification
  │   └── Queue email notification (email_batch_service)
  │
  └── Return: {checked: true, due: 3}
```

---

## Data Flow Diagrams

### Complete System Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                        BROWSER (React)                             │
│  ┌──────────┐  ┌──────────┐  ┌─────────┐  ┌──────────────────┐  │
│  │ Messages  │  │ Settings │  │ Summary │  │ Notifications    │  │
│  │   Page    │  │   Page   │  │  Modal  │  │ (Push + Email)   │  │
│  └─────┬────┘  └──────────┘  └────┬────┘  └────────▲─────────┘  │
│        │ WebSocket                 │ REST            │            │
└────────┼───────────────────────────┼────────────────┼────────────┘
         │                           │                │
   ──────┼───────────────────────────┼────────────────┼──────────
         ▼                           ▼                │
┌──────────────────────────────────────────┐         │
│            FLASK APP (app.py)             │         │
│                                          │         │
│  WebSocket ──► Save msg to MySQL         │         │
│       │                                  │         │
│       ├── track_mood_task.delay() ───────┼──┐      │
│       ├── analyze_focus_task.delay() ────┼──┤      │
│       ├── moderate_message_task.delay() ─┼──┤      │
│       │                                  │  │      │
│  REST ──► summarize_channel_task.delay()─┼──┤      │
│       │                                  │  │      │
│  DM ──► queue_email_notification() ──────┼──┤      │
│                                          │  │      │
│  SocketIO ◄── Redis pub/sub ◄────────────┼──┼──┐   │
└──────────────────────────────────────────┘  │  │   │
                                              │  │   │
   ───────────────────────────────────────────┼──┼───┼──
                                              ▼  │   │
             ┌────────────────────────────────────┤   │
             │         REDIS (port 6379)          │   │
             │                                    │   │
             │  ┌─────────┐  ┌─────────────────┐  │   │
             │  │  Task    │  │ Agent Settings  │  │   │
             │  │  Queue   │  │   Cache (5min)  │  │   │
             │  ├─────────┤  ├─────────────────┤  │   │
             │  │ Results  │  │  Rate Limits    │  │   │
             │  │ Backend  │  │  (60s window)   │  │   │
             │  ├─────────┤  ├─────────────────┤  │   │
             │  │ Pub/Sub  │  │ Email Batches   │  │   │
             │  │ (SocketIO│  │ pending_emails: │  │   │
             │  │  events) │  │ email_timer:    │  │   │
             │  └─────────┘  └─────────────────┘  │   │
             └────────────────────┬───────────────┘   │
                                  │                   │
   ───────────────────────────────┼───────────────────┼──
                                  ▼                   │
             ┌────────────────────────────────────┐   │
             │       CELERY WORKER (solo pool)     │   │
             │                                    │   │
             │  On-Demand Tasks:                  │   │
             │  ├── moderate_message_task          │   │
             │  ├── track_mood_task                │   │
             │  ├── summarize_channel_task         │   │
             │  ├── analyze_focus_task             │   │
             │  └── process_email_batch ───────────┼───┘
             │                                    │  (sends email via SMTP)
             │  Periodic Tasks (Beat):            │
             │  ├── check_engagement (30 min)     │
             │  ├── check_wellness (1 hour)       │
             │  ├── extract_knowledge (2 hours)   │
             │  ├── cleanup_old_logs (daily 3AM)  │
             │  ├── auto_summarize (30 min)       │
             │  └── check_user_schedules (1 min)  │
             │          │                         │
             │          ├── Read/Write MySQL      │
             │          ├── Emit via Redis pub/sub│
             │          └── Send web push         │
             └────────────────────────────────────┘
```

### Email Notification Pipeline

```
  DM received          Missed call          Summary ready
       │                    │                     │
       ▼                    ▼                     ▼
  queue_email_notification(user_id, event_type, metadata)
       │
       ├── Check user preferences (MySQL: users.notification_settings)
       │   └── email_dms_and_calls: true? email_agent_summaries: true?
       │
       ├── If disabled → return (no email)
       │
       ├── RPUSH event JSON → Redis list: pending_emails:{user_id}
       │
       └── Check Redis key: email_timer:{user_id}
           ├── EXISTS → timer already running, just queued the event
           └── NOT EXISTS →
               ├── SETEX email_timer:{user_id} = "1" (TTL = batch interval)
               └── process_email_batch.apply_async(
                       args=[user_id],
                       countdown=batch_interval_seconds  ← currently 1 min (testing)
                   )
                        │
                        ▼  (after countdown)
               ┌─────────────────────────┐
               │  process_email_batch()   │
               │                         │
               │  Pipeline (atomic):     │
               │  ├── LRANGE → get all   │
               │  ├── DELETE list         │
               │  └── DELETE timer        │
               │                         │
               │  Group events by type   │
               │  Render HTML digest     │
               │  Send via Gmail SMTP    │
               └─────────────────────────┘
```

---

## Configuration Reference

### Celery App Settings

| Setting | Value | Explanation |
|---------|-------|-------------|
| `broker` | `redis://localhost:6379/0` | Where tasks are queued |
| `backend` | `redis://localhost:6379/0` | Where results are stored |
| `task_serializer` | `json` | Tasks serialized as JSON |
| `timezone` | `UTC` | All schedules in UTC |
| `task_track_started` | `True` | Track when task begins executing |
| `task_acks_late` | `True` | Acknowledge after execution (prevents task loss on crash) |
| `worker_prefetch_multiplier` | `1` | Don't prefetch — fair distribution |
| `worker_concurrency` | `2` | 2 tasks can execute simultaneously |
| `worker_max_tasks_per_child` | `200` | Restart worker process after 200 tasks (prevents memory leaks) |
| `task_soft_time_limit` | `120` | Soft kill after 2 min (raises SoftTimeLimitExceeded) |
| `task_time_limit` | `180` | Hard kill after 3 min |
| `result_expires` | `3600` | Task results expire from Redis after 1 hour |
| `task_default_rate_limit` | `30/m` | Global: max 30 tasks/min per worker |
| `broker_connection_timeout` | `4` | Fail fast if Redis is down |
| `visibility_timeout` | `300` | Re-deliver unacknowledged task after 5 min |

### Task Queues

| Queue | Tasks | Purpose |
|-------|-------|---------|
| `high_priority` | `moderate_message_task` | Real-time content moderation — must be fast |
| `default` | `track_mood_task`, `summarize_channel_task`, `analyze_focus_task`, `process_email_batch` | Standard user-triggered work |
| `periodic` | All beat-scheduled tasks | Background maintenance and scheduled jobs |

### Redis Cache TTLs

| Data | TTL | Why |
|------|-----|-----|
| Agent settings | 5 min (300s) | Balance freshness vs DB load |
| Installed agents list | 5 min (300s) | Same as above |
| Personal agents list | 10 min (600s) | Changes less frequently |
| Rate limit counters | 60s (sliding window) | Reset every minute |
| OTP attempts | 15 min | Security cooldown period |
| Email batch timer | Configurable (default 1 min for testing, 5 min production) | Debounce window |

---

## Redis Key Patterns

Complete list of all Redis keys AuroFlow creates:

| Key Pattern | Type | TTL | Purpose |
|-------------|------|-----|---------|
| `agent:settings:{community_id}:{agent_type}` | String (JSON) | 300s | Cached agent configuration |
| `agent:installed:{community_id}` | String (JSON) | 300s | List of installed agents |
| `agent:personal:{user_id}` | String (JSON) | 600s | User's personal agents |
| `agent:rate:{agent_type}:{entity_id}` | String (counter) | 60s | Rate limit counter |
| `pending_emails:{user_id}` | List (JSON items) | None | Queued email notification events |
| `email_timer:{user_id}` | String ("1") | batch interval | Sentinel: batch task already scheduled |
| `otp_attempts:{email}` | String (counter) | 900s | OTP brute-force protection |
| `celery-task-meta-*` | String (JSON) | 3600s | Celery task results (auto-managed) |
| `_kombu.*` | Various | Various | Celery/Kombu internal broker state |

---

## Task Queue Architecture

### Three-Queue Design

```
                    ┌──────────────────┐
                    │   Redis Broker    │
                    │                  │
    ┌───────────────┤  high_priority   │◄── moderate_message_task
    │               │  ────────────    │    (content moderation - latency critical)
    │               │                  │
    │  ┌────────────┤  default         │◄── track_mood_task
    │  │            │  ────────        │    summarize_channel_task
    │  │            │                  │    analyze_focus_task
    │  │            │                  │    process_email_batch
    │  │            │                  │
    │  │  ┌─────────┤  periodic        │◄── check_engagement (30min)
    │  │  │         │  ────────        │    check_wellness (1hr)
    │  │  │         │                  │    extract_knowledge (2hr)
    │  │  │         │                  │    cleanup_old_logs (daily)
    │  │  │         │                  │    auto_summarize (30min)
    │  │  │         │                  │    check_schedules (1min)
    │  │  │         └──────────────────┘
    ▼  ▼  ▼
┌──────────────────┐
│  Celery Worker   │
│  (solo pool, 2   │
│   concurrent)    │
│                  │
│  Processes tasks │
│  from ALL queues │
│  in priority     │
│  order           │
└──────────────────┘
```

### Rate Limiting Strategy

```
Per-Task Rate Limits:
├── moderate_message_task  →  60/min  (high volume, real-time)
├── track_mood_task        →  60/min  (every message triggers this)
├── analyze_focus_task     →  20/min  (less frequent)
├── summarize_channel_task →  10/min  (expensive — calls AI model)
└── Global default         →  30/min  (safety net)

Per-User Rate Limits (Redis-based):
└── check_rate_limit(agent_type, user_id, max=30, window=60)
    → Returns 429 if exceeded
```

---

## Running in Development

### Required Processes (4 terminals)

```bash
# Terminal 1: Redis Server (installed as Windows service — starts automatically)
# Verify with:
redis-cli ping          # Should return: PONG

# Terminal 2: Flask Backend
cd Backend
venv\Scripts\activate
python app.py           # Runs on http://localhost:5000

# Terminal 3: Celery Worker
cd Backend
venv\Scripts\activate
celery -A celery_app worker --loglevel=info --pool=solo

# Terminal 4: Frontend
cd Frontend
npm run dev             # Runs on http://localhost:5173
```

### Optional: Celery Beat (for periodic tasks)

```bash
# Terminal 5: Beat Scheduler
cd Backend
venv\Scripts\activate
celery -A celery_app beat --loglevel=info

# OR combine worker + beat in one process (dev only):
celery -A celery_app worker --beat --loglevel=info --pool=solo
```

### Monitoring Commands

```bash
# Check Redis is running
redis-cli ping

# See all Redis keys
redis-cli KEYS *

# Check pending email queue for a user
redis-cli LRANGE pending_emails:42 0 -1

# Check if email timer exists
redis-cli EXISTS email_timer:42

# Check agent cache
redis-cli GET "agent:settings:1:moderation"

# Monitor Redis commands in real-time
redis-cli MONITOR

# Inspect Celery active tasks
celery -A celery_app inspect active

# Inspect registered tasks
celery -A celery_app inspect registered
```

---

## What Happens If Redis Goes Down?

AuroFlow is designed with **graceful degradation**:

| Feature | Without Redis | Impact |
|---------|--------------|--------|
| Agent settings cache | Falls back to MySQL queries | Slightly slower, higher DB load |
| Rate limiting | Passes through (no limiting) | Less protection against abuse |
| Celery tasks | **Cannot execute** — tasks are lost | AI agents stop processing |
| Email batching | **Cannot queue** — emails skipped | Users miss email notifications |
| SocketIO from workers | **Cannot broadcast** — events dropped | Real-time updates stop from background tasks |
| OTP rate limiting | Passes through | Less brute-force protection |
| Core messaging | **Unaffected** — uses MySQL directly | Chat works normally |

**Bottom line:** Redis going down breaks AI agents and background features, but core chat functionality continues working since it only depends on MySQL and WebSockets.
