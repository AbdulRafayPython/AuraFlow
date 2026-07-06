-- add_show_agent_activity.sql
-- Adds a per-user toggle for the floating "Agent activity" panel.
-- Default 0 (off) so new accounts never see the panel until they opt in
-- from Settings → AI Agents. Read/written through the existing
-- /api/users/settings/notifications endpoints.

ALTER TABLE `user_notification_settings`
  ADD COLUMN `show_agent_activity` tinyint(1) NOT NULL DEFAULT '0'
  AFTER `notification_sounds`;
