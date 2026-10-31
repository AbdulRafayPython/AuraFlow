-- Agent runtime v2 (Phase 2): MCP (Model Context Protocol) servers an agent may use.
--
-- An agent's owner connects an MCP server by URL (and an optional access token, stored
-- encrypted). The server's tools are listed once ("Refresh") and cached in `tools_json`; each
-- becomes an agent tool named mcp_<agent id>_<server>_<tool>. Tools the server marks read-only
-- run directly; every other MCP tool is a write tool and waits for the approver, like any write.
-- URLs must be public https addresses (see utils/net_guard.py).
--
-- Requires add_agent_definitions.sql. Safe to re-run (IF NOT EXISTS). Confirm the target
-- database before applying.

CREATE TABLE IF NOT EXISTS `agent_mcp_servers` (
  `id`               INT          NOT NULL AUTO_INCREMENT,
  `agent_id`         INT          NOT NULL,
  `name`             VARCHAR(24)  NOT NULL,
  `url`              VARCHAR(500) NOT NULL,
  `auth_token`       TEXT         NULL,
  `enabled`          TINYINT(1)   NOT NULL DEFAULT 1,
  `tools_json`       MEDIUMTEXT   NULL,
  `tools_fetched_at` DATETIME     NULL,
  `last_error`       VARCHAR(255) NULL,
  `created_by`       INT          NOT NULL,
  `created_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mcp_agent_name` (`agent_id`, `name`),
  CONSTRAINT `fk_mcp_agent` FOREIGN KEY (`agent_id`) REFERENCES `agent_definitions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
