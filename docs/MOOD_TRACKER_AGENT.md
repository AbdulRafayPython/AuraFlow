# Mood Tracker Agent Documentation

## Overview

The **Mood Tracker Agent** is an advanced AI-powered component of AuraFlow that analyzes user messages to detect emotional states. It supports both English and Roman Urdu with a hybrid approach combining lexicon-based analysis and Google Translate + TextBlob for comprehensive sentiment detection.

---

## Table of Contents

1. [Purpose](#purpose)
2. [How It Works](#how-it-works)
3. [Key Features](#key-features)
4. [Code Structure](#code-structure)
5. [Main Methods](#main-methods)
6. [Sentiment Analysis Process](#sentiment-analysis-process)
7. [Usage Examples](#usage-examples)

---

## Purpose

The Mood Tracker Agent serves to:
- **Analyze sentiment** - Detect positive, negative, or neutral emotions
- **Support Roman Urdu** - Understand "khush hun", "udaas hun", etc.
- **Track mood trends** - Monitor how user mood changes over time
- **Detect specific emotions** - Joy, sadness, anger, love, anxiety, etc.
- **Handle text variations** - Normalize spelling like "achaaa" → "acha"

---

## How It Works

### Simple Explanation

Think of the Mood Tracker like an empathetic friend who:
1. **Reads your messages** - Looks at what you're saying
2. **Understands emotions** - Recognizes both words and emojis
3. **Knows your language** - Understands Roman Urdu and English
4. **Tracks patterns** - Notices if you're feeling better or worse over time

### Technical Flow

```
Message → Normalize Text → Lexicon Check → Translation (if needed) → TextBlob → Final Score
   ↓           ↓               ↓                  ↓                    ↓           ↓
 Input     "achaaa"→        Match words      Roman Urdu→          Analyze      positive/
           "acha"           in sentiment     English              English      negative/
                           dictionary                             text         neutral
```

### Hybrid Approach

```
┌─────────────────────────────────────────────────────────┐
│                   HYBRID ANALYSIS                        │
├─────────────────────────────────────────────────────────┤
│ 1. Lexicon Analysis (Fast, trusted for Roman Urdu)      │
│    ↓                                                    │
│ 2. IF no lexicon hits → Google Translate + TextBlob    │
│    ↓                                                    │
│ 3. IF lexicon hits → TextBlob validates/boosts         │
└─────────────────────────────────────────────────────────┘
```

---

## Key Features

### 1. Multi-Language Support
- **English** - Standard sentiment words
- **Roman Urdu** - "khush", "udaas", "pareshan", etc.
- **Urdu Script** - خوش، اداس، پریشان

### 2. Text Normalization
Handles common spelling variations:
```python
NORMALIZATION_PATTERNS = {
    r'a{2,}': 'a',      # aaa → a
    r'h{2,}': 'h',      # hh → h
    r'!{2,}': '!',      # !! → !
}
# Example: "achaaaa" → "acha", "happyyy" → "happy"
```

### 3. Negation Handling
Understands when sentiment is reversed:
```python
NEGATION_WORDS = [
    'nahi', 'nai', 'na', 'mat',      # Roman Urdu
    'not', 'no', 'never', "don't",   # English
]
# "khush nahi hun" → NEGATIVE (not happy)
```

### 4. Mood Categories
Detects specific emotions:

| Category | Keywords |
|----------|----------|
| **Joy** | khushi, happy, khush, maza |
| **Sadness** | udaas, sad, gham, dukh |
| **Anger** | gussa, angry, naraz |
| **Fear** | dar, fear, scared, khauf |
| **Love** | pyar, muhabbat, love, ishq |
| **Anxiety** | pareshan, worried, tension |
| **Hope** | umeed, hope, inshallah |
| **Gratitude** | shukriya, thanks, grateful |
| **Excitement** | excited, josh, amazing |

### 5. Emoji Analysis
Recognizes emotional emojis:
```python
Positive: 😊 😃 ❤️ 👍 🎉
Negative: 😢 😞 😡 💔 😭
Neutral: 🤔 😐 👀
```

---

## Code Structure

### Class Definition

```python
class MoodTrackerAgent:
    """
    Tracks user mood and emotional state based on message content
    Supports Roman Urdu and emoji analysis with advanced features
    """
    
    def __init__(self):
        self.lexicon_path = 'lexicons/roman_urdu_sentiments.json'
        self.load_lexicons()
        self._init_translator()  # Google Translate
```

### Dependencies

| Library | Purpose |
|---------|---------|
| `googletrans` | Translate Roman Urdu → English |
| `textblob` | English sentiment analysis |
| `re` | Pattern matching for normalization |

### Lexicon Structure

```json
{
    "positive": {
        "happiness": ["khush", "khushi", "happy", "maza"],
        "gratitude": ["shukriya", "thanks", "meherbani"]
    },
    "negative": {
        "sadness": ["udaas", "sad", "gham", "dukh"],
        "anger": ["gussa", "angry", "naraz"]
    },
    "neutral": {
        "greetings": ["hello", "salam", "hi"]
    },
    "emojis": {
        "positive": ["😊", "😃", "❤️"],
        "negative": ["😢", "😞", "😭"]
    },
    "intensifiers": {
        "positive": ["bohot", "very", "bahut"],
        "negative": ["bilkul", "totally"]
    }
}
```

---

## Main Methods

### 1. `analyze_message(text)`

**What it does:** Analyzes a single message for sentiment.

**Parameters:**
- `text` (str): Message to analyze

**Returns:**
```python
{
    'sentiment': 'positive',           # positive | negative | neutral
    'confidence': 0.85,                # 0.0 to 1.0
    'sentiment_score': 0.667,          # -1.0 to 1.0
    'positive_count': 3,
    'negative_count': 1,
    'neutral_count': 0,
    'emoji_sentiment': {
        'positive': 2,
        'negative': 0,
        'neutral': 0
    },
    'has_intensifier': True,
    'detected_words': {
        'positive': ['khush', 'acha'],
        'negative': [],
        'neutral': []
    },
    'mood_categories': {
        'joy': 2,
        'gratitude': 1
    },
    'primary_mood': 'joy',
    'detected_language': 'roman_urdu',
    'analysis_method': 'hybrid',       # lexicon | hybrid
    'translation': {                   # Only if translated
        'was_translated': True,
        'original_text': 'bohat khush hun',
        'translated_text': 'I am very happy'
    }
}
```

### 2. `track_user_mood(user_id, time_period_hours)`

**What it does:** Analyzes all of a user's messages over a time period.

**Parameters:**
- `user_id` (int): User to track
- `time_period_hours` (int): Time window (default: 24 hours)

**Returns:**
```python
{
    'success': True,
    'mood_id': 123,
    'overall_mood': 'positive',
    'confidence': 0.75,
    'message_count': 45,
    'sentiment_distribution': {
        'positive': 25,
        'negative': 8,
        'neutral': 12
    },
    'trend': 'improving',              # improving | stable | declining
    'dominant_emotions': ['happiness', 'gratitude', 'love'],
    'time_period_hours': 24
}
```

### 3. `_normalize_text(text)`

**What it does:** Normalizes text to handle spelling variations.

**Example:**
```python
"achaaa yaaarrr!!!" → "acha yar!"
```

### 4. `_is_roman_urdu(text)`

**What it does:** Detects if text contains Roman Urdu.

**How it works:**
```python
ROMAN_URDU_INDICATORS = [
    'kya', 'hai', 'hain', 'nahi', 'acha', 'theek',
    'mein', 'main', 'tum', 'aap', 'wo', 'woh'
]

# If >20% of words are indicators, it's Roman Urdu
```

### 5. `_translate_to_english(text, force)`

**What it does:** Translates Roman Urdu to English using Google Translate.

**Returns:**
```python
(translated_text, was_translated)  # ("I am happy", True)
```

### 6. `_check_negation(text, word_position, words)`

**What it does:** Checks if a sentiment word is negated.

**Example:**
```python
"main khush nahi hun"
#     khush ← check 3 words before
# Found "nahi" → negated = True
# "khush" (positive) becomes negative
```

### 7. `_calculate_trend(hourly_sentiment)`

**What it does:** Calculates if mood is improving, stable, or declining.

**Algorithm:**
```python
# Compare first third vs last third of time period
recent_avg = average of recent sentiment scores
earlier_avg = average of earlier sentiment scores

if diff > 0.15:
    return 'improving'
elif diff < -0.15:
    return 'declining'
else:
    return 'stable'
```

---

## Sentiment Analysis Process

### Step-by-Step Breakdown

```
1. NORMALIZE TEXT
   Input: "Bohat khushiii hun!!! 😊😊"
   Output: "bohat khushi hun! 😊😊"

2. EXTRACT EMOJIS
   Found: 😊😊 → positive_emoji_count = 2

3. LEXICON ANALYSIS (PRIMARY)
   Match: "khushi" → positive
   Match: "bohat" → intensifier
   Lexicon Score: positive=1, negative=0

4. CHECK IF TRANSLATION NEEDED
   Roman Urdu detected? YES
   Lexicon hits? YES → Use TextBlob to validate only

5. TEXTBLOB VALIDATION
   Translate: "bohat khushi hun" → "I am very happy"
   TextBlob: sentiment=positive, polarity=0.8
   Result: AGREES with lexicon → Boost confidence

6. CALCULATE FINAL SCORE
   positive_score = (1 + 2 emojis) × 1.5 intensifier = 4.5
   negative_score = 0
   sentiment_score = (4.5 - 0) / (4.5 + 0) = 1.0

7. RESULT
   sentiment: "positive"
   confidence: 0.90
   primary_mood: "joy"
```

### Confidence Calculation

```python
if positive_score > negative_score:
    sentiment = 'positive'
    confidence = min(positive_score / (positive_score + negative_score + 1), 0.95)

# Boost if TextBlob agrees
if textblob_agrees:
    confidence = min(confidence + 0.15, 0.95)
```

---

## Usage Examples

### Example 1: Analyze a Single Message

```python
from agents.mood_tracker import MoodTrackerAgent

agent = MoodTrackerAgent()

# Analyze Roman Urdu message
result = agent.analyze_message("Bohat khush hun aaj! 😊")

print(f"Sentiment: {result['sentiment']}")      # positive
print(f"Confidence: {result['confidence']}")    # 0.85
print(f"Mood: {result['primary_mood']}")        # joy
print(f"Language: {result['detected_language']}")  # roman_urdu
```

### Example 2: Track User Mood Over Time

```python
# Track mood for last 24 hours
mood = agent.track_user_mood(user_id=123, time_period_hours=24)

if mood['success']:
    print(f"Overall Mood: {mood['overall_mood']}")
    print(f"Trend: {mood['trend']}")
    print(f"Emotions: {mood['dominant_emotions']}")
    
    # Distribution
    dist = mood['sentiment_distribution']
    total = sum(dist.values())
    print(f"\nPositive: {dist['positive']}/{total} messages")
    print(f"Negative: {dist['negative']}/{total} messages")
```

### Example 3: Detect Negative Sentiment

```python
# Analyze a negative message
result = agent.analyze_message("Bohot pareshan hun, kuch samajh nahi aa raha 😢")

print(f"Sentiment: {result['sentiment']}")      # negative
print(f"Mood: {result['primary_mood']}")        # anxiety
print(f"Detected: {result['detected_words']['negative']}")
```

### Example 4: Handle Negation

```python
# Negation example
result1 = agent.analyze_message("Main khush hun")
result2 = agent.analyze_message("Main khush nahi hun")

print(f"'Main khush hun': {result1['sentiment']}")      # positive
print(f"'Main khush nahi hun': {result2['sentiment']}") # negative
```

---

## Database Integration

### Saving Mood Analysis

```sql
INSERT INTO user_moods 
    (user_id, mood, confidence, sentiment_distribution, 
     trend, detected_emotions)
VALUES 
    (123, 'positive', 0.75, 
     '{"positive": 25, "negative": 8, "neutral": 12}',
     'improving', 
     '["happiness", "gratitude"]')
```

### Mood History Query

```sql
SELECT mood, confidence, trend, created_at
FROM user_moods
WHERE user_id = 123
ORDER BY created_at DESC
LIMIT 10
```

---

## Tips for Accuracy

### Best Results

1. **Longer messages** = More accurate (more context)
2. **Emojis help** = Clear emotional signals
3. **Common words** = Better lexicon matching

### Limitations

1. **Sarcasm** = May not detect sarcasm well
2. **Mixed emotions** = Complex sentences may be ambiguous
3. **New slang** = May not recognize very new terms

---

## Summary

The Mood Tracker Agent provides emotional intelligence for AuraFlow by:
- ✅ Analyzing sentiment in English and Roman Urdu
- ✅ Understanding emojis and intensifiers
- ✅ Handling negation and spelling variations
- ✅ Tracking mood trends over time
- ✅ Detecting specific emotions (joy, sadness, anxiety, etc.)
- ✅ Using hybrid approach for maximum accuracy

It helps create a more empathetic and supportive community! 💚
