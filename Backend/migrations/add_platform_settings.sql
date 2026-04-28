-- Platform Settings table for system admin configuration
CREATE TABLE IF NOT EXISTS platform_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert default settings
INSERT IGNORE INTO platform_settings (setting_key, setting_value) VALUES
('registration_enabled', 'true'),
('maintenance_mode', 'false'),
('max_communities_per_user', '10'),
('max_channels_per_community', '50'),
('max_file_size_mb', '10'),
('message_rate_limit', '30'),
('auto_moderation_enabled', 'true'),
('moderation_sensitivity', 'medium'),
('auto_ban_threshold', '5'),
('email_notifications_enabled', 'true');

-- Seed system admin (update with your admin username)
-- UPDATE users SET role = 'system_admin' WHERE username = 'admin';
