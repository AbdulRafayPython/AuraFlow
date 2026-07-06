-- Add bot_name to persist the display name of AI agents posting in channels.
-- Without this, message_type='ai' rows lose their agent identity on re-fetch
-- and the frontend falls back to the sender's username.
ALTER TABLE `messages`
  ADD COLUMN `bot_name` VARCHAR(64) DEFAULT NULL AFTER `message_type`;
