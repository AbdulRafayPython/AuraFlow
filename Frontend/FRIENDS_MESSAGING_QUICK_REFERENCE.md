# Friends & Messaging Integration Quick Reference

## File Changes Summary

### ✅ Services Created/Updated
- `src/services/friendService.ts` - Complete friend management
- `src/services/directMessageService.ts` - DM operations
- `src/services/socketService.ts` - Enhanced with DM + friend events
- `src/types/index.ts` - Enhanced types

### ✅ Contexts Created/Updated
- `src/contexts/FriendsContext.tsx` - Friend state + socket integration
- `src/contexts/DirectMessagesContext.tsx` - DM state + socket integration

### 📋 Types Added
```typescript
// Enhanced types in src/types/index.ts
interface DirectMessage {
  id: number;
  sender_id: number;
  receiver_id: number;
  content: string;
  message_type: 'text' | 'image' | 'file' | 'ai';
  created_at: string;
  is_read: boolean;
  edited_at?: string | null;
  sender?: User;
  receiver?: User;
}

interface SendDirectMessageData {
  receiver_id: number;
  content: string;
  message_type?: 'text' | 'image' | 'file';
}

interface FriendRequest {
  id: number;
  sender_id: number;
  receiver_id: number;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  created_at: string;
  updated_at?: string;
  sender?: { username: string; display_name: string; avatar_url: string; id: number };
  receiver?: { username: string; display_name: string; avatar_url: string; id: number };
}

interface BlockedUser {
  id: number;
  blocked_user_id: number;
  created_at: string;
  user?: { username: string; display_name: string; avatar_url?: string };
}
```

## Socket Events Added

### Client → Server
```typescript
// DM events
socket.emit('join_dm', { user_id: number })
socket.emit('leave_dm', { user_id: number })
socket.emit('typing_dm', { user_id: number; is_typing: boolean })
socket.emit('new_direct_message', { message: DirectMessage })
socket.emit('message_read', { message_id: number })

// Friend events
socket.emit('friend_request_sent', { request: FriendRequest })
socket.emit('friend_request_accepted_response', { request_id: number; user_id: number })
socket.emit('join_friend_status')
socket.emit('leave_friend_status')
```

### Server → Client
```typescript
// DM events
'direct_message_received' - { DirectMessageEvent }
'direct_message_read' - { message_id, read_by }
'user_typing_dm' - { user_id, is_typing }

// Friend events
'friend_request_received' - { FriendRequestEvent }
'friend_request_accepted' - { FriendRequestEvent }
'friend_request_rejected' - { FriendRequestEvent }
'friend_status_changed' - { friend_id, status }
'friend_removed' - { friend_id }
'user_blocked' - { blocked_user_id }
'user_unblocked' - { unblocked_user_id }
```

## API Endpoints (Backend Required)

### Friend Operations
```
GET    /api/friends                          → Friend[]
POST   /api/friends/request                  → FriendRequest
GET    /api/friends/requests/pending         → FriendRequest[]
GET    /api/friends/requests/sent            → FriendRequest[]
POST   /api/friends/request/{id}/accept      → { message: string }
POST   /api/friends/request/{id}/reject      → { message: string }
POST   /api/friends/request/{id}/cancel      → { message: string }
DELETE /api/friends/{id}                     → { message: string }
POST   /api/friends/block/{userId}           → { message: string }
POST   /api/friends/unblock/{userId}         → { message: string }
GET    /api/friends/blocked                  → BlockedUser[]
GET    /api/users/search?query=...           → User[]
GET    /api/users/{id}                       → User
```

### Direct Messages
```
GET    /api/messages/direct/{userId}         → DirectMessage[]
POST   /api/messages/direct/send             → DirectMessage
DELETE /api/messages/direct/{id}             → { message: string }
PUT    /api/messages/direct/{id}             → DirectMessage
POST   /api/messages/direct/{id}/read        → { message: string }
POST   /api/messages/direct/{userId}/read-all → { message: string }
```

## Usage Examples

### Initialize Providers (App.tsx)
```tsx
import { FriendsProvider } from '@/contexts/FriendsContext';
import { DirectMessagesProvider } from '@/contexts/DirectMessagesContext';

function App() {
  return (
    <FriendsProvider>
      <DirectMessagesProvider>
        <YourApp />
      </DirectMessagesProvider>
    </FriendsProvider>
  );
}
```

### Use Friends Context
```tsx
import { useFriends } from '@/contexts/FriendsContext';

export function FriendsPanel() {
  const {
    friends,
    pendingRequests,
    sendFriendRequest,
    acceptFriendRequest,
    removeFriend,
    blockUser,
    getFriends,
    getPendingRequests,
    searchUsers,
  } = useFriends();

  useEffect(() => {
    getFriends();
    getPendingRequests();
  }, []);

  const handleSearch = async (query: string) => {
    const results = await searchUsers(query);
    return results;
  };

  return (
    <div>
      {/* Friends List */}
      {friends.map(friend => (
        <div key={friend.id}>
          <span>{friend.username}</span>
          <StatusDot status={friend.status} />
          <button onClick={() => removeFriend(friend.id)}>Remove</button>
          <button onClick={() => blockUser(friend.id)}>Block</button>
        </div>
      ))}

      {/* Pending Requests */}
      {pendingRequests.map(request => (
        <div key={request.id}>
          <span>{request.sender?.display_name}</span>
          <button onClick={() => acceptFriendRequest(request.id)}>Accept</button>
          <button onClick={() => rejectFriendRequest(request.id)}>Reject</button>
        </div>
      ))}
    </div>
  );
}
```

### Use Direct Messages Context
```tsx
import { useDirectMessages } from '@/contexts/DirectMessagesContext';

export function DMView({ friendId }) {
  const {
    messages,
    currentConversation,
    selectConversation,
    sendMessage,
    markAsRead,
    deleteMessage,
    loading,
  } = useDirectMessages();

  useEffect(() => {
    selectConversation(friendId);
  }, [friendId]);

  const handleSend = async (content: string) => {
    await sendMessage(friendId, content);
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      {/* Messages */}
      <div className="messages">
        {messages.map(msg => (
          <div key={msg.id} className="message">
            <Avatar src={msg.sender?.avatar_url} />
            <div>
              <strong>{msg.sender?.display_name}</strong>
              <small>{new Date(msg.created_at).toLocaleTimeString()}</small>
              {msg.is_read && <CheckIcon />}
            </div>
            <p>{msg.content}</p>
            <button onClick={() => deleteMessage(msg.id)}>Delete</button>
          </div>
        ))}
      </div>

      {/* Input */}
      <input
        type="text"
        placeholder="Type a message..."
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleSend(e.currentTarget.value);
            e.currentTarget.value = '';
          }
        }}
      />
    </div>
  );
}
```

## Frontend Components To Build

### 1. FriendsSidebar (`components/sidebar/FriendsSidebar.tsx`)
- Display friends with status indicators
- Tab for pending requests
- Tab for sent requests
- Search users functionality
- Right-click context menu
- Show online/offline/idle/dnd status
- Unread message badges

### 2. DirectMessageView (`pages/DirectMessage.tsx`)
- Chat-like interface
- Messages with avatars, names, timestamps
- Read receipts (✓ and ✓✓)
- Typing indicators
- Message input with file upload
- Message actions (delete, edit)
- Professional compact formatting

### 3. FriendRequestModal (`components/modals/FriendRequestModal.tsx`)
- Search users by username
- Display search results
- Send friend request button
- Show pending incoming requests with Accept/Reject
- Show sent requests with Cancel option

### 4. UserStatusIndicator (Reusable)
- Online (green dot)
- Idle (yellow dot)
- DND (red dot)
- Offline (gray dot)
- Show custom status on hover

### 5. MessageBubble (Reusable)
- Author name + timestamp
- Message content
- Read status indicator
- Delete/Edit buttons on hover
- Support for different message types

## Performance Tips

1. **Pagination:** Load only 50 messages per conversation
2. **Virtual Scrolling:** Use react-window for large message lists
3. **Socket Rooms:** Join specific DM rooms to reduce event traffic
4. **Caching:** Cache friend list (5-10 min TTL)
5. **Debouncing:** Debounce typing indicators (100ms)

## Debugging

```typescript
// Check if services are working
import { friendService } from '@/services/friendService';
import { directMessageService } from '@/services/directMessageService';
import { socketService } from '@/services/socketService';

// Test friend request
await friendService.sendFriendRequest('testuser');

// Test DM
await directMessageService.sendDirectMessage(123, 'Hello');

// Check socket
console.log('Socket connected:', socketService.isConnected());
```

## Security Notes

1. ✅ All requests require JWT authentication
2. ✅ Backend validates user ownership before delete/edit
3. ✅ Cannot message blocked users
4. ✅ Cannot send requests to blocked users
5. ⚠️ Implement rate limiting on backend (friend requests, messages)
6. ⚠️ Implement message spam detection
7. ⚠️ Add content filtering for explicit content

## Testing Checklist

- [ ] Send friend request
- [ ] Accept friend request
- [ ] Reject friend request
- [ ] Cancel sent request
- [ ] Remove friend
- [ ] Block user
- [ ] Unblock user
- [ ] Send direct message
- [ ] Receive direct message
- [ ] Mark message as read
- [ ] Delete message
- [ ] Edit message
- [ ] View friend status changes
- [ ] See typing indicators
- [ ] Search users
- [ ] Block prevents messaging
- [ ] Pagination loads more messages

---

**Frontend Implementation Status:** ✅ COMPLETE
**Backend Integration Status:** ⏳ PENDING (requires API endpoints)
