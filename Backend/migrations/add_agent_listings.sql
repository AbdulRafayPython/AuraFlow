-- Agent runtime v2 (Phase 2): the agent marketplace.
--
-- A person who manages an agent can publish it as a listing. The listing holds a SNAPSHOT of
-- the agent's recipe (instructions, tools, model tier and mention/keyword/member_joined triggers)
-- taken at publish time: no knowledge files, channels, avatar or community. Anyone can browse
-- listings; installing one creates a new DRAFT agent (the installer owns it and still has to
-- add knowledge and go live). Republishing the same agent updates its single listing.
--
-- Requires add_agent_definitions.sql. Safe to re-run (IF NOT EXISTS). Confirm the target
-- database before applying.

CREATE TABLE IF NOT EXISTS `agent_listings` (
  `id`               INT          NOT NULL AUTO_INCREMENT,
  `public_id`        CHAR(36)     NOT NULL,
  `source_agent_id`  INT          NULL,
  `publisher_user_id` INT         NOT NULL,
  `title`            VARCHAR(60)  NOT NULL,
  `description`      VARCHAR(300) NOT NULL DEFAULT '',
  `category`         VARCHAR(20)  NOT NULL DEFAULT 'other',
  `snapshot`         JSON         NOT NULL,
  `status`           ENUM('published','unpublished') NOT NULL DEFAULT 'published',
  `installs`         INT          NOT NULL DEFAULT 0,
  `created_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_listing_public` (`public_id`),
  UNIQUE KEY `uq_listing_source` (`source_agent_id`),
  KEY `idx_listing_browse` (`status`, `category`, `installs`),
  KEY `idx_listing_publisher` (`publisher_user_id`),
  CONSTRAINT `fk_listing_agent` FOREIGN KEY (`source_agent_id`) REFERENCES `agent_definitions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_listing_user` FOREIGN KEY (`publisher_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
