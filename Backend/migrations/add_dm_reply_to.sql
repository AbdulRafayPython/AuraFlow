-- Migration: Add reply_to column to direct_messages table for threaded replies
-- The messages table already has reply_to; this brings DMs to parity.

ALTER TABLE direct_messages
  ADD COLUMN reply_to BIGINT NULL AFTER message_type,
  ADD CONSTRAINT fk_dm_reply_to FOREIGN KEY (reply_to) REFERENCES direct_messages(id) ON DELETE SET NULL;

CREATE INDEX idx_dm_reply_to ON direct_messages(reply_to);
