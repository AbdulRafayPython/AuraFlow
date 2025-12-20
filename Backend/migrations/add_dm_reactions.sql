-- Add direct message reactions table
-- Migration: add_dm_reactions.sql

USE auraflow;

-- Create direct_message_reactions table (similar to message_reactions for community messages)
CREATE TABLE IF NOT EXISTS direct_message_reactions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  direct_message_id BIGINT NOT NULL,
  user_id INT NOT NULL,
  emoji VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (direct_message_id) REFERENCES direct_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_dm_reaction (direct_message_id, user_id, emoji),
  INDEX idx_dm_reactions (direct_message_id),
  INDEX idx_dm_user_reactions (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user ON message_reactions(user_id);

-- Add edited_at column to messages tables if not exists (for message editing tracking)
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP NULL AFTER created_at;

ALTER TABLE direct_messages 
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP NULL AFTER created_at;
