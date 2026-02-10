# Wellness Agent Documentation

## Overview

The **Wellness Agent** is an AI-powered component of AuraFlow that promotes healthy communication habits and user well-being. It monitors activity patterns and provides personalized suggestions for breaks, stress relief, and work-life balance.

---

## Table of Contents

1. [Purpose](#purpose)
2. [How It Works](#how-it-works)
3. [Key Features](#key-features)
4. [Code Structure](#code-structure)
5. [Main Methods](#main-methods)
6. [Wellness Metrics](#wellness-metrics)
7. [Usage Examples](#usage-examples)

---

## Purpose

The Wellness Agent serves to:
- **Monitor activity patterns** - Track how long and frequently users are active
- **Suggest breaks** - Remind users to take breaks after extended activity
- **Detect stress** - Identify stress indicators in messages
- **Promote balance** - Encourage healthy work-life balance
- **Provide recommendations** - Offer personalized wellness activities

---

## How It Works

### Simple Explanation

Think of the Wellness Agent like a caring friend who:
1. **Watches your activity** - Notices how much you've been chatting
2. **Cares about your health** - Suggests breaks when you need them
3. **Reads between the lines** - Detects if you seem stressed
4. **Offers help** - Provides wellness tips and activities

### Technical Flow

```
User Activity → Calculate Metrics → Check Concerns → Generate Suggestions
     ↓               ↓                   ↓                  ↓
 Messages        Duration           High activity?       Break tips
 Timestamps      Frequency          Continuous use?      Stress relief
 Content         Peak hours         Late night?          Encouragement
                                    Stress words?
```

---

## Key Features

### 1. Activity Monitoring
Tracks user messaging patterns:
```python
# Configurable thresholds
self.max_continuous_hours = 3   # Alert after 3 hours
self.min_break_minutes = 15     # Suggest 15 min break
self.max_messages_per_hour = 50 # Alert if exceeding
```

### 2. Wellness Levels

| Level | Meaning | Action |
|-------|---------|--------|
| **good** | Healthy activity patterns | Encourage to keep it up |
| **monitor** | Minor concerns detected | Gentle suggestions |
| **attention_needed** | Significant concerns | Strong recommendations |

### 3. Concern Types

| Concern | Trigger | Suggestion |
|---------|---------|------------|
| `high_activity` | >50 messages/hour | Take a break |
| `continuous_activity` | 3+ hours non-stop | Rest reminder |
| `late_night_activity` | 11 PM - 5 AM | Sleep recommendation |
| `stress_indicators` | Stress words in messages | Wellness tips |

### 4. Stress Detection
Scans recent messages for stress keywords:
```python
stress_keywords = [
    'stress', 'stressed', 'tired', 'exhausted', 'overwhelmed',
    'anxious', 'worried', 'frustrated', 'angry', 'upset',
    'thaka hua', 'pareshan', 'tension', 'mushkil', 'masla'
]
```

---

## Code Structure

### Class Definition

```python
class WellnessAgent:
    """
    Monitors user activity and promotes healthy habits
    Suggests breaks, positive communication, and work-life balance
    """
    
    def __init__(self):
        self.max_continuous_hours = 3
        self.min_break_minutes = 15
        self.max_messages_per_hour = 50
```

### Key Properties

| Property | Default | Description |
|----------|---------|-------------|
| `max_continuous_hours` | 3 | Hours before break reminder |
| `min_break_minutes` | 15 | Minimum suggested break time |
| `max_messages_per_hour` | 50 | High activity threshold |

---

## Main Methods

### 1. `check_user_wellness(user_id)`

**What it does:** Performs comprehensive wellness check for a user.

**Parameters:**
- `user_id` (int): User to check

**Returns:**
```python
{
    'success': True,
    'wellness_level': 'monitor',  # good | monitor | attention_needed
    'concerns': ['late_night_activity', 'stress_indicators'],
    'suggestions': [
        {
            'type': 'sleep',
            'message': "It's late! Consider getting some rest. 😴",
            'priority': 'medium'
        },
        {
            'type': 'wellness',
            'message': 'Detected some stress. Remember to take care of yourself! 💚',
            'priority': 'medium'
        }
    ],
    'metrics': {
        'messages_today': 85,
        'active_duration_hours': 4.5,
        'avg_messages_per_hour': 18.9,
        'time_since_last_message_min': 12.5,
        'peak_hour': 14,
        'peak_hour_count': 25
    }
}
```

### 2. `_check_stress_indicators(user_id, conn)`

**What it does:** Analyzes recent messages for stress keywords.

**Returns:**
```python
{
    'has_stress_indicators': True,
    'stress_message_count': 8,
    'total_checked': 20
}
```

**Detection Logic:**
```python
# If >30% of recent messages contain stress keywords
has_stress = (stress_count / len(messages)) > 0.3
```

### 3. `suggest_wellness_activity(user_id, wellness_check)`

**What it does:** Provides personalized wellness activity suggestions.

**Parameters:**
- `user_id` (int): User ID
- `wellness_check` (Dict): Results from `check_user_wellness`

**Returns:**
```python
{
    'success': True,
    'suggestions': [
        'Take a 5-minute walk',
        'Practice deep breathing for 2 minutes',
        'Drink some water'
    ],
    'wellness_level': 'monitor'
}
```

### 4. `_log_wellness_check(user_id, result)`

**What it does:** Saves wellness check to database for tracking.

---

## Wellness Metrics

### Activity Metrics Explained

| Metric | What It Means |
|--------|---------------|
| `messages_today` | Total messages sent today |
| `active_duration_hours` | Time from first to last message |
| `avg_messages_per_hour` | Messages ÷ Active hours |
| `time_since_last_message_min` | Minutes since last activity |
| `peak_hour` | Hour with most messages (0-23) |
| `peak_hour_count` | Messages in peak hour |

### Wellness Level Determination

```python
# Start with 'good'
wellness_level = 'good'

# Check for high activity
if avg_per_hour > 50:
    wellness_level = 'attention_needed'

# Check for continuous activity
if active_hours >= 3 and no_recent_break:
    wellness_level = 'attention_needed'

# Check for late night
if hour >= 23 or hour <= 5:
    if wellness_level == 'good':
        wellness_level = 'monitor'

# Check for stress
if stress_detected:
    wellness_level = 'monitor'
```

---

## Suggestion Types

### Break Suggestions
```python
activities['break'] = [
    'Take a 5-minute walk',
    'Stretch your arms and legs',
    'Look away from the screen for a few minutes',
    'Get some fresh air',
    'Drink some water'
]
```

### Stress Relief Suggestions
```python
activities['stress_relief'] = [
    'Practice deep breathing for 2 minutes',
    'Listen to calming music',
    'Do a quick meditation',
    'Talk to a friend',
    'Write down your thoughts'
]
```

### Productivity Suggestions
```python
activities['productivity'] = [
    'Organize your workspace',
    'Make a to-do list for tomorrow',
    'Review what you\'ve accomplished today',
    'Plan your next task',
    'Take a power nap (15-20 min)'
]
```

### Social Suggestions
```python
activities['social'] = [
    'Connect with a friend',
    'Share something positive',
    'Express gratitude to someone',
    'Join a group chat',
    'Plan a social activity'
]
```

---

## Usage Examples

### Example 1: Basic Wellness Check

```python
from agents.wellness import WellnessAgent

agent = WellnessAgent()

# Check user wellness
result = agent.check_user_wellness(user_id=123)

if result['success']:
    print(f"Wellness Level: {result['wellness_level']}")
    
    if result['concerns']:
        print("\n⚠️ Concerns:")
        for concern in result['concerns']:
            print(f"  • {concern}")
    
    print("\n💡 Suggestions:")
    for suggestion in result['suggestions']:
        priority_emoji = '🔴' if suggestion['priority'] == 'high' else '🟡'
        print(f"  {priority_emoji} {suggestion['message']}")
```

### Example 2: Get Activity Metrics

```python
result = agent.check_user_wellness(user_id=123)

if result['success']:
    metrics = result['metrics']
    
    print("📊 Activity Summary")
    print(f"  Messages today: {metrics['messages_today']}")
    print(f"  Active for: {metrics['active_duration_hours']:.1f} hours")
    print(f"  Avg rate: {metrics['avg_messages_per_hour']:.1f} msg/hour")
    print(f"  Peak hour: {metrics['peak_hour']}:00 ({metrics['peak_hour_count']} messages)")
```

### Example 3: Get Wellness Activity Suggestions

```python
# First check wellness
wellness_check = agent.check_user_wellness(user_id=123)

# Then get activity suggestions
activities = agent.suggest_wellness_activity(
    user_id=123,
    wellness_check=wellness_check
)

if activities['success']:
    print("🧘 Suggested Activities:")
    for activity in activities['suggestions']:
        print(f"  • {activity}")
```

### Example 4: Late Night Check

```python
import datetime

result = agent.check_user_wellness(user_id=123)

if 'late_night_activity' in result.get('concerns', []):
    print("🌙 It's late! Time to rest.")
    
    # Find sleep suggestion
    for suggestion in result['suggestions']:
        if suggestion['type'] == 'sleep':
            print(f"💤 {suggestion['message']}")
```

---

## Database Integration

### Logging Wellness Checks

```sql
INSERT INTO ai_agent_logs 
    (user_id, action_type, input_text, output_text, confidence_score)
VALUES 
    (123, 'wellness_check', 
     'Checked wellness metrics',
     '{"wellness_level": "monitor", "concerns": [...]}',
     0.75)
```

### Tracking Wellness Over Time

```sql
SELECT 
    DATE(created_at) as date,
    output_text
FROM ai_agent_logs
WHERE user_id = 123 
  AND action_type = 'wellness_check'
ORDER BY created_at DESC
LIMIT 7  -- Last week
```

---

## Concern Detection Logic

### High Activity Detection

```python
# Calculate average messages per hour
avg_per_hour = message_count / active_duration

if avg_per_hour > self.max_messages_per_hour:  # > 50
    concerns.append('high_activity')
    suggestions.append({
        'type': 'break',
        'message': "You've been very active! Consider taking a short break. 🌟",
        'priority': 'high'
    })
```

### Continuous Activity Detection

```python
# Check if user has been active for too long without break
if active_duration >= 3 and time_since_last < 15:
    concerns.append('continuous_activity')
    suggestions.append({
        'type': 'break',
        'message': f"You've been active for {int(active_duration)} hours. Time for a break! ☕",
        'priority': 'high'
    })
```

### Late Night Detection

```python
current_hour = datetime.now().hour

if current_hour >= 23 or current_hour <= 5:
    concerns.append('late_night_activity')
    suggestions.append({
        'type': 'sleep',
        'message': "It's late! Consider getting some rest. 😴",
        'priority': 'medium'
    })
```

### Stress Detection

```python
stress_keywords = [
    'stress', 'tired', 'exhausted', 'overwhelmed',
    'anxious', 'worried', 'frustrated',
    'thaka hua', 'pareshan', 'tension'  # Roman Urdu
]

# Check last 20 messages from past 2 hours
if stress_count / total_messages > 0.3:  # >30% stress words
    concerns.append('stress_indicators')
```

---

## Response Messages

### Positive Feedback (No Concerns)

```python
{
    'type': 'encouragement',
    'message': 'Your activity looks healthy! Keep maintaining balance. ✨',
    'priority': 'low'
}
```

### No Activity

```python
{
    'wellness_level': 'good',
    'message': 'No activity detected today. Take your time! 😊',
    'suggestions': []
}
```

---

## Summary

The Wellness Agent promotes healthy digital habits in AuraFlow by:
- ✅ Monitoring user activity patterns
- ✅ Detecting signs of overwork or stress
- ✅ Providing timely break reminders
- ✅ Supporting both English and Roman Urdu stress detection
- ✅ Offering personalized wellness activity suggestions
- ✅ Tracking wellness over time

It's your digital wellness companion! 💚
