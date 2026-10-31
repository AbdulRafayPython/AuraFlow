-- Agent runtime v2 (M5): approvals for actions that change shared state.
--
-- When an agent calls a `write` tool (for example post_message) the run stops in
-- status 'waiting_approval' and one row lands here. Only `approver_id` (the person
-- who invoked the agent, or the agent's owner for scheduled runs) may approve or
-- reject. Nothing is executed until then; pending rows expire (default 24h).
--
-- Requires add_agent_runs.sql. Safe to re-run (IF NOT EXISTS). Confirm the target
-- database before applying.

CREATE TABLE IF NOT EXISTS `agent_approvals` (
  `id`           BIGINT       NOT NULL AUTO_INCREMENT,
  `run_id`       BIGINT       NOT NULL,
  `tool_name`    VARCHAR(64)  NOT NULL,
  `args_json`    MEDIUMTEXT   NOT NULL,
  `summary`      VARCHAR(500) NOT NULL,
  `approver_id`  INT          NOT NULL,
  `status`       ENUM('pending','approved','rejected','expired') NOT NULL DEFAULT 'pending',
  `result_json`  MEDIUMTEXT   NULL,
  `decided_at`   DATETIME     NULL,
  `expires_at`   DATETIME     NOT NULL,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_appr_user_status` (`approver_id`, `status`),
  KEY `idx_appr_status_expiry` (`status`, `expires_at`),
  CONSTRAINT `fk_appr_run` FOREIGN KEY (`run_id`) REFERENCES `agent_runs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
