-- Structured engagement cards + poll votes.
--
-- The engagement agent posts conversation starters, polls, icebreakers and
-- challenges. Previously these were plain `message_type='ai'` markdown blobs.
-- These two tables attach structured, interactive data to such messages
-- (keyed by message_id) so the frontend can render proper cards and persist
-- real poll votes. The messages table itself is left untouched.
--
-- message_id mirrors messages.id which is BIGINT.

CREATE TABLE IF NOT EXISTS `engagement_cards` (
  `message_id` bigint NOT NULL,
  `channel_id` int NOT NULL,
  `kind`       varchar(20) NOT NULL,   -- 'poll' | 'starter' | 'icebreaker' | 'challenge'
  `payload`    json NOT NULL,          -- structured fields per kind
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`),
  KEY `idx_engagement_cards_channel` (`channel_id`),
  CONSTRAINT `fk_engagement_card_msg` FOREIGN KEY (`message_id`)
    REFERENCES `messages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `engagement_poll_votes` (
  `message_id`   bigint NOT NULL,
  `user_id`      int NOT NULL,
  `option_index` int NOT NULL,
  `created_at`   datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`,`user_id`),
  KEY `idx_poll_votes_msg` (`message_id`),
  CONSTRAINT `fk_poll_vote_msg` FOREIGN KEY (`message_id`)
    REFERENCES `messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_poll_vote_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
