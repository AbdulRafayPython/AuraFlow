-- Agent marketplace (Phase 2): star ratings.
--
-- One row per (listing, person): 1 to 5 stars, changeable, removable. The publisher cannot rate
-- their own listing. The marketplace shows the average and the number of ratings.
--
-- Requires add_agent_listings.sql. Safe to re-run (IF NOT EXISTS). Confirm the target
-- database before applying.

CREATE TABLE IF NOT EXISTS `agent_listing_ratings` (
  `listing_id` INT        NOT NULL,
  `user_id`    INT        NOT NULL,
  `stars`      TINYINT    NOT NULL,
  `created_at` DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`listing_id`, `user_id`),
  KEY `idx_rating_user` (`user_id`),
  CONSTRAINT `fk_rating_listing` FOREIGN KEY (`listing_id`) REFERENCES `agent_listings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rating_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_rating_stars` CHECK (`stars` BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
