-- =====================================
-- Messaging Enhancement System - Database Migration
-- Pin Timer, Unread Tracking, DM Pins, Read Status
-- =====================================

-- 1. Add timer columns to pinned_messages
ALTER TABLE pinned_messages
  ADD COLUMN expires_at TIMESTAMP NULL DEFAULT NULL AFTER pinned_at,
  ADD COLUMN is_dm_pin TINYINT(1) DEFAULT 0 AFTER expires_at,
  ADD COLUMN dm_message_id BIGINT NULL AFTER is_dm_pin,
  ADD COLUMN dm_pinned_by INT NULL AFTER dm_message_id,
  ADD INDEX idx_pin_expires (expires_at),
  ADD INDEX idx_pin_dm (is_dm_pin);

-- 2. DM pinned messages table (separate for direct messages)
CREATE TABLE IF NOT EXISTS dm_pinned_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sender_id INT NOT NULL,
  receiver_id INT NOT NULL,
  message_id BIGINT NOT NULL,
  pinned_by INT NOT NULL,
  pinned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES direct_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (pinned_by) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_dm_pin (message_id),
  INDEX idx_dm_pin_pair (sender_id, receiver_id),
  INDEX idx_dm_pin_expires (expires_at)
);

-- 3. Channel read status table (if not exists)
CREATE TABLE IF NOT EXISTS channel_read_status (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  channel_id INT NOT NULL,
  last_read_message_id BIGINT DEFAULT 0,
  last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_channel (user_id, channel_id),
  INDEX idx_channel_read (channel_id, user_id)
);

-- 4. Community-level unread tracking (aggregated per community per user)
CREATE TABLE IF NOT EXISTS community_unread_status (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  community_id INT NOT NULL,
  total_unread INT DEFAULT 0,
  last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_community (user_id, community_id),
  INDEX idx_community_unread (community_id, user_id)
);

-- 5. DM read cursor tracking
CREATE TABLE IF NOT EXISTS dm_read_status (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  other_user_id INT NOT NULL,
  last_read_message_id BIGINT DEFAULT 0,
  unread_count INT DEFAULT 0,
  last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (other_user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_dm_read (user_id, other_user_id),
  INDEX idx_dm_read_user (user_id)
);
