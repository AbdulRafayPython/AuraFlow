-- Migration: Add notification_settings JSON column to users table
-- This supports user-controlled email notification preferences and batching

ALTER TABLE users ADD COLUMN notification_settings JSON DEFAULT NULL;

-- Verify the column was added
-- SELECT id, username, notification_settings FROM users LIMIT 5;
