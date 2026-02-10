# Engagement Agent Documentation

## Overview

The **Engagement Agent** is an AI-powered component of AuraFlow that helps boost conversation activity in channels. It provides smart suggestions, ice-breaking activities, conversation starters, polls, and fun challenges to keep users engaged and connected.

---

## Table of Contents

1. [Purpose](#purpose)
2. [How It Works](#how-it-works)
3. [Key Features](#key-features)
4. [Code Structure](#code-structure)
5. [Main Methods](#main-methods)
6. [Data Structures](#data-structures)
7. [Usage Examples](#usage-examples)

---

## Purpose

The Engagement Agent serves to:
- **Detect quiet channels** and suggest ways to revive conversations
- **Provide ice-breaker activities** for new groups or awkward silences
- **Offer conversation starters** for different contexts (tech, casual, motivational)
- **Create quick polls** to boost interaction
- **Suggest fun challenges** to make conversations more engaging

---

## How It Works

### Simple Explanation

Think of the Engagement Agent like a friendly party host who:
1. **Watches the room** - It monitors how active a channel is
2. **Notices when things get quiet** - Tracks silence duration and message frequency
3. **Suggests activities** - Offers games, questions, or topics when needed
4. **Keeps things balanced** - Makes sure everyone gets a chance to participate

### Technical Flow

```
Channel Activity → Analyze Metrics → Calculate Score → Generate Suggestions
       ↓                  ↓                 ↓                   ↓
  Messages        Message Count      0.0 to 1.0         Ice-breakers,
  Timestamps      Participants       (engagement)       Polls, Starters
  User IDs        Silence Time         Level
```

---

## Key Features

### 1. Conversation Starters
Pre-loaded templates for different scenarios:

| Category | Example Topics |
|----------|---------------|
| **General** | "What's everyone working on today?" |
| **Tech** | "What's your favorite programming language?" |
| **Casual** | "What's making you happy today?" |
| **Icebreaker** | "Two truths and a lie - go!" |
| **Motivational** | "What's keeping you motivated today?" |

### 2. Ice-Breaker Activities
Structured activities with instructions:

- **Quick Questions** - Would You Rather, This or That
- **Games** - Emoji Story, Word Association
- **Team Building** - Appreciation Round, Common Ground
- **Creative** - Describe Your Day, Caption This

### 3. Quick Polls
Ready-to-use polls:
```
"What's your productivity peak? ⏰"
Options: Morning 🌅 | Afternoon ☀️ | Evening 🌆 | Night 🌙
```

### 4. Fun Challenges
Interactive challenges:
- 📸 Photo Challenge
- 🎵 Music Challenge
- 💡 Quick Challenge

---

## Code Structure

### Class Definition

```python
class EngagementAgent:
    """
    Analyzes conversation patterns and suggests engagement boosters
    """
    
    def __init__(self):
        self.min_silence_minutes = 5
        self.conversation_starters = self._load_conversation_starters()
        self.icebreaker_activities = self._load_icebreaker_activities()
        self.quick_polls = self._load_quick_polls()
        self.fun_challenges = self._load_fun_challenges()
```

### Key Properties

| Property | Type | Description |
|----------|------|-------------|
| `min_silence_minutes` | int | Minimum silence time before suggesting activity (5 min) |
| `conversation_starters` | Dict | Categories of conversation starter messages |
| `icebreaker_activities` | Dict | Structured ice-breaker games and activities |
| `quick_polls` | List | Pre-made poll questions with options |
| `fun_challenges` | List | Interactive challenge templates |

---

## Main Methods

### 1. `analyze_engagement(channel_id, time_period_hours)`

**What it does:** Analyzes how engaged a channel is and provides suggestions.

**Parameters:**
- `channel_id` (int): The channel to analyze
- `time_period_hours` (int): Time window to analyze (default: 6 hours)

**Returns:**
```python
{
    'success': True,
    'engagement_level': 'high' | 'medium' | 'low' | 'inactive',
    'engagement_score': 0.75,  # 0.0 to 1.0
    'message_count': 45,
    'participant_count': 8,
    'avg_messages_per_user': 5.6,
    'silence_minutes': 12.5,
    'participation_balance': 0.65,
    'suggestions': [...],
    'time_period_hours': 6
}
```

**How the score is calculated:**
```python
engagement_score = (
    frequency_score * 0.3 +      # Messages per hour
    recency_score * 0.3 +        # How recent was last message
    participation_score * 0.2 +  # Number of active users
    balance_score * 0.2          # Message distribution evenness
)
```

### 2. `get_icebreaker_activity(activity_type)`

**What it does:** Returns a random ice-breaker activity.

**Parameters:**
- `activity_type` (str): 'quick_questions', 'games', 'team_building', 'creative', or 'random'

**Returns:**
```python
{
    'success': True,
    'category': 'games',
    'activity': {
        'title': '🎭 Emoji Story',
        'description': 'Tell a story using only emojis, others guess!',
        'instructions': ['Step 1...', 'Step 2...'],
        'duration': '10 min'
    }
}
```

### 3. `get_quick_poll(category)`

**What it does:** Returns a poll question for the channel.

**Parameters:**
- `category` (str): Poll category ('productivity', 'work', 'mood', etc.) or 'random'

**Returns:**
```python
{
    'success': True,
    'poll': {
        'question': "How's your energy today?",
        'options': ['Fully charged ⚡', 'Good enough 👍', 'Need coffee ☕'],
        'category': 'mood',
        'id': 'poll_20260201143022_1234'
    }
}
```

### 4. `get_fun_challenge(challenge_type)`

**What it does:** Returns a fun challenge for users.

**Parameters:**
- `challenge_type` (str): 'photo', 'music', 'quick', or 'random'

**Returns:**
```python
{
    'success': True,
    'challenge': {
        'title': '📸 Photo Challenge',
        'description': 'Share a photo that matches the theme',
        'themes': ['Your workspace', 'View from your window', ...],
        'selected_theme': 'Your workspace',
        'duration': '15 min'
    }
}
```

### 5. `get_engagement_history(channel_id, limit)`

**What it does:** Retrieves past engagement analyses for a channel.

**Parameters:**
- `channel_id` (int): Channel to get history for
- `limit` (int): Maximum number of records (default: 10)

---

## Data Structures

### Engagement Levels

| Level | Score Range | Description |
|-------|-------------|-------------|
| **high** | ≥ 0.7 | Active, healthy conversation |
| **medium** | 0.4 - 0.69 | Some activity, could use boost |
| **low** | < 0.4 | Quiet, needs engagement help |
| **inactive** | 0 | No recent messages |

### Suggestion Types

```python
suggestions = [
    {
        'type': 'conversation_starter',  # Start new topic
        'message': 'What's everyone working on today?',
        'reason': 'Channel has been quiet for 30 minutes'
    },
    {
        'type': 'icebreaker',  # Fun activity
        'message': 'Two truths and a lie - go!',
        'reason': 'Break the ice and get people talking'
    },
    {
        'type': 'invite',  # Encourage participation
        'message': 'Consider inviting more people',
        'reason': 'Low participant count'
    }
]
```

---

## Usage Examples

### Example 1: Check Channel Engagement

```python
from agents.engagement import EngagementAgent

agent = EngagementAgent()

# Analyze a channel
result = agent.analyze_engagement(channel_id=123, time_period_hours=6)

if result['success']:
    print(f"Engagement Level: {result['engagement_level']}")
    print(f"Score: {result['engagement_score']}")
    
    for suggestion in result['suggestions']:
        print(f"💡 {suggestion['message']}")
```

### Example 2: Get Ice-Breaker for Quiet Channel

```python
# Get a random team-building activity
activity = agent.get_icebreaker_activity('team_building')

if activity['success']:
    print(f"🎯 {activity['activity']['title']}")
    print(activity['activity']['description'])
    
    for step in activity['activity']['instructions']:
        print(f"  • {step}")
```

### Example 3: Create a Quick Poll

```python
# Get a mood-related poll
poll = agent.get_quick_poll('mood')

if poll['success']:
    print(poll['poll']['question'])
    for i, option in enumerate(poll['poll']['options'], 1):
        print(f"  {i}. {option}")
```

---

## Database Integration

The agent logs all engagement analyses to the `ai_agent_logs` table:

```sql
INSERT INTO ai_agent_logs 
    (channel_id, action_type, input_text, output_text, confidence_score)
VALUES 
    (123, 'engagement_analysis', 'Analyzed 45 messages', '{...}', 0.75)
```

---

## Summary

The Engagement Agent is your automated community facilitator that:
- ✅ Monitors channel activity levels
- ✅ Detects when conversations need a boost
- ✅ Provides contextual suggestions
- ✅ Offers fun activities and games
- ✅ Tracks engagement history over time

It helps keep AuraFlow communities active and connected! 🎉
