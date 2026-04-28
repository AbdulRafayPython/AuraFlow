-- ============================================================
-- Migration: Normalize notification_settings
-- Move from JSON blob on users table to a dedicated 1:1 table
-- with proper columns, defaults, and indexing.
-- ============================================================

-- 1. Create the normalized table
CREATE TABLE IF NOT EXISTS user_notification_settings (
    user_id                     INT PRIMARY KEY,

    -- In-app notification toggles
    notify_direct_messages      TINYINT(1) NOT NULL DEFAULT 1,
    notify_channel_messages     TINYINT(1) NOT NULL DEFAULT 1,
    notify_friend_requests      TINYINT(1) NOT NULL DEFAULT 1,
    notify_friend_online        TINYINT(1) NOT NULL DEFAULT 0,
    notification_sounds         TINYINT(1) NOT NULL DEFAULT 1,

    -- Email notification toggles
    email_alerts_enabled        TINYINT(1) NOT NULL DEFAULT 1,
    email_dms_and_calls         TINYINT(1) NOT NULL DEFAULT 1,
    email_community_messages    TINYINT(1) NOT NULL DEFAULT 0,
    email_agent_notifications   TINYINT(1) NOT NULL DEFAULT 1,
    email_agent_summaries       TINYINT(1) NOT NULL DEFAULT 1,
    email_batch_interval_minutes INT NOT NULL DEFAULT 5,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 2. Migrate existing JSON data from users.notification_settings
INSERT IGNORE INTO user_notification_settings (
    user_id,
    email_alerts_enabled,
    email_dms_and_calls,
    email_community_messages,
    email_agent_notifications,
    email_agent_summaries,
    email_batch_interval_minutes
)
SELECT
    id,
    COALESCE(JSON_UNQUOTE(JSON_EXTRACT(notification_settings, '$.email_alerts_enabled')), 'true') = 'true',
    COALESCE(JSON_UNQUOTE(JSON_EXTRACT(notification_settings, '$.email_dms_and_calls')), 'true') = 'true',
    COALESCE(JSON_UNQUOTE(JSON_EXTRACT(notification_settings, '$.email_community_messages')), 'false') = 'true',
    COALESCE(JSON_UNQUOTE(JSON_EXTRACT(notification_settings, '$.email_agent_notifications')), 'true') = 'true',
    COALESCE(JSON_UNQUOTE(JSON_EXTRACT(notification_settings, '$.email_agent_summaries')), 'true') = 'true',
    COALESCE(JSON_EXTRACT(notification_settings, '$.email_batch_interval_minutes'), 5)
FROM users
WHERE notification_settings IS NOT NULL;

-- 3. Insert default rows for remaining users
INSERT IGNORE INTO user_notification_settings (user_id)
SELECT id FROM users
WHERE id NOT IN (SELECT user_id FROM user_notification_settings);

-- 4. Drop the old JSON column from users (run after verifying data)
-- ALTER TABLE users DROP COLUMN notification_settings;
