# AuraFlow AI Agents Documentation

## Overview

AuraFlow uses a suite of AI-powered agents to enhance community communication. Each agent serves a specific purpose and works together to create a smart, supportive, and well-moderated chat experience.

---

## Agent Index

| Agent | Purpose | Documentation |
|-------|---------|---------------|
| 🎯 **Engagement Agent** | Boost conversation activity | [ENGAGEMENT_AGENT.md](ENGAGEMENT_AGENT.md) |
| 🎯 **Focus Agent** | Monitor topic focus | [FOCUS_AGENT.md](FOCUS_AGENT.md) |
| 🛡️ **Moderation Agent** | Content moderation | [MODERATION_AGENT.md](MODERATION_AGENT.md) |
| 💚 **Mood Tracker Agent** | Sentiment analysis | [MOOD_TRACKER_AGENT.md](MOOD_TRACKER_AGENT.md) |
| 📝 **Summarizer Agent** | Conversation summaries | [SUMMARIZER_AGENT.md](SUMMARIZER_AGENT.md) |
| 🧘 **Wellness Agent** | User well-being | [WELLNESS_AGENT.md](WELLNESS_AGENT.md) |
| 📚 **Knowledge Builder Agent** | Knowledge extraction | [KNOWLEDGE_BUILDER_AGENT.md](KNOWLEDGE_BUILDER_AGENT.md) |

---

## Quick Reference

### Engagement Agent 🎯
**File:** `agents/engagement.py`

Boosts conversation with:
- Conversation starters
- Ice-breaker activities
- Quick polls
- Fun challenges

```python
from agents.engagement import EngagementAgent
agent = EngagementAgent()
result = agent.analyze_engagement(channel_id=123)
```

---

### Focus Agent 🎯
**File:** `agents/focus.py`

Monitors conversation focus by:
- Extracting topics
- Detecting topic shifts
- Calculating focus score
- Providing refocus suggestions

```python
from agents.focus import FocusAgent
agent = FocusAgent()
result = agent.analyze_focus(channel_id=123)
```

---

### Moderation Agent 🛡️
**File:** `agents/moderation.py`

Protects community by detecting:
- Profanity (English & Roman Urdu)
- Hate speech
- Harassment
- Spam patterns
- Personal information

```python
from agents.moderation import ModerationAgent
agent = ModerationAgent()
result = agent.moderate_message(text, user_id, channel_id)
```

---

### Mood Tracker Agent 💚
**File:** `agents/mood_tracker.py`

Analyzes emotions with:
- Lexicon-based sentiment analysis
- Google Translate + TextBlob hybrid
- Roman Urdu support
- Emoji detection
- Mood trend tracking

```python
from agents.mood_tracker import MoodTrackerAgent
agent = MoodTrackerAgent()
result = agent.analyze_message("Bohat khush hun!")
```

---

### Summarizer Agent 📝
**File:** `agents/summarizer.py`

Creates summaries using:
- Extractive summarization
- TF-IDF sentence scoring
- Gemini AI enhancement (optional)
- Q&A pair extraction
- Key decision identification

```python
from agents.summarizer import SummarizerAgent
agent = SummarizerAgent()
result = agent.summarize_channel(channel_id=123)
```

---

### Wellness Agent 🧘
**File:** `agents/wellness.py`

Promotes well-being by:
- Monitoring activity patterns
- Detecting stress indicators
- Suggesting breaks
- Providing wellness activities

```python
from agents.wellness import WellnessAgent
agent = WellnessAgent()
result = agent.check_user_wellness(user_id=123)
```

---

### Knowledge Builder Agent 📚
**File:** `agents/knowledge_builder.py`

Builds knowledge base by extracting:
- Discussion topics
- Q&A pairs
- Decisions/conclusions
- Shared resources (URLs)

```python
from agents.knowledge_builder import KnowledgeBuilderAgent
agent = KnowledgeBuilderAgent()
result = agent.extract_knowledge(channel_id=123)
```

---

## Language Support

All agents support:
- **English** - Standard language support
- **Roman Urdu** - Urdu written in English letters (e.g., "khush hun", "kya haal hai")
- **Urdu Script** - Native Urdu characters (خوش، کیا حال ہے)

---

## Shared Dependencies

### TextProcessor
Used by Focus, Summarizer, and Knowledge Builder agents for:
- Keyword extraction
- Text cleaning
- Sentence scoring

### Database
All agents use `get_db_connection()` from `database.py` to:
- Fetch messages
- Save analysis results
- Log agent activity

### Lexicons
Located in `lexicons/` directory:
- `moderation_keywords.json` - Moderation patterns
- `roman_urdu_sentiments.json` - Sentiment words
- `stopwords.json` - Common words to ignore

---

## Agent Logging

All agents log their activity to `ai_agent_logs` table:

```sql
CREATE TABLE ai_agent_logs (
    id INT PRIMARY KEY,
    agent_id INT,
    user_id INT,
    channel_id INT,
    message_id INT,
    action_type VARCHAR(50),
    input_text TEXT,
    output_text TEXT,
    confidence_score FLOAT,
    status VARCHAR(20),
    created_at TIMESTAMP
);
```

---

## Getting Started

### 1. Import an Agent
```python
from agents.engagement import EngagementAgent
```

### 2. Initialize
```python
agent = EngagementAgent()
```

### 3. Use Methods
```python
result = agent.analyze_engagement(channel_id=123)
```

### 4. Check Results
```python
if result['success']:
    print(result['engagement_level'])
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     AuraFlow Backend                         │
├─────────────────────────────────────────────────────────────┤
│  routes/agents.py  ←──  API Endpoints                       │
│         ↓                                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                    AI Agents                         │    │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │    │
│  │  │Engagement│ │  Focus  │ │Moderation│ │  Mood   │   │    │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘   │    │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐               │    │
│  │  │Summarizer│ │Wellness │ │Knowledge│               │    │
│  │  └─────────┘ └─────────┘ └─────────┘               │    │
│  └─────────────────────────────────────────────────────┘    │
│         ↓                                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Shared Resources                        │    │
│  │  • TextProcessor  • Database  • Lexicons            │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## Contributing

When adding new agents:
1. Create file in `agents/` directory
2. Follow existing class structure
3. Add logging to `ai_agent_logs`
4. Create documentation in `docs/`
5. Update this index file

---

## Support

For questions about specific agents, refer to their individual documentation files linked above.
