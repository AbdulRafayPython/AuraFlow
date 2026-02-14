-- =============================================
-- AuraFlow Production Features Migration
-- Features: Message Search, Pinned Messages,
--           Custom Status, Unread Tracking
-- =============================================

-- 1. Channel Read Status (Unread Tracking)
-- Tracks the last read message per user per channel
CREATE TABLE IF NOT EXISTS channel_read_status (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  channel_id INT NOT NULL,
  last_read_message_id BIGINT NULL,
  last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  FOREIGN KEY (last_read_message_id) REFERENCES messages(id) ON DELETE SET NULL,
  UNIQUE KEY unique_user_channel (user_id, channel_id),
  INDEX idx_channel_read_user (user_id),
  INDEX idx_channel_read_channel (channel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 2. Ensure pinned_messages table has proper indexes
-- (Table already exists in schema, add indexes if missing)
-- ALTER TABLE pinned_messages ADD INDEX idx_pinned_channel (channel_id);
-- ALTER TABLE pinned_messages ADD UNIQUE KEY unique_pin (channel_id, message_id);

-- 3. Ensure users table has custom_status and status columns
-- (Already exist per schema, but ensure custom_status_emoji)
ALTER TABLE users ADD COLUMN custom_status_emoji VARCHAR(10) DEFAULT NULL AFTER custom_status;

-- 4. FULLTEXT index on direct_messages for search
-- (messages table already has ft_messages, add for DMs)
ALTER TABLE direct_messages ADD FULLTEXT INDEX ft_direct_messages (content);

-- 5. Add is_pinned flag to messages for quick filtering
ALTER TABLE messages ADD COLUMN is_pinned BOOLEAN DEFAULT FALSE AFTER moderation_score;
ALTER TABLE messages ADD INDEX idx_messages_pinned (channel_id, is_pinned);
