# SQL Query Performance: Improvement & Caching Strategy

## Executive Summary

Analysis of the query diagnostic panel reveals four systemic problems driving unnecessary database load:
over-querying for cached data, expensive correlated subqueries, excessive COMMIT frequency, and missing
composite indexes. Resolving these in priority order should reduce total DB time by an estimated 60–75%.

---

## Problem 1 — Repeated User ID Lookups (Highest Impact)

**Query:** `SELECT id FROM users WHERE username = ?`
**Frequency:** 285 calls | **Share of DB time:** ~25%

### Root Cause

The user's ID is being fetched from the database on every authenticated request. Once a user logs in,
their ID is a stable, non-sensitive value that belongs in the session or token — not the database.

### Fix: Session / JWT Caching

After successful login, embed the user ID directly in the session store or JWT payload:

```javascript
// On login — store user_id in session
req.session.userId = user.id;

// Or in JWT
const token = jwt.sign({ sub: user.id, username: user.username }, SECRET, { expiresIn: '7d' });
```

Then read from the token/session on every subsequent request — zero DB calls:

```javascript
// Middleware — read from token, never hit DB
const userId = req.session.userId;         // session store
const userId = req.user.sub;               // JWT (after passport/verify middleware)
```

### Optional: Redis Layer for User Objects

If you need more than just the ID (e.g., roles, display name), cache the full user object in Redis with a
TTL tied to your session lifetime:

```javascript
async function getUserById(id) {
  const cached = await redis.get(`user:${id}`);
  if (cached) return JSON.parse(cached);

  const user = await db.query('SELECT * FROM users WHERE id = ?', [id]);
  await redis.setex(`user:${id}`, 3600, JSON.stringify(user)); // 1hr TTL
  return user;
}
```

**Invalidate on:** password change, role change, account deactivation.

---

## Problem 2 — Correlated Subqueries in JOINs

**Queries affected:**
- `SELECT communities + members` with subquery inside `COALESCE()` — 541ms total
- Unread count query with per-row subquery — 132ms total

### Root Cause

A subquery inside `COALESCE()` or a `WHERE` clause that references outer-row values runs **once per row**.
As table size grows, cost scales linearly — these queries will not stay at current latency.

### Fix A: Denormalize `member_count` into `communities`

Add a counter column and keep it updated via application logic:

```sql
ALTER TABLE communities ADD COLUMN member_count INT NOT NULL DEFAULT 0;

-- Increment on join
UPDATE communities SET member_count = member_count + 1 WHERE id = ?;

-- Decrement on leave
UPDATE communities SET member_count = member_count - 1 WHERE id = ?;
```

Then rewrite the query to drop the subquery entirely:

```sql
-- Before (expensive)
SELECT c.*, (SELECT COUNT(*) FROM members m WHERE m.community_id = c.id) AS member_count
FROM communities c
WHERE c.id = ?;

-- After (single-row read)
SELECT id, name, member_count FROM communities WHERE id = ?;
```

### Fix B: Precomputed Unread Count Table

Replace the per-row subquery with a maintained `channel_read_status` table:

```sql
CREATE TABLE channel_read_status (
  user_id        BIGINT NOT NULL,
  channel_id     BIGINT NOT NULL,
  last_read_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  unread_count   INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, channel_id)
);
```

Update `unread_count` when messages are sent or read:

```sql
-- On new message posted to channel_id
UPDATE channel_read_status
SET unread_count = unread_count + 1
WHERE channel_id = ? AND user_id != ?;  -- exclude sender

-- On user reads channel
UPDATE channel_read_status
SET unread_count = 0, last_read_at = NOW()
WHERE user_id = ? AND channel_id = ?;
```

Then the read query becomes a direct lookup with no subquery:

```sql
SELECT channel_id, unread_count
FROM channel_read_status
WHERE user_id = ?;
```

---

## Problem 3 — Excessive COMMIT Frequency

**Observed:** 101 COMMITs per diagnostic window

### Root Cause

Writes are being flushed individually — each write travels: application → network → DB → disk → ACK.
Batching these dramatically reduces round-trip and I/O overhead.

### Fix: Batch Writes in a Single Transaction

```javascript
// Before — individual commits (N round-trips)
for (const item of items) {
  await db.query('INSERT INTO events ...', [item]);
}

// After — single transaction (1 round-trip)
await db.transaction(async (trx) => {
  for (const item of items) {
    await trx.query('INSERT INTO events ...', [item]);
  }
});
```

For high-throughput write paths, consider collecting writes over a short window (e.g., 50ms) and flushing
as a batch — common in chat, analytics, and notification pipelines.

---

## Problem 4 — Missing Composite Index on `push_subscriptions`

**Query:** Upsert on `push_subscriptions(user_id, endpoint)`

### Fix

```sql
CREATE UNIQUE INDEX idx_push_subscriptions_user_endpoint
  ON push_subscriptions (user_id, endpoint);
```

This turns the upsert from a full scan into a direct key lookup, and enables efficient `ON DUPLICATE KEY`
or `INSERT ... ON CONFLICT` semantics:

```sql
INSERT INTO push_subscriptions (user_id, endpoint, token)
VALUES (?, ?, ?)
ON DUPLICATE KEY UPDATE token = VALUES(token), updated_at = NOW();
```

---

## Recommended Fix Order

| Priority | Fix | Estimated DB Time Saved |
|----------|-----|------------------------|
| 1 | Cache user ID in session/JWT | ~25% |
| 2 | Denormalize `member_count` | ~15% |
| 3 | Precomputed `channel_read_status` | ~8% |
| 4 | Batch writes (reduce COMMITs) | ~10% |
| 5 | Composite index on push_subscriptions | ~5% |

---

## Caching Architecture Overview

```
Client Request
     │
     ▼
[Auth Middleware]
  └─ Read user_id from JWT/session  ← no DB call
     │
     ▼
[Application Layer]
  ├─ Redis: user objects, community metadata, unread counts
  │    TTL: 1hr (user), 5min (counts)
  │
  └─ Invalidation events:
       • user update → del user:{id}
       • member join/leave → UPDATE communities.member_count
       • message sent → UPDATE channel_read_status.unread_count
     │
     ▼
[Database]
  └─ Only called for writes and cache misses
```

### Cache Invalidation Rules

| Cached Data | Invalidate When |
|-------------|-----------------|
| `user:{id}` | Password change, role update, deactivation |
| `community:{id}` | Name/settings change (member_count is DB-authoritative) |
| `unread:{user_id}:{channel_id}` | Message sent, message read |
| Push subscription | Token rotation, user logout |

---

## Summary

The core issue is that the database is being used as a **session store, counter store, and lookup
service** simultaneously — roles better served by the session layer, Redis, or denormalized columns.
Implementing the five fixes above targets the actual bottlenecks rather than adding generic infrastructure.
Start with the user ID cache (30-minute task, 25% gain) and measure before proceeding to the subquery
rewrites, which require a small schema migration.