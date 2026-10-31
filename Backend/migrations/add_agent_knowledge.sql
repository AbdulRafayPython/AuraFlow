-- Agent builder, M3: per-agent knowledge.
--
-- Users attach text, uploaded documents (txt/md/csv/pdf/docx) or channel history
-- to an agent. Each source is cut into ~800 character chunks that the agent's
-- search_knowledge tool searches. Embeddings (the `embedding` column) arrive in
-- a later phase; today search is keyword based.
--
-- Run AFTER add_agent_definitions.sql. Safe to re-run (IF NOT EXISTS).
-- Confirm the target database before applying.

CREATE TABLE IF NOT EXISTS `agent_knowledge_sources` (
  `id`          INT          NOT NULL AUTO_INCREMENT,
  `agent_id`    INT          NOT NULL,
  `type`        ENUM('text','file','channel') NOT NULL,
  `title`       VARCHAR(255) NOT NULL,
  `ref`         VARCHAR(500) NULL,                 -- file name or channel id
  `status`      ENUM('pending','ready','failed') NOT NULL DEFAULT 'pending',
  `error`       VARCHAR(255) NULL,
  `chunk_count` INT          NOT NULL DEFAULT 0,
  `created_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ks_agent` (`agent_id`),
  CONSTRAINT `fk_ks_agent` FOREIGN KEY (`agent_id`) REFERENCES `agent_definitions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `agent_knowledge_chunks` (
  `id`          BIGINT NOT NULL AUTO_INCREMENT,
  `source_id`   INT    NOT NULL,
  `agent_id`    INT    NOT NULL,
  `chunk_index` INT    NOT NULL,
  `content`     TEXT   NOT NULL,
  `embedding`   JSON   NULL,
  PRIMARY KEY (`id`),
  KEY `idx_chunk_agent` (`agent_id`),
  KEY `idx_chunk_source` (`source_id`),
  CONSTRAINT `fk_chunk_source` FOREIGN KEY (`source_id`) REFERENCES `agent_knowledge_sources` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
