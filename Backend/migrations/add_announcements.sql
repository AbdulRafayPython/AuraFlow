-- =========================================================
-- Community Announcements
-- Admin/owner pinned announcements per community.
-- Served as a banner at the top of the community dashboard.
-- =========================================================
CREATE TABLE IF NOT EXISTS `community_announcements` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `community_id` INT NOT NULL,
  `author_id` INT NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `body` TEXT NOT NULL,
  `is_pinned` TINYINT(1) NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `expires_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_community_active` (`community_id`, `is_active`, `created_at`),
  KEY `idx_pinned` (`community_id`, `is_pinned`, `is_active`),
  CONSTRAINT `announcements_community_fk` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE CASCADE,
  CONSTRAINT `announcements_author_fk` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
