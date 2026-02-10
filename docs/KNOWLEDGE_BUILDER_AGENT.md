# Knowledge Builder Agent Documentation

## Overview

The **Knowledge Builder Agent** is an AI-powered component of AuraFlow that automatically extracts and organizes knowledge from conversations. It identifies topics, Q&A pairs, decisions, and shared resources to create a searchable knowledge base.

---

## Table of Contents

1. [Purpose](#purpose)
2. [How It Works](#how-it-works)
3. [Key Features](#key-features)
4. [Code Structure](#code-structure)
5. [Main Methods](#main-methods)
6. [Knowledge Types](#knowledge-types)
7. [Usage Examples](#usage-examples)

---

## Purpose

The Knowledge Builder Agent serves to:
- **Extract topics** - Identify main discussion themes
- **Capture Q&A pairs** - Find questions and their answers
- **Record decisions** - Track agreed conclusions
- **Collect resources** - Gather shared links and references
- **Build searchable knowledge** - Create organized, searchable entries

---

## How It Works

### Simple Explanation

Think of the Knowledge Builder like a librarian who:
1. **Reads conversations** - Goes through all messages
2. **Identifies important info** - Finds topics, questions, decisions
3. **Organizes content** - Categorizes into different types
4. **Creates index** - Makes everything searchable
5. **Stores for later** - Saves to knowledge base

### Technical Flow

```
Messages → Extract Content → Categorize → Build Entries → Save to Database
    ↓           ↓               ↓             ↓              ↓
 Fetch      Keywords,        Topics,      Structured     knowledge_base
 recent     Questions,       Q&A,         JSON           ai_agent_logs
 texts      Links,           Decisions,   entries
            Decisions        Resources
```

---

## Key Features

### 1. Topic Extraction
Uses keyword extraction to identify main themes:
```python
keywords = self.text_processor.extract_keywords(all_text, top_n=10)
```

### 2. Q&A Detection
Finds question-answer pairs:
```python
question_markers = ['?', 'how', 'what', 'why', 'when', 'where', 'who',
                    'kya', 'kaise', 'kab', 'kahan', 'kyun']
```

### 3. Decision Detection
Identifies conclusions and agreements:
```python
decision_markers = [
    'decided', 'agreed', 'will do', 'let\'s', 'we should',
    'conclusion', 'final', 'resolved', 'settled',
    'faisla', 'theek hai', 'done', 'perfect'
]
```

### 4. Resource Collection
Extracts shared URLs:
```python
url_pattern = re.compile(r'(https?://[^\s]+)')
```

---

## Code Structure

### Class Definition

```python
class KnowledgeBuilderAgent:
    """
    Extracts and organizes knowledge from conversations
    Creates searchable knowledge entries and topic summaries
    """
    
    def __init__(self):
        self.text_processor = TextProcessor()
        self.min_messages_for_topic = 5
```

### Dependencies

| Dependency | Purpose |
|------------|---------|
| `TextProcessor` | Keyword extraction |
| `database` | Store knowledge entries |
| `re` | URL pattern matching |

---

## Main Methods

### 1. `extract_knowledge(channel_id, time_period_hours)`

**What it does:** Extracts all knowledge types from channel conversations.

**Parameters:**
- `channel_id` (int): Channel to analyze
- `time_period_hours` (int): Time window (default: 24 hours)

**Returns:**
```python
{
    'success': True,
    'knowledge_entries': [
        {
            'topic': 'authentication',
            'summary': 'Discussion about JWT vs sessions for auth...',
            'participants': ['Alice', 'Bob'],
            'message_count': 12,
            'timestamp': '2026-02-01T10:30:00'
        }
    ],
    'qa_pairs': [
        {
            'question': 'How do we handle user sessions?',
            'asker': 'Alice',
            'answer': 'We should use JWT tokens with refresh...',
            'answerer': 'Bob',
            'timestamp': '2026-02-01T10:35:00'
        }
    ],
    'decisions': [
        {
            'decision': 'We decided to use JWT for authentication',
            'decided_by': 'Charlie',
            'timestamp': '2026-02-01T11:00:00'
        }
    ],
    'resources': [
        {
            'url': 'https://jwt.io/introduction',
            'shared_by': 'Bob',
            'context': 'Check out the JWT introduction here...',
            'timestamp': '2026-02-01T10:40:00'
        }
    ],
    'total_items': 15,
    'time_period_hours': 24
}
```

### 2. `_extract_topics(messages)`

**What it does:** Identifies main discussion topics.

**Process:**
```python
1. Combine all message content
2. Extract top 10 keywords
3. Group messages by keyword
4. Filter topics with 3+ related messages
5. Create topic summaries
```

**Returns:**
```python
{
    'authentication': {
        'summary': 'First few messages about topic...',
        'participants': ['Alice', 'Bob', 'Charlie'],
        'count': 15
    },
    'deployment': {
        'summary': 'Discussion about deployment...',
        'participants': ['Bob', 'Dave'],
        'count': 8
    }
}
```

### 3. `_extract_qa_pairs(messages)`

**What it does:** Finds questions and their answers.

**Algorithm:**
```python
for each message:
    if message contains question marker:
        look at next 3 messages
        if different user responds without question:
            this is a Q&A pair!
```

**Returns:** List of up to 10 Q&A pairs

### 4. `_extract_decisions(messages)`

**What it does:** Finds decisions and conclusions.

**Detection:**
```python
decision_markers = [
    'decided', 'agreed', 'will do', 'let\'s', 'we should',
    'conclusion', 'final', 'resolved', 'settled',
    'faisla', 'theek hai', 'done', 'perfect'
]
```

### 5. `_extract_resources(messages)`

**What it does:** Collects shared URLs.

**Pattern:**
```python
url_pattern = re.compile(r'(https?://[^\s]+)')
```

**Returns:**
```python
[
    {
        'url': 'https://example.com/guide',
        'shared_by': 'Alice',
        'context': 'Message text containing the link...',
        'timestamp': '2026-02-01T12:00:00'
    }
]
```

### 6. `search_knowledge(channel_id, query, limit)`

**What it does:** Searches the knowledge base.

**Parameters:**
- `channel_id` (int): Channel to search in
- `query` (str): Search query
- `limit` (int): Maximum results (default: 10)

**Returns:**
```python
[
    {
        'id': 123,
        'description': 'Knowledge extraction log',
        'data': {...},
        'created_at': '2026-02-01T12:00:00'
    }
]
```

### 7. `get_knowledge_history(channel_id, limit)`

**What it does:** Retrieves past knowledge extractions.

---

## Knowledge Types

### 1. Topic Entries

**What:** Main discussion themes with summaries

**Structure:**
```python
{
    'type': 'topic',
    'topic': 'authentication',
    'summary': 'Team discussed various authentication methods...',
    'participants': ['Alice', 'Bob'],
    'message_count': 15,
    'timestamp': '2026-02-01T10:00:00'
}
```

**Detection:** Keywords that appear in 3+ messages

### 2. Q&A Pairs

**What:** Questions with their answers

**Structure:**
```python
{
    'type': 'qa',
    'question': 'How should we handle errors?',
    'answer': 'We should use try-catch blocks and log errors...',
    'asker': 'Alice',
    'answerer': 'Bob',
    'tags': ['error', 'handling', 'logging'],
    'timestamp': '2026-02-01T11:00:00'
}
```

**Detection:** Question markers followed by response from different user

### 3. Decisions

**What:** Conclusions and agreements

**Structure:**
```python
{
    'type': 'decision',
    'decision': 'We agreed to use TypeScript for the project',
    'decided_by': 'Charlie',
    'tags': ['typescript', 'project'],
    'timestamp': '2026-02-01T12:00:00'
}
```

**Detection:** Decision marker words

### 4. Resources

**What:** Shared links and references

**Structure:**
```python
{
    'type': 'resource',
    'url': 'https://docs.example.com/guide',
    'shared_by': 'Dave',
    'context': 'This guide explains the setup process...',
    'timestamp': '2026-02-01T13:00:00'
}
```

**Detection:** URL pattern matching

---

## Usage Examples

### Example 1: Extract Knowledge from Channel

```python
from agents.knowledge_builder import KnowledgeBuilderAgent

agent = KnowledgeBuilderAgent()

# Extract knowledge from last 24 hours
result = agent.extract_knowledge(channel_id=123, time_period_hours=24)

if result['success']:
    print(f"📚 Extracted {result['total_items']} knowledge items")
    
    # Topics
    print("\n🏷️ Topics:")
    for entry in result['knowledge_entries']:
        print(f"  • {entry['topic']} ({entry['message_count']} messages)")
    
    # Q&A
    print("\n❓ Questions & Answers:")
    for qa in result['qa_pairs']:
        print(f"  Q: {qa['question'][:50]}...")
        print(f"  A: {qa['answer'][:50]}...")
    
    # Decisions
    print("\n✅ Decisions:")
    for dec in result['decisions']:
        print(f"  • {dec['decision'][:60]}...")
```

### Example 2: Search Knowledge Base

```python
# Search for authentication-related knowledge
results = agent.search_knowledge(
    channel_id=123,
    query='authentication',
    limit=5
)

print("🔍 Search Results:")
for r in results:
    print(f"  [{r['created_at']}] {r['description']}")
```

### Example 3: Get Knowledge History

```python
# Get recent knowledge extractions
history = agent.get_knowledge_history(channel_id=123, limit=10)

print("📖 Knowledge History:")
for record in history:
    data = record['knowledge_data']
    print(f"  {record['created_at']}:")
    print(f"    Topics: {data.get('knowledge_entries', 0)}")
    print(f"    Q&A: {data.get('qa_pairs', 0)}")
    print(f"    Decisions: {data.get('decisions', 0)}")
```

### Example 4: Get All Resources

```python
result = agent.extract_knowledge(channel_id=123)

if result['success'] and result['resources']:
    print("🔗 Shared Resources:")
    for res in result['resources']:
        print(f"  • {res['url']}")
        print(f"    Shared by: {res['shared_by']}")
        print(f"    Context: {res['context'][:50]}...")
```

---

## Database Integration

### Knowledge Base Table

Knowledge entries are saved to `knowledge_base`:

```sql
INSERT INTO knowledge_base (title, content, source, related_channel)
VALUES 
    ('Topic: authentication', 
     '{"type": "topic", "summary": "...", ...}', 
     'agent', 
     123)
```

### Agent Logs

Extraction activity is logged to `ai_agent_logs`:

```sql
INSERT INTO ai_agent_logs 
    (channel_id, action_type, input_text, output_text, confidence_score)
VALUES 
    (123, 
     'knowledge_extraction',
     'Extracted knowledge from conversations',
     '{"knowledge_entries": 5, "qa_pairs": 8, ...}',
     0.8)
```

### Content Structure in Database

```json
// Topic entry
{
    "type": "topic",
    "topic": "authentication",
    "summary": "Discussion about auth methods...",
    "participants": ["Alice", "Bob"],
    "message_count": 15,
    "timestamp": "2026-02-01T10:00:00"
}

// Q&A entry
{
    "type": "qa",
    "question": "How do we handle sessions?",
    "answer": "Use JWT with refresh tokens",
    "asker": "Alice",
    "answerer": "Bob",
    "tags": ["jwt", "sessions"],
    "relevance_score": 0.0,
    "usage_count": 0,
    "timestamp": "2026-02-01T11:00:00"
}
```

---

## Detection Patterns

### Question Patterns

| Language | Markers |
|----------|---------|
| **English** | ?, how, what, why, when, where, who |
| **Roman Urdu** | kya, kaise, kab, kahan, kyun |

### Decision Patterns

| Language | Markers |
|----------|---------|
| **English** | decided, agreed, will do, let's, we should, conclusion, final, resolved |
| **Roman Urdu** | faisla, theek hai, done, perfect |

### URL Pattern

```python
# Matches HTTP and HTTPS URLs
r'(https?://[^\s]+)'
```

---

## Quality Considerations

### Minimum Requirements

```python
self.min_messages_for_topic = 5  # Need at least 5 messages
```

### Topic Filtering

Topics need at least 3 related messages to be included:
```python
if len(related_messages) >= 3:
    topics[keyword] = {...}
```

### Q&A Limit

Only top 10 Q&A pairs are kept to avoid noise:
```python
return qa_pairs[:10]
```

---

## Summary

The Knowledge Builder Agent creates organizational memory by:
- ✅ Extracting main discussion topics
- ✅ Capturing Q&A pairs automatically
- ✅ Recording decisions and conclusions
- ✅ Collecting shared resources and links
- ✅ Supporting both English and Roman Urdu
- ✅ Creating searchable knowledge base entries

It's like having a smart assistant that takes notes and organizes everything! 📚
