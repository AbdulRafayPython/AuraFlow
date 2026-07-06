-- =====================================================================
-- add_agent_state.sql — per-agent goals, adaptive thresholds, last-run
-- =====================================================================
-- An AutonomousAgent reads/writes its persistent state here. Scope tuple
-- (agent_name, scope_type, scope_id, goal_key) is unique so an agent can
-- maintain several independent goals at different granularities — e.g.
-- a community-wide engagement target *and* per-channel thresholds that
-- the learn() hook adjusts over time.
--
-- `thresholds` is a free-form JSON object so each agent can store whatever
-- it needs (bandit arm rewards, dismissal counts, decay weights) without
-- requiring a migration per agent.
-- =====================================================================

CREATE TABLE IF NOT EXISTS `agent_state` (
  `id`             BIGINT      NOT NULL AUTO_INCREMENT,
  `agent_name`     VARCHAR(32) NOT NULL,
  `scope_type`     ENUM('community','channel','user','global') NOT NULL,
  `scope_id`       INT         NULL,
  `goal_key`       VARCHAR(64) NOT NULL DEFAULT 'default',
  `goal_value`     JSON        NULL,
  `thresholds`     JSON        NULL,
  `last_acted_at`  DATETIME    NULL,
  `last_outcome`   ENUM('positive','negative','neutral','unknown') NULL,
  `updated_at`     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_agent_scope_goal` (`agent_name`, `scope_type`, `scope_id`, `goal_key`),
  KEY `idx_agent_scope` (`agent_name`, `scope_type`, `scope_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
