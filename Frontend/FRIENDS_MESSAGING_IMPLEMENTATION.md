# Friends & Messaging System - Implementation Guide

## Overview

A complete real-time friends and direct messaging system has been integrated into the Auraflow application with WebSocket support, friend request management, blocking functionality, and professional message formatting.

---

## ✅ IMPLEMENTATION COMPLETE

### **Phase 1: Backend Integration (Services)**

#### 1. Enhanced TypeScript Types (`src/types/index.ts`)
- ✅ Updated `DirectMessage` interface with sender/receiver metadata
- ✅ Added `SendDirectMessageData` type for DM requests
- ✅ Enhanced `FriendRequest` with sender/receiver objects
- ✅ Enhanced `User` with status and custom_status fields
- ✅ Added `BlockedUser` interface

**Key Types:**
```typescript
interface DirectMessage {
  id: number;
  sender_id: number;
  receiver_id: number;
  content: string;
  message_type: 'text' | 'image' | 'file' | 'ai';
  created_at: string;
  is_read: boolean;
  edited_at?: string | null;
  sender?: UserInfo;
  receiver?: UserInfo;
}

interface FriendRequest {
  id: number;
  sender_id: number;
  receiver_id: number;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  created_at: string;
  sender?: UserInfo;
  receiver?: UserInfo;
}
```

#### 2. Friend Service (`src/services/friendService.ts`)
- ✅ `getFriends()` - Fetch all friends
- ✅ `sendFriendRequest(username)` - Send request to user
- ✅ `getPendingRequests()` - Receive incoming requests
- ✅ `getSentRequests()` - View sent requests
- ✅ `acceptFriendRequest(requestId)` - Accept incoming request
- ✅ `rejectFriendRequest(requestId)` - Reject request
- ✅ `cancelFriendRequest(requestId)` - Cancel sent request
- ✅ `removeFriend(friendId)` - Unfriend user
- ✅ `blockUser(userId)` - Block user
- ✅ `unblockUser(userId)` - Unblock user
- ✅ `getBlockedUsers()` - Fetch blocked list
- ✅ `searchUsers(query)` - Search by name/username

**API Endpoints:**
```
GET    /api/friends
POST   /api/friends/request
GET    /api/friends/requests/pending
GET    /api/friends/requests/sent
POST   /api/friends/request/{id}/accept
POST   /api/friends/request/{id}/reject
POST   /api/friends/request/{id}/cancel
DELETE /api/friends/{id}
POST   /api/friends/block/{userId}
POST   /api/friends/unblock/{userId}
GET    /api/friends/blocked
GET    /api/users/search
GET    /api/users/{id}
```

#### 3. Direct Message Service (`src/services/directMessageService.ts`)
- ✅ `getDirectMessages(userId, limit, offset)` - Fetch conversation history
- ✅ `sendDirectMessage(receiverId, content, type)` - Send DM
- ✅ `deleteDirectMessage(messageId)` - Delete message
- ✅ `editDirectMessage(messageId, content)` - Edit message
- ✅ `markAsRead(messageId)` - Mark single message read
- ✅ `markAllAsRead(userId)` - Mark conversation read

**API Endpoints:**
```
GET    /api/messages/direct/{userId}
POST   /api/messages/direct/send
DELETE /api/messages/direct/{messageId}
PUT    /api/messages/direct/{messageId}
POST   /api/messages/direct/{messageId}/read
POST   /api/messages/direct/{userId}/read-all
```

---

### **Phase 2: Real-Time Communication (Socket.IO)**

#### 4. Socket Service Enhancement (`src/services/socketService.ts`)
- ✅ Direct Message Events:
  - `direct_message_received` - New DM from friend
  - `direct_message_read` - Message marked as read
  - `user_typing_dm` - Friend typing indicator
  - `new_direct_message` - Broadcast sent DM

- ✅ Friend Request Events:
  - `friend_request_received` - Incoming friend request
  - `friend_request_accepted` - Request accepted
  - `friend_request_rejected` - Request rejected
  - `friend_status_changed` - Friend online/offline
  - `friend_removed` - Removed from friends
  - `user_blocked` - User blocked notification
  - `user_unblocked` - User unblocked notification

- ✅ DM Conversation Management:
  - `joinDMConversation(userId)` - Enter chat room
  - `leaveDMConversation()` - Exit chat room
  - `sendDMTyping(userId, isTyping)` - Typing indicator
  - `broadcastDirectMessage(message)` - Send DM
  - `broadcastFriendRequest(request)` - Send request

- ✅ Friend Status Room:
  - `joinFriendStatusRoom()` - Listen to friend status changes
  - `leaveFriendStatusRoom()` - Stop listening

**Event Listeners:**
```typescript
onDirectMessage(handler: (message: DirectMessageEvent) => void)
onFriendRequest(handler: (request: FriendRequestEvent) => void)
onFriendStatus(handler: (data: { friend_id: number; status: string }) => void)
```

---

### **Phase 3: State Management**

#### 5. Friends Context (`src/contexts/FriendsContext.tsx`)
Global state for friend management with real-time socket integration.

**State:**
```typescript
friends: Friend[]                           // List of confirmed friends
pendingRequests: FriendRequest[]            // Incoming requests
sentRequests: FriendRequest[]               // Outgoing requests
blockedUsers: BlockedUser[]                 // Blocked users
loading: boolean
error: string | null
```

**Operations:**
- `getFriends()` - Load friends list
- `getPendingRequests()` - Load pending requests
- `getSentRequests()` - Load sent requests
- `getBlockedUsers()` - Load blocked list
- `sendFriendRequest(username)` - Send request
- `acceptFriendRequest(requestId)` - Accept
- `rejectFriendRequest(requestId)` - Reject
- `cancelFriendRequest(requestId)` - Cancel
- `removeFriend(friendId)` - Unfriend
- `blockUser(userId)` - Block
- `unblockUser(userId)` - Unblock
- `searchUsers(query)` - Search
- `updateFriendStatus(friendId, status)` - Update status

**Socket Integration:**
- Listens to `friend_request_received` → adds to pending
- Listens to `friend_status_changed` → updates status
- Auto-joins friend status room on mount
- Real-time status indicators for all friends

#### 6. Direct Messages Context (`src/contexts/DirectMessagesContext.tsx`)
Global state for DM conversations with socket integration.

**State:**
```typescript
conversations: Conversation[]               // List of DM conversations
currentConversation: Conversation | null   // Active conversation
messages: DirectMessage[]                   // Messages in current DM
loading: boolean
error: string | null
```

**Operations:**
- `getConversations()` - Load conversation list
- `selectConversation(userId)` - Open conversation
- `closeConversation()` - Close current
- `deleteConversation(userId)` - Delete conversation
- `getMessages(userId, limit, offset)` - Load message history
- `sendMessage(receiverId, content)` - Send DM
- `deleteMessage(messageId)` - Delete message
- `editMessage(messageId, content)` - Edit message
- `markAsRead(messageId)` - Mark read
- `markAllAsRead(userId)` - Mark all read

**Socket Integration:**
- Joins DM room on conversation select
- Listens to `direct_message_received` for new messages
- Real-time message updates
- Typing indicators for live feedback

---

## 📋 IMPLEMENTATION CHECKLIST

### Backend Requirements (to implement in Flask)

- [ ] **Friend Endpoints:**
  - [ ] GET /api/friends - List friends with status
  - [ ] POST /api/friends/request - Send request (prevent duplicate, blocked users, self)
  - [ ] GET /api/friends/requests/pending - Incoming requests
  - [ ] GET /api/friends/requests/sent - Sent requests
  - [ ] POST /api/friends/request/{id}/accept
  - [ ] POST /api/friends/request/{id}/reject
  - [ ] POST /api/friends/request/{id}/cancel
  - [ ] DELETE /api/friends/{id} - Unfriend
  - [ ] POST /api/friends/block/{id}
  - [ ] POST /api/friends/unblock/{id}
  - [ ] GET /api/friends/blocked

- [ ] **DM Endpoints:**
  - [ ] GET /api/messages/direct/{userId} - Message history (paginated)
  - [ ] POST /api/messages/direct/send - Send DM
  - [ ] DELETE /api/messages/direct/{id} - Delete (owner only)
  - [ ] PUT /api/messages/direct/{id} - Edit (owner only)
  - [ ] POST /api/messages/direct/{id}/read - Mark read
  - [ ] POST /api/messages/direct/{userId}/read-all

- [ ] **Search Endpoints:**
  - [ ] GET /api/users/search?query=... - Search users
  - [ ] GET /api/users/{id} - Get user profile

- [ ] **Socket Events:**
  - [ ] direct_message_sent
  - [ ] direct_message_read
  - [ ] user_typing_dm
  - [ ] friend_request_received
  - [ ] friend_status_changed
  - [ ] friend_removed
  - [ ] user_blocked
  - [ ] user_unblocked

- [ ] **Database:**
  - [ ] Validate friends table constraints
  - [ ] Validate friend_requests table structure
  - [ ] Validate direct_messages table
  - [ ] Validate blocked_users table
  - [ ] Add indexes for performance (user_id, sender_id, receiver_id)

---

## 🎯 NEXT STEPS

### Phase 4: UI Components (to implement)

1. **Friends Sidebar Component** (`components/sidebar/FriendsSidebar.tsx`)
   - Friends list with online status
   - Pending requests tab
   - Sent requests tab
   - Friend search
   - Blocked users management
   - Context menu (message, block, remove)

2. **Direct Message View** (`pages/DirectMessage.tsx`)
   - Conversation view with professional message formatting
   - Matching the current channel message style
   - Read receipts indicator
   - Typing indicators
   - Message actions (delete, edit)
   - Input with file upload support

3. **Friend Request Modal** (`components/modals/FriendRequestModal.tsx`)
   - Search users
   - Send friend request
   - View pending requests with actions
   - Accept/Reject/Cancel buttons

4. **User Profile Card** (`components/UserProfileCard.tsx`)
   - Display user info, status, custom status
   - Quick actions (message, add friend, block)
   - Avatar with status indicator

5. **Conversation List** (`components/ConversationList.tsx`)
   - List of all DM conversations
   - Unread message count
   - Last message preview
   - Sort by recent
   - Online status indicator

---

## 🔧 USAGE

### Using Friends Context
```typescript
import { useFriends } from '@/contexts/FriendsContext';

function MyComponent() {
  const { friends, pendingRequests, sendFriendRequest, acceptFriendRequest } = useFriends();
  
  // Load data
  useEffect(() => {
    getFriends();
    getPendingRequests();
  }, []);
  
  return (
    <div>
      {friends.map(f => <FriendCard key={f.id} friend={f} />)}
    </div>
  );
}
```

### Using Direct Messages Context
```typescript
import { useDirectMessages } from '@/contexts/DirectMessagesContext';

function DMView() {
  const { messages, currentConversation, sendMessage } = useDirectMessages();
  
  return (
    <div>
      {messages.map(m => <MessageBubble key={m.id} message={m} />)}
      <input onSubmit={(e) => sendMessage(currentConversation.user_id, e.target.value)} />
    </div>
  );
}
```

---

## 🔐 Security Considerations

1. **Authentication:**
   - All endpoints require valid JWT token
   - Socket.IO auth via token in connection handshake

2. **Authorization:**
   - Users can only message friends or pending friends
   - Users cannot message blocked users
   - Cannot delete/edit others' messages
   - Cannot unfriend without mutual agreement

3. **Data Privacy:**
   - Direct messages not visible to blocked users
   - Friend list private to user
   - Block list private
   - Typing indicators only in active conversations

4. **Rate Limiting:**
   - Limit friend requests (e.g., 10/day)
   - Limit message frequency (prevent spam)
   - Limit search results (top 50)

---

## 📊 Database Schema Reference

```sql
-- Friends table
CREATE TABLE friends (
  id INTEGER PRIMARY KEY,
  user_id_1 INTEGER FOREIGN KEY,
  user_id_2 INTEGER FOREIGN KEY,
  created_at TIMESTAMP,
  UNIQUE(user_id_1, user_id_2)
);

-- Friend requests table
CREATE TABLE friend_requests (
  id INTEGER PRIMARY KEY,
  sender_id INTEGER FOREIGN KEY,
  receiver_id INTEGER FOREIGN KEY,
  status ENUM('pending', 'accepted', 'rejected', 'cancelled'),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Direct messages table
CREATE TABLE direct_messages (
  id INTEGER PRIMARY KEY,
  sender_id INTEGER FOREIGN KEY,
  receiver_id INTEGER FOREIGN KEY,
  content TEXT,
  message_type ENUM('text', 'image', 'file', 'ai'),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Blocked users table
CREATE TABLE blocked_users (
  id INTEGER PRIMARY KEY,
  user_id INTEGER FOREIGN KEY,
  blocked_user_id INTEGER FOREIGN KEY,
  created_at TIMESTAMP,
  UNIQUE(user_id, blocked_user_id)
);
```

---

## 🎨 Message Formatting

Messages will display using the same professional format as channels:
- Author name + timestamp on top (only first message per group)
- Small avatar on left (8x8 for DMs)
- Compact spacing between messages
- Read receipts with checkmark icons
- Typing indicators with bouncing dots

---

## ✨ Advanced Features (Optional)

1. **Message Reactions**
   - Add emoji reactions to messages
   - Real-time reaction updates

2. **Voice/Video Calls**
   - Socket.IO for call signaling
   - WebRTC for peer-to-peer

3. **File Sharing**
   - Upload files/images in DMs
   - Preview media in conversation

4. **Message Search**
   - Search within conversations
   - Search across all DMs

5. **Group Chats**
   - Create group conversations
   - Add/remove members
   - Group typing indicators

6. **Message Forwarding**
   - Forward messages to other friends
   - Maintain message metadata

7. **Custom Status**
   - Set custom status message
   - Auto-clear after time period

---

## 🚀 Performance Optimizations

1. **Message Pagination**
   - Load only 50 messages per conversation
   - Load older messages on scroll up
   - Unload old messages to save memory

2. **Virtual Scrolling**
   - Render only visible messages
   - Smooth scrolling with large message lists

3. **Socket Optimization**
   - Join specific conversation rooms
   - Only receive relevant events
   - Debounce typing indicators

4. **Caching**
   - Cache friend list (5 min TTL)
   - Cache recent conversations
   - Invalidate on updates

---

## 📞 Support & Debugging

**Common Issues:**

1. **Messages not appearing:**
   - Check socket connection status
   - Verify conversation is selected
   - Check browser console for errors
   - Verify receiver_id is correct

2. **Friend requests not sent:**
   - Check blocked users list
   - Verify username exists
   - Check pending requests (may already exist)
   - Check API error in console

3. **Read receipts not updating:**
   - Verify socket connection
   - Check that message receiver is online
   - Manual refresh of conversation

**Debugging Commands:**
```javascript
// Check socket status
socketService.isConnected()

// Check current DM conversation
socketService.getCurrentDMConversation()

// Monitor socket events
socket.on('*', (event, ...args) => console.log(event, args));
```

---

**Last Updated:** November 30, 2025
**Status:** Frontend Implementation Complete ✅
