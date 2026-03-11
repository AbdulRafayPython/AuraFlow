"""Run the agent integration tables migration."""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from database import get_db_connection

def run():
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        # 1. Create agent_registry
        print("[1/7] Creating agent_registry...")
        cur.execute("""
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)
        conn.commit()
        print("       OK")

        # 2. Create community_agents
        print("[2/7] Creating community_agents...")
        cur.execute("""
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)
        conn.commit()
        print("       OK")

        # 3. Create user_agents
        print("[3/7] Creating user_agents...")
        cur.execute("""
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)
        conn.commit()
        print("       OK")

        # 4. Seed agent registry
        print("[4/7] Seeding agent_registry (7 agents)...")
        agents = [
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
             '["Activity pattern monitoring", "Stress indicator detection", "Break reminders", "Wellness score tracking", "Personalized suggestions", "Historical trend analysis"]'),
        ]
        for a in agents:
            cur.execute("""
                INSERT INTO agent_registry (agent_type, display_name, description, category, icon, default_settings, features)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    display_name = VALUES(display_name),
                    description = VALUES(description),
                    category = VALUES(category),
                    icon = VALUES(icon),
                    default_settings = VALUES(default_settings),
                    features = VALUES(features)
            """, a)
        conn.commit()
        print("       OK — 7 agents seeded")

        # 5. Add community_id column to ai_agent_logs if missing
        print("[5/7] Adding community_id to ai_agent_logs...")
        cur.execute("""
            SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'ai_agent_logs'
              AND COLUMN_NAME = 'community_id'
        """)
        row = cur.fetchone()
        if row and row['cnt'] == 0:
            cur.execute("ALTER TABLE ai_agent_logs ADD COLUMN community_id INT NULL AFTER user_id")
            conn.commit()
            print("       OK — column added")
        else:
            print("       OK — column already exists")

        # 6. Add performance indexes (ignore if already exist)
        print("[6/7] Adding performance indexes...")
        indexes = [
            ("idx_agent_logs_agent_created", "ai_agent_logs", "(agent_name, created_at)"),
            ("idx_agent_logs_community", "ai_agent_logs", "(community_id)"),
            ("idx_agent_logs_user", "ai_agent_logs", "(user_id)"),
        ]
        for idx_name, tbl, cols in indexes:
            try:
                cur.execute(f"CREATE INDEX {idx_name} ON {tbl} {cols}")
                conn.commit()
            except Exception as e:
                if 'Duplicate' in str(e) or '1061' in str(e):
                    pass  # index already exists
                else:
                    print(f"       Warning: {e}")
        print("       OK")

        # 7. Verify
        print("[7/7] Verifying...")
        cur.execute("SELECT COUNT(*) AS cnt FROM agent_registry")
        cnt = cur.fetchone()['cnt']
        print(f"       agent_registry: {cnt} agents")
        cur.execute("SHOW TABLES LIKE 'community_agents'")
        print(f"       community_agents: {'exists' if cur.fetchone() else 'MISSING!'}")
        cur.execute("SHOW TABLES LIKE 'user_agents'")
        print(f"       user_agents: {'exists' if cur.fetchone() else 'MISSING!'}")

        print("\n✅ Migration completed successfully!")

    except Exception as e:
        conn.rollback()
        print(f"\n❌ Migration failed: {e}")
        raise
    finally:
        cur.close()
        conn.close()

if __name__ == '__main__':
    run()
