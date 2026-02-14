-- Migration: Add duration column to attachments table for voice/audio messages
ALTER TABLE attachments ADD COLUMN duration FLOAT NULL DEFAULT NULL COMMENT 'Duration in seconds for audio/video files';
