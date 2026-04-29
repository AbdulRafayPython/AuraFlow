-- ============================================================================
-- Moderation Agent V2 — Performance Indexes
-- ============================================================================
-- Supports the retroactive_scan() query pattern:
--   SELECT … FROM messages WHERE channel_id = ? AND created_at >= ? AND message_type = ?
--   AND id NOT IN (SELECT message_id FROM ai_agent_logs WHERE action_type='moderation' AND channel_id = ?)
--
-- Run: Get-Content … | mysql -u root -p<pass> AuraFlow
-- NEW — v2

-- Index 1: messages — retroactive scan filters on (channel_id, message_type, created_at)
SET @i1 = (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'messages'
      AND INDEX_NAME   = 'idx_msg_channel_type_time'
);
SET @s1 = IF(@i1 = 0,
    'CREATE INDEX idx_msg_channel_type_time ON messages (channel_id, message_type, created_at ASC)',
    'SELECT 1'
);
PREPARE _s1 FROM @s1; EXECUTE _s1; DEALLOCATE PREPARE _s1;

-- Index 2: ai_agent_logs — NOT IN subquery looks up (action_type, channel_id, message_id)
SET @i2 = (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'ai_agent_logs'
      AND INDEX_NAME   = 'idx_agent_logs_mod_channel_msg'
);
SET @s2 = IF(@i2 = 0,
    'CREATE INDEX idx_agent_logs_mod_channel_msg ON ai_agent_logs (action_type, channel_id, message_id)',
    'SELECT 1'
);
PREPARE _s2 FROM @s2; EXECUTE _s2; DEALLOCATE PREPARE _s2;

