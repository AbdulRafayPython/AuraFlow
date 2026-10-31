-- Agent runtime v2: reminders set by the schedule_reminder tool.
--
-- After a person approves "remind me in 2 hours", one row lands here. A Celery Beat task
-- (deliver_due_reminders, every minute) claims each due row once (pending -> sent) and the
-- agent posts the reminder in the channel. `remind_at` is UTC.
--
-- Safe to re-run (IF NOT EXISTS). Confirm the target database before applying.

CREATE TABLE IF NOT EXISTS `agent_reminders` (
  `id`          BIGINT        NOT NULL AUTO_INCREMENT,
  `agent_id`    INT           NOT NULL,
  `channel_id`  INT           NOT NULL,
  `user_id`     INT           NOT NULL,
  `text`        VARCHAR(500)  NOT NULL,
  `remind_at`   DATETIME      NOT NULL,
  `status`      ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
  `error`       VARCHAR(255)  NULL,
  `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `sent_at`     DATETIME      NULL,
  PRIMARY KEY (`id`),
  KEY `idx_rem_due` (`status`, `remind_at`),
  KEY `idx_rem_user` (`user_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
