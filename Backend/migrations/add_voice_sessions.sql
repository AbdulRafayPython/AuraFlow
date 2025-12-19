-- =========================================
-- Voice Sessions Table Migration
-- Tracks active users in voice channels
-- =========================================

CREATE TABLE IF NOT EXISTS `voice_sessions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `channel_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `is_muted` BOOLEAN DEFAULT FALSE,
  `is_deaf` BOOLEAN DEFAULT FALSE,
  `joined_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `last_activity` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `unique_voice_session` (`channel_id`, `user_id`),
  INDEX `idx_channel_id` (`channel_id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_joined_at` (`joined_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
