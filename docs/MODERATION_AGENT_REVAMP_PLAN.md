# Moderation Agent Revamp Plan — Gemini-Powered Smart Moderation

> **Date:** April 17, 2026  
> **Status:** Planned  
> **Scope:** Full-stack (Backend + Frontend)  
> **Goal:** Replace pure keyword-based moderation with Gemini AI hybrid approach, add professional inline warnings with 3-strike system visible to all channel members.

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Identified Gaps & Problems](#identified-gaps--problems)
3. [Phase 1 — Backend: Gemini-Powered Moderation + Strike System](#phase-1--backend-gemini-powered-moderation--strike-system)
4. [Phase 2 — Frontend: Professional Inline Moderation UI](#phase-2--frontend-professional-inline-moderation-ui)
5. [Phase 3 — Integration & Edge Cases](#phase-3--integration--edge-cases)
6. [Files Changed](#files-changed)
7. [Key Design Decisions](#key-design-decisions)

---

## Current State Analysis

| Layer | File | What Exists | Technology |
|-------|------|-------------|------------|
| **Backend Agent** | `Backend/agents/moderation.py` | Pure keyword/regex matching across 15,000+ patterns | Rule-based scoring |
| **Lexicon** | `Backend/lexicons/moderation_keywords.json` | 15,000+ patterns: profanity (15 languages), hate speech (8 categories), harassment, threats, spam, PII | Static JSON |
| **Socket Handler** | `Backend/routes/sockets.py` (lines 750-920) | Moderation check on every socket message, emits `message_blocked`, `moderation_warning`, `moderation_alert` | Socket.IO |
| **HTTP Handler** | `Backend/routes/messages.py` (lines 760-920) | Moderation + 4-step escalation ladder (warn → remove_message → remove_user → block_user) | REST API |
| **API Routes** | `Backend/routes/agents.py` | `POST /api/agents/moderation/check`, `GET /history`, `GET /stats` | Flask |
| **Celery Task** | `Backend/tasks/agent_tasks.py` (lines 138-172) | `moderate_message_task()` — async moderation | Celery |
| **Frontend Toast** | `Frontend/src/components/ModerationToast.tsx` | Toast notifications for `message_blocked`, `moderation_warning`, `moderation_alert` | React + shadcn toast |
| **Frontend Badge** | `Frontend/src/components/ModerationBadge.tsx` | Tiny inline badge next to username (Blocked/Flagged/Warning) | React + Lucide icons |
| **Agent Panel** | `Frontend/src/components/ai-agents/ModerationAgent.tsx` | Owner-only panel: stats, test moderation, history log | React |
| **Socket Service** | `Frontend/src/services/socketService.ts` | Handlers for `message_received` (with moderation data), `moderation_action_logged` | TypeScript |
| **State** | `Frontend/src/contexts/AIAgentContext.tsx` | `moderateMessage()`, `getModerationHistory()`, `getModerationStats()` | React Context |
| **Types** | `Frontend/src/types/index.ts` | `Message.moderation` with action/severity/confidence/reasons/violation_count | TypeScript |
| **Gemini Config** | `Backend/config.py` | `GEMINI_API_KEY` loaded but **NOT used by moderation** — only by `SummarizerAgent` | google-genai SDK |

### Current Moderation Flow

```
User sends message (Socket.IO or HTTP)
    ↓
Check if moderation agent is installed for community
    (community_agents table: agent_type='moderation', enabled=TRUE)
    ↓
ModerationAgent.moderate_message(text, user_id, channel_id)
    ↓
┌──────────────────────────────────────┐
│ _check_profanity()     → score 0-1  │
│ _check_hate_speech()   → score 0-1  │
│ _check_harassment()    → score 0-1  │
│ _check_spam()          → score 0-1  │
│ _check_threats()       → score 0-1  │
│ _check_personal_info() → bool       │
└──────────────────────────────────────┘
    ↓
max_score → Decision:
  < 0.3  → allow
  0.3-0.59 → warn
  0.6-0.89 → flag
  ≥ 0.9 → block
    ↓
Also: repeat offender check (3+ violations in 24hrs → block)
    ↓
Log to ai_agent_logs table
    ↓
Socket emissions based on action
```

### Current Escalation Ladder (HTTP route only)

| Violation Count | Action | Message to User |
|----------------|--------|-----------------|
| 1 | `warn` | "Warning issued. Continued violations will lead to removal." |
| 2 | `remove_message` | "Message removed due to repeated violations." |
| 3 | `remove_user` | "You were removed from this community for repeated violations." |
| 4+ | `block_user` | "You were blocked from this community for repeated violations." |

### Current Database Schema

```sql
-- Agent registry
ai_agents (id, name, type='moderator', description, is_active)

-- Per-community agent settings
community_agents (community_id, agent_type='moderation', enabled, usage_count, last_active, config_data)

-- Unified logging
ai_agent_logs (agent_id, user_id, channel_id, message_id, action_type='moderation',
               input_text, output_text, confidence_score, created_at)

-- Violation tracking
community_members.violation_count INT DEFAULT 0

-- Block list
blocked_users (community_id, user_id)
```

---

## Identified Gaps & Problems

### Gap 1: False Positives from Keyword Matching
- **Problem:** Pure keyword matching has no context awareness. Messages like *"I'm going to kill this exam"*, *"that's sick bro"*, or *"you're a beast on the field"* get flagged incorrectly.
- **Impact:** Users get warned/flagged for positive/neutral messages, eroding trust in the moderation system.
- **Root Cause:** `moderation_keywords.json` contains words like "kill", "sick", "beast" which have legitimate positive uses.

### Gap 2: Socket Handler Has NO Strike System
- **Problem:** The socket handler in `sockets.py` (lines 764-920) uses raw keyword scores to decide action (allow/warn/flag/block) but does NOT read or update `community_members.violation_count`.
- **Impact:** The 3-strike escalation system only works via HTTP message endpoint (`messages.py`). Since real-time chat goes through sockets, the strike system is effectively **broken** for live chat.
- **Critical:** This means a user could send 100 violations via socket and only ever get "warn" or "flag" — never kicked.

### Gap 3: Warning UI is Not Inline
- **Problem:** Warnings appear as ephemeral toast notifications (5-7 seconds, bottom-right corner, only visible to the offender or moderators).
- **Impact:** Other channel members have no idea a user was warned. The moderation feels invisible and ineffective.
- **Expected:** Warning should appear **above the message** in the chat flow, visible to everyone.

### Gap 4: No Agent Persona
- **Problem:** Moderation actions are anonymous system actions. No agent identity visible.
- **Impact:** Doesn't feel like an AI agent is moderating. Should be branded as "AuraFlow Moderation Agent" with a visible presence.

### Gap 5: No "User Removed" Broadcast
- **Problem:** When a user is removed (strike 3), only the user themselves get notified. Other channel members see nothing.
- **Impact:** Community doesn't know a bad actor was removed. Should broadcast a system message like *"@username has been removed by the Moderation Agent."*

### Gap 6: Gemini API Available but Unused
- **Problem:** `GEMINI_API_KEY` is configured and validated by the Summarizer agent, but the Moderation agent doesn't use it at all.
- **Impact:** Missing out on context-aware, LLM-powered moderation that could dramatically reduce false positives.

---

## Phase 1 — Backend: Gemini-Powered Moderation + Strike System

### 1A. Hybrid Moderation Engine (`moderation.py`)

Replace the pure keyword approach with a **Gemini-first, keyword-fallback hybrid**:

```
Message comes in
    ↓
┌───────────────────────────────────────────┐
│ PRE-FILTER (fast keyword check)            │
│                                            │
│ If keyword score > 0.8 → OBVIOUS violation │
│   → Skip Gemini, use keyword result        │
│                                            │
│ If keyword score < 0.1 → CLEARLY clean     │
│   → Skip Gemini, allow immediately         │
│                                            │
│ If keyword score 0.1 - 0.8 → AMBIGUOUS     │
│   → Send to Gemini for context analysis    │
└───────────────────────────────────────────┘
    ↓ (ambiguous zone only)
┌───────────────────────────────────────────┐
│ GEMINI API ANALYSIS                        │
│ Model: gemini-2.5-flash                    │
│ Timeout: 3 seconds                         │
│                                            │
│ Input: message text + context              │
│ Output: structured JSON                    │
│   {                                        │
│     "toxic": true/false,                   │
│     "category": "profanity|hate|...",      │
│     "confidence": 0.0-1.0,                │
│     "severity": "none|low|medium|high",    │
│     "explanation": "why this decision"     │
│   }                                        │
└───────────────────────────────────────────┘
    ↓
┌───────────────────────────────────────────┐
│ FINAL DECISION                             │
│                                            │
│ Gemini overrides keyword if:               │
│   - Gemini confidence > 0.7               │
│   - Gemini says non-toxic but keywords     │
│     flagged (false positive prevention)    │
│                                            │
│ Keyword overrides Gemini if:               │
│   - Gemini timeout/error (fallback)        │
│   - Keyword score > 0.8 (obvious case)    │
└───────────────────────────────────────────┘
```

#### Gemini Prompt Design

```
You are a content moderation AI for a community chat platform called AuraFlow.
Analyze the following message and determine if it violates community guidelines.

IMPORTANT CONTEXT:
- This is a casual chat platform. Users may use slang, sarcasm, and informal language.
- Common positive/neutral uses of words should NOT be flagged:
  - "I killed it" (did well), "that's sick" (cool), "you're a beast" (impressive)
  - "I'm dead" (laughing), "fire" (awesome), "savage" (bold/impressive)
- Focus on INTENT, not just keywords.
- Support multiple languages including Roman Urdu (transliterated Urdu in English script).

MESSAGE: "{message_text}"

Respond ONLY with valid JSON (no markdown, no explanation outside JSON):
{
  "toxic": boolean,
  "category": "none" | "profanity" | "hate_speech" | "harassment" | "spam" | "threats" | "sexual_content",
  "confidence": float (0.0 to 1.0),
  "severity": "none" | "low" | "medium" | "high" | "critical",
  "explanation": "brief reason for the decision"
}
```

#### Performance Optimizations

- **LRU Cache**: Cache Gemini results for identical messages (100 entries, 5 min TTL)
- **Short message bypass**: Messages < 3 characters → allow without Gemini
- **Pre-filter**: Obvious violations (score > 0.8) and clean messages (score < 0.1) skip Gemini
- **Timeout**: 3-second timeout on Gemini API calls → fallback to keyword scoring
- **Error handling**: If Gemini is unavailable, gracefully degrade to keyword-only mode

#### Gemini Client Initialization (following summarizer.py pattern)

```python
from google import genai
from google.genai import errors as genai_errors
from config import GEMINI_API_KEY

GEMINI_AVAILABLE = bool(GEMINI_API_KEY)
if GEMINI_AVAILABLE:
    _gemini_client = genai.Client(api_key=GEMINI_API_KEY)
```

---

### 1B. Fix Socket Handler Strike System (`sockets.py`)

**Add the escalation ladder to the socket handler**, matching what `messages.py` already does:

```python
# IN sockets.py on_new_message handler (after moderation_result is computed):

# Read current violation count
violation_count = 0
cur.execute(
    "SELECT violation_count FROM community_members WHERE community_id = %s AND user_id = %s",
    (community_id, user_id)
)
row = cur.fetchone()
if row:
    violation_count = row['violation_count'] or 0

# If moderation detected a violation, escalate
if moderation_result['action'] != 'allow':
    violation_count += 1
    cur.execute(
        "UPDATE community_members SET violation_count = %s WHERE community_id = %s AND user_id = %s",
        (violation_count, community_id, user_id)
    )
    
    # 3-strike escalation
    if violation_count == 1:
        final_action = 'warn'
    elif violation_count == 2:
        final_action = 'flag'  # "content flagged" message
    elif violation_count >= 3:
        final_action = 'remove_user'
```

---

### 1C. New Socket Events

| Event | Trigger | Recipients | Payload |
|-------|---------|-----------|---------|
| `moderation_warn_inline` | Strike 1 | Entire channel room | `{message_id, user_id, username, warning_text, violation_count, reasons, severity}` |
| `moderation_flag_inline` | Strike 2 | Entire channel room | `{message_id, user_id, username, flag_text, violation_count, reasons, severity}` |
| `moderation_user_removed` | Strike 3 | Entire channel room | `{user_id, username, reason, removed_by: "Moderation Agent", violation_count}` |

#### Event Payload Examples

**Strike 1 — `moderation_warn_inline`:**
```json
{
  "message_id": 12345,
  "user_id": 42,
  "username": "john_doe",
  "warning_text": "@john_doe, this message may violate community guidelines (profanity detected). Please be mindful of the community rules.",
  "violation_count": 1,
  "max_violations": 3,
  "reasons": ["profanity"],
  "severity": "low",
  "timestamp": "2026-04-17T14:30:00Z"
}
```

**Strike 2 — `moderation_flag_inline`:**
```json
{
  "message_id": 12350,
  "user_id": 42,
  "username": "john_doe",
  "flag_text": "@john_doe, your content has been flagged for repeated violations (2/3). One more violation will result in removal from this community.",
  "violation_count": 2,
  "max_violations": 3,
  "reasons": ["harassment"],
  "severity": "medium",
  "timestamp": "2026-04-17T14:35:00Z"
}
```

**Strike 3 — `moderation_user_removed`:**
```json
{
  "user_id": 42,
  "username": "john_doe",
  "reason": "Removed for repeated violations: profanity, harassment (3 strikes)",
  "removed_by": "AuraFlow Moderation Agent",
  "violation_count": 3,
  "timestamp": "2026-04-17T14:40:00Z"
}
```

---

## Phase 2 — Frontend: Professional Inline Moderation UI

### 2A. New Component: `ModerationWarningBanner.tsx`

A new React component that renders **above** the offending message in the chat flow, visible to ALL channel members.

#### Strike 1 — Warning Banner

```
┌──────────────────────────────────────────────────────────────┐
│  🛡️  AuraFlow Moderation Agent                               │
│                                                               │
│  ⚠️ @john_doe, this message may violate community guidelines  │
│  (profanity detected). Please be mindful of the community     │
│  rules.                                                       │
│                                                    Warning 1/3│
└──────────────────────────────────────────────────────────────┘
   [john_doe's message appears normally below with yellow left border]
```

- **Background:** Gradient from amber-50 to yellow-50 (light) / amber-900/20 to yellow-900/20 (dark)
- **Border:** Left border 3px solid amber-400
- **Animation:** Slide-in from top with subtle shake effect (150ms)
- **Icon:** Shield icon (amber colored)

#### Strike 2 — Flagged Banner

```
┌──────────────────────────────────────────────────────────────┐
│  🛡️  AuraFlow Moderation Agent                   🚩 FLAGGED  │
│                                                               │
│  @john_doe, your content has been flagged for repeated        │
│  violations (2/3). One more violation will result in          │
│  removal from this community.                                 │
│                                                    Strike 2/3 │
└──────────────────────────────────────────────────────────────┘
   [john_doe's message appears with orange left border + dimmed opacity]
```

- **Background:** Gradient from orange-50 to red-50 (light) / orange-900/20 to red-900/20 (dark)
- **Border:** Left border 3px solid orange-500
- **Animation:** Fade-in with pulsing border glow (2 pulses)
- **Badge:** "FLAGGED" chip in top-right corner (red background)

#### Strike 3 — Removal System Message

```
┌──────────────────────────────────────────────────────────────┐
│  🛡️  AuraFlow Moderation Agent                               │
│                                                               │
│  🚫 @john_doe has been removed from this community by the     │
│  Moderation Agent for repeated violations.                    │
│                                                               │
│  Reason: profanity, harassment (3 strikes)                    │
└──────────────────────────────────────────────────────────────┘
```

- **Background:** Gradient from red-50 to rose-50 (light) / red-900/30 to rose-900/30 (dark)
- **Border:** Left border 3px solid red-500
- **Animation:** Scale up from center (200ms) with brief red backdrop flash
- **No user message below** — the offending message is not delivered
- **Rendered as a system message** in the chat flow (centered, different style from user messages)

### 2B. Animations (CSS + Tailwind)

```css
/* Slide-in from top with shake */
@keyframes moderation-warn-enter {
  0% { transform: translateY(-20px); opacity: 0; }
  50% { transform: translateY(2px); opacity: 1; }
  65% { transform: translateX(-3px); }
  80% { transform: translateX(3px); }
  100% { transform: translateY(0) translateX(0); opacity: 1; }
}

/* Fade-in with pulsing border */
@keyframes moderation-flag-enter {
  0% { opacity: 0; box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.4); }
  50% { opacity: 1; box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.2); }
  75% { box-shadow: 0 0 0 8px rgba(249, 115, 22, 0); }
  100% { opacity: 1; box-shadow: 0 0 0 0 rgba(249, 115, 22, 0); }
}

/* Scale up with flash */
@keyframes moderation-remove-enter {
  0% { transform: scale(0.9); opacity: 0; }
  30% { transform: scale(1.02); opacity: 1; background-color: rgba(239, 68, 68, 0.1); }
  100% { transform: scale(1); opacity: 1; }
}
```

### 2C. Enhanced Message Rendering (`Dashboard.tsx`)

Insert `ModerationWarningBanner` above the message div:

```tsx
{/* Before each message */}
{msg.moderation && msg.moderation.action !== 'allow' && (
  <ModerationWarningBanner
    action={msg.moderation.action}
    severity={msg.moderation.severity}
    reasons={msg.moderation.reasons}
    username={msg.author}
    violationCount={msg.moderation.violation_count}
    maxViolations={3}
  />
)}

{/* The actual message */}
<div className={cn(
  "message-container",
  msg.moderation?.action === 'warn' && "border-l-3 border-amber-400",
  msg.moderation?.action === 'flag' && "border-l-3 border-orange-500 opacity-80",
)}>
  {/* existing message content */}
</div>
```

### 2D. New Socket Event Listeners

Add to `ModerationToast.tsx` or a new `ModerationInlineListener.tsx`:

```tsx
// Listen for inline moderation events
socket.on('moderation_warn_inline', (data) => {
  // Add warning banner to message in chat
  updateMessageModeration(data.message_id, {
    action: 'warn',
    warning_text: data.warning_text,
    violation_count: data.violation_count,
    reasons: data.reasons
  });
});

socket.on('moderation_flag_inline', (data) => {
  // Add flag banner to message in chat
  updateMessageModeration(data.message_id, {
    action: 'flag',
    flag_text: data.flag_text,
    violation_count: data.violation_count,
    reasons: data.reasons
  });
});

socket.on('moderation_user_removed', (data) => {
  // Insert system message in chat
  addSystemMessage({
    type: 'moderation_removal',
    username: data.username,
    reason: data.reason,
    removed_by: data.removed_by,
    timestamp: data.timestamp
  });
});
```

### 2E. Update `ModerationBadge.tsx`

Add strike counter to the badge:

```tsx
{violationCount > 0 && (
  <span className="ml-1 text-[10px] font-bold">
    {violationCount}/3
  </span>
)}
```

---

## Phase 3 — Integration & Edge Cases

### 3A. All Content Formats

The Gemini prompt explicitly handles:

| Format | Handling |
|--------|----------|
| Plain text | Standard analysis |
| Messages with URLs | Check if spammy/phishing, but don't flag educational/relevant links |
| File attachments | Moderate the caption/filename only (no image analysis) |
| Code blocks | Don't flag programming syntax (e.g., `kill -9`, `exec`, `abort`) |
| Mentions (@user) | Don't flag mention syntax, analyze the surrounding text |
| Mixed language | Support English + Roman Urdu + Hinglish in same message |
| Short messages | < 3 characters → auto-allow (e.g., "ok", "hi", "👍") |
| Emojis only | Generally allow unless excessive (spam detection handles this) |

### 3B. Race Condition Prevention

Both `sockets.py` and `messages.py` must use row-level locking when updating violation_count:

```sql
SELECT violation_count FROM community_members 
WHERE community_id = %s AND user_id = %s 
FOR UPDATE;
```

This prevents two concurrent messages from both reading `violation_count = 2` and both incrementing to 3 (should be 3 and 4).

### 3C. Fallback Chain

```
┌─────────────────┐
│ Gemini API Call  │
│ (3s timeout)     │
└────────┬────────┘
         │ Success? → Use Gemini result
         │ Timeout/Error ↓
┌────────┴────────┐
│ Keyword Fallback │
│ (existing logic) │
└────────┬────────┘
         │ Success? → Use keyword result
         │ Error ↓
┌────────┴────────┐
│ Allow + Log      │
│ (fail-open)      │
└─────────────────┘
```

### 3D. Caching Strategy

```python
from functools import lru_cache
import hashlib

# Cache Gemini results for identical messages
# Key: SHA256(message_text), Value: moderation result
# Max 100 entries, 5-minute TTL
_gemini_cache = {}  # {hash: (result, timestamp)}
CACHE_TTL = 300  # 5 minutes
CACHE_MAX = 100
```

### 3E. Monitoring & Logging

All Gemini calls are logged with:
- Input text (truncated to 500 chars)
- Gemini response
- Latency (ms)
- Whether cache was hit
- Whether fallback was used
- Final decision (allow/warn/flag/block)

---

## Files Changed

### Backend Changes

| File | Type | Description |
|------|------|-------------|
| `Backend/agents/moderation.py` | **MODIFY** | Add Gemini integration, hybrid scoring engine, structured prompt, LRU cache, 3s timeout, fallback chain |
| `Backend/routes/sockets.py` | **MODIFY** | Add `violation_count` read/update, 3-strike escalation ladder, new socket events (`moderation_warn_inline`, `moderation_flag_inline`, `moderation_user_removed`), user removal logic |
| `Backend/routes/messages.py` | **MODIFY** | Align with new Gemini result format, ensure same escalation logic as sockets |
| `Backend/config.py` | **NO CHANGE** | `GEMINI_API_KEY` already configured |
| `Backend/lexicons/moderation_keywords.json` | **NO CHANGE** | Kept as fallback for keyword pre-filter |

### Frontend Changes

| File | Type | Description |
|------|------|-------------|
| `Frontend/src/components/ModerationWarningBanner.tsx` | **NEW** | Inline warning/flag/removal banners with animations, agent persona branding |
| `Frontend/src/components/ModerationToast.tsx` | **MODIFY** | Update for new event types, keep private notifications for offender |
| `Frontend/src/components/ModerationBadge.tsx` | **MODIFY** | Add strike counter (1/3, 2/3, 3/3) |
| `Frontend/src/pages/Dashboard.tsx` | **MODIFY** | Integrate `ModerationWarningBanner` above messages, add system message for removals |
| `Frontend/src/services/socketService.ts` | **MODIFY** | Add handlers for `moderation_warn_inline`, `moderation_flag_inline`, `moderation_user_removed` |
| `Frontend/src/types/index.ts` | **MODIFY** | Update `Message.moderation` type with new fields |

---

## Key Design Decisions

### 1. Gemini as Primary, Keywords as Fallback
Keywords pre-filter obvious cases to save API calls, but Gemini makes the final call on ambiguous content. This eliminates false positives while maintaining speed for clear violations.

### 2. 3-Strike System Unified Across Socket + HTTP
Both `sockets.py` and `messages.py` use the same `community_members.violation_count` with `SELECT FOR UPDATE` row locking. No more inconsistency between real-time and HTTP message paths.

### 3. Inline Banners, Not Just Toasts
Warnings appear ABOVE the message in the chat flow for everyone to see. This creates social accountability and makes moderation visible and professional — similar to Discord's AutoMod.

### 4. Agent Persona
The moderation agent has a branded identity: **"AuraFlow Moderation Agent"** with a shield icon. This makes it feel like a real moderator watching the community, not anonymous system actions.

### 5. 3 Strikes, Not 4
Simplified from the current 4-step ladder (warn → remove_message → remove_user → block_user) to a cleaner 3-strike model:
- **Strike 1:** Warning banner (message delivered)
- **Strike 2:** Flagged banner (message delivered with flag)
- **Strike 3:** User removed + kicked (message blocked, system announcement)

### 6. Fail-Open with Logging
If both Gemini AND keyword systems fail, the message is allowed through but logged for manual review. This prevents moderation system failures from blocking all messages.

### 7. Privacy-Conscious Caching
Gemini results are cached by message content hash (SHA256), not user ID. Cache expires after 5 minutes. No PII is stored in cache keys.

---

## Implementation Order

1. **Phase 1A** — Gemini hybrid engine in `moderation.py` (backend core)
2. **Phase 1B** — Socket handler strike system in `sockets.py` (backend fix)
3. **Phase 1C** — New socket events (backend events)
4. **Phase 2A** — `ModerationWarningBanner.tsx` (frontend new component)
5. **Phase 2B** — Animations CSS (frontend styling)
6. **Phase 2C** — `Dashboard.tsx` integration (frontend rendering)
7. **Phase 2D** — Socket event listeners (frontend listeners)
8. **Phase 2E** — Badge update (frontend polish)
9. **Phase 3** — Edge cases, caching, monitoring (hardening)
