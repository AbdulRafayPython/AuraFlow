# Smart Moderation Agent - Testing Guide

## Overview
The Smart Moderation Agent is now fully integrated with AuraFlow's real-time messaging system. It monitors all messages in channels and provides automatic content moderation based on toxicity, spam, harassment, and hate speech detection.

## Features Implemented

### 🔍 Real-time Content Moderation
- **Socket.IO Integration**: All messages sent via WebSocket are automatically moderated before broadcast
- **REST API Integration**: Messages sent via HTTP POST are also moderated
- **Lexicon-based Detection**: Uses moderation_keywords.json for English and Roman Urdu
- **Context-aware**: Considers user violation history for repeat offenders

### 🎯 Moderation Actions

#### ✅ ALLOW (Clean)
- Normal messages with no violations
- No visual indicator shown
- Message broadcasts normally

#### ⚠️ WARN (Low severity)
- Mild profanity or borderline content
- Confidence: 0.3 - 0.59
- **Frontend**: Shows yellow warning toast to sender
- **Backend**: Logs to database, broadcasts message normally

#### 🚩 FLAG (Medium severity)
- Harassment, spam, or repeated violations
- Confidence: 0.6 - 0.89
- **Frontend**: 
  - Shows orange flagged badge on message
  - Sends alert to moderators room
  - Message still visible to all users
- **Backend**: Logs to database for moderator review

#### 🚫 BLOCK (High severity)
- Hate speech, threats, severe profanity
- Confidence: 0.9+
- **Frontend**:
  - Message not broadcast to channel
  - Shows red "Message Blocked" toast to sender only
  - Sends alert to moderators room
- **Backend**: Logs to database, message not saved

### 📊 Detection Categories

1. **Profanity**
   - English: damn, hell, shit, fuck, bitch, ass, etc.
   - Roman Urdu: harami, kutta, gandu, chutiya, bhenchod, etc.

2. **Hate Speech**
   - English: hate, kill, terrorist, scum, etc.
   - Roman Urdu: nafrat, maro, kafir, etc.

3. **Harassment**
   - English: shut up, idiot, loser, disgusting, etc.
   - Roman Urdu: chup kar, bewakoof, pagal, bhag yahan se, etc.

4. **Spam Detection**
   - Repeated characters (5+ in a row)
   - Excessive CAPS (10+ consecutive)
   - Emoji spam (10+ emojis)
   - Link spam (3+ links)

5. **Personal Information**
   - Phone numbers
   - Email addresses
   - Credit card numbers

### 🔄 User Violation Tracking
- Tracks violations in last 24 hours
- 3+ violations → auto-escalate to BLOCK
- Stored in `ai_agent_logs` table

## Testing Scenarios

### Test 1: Clean Message
```
Message: "Hello everyone, how are you doing today?"
Expected: ✅ Allow - No moderation badge shown
```

### Test 2: Mild Profanity (WARN)
```
Message: "This is some damn good work!"
Expected: ⚠️ Warning toast shown to sender
```

### Test 3: Roman Urdu Profanity (FLAG)
```
Message: "Ye kya bakwas hai yaar"
Expected: 🚩 Flagged badge shown, moderator alerted
```

### Test 4: Severe Hate Speech (BLOCK)
```
Message: "You're such a terrorist scum, go die"
Expected: 🚫 Message blocked, red toast shown, not visible in channel
```

### Test 5: Spam (FLAG)
```
Message: "HELLOOOOO!!!!!!!!!! 😀😀😀😀😀😀😀😀😀😀😀😀"
Expected: 🚩 Flagged for spam
```

### Test 6: Personal Information (FLAG)
```
Message: "Call me at +92-300-1234567"
Expected: 🚩 Flagged for personal_information_detected
```

### Test 7: Harassment Pattern (BLOCK)
```
Message: "Shut up idiot, you're worthless trash"
Expected: 🚫 Blocked (multiple harassment terms)
```

### Test 8: Roman Urdu Harassment (FLAG)
```
Message: "Chup kar bewakoof, nikal yahan se"
Expected: 🚩 Flagged
```

### Test 9: Repeat Offender
```
1. Send: "damn" → Warning
2. Send: "shit" → Warning
3. Send: "hell" → Warning
4. Send: "crap" → BLOCKED (4th violation in 24 hours)
Expected: Escalation to block after 3 violations
```

## Frontend Components

### 1. ModerationToast.tsx
- Listens to socket events: `message_blocked`, `moderation_warning`, `moderation_alert`
- Shows colored toasts based on severity
- Integrated in App.tsx

### 2. ModerationBadge.tsx
- Visual indicator on messages
- Color-coded by action:
  - 🟡 Yellow: Warning
  - 🟠 Orange: Flagged
  - 🔴 Red: Blocked
- Shows reasons on hover

### 3. Dashboard.tsx
- Displays moderation badge next to author name
- Only shown for flagged/warned messages

## Backend Files Modified

### 1. routes/sockets.py
- Added `moderation_agent = ModerationAgent()` initialization
- Modified `on_new_message()` handler to check all messages
- Emits different events based on action:
  - `message_received`: Clean/warn/flag messages
  - `message_blocked`: Blocked messages (to sender only)
  - `moderation_warning`: Warning notice (to sender)
  - `moderation_alert`: Alert to moderators room

### 2. routes/messages.py
- Added moderation check in `send_message()` endpoint
- Returns 403 error if message blocked
- Includes moderation data in response

### 3. agents/moderation.py
- Core moderation logic
- Uses `lexicons/moderation_keywords.json`
- Methods:
  - `moderate_message()`: Main entry point
  - `_check_profanity()`: Profanity detection
  - `_check_hate_speech()`: Hate speech detection
  - `_check_harassment()`: Harassment detection
  - `_check_spam()`: Spam pattern detection
  - `_check_personal_info()`: PII detection
  - `_log_moderation_action()`: Database logging

## Database Schema

### ai_agent_logs table
```sql
CREATE TABLE ai_agent_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    channel_id INT,
    action_type VARCHAR(50), -- 'moderation'
    input_text TEXT, -- Original message
    output_text TEXT, -- JSON with action/severity/reasons
    confidence_score FLOAT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (channel_id) REFERENCES channels(id)
);
```

## Socket.IO Events

### Client → Server
- `new_message`: Send a message to channel

### Server → Client
- `message_received`: Broadcast clean/flagged message
- `message_blocked`: Notify sender their message was blocked
- `moderation_warning`: Warn sender about content
- `moderation_alert`: Notify moderators of violation

## Configuration

### Severity Thresholds (in moderation.py)
```python
if max_score >= 0.9:
    action = 'block'
    severity = 'high'
elif max_score >= 0.6:
    action = 'flag'
    severity = 'medium'
elif max_score >= 0.3:
    action = 'warn'
    severity = 'low'
```

### Lexicon Location
```
Backend/lexicons/moderation_keywords.json
```

## How to Test

### 1. Start Backend
```bash
cd Backend
python app.py
```

### 2. Start Frontend
```bash
cd Frontend
npm run dev
```

### 3. Test Flow
1. Login to two different accounts
2. Join the same channel
3. Send test messages from one account
4. Observe moderation actions:
   - Blocked: Only sender sees red toast, message doesn't appear
   - Flagged: Orange badge appears, moderators alerted
   - Warning: Yellow toast to sender, message visible
   - Clean: No badge, normal display

### 4. Check Database Logs
```sql
SELECT * FROM ai_agent_logs 
WHERE action_type = 'moderation' 
ORDER BY created_at DESC 
LIMIT 10;
```

## Moderation Agent System Prompt (Implemented)

✅ Silent operation (no user shaming)
✅ Fair and explainable (shows reasons)
✅ Context-aware (checks user history)
✅ Multi-language (English + Roman Urdu)
✅ Graduated responses (warn → flag → block)
✅ Moderator alerts (for review)
✅ Real-time integration (Socket.IO + REST)
✅ Database logging (audit trail)

## Known Limitations

1. **No ML/AI**: Currently uses lexicon-based detection only
2. **False Positives**: Context-dependent phrases may trigger incorrectly
3. **Spelling Variations**: Limited normalization for Roman Urdu
4. **No Image Moderation**: Text-only currently

## Future Enhancements

1. Add spell normalization for Roman Urdu (pagal, pagaaal, pgl → pagal)
2. Integrate sentiment analysis API for better context
3. Add moderator dashboard for reviewing flagged messages
4. Implement appeal system for blocked users
5. Add image/file content moderation
6. Machine learning model training on flagged messages
