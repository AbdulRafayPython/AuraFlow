# Auraflow Database Schema and Models Summary

**Last Updated:** November 30, 2025  
**Frontend Workspace:** `d:\desktop extras\Auraflow\Frontend`  
**Backend Workspace:** `d:\desktop extras\Auraflow\Backend` (referenced but outside current scope)

## Overview

The Auraflow application is a real-time messaging and community platform built with a TypeScript/React frontend and Python backend. The database schema is accessed through REST APIs and real-time WebSocket connections.

---

## Database Tables and Models

Based on the frontend TypeScript types and API integration, the backend database contains the following tables:

### 1. **users** Table

Stores user account information and authentication data.

**Columns:**
- `id` (INTEGER, PRIMARY KEY)
- `username` (VARCHAR, UNIQUE)
- `email` (VARCHAR, UNIQUE)
- `password_hash` (VARCHAR) - stored on backend
- `display_name` (VARCHAR, NULLABLE)
- `avatar_url` (VARCHAR, NULLABLE)
- `status` (ENUM: 'online', 'idle', 'dnd', 'offline') - default: 'offline'
- `custom_status` (VARCHAR, NULLABLE)
- `last_seen` (TIMESTAMP, NULLABLE)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

**TypeScript Interface:**
```typescript
interface User {
  id: number;
  username: string;
  email: string;
  display_name?: string;
  avatar_url?: string;
}

interface UserStatus {
  username: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
}
```

---

### 2. **communities** Table

Stores community/server information.

**Columns:**
- `id` (INTEGER, PRIMARY KEY)
- `name` (VARCHAR)
- `description` (TEXT, NULLABLE)
- `icon` (VARCHAR, NULLABLE)
- `banner_url` (VARCHAR, NULLABLE)
- `color` (VARCHAR, NULLABLE)
- `display_name` (VARCHAR, NULLABLE)
- `bio` (TEXT, NULLABLE)
- `creator_id` (INTEGER, FOREIGN KEY → users.id)
- `member_count` (INTEGER) - denormalized for performance
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

**TypeScript Interface:**
```typescript
interface Community {
  id: number;
  name: string;
  icon?: string;
  color?: string;
  banner_url?: string;
  description?: string;
  display_name?: string;
  bio?: string;
  role?: 'owner' | 'admin' | 'member';
  member_count?: number;
  created_at?: string;
  creator?: {
    username: string;
    display_name: string;
    avatar_url?: string;
  };
}
```

---

### 3. **community_members** Table

Stores membership information for users in communities (many-to-many relationship).

**Columns:**
- `id` (INTEGER, PRIMARY KEY)
- `community_id` (INTEGER, FOREIGN KEY → communities.id)
- `user_id` (INTEGER, FOREIGN KEY → users.id)
- `role` (ENUM: 'owner', 'admin', 'member') - default: 'member'
- `joined_at` (TIMESTAMP)
- `UNIQUE(community_id, user_id)`

**Related TypeScript Interface:**
```typescript
interface CommunityMember extends User {
  role: 'owner' | 'admin' | 'member';
}
```

---

### 4. **channels** Table

Stores channel information within communities.

**Columns:**
- `id` (INTEGER, PRIMARY KEY)
- `name` (VARCHAR)
- `type` (ENUM: 'text', 'voice', 'private', 'announcement') - default: 'text'
- `description` (TEXT, NULLABLE)
- `community_id` (INTEGER, FOREIGN KEY → communities.id)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

**TypeScript Interface:**
```typescript
interface Channel {
  id: number;
  name: string;
  type: 'text' | 'voice' | 'private' | 'announcement';
  description?: string;
  created_at: string;
  community_id?: number;
}
```

---

### 5. **messages** Table

Stores all messages sent in channels.

**Columns:**
- `id` (INTEGER, PRIMARY KEY)
- `channel_id` (INTEGER, FOREIGN KEY → channels.id)
- `sender_id` (INTEGER, FOREIGN KEY → users.id)
- `content` (TEXT)
- `message_type` (ENUM: 'text', 'image', 'file', 'system', 'ai') - default: 'text'
- `created_at` (TIMESTAMP)
- `edited_at` (TIMESTAMP, NULLABLE)
- `reply_to` (INTEGER, NULLABLE, FOREIGN KEY → messages.id) - for threaded messages
- `author` (VARCHAR) - cached username for display
- `avatar_url` (VARCHAR, NULLABLE) - cached avatar for display
- `updated_at` (TIMESTAMP)

**TypeScript Interface:**
```typescript
interface Message {
  id: number;
  channel_id: number;
  sender_id: number;
  content: string;
  message_type: 'text' | 'image' | 'file' | 'system' | 'ai';
  created_at: string;
  author: string;
  avatar_url?: string;
  edited_at?: string | null;
  reply_to?: number | null;
}

interface SendMessageData {
  channel_id: number;
  content: string;
  message_type?: 'text' | 'image' | 'file';
  reply_to?: number;
}
```

---

### 6. **direct_messages** Table

Stores direct/private messages between users.

**Columns:**
- `id` (INTEGER, PRIMARY KEY)
- `sender_id` (INTEGER, FOREIGN KEY → users.id)
- `receiver_id` (INTEGER, FOREIGN KEY → users.id)
- `content` (TEXT)
- `message_type` (ENUM: 'text', 'image', 'file', 'ai') - default: 'text'
- `is_read` (BOOLEAN) - default: false
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

**TypeScript Interface:**
```typescript
interface DirectMessage {
  id: number;
  sender_id: number;
  receiver_id: number;
  content: string;
  message_type: 'text' | 'image' | 'file' | 'ai';
  created_at: string;
  is_read: boolean;
}
```

---

### 7. **friends** Table

Stores friendships/connections between users (many-to-many relationship).

**Columns:**
- `id` (INTEGER, PRIMARY KEY)
- `user_id_1` (INTEGER, FOREIGN KEY → users.id)
- `user_id_2` (INTEGER, FOREIGN KEY → users.id)
- `created_at` (TIMESTAMP)
- `UNIQUE(user_id_1, user_id_2)` - normalized so smaller ID is always first

**TypeScript Interface:**
```typescript
interface Friend {
  id: number;
  username: string;
  display_name: string;
  avatar?: string;
  avatar_url?: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  custom_status?: string;
  last_seen?: string;
}
```

---

### 8. **friend_requests** Table

Stores pending and historical friend requests.

**Columns:**
- `id` (INTEGER, PRIMARY KEY)
- `sender_id` (INTEGER, FOREIGN KEY → users.id)
- `receiver_id` (INTEGER, FOREIGN KEY → users.id)
- `status` (ENUM: 'pending', 'accepted', 'rejected', 'cancelled') - default: 'pending'
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

**TypeScript Interface:**
```typescript
interface FriendRequest {
  id: number;
  sender_id: number;
  receiver_id: number;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  created_at: string;
  sender?: {
    username: string;
    display_name: string;
    avatar_url: string;
  };
}
```

---

### 9. **blocked_users** Table

Stores user block relationships.

**Columns:**
- `id` (INTEGER, PRIMARY KEY)
- `user_id` (INTEGER, FOREIGN KEY → users.id)
- `blocked_user_id` (INTEGER, FOREIGN KEY → users.id)
- `created_at` (TIMESTAMP)
- `UNIQUE(user_id, blocked_user_id)`

---

### 10. **user_typing** Table (Optional/Transient)

Tracks who is currently typing in a channel (may be cached/memory-based rather than persistent).

**Columns:**
- `id` (INTEGER, PRIMARY KEY)
- `user_id` (INTEGER, FOREIGN KEY → users.id)
- `channel_id` (INTEGER, FOREIGN KEY → channels.id)
- `is_typing` (BOOLEAN)
- `timestamp` (TIMESTAMP)

**TypeScript Interface:**
```typescript
interface TypingIndicator {
  username: string;
  channel_id: number;
  is_typing: boolean;
}

interface TypingUser {
  username: string;
  timestamp: number;
}
```

---

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create new user account
- `POST /api/auth/login` - Authenticate user and get JWT token
- `POST /api/auth/logout` - Logout user

### Communities
- `GET /api/channels/communities` - List user's communities
- `POST /api/channels/communities` - Create new community
- `DELETE /api/channels/communities/{id}` - Delete community
- `POST /api/channels/communities/{id}/join` - Join community
- `POST /api/channels/communities/{id}/leave` - Leave community
- `GET /api/channels/communities/discover` - Discover public communities
- `GET /api/channels/community/members` - Get community members
- `POST /api/channels/community/add-member` - Add member to community

### Channels
- `GET /api/channels/communities/{id}/channels` - Get community's channels
- `POST /api/channels/communities/{id}/channels` - Create channel in community
- `DELETE /api/channels/{id}` - Delete channel
- `POST /api/channels/{id}/join` - Join channel
- `POST /api/channels/{id}/leave` - Leave channel

### Messages
- `GET /api/messages/channel/{id}` - Get channel messages (paginated)
- `POST /api/messages/send` - Send message to channel
- `DELETE /api/messages/{id}` - Delete message
- `PUT /api/messages/{id}` - Edit message
- `POST /api/messages/read` - Mark messages as read
- `GET /api/messages/direct/{id}` - Get direct messages with user
- `POST /api/messages/direct/send` - Send direct message

### Friends
- `GET /api/channels/friends` - Get user's friends
- `POST /api/friends/request` - Send friend request
- `GET /api/friends/requests/pending` - Get pending friend requests
- `POST /api/friends/request/{id}/accept` - Accept friend request
- `POST /api/friends/request/{id}/reject` - Reject friend request
- `DELETE /api/friends/{id}` - Remove friend
- `POST /api/friends/block/{id}` - Block user
- `POST /api/friends/unblock/{id}` - Unblock user

### Search
- `GET /api/channels/users/search` - Search users by username/display name

---

## WebSocket Events (Socket.IO)

### User Events
- `user_status` - User status change (online, idle, dnd, offline)

### Channel Events
- `channel_created` - New channel created
- `channel_updated` - Channel edited
- `channel_deleted` - Channel deleted
- `join_channel` - User joins channel
- `leave_channel` - User leaves channel

### Message Events
- `message_sent` - Message posted in channel
- `message_edited` - Message edited
- `message_deleted` - Message deleted
- `message_read` - Message marked as read
- `direct_message_sent` - Direct message sent
- `typing` - User typing indicator

### Community Events
- `community_created` - Community created
- `community_updated` - Community updated
- `community_deleted` - Community deleted
- `community_member_added` - User added to community
- `community_member_left` - User left community

---

## Data Relationships

```
users (1) ──── (∞) community_members (∞) ──── (1) communities
 │
 ├── (1) ──── (∞) messages
 │
 ├── (1) ──── (∞) direct_messages (as sender)
 │
 ├── (1) ──── (∞) direct_messages (as receiver)
 │
 ├── (1) ──── (∞) friend_requests (as sender)
 │
 ├── (1) ──── (∞) friend_requests (as receiver)
 │
 └── (∞) ──── (∞) friends (via friends table)

communities (1) ──── (∞) channels
                │
                └── (∞) community_members

channels (1) ──── (∞) messages

messages (1) ──── (0..1) messages (reply_to)
```

---

## Frontend Type System

All frontend types are centralized in `src/types/index.ts` and serve as the single source of truth:

- **Message Types** - Channel and direct messages
- **User Types** - User, UserStatus, Friend, FriendRequest
- **Community Types** - Community, Channel, CommunityMember
- **Data Transfer Types** - SendMessageData, CreateCommunityPayload, TypingIndicator

---

## Database Access Pattern

1. **Frontend** sends HTTP requests to backend API (REST)
2. **Backend** executes SQL queries against the database
3. **Backend** returns normalized JSON responses
4. **Frontend** stores data in React context/component state
5. **WebSocket** provides real-time updates for live events
6. **Frontend** updates state when socket events are received

**No direct database access** from frontend - all data flows through the backend API.

---

## Key Notes

- **Status Updates**: User status is updated in real-time via `user_status` WebSocket events
- **Message Pagination**: Channel messages are fetched with `limit` and `offset` parameters
- **Caching**: Author name and avatar are cached in the messages table for performance
- **Authentication**: JWT tokens are used for API authentication (Bearer token in header)
- **Thread Support**: Messages support `reply_to` field for threaded conversations
- **Message Types**: Support for text, image, file, system, and AI-generated messages
- **Typing Indicators**: Transient data indicating who is currently typing

---

## API Base URL

```
http://localhost:5000/api/
```

All endpoints are relative to this base URL.

---

## Development Notes

- Backend code: `d:\desktop extras\Auraflow\Backend\`
- Backend socket handlers: `routes/sockets.py`
- Frontend API client: `src/services/appService.ts` (base HTTP client)
- Service layer: `src/services/*.ts` (specific feature services)
- Context providers: `src/contexts/*.tsx` (state management)
- Real-time provider: `RealtimeContext.tsx` (WebSocket integration)

---

**Document End**
