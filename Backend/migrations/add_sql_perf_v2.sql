-- ============================================================================
-- SQL Performance Fixes v2
-- ============================================================================
-- Apply after deploying the corresponding application code changes.
-- Run: mysql -u <user> -p <db> < migrations/add_sql_perf_v2.sql
--
-- Fixes addressed:
--   FIX 2  — Denormalized member_count column on communities
--   FIX 7  — UNIQUE composite index on push_subscriptions(user_id, endpoint)
--   FIX 6  — Composite index on community_members(user_id, community_id)
--   FIX 9  — Composite index on channel_members(channel_id, user_id)
--   FIX 1  — Confirm index on users(username) for cache-miss fallback
-- ============================================================================


-- ─── FIX 2: Denormalized member_count ────────────────────────────────────────
-- Eliminates the correlated subquery:
--   (SELECT COUNT(*) FROM community_members WHERE community_id = c.id)
-- The application now increments/decrements this column on join/leave.

-- MySQL-compatible conditional ADD COLUMN (IF NOT EXISTS is MariaDB-only)
SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'communities'
      AND COLUMN_NAME  = 'member_count'
);
SET @add_col = IF(
    @col_exists = 0,
    'ALTER TABLE communities ADD COLUMN member_count INT NOT NULL DEFAULT 0 COMMENT ''Denormalized count — maintained by application on join/leave''',
    'SELECT 1'
);
PREPARE _stmt FROM @add_col;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- Backfill existing communities so the column is accurate on first deploy.
UPDATE communities c
SET    member_count = (
    SELECT COUNT(*) FROM community_members cm WHERE cm.community_id = c.id
);


-- ─── FIX 7: UNIQUE index on push_subscriptions(user_id, endpoint) ────────────
-- Turns "INSERT … ON DUPLICATE KEY UPDATE" from a full scan into a direct key
-- lookup, and enforces the uniqueness constraint the upsert relies on.

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_user_endpoint
    ON push_subscriptions (user_id, endpoint);


-- ─── FIX 6: Composite index for role-check queries ────────────────────────────
-- Speeds up:
--   SELECT 1 FROM community_members WHERE user_id = ? AND role = ? LIMIT 1
--   SELECT role FROM community_members WHERE user_id = ? AND community_id = ? AND role IN (...)

CREATE INDEX IF NOT EXISTS idx_community_members_user_community
    ON community_members (user_id, community_id);

CREATE INDEX IF NOT EXISTS idx_community_members_community_user
    ON community_members (community_id, user_id);


-- ─── FIX 9: Composite index for channel-membership checks ────────────────────
-- Speeds up:
--   SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?

CREATE INDEX IF NOT EXISTS idx_channel_members_channel_user
    ON channel_members (channel_id, user_id);


-- ─── FIX 1: Confirm username index (cache-miss fallback) ─────────────────────
-- users.username should already be UNIQUE; this ensures the index exists for
-- the fallback DB query used when Redis cache is cold.

CREATE INDEX IF NOT EXISTS idx_users_username
    ON users (username);


-- ─── FIX 8: Index to speed up unread JOIN against messages ───────────────────
-- The rewritten unread query joins messages on (channel_id, id, sender_id).
-- The existing idx_msg_channel_time (channel_id, created_at DESC) helps for
-- ordering; adding (channel_id, id) covers the range scan on m.id.

CREATE INDEX IF NOT EXISTS idx_messages_channel_id
    ON messages (channel_id, id);
