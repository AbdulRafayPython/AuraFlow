SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS ai_agent_logs;
CREATE TABLE `ai_agent_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `agent_id` int DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `channel_id` int DEFAULT NULL,
  `message_id` bigint DEFAULT NULL,
  `action_type` varchar(100) DEFAULT NULL,
  `input_text` text,
  `output_text` text,
  `confidence_score` float DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `agent_id` (`agent_id`),
  KEY `user_id` (`user_id`),
  KEY `channel_id` (`channel_id`),
  KEY `message_id` (`message_id`),
  CONSTRAINT `ai_agent_logs_ibfk_1` FOREIGN KEY (`agent_id`) REFERENCES `ai_agents` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ai_agent_logs_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `ai_agent_logs_ibfk_3` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`) ON DELETE SET NULL,
  CONSTRAINT `ai_agent_logs_ibfk_4` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS ai_agents;
CREATE TABLE `ai_agents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `type` enum('mood','summarizer','translator','moderator','assistant','engagement','knowledge','wellness','context','auto_message') DEFAULT NULL,
  `description` text,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  KEY `idx_agent_type` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS attachments;
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

DROP TABLE IF EXISTS blocked_friends;
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

DROP TABLE IF EXISTS blocked_users;
CREATE TABLE `blocked_users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `community_id` int NOT NULL,
  `user_id` int NOT NULL,
  `blocked_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_blocked_user` (`community_id`,`user_id`),
  KEY `idx_blocked_user` (`user_id`),
  KEY `idx_blocked_community_user` (`community_id`,`user_id`),
  CONSTRAINT `blocked_users_ibfk_1` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE CASCADE,
  CONSTRAINT `blocked_users_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS channel_members;
CREATE TABLE `channel_members` (
  `id` int NOT NULL AUTO_INCREMENT,
  `channel_id` int DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `role` enum('member','admin','moderator') DEFAULT 'member',
  `joined_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_channel_member` (`channel_id`,`user_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `channel_members_ibfk_1` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`) ON DELETE CASCADE,
  CONSTRAINT `channel_members_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS channel_read_status;
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

DROP TABLE IF EXISTS channels;
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

DROP TABLE IF EXISTS communities;
CREATE TABLE `communities` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `description` text,
  `icon` char(2) DEFAULT 'AF',
  `color` varchar(7) DEFAULT '#8B5CF6',
  `logo_url` varchar(500) DEFAULT NULL,
  `banner_url` varchar(500) DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `created_by` (`created_by`),
  KEY `idx_community_name` (`name`),
  CONSTRAINT `communities_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS community_members;
CREATE TABLE `community_members` (
  `id` int NOT NULL AUTO_INCREMENT,
  `community_id` int DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `role` enum('owner','admin','member') DEFAULT 'member',
  `violation_count` int DEFAULT '0',
  `joined_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_member` (`community_id`,`user_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `community_members_ibfk_1` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE CASCADE,
  CONSTRAINT `community_members_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS conversation_summaries;
CREATE TABLE `conversation_summaries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `channel_id` int DEFAULT NULL,
  `summary` text,
  `generated_by` varchar(50) DEFAULT 'summarizer_agent',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `message_count` int DEFAULT '0',
  `participants` text,
  `time_range_start` timestamp NULL DEFAULT NULL,
  `time_range_end` timestamp NULL DEFAULT NULL,
  `key_points` text,
  PRIMARY KEY (`id`),
  KEY `channel_id` (`channel_id`),
  CONSTRAINT `conversation_summaries_ibfk_1` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS direct_message_reactions;
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

DROP TABLE IF EXISTS direct_messages;
CREATE TABLE `direct_messages` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `sender_id` int DEFAULT NULL,
  `receiver_id` int DEFAULT NULL,
  `content` text,
  `message_type` enum('text','image','file','voice','video','ai') DEFAULT 'text',
  `reply_to` bigint DEFAULT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `read_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `edited_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_dm_pair` (`sender_id`,`receiver_id`,`created_at` DESC),
  KEY `idx_dm_reply_to` (`reply_to`),
  KEY `idx_dm_receiver` (`receiver_id`,`created_at` DESC),
  FULLTEXT KEY `ft_direct_messages` (`content`),
  CONSTRAINT `direct_messages_ibfk_1` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `direct_messages_ibfk_2` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dm_reply_to` FOREIGN KEY (`reply_to`) REFERENCES `direct_messages` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS friend_requests;
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
  CONSTRAINT `friend_requests_ibfk_1` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `friend_requests_ibfk_2` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS friends;
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

DROP TABLE IF EXISTS knowledge_base;
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
  FULLTEXT KEY `idx_search` (`title`,`content`),
  CONSTRAINT `knowledge_base_ibfk_1` FOREIGN KEY (`related_channel`) REFERENCES `channels` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS message_reactions;
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

DROP TABLE IF EXISTS messages;
CREATE TABLE `messages` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `channel_id` int DEFAULT NULL,
  `sender_id` int DEFAULT NULL,
  `content` text,
  `message_type` enum('text','image','file','voice','video','system','ai') DEFAULT 'text',
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
  FULLTEXT KEY `ft_messages` (`content`),
  CONSTRAINT `messages_ibfk_1` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`) ON DELETE CASCADE,
  CONSTRAINT `messages_ibfk_2` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `messages_ibfk_3` FOREIGN KEY (`reply_to`) REFERENCES `messages` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS moderation_logs;
CREATE TABLE `moderation_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `channel_id` int DEFAULT NULL,
  `message_text` text NOT NULL,
  `flag_type` enum('clean','profanity','hate_speech','harassment','spam','personal_info','toxic') DEFAULT 'clean',
  `severity` enum('low','medium','high','critical') DEFAULT 'low',
  `confidence` float DEFAULT '0',
  `action_taken` enum('none','flagged','warned','deleted','banned') DEFAULT 'none',
  `reason` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_channel_id` (`channel_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_flag_type` (`flag_type`),
  KEY `idx_severity` (`severity`),
  CONSTRAINT `moderation_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `moderation_logs_ibfk_2` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS notifications;
CREATE TABLE `notifications` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `type` enum('mention','reply','reaction','friend_request','system') NOT NULL,
  `title` varchar(255) DEFAULT NULL,
  `body` text,
  `related_message_id` bigint DEFAULT NULL,
  `related_channel_id` int DEFAULT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `related_message_id` (`related_message_id`),
  KEY `related_channel_id` (`related_channel_id`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `notifications_ibfk_2` FOREIGN KEY (`related_message_id`) REFERENCES `messages` (`id`) ON DELETE SET NULL,
  CONSTRAINT `notifications_ibfk_3` FOREIGN KEY (`related_channel_id`) REFERENCES `channels` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS otp_codes;
CREATE TABLE `otp_codes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `otp_hash` varchar(255) NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS password_resets;
CREATE TABLE `password_resets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `token` varchar(255) NOT NULL,
  `expires_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `password_resets_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS pinned_messages;
CREATE TABLE `pinned_messages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `channel_id` int DEFAULT NULL,
  `message_id` bigint DEFAULT NULL,
  `pinned_by` int DEFAULT NULL,
  `pinned_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_pin` (`channel_id`,`message_id`),
  KEY `message_id` (`message_id`),
  KEY `pinned_by` (`pinned_by`),
  KEY `idx_pinned_channel` (`channel_id`),
  CONSTRAINT `pinned_messages_ibfk_1` FOREIGN KEY (`channel_id`) REFERENCES `channels` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pinned_messages_ibfk_2` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pinned_messages_ibfk_3` FOREIGN KEY (`pinned_by`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS refresh_tokens;
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

DROP TABLE IF EXISTS roles;
CREATE TABLE `roles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `description` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS token_blocklist;
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

DROP TABLE IF EXISTS typing_indicators;
CREATE TABLE `typing_indicators` (
  `id` int NOT NULL AUTO_INCREMENT,
  `channel_id` int DEFAULT NULL,
  `dm_conversation_id` varchar(100) DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT ((now() + interval 5 second)),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `idx_expires` (`expires_at`),
  CONSTRAINT `typing_indicators_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS user_activity_log;
CREATE TABLE `user_activity_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `activity_type` varchar(100) DEFAULT NULL,
  `details` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `idx_activity_type` (`activity_type`),
  CONSTRAINT `user_activity_log_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS user_mood_history;
CREATE TABLE `user_mood_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `mood` enum('happy','sad','angry','neutral','excited','stressed') DEFAULT 'neutral',
  `mood_score` float DEFAULT NULL,
  `detected_by` varchar(50) DEFAULT 'mood_agent',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `user_mood_history_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS user_moods;
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

DROP TABLE IF EXISTS user_roles;
CREATE TABLE `user_roles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `role_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_role` (`user_id`,`role_id`),
  KEY `role_id` (`role_id`),
  CONSTRAINT `user_roles_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_roles_ibfk_2` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS users;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(255) DEFAULT NULL,
  `display_name` varchar(255) DEFAULT NULL,
  `username` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `token` varchar(1500) DEFAULT NULL,
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
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_user_email` (`email`),
  KEY `idx_username` (`username`),
  KEY `idx_email_verification_token` (`email_verification_token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS voice_channels;
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

DROP TABLE IF EXISTS voice_participants;
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

DROP TABLE IF EXISTS voice_sessions;
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

SET FOREIGN_KEY_CHECKS = 1;
