-- =====================================================================
-- add_agent_actions.sql — autonomous-agent action log
-- =====================================================================
-- Every Sense→Think→Act cycle from an AutonomousAgent inserts one row here.
-- `decision` records the agent's choice; `correlation_id` groups follow-up
-- feedback (agent_feedback) and sibling-agent reactions to the same event.
--
-- Idempotency: each agent's act() is expected to derive a deterministic
-- correlation_id (e.g. UUIDv5 over agent_name + scope + minute-bucket)
-- when it wants to dedupe across concurrent workers — the UNIQUE index
-- below makes the second insert fail silently rather than double-fire.
-- =====================================================================

CREATE TABLE IF NOT EXISTS `agent_actions` (
  `id`             BIGINT       NOT NULL AUTO_INCREMENT,
  `agent_name`     VARCHAR(32)  NOT NULL,
  `community_id`   INT          NULL,
  `channel_id`     INT          NULL,
  `user_id`        INT          NULL,
  `decision`       ENUM('act','skip','defer') NOT NULL,
  `reason`         VARCHAR(255) NULL,
  `payload_json`   JSON         NULL,
  `correlation_id` CHAR(36)     NOT NULL,
  `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_agent_correlation` (`agent_name`, `correlation_id`),
  KEY `idx_agent_created` (`agent_name`, `created_at`),
  KEY `idx_correlation` (`correlation_id`),
  KEY `idx_scope_channel` (`channel_id`, `created_at`),
  KEY `idx_scope_community` (`community_id`, `created_at`),
  KEY `idx_scope_user` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
