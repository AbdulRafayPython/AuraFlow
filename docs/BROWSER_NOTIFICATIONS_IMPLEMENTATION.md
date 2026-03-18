# 🔔 AuroFlow — Browser-Based Notification System

## Complete Audit & Implementation Plan

> **Date:** March 13, 2026 (last updated: March 16, 2026)  
> **Scope:** Full notification system — in-app toasts, browser notifications (tab hidden/minimized), persistent notification storage, and all notification-worthy events.

> **Implementation Status:** Phase 1 ✅ COMPLETE | Phase 2 ✅ COMPLETE | Phase 3 ✅ COMPLETE | Phase 4 ✅ COMPLETE | Phase 5 ✅ COMPLETE | Phase 6 ✅ COMPLETE | Phase 7 ✅ COMPLETE

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Architecture Overview](#2-architecture-overview)
3. [Event-by-Event Notification Matrix](#3-event-by-event-notification-matrix)
4. [What's Working](#4-whats-working)
5. [What's Broken](#5-whats-broken)
6. [What's Missing](#6-whats-missing)
7. [Implementation Plan](#7-implementation-plan)
8. [Backend Changes](#8-backend-changes)
9. [Frontend Changes](#9-frontend-changes)
10. [Browser Notification Specification](#10-browser-notification-specification)
11. [File-by-File Change Map](#11-file-by-file-change-map)

---

## 1. Current State Assessment

### Infrastructure Inventory

| Component | Status | Location |
|-----------|--------|----------|
| **Notifications DB table** | ✅ EXISTS — `notifications` + `push_subscriptions` tables | `migrations/add_notifications_tables.sql` |
| **Notification API endpoints** | ✅ EXISTS — GET/PATCH/DELETE + push subscribe/unsubscribe | `routes/notifications.py` |
| **Notification model/service** | ✅ EXISTS — `create_notification()` with DB persist + socket emit + web push | `services/notification_service.py` |
| **NotificationsContext (frontend)** | ✅ EXISTS — localStorage-based, max 50, dedup via hash, Web Audio chime | `src/contexts/NotificationsContext.tsx` |
| **NotificationButton (UI panel)** | ✅ EXISTS — in FriendsSidebar icon rail (globally visible), dropdown opens right | `src/components/NotificationButton.tsx` |
| **NotificationBell (UI panel)** | 🗑️ DELETED (was dead code) | — |
| **Browser Notification API (all events)** | ✅ EXISTS — unified hook handles DMs, channels, friends, community removal | `src/hooks/useBrowserNotifications.ts` |
| **Browser Notification API (Calls)** | ✅ EXISTS — shows OS notification for incoming calls when tab hidden | `src/components/call/IncomingCallOverlay.tsx` |
| **Favicon badge** | ✅ EXISTS — canvas-drawn red circle with count + mounts unified notification hook | `src/hooks/useFaviconBadge.ts` |
| **Notification sound** | ✅ FIXED — Web Audio API oscillator chime (C6→E6 two-tone) | `NotificationsContext.tsx` |
| **Call sounds** | ✅ WORKING — Web Audio API oscillator tones | `src/services/callSoundService.ts` |
| **Service Worker** | ✅ EXISTS — handles push events + notification clicks | `public/sw.js` |
| **Web Push (FCM/VAPID)** | ✅ EXISTS — VAPID keys + pywebpush + push subscriptions | `config.py`, `services/notification_service.py` |
| **PWA manifest** | ✅ EXISTS — standalone display, theme color, icons | `public/manifest.webmanifest` |
| **Celery notification tasks** | ✅ EXISTS — `check_user_summary_schedules` sends notification on generation | `tasks/agent_tasks.py` |

---

## 2. Architecture Overview

### Current Flow (Socket-Only)

```
Backend Socket Event
    ↓
socketService.ts (listener)
    ↓
Feature Context (FriendsContext, DirectMessagesContext, RealtimeContext, CallContext)
    ↓
DOM CustomEvent dispatch
    ↓
NotificationsContext (listener)
    ↓
├── Toast popup (shadcn useToast)
├── Sound (/notification.mp3 — BROKEN)
├── localStorage persistence
└── NotificationButton badge count
```

### Browser Notification Flow (DMs & Calls Only)

```
Socket → socketService.onDirectMessage()
    ↓
useDMNotifications.ts
    ↓ (only when document.hidden && permission granted)
new Notification("sender sent you a message", { body, icon, tag })

Socket → CallContext sets callState = 'ringing'
    ↓
IncomingCallOverlay.tsx
    ↓ (only when document.hidden)
new Notification("Incoming call from...", { requireInteraction: true })
```

### Critical Limitation

**Everything requires an active Socket.IO connection.** If the browser tab is closed (not just minimized) or the WebSocket drops, ALL notifications are permanently lost. There is no offline queue, no push subscription, no background delivery.

---

## 3. Event-by-Event Notification Matrix

| Event | Socket Event | In-App Toast | Browser Notification | Sound | Persistent (DB) | Badge/Unread |
|-------|-------------|-------------|---------------------|-------|-----------------|-------------|
| **New DM message** | `receive_direct_message` + `notification` | ✅ via CustomEvent bridge | ✅ `useBrowserNotifications.ts` + SW push | ✅ Web Audio chime | ✅ DB + localStorage | ✅ favicon + sidebar |
| **New channel message** | `channel_activity` | ✅ via CustomEvent bridge | ✅ `useBrowserNotifications.ts` | ✅ Web Audio chime | ❌ localStorage only | ✅ unread counter + NotificationButton |
| **Friend request received** | `friend_request_received` + `notification` | ✅ via CustomEvent bridge | ✅ `useBrowserNotifications.ts` + SW push | ✅ Web Audio chime | ✅ DB + localStorage | ✅ NotificationButton |
| **Friend request accepted** | `friend_request_accepted` + `notification` | ✅ via CustomEvent bridge | ✅ `useBrowserNotifications.ts` + SW push | ✅ Web Audio chime | ✅ DB + localStorage | ✅ NotificationButton |
| **Friend request rejected** | `friend_request_rejected` | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO |
| **Friend removed** | `friend_removed` | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO |
| **Incoming call** | `call:ringing` | ✅ Full-screen overlay | ✅ `IncomingCallOverlay.tsx` | ✅ oscillator ringtone | ❌ NO | ❌ NO |
| **Missed call** | Call log DM | ✅ (as DM message) | ✅ (as DM via useBrowserNotifications) | ✅ Web Audio chime | ❌ localStorage only | ✅ (as DM badge) |
| **Community kicked/banned** | `community:removed` + `notification` | ✅ via CustomEvent bridge | ✅ `useBrowserNotifications.ts` + SW push | ✅ Web Audio chime | ✅ DB + localStorage | ✅ NotificationButton |
| **Message pinned** | `message_pinned` | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO |
| **Reaction on your message** | `message_reaction_update` | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO |
| **@mention in channel** | `notification` (server push) | ✅ via server-notification event | ✅ `useBrowserNotifications.ts` + SW push | ✅ Web Audio chime | ✅ DB | ✅ NotificationButton |
| **Reply to your message** | `notification` (server push) | ✅ via server-notification event | ✅ `useBrowserNotifications.ts` + SW push | ✅ Web Audio chime | ✅ DB | ✅ NotificationButton |
| **Moderation action** | `message_blocked/warning` | ✅ ModerationToast | ❌ NO | ❌ NO | ❌ NO | ❌ NO |
| **Agent result ready** | `summary_result` + `notification` | ✅ (socket → sender) | ✅ `useBrowserNotifications.ts` + SW push | ✅ Web Audio chime | ✅ DB (scheduled summaries) | ✅ NotificationButton |
| **Scheduled summary** | `notification` type `summary_ready` (Celery → socket + push) | ✅ success toast (6s) | ✅ `useBrowserNotifications.ts` + SW push | ✅ Web Audio chime | ✅ DB | ✅ NotificationButton (📄 cyan icon) |
| **Role changed** | NONE (no event exists) | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO |
| **User joined community** | `community_member_added` | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO |
| **Community invite** | NONE (no system exists) | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO |

---

## 4. What's Working

1. **DM browser notifications** — When tab is hidden and a DM arrives, an OS-level notification pops up via unified `useBrowserNotifications.ts`. Shows sender avatar, display name, and message preview. Auto-closes after 6s. Clicking focuses the tab.

2. **Channel message browser notifications** — When tab is hidden and a message arrives in a community channel, an OS-level notification shows the community logo (or icon+color fallback), `#channelName · communityName` title, and `senderName: preview` body. Auto-closes after 6s.

3. **Call browser notifications** — When tab is hidden and a call rings, an OS-level notification pops up via `IncomingCallOverlay.tsx`. Uses `requireInteraction: true` so it stays until the user acts.

4. **In-app toasts** — `friend_request_received`, `newMessageReceived`, `channelMessageReceived`, `friendRequestAccepted`, and `community:removed` all produce colored toast popups via `NotificationsContext → shadcn toast`.

5. **Notification sound** — Web Audio API two-tone oscillator chime (C6→E6, 80ms each) plays on every notification. Replaces the broken `/notification.mp3` approach.

6. **Favicon badge** — `useFaviconBadge.ts` draws a red circle with unread count on the favicon and prepends `(N)` to `document.title`.

7. **NotificationButton panel** — Bell icon in the FriendsSidebar icon rail (globally visible on all pages). 48×48 amber/orange gradient button with unread badge. Dropdown opens to the right with notification list, "Mark all read", "Clear all", sorted by time. Supports channel_message type with community logo rendering.

8. **Unread tracking** — `channel_activity` and `dm_unread_update` socket events update sidebar badges and favicon. Channel activity payload is enriched with community branding and sender details.

9. **Friend request accepted notifications** — `socketService.ts` dispatches `friendRequestAccepted` CustomEvent with full user data. Shows in both toast and browser notification.

10. **Unified browser notification hook** — `useBrowserNotifications.ts` handles all 5 event types (DMs, channel messages, friend requests, friend accepted, community removal) from a single mount point in `FaviconBadge.tsx`.

---

## 5. What's Broken — ✅ ALL FIXED

All issues identified in the original audit have been resolved:

### ~~5.1 Notification Sound File Missing~~ ✅ FIXED

Replaced `new Audio('/notification.mp3')` with Web Audio API oscillator chime (C6→E6 two-tone, 80ms each). No file dependency — guaranteed to work.

### ~~5.2 `friendRequestAccepted` Event Never Dispatched~~ ✅ FIXED

Added `friendRequestAccepted` CustomEvent dispatch in `socketService.ts` where the full backend data (username, display_name, avatar_url) is available.

### ~~5.3 DM Browser Notification Fallback Icon Wrong~~ ✅ FIXED

Fixed fallback from `/favicon.ico` to `/AuraflowLogo.png`. Now uses `getAvatarUrl()` for proper avatar resolution with dicebear fallback.

### ~~5.4 Double Sound on DMs~~ ✅ FIXED

Removed duplicate `new Audio('/notification.mp3')` listener from `DirectMessageView.tsx`. Sound now plays once via `NotificationsContext`.

### ~~5.5 NotificationBell is Dead Code~~ ✅ FIXED

Deleted `NotificationBell.tsx` (192 lines of dead code).

---

## 6. What's Missing

### 6.1 ~~No Persistent Notification Storage (Backend)~~ ✅ FIXED

Backend `notifications` and `push_subscriptions` tables created. `notification_service.py` persists all notifications and emits real-time socket events. Frontend fetches from `/api/notifications` on login and merges with localStorage.

### ~~6.2 No Channel Message Notifications~~ ✅ FIXED

**Now implemented.** Channel messages produce:
- In-app toast via `NotificationsContext` (title: `#channelName · communityName`, message: `senderName: preview`)
- Browser notification via `useBrowserNotifications.ts` with community logo icon
- Web Audio chime sound
- `channel_message` type in NotificationButton dropdown with community logo rendering

Backend `channel_activity` event (emitted from `messages.py:_emit_unread_tracking`) now carries enriched payload: `sender_name`, `sender_avatar`, `channel_name`, `community_name`, `community_logo`, `community_icon`, `community_color`, `content_preview`.

### ~~6.3 No @Mention Detection/Notification~~ ✅ FIXED

Backend `messages.py` now parses `@username` via regex, resolves usernames to user IDs, and calls `create_notification()` for each mentioned user. Frontend handles `mention` notification type with toast + browser notification.

### ~~6.4 No Reply-to-Your-Message Notification~~ ✅ FIXED

When a message has `reply_to`, the backend looks up the original author and calls `create_notification()`. Frontend handles `reply` notification type.

### 6.5 No Reaction Notification

When someone reacts to your message with an emoji, you get no notification. The `message_reaction_update` / `dm_reaction_update` events only broadcast the reaction change to all viewers — they don't notify the message author specifically.

### 6.6 No Pin Notification

When a message is pinned/unpinned, the event is broadcast to the channel/DM, but no specific notification is sent to active users or the message author.

### ~~6.7 No Service Worker / Web Push~~ ✅ FIXED

Service Worker (`public/sw.js`) handles push events and notification clicks. Web Push via VAPID + `pywebpush` sends offline notifications. PWA manifest (`public/manifest.webmanifest`) enables installable web app. Push subscriptions stored in `push_subscriptions` table. Frontend `pushService.ts` handles SW registration, subscription, and unsubscription.

### 6.8 No Role Change Notification

When an admin promotes/demotes a community member, there is no notification. The admin panel has role change functionality but no corresponding notification event.

### 6.9 ~~No Agent Completion Push Notification~~ ✅ FIXED

Scheduled summary generation (both per-user and community auto-summarize) now creates a persistent notification via `create_notification()` in the Celery task. The notification includes the channel name, message count, and a link to the community. Delivered via socket (if online) + web push (if offline) + stored in DB for later retrieval.

---

## 7. Implementation Plan

### Phase 1: Fix What's Broken (Quick Wins) — ✅ COMPLETE

| # | Task | Status | Files Changed |
|---|------|--------|---------------|
| 1.1 | ~~Add notification sound file~~ → Web Audio API chime | ✅ DONE | `NotificationsContext.tsx` |
| 1.2 | Fix `friendRequestAccepted` CustomEvent dispatch | ✅ DONE | `socketService.ts` |
| 1.3 | Fix DM notification icon fallback to `/AuraflowLogo.png` | ✅ DONE | `useBrowserNotifications.ts` |
| 1.4 | Fix double-play sound on DMs (remove from DirectMessageView) | ✅ DONE | `DirectMessageView.tsx` |
| 1.5 | Remove dead `NotificationBell.tsx` | ✅ DONE | DELETED |

### Phase 2: Add Missing Browser Notifications (Tab Hidden/Minimized) — ✅ COMPLETE

| # | Task | Status | Files Changed |
|---|------|--------|---------------|
| 2.1 | Create unified `useBrowserNotifications` hook | ✅ DONE | `src/hooks/useBrowserNotifications.ts` |
| 2.2 | Add browser notifications for channel messages | ✅ DONE | Hook + `useUnreadCounts.ts` + `NotificationsContext.tsx` |
| 2.3 | Add browser notifications for friend request events | ✅ DONE | Hook (listens to `friendRequestReceived` + `friendRequestAccepted` CustomEvents) |
| 2.4 | Add browser notifications for moderation events | ❌ SKIPPED | Not high priority |
| 2.5 | Add browser notifications for community kick/ban | ✅ DONE | Hook (listens to `communityRemoved` CustomEvent) |
| 2.6 | Integrate into `FaviconBadge.tsx` (single mount point) | ✅ DONE | `FaviconBadge.tsx` (replaced `useDMNotifications`) |

### Additional Work Completed (Beyond Original Plan)

| # | Task | Files Changed |
|---|------|---------------|
| A.1 | Backend: Enriched `channel_activity` payload with community branding + sender info | `Backend/routes/sockets.py`, `Backend/routes/messages.py` |
| A.2 | Backend: `_emit_unread_tracking()` in messages.py enriched with DB queries for channel/community/sender data | `Backend/routes/messages.py` |
| A.3 | Frontend: `channel_message` notification type in NotificationsContext | `NotificationsContext.tsx` |
| A.4 | Frontend: NotificationButton supports `channel_message` with community logo/icon rendering | `NotificationButton.tsx` |
| A.5 | Frontend: NotificationButton relocated from Dashboard header to FriendsSidebar icon rail (globally visible) | `NotificationButton.tsx`, `FriendsSidebar.tsx`, `Dashboard.tsx` |
| A.6 | Frontend: NotificationButton supports `placement` prop (`'header'` / `'sidebar'`) with right-opening dropdown | `NotificationButton.tsx` |

### Phase 3: Backend Notification Persistence — ✅ COMPLETE

| # | Task | Status | Files |
|---|------|--------|-------|
| 3.1 | Create `notifications` + `push_subscriptions` table migration | ✅ DONE | `Backend/migrations/add_notifications_tables.sql` |
| 3.2 | Create `notification_service.py` | ✅ DONE | `Backend/services/notification_service.py` |
| 3.3 | Create notification API routes (GET/PATCH/DELETE) | ✅ DONE | `Backend/routes/notifications.py` |
| 3.4 | Emit persistent notifications from existing handlers | ✅ DONE | `friends.py`, `messages.py`, `community_admin.py` |
| 3.5 | Frontend: Fetch notifications on login + merge with localStorage | ✅ DONE | `NotificationsContext.tsx` |

### Phase 4: @Mention & Reply Notifications — ✅ COMPLETE

| # | Task | Status | Files |
|---|------|--------|-------|
| 4.1 | Backend: Parse `@username` in messages, create notification for mentioned users | ✅ DONE | `Backend/routes/messages.py` (`_notify_mentions()`) |
| 4.2 | Backend: On reply, create notification for original message author | ✅ DONE | `Backend/routes/messages.py` (`_notify_reply()`) |
| 4.3 | Frontend: Add `mention` and `reply` notification types + toast handling | ✅ DONE | `NotificationsContext.tsx`, `useBrowserNotifications.ts` |

### Phase 5: Service Worker + Web Push (Offline Notifications) — ✅ COMPLETE

| # | Task | Status | Files |
|---|------|--------|-------|
| 5.1 | Generate VAPID keys, add to backend config + .env | ✅ DONE | `config.py`, `.env` |
| 5.2 | Create Service Worker file | ✅ DONE | `Frontend/public/sw.js` |
| 5.3 | Add `manifest.webmanifest` | ✅ DONE | `Frontend/public/manifest.webmanifest` |
| 5.4 | Frontend: Register SW + subscribe to push | ✅ DONE | `Frontend/src/services/pushService.ts`, `useBrowserNotifications.ts` |
| 5.5 | Backend: Store push subscriptions (subscribe/unsubscribe endpoints) | ✅ DONE | `Backend/routes/notifications.py` |
| 5.6 | Backend: Send web push on critical events | ✅ DONE | `Backend/services/notification_service.py` |
| 5.7 | Add `pywebpush` Python package | ✅ DONE | `Backend/requirements.txt` |

### Phase 6: Summarizer Scheduling & Notification Fixes — ✅ COMPLETE

| # | Task | Status | Files |
|---|------|--------|-------|
| 6.1 | Fix scheduling UI to work from Settings (no communityId) | ✅ DONE | `AgentSettingsModal.tsx` |
| 6.2 | Add community selector to schedule form | ✅ DONE | `AgentSettingsModal.tsx` |
| 6.3 | Show community name in existing schedule list | ✅ DONE | `AgentSettingsModal.tsx` |
| 6.4 | Send notification on scheduled summary generation | ✅ DONE | `Backend/tasks/agent_tasks.py` |
| 6.5 | Fix call log raw JSON in notification toasts | ✅ DONE | `NotificationsContext.tsx`, `useBrowserNotifications.ts` |
| 6.6 | Fix call log raw JSON in sidebar recent messages | ✅ DONE | `FriendsSidebar.tsx` |
| 6.7 | Add `formatCallPreview()` shared helper | ✅ DONE | `src/lib/utils.ts` |

### Phase 7: Summary Notification Type & Bell/Browser Integration — ✅ COMPLETE

| # | Task | Status | Files |
|---|------|--------|-------|
| 7.1 | Fix `notif_type` → `type` parameter bug in Celery task | ✅ DONE | `Backend/tasks/agent_tasks.py` |
| 7.2 | Add `summary_ready` notification type (replaces generic `system`) | ✅ DONE | `Backend/tasks/agent_tasks.py` |
| 7.3 | Manual socket emit from Celery (bypass uninitialized `_socketio`) | ✅ DONE | `Backend/tasks/agent_tasks.py` |
| 7.4 | Add `summary_ready` to `Notification` type union | ✅ DONE | `NotificationsContext.tsx` |
| 7.5 | Add `summary_ready` to server→local type mapping | ✅ DONE | `NotificationsContext.tsx` |
| 7.6 | Add success toast for `summary_ready` (6s duration) | ✅ DONE | `NotificationsContext.tsx` |
| 7.7 | Add `FileText` icon for `summary_ready` in bell panel | ✅ DONE | `NotificationButton.tsx` |
| 7.8 | Add blue→cyan gradient avatar for summary notifications | ✅ DONE | `NotificationButton.tsx` |
| 7.9 | Add click→navigate to community for `summary_ready` | ✅ DONE | `NotificationButton.tsx` |
| 7.10 | Browser notification via existing `server-notification` handler | ✅ WORKS | `useBrowserNotifications.ts` (no change needed) |
| 7.11 | Add missing DELETE API for generated scheduled summaries | ✅ DONE | `Backend/routes/agents.py`, `Frontend/src/services/aiAgentService.ts` |

---

## 8. Backend Changes

### 8.1 Notifications Table (Phase 3)

```sql
CREATE TABLE notifications (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT NOT NULL,
    type          ENUM('dm','channel_message','mention','reply','reaction',
                       'friend_request','friend_accepted','friend_rejected',
                       'call_missed','community_removed','role_changed',
                       'moderation','pin','agent_result','system') NOT NULL,
    title         VARCHAR(255) NOT NULL,
    body          TEXT,
    icon_url      VARCHAR(500),
    link          VARCHAR(500),               -- deep link path (e.g. /community/5/channel/12)
    related_id    BIGINT,                      -- generic FK (message_id, community_id, etc.)
    is_read       TINYINT(1) DEFAULT 0,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_read (user_id, is_read),
    INDEX idx_user_created (user_id, created_at DESC),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### 8.2 Push Subscriptions Table (Phase 5)

```sql
CREATE TABLE push_subscriptions (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    endpoint        VARCHAR(500) NOT NULL,
    p256dh_key      VARCHAR(200) NOT NULL,
    auth_key        VARCHAR(200) NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_endpoint (endpoint(191)),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### 8.3 Notification API Endpoints (Phase 3)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/notifications` | List user's notifications (paginated, filterable by type/read status) |
| `GET` | `/api/notifications/unread-count` | Return `{ count: N }` |
| `PATCH` | `/api/notifications/<id>/read` | Mark single notification as read |
| `PATCH` | `/api/notifications/read-all` | Mark all as read |
| `DELETE` | `/api/notifications/<id>` | Delete single notification |
| `DELETE` | `/api/notifications/clear` | Delete all notifications for user |
| `POST` | `/api/push/subscribe` | Store push subscription |
| `DELETE` | `/api/push/unsubscribe` | Remove push subscription |

### 8.4 Notification Service (Phase 3)

Central function called from all socket handlers:

```python
# services/notification_service.py
def create_notification(user_id, type, title, body=None, icon_url=None, link=None, related_id=None):
    """
    1. INSERT into notifications table
    2. Emit socket event 'notification' to user_{user_id} room
    3. If user has push subscriptions AND is offline → send web push
    """
```

### 8.5 @Mention Detection (Phase 4)

In message send handlers (`sockets.py` + `messages.py`), after saving the message:

```python
import re
mentions = re.findall(r'@(\w+)', content)
if mentions:
    # Look up user IDs for mentioned usernames
    # For each mentioned user (excluding sender):
    #   create_notification(user_id, 'mention', f'{sender} mentioned you in #{channel}', ...)
```

### 8.6 Reply Notification (Phase 4)

In message send handlers, when `reply_to` is present:

```python
if reply_to_id:
    # Fetch original message's sender_id
    # If original_sender != current_sender:
    #   create_notification(original_sender, 'reply', f'{sender} replied to your message', ...)
```

### 8.7 Scheduled Summary Notification (Phase 6 → Phase 7 fix)

In the Celery task `check_user_summary_schedules`, after storing the summary:

```python
from services.notification_service import create_notification
msg_count = result.get('message_count', 0)
notif = create_notification(
    user_id=schedule['user_id'],
    type='summary_ready',
    title=f"📝 Summary ready — #{schedule['channel_name']}",
    body=f"Your scheduled summary ({msg_count} messages) is ready to view.",
    icon_url='/AuraflowLogo.png',
    link=f"/community/{schedule['community_id']}",
    related_id=schedule['channel_id'],
    emit=False,  # Celery worker may not have _socketio initialized
)
# Emit notification via the socketio obtained from current_app
if notif and socketio:
    socketio.emit('notification', notif, room=f"user_{schedule['user_id']}", namespace='/')
```

**Bug fix (Phase 7):** The original code used `notif_type='system'` but the function parameter is `type`, causing a `TypeError` and preventing all scheduled summary notifications from being created. Fixed to `type='summary_ready'` with `emit=False` + manual socket emission (since Celery workers don't have `notification_service._socketio` initialized).

This triggers:
1. **DB persistence** — notification stored in `notifications` table
2. **Socket emit** — `notification` event to `user_{id}` room (manual emit from task)
3. **Web Push** — sent via VAPID/pywebpush (if offline with active subscription)
4. **Browser notification** — via `server-notification` CustomEvent → `useBrowserNotifications.ts`
5. **In-app toast** — via `NotificationsContext` listener → `showSuccess()` with 6s duration
6. **Bell panel** — shows dedicated blue/cyan `FileText` icon with gradient background

### 8.8 Summary Schedule API Endpoints (Phase 6 + Phase 7)

Full CRUD for per-user summary schedules (`user_summary_schedules` table) and generated scheduled summaries (`scheduled_summaries` table):

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/agents/summary-schedules` | List current user's schedule configs |
| `POST` | `/api/agents/summary-schedules` | Create/upsert a schedule (channel + time + timezone) |
| `PUT` | `/api/agents/summary-schedules/<id>` | Update schedule time/active status |
| `DELETE` | `/api/agents/summary-schedules/<id>` | Delete a schedule config |
| `GET` | `/api/agents/summary-schedules/pending` | Fetch undelivered generated summaries (marks as delivered) |
| `DELETE` | `/api/agents/summary-schedules/pending/<id>` | Delete a generated scheduled summary |

Frontend service methods in `aiAgentService.ts`:
- `getSummarySchedules()` / `createSummarySchedule()` / `updateSummarySchedule()` / `deleteSummarySchedule()`
- `getPendingSummaries()` / `deleteScheduledSummary()`

---

## 9. Frontend Changes

### 9.1 Unified Browser Notification Hook (Phase 2)

Replace the scattered approach with one hook:

```ts
// src/hooks/useBrowserNotifications.ts
/**
 * Single hook that manages ALL browser (OS-level) notifications.
 * Requests permission once, listens to NotificationsContext, and shows
 * native Notification popups when the tab is hidden.
 *
 * Mounted once in FaviconBadge.tsx alongside other global hooks.
 */
export function useBrowserNotifications() {
  // 1. Request Notification.permission on mount
  // 2. Listen to NotificationsContext for new notifications
  // 3. When document.hidden && permission granted:
  //    - Show new Notification() with appropriate title/body/icon
  //    - Tag by type+sender to collapse duplicates
  //    - Auto-close after 5s (except calls which use requireInteraction)
  //    - On click: window.focus() + navigate to relevant page
}
```

**This replaces:** `useDMNotifications.ts` + the call notification logic in `IncomingCallOverlay.tsx`.

### 9.2 Notification Types Extension

```ts
// Add to NotificationsContext
type NotificationType =
  | 'dm'
  | 'channel_message'
  | 'mention'
  | 'reply'
  | 'reaction'
  | 'friend_request'
  | 'friend_accepted'
  | 'friend_rejected'
  | 'call_missed'
  | 'community_removed'
  | 'role_changed'
  | 'moderation'
  | 'pin'
  | 'agent_result'
  | 'system';
```

### 9.3 Sound Fix

Either:
- **Option A:** Add a real `notification.mp3` to `public/` (simple beep/chime, <50KB)
- **Option B:** Generate sound via Web Audio API (like calls) — no file needed, guaranteed to work

### 9.4 Channel Message Notification

In `RealtimeContext.tsx`, when `message_received` fires for a channel the user is NOT currently viewing:

```ts
// Only notify when:
// 1. User is not currently viewing that channel
// 2. Message is not from the current user
// 3. Tab is hidden OR user is in a different channel
addNotification({
  type: 'channel_message',
  title: `New message in #${channelName}`,
  message: `${senderName}: ${preview}`,
  ...
});
```

### 9.5 NotificationsContext Fetch from Backend (Phase 3)

On login, instead of only loading from localStorage:

```ts
useEffect(() => {
  if (isAuthenticated) {
    // 1. Load from localStorage (instant)
    // 2. Fetch from /api/notifications (merge, newer wins)
    // 3. Listen for socket 'notification' event for real-time additions
  }
}, [isAuthenticated]);
```

---

## 10. Browser Notification Specification

### When Browser Notifications Should Fire

Browser (`Notification` API) notifications should ONLY fire when:
1. `document.hidden === true` (tab not in foreground)
2. `Notification.permission === 'granted'`
3. The notification type is enabled in user settings

### Design Principles

- **Rich & Informative**: Every notification must clearly show WHO did WHAT and WHERE
- **Community Branding**: Channel message notifications show the community logo (or icon+color fallback)
- **User Identity**: DM and friend notifications show the user's avatar
- **Content Preview**: Always include a meaningful preview — never just "New message"
- **Consistent Layout**: All notifications follow a uniform structure: Sender → Action → Context

### Notification Content per Event Type

| Event | Title | Body | Icon | Tag (collapse key) | Auto-close |
|-------|-------|------|------|---------------------|------------|
| **DM message** | `{displayName}` | `{messagePreview}` (max 120 chars, file type fallback) | Sender avatar or app logo | `dm-{senderId}` | 5s |
| **Channel message** | `#{channelName} • {communityName}` | `{displayName}: {messagePreview}` (max 120 chars) | Community logo or app logo | `ch-{channelId}` | 5s |
| **@Mention** | `{senderName} mentioned you` | `in #{channelName}: {preview}` | Sender avatar | `mention-{messageId}` | 8s |
| **Reply** | `{senderName} replied to you` | `{preview}` | Sender avatar | `reply-{messageId}` | 5s |
| **Friend request** | `Friend Request` | `{displayName} (@{username}) wants to be your friend` | Sender avatar or app logo | `fr-{senderId}` | 8s |
| **Friend accepted** | `Friend Request Accepted` | `{displayName} accepted your friend request` | User avatar or app logo | `fa-{userId}` | 5s |
| **Incoming call** | `Incoming {type} Call` | `{callerDisplayName} is calling you` | Caller avatar | `call-{callerId}` | `requireInteraction` |
| **Missed call** | `Missed Call` | `from {callerDisplayName}` | Caller avatar | `missed-{callerId}` | 8s |
| **Community removed** | `Removed from {communityName}` | `You were {reason} from {communityName}` | Community logo or app logo | `removed-{communityId}` | 10s |
| **Moderation warning** | `Message Flagged` | `Your message in #{channelName} was flagged for review` | App logo | `mod-{messageId}` | 8s |

### Backend Payload Enrichment

The `channel_activity` socket event must carry enough data for rich notifications:

```python
# Emitted from sockets.py on_new_message handler
socketio.emit('channel_activity', {
    'channel_id': channel_id,
    'community_id': community_id,
    'sender_id': user_id,
    'message_id': message_id,
    # ── Rich fields for notifications ──
    'sender_name': display_name or username,
    'sender_avatar': avatar_url,        # user's avatar_url
    'channel_name': channel_name,
    'community_name': community_name,
    'community_logo': community_logo,   # logo_url from communities table
    'community_icon': community_icon,   # text icon fallback
    'community_color': community_color, # hex color for icon background
    'content_preview': content[:120],
}, room=f"community_{community_id}", namespace='/')
```

### In-App Toast Design (NotificationsContext)

Toasts use the shadcn `useToast` hook. Each notification type produces a styled toast:

- **Channel message**: Title = `#{channelName} • {communityName}`, Description = `{senderName}: {preview}`
- **DM message**: Title = `{displayName}`, Description = `{preview}` (or file type indicator)
- **Friend request**: Title = `New Friend Request`, Description = `{displayName} wants to be your friend`
- **Friend accepted**: Title = `Friend Request Accepted`, Description = `{displayName} accepted your request`
- **Community removed**: Title = `Removed from Community`, Description = reason with community name

### NotificationButton Panel Item Design

Each notification row in the dropdown panel shows:

```
[ Avatar/Logo ]  Title                          [ time ]
                 Description (2 lines max)      [ unread dot ]
                 Type badge (colored pill)
```

- **Channel messages**: Show community logo (with icon+color fallback), title = `#{channelName} • {communityName}`
- **DM messages**: Show sender avatar, title = sender display name
- **Friend requests**: Show sender avatar, blue "Friend Request" badge
- **System events**: Show community logo/icon or app logo

### Click Behavior

Every notification `onclick` should:
1. `window.focus()` — bring browser to foreground
2. Navigate to relevant page:
   - DM → `/dm/{conversationId}`
   - Channel → `/community/{id}/channel/{channelId}`
   - Friend request → Friends page or notification panel
   - Call → DM with caller
3. `notification.close()`

### Permission Request Strategy

- Request `Notification.requestPermission()` only ONCE after first successful login
- If `denied`, never ask again — show subtle banner in Settings suggesting to enable in browser
- Store permission state to avoid redundant checks

### Notification Settings (User Preferences)

Users should be able to toggle per notification type in Settings → Notifications:

```
☑ Direct Messages
☑ Channel Messages (only when not viewing the channel)
☑ @Mentions
☑ Replies to your messages
☑ Friend Requests
☑ Incoming Calls
☑ Moderation Alerts
☐ Reactions (off by default — too noisy)
☐ Pin notifications (off by default)
```

These preferences should be stored in the backend user settings and respected by both the browser notification hook and the backend push service.

---

## 11. File-by-File Change Map

### Files CREATED

| File | Phase | Purpose | Status |
|------|-------|---------|--------|
| `Frontend/src/hooks/useBrowserNotifications.ts` | 2 | Unified browser notification hook for all event types | ✅ DONE |
| `Frontend/public/manifest.webmanifest` | 5 | PWA manifest for service worker | ✅ DONE |
| `Frontend/public/sw.js` | 5 | Service Worker for push notifications | ✅ DONE |
| `Backend/migrations/add_notifications_tables.sql` | 3 | `notifications` + `push_subscriptions` tables | ✅ DONE |
| `Backend/services/notification_service.py` | 3 | Central notification creation + web push | ✅ DONE |
| `Backend/routes/notifications.py` | 3 | Notification CRUD API endpoints + push subscribe/unsubscribe | ✅ DONE |
| `Frontend/src/services/pushService.ts` | 5 | Service Worker registration + push subscription | ✅ DONE |

### Files MODIFIED

| File | Phase | Change | Status |
|------|-------|--------|--------|
| `Frontend/src/contexts/NotificationsContext.tsx` | 1, 2, 3, 6, 7 | Web Audio chime, `channel_message` type, backend fetch + merge, call log preview, `summary_ready` type + toast | ✅ DONE |
| `Frontend/src/services/socketService.ts` | 1, 3 | `friendRequestAccepted` dispatch, `notification` socket listener | ✅ DONE |
| `Frontend/src/hooks/useBrowserNotifications.ts` | 2, 4, 5, 6 | Unified hook: DMs, channels, friends, mentions, replies, server-notification, push init, call log preview | ✅ DONE |
| `Frontend/src/hooks/useUnreadCounts.ts` | 2 | Dispatch `channelMessageReceived` CustomEvent with enriched data | ✅ DONE |
| `Frontend/src/components/DirectMessageView.tsx` | 1 | Removed duplicate notification sound play | ✅ DONE |
| `Frontend/src/components/FaviconBadge.tsx` | 2 | Replaced `useDMNotifications` with `useBrowserNotifications` | ✅ DONE |
| `Frontend/src/components/NotificationButton.tsx` | 2, 7 | `channel_message` support, community logo rendering, `placement` prop, sidebar mode, `summary_ready` icon + click handler | ✅ DONE |
| `Frontend/src/components/sidebar/FriendsSidebar.tsx` | 2, 6 | NotificationButton in icon rail, call log preview in recent messages | ✅ DONE |
| `Frontend/src/pages/Dashboard.tsx` | 2 | Removed NotificationButton from header (moved to sidebar) | ✅ DONE |
| `Frontend/src/components/modals/AgentSettingsModal.tsx` | 6 | Community selector for scheduling, works without communityId prop | ✅ DONE |
| `Frontend/src/lib/utils.ts` | 6 | Added `formatCallPreview()` helper for call log display | ✅ DONE |
| `Frontend/index.html` | 5 | Manifest link + theme-color meta | ✅ DONE |
| `Backend/routes/sockets.py` | 2 | Enriched `channel_activity` emit with community branding + sender info | ✅ DONE |
| `Backend/routes/messages.py` | 2, 3, 4 | Enriched `_emit_unread_tracking()`, `create_notification()` calls, @mention + reply detection | ✅ DONE |
| `Backend/routes/friends.py` | 3 | `create_notification()` on friend request send/accept | ✅ DONE |
| `Backend/routes/community_admin.py` | 3 | `create_notification()` on member removal | ✅ DONE |
| `Backend/app.py` | 3 | Register notifications blueprint, init notification service | ✅ DONE |
| `Backend/requirements.txt` | 5 | Added `pywebpush` package | ✅ DONE |
| `Backend/config.py` | 5 | VAPID key env vars | ✅ DONE |
| `Backend/tasks/agent_tasks.py` | 6, 7 | `create_notification()` on scheduled summary, fix `notif_type` bug, `summary_ready` type, manual socket emit | ✅ DONE |
| `Backend/routes/agents.py` | 7 | Added `DELETE /summary-schedules/pending/<id>` for generated scheduled summaries | ✅ DONE |
| `Frontend/src/services/aiAgentService.ts` | 7 | Added `deleteScheduledSummary()` service method | ✅ DONE |

### Files DELETED

| File | Reason | Status |
|------|--------|--------|
| `Frontend/src/components/NotificationBell.tsx` | Dead code — never imported, duplicate of NotificationButton | ✅ DELETED |

---

## Priority Recommendation

✅ **All 7 phases are COMPLETE.** The notification system is fully operational:

- **Phases 1–2:** Fixed broken functionality + unified browser notifications for all event types
- **Phase 3:** Backend persistence (DB, API, service) — notifications survive across sessions
- **Phase 4:** @mention + reply detection and notifications
- **Phase 5:** Service Worker + Web Push (VAPID) for offline notifications
- **Phase 6:** Summarizer scheduling fix (community/channel picker in Settings), scheduled summary notifications, call log preview formatting
- **Phase 7:** Summary notification type fix (`notif_type` bug), dedicated `summary_ready` bell icon + browser notification + toast, manual socket emit from Celery, missing DELETE API for generated scheduled summaries

Remaining low-priority items: reaction notifications, pin notifications, role change notifications, notification preference toggles in Settings page.
