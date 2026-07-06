-- =====================================================================
-- add_agent_feedback.sql — user feedback on autonomous-agent actions
-- =====================================================================
-- Wired from POST /api/agents/<name>/feedback. Each row is one user
-- reaction (👍 / 👎 / dismissed / engaged / ignored) to a logged action.
-- agent.learn() reads these rows to update agent_state.thresholds.
-- =====================================================================

CREATE TABLE IF NOT EXISTS `agent_feedback` (
  `id`         BIGINT NOT NULL AUTO_INCREMENT,
  `action_id`  BIGINT NOT NULL,
  `user_id`    INT    NULL,
  `signal`     ENUM('positive','negative','dismissed','engaged','ignored') NOT NULL,
  `weight`     FLOAT  NOT NULL DEFAULT 1.0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_action` (`action_id`),
  KEY `idx_user_signal` (`user_id`, `signal`),
  CONSTRAINT `fk_agent_feedback_action`
    FOREIGN KEY (`action_id`) REFERENCES `agent_actions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
