-- Per-user summary schedule: each user can schedule auto-summaries for specific channels
CREATE TABLE IF NOT EXISTS user_summary_schedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    channel_id INT NOT NULL,
    community_id INT NOT NULL,
    schedule_time TIME NOT NULL,           -- e.g. '23:00:00'
    timezone VARCHAR(50) DEFAULT 'UTC',
    is_active BOOLEAN DEFAULT TRUE,
    last_triggered_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    UNIQUE KEY uq_user_channel (user_id, channel_id)
);

-- Store generated scheduled summaries so offline users can see them later
CREATE TABLE IF NOT EXISTS scheduled_summaries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    schedule_id INT NOT NULL,
    user_id INT NOT NULL,
    channel_id INT NOT NULL,
    community_id INT NOT NULL,
    content TEXT NOT NULL,
    method VARCHAR(50) DEFAULT 'extractive',
    message_count INT DEFAULT 0,
    is_delivered BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (schedule_id) REFERENCES user_summary_schedules(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    INDEX idx_user_delivered (user_id, is_delivered),
    INDEX idx_schedule_triggered (schedule_id, created_at)
);
