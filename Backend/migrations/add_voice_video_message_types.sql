-- Migration: Add 'voice' and 'video' to message_type ENUM
-- For: messages table (community) and direct_messages table (DMs)

-- Update messages table
ALTER TABLE messages 
  MODIFY COLUMN message_type ENUM('text','image','file','voice','video','system','ai') DEFAULT 'text';

-- Update direct_messages table
ALTER TABLE direct_messages 
  MODIFY COLUMN message_type ENUM('text','image','file','voice','video','ai') DEFAULT 'text';
