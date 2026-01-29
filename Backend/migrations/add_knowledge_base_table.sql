-- Knowledge Base Table
-- Stores extracted knowledge from chat conversations

CREATE TABLE IF NOT EXISTS knowledge_base (
    id INT PRIMARY KEY AUTO_INCREMENT,
    
    -- Knowledge content
    title VARCHAR(500) NOT NULL,              -- Question/term/decision title
    content TEXT NOT NULL,                     -- JSON: {type, question, answer, tags, relevance_score, usage_count}
    
    -- Metadata
    source VARCHAR(50) DEFAULT 'agent',        -- 'agent' or 'manual'
    related_channel INT,                       -- Channel where knowledge originated
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Indexes for fast search
    INDEX idx_channel (related_channel),
    INDEX idx_created (created_at),
    FULLTEXT INDEX idx_search (title, content),
    
    -- Foreign key (optional - depends on your schema)
    FOREIGN KEY (related_channel) REFERENCES channels(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Example data structure in 'content' JSON field:
-- {
--   "type": "faq",
--   "question": "What is Docker?",
--   "answer": "Docker is a containerization platform that packages applications.",
--   "tags": ["docker", "containerization", "deployment"],
--   "relevance_score": 0.85,
--   "usage_count": 0
-- }
