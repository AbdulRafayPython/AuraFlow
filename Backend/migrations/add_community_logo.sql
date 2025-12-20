-- Migration: Add logo_url column to communities table
-- Run this migration to add logo support to communities

ALTER TABLE communities 
ADD COLUMN logo_url VARCHAR(500) DEFAULT NULL 
AFTER color;

-- Update existing communities with default values if needed
-- UPDATE communities SET logo_url = NULL WHERE logo_url IS NULL;
