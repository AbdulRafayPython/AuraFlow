-- Agent runtime v2 (Phase 2): OAuth login and stdio programs for MCP servers.
--
-- agent_mcp_servers.transport   'http' (a remote server by URL) or 'stdio' (a program on the
--                               operator's allow-list MCP_STDIO_SERVERS; `url` then holds stdio:<name>).
-- agent_mcp_servers.oauth_json  encrypted JSON: client, endpoints and tokens of an OAuth login.
-- agent_mcp_oauth_states        one row per login in progress (single use, expires after 10 minutes).
--
-- Additive: two nullable/defaulted columns on agent_mcp_servers (itself new in add_agent_mcp.sql)
-- and one new table. Requires add_agent_mcp.sql. NOT safe to re-run (ADD COLUMN): the apply script
-- skips it when the columns already exist. Confirm the target database before applying.

ALTER TABLE `agent_mcp_servers`
  ADD COLUMN `transport`  VARCHAR(8) NOT NULL DEFAULT 'http' AFTER `url`,
  ADD COLUMN `oauth_json` TEXT       NULL AFTER `auth_token`;

CREATE TABLE IF NOT EXISTS `agent_mcp_oauth_states` (
  `state`         VARCHAR(64)  NOT NULL,
  `server_id`     INT          NOT NULL,
  `user_id`       INT          NOT NULL,
  `code_verifier` VARCHAR(128) NOT NULL,
  `redirect_uri`  VARCHAR(500) NOT NULL,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`state`),
  KEY `idx_oauth_state_created` (`created_at`),
  CONSTRAINT `fk_oauth_state_server` FOREIGN KEY (`server_id`) REFERENCES `agent_mcp_servers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
