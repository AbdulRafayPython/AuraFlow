-- =========================================================
-- Block Appeals
-- Blocked users can appeal; community admins review them.
-- =========================================================
CREATE TABLE IF NOT EXISTS `block_appeals` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `community_id` INT NOT NULL,
  `block_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `message` TEXT NOT NULL,
  `status` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `reviewed_by` INT NULL,
  `reviewed_at` DATETIME NULL,
  `admin_note` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_community_status` (`community_id`, `status`, `created_at`),
  KEY `idx_user` (`user_id`),
  CONSTRAINT `appeals_community_fk` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE CASCADE,
  CONSTRAINT `appeals_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `appeals_reviewed_by_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
