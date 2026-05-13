-- ===================================================================
-- Add the 4 remaining AI agents to agent_registry
--   1. assistant     (personal)
--   2. auto_message  (community)
--   3. support       (community)
--   4. translator    (personal)
-- Idempotent: safe to re-run.
-- ===================================================================

INSERT INTO agent_registry
    (agent_type, display_name, description, category, icon, default_settings, features)
VALUES
('assistant', 'AI Assistant',
 'Friendly Q&A chatbot for quick answers, jokes, and motivation. Powered by Gemini with lexicon fallback.',
 'personal', '🤖',
 '{"reply_style": "concise", "use_gemini": true, "max_history": 5}',
 '["Q&A in chat with /ask command", "Jokes & motivational quotes", "Roman Urdu friendly", "Gemini-powered responses with offline fallback", "Per-user usage analytics"]'),

('auto_message', 'Auto Message Generator',
 'Welcomes new members and suggests quick replies in chat to keep conversations flowing.',
 'community', '✉️',
 '{"welcome_enabled": true, "quick_replies_enabled": true, "post_in_default_channel": true}',
 '["Auto welcome posts on community join", "3-tap quick-reply suggestions above input", "Customizable templates", "Intent-aware suggestions (greeting/help/thanks)", "Posts as AI bot in default channel"]'),

('support', 'Context-Aware Support',
 'Answers questions using your community knowledge base via TF-IDF retrieval + optional Gemini polish.',
 'community', '🎓',
 '{"min_score": 0.12, "use_gemini_polish": true, "max_docs": 500}',
 '["TF-IDF retrieval over knowledge base", "Cited sources with each answer", "Gemini-polished natural-language replies", "Auto-rebuilds index every 5 min", "/support slash command"]'),

('translator', 'Translator',
 'Translate any chat message to your preferred language with one click. Supports 14+ languages.',
 'personal', '🌐',
 '{"default_target": "en", "favorite_languages": ["en","ur","es"], "auto_detect": true}',
 '["14+ supported languages", "One-click message translation", "Auto language detection", "Roman Urdu heuristics", "Cached results for repeat translations", "/translate slash command"]')
ON DUPLICATE KEY UPDATE
    display_name = VALUES(display_name),
    description = VALUES(description),
    category = VALUES(category),
    icon = VALUES(icon),
    default_settings = VALUES(default_settings),
    features = VALUES(features);
