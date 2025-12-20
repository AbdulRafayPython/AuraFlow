-- Create user_moods table for mood tracking
CREATE TABLE IF NOT EXISTS user_moods (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    channel_id INT,
    mood VARCHAR(50) NOT NULL,
    sentiment_score FLOAT,
    detected_emotions JSON,
    message_sample TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE SET NULL,
    INDEX idx_user_mood (user_id, created_at),
    INDEX idx_channel_mood (channel_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
