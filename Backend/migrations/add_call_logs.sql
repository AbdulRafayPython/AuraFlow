-- Migration: Add call logging support to direct_messages
-- Call logs are stored as DM entries with message_type = 'call'
-- The content field contains JSON: {"call_type":"audio|video","status":"attended|missed|rejected|canceled","duration":seconds,"call_id":"uuid"}

-- 1. Add 'call' to the message_type ENUM for direct_messages
ALTER TABLE direct_messages
  MODIFY COLUMN message_type ENUM('text','image','file','ai','voice','video','call') NOT NULL DEFAULT 'text';

-- 2. Create index for efficient call history queries
CREATE INDEX idx_dm_call_type ON direct_messages (message_type, sender_id, receiver_id)
  COMMENT 'Optimise call log queries filtered by message_type=call';

-- 3. Ensure the messages table also supports 'call' type (for future channel call logs if needed)
ALTER TABLE messages
  MODIFY COLUMN message_type ENUM('text','image','file','system','ai','voice','video','call') NOT NULL DEFAULT 'text';
