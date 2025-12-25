-- Migration: Add moderation logs table
-- This table stores all moderation actions and flags

CREATE TABLE IF NOT EXISTS moderation_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    channel_id INT,
    message_text TEXT NOT NULL,
    flag_type ENUM('clean', 'profanity', 'hate_speech', 'harassment', 'spam', 'personal_info', 'toxic') DEFAULT 'clean',
    severity ENUM('low', 'medium', 'high', 'critical') DEFAULT 'low',
    confidence FLOAT DEFAULT 0.0,
    action_taken ENUM('none', 'flagged', 'warned', 'deleted', 'banned') DEFAULT 'none',
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_channel_id (channel_id),
    INDEX idx_created_at (created_at),
    INDEX idx_flag_type (flag_type),
    INDEX idx_severity (severity)
);

-- Add column to track moderation on messages table (optional)
ALTER TABLE messages 
ADD COLUMN moderation_flagged BOOLEAN DEFAULT FALSE,
ADD COLUMN moderation_score FLOAT DEFAULT 0.0;
