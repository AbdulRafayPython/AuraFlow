# Direct Message Debugging Guide

## Issues Fixed

### 1. Backend Response Format Issue
**Problem**: Backend was returning `avatar` field instead of `avatar_url`, and sender data was not properly structured.

**Files Modified**: 
- `Backend/routes/messages.py`

**Changes**:
- Fixed `get_direct_messages()` endpoint to return proper `sender` object with correct fields:
  ```python
  'sender': {
      'id': m['sender_id'],
      'username': m['username'],
      'display_name': m['display_name'] or m['username'],
      'avatar_url': get_avatar_url(m['username'], m['avatar_url'])
  }
  ```

- Fixed `send_direct_message()` endpoint to return consistent format with sender object

**Expected Backend Response**:
```json
{
  "id": 1,
  "sender_id": 123,
  "receiver_id": 456,
  "content": "Hello!",
  "message_type": "text",
  "created_at": "2024-12-02T10:00:00",
  "is_read": false,
  "sender": {
    "id": 123,
    "username": "john_doe",
    "display_name": "John Doe",
    "avatar_url": "https://..."
  }
}
```

### 2. Frontend Message Enrichment Logic
**Problem**: Messages without complete sender data would display "Unknown" avatar and name.

**Files Modified**:
- `Frontend/src/components/DirectMessageView.tsx`
- `Frontend/src/contexts/DirectMessagesContext.tsx`
- `Frontend/src/services/directMessageService.ts`

**Changes**:
1. **DirectMessageView.tsx**: Enhanced enrichment logic with comprehensive fallbacks:
   - If message has sender data from backend → use it
   - If message sender_id matches current user → use current user's data
   - If message sender_id matches a friend → use friend's data
   - Otherwise → use "Unknown" with DiceBear avatar fallback

2. **DirectMessagesContext.tsx**: Added console logging to track message state
3. **directMessageService.ts**: Added console logging for API requests/responses

## Console Logs Added

### DirectMessageView.tsx
Logs every message processing:
```
[DirectMessageView] Processing message: { id, sender_id, receiver_id, ... }
[DirectMessageView] Message already has sender data: {...}
[DirectMessageView] Using current user as sender: {...}
[DirectMessageView] Found sender from friends: {...}
[DirectMessageView] Enriched message: {...}
[DirectMessageView] All enriched messages: [...]
```

### DirectMessagesContext.tsx
Logs message fetching and sending:
```
[DirectMessagesContext] Fetching messages for user: 456
[DirectMessagesContext] Received messages from API: [...]
[DirectMessagesContext] Messages state updated: [...]
[DirectMessagesContext] Sending message to user: 456 Content: "Hello"
[DirectMessagesContext] Message sent successfully: {...}
```

### directMessageService.ts
Logs API calls:
```
[directMessageService] Fetching DMs for user: 456 { limit: 50, offset: 0 }
[directMessageService] API Response: [...]
[directMessageService] Sending DM to user: 456 { content: "Hello", messageType: "text" }
[directMessageService] Send response: {...}
```

## How to Debug Direct Message Issues

### Step 1: Check Backend Response
1. Open browser DevTools (F12)
2. Go to Network tab
3. Send a message
4. Look for `GET /api/messages/direct/{userId}` or `POST /api/messages/direct/send`
5. Click the request and go to Response tab
6. Verify the response includes:
   - `sender` object (not `author` or `avatar`)
   - `sender.avatar_url` (not `avatar`)
   - `sender.display_name` (not `display_name` at root level)

### Step 2: Check Frontend API Processing
1. Open DevTools Console
2. Filter by `directMessageService`
3. Look for:
   - `[directMessageService] Fetching DMs for user: X`
   - `[directMessageService] API Response: [...]`
   - `[directMessageService] Sending DM to user: X`

### Step 3: Check Context State Management
1. Filter console by `DirectMessagesContext`
2. Look for:
   - `[DirectMessagesContext] Fetching messages for user: X`
   - `[DirectMessagesContext] Received messages from API: [...]`
   - `[DirectMessagesContext] Sending message to user: X`

### Step 4: Check Message Enrichment
1. Filter console by `DirectMessageView`
2. Look for each message:
   - `[DirectMessageView] Processing message: {...}`
   - Check if `sender_from_backend` is populated
   - Check if enriched with current user data or friend data
   - Final `[DirectMessageView] Enriched message: {...}` shows result

## Data Flow

```
Backend GET /api/messages/direct/{userId}
    ↓
directMessageService.getDirectMessages()
    ↓ [Logs API Response]
DirectMessagesContext.getMessages()
    ↓ [Logs Received Messages]
setMessages(msgs)
    ↓
DirectMessageView receives messages prop
    ↓
enrichedMessages.map(msg => {...})
    ↓ [Logs enrichment for each message]
Rendered message with sender.display_name & sender.avatar_url
```

## Common Issues & Solutions

### Issue: "Unknown" appears in messages
**Solution**:
1. Check backend is returning full `sender` object
2. Verify `sender.display_name` is not empty/null
3. Check that friends list is properly loaded
4. Open console and search for `[DirectMessageView] Enriched message:` to see final state

### Issue: Wrong avatar appears
**Solution**:
1. Verify backend is returning `avatar_url` (not `avatar`)
2. Check that `get_avatar_url()` function in backend is working
3. If `avatar_url` is null/undefined, DiceBear generates from username
4. Look for `sender.avatar_url` in console logs

### Issue: Messages not appearing
**Solution**:
1. Check `[directMessageService] Fetching DMs for user:` - verify correct user ID
2. Check `[DirectMessagesContext] Received messages from API:` - should not be empty
3. Check Network tab for 401/403 errors
4. Verify JWT token is valid

## Testing Checklist

- [ ] Verify backend returns proper sender object in response
- [ ] Check DirectMessageView console logs show messages being enriched
- [ ] Confirm sender names display (not "Unknown")
- [ ] Confirm avatars load correctly
- [ ] Send a message and verify response format
- [ ] Close and reopen conversation - messages should still have correct sender info
- [ ] Test with friend who has avatar_url set
- [ ] Test with friend who has no avatar_url (should use DiceBear)

## Backend Routes to Test

### GET /api/messages/direct/{user_id}
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/messages/direct/456?limit=50&offset=0
```

### POST /api/messages/direct/send
```bash
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"receiver_id":456,"content":"Hello","message_type":"text"}' \
  http://localhost:5000/api/messages/direct/send
```

## Environment Setup

1. **Backend**:
   ```bash
   cd Backend
   venv\Scripts\activate
   pip install -r requirements.txt
   python app.py
   ```

2. **Frontend**:
   ```bash
   cd Frontend
   npm install
   npm run dev
   ```

3. **Testing**:
   - Open http://localhost:5173
   - Login with test account
   - Open DevTools (F12)
   - Filter console logs by `DirectMessage` or `directMessage`
   - Send/receive messages and check logs
