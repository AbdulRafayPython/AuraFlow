-- =============================================================
-- AuroFlow - Seed / Demo Data
-- All accounts use password: auroflow123
-- Apply AFTER schema.sql:
--   mysql -u <user> -p <dbname> < migrations/seed_data.sql
-- =============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET @HASH = '$2b$12$UgAfcHjJ6WXcfPmK4RQxtOmwhyHqVrIbso4OCGsWXRWQz2yDqIEMe';

-- =============================================================
-- USERS
-- Password for every account: auroflow123
-- =============================================================
INSERT INTO `users`
  (id, email, display_name, username, password, bio, status, role, account_status, email_verified, is_first_login)
VALUES
  -- System admin
  (1, 'admin@auroflow.app',    'AuroFlow Admin',  'sysadmin',    @HASH, 'Platform administrator.',             'offline', 'system_admin', 'active', 1, 0),
  -- Community owners / power users
  (2, 'sarah@example.com',     'Sarah Dev',       'sarah_dev',   @HASH, 'CS final year. Loves algorithms.',    'online',  'user',         'active', 1, 0),
  (3, 'ahmed@example.com',     'Ahmed CS',        'ahmed_cs',    @HASH, 'Final year project enthusiast.',      'online',  'user',         'active', 1, 0),
  -- Regular members
  (4, 'fatima@example.com',    'Fatima Khan',     'fatima_k',    @HASH, 'Machine learning nerd.',              'idle',    'user',         'active', 1, 0),
  (5, 'omar@example.com',      'Omar M',          'omar_m',      @HASH, 'Frontend wizard. React + TypeScript.','online',  'user',         'active', 1, 0),
  (6, 'zara@example.com',      'Zara Tech',       'zara_tech',   @HASH, 'Full stack developer in training.',   'offline', 'user',         'active', 1, 0),
  (7, 'bilal@example.com',     'Bilal R',         'bilal_r',     @HASH, 'Data science and Python.',            'idle',    'user',         'active', 1, 0),
  (8, 'nadia@example.com',     'Nadia Ali',       'nadia_ali',   @HASH, 'UI/UX designer who codes.',           'online',  'user',         'active', 1, 0),
  -- AI bot user (sends AI-generated messages)
  (9, 'bot@auroflow.app',      'AuroFlow AI',     'auroflow_ai', @HASH, 'Your intelligent community assistant.','offline', 'user',        'active', 1, 0)
ON DUPLICATE KEY UPDATE id = id;

-- =============================================================
-- USER NOTIFICATION SETTINGS
-- =============================================================
INSERT INTO `user_notification_settings` (user_id)
VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9)
ON DUPLICATE KEY UPDATE user_id = user_id;

-- =============================================================
-- COMMUNITIES
-- =============================================================
INSERT INTO `communities`
  (id, name, description, icon, color, created_by, member_count)
VALUES
  (1, 'CS Department',
      'Official BSCS department community. Assignments, resources, and discussions.',
      'CS', '#8B5CF6', 2, 7),
  (2, 'FYP Hub',
      'Final Year Project collaboration space. Research, meetings, and progress tracking.',
      'FY', '#3B82F6', 3, 5),
  (3, 'Tech Talks',
      'Casual tech discussions, tutorials, and industry news for all students.',
      'TT', '#10B981', 5, 4)
ON DUPLICATE KEY UPDATE id = id;

-- =============================================================
-- CHANNELS
-- =============================================================
INSERT INTO `channels`
  (id, name, description, type, community_id, created_by)
VALUES
  -- CS Department channels
  (1,  'general',       'General chat for all CS students.',             'text',  1, 2),
  (2,  'assignments',   'Assignment help, deadlines, and submissions.',  'text',  1, 2),
  (3,  'resources',     'Study materials, notes, and useful links.',     'text',  1, 2),
  (4,  'off-topic',     'Memes, events, and casual chatter.',            'text',  1, 2),
  (5,  'voice-room',    'Drop in for study sessions.',                   'voice', 1, 2),
  -- FYP Hub channels
  (6,  'announcements', 'Important project updates.',                    'text',  2, 3),
  (7,  'research',      'Paper reviews, literature notes.',              'text',  2, 3),
  (8,  'meetings',      'Meeting notes and decisions.',                  'text',  2, 3),
  (9,  'random',        'Off-topic banter.',                             'text',  2, 3),
  -- Tech Talks channels
  (10, 'general',       'All things tech.',                              'text',  3, 5),
  (11, 'tutorials',     'Share tutorials and how-tos.',                  'text',  3, 5),
  (12, 'career',        'Internships, jobs, and career tips.',           'text',  3, 5)
ON DUPLICATE KEY UPDATE id = id;

-- =============================================================
-- COMMUNITY MEMBERS
-- =============================================================
INSERT INTO `community_members`
  (community_id, user_id, role)
VALUES
  -- CS Department
  (1, 2, 'owner'), (1, 3, 'admin'), (1, 4, 'member'),
  (1, 5, 'member'), (1, 6, 'member'), (1, 7, 'member'), (1, 8, 'member'),
  -- FYP Hub
  (2, 3, 'owner'), (2, 2, 'admin'), (2, 4, 'member'),
  (2, 7, 'member'), (2, 8, 'member'),
  -- Tech Talks
  (3, 5, 'owner'), (3, 6, 'admin'), (3, 7, 'member'), (3, 8, 'member')
ON DUPLICATE KEY UPDATE role = VALUES(role);

-- =============================================================
-- CHANNEL MEMBERS
-- =============================================================
INSERT INTO `channel_members` (channel_id, user_id, role)
VALUES
  -- CS Department channels — all CS members
  (1,2,'admin'),(1,3,'admin'),(1,4,'member'),(1,5,'member'),(1,6,'member'),(1,7,'member'),(1,8,'member'),
  (2,2,'admin'),(2,3,'member'),(2,4,'member'),(2,5,'member'),(2,6,'member'),(2,7,'member'),(2,8,'member'),
  (3,2,'admin'),(3,3,'member'),(3,4,'member'),(3,5,'member'),(3,6,'member'),(3,7,'member'),(3,8,'member'),
  (4,2,'admin'),(4,3,'member'),(4,4,'member'),(4,5,'member'),(4,6,'member'),(4,7,'member'),(4,8,'member'),
  -- FYP Hub channels
  (6,3,'admin'),(6,2,'member'),(6,4,'member'),(6,7,'member'),(6,8,'member'),
  (7,3,'admin'),(7,2,'member'),(7,4,'member'),(7,7,'member'),(7,8,'member'),
  (8,3,'admin'),(8,2,'member'),(8,4,'member'),(8,7,'member'),(8,8,'member'),
  (9,3,'admin'),(9,2,'member'),(9,4,'member'),(9,7,'member'),(9,8,'member'),
  -- Tech Talks channels
  (10,5,'admin'),(10,6,'member'),(10,7,'member'),(10,8,'member'),
  (11,5,'admin'),(11,6,'member'),(11,7,'member'),(11,8,'member'),
  (12,5,'admin'),(12,6,'member'),(12,7,'member'),(12,8,'member')
ON DUPLICATE KEY UPDATE role = VALUES(role);

-- =============================================================
-- AGENT REGISTRY — all 11 agents
-- =============================================================
INSERT INTO `agent_registry`
  (agent_type, display_name, description, category, icon, default_settings, features)
VALUES
  -- ── Community Agents ─────────────────────────────────────
  ('moderation',
   'Moderation Agent',
   'Automatically detects and removes toxic, abusive, spam, and policy-violating content using Gemini AI with lexicon pre-screening.',
   'community', '🛡️',
   '{"confidence_threshold": 0.70, "auto_ban_threshold": 5, "auto_delete": true, "notify_admin_on_flag": true, "moderation_mode": "balanced"}',
   '["toxicity_detection","hate_speech_filter","spam_detection","auto_ban","admin_alerts","roman_urdu_support"]'
  ),
  ('engagement',
   'Engagement Agent',
   'Monitors conversation silence and automatically posts contextual conversation starters, polls, icebreakers, and challenges.',
   'community', '🎯',
   '{"silence_threshold_minutes": 30, "max_daily_prompts": 5, "prompt_types": ["starter","icebreaker","poll","challenge"]}',
   '["silence_detection","contextual_prompts","scheduled_checks","channel_aware_content","gemini_generation"]'
  ),
  ('knowledge_builder',
   'Knowledge Builder',
   'Extracts FAQs, definitions, and decisions from conversations to build a searchable community knowledge base.',
   'community', '📚',
   '{"extraction_interval_hours": 2, "min_confidence": 0.75, "deduplicate_threshold": 0.85, "entry_types": ["faq","definition","decision"]}',
   '["faq_extraction","definition_capture","decision_logging","auto_tagging","deduplication","gemini_refinement"]'
  ),
  ('focus',
   'Focus Agent',
   'Monitors topic drift in real time, scores conversation focus health, and posts gentle redirection nudges when discussions go off-track.',
   'community', '🎯',
   '{"drift_threshold": 0.35, "consecutive_drift_limit": 5, "channel_mode": "normal", "hourly_analysis": true}',
   '["drift_detection","focus_scoring","topic_clustering","admin_alerts","focus_history","channel_modes"]'
  ),
  ('auto_message',
   'Auto Message Agent',
   'Sends personalised welcome messages to new members and provides context-aware quick-reply chip suggestions.',
   'community', '👋',
   '{"welcome_enabled": true, "quick_replies_enabled": true, "chips_per_message": 3, "gemini_polish": true}',
   '["welcome_messages","quick_reply_chips","intent_classification","personalisation","gemini_generation"]'
  ),
  ('support',
   'Support Agent',
   'Answers user questions by searching the community knowledge base using TF-IDF retrieval and Gemini-polished responses.',
   'community', '🤝',
   '{"min_similarity_score": 0.12, "cache_ttl_seconds": 300, "gemini_polish": true, "fallback_to_raw_snippet": true}',
   '["knowledge_base_search","tfidf_retrieval","gemini_polish","community_scoped","cache_index"]'
  ),

  -- ── Personal Agents ──────────────────────────────────────
  ('mood',
   'Mood Tracker',
   'Silently analyses every message for sentiment and emotions (English + Roman Urdu), tracks trends with EMA rolling averages, and surfaces private mood insights.',
   'personal', '😊',
   '{"ema_alpha_24h": 0.15, "ema_alpha_7d": 0.05, "crisis_detection": true, "negative_streak_threshold": 5, "privacy_mode": "strict"}',
   '["per_message_analysis","roman_urdu_support","emoji_sentiment","ema_rolling_average","streak_detection","crisis_alerts","mood_timeline"]'
  ),
  ('wellness',
   'Wellness Agent',
   'Monitors activity patterns and mood trends to detect burnout and stress, delivering three-level personalised wellness nudges based on your own 30-day baseline.',
   'personal', '💚',
   '{"check_interval_hours": 1, "baseline_days": 30, "level1_threshold_sigma": 1.0, "level2_threshold_sigma": 1.5, "level3_threshold_sigma": 2.5}',
   '["adaptive_baseline","three_level_escalation","activity_monitoring","mood_integration","break_reminders","resource_cards"]'
  ),
  ('summarizer',
   'Summarizer',
   'Generates concise bullet-point summaries of channel conversations on demand using hybrid extractive + Gemini AI generation.',
   'personal', '📝',
   '{"default_message_count": 50, "max_message_count": 200, "gemini_primary": true, "schedule_enabled": true}',
   '["on_demand_summary","scheduled_summaries","gemini_generation","extractive_fallback","key_topics","participant_list"]'
  ),
  ('translator',
   'Translator',
   'Translates messages between 14 languages with special Roman Urdu handling, 24-hour result caching, and optional passive per-user auto-translation.',
   'personal', '🌐',
   '{"cache_ttl_hours": 24, "supported_languages": ["en","ur","ar","fr","de","es","zh","ja","ko","tr","hi","pt","ru","it"], "roman_urdu_enabled": true, "passive_mode": false}',
   '["14_language_support","roman_urdu_detection","redis_cache","passive_auto_translate","dual_engine_fallback"]'
  ),
  ('assistant',
   'AI Assistant',
   'A general-purpose conversational AI that answers questions, generates jokes, provides motivation, and holds natural multi-turn conversation using Gemini.',
   'personal', '🤖',
   '{"gemini_primary": true, "intent_classification": true, "context_window_messages": 5, "language_detection": true}',
   '["general_qa","jokes","motivation","greetings","intent_detection","gemini_generation","multilingual"]'
  )
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name);

-- =============================================================
-- AI AGENTS (legacy table used by ai_agent_logs FK)
-- =============================================================
INSERT INTO `ai_agents` (id, name, type, description, is_active)
VALUES
  (1,  'Moderation Agent',    'moderator',    'Content moderation with Gemini + lexicon',       1),
  (2,  'Engagement Agent',    'engagement',   'Silence detection and conversation starters',    1),
  (3,  'Knowledge Builder',   'knowledge',    'FAQ and knowledge extraction from chat',         1),
  (4,  'Focus Agent',         NULL,           'Topic drift detection and focus scoring',        1),
  (5,  'Auto Message Agent',  'auto_message', 'Welcome messages and quick-reply chips',         1),
  (6,  'Support Agent',       NULL,           'TF-IDF knowledge base Q&A',                     1),
  (7,  'Mood Tracker',        'mood',         'Per-message sentiment and emotion analysis',     1),
  (8,  'Wellness Agent',      'wellness',     'Activity and mood pattern monitoring',           1),
  (9,  'Summarizer',          'summarizer',   'Hybrid extractive + Gemini summarisation',       1),
  (10, 'Translator',          'translator',   '14-language translation with Roman Urdu support',1),
  (11, 'AI Assistant',        'assistant',    'General-purpose Gemini conversational AI',       1)
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- =============================================================
-- COMMUNITY AGENTS — installed agents per community
-- CS Department has all 6 community agents
-- FYP Hub has moderation + engagement + support
-- Tech Talks has moderation only
-- =============================================================
INSERT INTO `community_agents`
  (community_id, agent_type, enabled, settings, installed_by)
VALUES
  -- CS Department (community 1) — fully equipped
  (1, 'moderation',       1, '{"moderation_mode":"balanced","confidence_threshold":0.70}', 2),
  (1, 'engagement',       1, '{"silence_threshold_minutes":45,"max_daily_prompts":4}',     2),
  (1, 'knowledge_builder',1, '{"extraction_interval_hours":2}',                            2),
  (1, 'focus',            1, '{"channel_mode":"normal","drift_threshold":0.35}',            2),
  (1, 'auto_message',     1, '{"welcome_enabled":true,"quick_replies_enabled":true}',       2),
  (1, 'support',          1, '{"min_similarity_score":0.12}',                               2),

  -- FYP Hub (community 2)
  (2, 'moderation',       1, '{"moderation_mode":"strict","auto_ban_threshold":3}',         3),
  (2, 'engagement',       1, '{"silence_threshold_minutes":60}',                            3),
  (2, 'support',          1, '{"min_similarity_score":0.15}',                               3),

  -- Tech Talks (community 3)
  (3, 'moderation',       1, '{"moderation_mode":"balanced"}',                              5)
ON DUPLICATE KEY UPDATE enabled = VALUES(enabled);

-- =============================================================
-- USER AGENTS — personal agents per user
-- =============================================================
INSERT INTO `user_agents`
  (user_id, agent_type, enabled)
VALUES
  -- sarah_dev: all 5 personal agents
  (2, 'mood',       1), (2, 'wellness',  1),
  (2, 'summarizer', 1), (2, 'translator',1), (2, 'assistant', 1),
  -- ahmed_cs
  (3, 'mood',       1), (3, 'wellness',  1), (3, 'assistant', 1),
  -- fatima_k
  (4, 'mood',       1), (4, 'translator',1), (4, 'assistant', 1),
  -- omar_m
  (5, 'summarizer', 1), (5, 'assistant', 1),
  -- zara_tech
  (6, 'mood',       1), (6, 'wellness',  1),
  -- bilal_r
  (7, 'mood',       1), (7, 'summarizer',1),
  -- nadia_ali
  (8, 'assistant',  1), (8, 'translator',1)
ON DUPLICATE KEY UPDATE enabled = VALUES(enabled);

-- =============================================================
-- PLATFORM SETTINGS (system-admin tunable defaults)
-- =============================================================
INSERT INTO `platform_settings` (setting_key, setting_value)
VALUES
  ('max_upload_size_mb',          '10'),
  ('allowed_file_types',          'image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,application/zip'),
  ('max_message_length',          '4000'),
  ('auto_ban_threshold',          '5'),
  ('moderation_confidence',       '0.70'),
  ('engagement_silence_minutes',  '30'),
  ('knowledge_extract_hours',     '2'),
  ('wellness_check_hours',        '1'),
  ('max_communities_per_user',    '20'),
  ('max_channels_per_community',  '50'),
  ('registration_enabled',        'true'),
  ('email_verification_required', 'false'),
  ('maintenance_mode',            'false'),
  ('platform_name',               'AuroFlow'),
  ('platform_tagline',            'Where Student Communities Thrive')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);

-- =============================================================
-- SAMPLE MESSAGES — CS Department #general (channel 1)
-- =============================================================
INSERT INTO `messages`
  (id, channel_id, sender_id, content, message_type, created_at)
VALUES
  (1,  1, 2, 'Welcome to CS Department! 🎉 This is the main hub for all BSCS students. Please keep discussions respectful and on-topic.',    'text', NOW() - INTERVAL 5 DAY),
  (2,  1, 3, 'Thanks for setting this up Sarah! Finally a proper community for our department 🙌',                                            'text', NOW() - INTERVAL 5 DAY + INTERVAL 5 MINUTE),
  (3,  1, 4, 'This looks amazing. Can we also add a channel for AI/ML topics?',                                                               'text', NOW() - INTERVAL 5 DAY + INTERVAL 10 MINUTE),
  (4,  1, 2, 'Great idea Fatima! I will create one. For now use #resources for anything AI-related.',                                         'text', NOW() - INTERVAL 5 DAY + INTERVAL 15 MINUTE),
  (5,  1, 5, 'What is the deadline for the OS assignment? Cant find it anywhere',                                                             'text', NOW() - INTERVAL 3 DAY),
  (6,  1, 6, 'Check #assignments — sir posted it there yesterday. Its due Friday 11:59 PM.',                                                  'text', NOW() - INTERVAL 3 DAY + INTERVAL 3 MINUTE),
  (7,  1, 5, 'Oh thanks! I completely missed that 😅',                                                                                        'text', NOW() - INTERVAL 3 DAY + INTERVAL 6 MINUTE),
  (8,  1, 7, 'Anyone else struggling with the networking lab? The OSPF configuration is killing me',                                          'text', NOW() - INTERVAL 2 DAY),
  (9,  1, 3, 'Bilal OSPF is actually not that bad once you understand the area concept. I can share my notes if you want',                    'text', NOW() - INTERVAL 2 DAY + INTERVAL 8 MINUTE),
  (10, 1, 7, 'Yes please that would be super helpful! khush ho jao',                                                                         'text', NOW() - INTERVAL 2 DAY + INTERVAL 12 MINUTE),
  (11, 1, 8, 'Good morning everyone! Anyone up for a study session this afternoon in the library?',                                           'text', NOW() - INTERVAL 1 DAY),
  (12, 1, 4, 'Yes I am in! 3pm works?',                                                                                                      'text', NOW() - INTERVAL 1 DAY + INTERVAL 5 MINUTE),
  (13, 1, 5, 'Same 👍',                                                                                                                      'text', NOW() - INTERVAL 1 DAY + INTERVAL 7 MINUTE),
  (14, 1, 8, 'Perfect, see everyone at 3pm in the CS reading room!',                                                                         'text', NOW() - INTERVAL 1 DAY + INTERVAL 10 MINUTE),
  -- AI bot engagement message
  (15, 1, 9, '📚 **Quick brain teaser!** What is the time complexity of finding the kth smallest element in an unsorted array? Share your approach! 🧠', 'ai', NOW() - INTERVAL 12 HOUR)
ON DUPLICATE KEY UPDATE id = id;

-- CS Department #assignments (channel 2)
INSERT INTO `messages`
  (id, channel_id, sender_id, content, message_type, created_at)
VALUES
  (20, 2, 2, '**OS Assignment 3 — Deadline: This Friday 11:59 PM**\nTopic: Process Synchronisation (Semaphores & Monitors)\nSubmit via LMS. Max 3 pages.',                   'text', NOW() - INTERVAL 4 DAY),
  (21, 2, 3, 'Can we work in pairs or is it individual?',                                                                                                                      'text', NOW() - INTERVAL 4 DAY + INTERVAL 30 MINUTE),
  (22, 2, 2, 'Individual submissions only. But you can discuss concepts.',                                                                                                     'text', NOW() - INTERVAL 4 DAY + INTERVAL 35 MINUTE),
  (23, 2, 4, 'Does anyone have a good reference for Monitors? The textbook explanation is confusing',                                                                          'text', NOW() - INTERVAL 3 DAY),
  (24, 2, 7, 'Operating Systems by Galvin Chapter 6 is great. Also check Neso Academy on YouTube',                                                                            'text', NOW() - INTERVAL 3 DAY + INTERVAL 20 MINUTE),
  (25, 2, 4, 'Shukriya Bilal! 🙏 Will check that out',                                                                                                                        'text', NOW() - INTERVAL 3 DAY + INTERVAL 25 MINUTE)
ON DUPLICATE KEY UPDATE id = id;

-- FYP Hub #meetings (channel 8)
INSERT INTO `messages`
  (id, channel_id, sender_id, content, message_type, created_at)
VALUES
  (30, 8, 3, '**Meeting Notes — 13 May 2026**\n\n✅ Decided: Use React + Flask for the platform\n✅ Decided: Deploy on Render (free tier)\n✅ Next milestone: Working auth by 20 May\n📌 Ahmed owns the backend, Sarah owns the frontend',  'text', NOW() - INTERVAL 2 DAY),
  (31, 8, 2, 'I will have the auth endpoints ready by Monday',                                                                                                                                                                                  'text', NOW() - INTERVAL 2 DAY + INTERVAL 5 MINUTE),
  (32, 8, 4, 'I will set up the database schema and migrations',                                                                                                                                                                               'text', NOW() - INTERVAL 2 DAY + INTERVAL 8 MINUTE),
  (33, 8, 3, 'Great! Also we need to confirm the AI agents we are building — currently planning 11 agents',                                                                                                                                    'text', NOW() - INTERVAL 2 DAY + INTERVAL 12 MINUTE),
  (34, 8, 7, 'Should we prioritise moderation first? Safety is critical for a student platform',                                                                                                                                               'text', NOW() - INTERVAL 2 DAY + INTERVAL 15 MINUTE),
  (35, 8, 3, '100% agree. Moderation and mood tracker will be phase 1.',                                                                                                                                                                       'text', NOW() - INTERVAL 2 DAY + INTERVAL 18 MINUTE)
ON DUPLICATE KEY UPDATE id = id;

-- FYP Hub #research (channel 7)
INSERT INTO `messages`
  (id, channel_id, sender_id, content, message_type, created_at)
VALUES
  (40, 7, 4, 'Found a great paper: "Sentiment Analysis for Low-Resource Languages using Transfer Learning" — very relevant for our Roman Urdu mood tracker',                   'text', NOW() - INTERVAL 6 DAY),
  (41, 7, 3, 'Can you share the link? Also we should look into VADER for English baseline',                                                                                    'text', NOW() - INTERVAL 6 DAY + INTERVAL 10 MINUTE),
  (42, 7, 4, 'https://arxiv.org/example — VADER is already in our plan, plus lexicon files for Roman Urdu',                                                                   'text', NOW() - INTERVAL 6 DAY + INTERVAL 15 MINUTE),
  (43, 7, 7, 'For the knowledge builder we should look into TF-IDF cosine similarity for retrieval. Simple but effective.',                                                    'text', NOW() - INTERVAL 5 DAY),
  (44, 7, 2, 'Agreed. We can add Gemini as a polish layer on top of extractive results',                                                                                       'text', NOW() - INTERVAL 5 DAY + INTERVAL 5 MINUTE)
ON DUPLICATE KEY UPDATE id = id;

-- =============================================================
-- FRIENDS
-- =============================================================
INSERT INTO `friends` (user_id, friend_id)
VALUES
  (2, 3), (3, 2),
  (2, 4), (4, 2),
  (3, 7), (7, 3),
  (5, 8), (8, 5),
  (4, 6), (6, 4)
ON DUPLICATE KEY UPDATE user_id = user_id;

-- =============================================================
-- FRIEND REQUESTS
-- =============================================================
INSERT INTO `friend_requests` (sender_id, receiver_id, status)
VALUES
  (5, 3, 'pending'),
  (6, 7, 'pending'),
  (8, 3, 'accepted'),
  (7, 8, 'rejected')
ON DUPLICATE KEY UPDATE status = VALUES(status);

-- =============================================================
-- KNOWLEDGE BASE — pre-seeded FAQs for CS Department
-- =============================================================
INSERT INTO `knowledge_base`
  (id, title, content, source, related_channel)
VALUES
  (1, 'How do I submit the OS assignment?',
     'Upload your submission to the LMS portal before the deadline shown in #assignments. File must be PDF, max 3 pages. Individual submissions only.',
     'seed', 2),
  (2, 'What is a Semaphore?',
     'A semaphore is a synchronisation primitive used to control access to shared resources. It is a counter variable that supports two atomic operations: wait (P) and signal (V). Used to solve critical section problems.',
     'seed', 2),
  (3, 'What is the difference between a process and a thread?',
     'A process is an independent program in execution with its own memory space. A thread is a lightweight unit of execution within a process that shares the same memory space. Threads are cheaper to create and communicate faster.',
     'seed', 3),
  (4, 'Recommended resources for Operating Systems?',
     'Primary: "Operating System Concepts" by Galvin (9th edition), Chapter 6 for synchronisation. YouTube: Neso Academy OS playlist. Practice: OS labs on GeeksForGeeks.',
     'seed', 2),
  (5, 'What tech stack did the FYP team decide on?',
     'The FYP team decided to use React with TypeScript on the frontend and Flask (Python) on the backend. Deployment is on Render (free tier). Database is MySQL.',
     'seed', 8),
  (6, 'What is the time complexity of quicksort?',
     'Average case: O(n log n). Worst case: O(n²) when pivot is always the smallest or largest element. Best case: O(n log n). Space complexity: O(log n) average due to recursion stack.',
     'seed', 1)
ON DUPLICATE KEY UPDATE title = VALUES(title);

-- =============================================================
-- USER MOODS — sample mood tracking data
-- =============================================================
INSERT INTO `user_moods`
  (user_id, channel_id, mood, sentiment_score, detected_emotions, message_sample)
VALUES
  (2, 1, 'positive',  0.72,  '{"joy": 0.8, "excitement": 0.5}',           'Welcome everyone! Excited to get this started'),
  (3, 1, 'positive',  0.65,  '{"gratitude": 0.7, "joy": 0.6}',            'Thanks for setting this up'),
  (4, 2, 'anxious',   -0.15, '{"anxiety": 0.55, "hope": 0.4}',            'Does anyone have a good reference? confusing'),
  (7, 1, 'negative',  -0.45, '{"anxiety": 0.6, "frustration": 0.5}',      'OSPF configuration is killing me'),
  (7, 2, 'positive',   0.58, '{"gratitude": 0.7, "joy": 0.4}',            'Shukriya Bilal! Will check that out'),
  (5, 1, 'neutral',    0.05, '{"surprise": 0.3}',                          'Oh thanks! I completely missed that'),
  (8, 1, 'positive',   0.70, '{"joy": 0.7, "excitement": 0.6}',           'Anyone up for a study session this afternoon');

-- =============================================================
-- NOTIFICATIONS — sample notifications for users
-- =============================================================
INSERT INTO `notifications`
  (user_id, type, title, body, is_read, related_id)
VALUES
  (2, 'friend_request',   'New Friend Request',          'Omar M sent you a friend request.',                      0, 5),
  (3, 'channel_message',  'New message in #assignments', 'fatima_k: Does anyone have a good reference for Monitors?', 1, 23),
  (4, 'friend_online',    'Zara Tech is online',         'Your friend zara_tech just came online.',                1, 6),
  (5, 'direct_message',   'New message from Nadia Ali',  'nadia_ali: Hey! Are you joining the study session?',     0, NULL),
  (7, 'community_invite', 'Invited to Tech Talks',       'You have been added to Tech Talks by omar_m.',           0, 3),
  (2, 'agent_notification','Wellness Check-in',          '💚 You have been very active today. Consider a short break!', 0, NULL),
  (3, 'agent_notification','New Knowledge Entry',        '📚 Knowledge Builder extracted 3 new FAQs from #meetings.',  0, NULL)
ON DUPLICATE KEY UPDATE is_read = VALUES(is_read);

-- =============================================================
-- CONVERSATION SUMMARIES — sample summary
-- =============================================================
INSERT INTO `conversation_summaries`
  (channel_id, summary, generated_by, created_by, message_count, method, key_points, time_range_start, time_range_end)
VALUES
  (8, '**FYP Meeting Summary — 13 May 2026**\n\n• Team decided on React + Flask + MySQL tech stack\n• Deployment target: Render free tier\n• Backend owned by Ahmed, Frontend by Sarah\n• 11 AI agents planned; Moderation and Mood Tracker are Phase 1 priority\n• Next milestone: working authentication by 20 May 2026',
   'summarizer_agent', 3, 6, 'gemini',
   '["tech stack decision: React+Flask","deployment: Render","auth milestone: 20 May","11 AI agents planned","phase 1: moderation + mood"]',
   NOW() - INTERVAL 2 DAY, NOW() - INTERVAL 2 DAY + INTERVAL 20 MINUTE)
ON DUPLICATE KEY UPDATE summary = VALUES(summary);

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================
-- QUICK REFERENCE
-- =============================================================
-- Accounts (all password: auroflow123):
--   sysadmin      — system admin
--   sarah_dev     — CS Dept owner, all 5 personal agents
--   ahmed_cs      — FYP Hub owner
--   fatima_k      — regular user, translator + mood
--   omar_m        — regular user, summarizer
--   zara_tech     — regular user, mood + wellness
--   bilal_r       — regular user, mood + summarizer
--   nadia_ali     — regular user, assistant + translator
--
-- Communities:
--   1 CS Department  — 6 community agents installed
--   2 FYP Hub        — 3 community agents (mod + engagement + support)
--   3 Tech Talks     — 1 community agent (mod only)
-- =============================================================
