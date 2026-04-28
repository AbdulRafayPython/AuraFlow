-- ============================================================
-- AuroFlow Database Schema
-- Generated: 2026-04-26
-- Database: auraflow (MySQL / InnoDB, utf8mb4)
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';
SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS `auraflow`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `auraflow`;

-- ============================================================
-- 1. CORE / AUTHENTICATION
-- ============================================================

CREATE TABLE IF NOT EXISTS `users` (
  `id`                          int             NOT NULL AUTO_INCREMENT,
  `email`                       varchar(255)    DEFAULT NULL,
  `display_name`                varchar(255)    DEFAULT NULL,
  `username`                    varchar(255)    NOT NULL,
  `password`                    varchar(255)    NOT NULL,
  `bio`                         text,
  `avatar_url`                  varchar(500)    DEFAULT NULL,
  `status`                      enum('online','idle','dnd','offline') DEFAULT 'offline',
  `custom_status`               varchar(255)    DEFAULT NULL,
  `custom_status_emoji`         varchar(10)     DEFAULT NULL,
  `last_seen`                   timestamp       NULL DEFAULT NULL,
  `is_first_login`              tinyint(1)      NOT NULL DEFAULT 1,
  `created_at`                  timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`                  timestamp       NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `email_verified`              tinyint(1)      NOT NULL DEFAULT 0,
  `email_verification_token`    varchar(500)    DEFAULT NULL,
  `email_verification_expires`  timestamp       NULL DEFAULT NULL,
  `role`                        enum('user','system_admin') NOT NULL DEFAULT 'user',
  `account_status`              enum('active','suspended','banned') NOT NULL DEFAULT 'active',
  `account_status_reason`       text,
  `account_status_until`        timestamp       NULL DEFAULT NULL,
  `account_status_by`           int             DEFAULT NULL,
  `notification_settings`       json            DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email`    (`email`),
  UNIQUE KEY `username` (`username`),
  KEY `idx_user_email`                (`email`),
  KEY `idx_username`                  (`username`),
  KEY `idx_email_verification_token`  (`email_verification_token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `otp_codes` (
  `id`          int             NOT NULL AUTO_INCREMENT,
  `email`       varchar(255)    NOT NULL,
  `otp_hash`    varchar(255)    NOT NULL,
  `expires_at`  datetime        NOT NULL,
  `created_at`  timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `refresh_tokens` (
  `id`            int             NOT NULL AUTO_INCREMENT,
  `jti`           varchar(36)     NOT NULL,
  `user_id`       int             NOT NULL,
  `token_family`  varchar(36)     NOT NULL,
  `device_info`   varchar(500)    DEFAULT NULL,
  `ip_address`    varchar(45)     DEFAULT NULL,
  `created_at`    timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at`    timestamp       NOT NULL,
  `revoked_at`    timestamp       NULL DEFAULT NULL,
  `replaced_by`   varchar(36)     DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `jti` (`jti`),
  KEY `idx_refresh_jti`     (`jti`),
  KEY `idx_refresh_user_id` (`user_id`),
  KEY `idx_refresh_family`  (`token_family`),
  KEY `idx_refresh_expires` (`expires_at`),
  CONSTRAINT `refresh_tokens_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `token_blocklist` (
  `id`          int             NOT NULL AUTO_INCREMENT,
  `jti`         varchar(36)     NOT NULL,
  `user_id`     int             NOT NULL,
  `revoked_at`  timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at`  timestamp       NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `jti` (`jti`),
  KEY `idx_blocklist_jti`     (`jti`),
  KEY `idx_blocklist_expires` (`expires_at`),
  KEY `user_id`               (`user_id`),
  CONSTRAINT `token_blocklist_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. COMMUNITY & CHANNELS
-- ============================================================

CREATE TABLE IF NOT EXISTS `communities` (
  `id`          int             NOT NULL AUTO_INCREMENT,
  `name`        varchar(100)    NOT NULL,
  `description` text,
  `icon`        char(2)         DEFAULT 'AF',
  `color`       varchar(7)      DEFAULT '#8B5CF6',
  `logo_url`    varchar(500)    DEFAULT NULL,
  `banner_url`  varchar(500)    DEFAULT NULL,
  `created_by`  int             NOT NULL,
  `created_at`  timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_community_name` (`name`),
  KEY `created_by`         (`created_by`),
  CONSTRAINT `communities_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `channels` (
  `id`           int             NOT NULL AUTO_INCREMENT,
  `name`         varchar(100)    NOT NULL,
  `description`  text,
  `type`         enum('text','voice','private') DEFAULT 'text',
  `community_id` int             NOT NULL,
  `created_by`   int             DEFAULT NULL,
  `created_at`   timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_community_channels` (`community_id`),
  KEY `idx_channel_name`       (`name`),
  KEY `created_by`             (`created_by`),
  CONSTRAINT `channels_ibfk_1` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`),
  CONSTRAINT `channels_ibfk_2` FOREIGN KEY (`created_by`)   REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `community_members` (
  `id`              int             NOT NULL AUTO_INCREMENT,
  `community_id`    int             NOT NULL,
  `user_id`         int             NOT NULL,
  `role`            enum('owner','admin','member') DEFAULT 'member',
  `violation_count` int             DEFAULT 0,
  `joined_at`       timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_member` (`community_id`, `user_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `community_members_ibfk_1` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`),
  CONSTRAINT `community_members_ibfk_2` FOREIGN KEY (`user_id`)      REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `channel_members` (
  `id`         int             NOT NULL AUTO_INCREMENT,
  `channel_id` int             NOT NULL,
  `user_id`    int             NOT NULL,
  `role`       enum('member','admin','moderator') DEFAULT 'member',
  `joined_at`  timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_channel_member` (`channel_id`, `user_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `channel_members_ibfk_1` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`),
  CONSTRAINT `channel_members_ibfk_2` FOREIGN KEY (`user_id`)    REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `blocked_users` (
  `id`           int             NOT NULL AUTO_INCREMENT,
  `community_id` int             NOT NULL,
  `user_id`      int             NOT NULL,
  `blocked_at`   timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  `reason`       text,
  `blocked_by`   int             DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_blocked_user`     (`community_id`, `user_id`),
  KEY `idx_blocked_community_user`     (`community_id`, `user_id`),
  KEY `idx_blocked_user`               (`user_id`),
  KEY `blocked_by`                     (`blocked_by`),
  CONSTRAINT `blocked_users_ibfk_1` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`),
  CONSTRAINT `blocked_users_ibfk_2` FOREIGN KEY (`user_id`)      REFERENCES `users` (`id`),
  CONSTRAINT `blocked_users_ibfk_3` FOREIGN KEY (`blocked_by`)   REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `community_unread_status` (
  `id`            bigint          NOT NULL AUTO_INCREMENT,
  `user_id`       int             NOT NULL,
  `community_id`  int             NOT NULL,
  `total_unread`  int             DEFAULT 0,
  `last_seen_at`  timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_community`  (`user_id`, `community_id`),
  KEY `idx_community_unread`          (`community_id`, `user_id`),
  CONSTRAINT `community_unread_status_ibfk_1` FOREIGN KEY (`user_id`)      REFERENCES `users` (`id`),
  CONSTRAINT `community_unread_status_ibfk_2` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. MESSAGING
-- ============================================================

CREATE TABLE IF NOT EXISTS `messages` (
  `id`                 bigint          NOT NULL AUTO_INCREMENT,
  `channel_id`         int             NOT NULL,
  `sender_id`          int             NOT NULL,
  `content`            text            NOT NULL,
  `message_type`       enum('text','image','file','system','ai','voice','video','call') DEFAULT 'text',
  `reply_to`           bigint          DEFAULT NULL,
  `created_at`         timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  `edited_at`          timestamp       NULL DEFAULT NULL,
  `moderation_flagged` tinyint(1)      DEFAULT 0,
  `moderation_score`   float           DEFAULT 0,
  `is_pinned`          tinyint(1)      DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_channel_id`       (`channel_id`),
  KEY `idx_sender_id`        (`sender_id`),
  KEY `idx_msg_channel_time` (`channel_id`, `created_at`),
  KEY `idx_messages_time`    (`created_at`),
  KEY `idx_messages_pinned`  (`channel_id`, `is_pinned`),
  KEY `reply_to`             (`reply_to`),
  CONSTRAINT `messages_ibfk_1`     FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`),
  CONSTRAINT `messages_ibfk_2`     FOREIGN KEY (`sender_id`)  REFERENCES `users` (`id`),
  CONSTRAINT `messages_ibfk_reply` FOREIGN KEY (`reply_to`)   REFERENCES `messages` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `direct_messages` (
  `id`           bigint          NOT NULL AUTO_INCREMENT,
  `sender_id`    int             NOT NULL,
  `receiver_id`  int             NOT NULL,
  `content`      text            NOT NULL,
  `message_type` enum('text','image','file','ai','voice','video','call') DEFAULT 'text',
  `reply_to`     bigint          DEFAULT NULL,
  `is_read`      tinyint(1)      DEFAULT 0,
  `read_at`      timestamp       NULL DEFAULT NULL,
  `created_at`   timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  `edited_at`    timestamp       NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_dm_pair`        (`sender_id`, `receiver_id`, `created_at`),
  KEY `idx_dm_receiver`    (`receiver_id`, `created_at`),
  KEY `idx_dm_reply_to`    (`reply_to`),
  KEY `idx_dm_call_type`   (`message_type`, `sender_id`, `receiver_id`),
  CONSTRAINT `direct_messages_ibfk_1`     FOREIGN KEY (`sender_id`)   REFERENCES `users` (`id`),
  CONSTRAINT `direct_messages_ibfk_2`     FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`),
  CONSTRAINT `direct_messages_ibfk_reply` FOREIGN KEY (`reply_to`)    REFERENCES `direct_messages` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `attachments` (
  `id`                  bigint          NOT NULL AUTO_INCREMENT,
  `message_id`          bigint          DEFAULT NULL,
  `direct_message_id`   bigint          DEFAULT NULL,
  `file_name`           varchar(255)    NOT NULL,
  `file_path`           varchar(500)    NOT NULL,
  `file_size`           bigint          DEFAULT NULL,
  `mime_type`           varchar(100)    DEFAULT NULL,
  `uploaded_by`         int             DEFAULT NULL,
  `uploaded_at`         timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  `duration`            float           DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_att_message_id`  (`message_id`),
  KEY `idx_att_dm_id`       (`direct_message_id`),
  KEY `uploaded_by`         (`uploaded_by`),
  CONSTRAINT `attachments_ibfk_1` FOREIGN KEY (`message_id`)        REFERENCES `messages` (`id`),
  CONSTRAINT `attachments_ibfk_2` FOREIGN KEY (`direct_message_id`) REFERENCES `direct_messages` (`id`),
  CONSTRAINT `attachments_ibfk_3` FOREIGN KEY (`uploaded_by`)       REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `message_reactions` (
  `id`         bigint          NOT NULL AUTO_INCREMENT,
  `message_id` bigint          NOT NULL,
  `user_id`    int             NOT NULL,
  `emoji`      varchar(50)     NOT NULL,
  `created_at` timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_reaction`               (`message_id`, `user_id`, `emoji`),
  KEY `idx_message_reactions_message`        (`message_id`),
  KEY `idx_message_reactions_user`           (`user_id`),
  CONSTRAINT `message_reactions_ibfk_1` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`),
  CONSTRAINT `message_reactions_ibfk_2` FOREIGN KEY (`user_id`)    REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `direct_message_reactions` (
  `id`                  bigint          NOT NULL AUTO_INCREMENT,
  `direct_message_id`   bigint          NOT NULL,
  `user_id`             int             NOT NULL,
  `emoji`               varchar(50)     NOT NULL,
  `created_at`          timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_dm_reaction`        (`direct_message_id`, `user_id`, `emoji`),
  KEY `idx_dm_reactions`                 (`direct_message_id`),
  KEY `idx_dm_user_reactions`            (`user_id`),
  CONSTRAINT `direct_message_reactions_ibfk_1` FOREIGN KEY (`direct_message_id`) REFERENCES `direct_messages` (`id`),
  CONSTRAINT `direct_message_reactions_ibfk_2` FOREIGN KEY (`user_id`)           REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. PINNED MESSAGES
-- ============================================================

CREATE TABLE IF NOT EXISTS `pinned_messages` (
  `id`         int             NOT NULL AUTO_INCREMENT,
  `channel_id` int             DEFAULT NULL,
  `message_id` bigint          DEFAULT NULL,
  `pinned_by`  int             DEFAULT NULL,
  `pinned_at`  timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` timestamp       NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_pin`       (`channel_id`, `message_id`),
  KEY `idx_pinned_channel`      (`channel_id`),
  KEY `idx_pin_expires`         (`expires_at`),
  KEY `message_id`              (`message_id`),
  KEY `pinned_by`               (`pinned_by`),
  CONSTRAINT `pinned_messages_ibfk_1` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`),
  CONSTRAINT `pinned_messages_ibfk_2` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`),
  CONSTRAINT `pinned_messages_ibfk_3` FOREIGN KEY (`pinned_by`)  REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `dm_pinned_messages` (
  `id`          int             NOT NULL AUTO_INCREMENT,
  `sender_id`   int             DEFAULT NULL,
  `receiver_id` int             DEFAULT NULL,
  `message_id`  bigint          DEFAULT NULL,
  `pinned_by`   int             DEFAULT NULL,
  `pinned_at`   timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at`  timestamp       NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_dm_pin`    (`message_id`),
  KEY `idx_dm_pin_pair`         (`sender_id`, `receiver_id`),
  KEY `idx_dm_pin_expires`      (`expires_at`),
  KEY `receiver_id`             (`receiver_id`),
  KEY `pinned_by`               (`pinned_by`),
  CONSTRAINT `dm_pinned_messages_ibfk_1` FOREIGN KEY (`sender_id`)   REFERENCES `users` (`id`),
  CONSTRAINT `dm_pinned_messages_ibfk_2` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`),
  CONSTRAINT `dm_pinned_messages_ibfk_3` FOREIGN KEY (`message_id`)  REFERENCES `direct_messages` (`id`),
  CONSTRAINT `dm_pinned_messages_ibfk_4` FOREIGN KEY (`pinned_by`)   REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. SOCIAL / FRIENDS
-- ============================================================

CREATE TABLE IF NOT EXISTS `friends` (
  `id`         int             NOT NULL AUTO_INCREMENT,
  `user_id`    int             NOT NULL,
  `friend_id`  int             NOT NULL,
  `created_at` timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_friendship`  (`user_id`, `friend_id`),
  KEY `idx_friends_user`          (`user_id`),
  KEY `idx_friends_friend`        (`friend_id`),
  CONSTRAINT `friends_ibfk_1` FOREIGN KEY (`user_id`)   REFERENCES `users` (`id`),
  CONSTRAINT `friends_ibfk_2` FOREIGN KEY (`friend_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `friend_requests` (
  `id`          int             NOT NULL AUTO_INCREMENT,
  `sender_id`   int             NOT NULL,
  `receiver_id` int             NOT NULL,
  `status`      enum('pending','accepted','rejected','cancelled') DEFAULT 'pending',
  `created_at`  timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_request`  (`sender_id`, `receiver_id`),
  KEY `idx_fr_sender`          (`sender_id`),
  KEY `idx_fr_receiver`        (`receiver_id`),
  CONSTRAINT `friend_requests_ibfk_1` FOREIGN KEY (`sender_id`)   REFERENCES `users` (`id`),
  CONSTRAINT `friend_requests_ibfk_2` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `blocked_friends` (
  `id`         int             NOT NULL AUTO_INCREMENT,
  `blocker_id` int             NOT NULL,
  `blocked_id` int             NOT NULL,
  `created_at` timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_block`  (`blocker_id`, `blocked_id`),
  KEY `idx_blocker`          (`blocker_id`),
  KEY `idx_blocked`          (`blocked_id`),
  CONSTRAINT `blocked_friends_ibfk_1` FOREIGN KEY (`blocker_id`) REFERENCES `users` (`id`),
  CONSTRAINT `blocked_friends_ibfk_2` FOREIGN KEY (`blocked_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. UNREAD TRACKING
-- ============================================================

CREATE TABLE IF NOT EXISTS `channel_read_status` (
  `id`                    bigint          NOT NULL AUTO_INCREMENT,
  `user_id`               int             NOT NULL,
  `channel_id`            int             NOT NULL,
  `last_read_message_id`  bigint          DEFAULT NULL,
  `last_read_at`          timestamp       NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_channel`      (`user_id`, `channel_id`),
  KEY `idx_channel_read_user`           (`user_id`),
  KEY `idx_channel_read_channel`        (`channel_id`),
  KEY `last_read_message_id`            (`last_read_message_id`),
  CONSTRAINT `channel_read_status_ibfk_1` FOREIGN KEY (`user_id`)              REFERENCES `users` (`id`),
  CONSTRAINT `channel_read_status_ibfk_2` FOREIGN KEY (`channel_id`)           REFERENCES `channels` (`id`),
  CONSTRAINT `channel_read_status_ibfk_3` FOREIGN KEY (`last_read_message_id`) REFERENCES `messages` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7. AI AGENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS `ai_agents` (
  `id`          int             NOT NULL AUTO_INCREMENT,
  `name`        varchar(100)    NOT NULL,
  `type`        enum('mood','summarizer','translator','moderator','assistant','engagement','knowledge','wellness','context','auto_message') DEFAULT NULL,
  `description` text,
  `is_active`   tinyint(1)      DEFAULT 1,
  `created_at`  timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name`        (`name`),
  KEY `idx_agent_type`     (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `agent_registry` (
  `agent_type`       varchar(50)     NOT NULL,
  `display_name`     varchar(100)    NOT NULL,
  `description`      text,
  `category`         enum('community','personal') DEFAULT NULL,
  `icon`             varchar(10)     DEFAULT NULL,
  `default_settings` json            DEFAULT NULL,
  `features`         json            DEFAULT NULL,
  `is_active`        tinyint(1)      DEFAULT 1,
  `created_at`       timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`agent_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `ai_agent_logs` (
  `id`               bigint          NOT NULL AUTO_INCREMENT,
  `agent_id`         int             DEFAULT NULL,
  `agent_name`       varchar(100)    DEFAULT NULL,
  `user_id`          int             DEFAULT NULL,
  `community_id`     int             DEFAULT NULL,
  `channel_id`       int             DEFAULT NULL,
  `message_id`       bigint          DEFAULT NULL,
  `action_type`      varchar(100)    DEFAULT NULL,
  `input_text`       text,
  `input_data`       text,
  `output_text`      text,
  `output_data`      text,
  `confidence_score` float           DEFAULT NULL,
  `status`           varchar(50)     DEFAULT 'success',
  `execution_time_ms` int            DEFAULT 0,
  `created_at`       timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `agent_id`                  (`agent_id`),
  KEY `channel_id`                (`channel_id`),
  KEY `message_id`                (`message_id`),
  KEY `idx_agent_logs_user`       (`user_id`),
  KEY `idx_agent_logs_community`  (`community_id`),
  KEY `idx_agent_name`            (`agent_name`),
  CONSTRAINT `ai_agent_logs_ibfk_1` FOREIGN KEY (`agent_id`)   REFERENCES `ai_agents` (`id`),
  CONSTRAINT `ai_agent_logs_ibfk_2` FOREIGN KEY (`user_id`)    REFERENCES `users` (`id`),
  CONSTRAINT `ai_agent_logs_ibfk_3` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`),
  CONSTRAINT `ai_agent_logs_ibfk_4` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `community_agents` (
  `id`            int             NOT NULL AUTO_INCREMENT,
  `community_id`  int             NOT NULL,
  `agent_type`    varchar(50)     NOT NULL,
  `enabled`       tinyint(1)      DEFAULT 1,
  `settings`      json            DEFAULT NULL,
  `installed_by`  int             DEFAULT NULL,
  `installed_at`  timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  `last_active`   timestamp       NULL DEFAULT NULL,
  `usage_count`   int             DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_community_agent` (`community_id`, `agent_type`),
  KEY `idx_community_enabled`         (`community_id`, `enabled`),
  KEY `idx_agent_type`                (`agent_type`),
  KEY `installed_by`                  (`installed_by`),
  CONSTRAINT `community_agents_ibfk_1` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`),
  CONSTRAINT `fk_ca_agent_type`        FOREIGN KEY (`agent_type`)   REFERENCES `agent_registry` (`agent_type`),
  CONSTRAINT `community_agents_ibfk_3` FOREIGN KEY (`installed_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `user_agents` (
  `id`           int             NOT NULL AUTO_INCREMENT,
  `user_id`      int             NOT NULL,
  `agent_type`   varchar(50)     NOT NULL,
  `enabled`      tinyint(1)      DEFAULT 1,
  `settings`     json            DEFAULT NULL,
  `activated_at` timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  `last_used`    timestamp       NULL DEFAULT NULL,
  `usage_count`  int             DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_agent`  (`user_id`, `agent_type`),
  KEY `idx_user_enabled`          (`user_id`, `enabled`),
  KEY `fk_ua_agent_type`          (`agent_type`),
  CONSTRAINT `user_agents_ibfk_1` FOREIGN KEY (`user_id`)    REFERENCES `users` (`id`),
  CONSTRAINT `fk_ua_agent_type`   FOREIGN KEY (`agent_type`) REFERENCES `agent_registry` (`agent_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `knowledge_base` (
  `id`              int             NOT NULL AUTO_INCREMENT,
  `title`           varchar(500)    NOT NULL,
  `content`         text            NOT NULL,
  `source`          varchar(50)     DEFAULT 'agent',
  `related_channel` int             DEFAULT NULL,
  `created_at`      timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      timestamp       NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_channel`  (`related_channel`),
  KEY `idx_created`  (`created_at`),
  KEY `idx_search`   (`title`(255), `content`(255)),
  CONSTRAINT `knowledge_base_ibfk_1` FOREIGN KEY (`related_channel`) REFERENCES `channels` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `user_moods` (
  `id`                 bigint          NOT NULL AUTO_INCREMENT,
  `user_id`            int             NOT NULL,
  `channel_id`         int             DEFAULT NULL,
  `mood`               varchar(50)     NOT NULL,
  `sentiment_score`    float           DEFAULT NULL,
  `detected_emotions`  json            DEFAULT NULL,
  `message_sample`     text,
  `created_at`         timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_mood`    (`user_id`, `created_at`),
  KEY `idx_channel_mood` (`channel_id`, `created_at`),
  CONSTRAINT `user_moods_ibfk_1` FOREIGN KEY (`user_id`)    REFERENCES `users` (`id`),
  CONSTRAINT `user_moods_ibfk_2` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 8. SUMMARIES
-- ============================================================

CREATE TABLE IF NOT EXISTS `conversation_summaries` (
  `id`               int             NOT NULL AUTO_INCREMENT,
  `channel_id`       int             NOT NULL,
  `summary`          text            NOT NULL,
  `generated_by`     varchar(50)     DEFAULT 'summarizer_agent',
  `created_by`       int             DEFAULT NULL,
  `created_at`       timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  `message_count`    int             DEFAULT 0,
  `method`           varchar(50)     DEFAULT 'extractive',
  `participants`     text,
  `time_range_start` timestamp       NULL DEFAULT NULL,
  `time_range_end`   timestamp       NULL DEFAULT NULL,
  `key_points`       text,
  PRIMARY KEY (`id`),
  KEY `channel_id`         (`channel_id`),
  KEY `idx_user_summaries` (`created_by`, `created_at`),
  CONSTRAINT `conversation_summaries_ibfk_1` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`),
  CONSTRAINT `conversation_summaries_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `user_summary_schedules` (
  `id`                int             NOT NULL AUTO_INCREMENT,
  `user_id`           int             NOT NULL,
  `channel_id`        int             NOT NULL,
  `community_id`      int             NOT NULL,
  `schedule_time`     time            NOT NULL,
  `timezone`          varchar(50)     DEFAULT 'UTC',
  `is_active`         tinyint(1)      DEFAULT 1,
  `last_triggered_at` datetime        DEFAULT NULL,
  `created_at`        datetime        DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        datetime        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_channel`  (`user_id`, `channel_id`),
  KEY `fk_uss_channel`          (`channel_id`),
  CONSTRAINT `fk_uss_user`    FOREIGN KEY (`user_id`)    REFERENCES `users` (`id`),
  CONSTRAINT `fk_uss_channel` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `scheduled_summaries` (
  `id`            int             NOT NULL AUTO_INCREMENT,
  `schedule_id`   int             NOT NULL,
  `user_id`       int             NOT NULL,
  `channel_id`    int             NOT NULL,
  `community_id`  int             NOT NULL,
  `content`       text            NOT NULL,
  `method`        varchar(50)     DEFAULT 'extractive',
  `message_count` int             DEFAULT 0,
  `is_delivered`  tinyint(1)      DEFAULT 0,
  `created_at`    datetime        DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_schedule_triggered`  (`schedule_id`, `created_at`),
  KEY `idx_user_delivered`       (`user_id`, `is_delivered`),
  KEY `fk_ss_channel`            (`channel_id`),
  CONSTRAINT `fk_ss_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `user_summary_schedules` (`id`),
  CONSTRAINT `fk_ss_user`     FOREIGN KEY (`user_id`)     REFERENCES `users` (`id`),
  CONSTRAINT `fk_ss_channel`  FOREIGN KEY (`channel_id`)  REFERENCES `channels` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 9. VOICE
-- ============================================================

CREATE TABLE IF NOT EXISTS `voice_channels` (
  `id`         int             NOT NULL AUTO_INCREMENT,
  `name`       varchar(100)    NOT NULL,
  `channel_id` int             DEFAULT NULL,
  `is_active`  tinyint(1)      DEFAULT 0,
  `created_at` timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `channel_id` (`channel_id`),
  CONSTRAINT `voice_channels_ibfk_1` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `voice_participants` (
  `id`               int             NOT NULL AUTO_INCREMENT,
  `voice_channel_id` int             DEFAULT NULL,
  `user_id`          int             DEFAULT NULL,
  `joined_at`        timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  `left_at`          timestamp       NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `voice_channel_id` (`voice_channel_id`),
  KEY `user_id`          (`user_id`),
  CONSTRAINT `voice_participants_ibfk_1` FOREIGN KEY (`voice_channel_id`) REFERENCES `voice_channels` (`id`),
  CONSTRAINT `voice_participants_ibfk_2` FOREIGN KEY (`user_id`)          REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `voice_sessions` (
  `id`            int             NOT NULL AUTO_INCREMENT,
  `channel_id`    int             NOT NULL,
  `user_id`       int             NOT NULL,
  `is_muted`      tinyint(1)      DEFAULT 0,
  `is_deaf`       tinyint(1)      DEFAULT 0,
  `joined_at`     timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  `last_activity` timestamp       NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_voice_session` (`channel_id`, `user_id`),
  KEY `idx_channel_id`              (`channel_id`),
  KEY `idx_user_id`                 (`user_id`),
  KEY `idx_joined_at`               (`joined_at`),
  CONSTRAINT `voice_sessions_ibfk_1` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`),
  CONSTRAINT `voice_sessions_ibfk_2` FOREIGN KEY (`user_id`)    REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 10. NOTIFICATIONS & SETTINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS `notifications` (
  `id`         bigint          NOT NULL AUTO_INCREMENT,
  `user_id`    int             NOT NULL,
  `type`       varchar(30)     DEFAULT NULL,
  `title`      varchar(255)    NOT NULL,
  `body`       text,
  `icon_url`   varchar(500)    DEFAULT NULL,
  `link`       varchar(500)    DEFAULT NULL,
  `related_id` bigint          DEFAULT NULL,
  `is_read`    tinyint(1)      DEFAULT 0,
  `created_at` timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notif_user_read`    (`user_id`, `is_read`),
  KEY `idx_notif_user_created` (`user_id`, `created_at`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id`          int             NOT NULL AUTO_INCREMENT,
  `user_id`     int             NOT NULL,
  `endpoint`    varchar(500)    NOT NULL,
  `p256dh_key`  varchar(200)    NOT NULL,
  `auth_key`    varchar(200)    NOT NULL,
  `created_at`  timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_push_endpoint` (`endpoint`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `push_subscriptions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `user_notification_settings` (
  `user_id`                    int             NOT NULL,
  `notify_direct_messages`     tinyint(1)      NOT NULL DEFAULT 1,
  `notify_channel_messages`    tinyint(1)      NOT NULL DEFAULT 1,
  `notify_friend_requests`     tinyint(1)      NOT NULL DEFAULT 1,
  `notify_friend_online`       tinyint(1)      NOT NULL DEFAULT 0,
  `notification_sounds`        tinyint(1)      NOT NULL DEFAULT 1,
  `email_alerts_enabled`       tinyint(1)      NOT NULL DEFAULT 1,
  `email_dms_and_calls`        tinyint(1)      NOT NULL DEFAULT 1,
  `email_community_messages`   tinyint(1)      NOT NULL DEFAULT 0,
  `email_agent_notifications`  tinyint(1)      NOT NULL DEFAULT 1,
  `email_agent_summaries`      tinyint(1)      NOT NULL DEFAULT 1,
  `email_batch_interval_minutes` int           NOT NULL DEFAULT 5,
  `created_at`                 timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`                 timestamp       NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `user_notification_settings_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `platform_settings` (
  `setting_key`   varchar(100)    NOT NULL,
  `setting_value` text            NOT NULL,
  `updated_at`    timestamp       NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 11. ADMIN
-- ============================================================

CREATE TABLE IF NOT EXISTS `admin_actions` (
  `id`             int             NOT NULL AUTO_INCREMENT,
  `admin_id`       int             NOT NULL,
  `target_user_id` int             NOT NULL,
  `action_type`    enum('warn','suspend','ban','unsuspend','unban','role_change') NOT NULL,
  `reason`         text,
  `details`        json            DEFAULT NULL,
  `created_at`     timestamp       NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_admin`       (`admin_id`),
  KEY `idx_target_user` (`target_user_id`),
  KEY `idx_created`     (`created_at`),
  CONSTRAINT `admin_actions_ibfk_1` FOREIGN KEY (`admin_id`)       REFERENCES `users` (`id`),
  CONSTRAINT `admin_actions_ibfk_2` FOREIGN KEY (`target_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================

SET FOREIGN_KEY_CHECKS = 1;
