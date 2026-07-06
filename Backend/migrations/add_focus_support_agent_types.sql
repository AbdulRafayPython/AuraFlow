-- Add 'focus' and 'support' to the ai_agents.type enum.
--
-- The autonomous Focus and Support agents log to ai_agents / ai_agent_logs
-- but their type values were never part of the enum, so every
-- `INSERT INTO ai_agents (..., type, ...) VALUES (..., 'focus', ...)`
-- failed with MySQL error 1265 "Data truncated for column 'type'".
-- This left focus/support analyses unpersisted and spammed the logs.
--
-- Idempotent-safe to re-run: re-applying the same MODIFY is a no-op.

ALTER TABLE `ai_agents`
  MODIFY COLUMN `type` enum(
    'mood','summarizer','translator','moderator','assistant',
    'engagement','knowledge','wellness','context','auto_message',
    'focus','support'
  ) DEFAULT NULL;
