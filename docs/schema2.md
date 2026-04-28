# AuroFlow Database Schema

**Database:** `auraflow`  
**Total Tables:** 38  
**Engine:** MySQL (InnoDB)

---

## Table of Contents

1. [Core / Authentication](#1-core--authentication)
   - [users](#users)
   - [otp_codes](#otp_codes)
   - [refresh_tokens](#refresh_tokens)
   - [token_blocklist](#token_blocklist)
2. [Community & Channels](#2-community--channels)
   - [communities](#communities)
   - [channels](#channels)
   - [community_members](#community_members)
   - [channel_members](#channel_members)
3. [Messaging](#3-messaging)
   - [messages](#messages)
   - [direct_messages](#direct_messages)
   - [attachments](#attachments)
   - [message_reactions](#message_reactions)
   - [direct_message_reactions](#direct_message_reactions)
4. [Pinned Messages](#4-pinned-messages)
   - [pinned_messages](#pinned_messages)
   - [dm_pinned_messages](#dm_pinned_messages)
5. [Social / Friends](#5-social--friends)
   - [friends](#friends)
   - [friend_requests](#friend_requests)
   - [blocked_friends](#blocked_friends)
   - [blocked_users](#blocked_users)
6. [Unread Tracking](#6-unread-tracking)
   - [channel_read_status](#channel_read_status)
   - [community_unread_status](#community_unread_status)
7. [AI Agents](#7-ai-agents)
   - [ai_agents](#ai_agents)
   - [agent_registry](#agent_registry)
   - [ai_agent_logs](#ai_agent_logs)
   - [community_agents](#community_agents)
   - [user_agents](#user_agents)
   - [knowledge_base](#knowledge_base)
   - [user_moods](#user_moods)
8. [Summaries](#8-summaries)
   - [conversation_summaries](#conversation_summaries)
   - [user_summary_schedules](#user_summary_schedules)
   - [scheduled_summaries](#scheduled_summaries)
9. [Voice](#9-voice)
   - [voice_channels](#voice_channels)
   - [voice_participants](#voice_participants)
   - [voice_sessions](#voice_sessions)
10. [Notifications & Settings](#10-notifications--settings)
    - [notifications](#notifications)
    - [push_subscriptions](#push_subscriptions)
    - [user_notification_settings](#user_notification_settings)
    - [platform_settings](#platform_settings)
11. [Admin](#11-admin)
    - [admin_actions](#admin_actions)

---

## 1. Core / Authentication

### `users`

Central user account table. All other tables reference this via FK on `id`.

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | int | NO | — | AUTO_INCREMENT |
| `email` | varchar(255) | YES | — | |
| `display_name` | varchar(255) | YES | — | |
| `username` | varchar(255) | NO | — | |
| `password` | varchar(255) | NO | — | |
| `bio` | text | YES | — | |
| `avatar_url` | varchar(500) | YES | — | |
| `status` | enum('online','idle','dnd','offline') | YES | `'offline'` | |
| `custom_status` | varchar(255) | YES | — | |
| `custom_status_emoji` | varchar(10) | YES | — | |
| `last_seen` | timestamp | YES | — | |
| `is_first_login` | tinyint(1) | NO | `1` | |
| `created_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |
| `updated_at` | timestamp | YES | `CURRENT_TIMESTAMP` | ON UPDATE CURRENT_TIMESTAMP |
| `email_verified` | tinyint(1) | NO | `0` | |
| `email_verification_token` | varchar(500) | YES | — | |
| `email_verification_expires` | timestamp | YES | — | |
| `role` | enum('user','system_admin') | NO | `'user'` | |
| `account_status` | enum('active','suspended','banned') | NO | `'active'` | |
| `account_status_reason` | text | YES | — | |
| `account_status_until` | timestamp | YES | — | |
| `account_status_by` | int | YES | — | |
| `notification_settings` | json | YES | — | |

**Keys & Constraints:**
- PRIMARY KEY: `id`
- UNIQUE: `email`, `username`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `idx_user_email` | email | No |
| `idx_username` | username | No |
| `idx_email_verification_token` | email_verification_token | No |

---

### `otp_codes`

Stores one-time passwords for email-based verification flows.

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | int | NO | — | AUTO_INCREMENT |
| `email` | varchar(255) | NO | — | |
| `otp_hash` | varchar(255) | NO | — | |
| `expires_at` | datetime | NO | — | |
| `created_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |

**Keys:**
- PRIMARY KEY: `id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `email` | email | No |

---

### `refresh_tokens`

JWT refresh token store with rotation support (token families prevent reuse attacks).

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | int | NO | — | AUTO_INCREMENT |
| `jti` | varchar(36) | NO | — | |
| `user_id` | int | NO | — | FK → users.id |
| `token_family` | varchar(36) | NO | — | |
| `device_info` | varchar(500) | YES | — | |
| `ip_address` | varchar(45) | YES | — | |
| `created_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |
| `expires_at` | timestamp | NO | — | |
| `revoked_at` | timestamp | YES | — | |
| `replaced_by` | varchar(36) | YES | — | |

**Keys:**
- PRIMARY KEY: `id`
- UNIQUE: `jti`

**Foreign Keys:**
- `user_id` → `users.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `idx_refresh_jti` | jti | No |
| `idx_refresh_user_id` | user_id | No |
| `idx_refresh_family` | token_family | No |
| `idx_refresh_expires` | expires_at | No |

---

### `token_blocklist`

Revoked JWT access tokens kept until expiry to prevent reuse.

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | int | NO | — | AUTO_INCREMENT |
| `jti` | varchar(36) | NO | — | |
| `user_id` | int | NO | — | FK → users.id |
| `revoked_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |
| `expires_at` | timestamp | NO | — | |

**Keys:**
- PRIMARY KEY: `id`
- UNIQUE: `jti`

**Foreign Keys:**
- `user_id` → `users.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `idx_blocklist_jti` | jti | No |
| `idx_blocklist_expires` | expires_at | No |
| `user_id` | user_id | No |

---

## 2. Community & Channels

### `communities`

Top-level community/server entities, similar to Discord guilds.

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | int | NO | — | AUTO_INCREMENT |
| `name` | varchar(100) | NO | — | |
| `description` | text | YES | — | |
| `icon` | char(2) | YES | `'AF'` | |
| `color` | varchar(7) | YES | `'#8B5CF6'` | |
| `logo_url` | varchar(500) | YES | — | |
| `banner_url` | varchar(500) | YES | — | |
| `created_by` | int | NO | — | FK → users.id |
| `created_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |

**Keys:**
- PRIMARY KEY: `id`

**Foreign Keys:**
- `created_by` → `users.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `idx_community_name` | name | No |
| `created_by` | created_by | No |

---

### `channels`

Text, voice, or private channels belonging to a community.

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | int | NO | — | AUTO_INCREMENT |
| `name` | varchar(100) | NO | — | |
| `description` | text | YES | — | |
| `type` | enum('text','voice','private') | YES | `'text'` | |
| `community_id` | int | NO | — | FK → communities.id |
| `created_by` | int | YES | — | FK → users.id |
| `created_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |

**Keys:**
- PRIMARY KEY: `id`

**Foreign Keys:**
- `community_id` → `communities.id`
- `created_by` → `users.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `idx_community_channels` | community_id | No |
| `idx_channel_name` | name | No |
| `created_by` | created_by | No |

---

### `community_members`

Maps users to communities with a role. Enforces a unique membership per user per community.

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | int | NO | — | AUTO_INCREMENT |
| `community_id` | int | NO | — | FK → communities.id |
| `user_id` | int | NO | — | FK → users.id |
| `role` | enum('owner','admin','member') | YES | `'member'` | |
| `violation_count` | int | YES | `0` | |
| `joined_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |

**Keys:**
- PRIMARY KEY: `id`
- UNIQUE: `(community_id, user_id)` — `unique_member`

**Foreign Keys:**
- `community_id` → `communities.id`
- `user_id` → `users.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `unique_member` | community_id, user_id | Yes |
| `user_id` | user_id | No |

---

### `channel_members`

Maps users to private channels with per-channel roles.

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | int | NO | — | AUTO_INCREMENT |
| `channel_id` | int | NO | — | FK → channels.id |
| `user_id` | int | NO | — | FK → users.id |
| `role` | enum('member','admin','moderator') | YES | `'member'` | |
| `joined_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |

**Keys:**
- PRIMARY KEY: `id`
- UNIQUE: `(channel_id, user_id)` — `unique_channel_member`

**Foreign Keys:**
- `channel_id` → `channels.id`
- `user_id` → `users.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `unique_channel_member` | channel_id, user_id | Yes |
| `user_id` | user_id | No |

---

## 3. Messaging

### `messages`

Channel messages (text, image, file, system, AI, voice, video, call types).

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | bigint | NO | — | AUTO_INCREMENT |
| `channel_id` | int | NO | — | FK → channels.id |
| `sender_id` | int | NO | — | FK → users.id |
| `content` | text | NO | — | FULLTEXT indexed |
| `message_type` | enum('text','image','file','system','ai','voice','video','call') | YES | `'text'` | |
| `reply_to` | bigint | YES | — | FK → messages.id (self-ref) |
| `created_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |
| `edited_at` | timestamp | YES | — | |
| `moderation_flagged` | tinyint(1) | YES | `0` | |
| `moderation_score` | float | YES | `0` | |
| `is_pinned` | tinyint(1) | YES | `0` | |

**Keys:**
- PRIMARY KEY: `id`

**Foreign Keys:**
- `channel_id` → `channels.id`
- `sender_id` → `users.id`
- `reply_to` → `messages.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `idx_channel_id` | channel_id | No |
| `idx_sender_id` | sender_id | No |
| `idx_msg_channel_time` | channel_id, created_at | No |
| `idx_messages_time` | created_at | No |
| `idx_messages_pinned` | channel_id, is_pinned | No |
| `reply_to` | reply_to | No |
| `ft_messages` | content | No (FULLTEXT) |

---

### `direct_messages`

Private messages between two users.

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | bigint | NO | — | AUTO_INCREMENT |
| `sender_id` | int | NO | — | FK → users.id |
| `receiver_id` | int | NO | — | FK → users.id |
| `content` | text | NO | — | FULLTEXT indexed |
| `message_type` | enum('text','image','file','ai','voice','video','call') | YES | `'text'` | |
| `reply_to` | bigint | YES | — | FK → direct_messages.id (self-ref) |
| `is_read` | tinyint(1) | YES | `0` | |
| `read_at` | timestamp | YES | — | |
| `created_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |
| `edited_at` | timestamp | YES | — | |

**Keys:**
- PRIMARY KEY: `id`

**Foreign Keys:**
- `sender_id` → `users.id`
- `receiver_id` → `users.id`
- `reply_to` → `direct_messages.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `idx_dm_pair` | sender_id, receiver_id, created_at | No |
| `idx_dm_receiver` | receiver_id, created_at | No |
| `idx_dm_reply_to` | reply_to | No |
| `idx_dm_call_type` | message_type, sender_id, receiver_id | No |
| `ft_direct_messages` | content | No (FULLTEXT) |

---

### `attachments`

File/media attachments linked to either a channel message or a direct message.

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | bigint | NO | — | AUTO_INCREMENT |
| `message_id` | bigint | YES | — | FK → messages.id |
| `direct_message_id` | bigint | YES | — | FK → direct_messages.id |
| `file_name` | varchar(255) | NO | — | |
| `file_path` | varchar(500) | NO | — | |
| `file_size` | bigint | YES | — | |
| `mime_type` | varchar(100) | YES | — | |
| `uploaded_by` | int | YES | — | FK → users.id |
| `uploaded_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |
| `duration` | float | YES | — | |

**Keys:**
- PRIMARY KEY: `id`

**Foreign Keys:**
- `message_id` → `messages.id`
- `direct_message_id` → `direct_messages.id`
- `uploaded_by` → `users.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `idx_att_message_id` | message_id | No |
| `idx_att_dm_id` | direct_message_id | No |
| `uploaded_by` | uploaded_by | No |

---

### `message_reactions`

Emoji reactions on channel messages. One user can react once per emoji per message.

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | bigint | NO | — | AUTO_INCREMENT |
| `message_id` | bigint | NO | — | FK → messages.id |
| `user_id` | int | NO | — | FK → users.id |
| `emoji` | varchar(50) | NO | — | |
| `created_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |

**Keys:**
- PRIMARY KEY: `id`
- UNIQUE: `(message_id, user_id, emoji)` — `unique_reaction`

**Foreign Keys:**
- `message_id` → `messages.id`
- `user_id` → `users.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `unique_reaction` | message_id, user_id, emoji | Yes |
| `idx_message_reactions_message` | message_id | No |
| `idx_message_reactions_user` | user_id | No |

---

### `direct_message_reactions`

Emoji reactions on direct messages. One user can react once per emoji per DM.

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | bigint | NO | — | AUTO_INCREMENT |
| `direct_message_id` | bigint | NO | — | FK → direct_messages.id |
| `user_id` | int | NO | — | FK → users.id |
| `emoji` | varchar(50) | NO | — | |
| `created_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |

**Keys:**
- PRIMARY KEY: `id`
- UNIQUE: `(direct_message_id, user_id, emoji)` — `unique_dm_reaction`

**Foreign Keys:**
- `direct_message_id` → `direct_messages.id`
- `user_id` → `users.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `unique_dm_reaction` | direct_message_id, user_id, emoji | Yes |
| `idx_dm_reactions` | direct_message_id | No |
| `idx_dm_user_reactions` | user_id | No |

---

## 4. Pinned Messages

### `pinned_messages`

Pinned messages within a community channel, optionally with an expiry.

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | int | NO | — | AUTO_INCREMENT |
| `channel_id` | int | YES | — | FK → channels.id |
| `message_id` | bigint | YES | — | FK → messages.id |
| `pinned_by` | int | YES | — | FK → users.id |
| `pinned_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |
| `expires_at` | timestamp | YES | — | |

**Keys:**
- PRIMARY KEY: `id`
- UNIQUE: `(channel_id, message_id)` — `unique_pin`

**Foreign Keys:**
- `channel_id` → `channels.id`
- `message_id` → `messages.id`
- `pinned_by` → `users.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `unique_pin` | channel_id, message_id | Yes |
| `idx_pinned_channel` | channel_id | No |
| `idx_pin_expires` | expires_at | No |
| `message_id` | message_id | No |
| `pinned_by` | pinned_by | No |

---

### `dm_pinned_messages`

Pinned messages within a DM conversation.

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | int | NO | — | AUTO_INCREMENT |
| `sender_id` | int | YES | — | FK → users.id |
| `receiver_id` | int | YES | — | FK → users.id |
| `message_id` | bigint | YES | — | FK → direct_messages.id |
| `pinned_by` | int | YES | — | FK → users.id |
| `pinned_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |
| `expires_at` | timestamp | YES | — | |

**Keys:**
- PRIMARY KEY: `id`
- UNIQUE: `message_id` — `unique_dm_pin`

**Foreign Keys:**
- `sender_id` → `users.id`
- `receiver_id` → `users.id`
- `message_id` → `direct_messages.id`
- `pinned_by` → `users.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `unique_dm_pin` | message_id | Yes |
| `idx_dm_pin_pair` | sender_id, receiver_id | No |
| `idx_dm_pin_expires` | expires_at | No |
| `receiver_id` | receiver_id | No |
| `pinned_by` | pinned_by | No |

---

## 5. Social / Friends

### `friends`

Confirmed bidirectional friendship records. Each accepted friend request generates two rows (A→B and B→A).

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | int | NO | — | AUTO_INCREMENT |
| `user_id` | int | NO | — | FK → users.id |
| `friend_id` | int | NO | — | FK → users.id |
| `created_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |

**Keys:**
- PRIMARY KEY: `id`
- UNIQUE: `(user_id, friend_id)` — `unique_friendship`

**Foreign Keys:**
- `user_id` → `users.id`
- `friend_id` → `users.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `unique_friendship` | user_id, friend_id | Yes |
| `idx_friends_user` | user_id | No |
| `idx_friends_friend` | friend_id | No |

---

### `friend_requests`

Pending, accepted, rejected, or cancelled friend requests between users.

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | int | NO | — | AUTO_INCREMENT |
| `sender_id` | int | NO | — | FK → users.id |
| `receiver_id` | int | NO | — | FK → users.id |
| `status` | enum('pending','accepted','rejected','cancelled') | YES | `'pending'` | |
| `created_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |

**Keys:**
- PRIMARY KEY: `id`
- UNIQUE: `(sender_id, receiver_id)` — `unique_request`

**Foreign Keys:**
- `sender_id` → `users.id`
- `receiver_id` → `users.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `unique_request` | sender_id, receiver_id | Yes |
| `idx_fr_sender` | sender_id | No |
| `idx_fr_receiver` | receiver_id | No |

---

### `blocked_friends`

Users who have blocked another user at the social/DM level (not community-level).

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | int | NO | — | AUTO_INCREMENT |
| `blocker_id` | int | NO | — | FK → users.id |
| `blocked_id` | int | NO | — | FK → users.id |
| `created_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |

**Keys:**
- PRIMARY KEY: `id`
- UNIQUE: `(blocker_id, blocked_id)` — `unique_block`

**Foreign Keys:**
- `blocker_id` → `users.id`
- `blocked_id` → `users.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `unique_block` | blocker_id, blocked_id | Yes |
| `idx_blocker` | blocker_id | No |
| `idx_blocked` | blocked_id | No |

---

### `blocked_users`

Community-level bans — a user blocked from participating in a specific community.

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | int | NO | — | AUTO_INCREMENT |
| `community_id` | int | NO | — | FK → communities.id |
| `user_id` | int | NO | — | FK → users.id |
| `blocked_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |
| `reason` | text | YES | — | |
| `blocked_by` | int | YES | — | FK → users.id |

**Keys:**
- PRIMARY KEY: `id`
- UNIQUE: `(community_id, user_id)` — `unique_blocked_user`

**Foreign Keys:**
- `community_id` → `communities.id`
- `user_id` → `users.id`
- `blocked_by` → `users.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `unique_blocked_user` | community_id, user_id | Yes |
| `idx_blocked_community_user` | community_id, user_id | No |
| `idx_blocked_user` | user_id | No |
| `blocked_by` | blocked_by | No |

---

## 6. Unread Tracking

### `channel_read_status`

Tracks the last-read message for each user in each channel to compute unread counts.

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | bigint | NO | — | AUTO_INCREMENT |
| `user_id` | int | NO | — | FK → users.id |
| `channel_id` | int | NO | — | FK → channels.id |
| `last_read_message_id` | bigint | YES | — | FK → messages.id |
| `last_read_at` | timestamp | YES | `CURRENT_TIMESTAMP` | ON UPDATE CURRENT_TIMESTAMP |

**Keys:**
- PRIMARY KEY: `id`
- UNIQUE: `(user_id, channel_id)` — `unique_user_channel`

**Foreign Keys:**
- `user_id` → `users.id`
- `channel_id` → `channels.id`
- `last_read_message_id` → `messages.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `unique_user_channel` | user_id, channel_id | Yes |
| `idx_channel_read_user` | user_id | No |
| `idx_channel_read_channel` | channel_id | No |
| `last_read_message_id` | last_read_message_id | No |

---

### `community_unread_status`

Aggregated unread count per user per community for the sidebar badge.

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | bigint | NO | — | AUTO_INCREMENT |
| `user_id` | int | NO | — | FK → users.id |
| `community_id` | int | NO | — | FK → communities.id |
| `total_unread` | int | YES | `0` | |
| `last_seen_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |

**Keys:**
- PRIMARY KEY: `id`
- UNIQUE: `(user_id, community_id)` — `unique_user_community`

**Foreign Keys:**
- `user_id` → `users.id`
- `community_id` → `communities.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `unique_user_community` | user_id, community_id | Yes |
| `idx_community_unread` | community_id, user_id | No |

---

## 7. AI Agents

### `ai_agents`

Registry of available AI agent instances with type and active status.

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | int | NO | — | AUTO_INCREMENT |
| `name` | varchar(100) | NO | — | UNIQUE |
| `type` | enum('mood','summarizer','translator','moderator','assistant','engagement','knowledge','wellness','context','auto_message') | YES | — | |
| `description` | text | YES | — | |
| `is_active` | tinyint(1) | YES | `1` | |
| `created_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |

**Keys:**
- PRIMARY KEY: `id`
- UNIQUE: `name`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `name` | name | Yes |
| `idx_agent_type` | type | No |

---

### `agent_registry`

Canonical definitions for each agent type including display metadata, features, and default settings (JSON).

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `agent_type` | varchar(50) | NO | — | PRIMARY KEY |
| `display_name` | varchar(100) | NO | — | |
| `description` | text | YES | — | |
| `category` | enum('community','personal') | YES | — | |
| `icon` | varchar(10) | YES | — | |
| `default_settings` | json | YES | — | |
| `features` | json | YES | — | |
| `is_active` | tinyint(1) | YES | `1` | |
| `created_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |

**Keys:**
- PRIMARY KEY: `agent_type`

---

### `ai_agent_logs`

Detailed execution log for every AI agent action — input, output, confidence, timing.

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | bigint | NO | — | AUTO_INCREMENT |
| `agent_id` | int | YES | — | FK → ai_agents.id |
| `agent_name` | varchar(100) | YES | — | |
| `user_id` | int | YES | — | FK → users.id |
| `community_id` | int | YES | — | |
| `channel_id` | int | YES | — | FK → channels.id |
| `message_id` | bigint | YES | — | FK → messages.id |
| `action_type` | varchar(100) | YES | — | |
| `input_text` | text | YES | — | |
| `input_data` | text | YES | — | |
| `output_text` | text | YES | — | |
| `output_data` | text | YES | — | |
| `confidence_score` | float | YES | — | |
| `status` | varchar(50) | YES | `'success'` | |
| `execution_time_ms` | int | YES | `0` | |
| `created_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |

**Keys:**
- PRIMARY KEY: `id`

**Foreign Keys:**
- `agent_id` → `ai_agents.id`
- `user_id` → `users.id`
- `channel_id` → `channels.id`
- `message_id` → `messages.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `agent_id` | agent_id | No |
| `channel_id` | channel_id | No |
| `message_id` | message_id | No |
| `idx_agent_logs_user` | user_id | No |
| `idx_agent_logs_community` | community_id | No |
| `idx_agent_name` | agent_name | No |

---

### `community_agents`

Controls which agents are enabled per community with per-community settings (JSON). One row per (community, agent_type) pair.

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | int | NO | — | AUTO_INCREMENT |
| `community_id` | int | NO | — | FK → communities.id |
| `agent_type` | varchar(50) | NO | — | FK → agent_registry.agent_type |
| `enabled` | tinyint(1) | YES | `1` | |
| `settings` | json | YES | — | |
| `installed_by` | int | YES | — | FK → users.id |
| `installed_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |
| `last_active` | timestamp | YES | — | |
| `usage_count` | int | YES | `0` | |

**Keys:**
- PRIMARY KEY: `id`
- UNIQUE: `(community_id, agent_type)` — `unique_community_agent`

**Foreign Keys:**
- `community_id` → `communities.id`
- `agent_type` → `agent_registry.agent_type`
- `installed_by` → `users.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `unique_community_agent` | community_id, agent_type | Yes |
| `idx_community_enabled` | community_id, enabled | No |
| `idx_agent_type` | agent_type | No |
| `installed_by` | installed_by | No |

---

### `user_agents`

Per-user agent activations with individual settings. One row per (user, agent_type).

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | int | NO | — | AUTO_INCREMENT |
| `user_id` | int | NO | — | FK → users.id |
| `agent_type` | varchar(50) | NO | — | FK → agent_registry.agent_type |
| `enabled` | tinyint(1) | YES | `1` | |
| `settings` | json | YES | — | |
| `activated_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |
| `last_used` | timestamp | YES | — | |
| `usage_count` | int | YES | `0` | |

**Keys:**
- PRIMARY KEY: `id`
- UNIQUE: `(user_id, agent_type)` — `unique_user_agent`

**Foreign Keys:**
- `user_id` → `users.id`
- `agent_type` → `agent_registry.agent_type`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `unique_user_agent` | user_id, agent_type | Yes |
| `idx_user_enabled` | user_id, enabled | No |
| `fk_ua_agent_type` | agent_type | No |

---

### `knowledge_base`

Knowledge articles created or extracted by the Knowledge Builder Agent.

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | int | NO | — | AUTO_INCREMENT |
| `title` | varchar(500) | NO | — | |
| `content` | text | NO | — | |
| `source` | varchar(50) | YES | `'agent'` | |
| `related_channel` | int | YES | — | FK → channels.id |
| `created_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |
| `updated_at` | timestamp | YES | `CURRENT_TIMESTAMP` | ON UPDATE CURRENT_TIMESTAMP |

**Keys:**
- PRIMARY KEY: `id`

**Foreign Keys:**
- `related_channel` → `channels.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `idx_channel` | related_channel | No |
| `idx_created` | created_at | No |
| `idx_search` | title, content | No |

---

### `user_moods`

Mood/sentiment readings captured by the Mood Tracker Agent per user per channel message batch.

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | bigint | NO | — | AUTO_INCREMENT |
| `user_id` | int | NO | — | FK → users.id |
| `channel_id` | int | YES | — | FK → channels.id |
| `mood` | varchar(50) | NO | — | |
| `sentiment_score` | float | YES | — | |
| `detected_emotions` | json | YES | — | |
| `message_sample` | text | YES | — | |
| `created_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |

**Keys:**
- PRIMARY KEY: `id`

**Foreign Keys:**
- `user_id` → `users.id`
- `channel_id` → `channels.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `idx_user_mood` | user_id, created_at | No |
| `idx_channel_mood` | channel_id, created_at | No |

---

## 8. Summaries

### `conversation_summaries`

On-demand and scheduled summaries of channel conversations, generated by the Summarizer Agent.

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | int | NO | — | AUTO_INCREMENT |
| `channel_id` | int | NO | — | FK → channels.id |
| `summary` | text | NO | — | |
| `generated_by` | varchar(50) | YES | `'summarizer_agent'` | |
| `created_by` | int | YES | — | FK → users.id |
| `created_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |
| `message_count` | int | YES | `0` | |
| `method` | varchar(50) | YES | `'extractive'` | |
| `participants` | text | YES | — | |
| `time_range_start` | timestamp | YES | — | |
| `time_range_end` | timestamp | YES | — | |
| `key_points` | text | YES | — | |

**Keys:**
- PRIMARY KEY: `id`

**Foreign Keys:**
- `channel_id` → `channels.id`
- `created_by` → `users.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `channel_id` | channel_id | No |
| `idx_user_summaries` | created_by, created_at | No |

---

### `user_summary_schedules`

User-configured schedules for automated channel summaries to be delivered at a set time.

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | int | NO | — | AUTO_INCREMENT |
| `user_id` | int | NO | — | FK → users.id |
| `channel_id` | int | NO | — | FK → channels.id |
| `community_id` | int | NO | — | |
| `schedule_time` | time | NO | — | |
| `timezone` | varchar(50) | YES | `'UTC'` | |
| `is_active` | tinyint(1) | YES | `1` | |
| `last_triggered_at` | datetime | YES | — | |
| `created_at` | datetime | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |
| `updated_at` | datetime | YES | `CURRENT_TIMESTAMP` | ON UPDATE CURRENT_TIMESTAMP |

**Keys:**
- PRIMARY KEY: `id`
- UNIQUE: `(user_id, channel_id)` — `uq_user_channel`

**Foreign Keys:**
- `user_id` → `users.id`
- `channel_id` → `channels.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `uq_user_channel` | user_id, channel_id | Yes |
| `fk_uss_channel` | channel_id | No |

---

### `scheduled_summaries`

Generated summary payloads queued for delivery to users based on their schedules.

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | int | NO | — | AUTO_INCREMENT |
| `schedule_id` | int | NO | — | FK → user_summary_schedules.id |
| `user_id` | int | NO | — | FK → users.id |
| `channel_id` | int | NO | — | FK → channels.id |
| `community_id` | int | NO | — | |
| `content` | text | NO | — | |
| `method` | varchar(50) | YES | `'extractive'` | |
| `message_count` | int | YES | `0` | |
| `is_delivered` | tinyint(1) | YES | `0` | |
| `created_at` | datetime | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |

**Keys:**
- PRIMARY KEY: `id`

**Foreign Keys:**
- `schedule_id` → `user_summary_schedules.id`
- `user_id` → `users.id`
- `channel_id` → `channels.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `idx_schedule_triggered` | schedule_id, created_at | No |
| `idx_user_delivered` | user_id, is_delivered | No |
| `fk_ss_channel` | channel_id | No |

---

## 9. Voice

### `voice_channels`

Active voice room metadata linked to a channel entry.

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | int | NO | — | AUTO_INCREMENT |
| `name` | varchar(100) | NO | — | |
| `channel_id` | int | YES | — | FK → channels.id |
| `is_active` | tinyint(1) | YES | `0` | |
| `created_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |

**Keys:**
- PRIMARY KEY: `id`

**Foreign Keys:**
- `channel_id` → `channels.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `channel_id` | channel_id | No |

---

### `voice_participants`

Records users currently or previously in a voice channel session (join/leave timestamps).

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | int | NO | — | AUTO_INCREMENT |
| `voice_channel_id` | int | YES | — | FK → voice_channels.id |
| `user_id` | int | YES | — | FK → users.id |
| `joined_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |
| `left_at` | timestamp | YES | — | |

**Keys:**
- PRIMARY KEY: `id`

**Foreign Keys:**
- `voice_channel_id` → `voice_channels.id`
- `user_id` → `users.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `voice_channel_id` | voice_channel_id | No |
| `user_id` | user_id | No |

---

### `voice_sessions`

Active voice session state for each user in a channel (mute, deafen, activity).

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | int | NO | — | AUTO_INCREMENT |
| `channel_id` | int | NO | — | FK → channels.id |
| `user_id` | int | NO | — | FK → users.id |
| `is_muted` | tinyint(1) | YES | `0` | |
| `is_deaf` | tinyint(1) | YES | `0` | |
| `joined_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |
| `last_activity` | timestamp | YES | `CURRENT_TIMESTAMP` | ON UPDATE CURRENT_TIMESTAMP |

**Keys:**
- PRIMARY KEY: `id`
- UNIQUE: `(channel_id, user_id)` — `unique_voice_session`

**Foreign Keys:**
- `channel_id` → `channels.id`
- `user_id` → `users.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `unique_voice_session` | channel_id, user_id | Yes |
| `idx_channel_id` | channel_id | No |
| `idx_user_id` | user_id | No |
| `idx_joined_at` | joined_at | No |

---

## 10. Notifications & Settings

### `notifications`

In-app notifications for users (DMs, mentions, friend requests, agent alerts, etc.).

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | bigint | NO | — | AUTO_INCREMENT |
| `user_id` | int | NO | — | FK → users.id |
| `type` | varchar(30) | YES | — | |
| `title` | varchar(255) | NO | — | |
| `body` | text | YES | — | |
| `icon_url` | varchar(500) | YES | — | |
| `link` | varchar(500) | YES | — | |
| `related_id` | bigint | YES | — | |
| `is_read` | tinyint(1) | YES | `0` | |
| `created_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |

**Keys:**
- PRIMARY KEY: `id`

**Foreign Keys:**
- `user_id` → `users.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `idx_notif_user_read` | user_id, is_read | No |
| `idx_notif_user_created` | user_id, created_at | No |

---

### `push_subscriptions`

Web Push API subscriptions for browser push notifications.

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | int | NO | — | AUTO_INCREMENT |
| `user_id` | int | NO | — | FK → users.id |
| `endpoint` | varchar(500) | NO | — | UNIQUE |
| `p256dh_key` | varchar(200) | NO | — | |
| `auth_key` | varchar(200) | NO | — | |
| `created_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |

**Keys:**
- PRIMARY KEY: `id`
- UNIQUE: `endpoint` — `uq_push_endpoint`

**Foreign Keys:**
- `user_id` → `users.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `uq_push_endpoint` | endpoint | Yes |
| `user_id` | user_id | No |

---

### `user_notification_settings`

Per-user preferences for notification channels (in-app, email) and email batch intervals.

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `user_id` | int | NO | — | PK + FK → users.id |
| `notify_direct_messages` | tinyint(1) | NO | `1` | |
| `notify_channel_messages` | tinyint(1) | NO | `1` | |
| `notify_friend_requests` | tinyint(1) | NO | `1` | |
| `notify_friend_online` | tinyint(1) | NO | `0` | |
| `notification_sounds` | tinyint(1) | NO | `1` | |
| `email_alerts_enabled` | tinyint(1) | NO | `1` | |
| `email_dms_and_calls` | tinyint(1) | NO | `1` | |
| `email_community_messages` | tinyint(1) | NO | `0` | |
| `email_agent_notifications` | tinyint(1) | NO | `1` | |
| `email_agent_summaries` | tinyint(1) | NO | `1` | |
| `email_batch_interval_minutes` | int | NO | `5` | |
| `created_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |
| `updated_at` | timestamp | YES | `CURRENT_TIMESTAMP` | ON UPDATE CURRENT_TIMESTAMP |

**Keys:**
- PRIMARY KEY: `user_id`

**Foreign Keys:**
- `user_id` → `users.id`

---

### `platform_settings`

Key-value store for global platform configuration (admin-controlled).

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `setting_key` | varchar(100) | NO | — | PRIMARY KEY |
| `setting_value` | text | NO | — | |
| `updated_at` | timestamp | YES | `CURRENT_TIMESTAMP` | ON UPDATE CURRENT_TIMESTAMP |

**Keys:**
- PRIMARY KEY: `setting_key`

---

## 11. Admin

### `admin_actions`

Audit log of system administrator actions on user accounts (warn, suspend, ban, role changes, etc.).

| Column | Type | Nullable | Default | Extra |
|--------|------|----------|---------|-------|
| `id` | int | NO | — | AUTO_INCREMENT |
| `admin_id` | int | NO | — | FK → users.id |
| `target_user_id` | int | NO | — | FK → users.id |
| `action_type` | enum('warn','suspend','ban','unsuspend','unban','role_change') | NO | — | |
| `reason` | text | YES | — | |
| `details` | json | YES | — | |
| `created_at` | timestamp | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED |

**Keys:**
- PRIMARY KEY: `id`

**Foreign Keys:**
- `admin_id` → `users.id`
- `target_user_id` → `users.id`

**Indexes:**
| Index | Columns | Unique |
|-------|---------|--------|
| `idx_admin` | admin_id | No |
| `idx_target_user` | target_user_id | No |
| `idx_created` | created_at | No |

---

## Entity Relationship Summary

```
users ──< friends (user_id, friend_id)
users ──< friend_requests (sender_id, receiver_id)
users ──< blocked_friends (blocker_id, blocked_id)
users ──< community_members >── communities
users ──< channel_members >── channels >── communities
users ──< messages >── channels
users ──< direct_messages (sender_id, receiver_id)
users ──< message_reactions >── messages
users ──< direct_message_reactions >── direct_messages
users ──< attachments
users ──< channel_read_status >── channels
users ──< community_unread_status >── communities
users ──< user_agents >── agent_registry
users ──< user_moods
users ──< user_notification_settings
users ──< user_summary_schedules >── channels
users ──< scheduled_summaries
users ──< notifications
users ──< push_subscriptions
users ──< refresh_tokens
users ──< token_blocklist
users ──< admin_actions (admin_id, target_user_id)
communities ──< blocked_users (community_id, user_id)
communities ──< community_agents >── agent_registry
channels ──< voice_channels ──< voice_participants
channels ──< voice_sessions
channels ──< pinned_messages
channels ──< conversation_summaries
channels ──< knowledge_base
ai_agents ──< ai_agent_logs
messages ──< pinned_messages
direct_messages ──< dm_pinned_messages
user_summary_schedules ──< scheduled_summaries
```
