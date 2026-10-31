-- Agent runtime v2: run + step log.
--
-- One row per agent run (a mention, a schedule, a test) and one row per step
-- inside it (model call, tool call, tool result). This is what lets the UI
-- answer "why did the agent say that?" and lets us track cost per agent.
--
-- `agent_key` is the agent's stable key (e.g. 'aura'). A later migration adds
-- agent_definitions and an agent_id column for user-created agents.
--
-- The runtime treats these tables as optional: if they do not exist yet it
-- logs one warning and keeps running without a trace.
--
-- Safe to re-run (IF NOT EXISTS). Confirm the target database before applying.

CREATE TABLE IF NOT EXISTS `agent_runs` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT,
  `run_uuid`      CHAR(36)     NOT NULL,
  `agent_key`     VARCHAR(64)  NOT NULL,
  `trigger_type`  VARCHAR(32)  NOT NULL,
  `community_id`  INT          NULL,
  `channel_id`    INT          NULL,
  `invoked_by`    INT          NULL,
  `is_dry_run`    TINYINT(1)   NOT NULL DEFAULT 0,
  `status`        ENUM('queued','running','waiting_approval','succeeded','failed','unavailable','cancelled') NOT NULL DEFAULT 'queued',
  `input_text`    TEXT         NULL,
  `output_text`   TEXT         NULL,
  `step_count`    INT          NOT NULL DEFAULT 0,
  `tokens_in`     INT          NOT NULL DEFAULT 0,
  `tokens_out`    INT          NOT NULL DEFAULT 0,
  `error`         VARCHAR(500) NULL,
  `started_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finished_at`   DATETIME     NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_run_uuid` (`run_uuid`),
  KEY `idx_run_agent_time` (`agent_key`, `started_at`),
  KEY `idx_run_status` (`status`),
  KEY `idx_run_channel` (`channel_id`, `started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `agent_run_steps` (
  `id`          BIGINT       NOT NULL AUTO_INCREMENT,
  `run_id`      BIGINT       NOT NULL,
  `step_no`     INT          NOT NULL,
  `kind`        ENUM('llm','tool_call','tool_result','approval','final') NOT NULL,
  `tool_name`   VARCHAR(64)  NULL,
  `args_json`   MEDIUMTEXT   NULL,
  `result_json` MEDIUMTEXT   NULL,
  `latency_ms`  INT          NULL,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_step_run` (`run_id`, `step_no`),
  CONSTRAINT `fk_step_run` FOREIGN KEY (`run_id`) REFERENCES `agent_runs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
