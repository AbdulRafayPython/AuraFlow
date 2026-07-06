-- =============================================================
-- AuroFlow - Canonical Database Schema
-- Generated from live database on 2026-05-14
-- Apply with: mysql -u <user> -p <dbname> < schema.sql
-- =============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------------
-- admin_actions
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `admin_actions`;
CREATE TABLE `admin_actions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `admin_id` int NOT NULL,
  `target_user_id` int NOT NULL,
  `action_type` enum('warn','suspend','ban','unsuspend','unban','role_change') NOT NULL,
  `reason` text,
  `details` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_target_user` (`target_user_id`),
  KEY `idx_admin` (`admin_id`),
  KEY `idx_created` (`created_at`),
  CONSTRAINT `admin_actions_ibfk_1` FOREIGN KEY (`admin_id`) REFERENCES `users` (`id`),
  CONSTRAINT `admin_actions_ibfk_2` FOREIGN KEY (`target_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- admin_audit_logs
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `admin_audit_logs`;
CREATE TABLE `admin_audit_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `actor_user_id` int NOT NULL,
  `actor_role` enum('system_admin','community_admin','community_owner') NOT NULL,
  `action` varchar(64) NOT NULL,
  `target_type` varchar(32) NOT NULL,
  `target_id` bigint DEFAULT NULL,
  `community_id` int DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_actor` (`actor_user_id`,`created_at`),
  KEY `idx_community` (`community_id`,`created_at`),
  KEY `idx_target` (`target_type`,`target_id`),
  KEY `idx_action` (`action`,`created_at`),
  CONSTRAINT `admin_audit_logs_actor_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `admin_audit_logs_community_fk` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- agent_actions  (autonomous-agent action log)
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `agent_feedback`;
DROP TABLE IF EXISTS `agent_actions`;
CREATE TABLE `agent_actions` (
  `id`             BIGINT       NOT NULL AUTO_INCREMENT,
  `agent_name`     VARCHAR(32)  NOT NULL,
  `community_id`   INT          NULL,
  `channel_id`     INT          NULL,
  `user_id`        INT          NULL,
  `decision`       ENUM('act','skip','defer') NOT NULL,
  `reason`         VARCHAR(255) NULL,
  `payload_json`   JSON         NULL,
  `correlation_id` CHAR(36)     NOT NULL,
  `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_agent_correlation` (`agent_name`, `correlation_id`),
  KEY `idx_agent_created` (`agent_name`, `created_at`),
  KEY `idx_correlation` (`correlation_id`),
  KEY `idx_scope_channel` (`channel_id`, `created_at`),
  KEY `idx_scope_community` (`community_id`, `created_at`),
  KEY `idx_scope_user` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- agent_feedback  (user reactions to autonomous-agent actions)
-- -----------------------------------------------------------
CREATE TABLE `agent_feedback` (
  `id`         BIGINT NOT NULL AUTO_INCREMENT,
  `action_id`  BIGINT NOT NULL,
  `user_id`    INT    NULL,
  `signal`     ENUM('positive','negative','dismissed','engaged','ignored') NOT NULL,
  `weight`     FLOAT  NOT NULL DEFAULT 1.0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_action` (`action_id`),
  KEY `idx_user_signal` (`user_id`, `signal`),
  CONSTRAINT `fk_agent_feedback_action`
    FOREIGN KEY (`action_id`) REFERENCES `agent_actions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- agent_registry
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `agent_registry`;
CREATE TABLE `agent_registry` (
  `agent_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `display_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` enum('community','personal') COLLATE utf8mb4_unicode_ci NOT NULL,
  `icon` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `default_settings` json DEFAULT NULL,
  `features` json DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`agent_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- agent_state  (per-agent goals / adaptive thresholds)
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `agent_state`;
CREATE TABLE `agent_state` (
  `id`             BIGINT      NOT NULL AUTO_INCREMENT,
  `agent_name`     VARCHAR(32) NOT NULL,
  `scope_type`     ENUM('community','channel','user','global') NOT NULL,
  `scope_id`       INT         NULL,
  `goal_key`       VARCHAR(64) NOT NULL DEFAULT 'default',
  `goal_value`     JSON        NULL,
  `thresholds`     JSON        NULL,
  `last_acted_at`  DATETIME    NULL,
  `last_outcome`   ENUM('positive','negative','neutral','unknown') NULL,
  `updated_at`     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_agent_scope_goal` (`agent_name`, `scope_type`, `scope_id`, `goal_key`),
  KEY `idx_agent_scope` (`agent_name`, `scope_type`, `scope_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- ai_agent_logs
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `ai_agent_logs`;
CREATE TABLE `ai_agent_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `agent_id` int DEFAULT NULL,
  `agent_name` varchar(100) DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `community_id` int DEFAULT NULL,
  `channel_id` int DEFAULT NULL,
  `message_id` bigint DEFAULT NULL,
  `action_type` varchar(100) DEFAULT NULL,
  `input_text` text,
  `input_data` text,
  `output_text` text,
  `output_data` text,
  `confidence_score` float DEFAULT NULL,
  `status` varchar(50) DEFAULT 'success',
  `execution_time_ms` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `agent_id` (`agent_id`),
  KEY `channel_id` (`channel_id`),
  KEY `message_id` (`message_id`),
  KEY `idx_agent_logs_community` (`community_id`),
  KEY `idx_agent_logs_user` (`user_id`),
  KEY `idx_agent_name` (`agent_name`),
  KEY `idx_agent_logs_mod_channel_msg` (`action_type`,`channel_id`,`message_id`),
  KEY `idx_agent_logs_created` (`created_at` DESC),
  KEY `idx_agent_logs_name_time` (`agent_name`,`created_at` DESC),
  KEY `idx_agent_logs_community_created` (`community_id`,`created_at` DESC),
  CONSTRAINT `ai_agent_logs_ibfk_1` FOREIGN KEY (`agent_id`) REFERENCES `ai_agents` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ai_agent_logs_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `ai_agent_logs_ibfk_3` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`) ON DELETE SET NULL,
  CONSTRAINT `ai_agent_logs_ibfk_4` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- ai_agents
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `ai_agents`;
CREATE TABLE `ai_agents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `type` enum('mood','summarizer','translator','moderator','assistant','engagement','knowledge','wellness','context','auto_message','focus','support') DEFAULT NULL,
  `description` text,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  KEY `idx_agent_type` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- attachments
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `attachments`;
CREATE TABLE `attachments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `message_id` bigint DEFAULT NULL,
  `direct_message_id` bigint DEFAULT NULL,
  `file_name` varchar(255) NOT NULL,
  `file_path` varchar(500) NOT NULL,
  `file_size` bigint DEFAULT NULL,
  `mime_type` varchar(100) DEFAULT NULL,
  `uploaded_by` int DEFAULT NULL,
  `uploaded_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `duration` float DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `uploaded_by` (`uploaded_by`),
  KEY `idx_att_message_id` (`message_id`),
  KEY `idx_att_dm_id` (`direct_message_id`),
  CONSTRAINT `attachments_ibfk_1` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `attachments_ibfk_2` FOREIGN KEY (`direct_message_id`) REFERENCES `direct_messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `attachments_ibfk_3` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- block_appeals
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `block_appeals`;
CREATE TABLE `block_appeals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `community_id` int NOT NULL,
  `block_id` int NOT NULL,
  `user_id` int NOT NULL,
  `message` text NOT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `reviewed_by` int DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `admin_note` text,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_community_status` (`community_id`,`status`,`created_at`),
  KEY `idx_user` (`user_id`),
  KEY `appeals_reviewed_by_fk` (`reviewed_by`),
  CONSTRAINT `appeals_community_fk` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE CASCADE,
  CONSTRAINT `appeals_reviewed_by_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `appeals_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- blocked_friends
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `blocked_friends`;
CREATE TABLE `blocked_friends` (
  `id` int NOT NULL AUTO_INCREMENT,
  `blocker_id` int NOT NULL,
  `blocked_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_block` (`blocker_id`,`blocked_id`),
  KEY `idx_blocker` (`blocker_id`),
  KEY `idx_blocked` (`blocked_id`),
  CONSTRAINT `blocked_friends_ibfk_1` FOREIGN KEY (`blocker_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `blocked_friends_ibfk_2` FOREIGN KEY (`blocked_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- blocked_users
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `blocked_users`;
CREATE TABLE `blocked_users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `community_id` int NOT NULL,
  `user_id` int NOT NULL,
  `blocked_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `reason` text,
  `blocked_by` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_blocked_user` (`community_id`,`user_id`),
  KEY `idx_blocked_user` (`user_id`),
  KEY `idx_blocked_community_user` (`community_id`,`user_id`),
  KEY `blocked_by` (`blocked_by`),
  CONSTRAINT `blocked_users_ibfk_1` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE CASCADE,
  CONSTRAINT `blocked_users_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `blocked_users_ibfk_3` FOREIGN KEY (`blocked_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- channel_members
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `channel_members`;
CREATE TABLE `channel_members` (
  `id` int NOT NULL AUTO_INCREMENT,
  `channel_id` int DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `role` enum('member','admin','moderator') DEFAULT 'member',
  `joined_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_channel_member` (`channel_id`,`user_id`),
  KEY `idx_channel_members_channel_user` (`channel_id`,`user_id`),
  KEY `idx_channel_members_user` (`user_id`),
  CONSTRAINT `channel_members_ibfk_1` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`) ON DELETE CASCADE,
  CONSTRAINT `channel_members_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- channel_read_status
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `channel_read_status`;
CREATE TABLE `channel_read_status` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `channel_id` int NOT NULL,
  `last_read_message_id` bigint DEFAULT NULL,
  `last_read_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_channel` (`user_id`,`channel_id`),
  KEY `last_read_message_id` (`last_read_message_id`),
  KEY `idx_channel_read_user` (`user_id`),
  KEY `idx_channel_read_channel` (`channel_id`),
  CONSTRAINT `channel_read_status_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `channel_read_status_ibfk_2` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`) ON DELETE CASCADE,
  CONSTRAINT `channel_read_status_ibfk_3` FOREIGN KEY (`last_read_message_id`) REFERENCES `messages` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- channels
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `channels`;
CREATE TABLE `channels` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `description` text,
  `type` enum('text','voice','private') DEFAULT 'text',
  `community_id` int DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `created_by` (`created_by`),
  KEY `idx_channel_name` (`name`),
  KEY `idx_community_channels` (`community_id`),
  CONSTRAINT `channels_ibfk_1` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE CASCADE,
  CONSTRAINT `channels_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- communities
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `communities`;
CREATE TABLE `communities` (
  `id` int NOT NULL AUTO_INCREMENT,
  `public_id` char(36) NOT NULL COMMENT 'Opaque external identifier used in URLs/API instead of the sequential int id',
  `name` varchar(100) NOT NULL,
  `description` text,
  `icon` char(2) DEFAULT 'AF',
  `color` varchar(7) DEFAULT '#8B5CF6',
  `logo_url` varchar(500) DEFAULT NULL,
  `banner_url` varchar(500) DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `member_count` int NOT NULL DEFAULT '0' COMMENT 'Denormalized count maintained by application on join/leave',
  `intelligence_profile` json DEFAULT NULL COMMENT 'Subset of {safe,recaps,multilingual}. NULL = use heuristic.',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_community_public_id` (`public_id`),
  KEY `created_by` (`created_by`),
  KEY `idx_community_name` (`name`),
  CONSTRAINT `communities_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- community_agents
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `community_agents`;
CREATE TABLE `community_agents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `community_id` int NOT NULL,
  `agent_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `enabled` tinyint(1) DEFAULT '1',
  `settings` json DEFAULT NULL,
  `installed_by` int NOT NULL,
  `installed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `last_active` timestamp NULL DEFAULT NULL,
  `usage_count` int DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_community_agent` (`community_id`,`agent_type`),
  KEY `installed_by` (`installed_by`),
  KEY `idx_community_enabled` (`community_id`,`enabled`),
  KEY `idx_agent_type` (`agent_type`),
  KEY `idx_community_agent_type` (`community_id`,`agent_type`,`enabled`),
  CONSTRAINT `community_agents_ibfk_1` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE CASCADE,
  CONSTRAINT `community_agents_ibfk_2` FOREIGN KEY (`agent_type`) REFERENCES `agent_registry` (`agent_type`),
  CONSTRAINT `community_agents_ibfk_3` FOREIGN KEY (`installed_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- community_channel_agents  (per-channel override of community_agents.enabled)
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `community_channel_agents`;
CREATE TABLE `community_channel_agents` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- community_announcements
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `community_announcements`;
CREATE TABLE `community_announcements` (
  `id` int NOT NULL AUTO_INCREMENT,
  `community_id` int NOT NULL,
  `author_id` int NOT NULL,
  `title` varchar(255) NOT NULL,
  `body` text NOT NULL,
  `is_pinned` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `expires_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_community_active` (`community_id`,`is_active`,`created_at`),
  KEY `idx_pinned` (`community_id`,`is_pinned`,`is_active`),
  KEY `announcements_author_fk` (`author_id`),
  CONSTRAINT `announcements_author_fk` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `announcements_community_fk` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- community_members
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `community_members`;
CREATE TABLE `community_members` (
  `id` int NOT NULL AUTO_INCREMENT,
  `community_id` int DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `role` enum('owner','admin','member') DEFAULT 'member',
  `violation_count` int DEFAULT '0',
  `joined_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_member` (`community_id`,`user_id`),
  KEY `idx_community_members_user_community` (`user_id`,`community_id`),
  KEY `idx_community_members_community_user` (`community_id`,`user_id`),
  CONSTRAINT `community_members_ibfk_1` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE CASCADE,
  CONSTRAINT `community_members_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- community_unread_status
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `community_unread_status`;
CREATE TABLE `community_unread_status` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `community_id` int NOT NULL,
  `total_unread` int DEFAULT '0',
  `last_seen_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_community` (`user_id`,`community_id`),
  KEY `idx_community_unread` (`community_id`,`user_id`),
  CONSTRAINT `community_unread_status_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `community_unread_status_ibfk_2` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- conversation_summaries
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `conversation_summaries`;
CREATE TABLE `conversation_summaries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `channel_id` int DEFAULT NULL,
  `summary` text,
  `generated_by` varchar(50) DEFAULT 'summarizer_agent',
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `message_count` int DEFAULT '0',
  `method` varchar(50) DEFAULT 'extractive',
  `participants` text,
  `time_range_start` timestamp NULL DEFAULT NULL,
  `time_range_end` timestamp NULL DEFAULT NULL,
  `key_points` text,
  PRIMARY KEY (`id`),
  KEY `idx_user_summaries` (`created_by`,`created_at` DESC),
  KEY `idx_summ_channel_created` (`channel_id`,`created_at` DESC),
  CONSTRAINT `conversation_summaries_ibfk_1` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cs_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- direct_message_reactions
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `direct_message_reactions`;
CREATE TABLE `direct_message_reactions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `direct_message_id` bigint NOT NULL,
  `user_id` int NOT NULL,
  `emoji` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_dm_reaction` (`direct_message_id`,`user_id`,`emoji`),
  KEY `idx_dm_reactions` (`direct_message_id`),
  KEY `idx_dm_user_reactions` (`user_id`),
  CONSTRAINT `direct_message_reactions_ibfk_1` FOREIGN KEY (`direct_message_id`) REFERENCES `direct_messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `direct_message_reactions_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- direct_messages
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `direct_messages`;
CREATE TABLE `direct_messages` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `sender_id` int DEFAULT NULL,
  `receiver_id` int DEFAULT NULL,
  `content` text,
  `message_type` enum('text','image','file','ai','voice','video','call') NOT NULL DEFAULT 'text',
  `reply_to` bigint DEFAULT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `read_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `edited_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_dm_pair` (`sender_id`,`receiver_id`,`created_at` DESC),
  KEY `idx_dm_reply_to` (`reply_to`),
  KEY `idx_dm_receiver` (`receiver_id`,`created_at` DESC),
  KEY `idx_dm_call_type` (`message_type`,`sender_id`,`receiver_id`) COMMENT 'Optimise call log queries filtered by message_type=call',
  KEY `idx_dm_sender_time` (`sender_id`,`created_at` DESC),
  KEY `idx_dm_created` (`created_at` DESC),
  FULLTEXT KEY `ft_direct_messages` (`content`),
  CONSTRAINT `direct_messages_ibfk_1` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `direct_messages_ibfk_2` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dm_reply_to` FOREIGN KEY (`reply_to`) REFERENCES `direct_messages` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- dm_pinned_messages
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `dm_pinned_messages`;
CREATE TABLE `dm_pinned_messages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sender_id` int NOT NULL,
  `receiver_id` int NOT NULL,
  `message_id` bigint NOT NULL,
  `pinned_by` int NOT NULL,
  `pinned_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_dm_pin` (`message_id`),
  KEY `receiver_id` (`receiver_id`),
  KEY `pinned_by` (`pinned_by`),
  KEY `idx_dm_pin_pair` (`sender_id`,`receiver_id`),
  KEY `idx_dm_pin_expires` (`expires_at`),
  CONSTRAINT `dm_pinned_messages_ibfk_1` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `dm_pinned_messages_ibfk_2` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `dm_pinned_messages_ibfk_3` FOREIGN KEY (`message_id`) REFERENCES `direct_messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `dm_pinned_messages_ibfk_4` FOREIGN KEY (`pinned_by`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- friend_requests
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `friend_requests`;
CREATE TABLE `friend_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sender_id` int DEFAULT NULL,
  `receiver_id` int DEFAULT NULL,
  `status` enum('pending','accepted','rejected','cancelled') DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_request` (`sender_id`,`receiver_id`),
  KEY `idx_fr_sender` (`sender_id`),
  KEY `idx_fr_receiver` (`receiver_id`),
  KEY `idx_fr_status` (`status`,`receiver_id`),
  CONSTRAINT `friend_requests_ibfk_1` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `friend_requests_ibfk_2` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- friends
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `friends`;
CREATE TABLE `friends` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `friend_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_friendship` (`user_id`,`friend_id`),
  KEY `idx_friends_user` (`user_id`),
  KEY `idx_friends_friend` (`friend_id`),
  CONSTRAINT `friends_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `friends_ibfk_2` FOREIGN KEY (`friend_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- knowledge_base
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `knowledge_base`;
CREATE TABLE `knowledge_base` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `source` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'agent',
  `related_channel` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_channel` (`related_channel`),
  KEY `idx_created` (`created_at`),
  -- TiDB only supports single-column FULLTEXT indexes; MySQL accepts this too.
  -- (This index is currently unused — the knowledge agents match rows in Python.)
  FULLTEXT KEY `idx_search` (`content`),
  CONSTRAINT `knowledge_base_ibfk_1` FOREIGN KEY (`related_channel`) REFERENCES `channels` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- message_reactions
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `message_reactions`;
CREATE TABLE `message_reactions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `message_id` bigint DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `emoji` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_reaction` (`message_id`,`user_id`,`emoji`),
  KEY `idx_message_reactions_message` (`message_id`),
  KEY `idx_message_reactions_user` (`user_id`),
  CONSTRAINT `message_reactions_ibfk_1` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `message_reactions_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- messages
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `messages`;
CREATE TABLE `messages` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `channel_id` int DEFAULT NULL,
  `sender_id` int DEFAULT NULL,
  `content` text,
  `message_type` enum('text','image','file','system','ai','voice','video','call') NOT NULL DEFAULT 'text',
  `bot_name` varchar(64) DEFAULT NULL,
  `reply_to` bigint DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `edited_at` timestamp NULL DEFAULT NULL,
  `moderation_flagged` tinyint(1) DEFAULT '0',
  `moderation_score` float DEFAULT '0',
  `is_pinned` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `reply_to` (`reply_to`),
  KEY `idx_channel_id` (`channel_id`),
  KEY `idx_sender_id` (`sender_id`),
  KEY `idx_messages_time` (`created_at` DESC),
  KEY `idx_messages_pinned` (`channel_id`,`is_pinned`),
  KEY `idx_msg_channel_time` (`channel_id`,`created_at` DESC),
  KEY `idx_msg_channel_type_time` (`channel_id`,`message_type`,`created_at`),
  KEY `idx_msg_sender` (`sender_id`),
  KEY `idx_msg_channel_sender` (`channel_id`,`sender_id`),
  KEY `idx_messages_channel_id` (`channel_id`,`id`),
  FULLTEXT KEY `ft_messages` (`content`),
  CONSTRAINT `messages_ibfk_1` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`) ON DELETE CASCADE,
  CONSTRAINT `messages_ibfk_2` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `messages_ibfk_3` FOREIGN KEY (`reply_to`) REFERENCES `messages` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- notifications
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `notifications`;
CREATE TABLE `notifications` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `type` varchar(30) NOT NULL,
  `title` varchar(255) NOT NULL,
  `body` text,
  `icon_url` varchar(500) DEFAULT NULL,
  `link` varchar(500) DEFAULT NULL,
  `related_id` bigint DEFAULT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notif_user_read` (`user_id`,`is_read`),
  KEY `idx_notif_user_created` (`user_id`,`created_at` DESC),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- otp_codes
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `otp_codes`;
CREATE TABLE `otp_codes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `otp_hash` varchar(255) NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- pinned_messages
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `pinned_messages`;
CREATE TABLE `pinned_messages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `channel_id` int DEFAULT NULL,
  `message_id` bigint DEFAULT NULL,
  `pinned_by` int DEFAULT NULL,
  `pinned_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_pin` (`channel_id`,`message_id`),
  KEY `message_id` (`message_id`),
  KEY `pinned_by` (`pinned_by`),
  KEY `idx_pinned_channel` (`channel_id`),
  KEY `idx_pin_expires` (`expires_at`),
  CONSTRAINT `pinned_messages_ibfk_1` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pinned_messages_ibfk_2` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pinned_messages_ibfk_3` FOREIGN KEY (`pinned_by`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- platform_settings
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `platform_settings`;
CREATE TABLE `platform_settings` (
  `setting_key` varchar(100) NOT NULL,
  `setting_value` text NOT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- push_subscriptions
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `push_subscriptions`;
CREATE TABLE `push_subscriptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `endpoint` varchar(500) NOT NULL,
  `p256dh_key` varchar(200) NOT NULL,
  `auth_key` varchar(200) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_push_subscriptions_user_endpoint` (`user_id`,`endpoint`),
  UNIQUE KEY `uq_push_endpoint` (`endpoint`(191)),
  CONSTRAINT `push_subscriptions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- refresh_tokens
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `refresh_tokens`;
CREATE TABLE `refresh_tokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `jti` varchar(36) NOT NULL,
  `user_id` int NOT NULL,
  `token_family` varchar(36) NOT NULL,
  `device_info` varchar(500) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` timestamp NOT NULL,
  `revoked_at` timestamp NULL DEFAULT NULL,
  `replaced_by` varchar(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `jti` (`jti`),
  KEY `idx_refresh_jti` (`jti`),
  KEY `idx_refresh_user_id` (`user_id`),
  KEY `idx_refresh_family` (`token_family`),
  KEY `idx_refresh_expires` (`expires_at`),
  CONSTRAINT `refresh_tokens_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- scheduled_summaries
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `scheduled_summaries`;
CREATE TABLE `scheduled_summaries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `schedule_id` int NOT NULL,
  `user_id` int NOT NULL,
  `channel_id` int NOT NULL,
  `community_id` int NOT NULL,
  `content` text NOT NULL,
  `method` varchar(50) DEFAULT 'extractive',
  `message_count` int DEFAULT '0',
  `is_delivered` tinyint(1) DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_delivered` (`user_id`,`is_delivered`),
  KEY `idx_schedule_triggered` (`schedule_id`,`created_at`),
  KEY `fk_ss_channel` (`channel_id`),
  CONSTRAINT `fk_ss_channel` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ss_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `user_summary_schedules` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ss_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `scheduled_summaries_ibfk_1` FOREIGN KEY (`schedule_id`) REFERENCES `user_summary_schedules` (`id`) ON DELETE CASCADE,
  CONSTRAINT `scheduled_summaries_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `scheduled_summaries_ibfk_3` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- token_blocklist
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `token_blocklist`;
CREATE TABLE `token_blocklist` (
  `id` int NOT NULL AUTO_INCREMENT,
  `jti` varchar(36) NOT NULL,
  `user_id` int NOT NULL,
  `revoked_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` timestamp NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `jti` (`jti`),
  KEY `user_id` (`user_id`),
  KEY `idx_blocklist_jti` (`jti`),
  KEY `idx_blocklist_expires` (`expires_at`),
  CONSTRAINT `token_blocklist_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- user_agents
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `user_agents`;
CREATE TABLE `user_agents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `agent_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `enabled` tinyint(1) DEFAULT '1',
  `settings` json DEFAULT NULL,
  `activated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `last_used` timestamp NULL DEFAULT NULL,
  `usage_count` int DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_agent` (`user_id`,`agent_type`),
  KEY `idx_user_enabled` (`user_id`,`enabled`),
  KEY `fk_ua_agent_type` (`agent_type`),
  CONSTRAINT `fk_ua_agent_type` FOREIGN KEY (`agent_type`) REFERENCES `agent_registry` (`agent_type`) ON DELETE CASCADE,
  CONSTRAINT `fk_ua_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_agents_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_agents_ibfk_2` FOREIGN KEY (`agent_type`) REFERENCES `agent_registry` (`agent_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- user_moods
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `user_moods`;
CREATE TABLE `user_moods` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `channel_id` int DEFAULT NULL,
  `mood` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sentiment_score` float DEFAULT NULL,
  `detected_emotions` json DEFAULT NULL,
  `message_sample` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_mood` (`user_id`,`created_at`),
  KEY `idx_channel_mood` (`channel_id`,`created_at`),
  CONSTRAINT `user_moods_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_moods_ibfk_2` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- user_notification_settings
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `user_notification_settings`;
CREATE TABLE `user_notification_settings` (
  `user_id` int NOT NULL,
  `notify_direct_messages` tinyint(1) NOT NULL DEFAULT '1',
  `notify_channel_messages` tinyint(1) NOT NULL DEFAULT '1',
  `notify_friend_requests` tinyint(1) NOT NULL DEFAULT '1',
  `notify_friend_online` tinyint(1) NOT NULL DEFAULT '0',
  `notification_sounds` tinyint(1) NOT NULL DEFAULT '1',
  `show_agent_activity` tinyint(1) NOT NULL DEFAULT '0',
  `email_alerts_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `email_dms_and_calls` tinyint(1) NOT NULL DEFAULT '1',
  `email_community_messages` tinyint(1) NOT NULL DEFAULT '0',
  `email_agent_notifications` tinyint(1) NOT NULL DEFAULT '1',
  `email_agent_summaries` tinyint(1) NOT NULL DEFAULT '1',
  `email_batch_interval_minutes` int NOT NULL DEFAULT '5',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `user_notification_settings_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- user_summary_schedules
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `user_summary_schedules`;
CREATE TABLE `user_summary_schedules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `channel_id` int NOT NULL,
  `community_id` int NOT NULL,
  `schedule_time` time NOT NULL,
  `timezone` varchar(50) DEFAULT 'UTC',
  `is_active` tinyint(1) DEFAULT '1',
  `last_triggered_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_channel` (`user_id`,`channel_id`),
  KEY `fk_uss_channel` (`channel_id`),
  CONSTRAINT `fk_uss_channel` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_uss_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_summary_schedules_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_summary_schedules_ibfk_2` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- users
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `public_id` char(36) NOT NULL COMMENT 'Opaque external identifier used in URLs/API instead of the sequential int id',
  `email` varchar(255) DEFAULT NULL,
  `display_name` varchar(255) DEFAULT NULL,
  `username` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `bio` text,
  `avatar_url` varchar(500) DEFAULT NULL,
  `status` enum('online','idle','dnd','offline') DEFAULT 'offline',
  `custom_status` varchar(255) DEFAULT NULL,
  `custom_status_emoji` varchar(10) DEFAULT NULL,
  `last_seen` timestamp NULL DEFAULT NULL,
  `is_first_login` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `email_verified` tinyint(1) NOT NULL DEFAULT '0',
  `email_verification_token` varchar(500) DEFAULT NULL,
  `email_verification_expires` timestamp NULL DEFAULT NULL,
  `role` enum('user','system_admin') NOT NULL DEFAULT 'user',
  `account_status` enum('active','suspended','banned') NOT NULL DEFAULT 'active',
  `account_status_reason` text,
  `account_status_until` timestamp NULL DEFAULT NULL,
  `account_status_by` int DEFAULT NULL,
  `notification_settings` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `idx_user_public_id` (`public_id`),
  KEY `idx_user_email` (`email`),
  KEY `idx_username` (`username`),
  KEY `idx_email_verification_token` (`email_verification_token`),
  KEY `idx_users_status` (`status`),
  KEY `idx_users_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- voice_channels
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `voice_channels`;
CREATE TABLE `voice_channels` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `channel_id` int DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `channel_id` (`channel_id`),
  CONSTRAINT `voice_channels_ibfk_1` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- voice_participants
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `voice_participants`;
CREATE TABLE `voice_participants` (
  `id` int NOT NULL AUTO_INCREMENT,
  `voice_channel_id` int DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `joined_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `left_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `voice_channel_id` (`voice_channel_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `voice_participants_ibfk_1` FOREIGN KEY (`voice_channel_id`) REFERENCES `voice_channels` (`id`) ON DELETE CASCADE,
  CONSTRAINT `voice_participants_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- voice_sessions
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `voice_sessions`;
CREATE TABLE `voice_sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `channel_id` int NOT NULL,
  `user_id` int NOT NULL,
  `is_muted` tinyint(1) DEFAULT '0',
  `is_deaf` tinyint(1) DEFAULT '0',
  `joined_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `last_activity` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_voice_session` (`channel_id`,`user_id`),
  KEY `idx_channel_id` (`channel_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_joined_at` (`joined_at`),
  CONSTRAINT `voice_sessions_ibfk_1` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`) ON DELETE CASCADE,
  CONSTRAINT `voice_sessions_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------
-- engagement_cards + engagement_poll_votes
-- Structured engagement cards attached to message_type='ai' messages, plus
-- their poll votes. See migrations/add_engagement_cards.sql.
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `engagement_poll_votes`;
DROP TABLE IF EXISTS `engagement_cards`;
CREATE TABLE `engagement_cards` (
  `message_id` bigint NOT NULL,
  `channel_id` int NOT NULL,
  `kind` varchar(20) NOT NULL,
  `payload` json NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`),
  KEY `idx_engagement_cards_channel` (`channel_id`),
  CONSTRAINT `fk_engagement_card_msg` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `engagement_poll_votes` (
  `message_id` bigint NOT NULL,
  `user_id` int NOT NULL,
  `option_index` int NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`,`user_id`),
  KEY `idx_poll_votes_msg` (`message_id`),
  CONSTRAINT `fk_poll_vote_msg` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_poll_vote_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET FOREIGN_KEY_CHECKS = 1;

