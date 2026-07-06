-- Per-channel agent override.
--
-- Absent row → inherit community-level enabled (community_agents.enabled).
-- Present row → channel value wins.
--
-- Two-state (enabled 0/1), no settings (those still live on
-- community_agents.settings community-wide). UNIQUE constraint guarantees
-- one override row per (community, channel, agent_type).
--
-- Wired into agent dispatch via AutonomousAgent._is_enabled_for_channel
-- (Backend/agents/base.py) — patched into the 6 matrix-column agents:
-- moderation, support, summarizer, focus, engagement, translator.
--
-- Read/write surface: Frontend/src/components/ai-agents/CommunityAgentsTab.tsx
-- §D (CoverageMatrix). PUT /api/agents/configure/channel/<c>/<ch>/<agent>
-- + GET /api/agents/coverage/<c>.
CREATE TABLE IF NOT EXISTS `community_channel_agents` (
  `id`            INT          NOT NULL AUTO_INCREMENT,
  `community_id`  INT          NOT NULL,
  `channel_id`    INT          NOT NULL,
  `agent_type`    VARCHAR(50)  NOT NULL,
  `enabled`       TINYINT(1)   NOT NULL DEFAULT 1,
  `updated_by`    INT          NULL,
  `updated_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_community_channel_agent`
    (`community_id`, `channel_id`, `agent_type`),
  KEY `idx_channel_lookup` (`channel_id`, `agent_type`, `enabled`),
  CONSTRAINT `fk_cca_community`
    FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cca_channel`
    FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cca_agent_type`
    FOREIGN KEY (`agent_type`) REFERENCES `agent_registry` (`agent_type`),
  CONSTRAINT `fk_cca_updated_by`
    FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
-- agent_type must match agent_registry.agent_type's collation (utf8mb4_unicode_ci)
-- or the fk_cca_agent_type FK fails with "incompatible columns" on TiDB/MySQL.
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
