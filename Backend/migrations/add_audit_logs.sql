-- =========================================================
-- Admin Audit Logs (broader than admin_actions)
-- =========================================================
-- admin_actions logs user-target actions only (warn/suspend/ban/role_change).
-- This table captures the full set of admin write actions across the platform:
-- flag resolutions, community CRUD, agent toggles, platform settings updates,
-- per-community agent settings, etc.

CREATE TABLE IF NOT EXISTS `admin_audit_logs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `actor_user_id` INT NOT NULL,
  `actor_role` ENUM('system_admin','community_admin','community_owner') NOT NULL,
  `action` VARCHAR(64) NOT NULL,
  `target_type` VARCHAR(32) NOT NULL,
  `target_id` BIGINT NULL,
  `community_id` INT NULL,
  `metadata` JSON NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_actor` (`actor_user_id`, `created_at`),
  KEY `idx_community` (`community_id`, `created_at`),
  KEY `idx_target` (`target_type`, `target_id`),
  KEY `idx_action` (`action`, `created_at`),
  CONSTRAINT `admin_audit_logs_actor_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `admin_audit_logs_community_fk` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
