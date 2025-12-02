# Quick Reference & Commands

## 🚀 Quick Start (Copy & Paste)

### Terminal 1: Backend
```bash
cd Backend
venv\Scripts\activate
python app.py
```

### Terminal 2: Frontend (New Terminal)
```bash
cd Frontend
npm run dev
```

### Browser
```
http://localhost:5173
```

---

## 🔍 Testing Commands

### Open DevTools
```
F12
```

### Filter Console for Logs
```
Filter text: DirectMessage
```

### Full Console Trace
```
1. Open F12
2. Go to Console tab
3. Filter by "DirectMessage"
4. Refresh page
5. Click a friend
6. Watch logs appear
```

---

## 📡 API Testing (curl commands)

### Get User Token First
1. Login in browser
2. Open DevTools → Application tab
3. Look for `token` in Local Storage
4. Copy the token value

### Test GET Messages
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/messages/direct/456
```

### Test POST Message
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"receiver_id\":456,\"content\":\"Hello\",\"message_type\":\"text\"}" \
  http://localhost:5000/api/messages/direct/send
```

---

## 📊 Console Log Filtering

### Filter for All DM Logs
```javascript
// In console, filter by: DirectMessage
// Shows all logs from:
// - DirectMessageView
// - DirectMessagesContext
// - directMessageService
```

### Filter for Specific Component
```javascript
// Service API logs only
Filter: directMessageService

// Context state logs only
Filter: DirectMessagesContext

// Component enrichment logs only
Filter: DirectMessageView
```

### Clear Console
```javascript
console.clear()
```

---

## 🐛 Common Debugging Scenarios

### Scenario 1: "Unknown" Appears
```javascript
// 1. Filter console for: DirectMessageView
// 2. Look for: [DirectMessageView] Enriched message:
// 3. Check if sender.display_name is "Unknown"
// 4. If yes, sender wasn't found in:
//    - Backend response
//    - Current user data
//    - Friends list
```

### Scenario 2: Avatar Broken
```javascript
// 1. Filter console for: directMessageService
// 2. Look for: [directMessageService] API Response:
// 3. Check if sender.avatar_url exists
// 4. Open Network tab
// 5. Check GET /api/messages/direct/X response
// 6. Look for avatar_url in sender object
```

### Scenario 3: Messages Not Loading
```javascript
// 1. Filter console for: DirectMessagesContext
// 2. Look for: [DirectMessagesContext] Received messages
// 3. If Array(0) = no messages exist
// 4. If Array(n) = messages loaded but not rendering
// 5. Check for errors in console
```

### Scenario 4: Message Won't Send
```javascript
// 1. Filter console for: DirectMessagesContext
// 2. Look for: [DirectMessagesContext] Sending message
// 3. Check for error messages
// 4. Open Network tab
// 5. Look for POST /api/messages/direct/send request
// 6. Check Response tab for error details
```

---

## 🔧 File Locations

### Backend
```
Backend/routes/messages.py          ← Fixed endpoints
Backend/app.py                      ← Run this
Backend/requirements.txt            ← Dependencies
```

### Frontend
```
Frontend/src/components/DirectMessageView.tsx       ← Message enrichment
Frontend/src/contexts/DirectMessagesContext.tsx    ← State logging
Frontend/src/services/directMessageService.ts      ← API logging
Frontend/package.json                              ← Dependencies
Frontend/src/types/index.ts                        ← Type definitions
```

### Documentation
```
DIRECT_MESSAGE_ISSUES.md            ← Overview
DEBUG_DM_ISSUES.md                  ← Debugging guide
TESTING_CHECKLIST.md                ← Test cases
DETAILED_CHANGES.md                 ← Code changes
FIX_SUMMARY.md                      ← Quick summary
BEFORE_AFTER_VISUAL.md              ← Visual comparison
IMPLEMENTATION_STATUS.md            ← Status report
```

---

## ✅ Verification Checklist (Quick Version)

- [ ] Backend runs on http://localhost:5000
- [ ] Frontend runs on http://localhost:5173
- [ ] Can login
- [ ] Can open DM with friend
- [ ] Console shows DirectMessage logs
- [ ] Sender name displays (not "Unknown")
- [ ] Avatar loads correctly
- [ ] Can send message
- [ ] Sent message shows with correct sender info
- [ ] Page refresh preserves messages
- [ ] Edit/Delete buttons work

---

## 🎯 Expected Console Output (Copy to Compare)

When everything works, you should see:

```javascript
[directMessageService] Fetching DMs for user: 456
[directMessageService] API Response: Array(3)

[DirectMessagesContext] Received messages from API: Array(3)
[DirectMessagesContext] Messages state updated: Array(3)

[DirectMessageView] Processing message: {...}
[DirectMessageView] Enriched message: {...}
[DirectMessageView] Processing message: {...}
[DirectMessageView] Enriched message: {...}
[DirectMessageView] Processing message: {...}
[DirectMessageView] Enriched message: {...}
[DirectMessageView] All enriched messages: Array(3)
```

If you see this, it's working! ✅

---

## 📱 Browser DevTools Tips

### DevTools Panels
```
F12                    Open DevTools
F12 then click Console Go to Console tab
F12 then click Network  Go to Network tab
Ctrl+Shift+K          Quick open Console
```

### Console Tricks
```javascript
// Copy-paste in console to enable live filtering:
// (Shows only DirectMessage logs)

// Get current messages from context
JSON.stringify(messages)

// Get current friends list
JSON.stringify(friends)

// Get current user
JSON.stringify({userId, username, displayName})
```

### Network Tab Tips
```
1. Open Network tab
2. Send a message
3. Look for POST /api/messages/direct/send
4. Click it
5. Go to Response tab to see exact data returned
6. Check Headers tab for Authorization
```

---

## 🚨 Error Messages & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "Cannot read property 'display_name' of undefined" | sender is null | Check backend returns sender object |
| "ModuleNotFoundError: No module named 'flask'" | venv not activated | Run `venv\Scripts\activate` |
| "CORS error" | Backend not running | Start backend on localhost:5000 |
| "401 Unauthorized" | Token expired | Logout and login again |
| "avataaars/svg?seed=undefined" | Avatar fallback triggered | sender data missing in enrichment |

---

## 🔐 Security Notes

When testing with curl:
- Never commit tokens to git
- Token appears in Local Storage → Application tab
- Don't share tokens publicly
- Tokens expire (logout = new token needed)
- Backend validates auth on every request

---

## 📈 Performance Tips

### If app is slow:
1. Check Network tab for slow requests
2. Look at response size (should be < 100KB)
3. Check if too many messages loaded (should be < 50)
4. Check DevTools Performance tab

### If console is slow:
1. Stop filtering by DirectMessage
2. Refresh page to clear logs
3. Use more specific filters
4. Open console in new window (F12)

---

## 🎓 Learning Resources

Within this project:
- **BEFORE_AFTER_VISUAL.md** - See the transformation
- **DETAILED_CHANGES.md** - Understand each change
- **DEBUG_DM_ISSUES.md** - Deep dive into debugging
- **TESTING_CHECKLIST.md** - Complete test procedures

---

## 💾 Save Points (If Things Break)

### Current State (What You Have Now)
- ✅ Backend routes fixed
- ✅ Frontend enrichment added
- ✅ Console logging implemented
- ✅ All TypeScript checks pass
- ✅ Fully documented

If you need to revert, you have backups of:
- Backend/routes/messages.py
- Frontend/src/components/DirectMessageView.tsx
- Frontend/src/contexts/DirectMessagesContext.tsx
- Frontend/src/services/directMessageService.ts

---

## 🎉 Success Indicators

When you see these, you're done:

```javascript
✅ [DirectMessageView] Processing message: {...}
✅ [DirectMessageView] Enriched message: {sender: {display_name: "Alice"}}
✅ [DirectMessageView] All enriched messages: Array(n)
```

And in the UI:
```
✅ Sender names are visible
✅ Avatars are displayed
✅ No "Unknown" anywhere
✅ Messages are readable and organized
```

---

**You're all set! Start the servers and test! 🚀**
