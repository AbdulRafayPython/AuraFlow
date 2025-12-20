-- =====================================
-- AI AGENTS DATABASE TABLES
-- AuraFlow AI Enhancement
-- =====================================

USE auraflow;

-- =====================================
-- 1️⃣ CHAT SUMMARIES
-- Store summarized versions of long conversations
-- Using existing table name: conversation_summaries
-- =====================================
CREATE TABLE IF NOT EXISTS conversation_summaries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  channel_id INT NOT NULL,
  summary_text TEXT NOT NULL,
  message_count INT DEFAULT 0,
  start_message_id BIGINT,
  end_message_id BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INT,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_channel_summaries (channel_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================
-- 2️⃣ MOOD TRACKING
-- Track sentiment/mood in messages (Roman Urdu support)
-- =====================================
CREATE TABLE IF NOT EXISTS mood_tracking (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  channel_id INT,
  message_id BIGINT,
  sentiment ENUM('positive', 'negative', 'neutral') NOT NULL,
  sentiment_score DECIMAL(3,2) DEFAULT 0.00,
  detected_language VARCHAR(20) DEFAULT 'en',
  original_text TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  INDEX idx_user_mood (user_id, created_at DESC),
  INDEX idx_channel_mood (channel_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================
-- 3️⃣ MODERATION LOG
-- Track flagged/moderated content
-- =====================================
CREATE TABLE IF NOT EXISTS moderation_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  message_id BIGINT NOT NULL,
  channel_id INT NOT NULL,
  user_id INT NOT NULL,
  flag_type ENUM('toxic', 'spam', 'inappropriate', 'other') NOT NULL,
  severity ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
  action_taken ENUM('flagged', 'warned', 'deleted', 'none') DEFAULT 'flagged',
  flagged_content TEXT,
  reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_moderation_channel (channel_id, created_at DESC),
  INDEX idx_moderation_user (user_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================
-- 4️⃣ KNOWLEDGE BASE
-- Store extracted Q&A and key information
-- =====================================
CREATE TABLE IF NOT EXISTS knowledge_base (
  id INT AUTO_INCREMENT PRIMARY KEY,
  channel_id INT,
  community_id INT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  source_message_id BIGINT,
  tags VARCHAR(500),
  relevance_score DECIMAL(3,2) DEFAULT 0.00,
  usage_count INT DEFAULT 0,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE SET NULL,
  FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE SET NULL,
  FOREIGN KEY (source_message_id) REFERENCES messages(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_kb_channel (channel_id),
  INDEX idx_kb_community (community_id),
  FULLTEXT INDEX ft_kb_question (question),
  FULLTEXT INDEX ft_kb_answer (answer)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================
-- 5️⃣ WELLNESS TRACKING
-- Track user wellness and activity patterns
-- =====================================
CREATE TABLE IF NOT EXISTS wellness_tracking (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  date DATE NOT NULL,
  activity_score DECIMAL(5,2) DEFAULT 0.00,
  stress_indicators INT DEFAULT 0,
  positive_interactions INT DEFAULT 0,
  negative_interactions INT DEFAULT 0,
  breaks_taken INT DEFAULT 0,
  total_messages INT DEFAULT 0,
  wellness_score DECIMAL(3,2) DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_date (user_id, date),
  INDEX idx_wellness_user (user_id, date DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================
-- 6️⃣ ENGAGEMENT METRICS
-- Track channel engagement and activity
-- =====================================
CREATE TABLE IF NOT EXISTS engagement_metrics (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  channel_id INT NOT NULL,
  date DATE NOT NULL,
  total_messages INT DEFAULT 0,
  active_users INT DEFAULT 0,
  avg_response_time DECIMAL(10,2) DEFAULT 0.00,
  engagement_score DECIMAL(5,2) DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  UNIQUE KEY unique_channel_date (channel_id, date),
  INDEX idx_engagement_channel (channel_id, date DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================
-- 7️⃣ AGENT ACTIVITY LOG
-- Track all agent actions and results
-- Using existing table name: ai_agent_logs
-- =====================================
CREATE TABLE IF NOT EXISTS ai_agent_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  agent_name VARCHAR(50) NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  channel_id INT,
  user_id INT,
  input_data TEXT,
  output_data TEXT,
  status ENUM('success', 'failed', 'partial') DEFAULT 'success',
  execution_time DECIMAL(10,3) DEFAULT 0.000,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_agent_log (agent_name, created_at DESC),
  INDEX idx_agent_channel (channel_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================
-- COMPLETED: AI Agents Database Schema
-- =====================================
