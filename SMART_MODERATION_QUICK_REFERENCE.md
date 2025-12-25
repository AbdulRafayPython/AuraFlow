# Smart Moderation Agent - Quick Reference

## 🚀 Quick Start

### Test the Agent
```bash
# Backend test
cd Backend
python test_moderation.py

# Start servers
python app.py  # Terminal 1
cd ../Frontend && npm run dev  # Terminal 2
```

### Send Test Messages
```
✅ Clean: "Hello world, how are you?"
⚠️  Warn: "This is some damn good work"
🚩 Flag: "You're such an idiot, shut up"
🚫 Block: "You fucking terrorist scum, die"
```

## 📋 Implementation Checklist

- [x] Backend integration (sockets.py, messages.py)
- [x] Frontend UI (ModerationToast, ModerationBadge)
- [x] Database logging (ai_agent_logs)
- [x] Socket.IO events (message_blocked, moderation_warning, moderation_alert)
- [x] Multi-language support (English + Roman Urdu)
- [x] Testing suite (test_moderation.py)
- [x] Documentation (3 MD files)

## 🎯 Key Features

| Feature | Status | Details |
|---------|--------|---------|
| Real-time moderation | ✅ | Via Socket.IO on every message |
| REST API moderation | ✅ | Via POST /api/messages |
| English detection | ✅ | 12 profanity + 11 hate + 11 harassment |
| Roman Urdu detection | ✅ | 16 profanity + 6 hate + 9 harassment |
| Spam detection | ✅ | Repeated chars, caps, emojis, links |
| PII detection | ✅ | Phone, email, credit card |
| User tracking | ✅ | 24-hour violation history |
| Frontend badges | ✅ | Color-coded by severity |
| Toast notifications | ✅ | Block/warn/alert toasts |
| Database logging | ✅ | All actions logged to ai_agent_logs |

## 🔢 Severity Thresholds

```python
Score >= 0.9 → BLOCK (high)     # 🚫 Message not sent
Score >= 0.6 → FLAG (medium)    # 🚩 Visible with badge + moderator alert
Score >= 0.3 → WARN (low)       # ⚠️  Visible with warning toast
Score <  0.3 → ALLOW (none)     # ✅ Normal display
```

## 📁 Files Modified/Created

### Backend (3 files)
1. `routes/sockets.py` - Added moderation to on_new_message handler
2. `routes/messages.py` - Added moderation to send_message endpoint
3. `test_moderation.py` - **NEW** automated test suite

### Frontend (5 files)
1. `components/ModerationToast.tsx` - **NEW** socket event listener
2. `components/ModerationBadge.tsx` - **NEW** visual indicator
3. `App.tsx` - Added ModerationToastListener
4. `pages/Dashboard.tsx` - Added ModerationBadge to messages
5. `types/index.ts` - Added moderation field to Message interface

### Documentation (3 files)
1. `SMART_MODERATION_IMPLEMENTATION.md` - **NEW** full implementation details
2. `SMART_MODERATION_TESTING_GUIDE.md` - **NEW** testing scenarios
3. `SMART_MODERATION_ARCHITECTURE.md` - **NEW** architecture diagrams

## 🔊 Socket Events

### Server → Client
| Event | Recipient | Purpose |
|-------|-----------|---------|
| `message_received` | All in channel | Broadcast clean/flagged/warned message |
| `message_blocked` | Sender only | Notify sender their message was blocked |
| `moderation_warning` | Sender only | Warn sender about content |
| `moderation_alert` | Moderators room | Alert moderators of violation |

## 🎨 UI Components

### ModerationBadge
```tsx
<ModerationBadge
  action="flag"           // allow | warn | flag | block
  severity="medium"       // none | low | medium | high
  reasons={['profanity']} // Array of violation reasons
/>
```

**Colors:**
- 🟡 Yellow: Warning (low severity)
- 🟠 Orange: Flagged (medium severity)
- 🔴 Red: Blocked (high severity)

### ModerationToast
Auto-listens to socket events and shows toasts:
- Red destructive toast for blocked messages
- Yellow warning toast for content warnings
- Colored alert toast for moderator notifications

## 🗄️ Database Schema

```sql
-- ai_agent_logs table
CREATE TABLE ai_agent_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    channel_id INT,
    action_type VARCHAR(50),        -- 'moderation'
    input_text TEXT,                -- Original message
    output_text TEXT,               -- JSON: {action, severity, reasons}
    confidence_score FLOAT,         -- 0.0 to 1.0
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (channel_id) REFERENCES channels(id)
);
```

**Query recent violations:**
```sql
SELECT 
    u.username,
    l.input_text,
    l.output_text,
    l.confidence_score,
    l.created_at
FROM ai_agent_logs l
JOIN users u ON l.user_id = u.id
WHERE l.action_type = 'moderation'
ORDER BY l.created_at DESC
LIMIT 20;
```

## 🧪 Test Commands

### Backend Unit Test
```bash
cd Backend
python test_moderation.py
```

**Expected output:**
```
SMART MODERATION AGENT - TEST SUITE
====================================

Running tests...

1. Clean Message
   Text: "Hello everyone, how are you doing today?"
   Expected: allow
   Result: ALLOW (severity: none, confidence: 0.0)
   ✅ PASS

2. Mild Profanity
   Text: "This is some damn good work!"
   Expected: warn
   Result: WARN (severity: low, confidence: 0.3)
   Reasons: profanity
   ✅ PASS

[... 8 more tests ...]

RESULTS: 10 passed, 0 failed out of 10 tests
```

### Manual Integration Test
1. Start servers (backend + frontend)
2. Login with two accounts
3. Join same channel
4. Send from Account 1: "You're a fucking idiot"
5. Verify on Account 1: Red toast "Message Blocked"
6. Verify on Account 2: Message NOT visible
7. Check database: New row in ai_agent_logs

## 🐛 Troubleshooting

### Issue: Messages not being moderated
**Check:**
1. ModerationAgent imported in sockets.py
2. Lexicon file exists at `Backend/lexicons/moderation_keywords.json`
3. No Python errors in backend terminal
4. Socket.IO connected (check frontend console)

### Issue: Frontend not showing badges
**Check:**
1. ModerationBadge imported in Dashboard.tsx
2. Message interface includes moderation field
3. Backend sending moderation data in message object
4. No TypeScript errors in frontend

### Issue: Toasts not appearing
**Check:**
1. ModerationToastListener added to App.tsx
2. Socket events firing (check browser console)
3. Toaster component present in App.tsx
4. useToast hook working

## 📊 Violation Reasons

| Reason Code | Description |
|-------------|-------------|
| `profanity` | English or Roman Urdu profanity detected |
| `hate_speech` | Hate speech, threats, or violent language |
| `harassment` | Direct insults, bullying, or harassment |
| `spam` | Repeated chars, caps, emojis, or links |
| `personal_information_detected` | Phone, email, or credit card detected |
| `repeat_offender` | 3+ violations in 24 hours |

## 🔐 Security Features

- ✅ Server-side validation (can't bypass from client)
- ✅ User ID verification before logging
- ✅ Channel access control
- ✅ SQL injection prevention (parameterized queries)
- ✅ Rate limiting via violation tracking
- ✅ Personal information detection
- ✅ Audit trail in database

## 🎓 System Prompt Compliance

Your original system prompt requirements:

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Keep conversations safe | ✅ | Blocks toxic content in real-time |
| Silent operation | ✅ | System messages only, no shaming |
| Fair and explainable | ✅ | Shows reasons for all actions |
| Multi-language support | ✅ | English + Roman Urdu lexicons |
| Context-aware | ✅ | Checks user history, patterns |
| Detect text, emojis, patterns | ✅ | All supported |
| 3 categories (Clean/Suspicious/Toxic) | ✅ | Mapped to Allow/Warn-Flag/Block |
| Roman Urdu spelling variants | ✅ | Basic normalization in lexicon |
| Graduated actions | ✅ | Warn → Flag → Block |
| Never ban users | ✅ | Only hides messages, recommends actions |
| Provide clear reasons | ✅ | Reasons array in all responses |

## 💡 Quick Examples

### Example 1: Clean Message
```javascript
// Input
"Hey team, great work on the project!"

// Moderation Result
{
  action: 'allow',
  severity: 'none',
  confidence: 0.0,
  reasons: []
}

// Frontend: Message displays normally, no badge
```

### Example 2: Flagged Message
```javascript
// Input
"Shut up idiot, you don't know anything"

// Moderation Result
{
  action: 'flag',
  severity: 'medium',
  confidence: 0.75,
  reasons: ['harassment']
}

// Frontend: 
// - Message visible with orange "Flagged for review" badge
// - Moderators receive alert toast
```

### Example 3: Blocked Message
```javascript
// Input
"You fucking terrorist scum, go die"

// Moderation Result
{
  action: 'block',
  severity: 'high',
  confidence: 0.95,
  reasons: ['profanity', 'hate_speech']
}

// Frontend:
// - Sender sees red "Message Blocked" toast
// - Message NOT broadcast to channel
// - Moderators receive alert
```

## 📞 Support

**Documentation:**
- Full implementation: `SMART_MODERATION_IMPLEMENTATION.md`
- Testing guide: `SMART_MODERATION_TESTING_GUIDE.md`
- Architecture: `SMART_MODERATION_ARCHITECTURE.md`

**Files to check:**
- Backend: `routes/sockets.py`, `routes/messages.py`, `agents/moderation.py`
- Frontend: `components/ModerationToast.tsx`, `components/ModerationBadge.tsx`
- Tests: `Backend/test_moderation.py`

**Database:**
- Table: `ai_agent_logs`
- Query: `SELECT * FROM ai_agent_logs WHERE action_type = 'moderation' ORDER BY created_at DESC`

---

**Status: ✅ Production Ready**

Last Updated: December 22, 2025
Version: 1.0.0
