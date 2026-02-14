-- Performance indexes for frequently-queried columns
-- Run: mysql -u root -p auraflow < migrations/add_performance_indexes.sql

-- direct_messages.reply_to  (used in LEFT JOIN for reply previews)
CREATE INDEX IF NOT EXISTS idx_dm_reply_to ON direct_messages(reply_to);

-- attachments.message_id  (used in LEFT JOIN when fetching channel messages)
CREATE INDEX IF NOT EXISTS idx_att_message_id ON attachments(message_id);

-- attachments.direct_message_id  (used in LEFT JOIN when fetching DMs)
CREATE INDEX IF NOT EXISTS idx_att_dm_id ON attachments(direct_message_id);

-- friend_requests lookup by sender or receiver
CREATE INDEX IF NOT EXISTS idx_fr_sender ON friend_requests(sender_id);
CREATE INDEX IF NOT EXISTS idx_fr_receiver ON friend_requests(receiver_id);

-- direct_messages by receiver alone (composite idx_dm_pair starts with sender_id)
CREATE INDEX IF NOT EXISTS idx_dm_receiver ON direct_messages(receiver_id, created_at DESC);

-- messages.channel_id + created_at for pagination queries
CREATE INDEX IF NOT EXISTS idx_msg_channel_time ON messages(channel_id, created_at DESC);

-- blocked_users lookup by community_id + user_id
CREATE INDEX IF NOT EXISTS idx_blocked_community_user ON blocked_users(community_id, user_id);
