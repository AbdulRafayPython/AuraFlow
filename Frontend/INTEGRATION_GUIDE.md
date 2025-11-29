# AuroFlow Frontend - API Integration Guide

## Overview
The WorkspaceContext now fully integrates all API services with proper state management, error handling, and real-time support.

## Architecture

### Context Hierarchy
```
App.tsx (Root)
├── ThemeProvider
├── AuthProvider
├── WorkspaceProvider ← Main business logic
│   ├── FriendsProvider
│   └── RealtimeProvider (for socket.io)
```

### WorkspaceContext Features

#### 1. Workspace Management
```typescript
// Select a workspace/community
await selectWorkspace(communityId);

// Create a new workspace
const workspace = await createWorkspace({
  name: "My Community",
  description: "Community description"
});

// Access current workspace
const { currentWorkspace, workspaces } = useWorkspace();
```

#### 2. Channel Management
```typescript
// Select a channel (auto-loads messages)
await selectChannel(channelId);

// Create a new channel
const channel = await createChannel(
  communityId,
  "general",
  "text",
  "General discussion"
);

// Channel operations
await joinChannel(channelId);
await leaveChannel(channelId);
await deleteChannel(channelId);

// Access channels
const { channels, currentChannel } = useWorkspace();
```

#### 3. Message Management
```typescript
// Load channel messages
await loadChannelMessages(channelId, limit, offset);

// Load more messages (pagination)
await loadMoreMessages(channelId, limit, offset);

// Send message
const message = await sendMessage(
  channelId,
  "Hello everyone!",
  "text"
);

// Message operations
await editMessage(messageId, "Updated message");
await deleteMessage(messageId);
await markAsRead([messageId1, messageId2]);

// Direct messaging
await sendDirectMessage(friendId, "Hi there!", "text");

// Access messages
const { currentMessages, messages } = useWorkspace();
```

#### 4. Friend Management
```typescript
// Send friend request
const request = await sendFriendRequest("username");

// Get pending requests
await getPendingRequests();

// Manage requests
await acceptFriendRequest(requestId);
await rejectFriendRequest(requestId);

// Remove friend
await removeFriend(friendId);

// Block/Unblock user
await blockUser(userId);
await unblockUser(userId);

// Access friends
const { friends, friendRequests, currentFriend } = useWorkspace();
```

#### 5. Community Member Management
```typescript
// Search users
const users = await searchUsers("john");

// Get community members
await getCommunityMembers(communityId);

// Add member to community
await addCommunityMember(communityId, userId);

// Access members
const { communityMembers } = useWorkspace();
```

#### 6. Error Handling
```typescript
const { error, clearError } = useWorkspace();

// Error is automatically set on any failed operation
// Clear error manually
clearError();
```

#### 7. Loading States
```typescript
const {
  isLoadingWorkspaces,
  isLoadingChannels,
  isLoadingMessages,
  isLoadingFriends,
  isLoadingRequests
} = useWorkspace();
```

## Integration Points

### Service Layer (No Changes Needed)
- `appService.ts` - Base HTTP client
- `authService.ts` - Authentication
- `channelService.ts` - Communities & channels
- `messageService.ts` - Messages
- `friendService.ts` - Friends
- `socketService.ts` - Real-time updates

### Usage Example

```typescript
import { useWorkspace } from '@/contexts/WorkspaceContext';

export function MyComponent() {
  const {
    currentWorkspace,
    channels,
    currentChannel,
    messages: currentMessages,
    sendMessage,
    isLoadingMessages,
    error,
  } = useWorkspace();

  const handleSendMessage = async (content: string) => {
    try {
      if (!currentChannel) return;
      await sendMessage(currentChannel.id, content);
    } catch (err) {
      console.error('Failed to send:', err);
    }
  };

  return (
    <div>
      <h1>{currentWorkspace?.name}</h1>
      <div>Channel: {currentChannel?.name}</div>
      
      {isLoadingMessages ? (
        <p>Loading...</p>
      ) : (
        <div>
          {currentMessages.map(msg => (
            <div key={msg.id}>{msg.content}</div>
          ))}
        </div>
      )}
      
      {error && <div className="error">{error}</div>}
      
      <button onClick={() => handleSendMessage('Hello!')}>
        Send
      </button>
    </div>
  );
}
```

## Key Features

### ✅ Automatic State Synchronization
- Selecting a workspace loads its channels
- Selecting a channel loads its messages
- Friend requests update automatically

### ✅ Error Management
- All API errors are caught and stored
- Error messages are user-friendly
- Errors auto-clear after 5 seconds in App.tsx

### ✅ Loading States
- Separate loading states for each operation
- Fine-grained control over UI feedback

### ✅ Real-time Integration
- Works alongside RealtimeProvider for socket.io
- Complementary for REST API operations

### ✅ Proper Cleanup
- All callbacks properly memoized
- No unnecessary re-renders
- Dependency arrays correctly configured

## API Endpoints Integrated

### Communities
- `GET /api/channels/communities` - List communities
- `POST /api/channels/communities` - Create community
- `GET /api/channels/community/members` - Get members
- `POST /api/channels/community/add-member` - Add member

### Channels
- `GET /api/channels/communities/{id}/channels` - List channels
- `POST /api/channels/communities/{id}/channels` - Create channel
- `POST /api/channels/{id}/join` - Join channel
- `POST /api/channels/{id}/leave` - Leave channel
- `DELETE /api/channels/{id}` - Delete channel

### Messages
- `GET /api/messages/channel/{id}` - Get channel messages
- `POST /api/messages/send` - Send channel message
- `GET /api/messages/direct/{id}` - Get direct messages
- `POST /api/messages/direct/send` - Send direct message
- `POST /api/messages/read` - Mark as read
- `DELETE /api/messages/{id}` - Delete message
- `PUT /api/messages/{id}` - Edit message

### Friends
- `POST /api/friends/request` - Send friend request
- `GET /api/friends/requests/pending` - Get pending requests
- `POST /api/friends/request/{id}/accept` - Accept request
- `POST /api/friends/request/{id}/reject` - Reject request
- `DELETE /api/friends/{id}` - Remove friend
- `POST /api/friends/block/{id}` - Block user
- `POST /api/friends/unblock/{id}` - Unblock user

### Users
- `GET /api/channels/users/search` - Search users

## App.tsx Flow

1. **Authentication Check** - Redirect to login if not authenticated
2. **Onboarding** - Show onboarding flow if first login
3. **Workspace Loading** - Load workspaces from API
4. **Main App** - Display MainLayout with real-time support

## Best Practices

1. **Always await async operations**
   ```typescript
   const channel = await selectChannel(channelId);
   ```

2. **Handle errors gracefully**
   ```typescript
   try {
     await sendMessage(channelId, content);
   } catch (err) {
     // Handle error
   }
   ```

3. **Check loading states**
   ```typescript
   {isLoadingMessages ? <Spinner /> : <Messages />}
   ```

4. **Use TypeScript types**
   ```typescript
   import type { Message, Channel, Friend } from '@/types';
   ```

5. **Cleanup on unmount**
   ```typescript
   useEffect(() => {
     return () => clearError();
   }, []);
   ```

## Testing

The project builds successfully with all integrations:
```bash
npm run build
# Output: ✓ built in 10.21s
```

All TypeScript types are properly validated with no compilation errors.

## Next Steps

1. Update components to use `useWorkspace()` instead of direct service calls
2. Add error UI components for error display
3. Implement optimistic updates for better UX
4. Add loading skeletons/spinners
5. Test with real backend API endpoints
