# Real-Time DM Testing Guide

## Quick Start

### Terminal 1: Backend
```bash
cd Backend
venv\Scripts\activate
python app.py
```

### Terminal 2: Frontend
```bash
cd Frontend
npm run dev
```

### Browser
```
http://localhost:5173
```

---

## Test Scenarios

### Test 1: Message Order (Single User)

**Steps:**
1. Login and open DM conversation
2. Send 3 messages: "First", "Second", "Third"
3. Check order in chat

**Expected Result:**
```
✅ First     (appears at top)
✅ Second    (appears in middle)
✅ Third     (appears at bottom)
```

**Verify:**
- [ ] Messages appear in correct order
- [ ] Latest message is at bottom
- [ ] Auto-scroll brings you to latest message
- [ ] Refresh page maintains order

---

### Test 2: Real-Time Messaging (Two Users)

**Setup:**
1. Open 2 browser windows (or private + normal window)
2. Login as User A in Window 1
3. Login as User B in Window 2
4. Both open DM conversation with each other

**Steps:**
1. User A types: "Hello!"
2. Watch Window 2 (User B)
3. Check if message appears immediately

**Expected Result:**
```
Window 1 (User A):          Window 2 (User B):
[sends "Hello!"]      →     [receives "Hello!" instantly]
```

**Verify:**
- [ ] User A sends message
- [ ] User B sees it immediately (no refresh needed)
- [ ] Message appears at bottom
- [ ] User B's name shows as sender
- [ ] Avatar displays correctly

**Steps for Reply:**
1. User B types: "Hi there!"
2. Check Window 1

**Expected Result:**
```
User B's message appears immediately in User A's chat
```

**Verify:**
- [ ] User A receives message instantly
- [ ] User B's name shows as sender
- [ ] Messages are in chronological order

---

### Test 3: Conversation List Order

**Setup:**
1. Login as User A
2. Have conversations with multiple friends

**Steps:**
1. Open DM with Friend 1 (Alice)
2. Send message
3. Close DM (click back button)
4. Open DM with Friend 2 (Bob)
5. Send message
6. Check conversation list in sidebar

**Expected Result:**
```
Conversation List Order:
✅ Bob (You: Last message to Bob)   ← Most recent
✅ Alice (You: Last message to A...)  ← Second recent
✅ Charlie (No conversations yet)    ← Least recent
```

**Verify:**
- [ ] Most recent conversation at top
- [ ] Last message preview shows
- [ ] "You:" prefix shows for sent messages
- [ ] Order updates when new messages arrive

---

### Test 4: Last Message Preview

**Steps:**
1. Have an active conversation with User X
2. Send message: "This is a longer message to test preview truncation"
3. Close conversation
4. Check sidebar

**Expected Result:**
```
✅ User X
   You: This is a longer message to test preview...
```

**Verify:**
- [ ] Last message preview shows
- [ ] Long messages are truncated
- [ ] Correct sender indicated ("You:" vs name)
- [ ] Preview updates when message received

---

### Test 5: Socket Disconnection & Reconnection

**Steps:**
1. Open DM conversation
2. Open DevTools → Network tab
3. Find WebSocket connection
4. Throttle connection to "Slow 3G"
5. Send a message
6. Check if it eventually arrives
7. Switch to "Online"
8. Send another message

**Expected Result:**
```
✅ Messages eventually arrive even with slow connection
✅ Reconnection happens automatically
✅ Messages don't duplicate
```

**Verify:**
- [ ] Messages send successfully even with lag
- [ ] No duplicate messages
- [ ] Reconnects automatically
- [ ] No errors in console (except potential network warnings)

---

### Test 6: Console Logging

**Steps:**
1. Open DevTools (F12) → Console
2. Filter by "💬" or "SOCKET" or "DirectMessage"
3. Send a message
4. Check logs

**Expected Output:**
```
[SOCKET] 💬 Sent direct message to user 456: {...}
[DirectMessagesContext] Sending message to user: 456 Content: "Hello"
[DirectMessagesContext] Message sent successfully: {...}
[DirectMessagesContext] Setting up socket listener for DM with user: 456
[SOCKET] 💬 Received direct message event: {...}
[DirectMessagesContext] Socket received message event: {...}
[DirectMessagesContext] Message is relevant, adding to conversation
[DirectMessageView] Processing message: {...}
[DirectMessageView] Enriched message: {...}
```

**Verify:**
- [ ] All expected log messages appear
- [ ] Logs show correct user IDs
- [ ] Logs show complete message data
- [ ] No error messages

---

## Common Issues & Solutions

### Issue: Messages still appear at top

**Solution:**
1. Clear browser cache (Ctrl+Shift+Del)
2. Hard refresh (Ctrl+Shift+F5)
3. Check console for errors
4. Check backend for sorting logic

### Issue: Real-time messages not received

**Solution:**
1. Check socket connection in DevTools Network tab
2. Look for WebSocket connection
3. Check console for socket errors
4. Verify both users are in same conversation
5. Check backend socket logs

### Issue: Conversations not sorting

**Solution:**
1. Send new message
2. Check `last_message_time` in context
3. Verify `last_message` is being set
4. Check FriendsSidebar sorting logic

### Issue: Avatar not showing in socket message

**Solution:**
1. Check backend returns `sender` object
2. Verify socket emit includes sender data
3. Check frontend enrichment logic
4. Check DiceBear fallback working

---

## Quick Checklist

### ✅ Message Display
- [ ] Oldest at top, newest at bottom
- [ ] Auto-scroll to latest
- [ ] All message content visible
- [ ] Sender names show correctly
- [ ] Avatars display

### ✅ Real-Time Sync
- [ ] Messages appear instantly in other window
- [ ] No need to refresh
- [ ] No duplicate messages
- [ ] Correct ordering maintained
- [ ] Socket connection stable

### ✅ Conversation List
- [ ] Recent conversations first
- [ ] Last message preview shows
- [ ] "You:" prefix for sent messages
- [ ] Updates when new messages arrive
- [ ] Active conversation highlighted

### ✅ Console Logs
- [ ] Socket events appear
- [ ] Message data logged
- [ ] No error messages
- [ ] All expected logs present

### ✅ Performance
- [ ] No lag when sending messages
- [ ] No lag when receiving messages
- [ ] Smooth scrolling
- [ ] Fast page loads
- [ ] Memory usage stable

---

## Test Data to Use

### User 1
- Username: `alice`
- Password: `password123`
- Display Name: `Alice Smith`

### User 2
- Username: `bob`
- Password: `password123`
- Display Name: `Bob Jones`

---

## Browser DevTools Tips

### View Socket Frames
1. DevTools → Network tab
2. Look for WebSocket connection (ws://localhost:5000)
3. Click it
4. Go to "Messages" tab
5. See real-time socket events

### Monitor Messages
1. Console → Filter by "💬"
2. Watch socket events in real-time
3. Check message data structure

### Test Network Conditions
1. Network tab → Throttling dropdown
2. Select "Slow 3G"
3. Test message sending
4. Switch back to "Online"
5. Verify reconnection

---

## Success Indicators

✅ **You'll know it's working when:**

1. **Message Order**: Latest message always at bottom
2. **Real-Time**: Second browser receives message instantly
3. **Recent List**: Newest conversation at top of list
4. **Preview**: Last message shows in conversation list
5. **Socket Logs**: Console shows socket events
6. **No Errors**: Console has no error messages
7. **Smooth UX**: Everything feels responsive

---

## Troubleshooting Commands

### Restart Backend
```bash
# Kill previous instance
Ctrl+C

# Start fresh
python app.py
```

### Clear Frontend Cache
```bash
# Hard refresh (clears cache)
Ctrl + Shift + F5

# Or clear everything
Ctrl + Shift + Delete
# Then reload page
```

### Check Socket Connection
```javascript
// In console:
// Should see WebSocket frame details in Network tab
```

### Monitor Messages
```javascript
// In console, filter by:
// "💬" for socket messages
// "DirectMessage" for component logs
// "DirectMessagesContext" for context logs
```

---

## Expected Socket Flow

```
User A sends "Hello"
    ↓
[DirectMessagesContext] Sending message to user: 456
[directMessageService] Sending DM to user: 456
    ↓
POST /api/messages/direct/send
    ↓
[SOCKET] 💬 Sent direct message to user 456
broadcastDirectMessage() emits to socket
    ↓
emit('send_direct_message')
    ↓
Backend receives send_direct_message event
    ↓
emit('receive_direct_message') to room
    ↓
User B's socket receives 'receive_direct_message'
    ↓
[SOCKET] 💬 Received direct message event
[DirectMessagesContext] Socket received message event
[DirectMessageView] Processing message
    ↓
Message appears in User B's chat ✅
```

---

## Performance Testing

### Message Sending Speed
1. Send message
2. Check time in console
3. Should be < 1 second typically

### Real-Time Delivery
1. Send message in Window A
2. Check time it appears in Window B
3. Should be < 500ms on good connection

### Conversation List Update
1. Send message
2. Check time conversation moves to top
3. Should be instant

---

**READY TO TEST!** 🚀

Open two browser windows and test real-time messaging!
