-- Agent runtime v2 (Phase 2): public API keys and outbound webhooks for agents.
--
-- agent_api_keys: an outside service holds a key and may (a) post a message as the agent and
--   (b) ask the agent to run. Only a SHA-256 hash of the key is stored; the key itself is
--   shown once when it is created. A key can be revoked at any time.
-- agent_webhooks: AuraFlow calls a URL when the agent finishes a run or asks for approval.
--   Each call is signed with the webhook's secret (HMAC-SHA256).
--
-- Requires add_agent_definitions.sql. Safe to re-run (IF NOT EXISTS). Confirm the target
-- database before applying.

CREATE TABLE IF NOT EXISTS `agent_api_keys` (
  `id`           INT          NOT NULL AUTO_INCREMENT,
  `agent_id`     INT          NOT NULL,
  `name`         VARCHAR(60)  NOT NULL,
  `key_prefix`   VARCHAR(16)  NOT NULL,
  `key_hash`     CHAR(64)     NOT NULL,
  `created_by`   INT          NOT NULL,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_used_at` DATETIME     NULL,
  `revoked_at`   DATETIME     NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_apikey_hash` (`key_hash`),
  KEY `idx_apikey_agent` (`agent_id`),
  CONSTRAINT `fk_apikey_agent` FOREIGN KEY (`agent_id`) REFERENCES `agent_definitions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `agent_webhooks` (
  `id`          INT          NOT NULL AUTO_INCREMENT,
  `agent_id`    INT          NOT NULL,
  `url`         VARCHAR(500) NOT NULL,
  `secret`      VARCHAR(64)  NOT NULL,
  `events`      VARCHAR(100) NOT NULL DEFAULT 'run.finished',
  `enabled`     TINYINT(1)   NOT NULL DEFAULT 1,
  `created_by`  INT          NOT NULL,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_status` SMALLINT     NULL,
  `last_error`  VARCHAR(255) NULL,
  `last_at`     DATETIME     NULL,
  PRIMARY KEY (`id`),
  KEY `idx_webhook_agent` (`agent_id`, `enabled`),
  CONSTRAINT `fk_webhook_agent` FOREIGN KEY (`agent_id`) REFERENCES `agent_definitions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
