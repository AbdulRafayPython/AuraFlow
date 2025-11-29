# 🎯 Quick Reference Guide - Friends & Messaging System

**For:** Developers integrating or maintaining the system  
**Updated:** November 30, 2025

---

## File Locations

### Services
```
src/services/
├── friendService.ts              # Friend management API
├── directMessageService.ts        # Direct messaging API
└── socketService.ts              # WebSocket (extended with DM/friend events)
```

### Contexts & Hooks
```
src/contexts/
├── FriendsContext.tsx            # Friend state management + hook
├── DirectMessagesContext.tsx      # DM state management + hook
└── [Other existing contexts...]
```

### Components
```
src/components/
├── sidebar/
│   └── FriendsSidebar.tsx        # Friends list UI
├── DirectMessageView.tsx          # DM conversation view
└── [Other existing components...]
```

### Types
```
src/types/
└── index.ts                       # Extended with new interfaces
```

### App Setup
```
src/
└── App.tsx                        # Updated with new providers
```

### Documentation
```
Root/
├── FRIENDS_MESSAGING_COMPLETE.md  # 500+ line technical guide
├── INTEGRATION_SETUP.md           # Step-by-step integration
├── IMPLEMENTATION_CHECKLIST.md    # Completion status
├── DEPLOYMENT_READINESS.md        # Pre-deployment checklist
└── QUICK_REFERENCE.md             # This file
```

---

## Using Hooks in Components

### useAuth Hook (existing)
```tsx
import { useAuth } from '@/contexts/AuthContext';

const { user, isAuthenticated } = useAuth();
```

### useFriends Hook (new)
```tsx
import { useFriends } from '@/contexts/FriendsContext';

const {
  friends,
  pendingRequests,
  sentRequests,
  blockedUsers,
  loading,
  error,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
  removeFriend,
  blockUser,
  unblockUser,
  searchUsers
} = useFriends();
```

### useDirectMessages Hook (new)
```tsx
import { useDirectMessages } from '@/contexts/DirectMessagesContext';

const {
  conversations,
  currentConversation,
  messages,
  loading,
  error,
  selectConversation,
  sendMessage,
  editMessage,
  deleteMessage,
  markAsRead,
  markAllAsRead
} = useDirectMessages();
```

---

## Common Operations

### Friend Management

**Send Friend Request**
```tsx
const { sendFriendRequest } = useFriends();

await sendFriendRequest(userId);
// Broadcasts friend_request_received to user
```

**Accept Friend Request**
```tsx
const { acceptFriendRequest } = useFriends();

await acceptFriendRequest(requestId);
// Broadcasts friend_request_accepted
```

**Block User**
```tsx
const { blockUser } = useFriends();

await blockUser(userId);
// User can't send messages to you
```

**Search Users**
```tsx
const { searchUsers } = useFriends();

const results = await searchUsers('john', { limit: 10 });
// Returns matching users
```

### Direct Messaging

**Send Message**
```tsx
const { sendMessage } = useDirectMessages();

await sendMessage(recipientId, {
  content: 'Hello!',
  type: 'text'
});
// Broadcasts direct_message_received to recipient
```

**Edit Message**
```tsx
const { editMessage } = useDirectMessages();

await editMessage(messageId, {
  content: 'Updated message'
});
// Updates message in current conversation
```

**Delete Message**
```tsx
const { deleteMessage } = useDirectMessages();

await deleteMessage(messageId);
// Removes message from both users' histories
```

**Mark as Read**
```tsx
const { markAsRead } = useDirectMessages();

await markAsRead(messageId);
// Broadcasts direct_message_read to sender
```

**Select Conversation**
```tsx
const { selectConversation } = useDirectMessages();

selectConversation(userId);
// Loads messages for this user
// Automatically marks as read
```

---

## Type Definitions Quick Reference

### Friend Types
```tsx
interface Friend {
  id: string;
  user_id: string;
  friend_id: string;
  user: User;
  friend: User;
  created_at: string;
  updated_at: string;
}

interface FriendRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  sender: User;
  receiver: User;
  created_at: string;
  updated_at: string;
}

interface BlockedUser {
  id: string;
  blocker_id: string;
  blocked_user_id: string;
  blocked_user: User;
  created_at: string;
}
```

### Message Types
```tsx
interface DirectMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  type: 'text' | 'image' | 'file';
  is_read: boolean;
  edited_at?: string;
  sender?: User;
  receiver?: User;
  created_at: string;
  updated_at: string;
}

interface Conversation {
  user_id: string;
  user: User;
  last_message?: DirectMessage;
  unread_count: number;
  last_message_time?: string;
}
```

### User Types
```tsx
interface User {
  id: string;
  username: string;
  email: string;
  avatar_url?: string;
  status?: 'online' | 'away' | 'offline';
  custom_status?: string;
  last_seen?: string;
  is_first_login?: boolean;
  created_at: string;
  updated_at: string;
}
```

---

## API Endpoints Reference

### Friend Endpoints

| Method | Endpoint | Parameters | Response |
|--------|----------|-----------|----------|
| GET | `/api/friends` | - | Friend[] |
| POST | `/api/friends/request` | `{ friend_id }` | FriendRequest |
| GET | `/api/friends/requests/pending` | - | FriendRequest[] |
| GET | `/api/friends/requests/sent` | - | FriendRequest[] |
| POST | `/api/friends/request/{id}/accept` | - | Friend |
| POST | `/api/friends/request/{id}/reject` | - | void |
| POST | `/api/friends/request/{id}/cancel` | - | void |
| DELETE | `/api/friends/{id}` | - | void |
| POST | `/api/friends/block/{id}` | - | BlockedUser |
| POST | `/api/friends/unblock/{id}` | - | void |
| GET | `/api/friends/blocked` | - | BlockedUser[] |
| GET | `/api/users/search` | `?q=...&limit=10` | User[] |
| GET | `/api/users/{id}` | - | User |

### Message Endpoints

| Method | Endpoint | Parameters | Response |
|--------|----------|-----------|----------|
| GET | `/api/messages/direct/{userId}` | `?limit=50&offset=0` | DirectMessage[] |
| POST | `/api/messages/direct/send` | `{ receiver_id, content, type }` | DirectMessage |
| DELETE | `/api/messages/direct/{id}` | - | void |
| PUT | `/api/messages/direct/{id}` | `{ content }` | DirectMessage |
| POST | `/api/messages/direct/{id}/read` | - | void |
| POST | `/api/messages/direct/{userId}/read-all` | - | void |

---

## WebSocket Events Reference

### Listening (Client → Handler)
```tsx
// Listen for incoming messages
socketService.onDirectMessage((data: DirectMessageEvent) => {
  // data: { message: DirectMessage, sender: User }
  // Add to messages array
});

// Listen for friend requests
socketService.onFriendRequest((data: FriendRequestEvent) => {
  // data: { request: FriendRequest, sender: User }
  // Add to pending requests
});

// Listen for friend status changes
socketService.onFriendStatus((data: FriendStatusEvent) => {
  // data: { user_id: string, status: 'online' | 'away' | 'offline' }
  // Update friend status in list
});
```

### Broadcasting (Client → Server → Other Clients)
```tsx
// Send message (broadcast to recipient)
socketService.broadcastDirectMessage({
  message: { /* DirectMessage */ },
  receiver_id: userId
});

// Send friend request (broadcast to receiver)
socketService.broadcastFriendRequest({
  request: { /* FriendRequest */ },
  receiver_id: userId
});

// Send typing indicator
socketService.sendDMTyping(recipientUserId);
```

---

## Component Integration Examples

### Using FriendsSidebar
```tsx
import FriendsSidebar from '@/components/sidebar/FriendsSidebar';

function MainLayout() {
  return (
    <div className="flex">
      <FriendsSidebar />
      <main>Content</main>
    </div>
  );
}
```

### Using DirectMessageView
```tsx
import { useDirectMessages } from '@/contexts/DirectMessagesContext';
import DirectMessageView from '@/components/DirectMessageView';

function Dashboard() {
  const { currentConversation } = useDirectMessages();
  
  if (currentConversation) {
    return <DirectMessageView />;
  }
  
  return <div>Select a conversation</div>;
}
```

---

## Error Handling

### Try-Catch Pattern
```tsx
try {
  await sendFriendRequest(userId);
} catch (error) {
  const message = error instanceof Error 
    ? error.message 
    : 'An error occurred';
  
  toast.error(message);
}
```

### From API Errors
```tsx
// Services catch errors and re-throw with descriptive messages:
// - "Failed to fetch friends: 401 Unauthorized"
// - "User not found"
// - "Network error"

// Components should show these to users via toast/alert
```

---

## Testing

### Run Integration Tests
```bash
npm run test -- __tests__/integration/friendsMessaging.test.ts
```

### Test Friend Flow
```typescript
// 1. Search user
const results = await friendService.searchUsers('john');

// 2. Send request
const request = await friendService.sendFriendRequest(userId);

// 3. Accept
const friend = await friendService.acceptFriendRequest(requestId);

// 4. Send message
const message = await directMessageService.sendDirectMessage(userId, {
  content: 'Hello!',
  type: 'text'
});
```

---

## Performance Tips

### 1. Memoize Components
```tsx
const MemoizedFriendsSidebar = memo(FriendsSidebar);
```

### 2. Use Selective Hooks
```tsx
// Only import what you need
const { friends } = useFriends(); // Instead of getting all data
```

### 3. Pagination for Large Lists
```tsx
// Messages already support pagination
const messages = await getDirectMessages(userId, {
  limit: 50,
  offset: 0
});
```

### 4. Lazy Load
```tsx
// Load friends on demand
useEffect(() => {
  if (!friends.length && !loading) {
    getFriends();
  }
}, [friends, loading]);
```

---

## Debugging

### Check WebSocket Connection
```javascript
// In browser console
socketService.isConnected();
// Should return true when connected
```

### Monitor Events
```javascript
// Listen for all socket events
socket.onAny((eventName, ...args) => {
  console.log('[Socket Event]', eventName, args);
});
```

### Check Context State
```javascript
// Add to component
useEffect(() => {
  console.log('Friends:', friends);
  console.log('Current DM:', currentConversation);
}, [friends, currentConversation]);
```

### API Response Logging
```tsx
// In service files
console.log('[API] GET /api/friends', response.data);
```

---

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| useDirectMessages returns undefined | Provider not in app tree | Check App.tsx has DirectMessagesProvider |
| Messages not showing | Socket not listening | Verify onDirectMessage is registered |
| Friend requests not appearing | Missing socket event | Check socket.on('friend_request_received') |
| Type errors in components | Missing types | Import from `@/types` |
| API calls failing | Token expired | Login will refresh token |
| Socket disconnects | Network issue | Automatic reconnection handles this |

---

## Style Guide

### Component Structure
```tsx
// 1. Imports
import { useContext } from 'react';
import { useFriends } from '@/contexts/FriendsContext';

// 2. Component definition
export default function MyComponent() {
  // 3. Hooks
  const { friends } = useFriends();
  
  // 4. State/Effects
  const [selected, setSelected] = useState(null);
  
  // 5. Handlers
  const handleClick = () => { /* ... */ };
  
  // 6. Render
  return <div>{/* JSX */}</div>;
}
```

### Styling
```tsx
// Use Tailwind classes
<div className="flex gap-2 p-4 bg-slate-800 rounded-lg hover:bg-slate-700">
  {/* Content */}
</div>
```

### Error Handling
```tsx
// Always wrap async operations
if (error) {
  return <div className="text-red-500">{error}</div>;
}
```

---

## Resources

| Document | Purpose | Location |
|----------|---------|----------|
| FRIENDS_MESSAGING_COMPLETE.md | Full technical reference | Root |
| INTEGRATION_SETUP.md | Integration guide | Root |
| IMPLEMENTATION_CHECKLIST.md | Status tracking | Root |
| DEPLOYMENT_READINESS.md | Pre-deployment info | Root |
| This file | Quick reference | Root |

---

## Key Contacts/Team Roles

- **Frontend Lead:** Reviews components and integration
- **Backend Lead:** Implements/verifies API endpoints
- **QA Lead:** Tests complete flows
- **DevOps:** Handles deployment

---

**Happy coding! 🎉**

For more details, see the comprehensive documentation files.
