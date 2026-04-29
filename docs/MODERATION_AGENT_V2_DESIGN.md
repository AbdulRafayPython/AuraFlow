# Moderation Agent V2 — Full Design Specification

**Status:** Design / Pre-implementation  
**Scope:** Historical scan, spam detection, scam detection, enhanced real-time pipeline, UI integration  
**Constraint:** Zero breakage to existing real-time moderation, socket events, admin dashboard, or violation 3-strike system

---

## 1. Problem Statement

The current moderation agent has four gaps:

| Gap | Impact |
|-----|--------|
| Only moderates messages sent **after** the agent is installed and the worker is running | Historical violations (before install, or during worker downtime) are never acted on |
| No spam/flood detection | Users can repeat the same message 50 times or flood a channel |
| No scam detection | Phishing links, crypto promises, fake giveaways pass through unchecked |
| No way to trigger a manual re-scan | Admins cannot retroactively audit a channel |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     LAYER 1 — PRE-BROADCAST                     │
│  instant_check()  →  spam_check()  →  scam_check()             │
│  < 5ms total · blocks extreme content + spam floods            │
└────────────────────────────┬────────────────────────────────────┘
                             │ allowed
┌────────────────────────────▼────────────────────────────────────┐
│                  LAYER 2 — LIVE BUFFER (Redis)                  │
│  push_to_buffer()  →  mod:buffer:<channel_id>                   │
│  Flushed every 30s by Celery Beat, or when buffer hits 10 msgs  │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                LAYER 3 — GEMINI BATCH REVIEW                    │
│  batch_moderation_task  →  batch_gemini_review()                │
│  Enhanced prompt: profanity, hate, harassment, spam, scam       │
│  Retroactive socket event → frontend marks flagged messages     │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│              LAYER 4 — HISTORICAL SCAN (NEW)                    │
│  retroactive_scan_task  →  paginated DB query                   │
│  Triggered: on-install, manual admin button, or scheduled       │
│  Skips already-reviewed messages · progress emitted via socket  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. What Changes vs What Stays the Same

### Unchanged (zero risk)
- `batch_moderation_task` — same task name, same inputs/outputs
- `flush_moderation_buffers` — same Celery schedule, same logic
- `_emit_moderation_event()` — same socket event names and payloads
- 3-strike escalation (`warn → flag → remove_user`)
- `violation_count` in `community_members`
- All existing socket events: `moderation_retroactive`, `moderation_user_removed`, `moderation_action_logged`
- `ModerationToast.tsx`, `RealtimeContext.tsx` — no changes to existing handlers
- All admin dashboard routes in `community_admin.py`
- `messages` table — no new columns (uses existing `moderation_flagged`, `moderation_score`)

### New additions (additive only)
- `spam_check()` method on `ModerationAgent`
- `scam_check()` method on `ModerationAgent`
- `retroactive_scan()` method on `ModerationAgent`
- `retroactive_scan_task` Celery task
- Updated Gemini batch prompt (backward compatible — only adds new categories)
- New scam/spam patterns in `moderation_keywords.json`
- 2 new API endpoints in `community_admin.py`
- 1 new socket event: `moderation_scan_progress`
- Scan-trigger UI in `FlaggedContent.tsx` admin page

---

## 4. Layer 1 — Enhanced Pre-Broadcast Checks

### 4.1 Spam Detection — `spam_check(user_id, channel_id, content)`

Runs in-process (no DB) using two Redis keys per user per channel.

#### Flood Detection
```
Key:  mod:flood:<channel_id>:<user_id>
Type: Redis sorted set (score = timestamp, member = message UUID)
TTL:  10 seconds sliding window
Rule: If COUNT > 5 messages in last 10 seconds → BLOCK as spam flood
```

#### Duplicate Detection  
```
Key:  mod:dup:<channel_id>:<sha256(content.lower().strip())>
Type: Redis counter, TTL = 60 seconds
Rule: If INCR returns > 2 for same content in same channel within 60s → WARN as spam
```

Both checks run only if Redis is available. If Redis is down, `spam_check` returns `{'block': False}` — **never hard-fails**.

#### Return format (same as `instant_check`)
```json
{ "block": true|false, "reason": "spam_flood|duplicate_spam|", "category": "spam" }
```

### 4.2 Scam Detection — `scam_check(content)`

Pure Python regex against new patterns in `moderation_keywords.json`. No Redis, no DB, no Gemini. < 1ms.

#### Scam Pattern Categories (added to lexicon JSON)
```json
"scam_patterns": {
  "crypto_pump": ["invest.*guaranteed.*profit", "double your.*bitcoin", "crypto.*airdrop.*free"],
  "phishing_links": ["bit\\.ly", "tinyurl\\.com.*(?:login|verify|account)", "(?:paypal|amazon|bank).*\\.(?!com)\\w+"],
  "prize_scam": ["you have been selected", "congratulations.*winner", "claim your.*prize.*now"],
  "account_harvest": ["DM me your.*(?:password|email|number)", "send me your.*info"],
  "urgency_scam": ["act now.*limited time.*free", "only.*left.*claim.*now"]
}
```

#### Return format
```json
{ "block": false, "flag": true, "reason": "crypto_pump", "category": "scam", "confidence": 0.85 }
```

Scam = `flag` (not `block`) unless content also triggers extreme instant-block words.

### 4.3 Updated `instant_check()` flow

```python
def instant_check(self, text, user_id, channel_id):
    # Step 1: existing extreme content check (unchanged)
    result = self._check_extreme_words(text)
    if result['block']:
        return result

    # Step 2: personal info (unchanged)
    pi = self._check_personal_info(text)
    if pi['detected']:
        return {'block': False, 'flag_personal_info': True, ...}

    # Step 3: NEW — spam check
    spam = self.spam_check(user_id, channel_id, text)
    if spam['block']:
        return spam

    # Step 4: NEW — scam check
    scam = self.scam_check(text)
    if scam.get('flag'):
        return scam  # block=False, but carries 'category': 'scam'

    return {'block': False, 'reason': ''}
```

**Signature change is backward compatible** — `user_id` and `channel_id` are new optional kwargs with defaults `None`, which skips spam check gracefully.

---

## 5. Layer 3 — Updated Gemini Batch Prompt

The `_GEMINI_BATCH_PROMPT` is updated to include two new violation categories. All existing categories remain. Gemini response schema is unchanged — only the enum values expand.

```
New category values added: "spam" | "scam"

New guidance paragraph added to prompt:
- "spam": Same message repeated multiple times, meaningless character floods, 
  promotional mass-messages with no conversational value.
- "scam": Cryptocurrency investment promises, phishing links asking for credentials,
  fake prize/giveaway claims, urgent requests for personal info or money.
  Roman Urdu equivalents: "paisa double", "sirf 1 ghante mein", "DM karo" + prize claim.
```

---

## 6. Layer 4 — Historical / Retroactive Scan (New)

### 6.1 Core Method — `ModerationAgent.retroactive_scan()`

```python
def retroactive_scan(
    self,
    channel_id: int,
    community_id: int,
    hours_back: int = 48,
    batch_size: int = 10,
    progress_callback=None   # callable(scanned, total, flagged)
) -> dict:
    """
    Scan historical messages not yet reviewed by the moderation agent.
    Paginates through DB in batches of batch_size, sends each batch to
    Gemini, applies 3-strike logic, marks messages in DB.

    Skips messages that already have a row in ai_agent_logs
    (action_type='moderation', message_id=<id>) to avoid double-flagging.

    Returns: { 'scanned': int, 'flagged': int, 'errors': int }
    """
```

#### DB Query (paginated, index-friendly)
```sql
SELECT m.id, m.sender_id, m.content, m.created_at, u.username
FROM   messages m
JOIN   users u ON u.id = m.sender_id
WHERE  m.channel_id = %s
  AND  m.created_at >= DATE_SUB(NOW(), INTERVAL %s HOUR)
  AND  m.message_type = 'text'
  AND  m.content IS NOT NULL
  AND  m.id NOT IN (
         SELECT message_id FROM ai_agent_logs
         WHERE  message_id IS NOT NULL
           AND  action_type = 'moderation'
           AND  channel_id  = %s
       )
ORDER  BY m.created_at ASC
LIMIT  %s OFFSET %s
```

- Paginates with `LIMIT 10 OFFSET n`  
- Stops early if Gemini returns 3 consecutive `None` (API down)  
- Max 500 messages per scan invocation to prevent runaway cost  

### 6.2 Celery Task — `retroactive_scan_task`

```python
@celery_app.task(
    name='tasks.agent_tasks.retroactive_scan_task',
    bind=True,
    max_retries=0,          # no auto-retry — admin can re-trigger
    rate_limit='2/m'        # max 2 scan tasks per minute globally
)
def retroactive_scan_task(self, channel_id, community_id, hours_back=48, triggered_by=None):
```

**Queue:** `high_priority`  
**Route:** Added to `task_routes` in `celery_app.py`

#### Progress tracking in Redis
```
Key:   mod:scan:<community_id>:<channel_id>
Type:  Redis hash
Fields: status (running|done|error), total, scanned, flagged, started_at, finished_at
TTL:   1 hour after completion
```

Every 10 messages scanned, the task emits a `moderation_scan_progress` socket event:
```json
{
  "community_id": 4,
  "channel_id": 17,
  "status": "running",
  "scanned": 30,
  "total": 87,
  "flagged": 3,
  "percent": 34
}
```

Violations found during the scan emit the **existing** `moderation_retroactive` socket event — no new frontend handler needed.

### 6.3 Guard: One Scan Per Community at a Time

Before starting, the task checks:
```python
scan_key = f'mod:scan:{community_id}:{channel_id}'
if r.hget(scan_key, 'status') == b'running':
    return {'status': 'already_running'}
```

---

## 7. Scan Trigger Points

### 7.1 Manual — Admin Button
`POST /api/admin/community/<id>/moderation/scan`  
Body: `{ "hours_back": 48, "channel_id": null }` (null = scan all channels)  
Auth: community owner or admin only  
Response: `202 Accepted` with `{ "task_id": "...", "channels_queued": 3 }`

### 7.2 Auto — On Agent Install
In the existing `POST /api/agents/install` handler (wherever `community_agents INSERT` happens), after committing:
```python
if agent_type == 'moderation':
    retroactive_scan_task.apply_async(
        args=[None, community_id],   # channel_id=None = scan all
        countdown=5,                  # 5s delay to let install commit settle
        queue='high_priority'
    )
```

### 7.3 Scan Status Endpoint
`GET /api/admin/community/<id>/moderation/scan/status`  
Returns the Redis progress hash for all active/recent scans in that community.

---

## 8. New API Endpoints

Both go into `Backend/routes/community_admin.py`, scoped under `@community_admin_bp`.

### `POST /community/<int:community_id>/moderation/scan`

```
Auth:    JWT — must be owner or admin of community
Body:    { "hours_back": int (1–168, default 48), "channel_id": int|null }
Returns: 202 { task_ids: [...], channels_queued: int }
Errors:  403 not admin, 409 scan already running, 400 agent not installed
```

### `GET /community/<int:community_id>/moderation/scan/status`

```
Auth:    JWT — owner or admin
Returns: 200 { scans: [{ channel_id, status, scanned, total, flagged, percent, started_at }] }
```

---

## 9. Database Changes

### No new tables.

The existing schema is sufficient:

| Existing column | Used for |
|----------------|----------|
| `messages.moderation_flagged` | Set to `1` for any message that receives an action (warn/flag/block) |
| `messages.moderation_score` | Set to Gemini confidence score |
| `ai_agent_logs.action_type = 'moderation'` | De-dupe check — messages already here are skipped by retroactive scan |
| `ai_agent_logs.message_id` | Links log entry to specific message |
| `community_members.violation_count` | 3-strike counter (unchanged) |
| `blocked_users` | Remove-user action (unchanged) |

### New migration file: `add_moderation_v2_indexes.sql`

```sql
-- Speed up the retroactive scan's de-dupe subquery
CREATE INDEX IF NOT EXISTS idx_agent_logs_moderation_msg
    ON ai_agent_logs (action_type, message_id, channel_id);

-- Speed up scan's paginated message query
CREATE INDEX IF NOT EXISTS idx_messages_channel_type_created
    ON messages (channel_id, message_type, created_at);
```

---

## 10. Frontend Changes

### 10.1 New Socket Event Subscription — `RealtimeContext.tsx`

Add one new subscription alongside the existing `unsubscribeModerationRetroactive`:

```typescript
const unsubscribeScanProgress = socketService.on('moderation_scan_progress', (data) => {
  // Dispatch to window so FlaggedContent.tsx admin panel can pick it up
  window.dispatchEvent(new CustomEvent('moderation_scan_progress', { detail: data }));
});
```

Cleanup in the return: `unsubscribeScanProgress()`.  
**Does not change any existing subscription.**

### 10.2 Scan UI — `FlaggedContent.tsx` (Admin Page)

Add a "Scan History" card at the top of the page. It contains:

```
┌─────────────────────────────────────────────────────┐
│  🔍  Retroactive Content Scan                        │
│                                                     │
│  Scan the last [48] hours ▼  of all channels        │
│                                                     │
│  [ Scan Now ]                                       │
│                                                     │
│  Last scan: 2 mins ago · 87 messages · 3 flagged    │
│  ████████████████░░░░  82%  (running...)            │
└─────────────────────────────────────────────────────┘
```

- Calls `POST .../moderation/scan`
- Polls `GET .../moderation/scan/status` every 3 seconds while status is `running`
- On `moderation_scan_progress` window event → updates progress bar in real time
- On completion: shows summary toast "Scan complete — 3 violations found in 87 messages"

### 10.3 No changes to:
- `ModerationToast.tsx` — existing handlers stay; `moderation_retroactive` events from scan use same handler
- `App.tsx`
- `AgentDetails.tsx`
- Message rendering components — `moderation_retroactive` already updates message state

---

## 11. New `moderation_keywords.json` Sections

The existing lexicon file gets two new top-level keys added. All existing keys are untouched.

```json
{
  "...existing keys...": "...",

  "spam_patterns": {
    "max_duplicates_per_minute": 2,
    "max_messages_per_10s": 5,
    "spam_phrases": [
      "follow for follow", "sub4sub", "like4like",
      "check my channel", "click my link in bio"
    ]
  },

  "scam_patterns": {
    "crypto_pump": [
      "guaranteed.*(?:profit|return|roi)",
      "double your (?:money|bitcoin|crypto|investment)",
      "(?:free|airdrop).*crypto.*(?:claim|join|now)"
    ],
    "phishing": [
      "(?:verify|confirm|update).*(?:account|password).*(?:click|link|here)",
      "your account.*(?:suspended|locked|disabled).*click"
    ],
    "prize_scam": [
      "(?:congratulations|you(?:'ve| have) (?:won|been selected))",
      "claim your (?:prize|reward|gift|voucher)",
      "lucky (?:winner|draw).*(?:click|dm|message)"
    ],
    "urgency_harvest": [
      "(?:dm|message|contact) me.*(?:urgent|asap|now)",
      "send me your (?:number|email|password|info|details)"
    ],
    "roman_urdu_scam": [
      "paisa.*double",
      "sirf.*(?:ek|ik|1).*ghante.*mein.*(?:kamao|earn)",
      "free.*mobile.*(?:jeetna|jeeto|claim)"
    ]
  }
}
```

---

## 12. Updated Celery Task Routes

In `celery_app.py`, one addition to `task_routes` and `beat_schedule`:

```python
# task_routes — add:
'tasks.agent_tasks.retroactive_scan_task': {'queue': 'high_priority'},

# beat_schedule — no change needed (retroactive scan is on-demand only, not periodic)
```

---

## 13. End-to-End Flow Diagrams

### Flow A — New Message (Live)
```
User types message
  → sockets.py send_message handler
    → instant_check(text, user_id, channel_id)   [< 5ms]
      → _check_extreme_words()   [unchanged]
      → spam_check()             [NEW — Redis flood/dup check]
      → scam_check()             [NEW — regex check]
    → if block: emit message_blocked, return
    → broadcast message_received to room instantly
    → push_to_buffer(channel_id, msg_data)
    → if buf_len >= 10: batch_moderation_task.delay()
  ← (30s later) flush_moderation_buffers fires
    → batch_moderation_task(channel_id, community_id)
      → drain_buffer()
      → batch_gemini_review()   [enhanced prompt with spam+scam]
      → for each violation:
          update violation_count
          if >= 3: remove_user
          emit moderation_retroactive  →  frontend updates message UI
```

### Flow B — Historical Scan (New)
```
Admin clicks "Scan Now" in FlaggedContent.tsx
  → POST /api/admin/community/4/moderation/scan
    → check: owner or admin? ✓
    → check: moderation agent installed? ✓
    → check: scan already running? → 409 if yes
    → retroactive_scan_task.delay(channel_id=None, community_id=4)
  ← 202 Accepted

[Celery worker — high_priority queue]
  retroactive_scan_task
    → set mod:scan:4:* = {status: running}
    → for each channel in community:
        → loop: paginate messages 10 at a time
            → skip already-reviewed messages (ai_agent_logs join)
            → batch_gemini_review(batch)
            → for each violation:
                → update violation_count, messages.moderation_flagged
                → emit moderation_retroactive  →  RealtimeContext updates UI
                → log to ai_agent_logs
            → emit moderation_scan_progress {scanned, total, flagged, percent}
    → set mod:scan:4:* = {status: done}
    → emit moderation_scan_progress {status: done, ...final counts}

[Frontend]
  FlaggedContent.tsx listens to moderation_scan_progress
    → updates progress bar in real time
    → on status=done: shows toast + refreshes flagged messages table
```

### Flow C — Agent Install Auto-Scan
```
User installs moderation agent
  → POST /api/agents/install  { agent_type: 'moderation', community_id: 4 }
    → INSERT INTO community_agents ...
    → commit
    → retroactive_scan_task.apply_async(
          args=[None, 4], countdown=5, queue='high_priority'
      )
  ← 200 Agent installed

5 seconds later → same as Flow B
```

---

## 14. Error Handling & Safety Rules

| Scenario | Handling |
|----------|----------|
| Redis down during `spam_check` | Catch exception, return `{'block': False}` — message goes through |
| Gemini 503 during retroactive scan | Stop current batch, store progress in Redis, mark scan status as `paused_gemini_error`. Admin can re-trigger. |
| Scan triggers on a community with 0 channels | Return immediately `{'scanned': 0}` |
| Scan on message already in `ai_agent_logs` | Skipped via NOT IN subquery — no double penalty |
| `violation_count` already at 3+ (user already removed) | Skip emit, log only — don't re-remove an already-removed user |
| `channel_id=None` passed to scan (scan all channels) | Query all channels for community first, enqueue one task per channel to avoid one giant task |
| Concurrent scan triggered via race condition | Redis `mod:scan` key guard with `status=running` check — second request gets 409 |
| Gemini returns non-JSON during batch | Existing `json.JSONDecodeError` handler returns `None` → messages re-buffered in live flow, skipped in historical scan |
| Scan finds violation on message by community owner | Apply warn/flag normally. Owner is **not exempt** from moderation. `remove_user` skipped if target is owner (same guard as `leave_community`) |

---

## 15. Implementation Order (When You're Ready)

1. **`moderation_keywords.json`** — Add spam/scam patterns. Safe, no code changes.
2. **`agents/moderation.py`** — Add `spam_check()`, `scam_check()`, update `instant_check()` signature with `user_id`/`channel_id` kwargs (defaults=None), add `retroactive_scan()`.
3. **`tasks/agent_tasks.py`** — Add `retroactive_scan_task`. Touch nothing else.
4. **`celery_app.py`** — Add one line to `task_routes`.
5. **SQL migration** — Run `add_moderation_v2_indexes.sql`.
6. **`routes/community_admin.py`** — Add 2 new endpoints. Touch nothing else.
7. **`routes/sockets.py`** — Update the `instant_check(content)` call to `instant_check(content, user_id, channel_id)`. One line change.
8. **`Frontend/src/contexts/RealtimeContext.tsx`** — Add one new socket subscription.
9. **`Frontend/src/pages/admin/FlaggedContent.tsx`** — Add scan card UI.

Each step is independently testable and independently deployable. Steps 1–6 are backend-only. Steps 7–9 are frontend-only.

---

## 16. What This Does NOT Change

- Existing `batch_moderation_task` signature, behavior, or Celery task name
- Existing `flush_moderation_buffers` task
- All socket event names emitted by the backend
- `ModerationToast.tsx` component
- All existing admin dashboard queries
- The 3-strike system and `violation_count` logic
- `blocked_users` table and unblock endpoints
- `_INSTANT_BLOCK_WORDS` set (extreme content list)
- Message rendering — the existing `moderation_retroactive` handler in `RealtimeContext.tsx` already handles all flag states
