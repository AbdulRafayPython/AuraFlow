-- ============================================================================
-- AuraFlow: Agent Integration Tables Migration
-- ============================================================================
-- Creates the agent_registry, community_agents, and user_agents tables
-- for the AI Agent install/uninstall/configure system.
--
-- Run: mysql -u root -p auraflow < migrations/add_agent_integration_tables.sql
-- ============================================================================

-- Agent Registry — Catalog of all 7 agents
CREATE TABLE IF NOT EXISTS agent_registry (
    agent_type VARCHAR(50) PRIMARY KEY,
    display_name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    category ENUM('community', 'personal') NOT NULL,
    icon VARCHAR(10),
    default_settings JSON,
    features JSON,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Community Agent Installations
CREATE TABLE IF NOT EXISTS community_agents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    community_id INT NOT NULL,
    agent_type VARCHAR(50) NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    settings JSON,
    installed_by INT NOT NULL,
    installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active TIMESTAMP NULL,
    usage_count INT DEFAULT 0,
    FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_type) REFERENCES agent_registry(agent_type),
    FOREIGN KEY (installed_by) REFERENCES users(id),
    UNIQUE KEY unique_community_agent (community_id, agent_type),
    INDEX idx_community_enabled (community_id, enabled),
    INDEX idx_agent_type (agent_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Personal Agent Activations
CREATE TABLE IF NOT EXISTS user_agents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    agent_type VARCHAR(50) NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    settings JSON,
    activated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP NULL,
    usage_count INT DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_type) REFERENCES agent_registry(agent_type),
    UNIQUE KEY unique_user_agent (user_id, agent_type),
    INDEX idx_user_enabled (user_id, enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Seed Agent Registry with all 7 agents
-- ============================================================================
INSERT INTO agent_registry (agent_type, display_name, description, category, icon, default_settings, features) VALUES

('moderation', 'Moderation Agent',
 'Auto-moderate toxic content, spam, hate speech, and violations with multi-language support including Roman Urdu',
 'community', '🛡️',
 '{"sensitivity": "medium", "auto_action": false, "roman_urdu": true, "auto_delete_critical": true}',
 '["Real-time content scanning", "Multi-language support (English + Roman Urdu)", "Spam & repetition detection", "Hate speech & harassment filtering", "Personal info protection", "Admin notification system", "Configurable sensitivity levels"]'),

('engagement', 'Engagement Agent',
 'Boost community activity with polls, challenges, icebreakers and conversation starters',
 'community', '🎯',
 '{"auto_suggestions": true, "frequency": "low", "activity_types": ["polls", "icebreakers", "challenges"]}',
 '["Inactivity detection & alerts", "Polls & quick surveys", "Ice-breaker activities", "Fun challenges", "Conversation starters by category", "Engagement score tracking", "Activity usage analytics"]'),

('knowledge', 'Knowledge Builder',
 'Extract Q&A pairs, definitions, and decisions to build a searchable knowledge base',
 'community', '📚',
 '{"auto_extract": false, "min_relevance": 0.5, "dedup_threshold": 0.85}',
 '["FAQ extraction from conversations", "Definition & decision detection", "Auto-tagging with keywords", "Duplicate prevention", "Full-text search", "Usage tracking & analytics", "Community-wide knowledge insights"]'),

('focus', 'Focus Agent',
 'Monitor conversation focus, detect topic drift, and keep discussions on track',
 'community', '🎯',
 '{"alert_on_drift": true, "check_every_n_messages": 50, "min_focus_score": 0.6}',
 '["Topic extraction & keyword analysis", "Focus score calculation", "Topic drift detection", "Dominant topic identification", "Conversation coherence tracking"]'),

('summarizer', 'Summarizer Agent',
 'Generate intelligent conversation summaries with key points extraction',
 'personal', '📝',
 '{"style": "bullet_points", "max_messages": 100, "use_ai": true}',
 '["Extractive summarization (TextRank)", "AI-powered summaries (Gemini)", "Key points extraction", "Participant identification", "Time range tracking", "Summary storage & retrieval"]'),

('mood', 'Mood Tracker',
 'Track emotional tone in conversations with Roman Urdu support and sentiment visualization',
 'personal', '😊',
 '{"auto_track": true, "include_emojis": true, "roman_urdu": true}',
 '["Roman Urdu sentiment analysis", "Emoji-aware scoring", "Negation handling", "Mood trend visualization", "Community-wide mood analytics", "Wellness recommendations", "Day/time pattern insights"]'),

('wellness', 'Wellness Agent',
 'Monitor activity patterns and provide wellness suggestions based on usage behavior',
 'personal', '🧘',
 '{"break_reminders": true, "activity_alerts": true, "check_interval_hours": 1}',
 '["Activity pattern monitoring", "Stress indicator detection", "Break reminders", "Wellness score tracking", "Personalized suggestions", "Historical trend analysis"]')
ON DUPLICATE KEY UPDATE
    display_name = VALUES(display_name),
    description = VALUES(description),
    category = VALUES(category),
    icon = VALUES(icon),
    default_settings = VALUES(default_settings),
    features = VALUES(features);

-- Add community_id column to ai_agent_logs if it doesn't exist
-- (user_id already exists from the original schema)
-- MySQL doesn't support ADD COLUMN IF NOT EXISTS, so we use a procedure
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS _add_community_id_col()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'ai_agent_logs'
          AND COLUMN_NAME = 'community_id'
    ) THEN
        ALTER TABLE ai_agent_logs ADD COLUMN community_id INT NULL AFTER user_id;
    END IF;
END //
DELIMITER ;
CALL _add_community_id_col();
DROP PROCEDURE IF EXISTS _add_community_id_col;

-- Add performance indexes to ai_agent_logs
CREATE INDEX IF NOT EXISTS idx_agent_logs_agent_created ON ai_agent_logs(agent_name, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_logs_community ON ai_agent_logs(community_id);
CREATE INDEX IF NOT EXISTS idx_agent_logs_user ON ai_agent_logs(user_id);
