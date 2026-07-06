-- =============================================================
-- Migration: add_system_admin_user.sql
-- Adds a system admin account if one with username 'sysadmin' does not exist.
-- NOTE: Update @ADMIN_HASH to a secure bcrypt hash before running in production.
-- Usage: mysql -u <user> -p <dbname> < add_system_admin_user.sql
-- =============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- Default bcrypt hash for password 'auroflow123' (demo). Change this!
SET @ADMIN_HASH = '$2b$12$UgAfcHjJ6WXcfPmK4RQxtOmwhyHqVrIbso4OCGsWXRWQz2yDqIEMe';

-- Insert system admin user if username 'sysadmin' is not present
INSERT INTO `users` (email, display_name, username, password, bio, status, role, account_status, email_verified, is_first_login, created_at)
SELECT 'admin@auroflow.app', 'AuroFlow Admin', 'sysadmin', @ADMIN_HASH, 'Platform administrator (created by migration).', 'offline', 'system_admin', 'active', 1, 0, NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `users` WHERE `username` = 'sysadmin');

-- Ensure notification settings exist for the admin user
INSERT INTO `user_notification_settings` (user_id)
SELECT u.id FROM `users` u
LEFT JOIN `user_notification_settings` s ON s.user_id = u.id
WHERE u.username = 'sysadmin' AND s.user_id IS NULL;

SET FOREIGN_KEY_CHECKS = 1;
