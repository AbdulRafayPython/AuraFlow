-- Agent runtime v2, M2: agents as members.
--
-- * users.is_bot       : every agent gets a users row (is_bot = 1) so messages,
--                        avatars and @mentions work with the existing joins.
--                        Bots can never log in.
-- * agent_definitions  : one row per agent (built-in Aura or user-created).
-- * agent_triggers     : when an agent wakes up (mention, keyword, ...).
-- * messages.agent_run_id : links an agent's reply to the run that produced it.
-- * agent_runs         : adds agent_id and trigger_message_id.
--
-- Run AFTER add_agent_runs.sql. The ALTER statements are NOT idempotent
-- (MySQL has no ADD COLUMN IF NOT EXISTS): apply once. Confirm the target
-- database before applying. The application degrades gracefully while this
-- migration is missing: agents stay off and login/mention paths skip the
-- is_bot checks.

ALTER TABLE `users`
  ADD COLUMN `is_bot` TINYINT(1) NOT NULL DEFAULT 0 AFTER `role`,
  ADD KEY `idx_users_is_bot` (`is_bot`);

ALTER TABLE `messages`
  ADD COLUMN `agent_run_id` BIGINT NULL AFTER `bot_name`,
  ADD KEY `idx_msg_agent_run` (`agent_run_id`);

ALTER TABLE `agent_runs`
  ADD COLUMN `agent_id` INT NULL AFTER `agent_key`,
  ADD COLUMN `trigger_message_id` BIGINT NULL AFTER `trigger_type`,
  ADD KEY `idx_run_agent_id` (`agent_id`, `started_at`);

CREATE TABLE IF NOT EXISTS `agent_definitions` (
  `id`             INT          NOT NULL AUTO_INCREMENT,
  `public_id`      CHAR(36)     NOT NULL,
  `bot_user_id`    INT          NOT NULL,
  `owner_user_id`  INT          NOT NULL,
  `community_id`   INT          NULL,                 -- NULL = available everywhere (built-in / personal)
  `name`           VARCHAR(80)  NOT NULL,
  `description`    VARCHAR(500) NULL,
  `avatar_url`     VARCHAR(500) NULL,
  `instructions`   TEXT         NOT NULL,
  `model_tier`     ENUM('fast','smart') NOT NULL DEFAULT 'fast',
  `tools`          JSON         NOT NULL,             -- ["search_knowledge", ...]
  `permissions`    JSON         NOT NULL,             -- {"channel_ids": [..]} ; empty = every channel of the community
  `template_key`   VARCHAR(40)  NULL,
  `status`         ENUM('draft','active','paused','archived') NOT NULL DEFAULT 'draft',
  `version`        INT          NOT NULL DEFAULT 1,
  `daily_run_cap`  INT          NOT NULL DEFAULT 200,
  `created_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_agent_public_id` (`public_id`),
  UNIQUE KEY `uq_agent_bot_user` (`bot_user_id`),
  KEY `idx_agent_community_status` (`community_id`, `status`),
  KEY `idx_agent_owner` (`owner_user_id`),
  CONSTRAINT `fk_agentdef_bot`       FOREIGN KEY (`bot_user_id`)   REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_agentdef_owner`     FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_agentdef_community` FOREIGN KEY (`community_id`)  REFERENCES `communities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `agent_triggers` (
  `id`           INT NOT NULL AUTO_INCREMENT,
  `agent_id`     INT NOT NULL,
  `type`         ENUM('mention','keyword','channel_message','schedule','member_joined') NOT NULL,
  `channel_id`   INT NULL,                 -- NULL = every channel the agent may act in
  `config`       JSON NULL,                -- {"keywords": [..]} / {"cron": "0 9 * * 5", "tz": "Asia/Dubai"}
  `next_run_at`  DATETIME NULL,            -- schedule triggers only
  `enabled`      TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_trigger_agent` (`agent_id`),
  KEY `idx_trigger_type_channel` (`type`, `channel_id`, `enabled`),
  KEY `idx_trigger_due` (`type`, `enabled`, `next_run_at`),
  CONSTRAINT `fk_trigger_agent`   FOREIGN KEY (`agent_id`)   REFERENCES `agent_definitions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_trigger_channel` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
