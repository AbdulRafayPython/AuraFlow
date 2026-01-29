-- Add metadata columns to conversation_summaries table

ALTER TABLE conversation_summaries
ADD COLUMN message_count INT DEFAULT 0,
ADD COLUMN participants TEXT,
ADD COLUMN time_range_start TIMESTAMP NULL,
ADD COLUMN time_range_end TIMESTAMP NULL,
ADD COLUMN key_points TEXT;
