# Focus Agent Documentation

## Overview

The **Focus Agent** is an AI-powered component of AuraFlow that monitors conversation topics and helps users stay focused. It detects when conversations drift off-topic and provides metrics about how well a channel stays on track.

---

## Table of Contents

1. [Purpose](#purpose)
2. [How It Works](#how-it-works)
3. [Key Features](#key-features)
4. [Code Structure](#code-structure)
5. [Main Methods](#main-methods)
6. [Scoring System](#scoring-system)
7. [Usage Examples](#usage-examples)

---

## Purpose

The Focus Agent serves to:
- **Track conversation topics** - Identify what the channel is discussing
- **Measure focus levels** - Calculate how well conversations stay on-topic
- **Detect topic shifts** - Notice when conversations change direction
- **Provide recommendations** - Suggest ways to refocus discussions

---

## How It Works

### Simple Explanation

Think of the Focus Agent like a meeting moderator who:
1. **Listens to the conversation** - Reads all messages in a time window
2. **Identifies topics** - Extracts keywords and themes being discussed
3. **Counts topic changes** - Notices when the subject shifts
4. **Gives a focus score** - Rates how well the conversation stayed on track


### Technical Flow

```
Messages → Extract Keywords → Calculate Topic Distribution → Detect Shifts → Focus Score
    ↓           ↓                       ↓                        ↓            ↓
 Recent     Top words           Which topics dominate?      How many?    0.0-1.0
 texts      from each           (frequency analysis)        (sliding     Score
            message                                         window)
```

---

## Key Features

### 1. Topic Extraction
Uses the TextProcessor to extract keywords from messages:
```python
keywords = self.text_processor.extract_keywords(msg['content'], top_n=5)
```

### 2. Focus Score Calculation
Combines multiple factors:
- **Topic dominance** - Do top topics appear frequently?
- **Topic count** - Few unique topics = more focused
- **Topic shifts** - Fewer shifts = better focus

### 3. Topic Shift Detection
Uses a sliding window approach:
```
Window 1: [msg1, msg2, msg3] → Topics: {python, coding, bug}
Window 2: [msg2, msg3, msg4] → Topics: {lunch, food, break}

Overlap < 30%? → Topic Shift Detected!
```

### 4. Focus Levels

| Level | Score Range | Meaning |
|-------|-------------|---------|
| **high** | ≥ 0.65 | Conversation is well-focused |
| **medium** | 0.4 - 0.64 | Some drift, but generally on track |
| **low** | < 0.4 | Conversation is scattered |

---

## Code Structure

### Class Definition

```python
class FocusAgent:
    """
    Monitors conversation topics and helps users stay focused
    Detects topic drift and provides focus metrics
    """
    
    def __init__(self):
        self.text_processor = TextProcessor()
        self.min_messages_for_analysis = 5  # Need at least 5 messages
```

### Dependencies

| Dependency | Purpose |
|------------|---------|
| `TextProcessor` | Extracts keywords from text |
| `database` | Stores and retrieves messages |
| `Counter` | Counts topic frequencies |

---

## Main Methods

### 1. `analyze_focus(channel_id, time_period_hours)`

**What it does:** Analyzes how focused a channel's conversation is.

**Parameters:**
- `channel_id` (int): The channel to analyze
- `time_period_hours` (int): Time window (default: 1 hour)

**Returns:**
```python
{
    'success': True,
    'focus_score': 0.72,
    'focus_level': 'high',
    'dominant_topics': [
        {'topic': 'python', 'count': 15},
        {'topic': 'bug', 'count': 12},
        {'topic': 'fix', 'count': 8}
    ],
    'topic_shifts': [
        {
            'message_id': 456,
            'time': '2026-02-01T10:30:00',
            'previous_topics': ['python', 'bug'],
            'new_topics': ['lunch', 'break']
        }
    ],
    'message_count': 25,
    'participant_count': 5,
    'messages_per_participant': 5.0,
    'recommendation': 'Great focus! The conversation is staying on topic.',
    'time_period_hours': 1
}
```

### 2. `_calculate_focus_score(topic_counts, total)`

**What it does:** Calculates the focus score based on topic distribution.

**How it works:**
```python
# 1. Calculate dominance (top 5 topics / total)
dominance = top_5_count / total

# 2. Calculate topic focus (fewer topics = more focused)
if num_unique_topics <= 5:
    topic_focus = 1.0
elif num_unique_topics <= 10:
    topic_focus = 0.85
elif num_unique_topics <= 20:
    topic_focus = 0.7
# ...

# 3. Combine scores
focus_score = (dominance * 0.6) + (topic_focus * 0.4)
```

### 3. `_detect_topic_shifts(message_topics)`

**What it does:** Detects when conversation topics change significantly.

**Algorithm:**
```python
# Use sliding window of size 3
for i in range(len(messages) - window_size):
    window1_topics = topics from messages[i:i+3]
    window2_topics = topics from messages[i+1:i+4]
    
    # Calculate overlap
    overlap = intersection / union
    
    if overlap < 0.3:  # Less than 30% overlap
        # This is a topic shift!
        shifts.append(...)
```

### 4. `suggest_refocus(channel_id, current_focus)`

**What it does:** Provides suggestions to refocus the conversation.

**Parameters:**
- `channel_id` (int): Channel ID
- `current_focus` (Dict): Current focus analysis results

**Returns:**
```python
{
    'success': True,
    'suggestions': [
        "Try steering the conversation back to 'python'",
        "Multiple topic changes detected. Consider summarizing."
    ],
    'current_focus_level': 'low',
    'current_score': 0.35
}
```

### 5. `get_focus_history(channel_id, limit)`

**What it does:** Retrieves past focus analyses for a channel.

---

## Scoring System

### Focus Score Breakdown

The focus score is calculated in multiple steps:

#### Step 1: Topic Dominance (60% weight)
```
top_5_count / total_topics
```
- Measures how much the top 5 topics dominate the conversation
- Higher = more focused on specific topics

#### Step 2: Topic Focus (40% weight)
```
Based on number of unique topics:
- 1-5 topics: 1.0 (very focused)
- 6-10 topics: 0.85
- 11-20 topics: 0.7
- 21-30 topics: 0.5
- 30+ topics: 0.3 (scattered)
```

#### Step 3: Shift Boost
```
Based on number of topic shifts:
- 0-1 shifts: +0.35 boost
- 2-3 shifts: +0.20 boost
- <10% of messages are shifts: +0.10 boost
```

### Example Calculation

```
Scenario: 30 messages, 12 unique topics, 2 topic shifts
Top 5 topics account for 70% of all topic mentions

Step 1: Dominance = 0.70
Step 2: Topic Focus = 0.70 (12 unique topics)
Base Score = (0.70 * 0.6) + (0.70 * 0.4) = 0.42 + 0.28 = 0.70

Step 3: Shift Boost = +0.20 (2-3 shifts)
Final Score = min(0.70 + 0.20, 1.0) = 0.90

Focus Level: HIGH ✓
```

---

## Usage Examples

### Example 1: Analyze Channel Focus

```python
from agents.focus import FocusAgent

agent = FocusAgent()

# Analyze last hour of conversation
result = agent.analyze_focus(channel_id=123, time_period_hours=1)

if result['success']:
    print(f"Focus Score: {result['focus_score']}")
    print(f"Focus Level: {result['focus_level']}")
    print(f"\nTop Topics:")
    for topic in result['dominant_topics']:
        print(f"  • {topic['topic']} ({topic['count']} mentions)")
    
    if result['topic_shifts']:
        print(f"\n⚠️ {len(result['topic_shifts'])} topic shifts detected")
```

### Example 2: Get Refocus Suggestions

```python
# First analyze
analysis = agent.analyze_focus(channel_id=123)

# Then get suggestions if focus is low
if analysis['focus_level'] == 'low':
    suggestions = agent.suggest_refocus(123, analysis)
    
    print("💡 Suggestions to refocus:")
    for suggestion in suggestions['suggestions']:
        print(f"  → {suggestion}")
```

### Example 3: Track Focus Over Time

```python
# Get focus history
history = agent.get_focus_history(channel_id=123, limit=10)

print("Focus Score History:")
for record in history:
    print(f"  {record['created_at']}: {record['focus_score']}")
```

---

## Database Integration

### Saving Analysis
Focus analyses are logged to `ai_agent_logs`:

```sql
INSERT INTO ai_agent_logs 
    (channel_id, action_type, input_text, output_text, confidence_score)
VALUES 
    (123, 'focus_analysis', 'Analyzed 25 messages', 
     '{"focus_score": 0.72, "focus_level": "high", ...}', 
     0.72)
```

### Retrieving History
```sql
SELECT id, output_text, confidence_score, created_at
FROM ai_agent_logs
WHERE channel_id = 123 AND action_type = 'focus_analysis'
ORDER BY created_at DESC
LIMIT 10
```

---

## Recommendations by Focus Level

### High Focus (≥ 0.65)
```
"Great focus! The conversation is staying on topic."
```
- No action needed
- Conversation is productive

### Medium Focus (0.4 - 0.64)
```
"Moderate focus. Some topic drift detected."
```
- Consider gentle reminders
- Stay on current topics to maintain clarity

### Low Focus (< 0.4)
```
"Low focus. Consider refocusing the conversation."
```
Suggestions include:
- Steer back to dominant topic
- Summarize and choose one direction
- Encourage more focused discussion

---

## Summary

The Focus Agent helps AuraFlow communities have productive conversations by:
- ✅ Extracting and tracking conversation topics
- ✅ Measuring how well discussions stay focused
- ✅ Detecting when conversations drift off-topic
- ✅ Providing actionable suggestions to refocus
- ✅ Maintaining history for trend analysis

It's like having a smart assistant that keeps meetings on track! 🎯
