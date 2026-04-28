# AuroFlow — Codebase Bug Report
**Date:** April 25, 2026  
**Status:** 21 issues found across Backend and Frontend  
**Already Fixed:** GREATEST(NULL) bug in `channel_read_status` upsert (sockets.py, status.py, unread_tracker.py)

---

## Severity Legend
| Level | Meaning |
|-------|---------|
| 🔴 High | Data corruption, duplicate UI events, broken core features |
| 🟡 Medium | Feature misbehavior, performance, security |
| 🟢 Low | Edge-case UI glitch, code hygiene |

---

## 🔴 HIGH SEVERITY

---

### Bug 1 — Duplicate Messages in UI
**File:** `Backend/routes/messages.py` lines 837–838  
**Problem:** `send_message()` emits `message_received` to **both** `channel_{id}` AND `community_{id}` rooms. Every user who has the channel open is in both rooms and receives the event **twice**.

```python
# BROKEN — double emit
socketio.emit('message_received', payload, room=f"channel_{channel_id}", ...)
socketio.emit('message_received', payload, room=f"community_{community_id}", ...)
```

**Impact:** Every message appears twice in the chat for every user currently viewing the channel.  
**Fix:** Emit to `channel_{channel_id}` only for message delivery. Keep `community_{community_id}` for `channel_activity` (unread tracking) only.

```python
# FIXED
socketio.emit('message_received', payload, room=f"channel_{channel_id}", namespace='/')
# Remove the community_ emit line
```

---

### Bug 2 — `mark_channel_read` Silently Skips DB Write for Empty Channels
**File:** `Backend/services/unread_tracker.py` lines 223–230  
**Problem:** When `MAX(id)` returns no rows, `result` is `{'max_id': None}` (a truthy dict). `result['max_id']` is `None`, not `0`. `message_id = None` is falsy → the DB write is silently skipped.

```python
# BROKEN
result = cur.fetchone()                          # {'max_id': None}
message_id = result['max_id'] if result else 0   # → None
if message_id:                                   # None is falsy → SKIP
    cur.execute("INSERT INTO channel_read_status ...")
```

**Impact:** In-memory count clears (badge disappears), but no DB row exists. On reconnect `load_user_unreads` sees `NULL`, causing `COALESCE(NULL, 0) = 0` → all messages counted as unread again.  
**Fix:**
```python
message_id = result['max_id'] if (result and result['max_id']) else 0
if message_id:
    cur.execute("INSERT INTO channel_read_status ...")
```

---

### Bug 3 — Community Unread Badge Stuck (Cold `_channel_community_map`)
**File:** `Backend/services/unread_tracker.py` lines 235–244  
**Problem:** `mark_channel_read` looks up `community_id = _channel_community_map.get(channel_id)`. After a server restart this map is empty until `increment_channel_unread` is called for the channel. If no new messages have arrived since restart, `community_id` is `None` — the community counter is never decremented.

**Impact:** Community icon unread badge stays permanently lit even after the user reads every channel, until the next server restart + user reconnect.  
**Fix:** Add a DB fallback:
```python
community_id = _channel_community_map.get(channel_id)
if not community_id:
    with conn.cursor() as cur:
        cur.execute("SELECT community_id FROM channels WHERE id = %s", (channel_id,))
        row = cur.fetchone()
        if row:
            community_id = row['community_id']
            _channel_community_map[channel_id] = community_id
```

---

### Bug 4 — Double Unread Increment (Socket Path + HTTP Path)
**Files:** `Backend/routes/sockets.py` ~line 860, `Backend/routes/messages.py` `_emit_unread_tracking()`  
**Problem:** When a message arrives via the socket `new_message` event, the handler emits `channel_activity` AND calls `increment_channel_unread`. The HTTP `send_message` endpoint does both too. If both code paths execute for the same message, the unread count increments by **2** instead of 1.

**Impact:** Unread badges show double the real count for any message going through both paths.  
**Fix:** Remove `increment_channel_unread` and `channel_activity` emit from the socket `new_message` handler. The HTTP path should be the single canonical source of unread tracking.

---

### Bug 5 — Cross-Device Mark-Read Silently Dropped
**File:** `Frontend/src/hooks/useUnreadCounts.ts` line 205  
**Problem:** The `handleUnreadUpdate` handler guards updates with `>= current`:

```ts
// BROKEN
const current = prev.channels[data.channel_id] || 0;
if (data.channel_unread >= current) {   // 0 >= 5 → FALSE → update dropped!
    next.channels[data.channel_id] = data.channel_unread;
}
```

When `mark_channel_read` emits `unread_update` with `channel_unread: 0`, the server-authoritative zero is always `< current` positive count, so it is silently discarded.

**Impact:** If user reads a channel on a second tab or device, the first tab's badge never clears until a full page reload.  
**Fix:** Remove the `>= current` guard entirely, or always accept `channel_unread === 0` unconditionally:
```ts
// Option A — always trust server
next.channels[data.channel_id] = data.channel_unread;
next.totalChannelUnread = Math.max(0, prev.totalChannelUnread + (data.channel_unread - current));

// Option B — trust zero explicitly
if (data.channel_unread === 0 || data.channel_unread >= current) { ... }
```

---

### Bug 6 — DM Read Receipt Field Name Mismatch (Completely Broken Feature)
**Files:** `Backend/routes/sockets.py` line 2018, `Frontend/src/services/socketService.ts` line 553  
**Problem:** Backend emits `reader_id` but frontend expects `user_id`:

```python
# Backend emits:
socketio.emit('dm_messages_read', {'reader_id': user_id, 'reader_username': username}, ...)
```

```ts
// Frontend reads:
this.socket.on('dm_messages_read', (data: { user_id: number }) => {
    handler({ sender_id: data.user_id, ... });  // data.user_id is undefined!
});
```

**Impact:** DM read receipts are completely non-functional. The sender never sees that their messages were read. `sender_id` becomes `undefined`, silently updating `dms[undefined]` which is a no-op.  
**Fix:** Change backend to use `user_id`:
```python
socketio.emit('dm_messages_read', {'user_id': user_id, 'reader_username': username}, ...)
```

---

### Bug 20 — Seed INSERT Stores NULL → All Future Messages Unread in New Channels
**File:** `Backend/services/unread_tracker.py` lines 52–65  
**Problem:** The seed INSERT for new channels uses `(SELECT MAX(m.id) FROM messages m WHERE ...)` which returns `NULL` for empty channels, storing `NULL` as `last_read_message_id`.

```sql
-- BROKEN — stores NULL for channels with no messages
INSERT INTO channel_read_status (user_id, channel_id, last_read_message_id)
SELECT cm.user_id, cm.channel_id,
       (SELECT MAX(m.id) FROM messages m WHERE m.channel_id = cm.channel_id)
-- MAX returns NULL when no messages exist
```

**Impact:** After the first message is sent in a new channel, `COALESCE(NULL, 0) = 0` makes every member see ALL messages as unread — even messages sent before they joined or when they were present.  
**Fix:**
```sql
-- FIXED — store 0 instead of NULL
SELECT cm.user_id, cm.channel_id,
       COALESCE((SELECT MAX(m.id) FROM messages m WHERE m.channel_id = cm.channel_id), 0)
```

---

## 🟡 MEDIUM SEVERITY

---

### Bug 7 — Rate Limiter Memory Leak on Disconnect
**File:** `Backend/routes/sockets.py` lines 28–40  
**Problem:** `_socket_rate_buckets` (a `defaultdict(list)` keyed by SID) is never cleaned up on disconnect. Each connection permanently adds an entry even after the socket disconnects.  
**Impact:** Slow memory leak. Long-running servers with high connection churn accumulate thousands of stale SID entries.  
**Fix:** In `handle_disconnect`:
```python
_socket_rate_buckets.pop(request.sid, None)
```

---

### Bug 8 — Multi-Tab Ephemeral Events Misrouted
**File:** `Backend/routes/sockets.py` line 257, `Backend/routes/messages.py` ~line 667  
**Problem:** `user_socket_sessions[username] = request.sid` only stores the **most recently connected** tab's SID. Events sent to `room=user_sid` go to the last-connected tab, not the one that triggered the action.  
**Impact:** `/summarize` result, `summary_generating` status, and similar ephemeral events appear in the wrong tab when the user has multiple tabs open.  
**Fix:** Replace `room=user_sid` with `room=f"user_{user_id}"` (the personal room all tabs join).

---

### Bug 9 — `community_unread_status` Written But Never Read (Dead Writes)
**File:** `Backend/services/unread_tracker.py` lines 330–355  
**Problem:** The `_persistence_loop` writes community totals to `community_unread_status` every 30 seconds, but this table is never queried. `load_user_unreads` recalculates everything from scratch from `channel_read_status`, and `get_user_unreads` reads in-memory dicts.  
**Impact:** Unnecessary DB writes every 30 seconds. The persisted data is stale and unused.  
**Fix:** Either remove the community persistence writes (and the table), or make `load_user_unreads` use it as a warm-start cache.

---

### Bug 10 — Missing Channel Membership Check Before `mark_channel_read` (IDOR)
**File:** `Backend/routes/status.py` ~line 317  
**Problem:** The HTTP `POST /api/status/unread/mark-read` endpoint accepts any `channel_id` and upserts `channel_read_status` without verifying the user is a channel member.  
**Impact:** Any authenticated user can insert `channel_read_status` rows for channels they don't belong to (low-severity IDOR — no message content exposed, but pollutes the table).  
**Fix:**
```python
cur.execute("SELECT 1 FROM channel_members WHERE channel_id=%s AND user_id=%s", (channel_id, user_id))
if not cur.fetchone():
    return jsonify({'error': 'Not a member of this channel'}), 403
```

---

### Bug 11 — `load_user_unreads` Called on Every HTTP GET /unread (Performance)
**File:** `Backend/routes/status.py` ~line 228  
**Problem:**
```python
load_user_unreads(user_id)   # full DB scan + COUNT(*) per channel on every request
unreads = get_user_unreads(user_id)
```
This runs heavy multi-join COUNT queries for every channel the user is in, on every poll/reload.  
**Impact:** Significant DB load at scale. Defeats the purpose of the in-memory cache.  
**Fix:** Only load from DB when the user's cache is cold:
```python
from services.unread_tracker import _channel_unread
if user_id not in _channel_unread:
    load_user_unreads(user_id)
unreads = get_user_unreads(user_id)
```

---

### Bug 12 — Socket Emit Possible Before `conn.commit()` Succeeds
**File:** `Backend/services/notification_service.py` lines 55–72  
**Problem:** If `conn.commit()` raises an exception (e.g. MySQL deadlock), the except block rolls back — but the notification was potentially already emitted via socket before the commit was confirmed.  
**Impact:** Recipients see a notification that was never saved to the database. On page reload, the notification vanishes.  
**Fix:** Ensure all emits happen strictly after a successful commit, inside the `try` block after `conn.commit()`.

---

### Bug 13 — `markChRead` Fires on Every New Message Received While Viewing Channel
**File:** `Frontend/src/pages/Dashboard.tsx` lines 334–339  
**Problem:**
```tsx
useEffect(() => {
    markChRead(currentChannel.id, ...);
}, [currentChannel?.id, messages.length, markChRead, currentCommunity?.id]);
//                        ↑ fires on every new message!
```
**Impact:** For a busy channel with 100 messages/minute, 100 `mark_channel_read` socket events are emitted per minute per viewer, each triggering a server-side `SELECT MAX(id) FROM messages` query.  
**Fix:** Track the last emitted `messageId` with a `useRef` and only emit when the latest message ID changes, not on every `messages.length` change. Or debounce with 1–2s.

---

### Bug 14 — 3 Separate Hook Instances with Duplicate Socket Handlers
**Files:** `Dashboard.tsx`, `ChannelSidebar.tsx`, `FaviconBadge.tsx` each call `useUnreadCounts()`  
**Problem:** Each instance registers its own `channel_activity`, `unread_update`, `initial_unreads`, and `dm_unread_update` handlers. Three instances → three separate handlers per event, each with its own `state` and `lastSeenRef`.  
**Impact:** (a) Triple CPU per event. (b) Same message processed by 3 dedup refs independently. (c) `FaviconBadge`'s instance diverges from `ChannelSidebar`'s — favicon count can differ from sidebar badge count (Bug 5 amplifies this).  
**Fix:** Lift `useUnreadCounts` state into a React Context so a single instance drives all three consumers.

---

### Bug 15 — `get_unreads` Returns Zeros on Cold Worker
**File:** `Backend/routes/sockets.py` lines 2026–2045  
**Problem:**
```python
@socketio.on('get_unreads')
def handle_get_unreads():
    unreads = get_user_unreads(user_id)   # reads in-memory only — empty on cold worker
    emit('initial_unreads', unreads)
```
On a multi-worker Gunicorn deployment, a worker that hasn't served this user's `connect` event has empty in-memory state.  
**Impact:** After a server restart or worker rebalance, users get all-zero unread counts until they fully disconnect and reconnect.  
**Fix:**
```python
if user_id not in _channel_unread:
    load_user_unreads(user_id)
unreads = get_user_unreads(user_id)
```

---

### Bug 16 — `@mention` Notifies Users Outside the Community (Info Disclosure)
**File:** `Backend/routes/messages.py` lines 42–70  
**Problem:** `_notify_mentions` sends a push notification to `@mentioned` users without checking if they are members of the community or channel. The notification body includes the channel name and community name.  
**Impact:** Any user can be notified about a message in a private community they have no access to, leaking that the channel and community exist and that messages are being sent there.  
**Fix:** Add membership check inside the mention loop:
```python
cur.execute(
    "SELECT 1 FROM community_members WHERE community_id=%s AND user_id=%s",
    (community_id, row['id'])
)
if not cur.fetchone():
    continue   # user not in community — skip notification
```

---

## 🟢 LOW SEVERITY

---

### Bug 17 — Favicon Badge Shows Stale Count (Async Image Load Race)
**File:** `Frontend/src/hooks/useFaviconBadge.ts` lines 43–73  
**Problem:** Each count change creates a new `Image` object with an async `onload`. If `totalUnread` changes faster than images load, multiple loads are in-flight. The **last image to finish loading** wins — which may not be the most recent count.  
**Impact:** Favicon briefly shows an outdated count (e.g. "3" when the real count is "7") in rapid-message scenarios.  
**Fix:** Track the in-flight image via `useRef` and abort old loads before starting new ones:
```ts
const imgRef = useRef<HTMLImageElement | null>(null);
// In drawBadge:
if (imgRef.current) { imgRef.current.onload = null; }
const img = new Image();
imgRef.current = img;
// ... rest of draw logic
```

---

### Bug 18 — Private Channel Activity Events Leak to Non-Members
**File:** `Frontend/src/hooks/useUnreadCounts.ts` ~line 100  
**Problem:** `channel_activity` is emitted to the entire `community_{id}` room. The frontend only filters out `sender_id === myId` or `channel_id === activeChannel`. If the community has private/restricted channels, non-members in the community room still receive these events and their unread counters increment for channels they cannot see.  
**Impact:** Users get phantom unread counts for channels they're not in, and potentially receive browser notification previews of messages from private channels.  
**Fix:** Either (a) move `channel_activity` emission to `channel_{channel_id}` room only, or (b) maintain a membership list in the frontend and skip events for non-member channels.

---

### Bug 19 — `localStorage` Notifications Never Purged for Old Users
**File:** `Frontend/src/contexts/NotificationsContext.tsx` ~line 93  
**Problem:** `saveNotificationsToStorage` writes up to 50 notifications per user under `auroflow_notifications_{userId}`. On logout, the key is never removed. Every user who logs in on a shared device accumulates an entry.  
**Impact:** On a shared device over time, `localStorage` fills up (~5 MB limit) causing `JSON.parse` failures and broken notification state for all users.  
**Fix:** On logout (when `isAuthenticated` transitions to `false`), clear the previous user's storage key:
```ts
// In NotificationsProvider, on auth change:
useEffect(() => {
    if (!isAuthenticated && user?.id) {
        localStorage.removeItem(`auroflow_notifications_${user.id}`);
    }
}, [isAuthenticated]);
```

---

### Bug 21 — Double `conn.commit()` on Socket Connect
**File:** `Backend/routes/sockets.py` lines 308, 323  
**Problem:** `conn.commit()` is called once after `UPDATE users SET status='online'`, and then again after the `load_user_unreads` block — on the same connection with no pending changes.  
**Impact:** Harmless on MySQL (commits empty transaction), but logically incorrect and could mask connection pool issues.  
**Fix:** Remove the second `conn.commit()` call after the `load_user_unreads` block.

---

## Summary Table

| # | File | Severity | Category | Fixed? |
|---|------|----------|----------|--------|
| — | sockets.py / status.py / unread_tracker.py | 🔴 High | `GREATEST(NULL)` → badge never cleared | ✅ Fixed |
| 1 | messages.py | 🔴 High | Double `message_received` emit → duplicate messages | ❌ |
| 2 | unread_tracker.py | 🔴 High | `if message_id:` skips DB write when MAX returns NULL | ❌ |
| 3 | unread_tracker.py | 🔴 High | Cold `_channel_community_map` → community badge stuck | ❌ |
| 4 | sockets.py + messages.py | 🔴 High | Double unread increment | ❌ |
| 5 | useUnreadCounts.ts | 🔴 High | `>= current` guard drops server zero → cross-device mark-read broken | ❌ |
| 6 | sockets.py / socketService.ts | 🔴 High | `reader_id` vs `user_id` → DM read receipts broken | ❌ |
| 20 | unread_tracker.py | 🔴 High | Seed INSERT stores NULL → new channels always show unread | ❌ |
| 7 | sockets.py | 🟡 Medium | Rate limiter memory leak on disconnect | ❌ |
| 8 | sockets.py / messages.py | 🟡 Medium | Multi-tab ephemeral events misrouted | ❌ |
| 9 | unread_tracker.py | 🟡 Medium | `community_unread_status` dead writes | ❌ |
| 10 | status.py | 🟡 Medium | Missing membership check before mark-read (IDOR) | ❌ |
| 11 | status.py | 🟡 Medium | `load_user_unreads` on every GET /unread (perf) | ❌ |
| 12 | notification_service.py | 🟡 Medium | Socket emit before commit confirmed | ❌ |
| 13 | Dashboard.tsx | 🟡 Medium | `markChRead` fires on every new message | ❌ |
| 14 | useUnreadCounts.ts (×3) | 🟡 Medium | Triplicate hook instances → divergent state | ❌ |
| 15 | sockets.py | 🟡 Medium | `get_unreads` returns zeros on cold worker | ❌ |
| 16 | messages.py | 🟡 Medium | `@mention` notifies non-members (info disclosure) | ❌ |
| 17 | useFaviconBadge.ts | 🟢 Low | Async image load race → stale favicon count | ❌ |
| 18 | useUnreadCounts.ts | 🟢 Low | Private channel activity leaks to non-members | ❌ |
| 19 | NotificationsContext.tsx | 🟢 Low | `localStorage` never purged for old users | ❌ |
| 21 | sockets.py | 🟢 Low | Double `conn.commit()` on connect | ❌ |

---

## Recommended Fix Order

1. **Bug 6** — DM read receipts (1-line backend fix, high impact)
2. **Bug 1** — Remove duplicate `message_received` emit (1-line backend fix, prevents duplicate messages)
3. **Bug 5** — Remove `>= current` guard in `handleUnreadUpdate` (1-line frontend fix)
4. **Bug 20** — Fix seed INSERT with `COALESCE` (1-line SQL fix)
5. **Bug 2** — Fix `if message_id` NULL guard (1-line Python fix)
6. **Bug 3** — Add DB fallback for cold `_channel_community_map`
7. **Bug 16** — Add community membership check for `@mentions`
8. **Bug 10** — Add channel membership check in mark-read HTTP endpoint
9. **Bug 15** — Add cold-cache check in `get_unreads`
10. **Bug 14** — Lift `useUnreadCounts` to Context (larger refactor)
