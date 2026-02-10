# Moderation Agent Documentation

## Overview

The **Moderation Agent** is an AI-powered content moderation system for AuraFlow that automatically detects and handles inappropriate content. It supports both English and Roman Urdu languages, making it perfect for diverse communities.

---

## Table of Contents

1. [Purpose](#purpose)
2. [How It Works](#how-it-works)
3. [Detection Categories](#detection-categories)
4. [Code Structure](#code-structure)
5. [Main Methods](#main-methods)
6. [Actions and Severity](#actions-and-severity)
7. [Usage Examples](#usage-examples)

---

## Purpose

The Moderation Agent serves to:
- **Detect harmful content** - Profanity, hate speech, harassment
- **Identify spam** - Repeated characters, excessive caps, link spam
- **Protect privacy** - Detect shared personal information
- **Support multiple languages** - English and Roman Urdu
- **Track repeat offenders** - Monitor user violation history

---

## How It Works

### Simple Explanation

Think of the Moderation Agent like a security guard who:
1. **Reads every message** - Checks content against known bad patterns
2. **Understands context** - Knows different languages and variations
3. **Decides on action** - Allow, warn, flag, or block
4. **Remembers history** - Tracks users who repeatedly break rules

### Technical Flow

```
Message → Check Categories → Calculate Scores → Determine Action → Log Result
   ↓            ↓                  ↓                  ↓              ↓
 Text      Profanity           0.0 - 1.0          allow/         Database
           Hate Speech          (each             warn/           Record
           Harassment          category)          flag/
           Spam                                   block
           Personal Info
```

---

## Detection Categories

### 1. Profanity Detection
Checks for inappropriate words in:
- **English** - Common profanity words
- **Roman Urdu** - Pakistani/Urdu profanity

```python
# Score calculation
score = min(len(profanity_words) * 0.3, 0.95)
```

### 2. Hate Speech Detection
Identifies discriminatory language targeting:
- Race, religion, gender, nationality
- Both English and Roman Urdu variants

```python
# Hate speech is always severe
score = min(0.7 + len(hate_words) * 0.1, 0.98)
```

### 3. Harassment Detection
Detects:
- Personal attacks
- Threats
- Bullying language

```python
score = min(len(harassment_words) * 0.4, 0.9)
```

### 4. Spam Detection
Identifies spam patterns:

| Pattern | Example | Description |
|---------|---------|-------------|
| Repeated characters | "hellloooo" | Same char 3+ times |
| Excessive caps | "BUY NOW!!!" | Too many capital letters |
| Excessive emojis | "😀😀😀😀😀😀" | More than threshold |
| Link spam | Multiple URLs | Too many links in one message |

### 5. Personal Information Detection
Protects users by detecting:
- **Phone numbers** - Various formats
- **Email addresses** - Standard email patterns
- **Credit card numbers** - Card number patterns

---

## Code Structure

### Class Definition

```python
class ModerationAgent:
    """
    Smart content moderation with context awareness
    Detects profanity, hate speech, harassment, spam, and personal info
    """
    
    def __init__(self):
        self.lexicon_path = 'lexicons/moderation_keywords.json'
        self.load_lexicons()
```

### Lexicon Structure

The agent loads patterns from `moderation_keywords.json`:

```json
{
    "profanity": {
        "english": ["word1", "word2", ...],
        "roman_urdu": ["word1", "word2", ...]
    },
    "hate_speech": {
        "english": [...],
        "roman_urdu": [...]
    },
    "harassment": {
        "english": [...],
        "roman_urdu": [...]
    },
    "spam_patterns": {
        "repeated_characters": {"pattern": "..."},
        "excessive_caps": {"pattern": "..."},
        "excessive_emojis": {"threshold": 10},
        "link_spam": {"pattern": "...", "max_links": 3}
    },
    "personal_info_patterns": {
        "phone": {"pattern": "..."},
        "email": {"pattern": "..."},
        "credit_card": {"pattern": "..."}
    }
}
```

---

## Main Methods

### 1. `moderate_message(text, user_id, channel_id, message_id, log)`

**What it does:** Analyzes a message and determines the appropriate action.

**Parameters:**
- `text` (str): Message content to check
- `user_id` (int): User who sent the message
- `channel_id` (int): Channel where message was sent
- `message_id` (int, optional): Message ID for logging
- `log` (bool): Whether to log the action (default: True)

**Returns:**
```python
{
    'action': 'flag',           # allow | warn | flag | block
    'severity': 'medium',       # none | low | medium | high
    'confidence': 0.65,         # 0.0 to 1.0
    'reasons': ['profanity', 'spam'],
    'scores': {
        'profanity': 0.60,
        'hate_speech': 0.0,
        'harassment': 0.0,
        'spam': 0.25
    },
    'personal_info_detected': False,
    'personal_info_types': []
}
```

### 2. `_check_profanity(text)`

**What it does:** Scans text for profane words.

**Returns:** Score from 0.0 to 0.95

**How it works:**
```python
# Uses word boundary matching for accuracy
for word in profanity_list:
    if re.search(r'\b' + word + r'\b', text, re.IGNORECASE):
        profanity_words.append(word)

# Score based on count
return min(len(profanity_words) * 0.3, 0.95)
```

### 3. `_check_hate_speech(text)`

**What it does:** Detects discriminatory language.

**Returns:** Score from 0.0 to 0.98

**Note:** Hate speech starts at a higher base score (0.7) because it's more serious.

### 4. `_check_harassment(text)`

**What it does:** Identifies bullying or threatening language.

**Returns:** Score from 0.0 to 0.9

### 5. `_check_spam(text)`

**What it does:** Detects spam patterns.

**Checks:**
- Repeated characters (e.g., "hellooooo")
- Excessive capital letters
- Too many emojis
- Multiple links

### 6. `_check_personal_info(text)`

**What it does:** Detects potentially shared personal information.

**Returns:**
```python
{
    'detected': True,
    'types': ['phone_number', 'email_address']
}
```

### 7. `_get_user_violation_count(user_id, hours)`

**What it does:** Counts user's recent violations to identify repeat offenders.

**Important:** Users with 3+ violations in 24 hours are treated more strictly.

### 8. `get_user_moderation_history(user_id, limit)`

**What it does:** Retrieves a user's moderation history.

---

## Actions and Severity

### Action Levels

| Action | When Applied | Effect |
|--------|--------------|--------|
| **allow** | Score < 0.3, no issues | Message passes through |
| **warn** | Score 0.3 - 0.59 | User gets warning |
| **flag** | Score 0.6 - 0.89, or personal info | Message flagged for review |
| **block** | Score ≥ 0.9, or repeat offender | Message blocked |

### Severity Levels

| Severity | Score Range | Meaning |
|----------|-------------|---------|
| **none** | 0 | No issues |
| **low** | 0.3 - 0.59 | Minor violation |
| **medium** | 0.6 - 0.89 | Moderate violation |
| **high** | ≥ 0.9 | Severe violation |

### Repeat Offender Handling

```python
# Check user's recent violations
user_violations = self._get_user_violation_count(user_id, hours=24)

if user_violations >= 3 and action != 'allow':
    action = 'block'        # Escalate to block
    severity = 'high'
    reason.append('repeat_offender')
```

---

## Usage Examples

### Example 1: Basic Message Moderation

```python
from agents.moderation import ModerationAgent

agent = ModerationAgent()

# Check a message
result = agent.moderate_message(
    text="Hello everyone!",
    user_id=123,
    channel_id=456
)

print(f"Action: {result['action']}")  # "allow"
print(f"Confidence: {result['confidence']}")  # 0.0
```

### Example 2: Detecting Problematic Content

```python
# Check a potentially problematic message
result = agent.moderate_message(
    text="Buy now!!! Click here http://spam.com http://spam2.com",
    user_id=123,
    channel_id=456
)

print(f"Action: {result['action']}")  # "warn" or "flag"
print(f"Reasons: {result['reasons']}")  # ['spam']
print(f"Spam Score: {result['scores']['spam']}")
```

### Example 3: Personal Info Detection

```python
# Check for personal information
result = agent.moderate_message(
    text="My phone is 0300-1234567 and email is test@example.com",
    user_id=123,
    channel_id=456
)

if result['personal_info_detected']:
    print(f"Warning! Detected: {result['personal_info_types']}")
    # ["phone_number", "email_address"]
```

### Example 4: Check User History

```python
# Get moderation history for a user
history = agent.get_user_moderation_history(user_id=123, limit=10)

for record in history:
    print(f"Date: {record['created_at']}")
    print(f"Message: {record['message'][:50]}...")
    print(f"Action: {record['action']}")
```

---

## Database Integration

### Logging Moderation Actions

When `log=True` and action is not 'allow', the agent logs to `ai_agent_logs`:

```sql
INSERT INTO ai_agent_logs 
    (agent_id, user_id, channel_id, message_id, action_type, 
     input_text, output_text, confidence_score)
VALUES 
    (1, 123, 456, 789, 'moderation',
     'Message content here...',
     '{"action": "flag", "severity": "medium", ...}',
     0.65)
```

### Querying Violation History

```sql
SELECT COUNT(*) 
FROM ai_agent_logs
WHERE user_id = 123 
  AND action_type = 'moderation'
  AND created_at >= NOW() - INTERVAL 24 HOUR
  AND (output_text LIKE '%block%' OR output_text LIKE '%flag%')
```

---

## Language Support

### Roman Urdu Examples

The agent understands Roman Urdu (Urdu written in English letters):

| Type | Examples |
|------|----------|
| Profanity | Various Roman Urdu curse words |
| Hate Speech | Discriminatory terms in Roman Urdu |
| Harassment | Threatening phrases in Roman Urdu |

### How Language Detection Works

```python
# Check English profanity (word boundary matching)
for word in english_profanity:
    if re.search(r'\b' + word + r'\b', text, re.IGNORECASE):
        found.append(word)

# Check Roman Urdu profanity (substring matching)
# Word boundaries don't work well for Roman Urdu
for word in roman_urdu_profanity:
    if word in text:
        found.append(word)
```

---

## Summary

The Moderation Agent keeps AuraFlow communities safe by:
- ✅ Detecting profanity in English and Roman Urdu
- ✅ Identifying hate speech and harassment
- ✅ Catching spam patterns
- ✅ Protecting personal information
- ✅ Tracking repeat offenders
- ✅ Providing graduated responses (warn → flag → block)

It's your automated community guardian! 🛡️
