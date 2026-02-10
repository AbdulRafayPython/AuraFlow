# Summarizer Agent Documentation

## Overview

The **Summarizer Agent** is an AI-powered component of AuraFlow that creates concise summaries of long chat conversations. It uses a hybrid approach combining extractive summarization with Google's Gemini AI for polished, contextual summaries.

---

## Table of Contents

1. [Purpose](#purpose)
2. [How It Works](#how-it-works)
3. [Key Features](#key-features)
4. [Code Structure](#code-structure)
5. [Main Methods](#main-methods)
6. [Summarization Algorithms](#summarization-algorithms)
7. [Usage Examples](#usage-examples)

---

## Purpose

The Summarizer Agent serves to:
- **Condense long conversations** - Turn 100+ messages into key points
- **Extract important information** - Q&A pairs, decisions, key topics
- **Support catch-up** - Help users who missed conversation to quickly understand
- **Identify participants** - Show who contributed to the discussion
- **Provide multiple formats** - Extractive summaries or AI-polished versions

---

## How It Works

### Simple Explanation

Think of the Summarizer like a note-taker who:
1. **Reads all messages** - Goes through recent conversation
2. **Finds important points** - Identifies questions, answers, decisions
3. **Removes duplicates** - Avoids repeating similar content
4. **Creates summary** - Produces a clean, readable overview
5. **Optional: AI polish** - Uses Gemini AI to make it even better

### Technical Flow

```
Messages → Text Processing → Sentence Scoring → Diverse Selection → Format
    ↓            ↓                  ↓                  ↓              ↓
 Fetch       Clean &           TF-IDF +            Remove          Q&A +
 recent      extract          importance +         similar         Decisions +
 texts       content          density score        sentences       Discussion

                                    ↓
                         Optional: Gemini AI Enhancement
                                    ↓
                              Final Summary
```

### Hybrid Approach

```
┌─────────────────────────────────────────────────────────┐
│               SUMMARIZATION METHODS                      │
├─────────────────────────────────────────────────────────┤
│ 1. EXTRACTIVE (Always runs first)                       │
│    - Score sentences by importance                      │
│    - Select diverse top sentences                       │
│    - Format into Q&A, discussions, decisions            │
│                                                          │
│ 2. GEMINI AI (Optional enhancement)                     │
│    - Takes extractive summary as input                  │
│    - Produces polished, natural language summary        │
│    - Extracts key decisions automatically               │
└─────────────────────────────────────────────────────────┘
```

---

## Key Features

### 1. Minimum Message Requirement
Requires at least 20 messages to generate meaningful summary:
```python
self.min_messages_for_summary = 20
```

### 2. Sentence Scoring
Uses multiple factors to score sentence importance:
- **TF-IDF Score** - How unique/important are the words?
- **Length Score** - Prefer informative, medium-length sentences
- **Position Score** - Slight preference for middle of conversation
- **Importance Markers** - Questions, decisions, key phrases
- **Information Density** - Technical terms, noun/verb ratio

### 3. Diversity Selection
Avoids repetition by checking similarity:
```python
# Skip if 70%+ similar to already selected
if overlap > 0.7:
    is_duplicate = True
```

### 4. Smart Formatting
Organizes summary into categories:
- **Q&A Pairs** - Questions with their answers
- **Discussions** - Key discussion points
- **Decisions** - Conclusions and agreements

### 5. Gemini AI Integration
Optional AI enhancement for natural language summaries.

---

## Code Structure

### Class Definition

```python
class SummarizerAgent:
    """
    Summarize long chat conversations into concise summaries
    Uses extractive summarization with sentence scoring
    """
    
    def __init__(self):
        self.text_processor = TextProcessor()
        self.min_messages_for_summary = 20
        self.max_summary_sentences = 10
        self.gemini_available = GEMINI_AVAILABLE
```

### Dependencies

| Library | Purpose |
|---------|---------|
| `google.generativeai` | Gemini AI for polished summaries |
| `TextProcessor` | Text cleaning and keyword extraction |
| `Counter` | Word frequency counting |
| `math` | TF-IDF calculations |

---

## Main Methods

### 1. `summarize_channel(channel_id, message_count, user_id)`

**What it does:** Creates a summary of recent channel messages.

**Parameters:**
- `channel_id` (int): Channel to summarize
- `message_count` (int): Number of messages to analyze (default: 100)
- `user_id` (int, optional): User requesting summary (for logging)

**Returns:**
```python
{
    'success': True,
    'summary_id': 456,
    'summary': '''
        Q1: How do we deploy the app?
        A1: We'll use Docker and AWS.
        
        • Discussed authentication options
        • Team prefers JWT over sessions
        
        KEY DECISIONS:
        ✓ Will use Docker for deployment
        ✓ JWT authentication confirmed
    ''',
    'key_points': ['deployment', 'Docker', 'authentication', 'JWT'],
    'message_count': 85,
    'participants': ['Alice', 'Bob', 'Charlie'],
    'method': 'gemini-ai',  # or 'extractive'
    'time_range': {
        'start': '2026-02-01T09:00:00',
        'end': '2026-02-01T12:30:00'
    }
}
```

### 2. `_generate_summary(messages)`

**What it does:** Creates extractive summary using sentence scoring.

**Process:**
```python
1. Clean each message text
2. Filter short messages (< 10 chars)
3. Score all sentences
4. Select diverse top sentences
5. Sort chronologically
6. Format into categories
```

**Returns:**
```python
{
    'summary': 'Formatted summary text',
    'key_points': ['topic1', 'topic2', 'topic3'],
    'participants': ['Alice', 'Bob']
}
```

### 3. `_score_sentences(texts)`

**What it does:** Calculates importance score for each sentence.

**Scoring Formula:**
```python
total_score = (
    tfidf_score * 0.25 +        # Uniqueness of content
    length_score * 0.15 +       # Optimal length
    position_score * 0.1 +      # Position in conversation
    importance_score * 0.3 +    # Important markers
    density_score * 0.2         # Information content
)
```

### 4. `_select_diverse_sentences(scored_sentences, num_sentences)`

**What it does:** Selects sentences while avoiding duplicates.

**Algorithm:**
```python
for each sentence in scored_sentences:
    for each selected sentence:
        # Calculate word overlap
        overlap = len(words1 & words2) / len(words1 | words2)
        
        if overlap > 0.7:  # Too similar
            skip this sentence
    
    if not too_similar:
        select this sentence
```

### 5. `_format_summary(sentences)`

**What it does:** Organizes sentences into clean format.

**Categories:**
- **Q&A Pairs** - Questions with their answers
- **Discussions** - General discussion points
- **Decisions** - Marked with decision keywords

**Example Output:**
```
Q1: How should we handle authentication?
A1: JWT tokens would work best for our use case.

• Discussed various frontend frameworks
• React seems to be the team favorite

KEY DECISIONS:
✓ We'll use JWT for authentication
✓ Frontend will be built with React
```

### 6. `_generate_gemini_summary(messages, extractive_result)`

**What it does:** Uses Gemini AI to create polished summary.

**Returns:** Natural language summary with extracted key decisions.

### 7. `_save_summary(channel_id, summary_text, ...)`

**What it does:** Saves summary to database.

---

## Summarization Algorithms

### TF-IDF Scoring

**Term Frequency (TF):** How often does word appear?
```python
tf = word_count / total_words
```

**Inverse Document Frequency (IDF):** How unique is the word?
```python
idf = log(total_documents / documents_containing_word)
```

**TF-IDF:** Importance score
```python
tfidf = tf × idf
```

### Length Scoring

```python
def _length_score(word_count):
    # Prefer medium-length sentences
    if word_count < 5:
        return 0.3  # Too short
    elif word_count <= 15:
        return 1.0  # Optimal
    elif word_count <= 25:
        return 0.8  # Good
    else:
        return 0.6  # Too long
```

### Importance Markers

Sentences containing these words get higher scores:
- Questions: "?", "how", "what", "why"
- Decisions: "decided", "will", "agreed", "confirmed"
- Key phrases: "important", "must", "should"

### Diversity Check

```python
# Word overlap calculation
words1 = set(sentence1.split())
words2 = set(sentence2.split())

intersection = words1 & words2  # Common words
union = words1 | words2         # All unique words

overlap = len(intersection) / len(union)

# If overlap > 0.7 (70%), sentences are too similar
```

---

## Usage Examples

### Example 1: Basic Channel Summary

```python
from agents.summarizer import SummarizerAgent

agent = SummarizerAgent()

# Summarize last 100 messages
result = agent.summarize_channel(
    channel_id=123,
    message_count=100,
    user_id=456
)

if result['success']:
    print("📝 SUMMARY")
    print("=" * 40)
    print(result['summary'])
    print("\n🔑 Key Points:", ", ".join(result['key_points']))
    print(f"\n👥 Participants: {', '.join(result['participants'])}")
    print(f"📊 Messages analyzed: {result['message_count']}")
```

### Example 2: Check Summary Method

```python
result = agent.summarize_channel(channel_id=123)

if result['success']:
    if result['method'] == 'gemini-ai':
        print("✨ AI-enhanced summary generated")
    else:
        print("📋 Extractive summary generated")
        print("(Enable Gemini API for AI-enhanced summaries)")
```

### Example 3: Get Summary for Time Range

```python
result = agent.summarize_channel(
    channel_id=123,
    message_count=200  # More messages = longer time range
)

if result['success']:
    time_range = result['time_range']
    print(f"Summary covers: {time_range['start']} to {time_range['end']}")
```

### Example 4: Error Handling

```python
result = agent.summarize_channel(channel_id=123)

if not result['success']:
    if 'Not enough messages' in result.get('error', ''):
        print(f"Need more messages. Found: {result.get('message_count', 0)}")
        print("Minimum required: 20 messages")
    else:
        print(f"Error: {result['error']}")
```

---

## Database Integration

### Saving Summary

```sql
INSERT INTO channel_summaries 
    (channel_id, summary_text, message_count, 
     start_message_id, end_message_id, created_by)
VALUES 
    (123, 'Summary text...', 85, 1000, 1085, 456)
```

### Logging Activity

```sql
INSERT INTO ai_agent_logs 
    (channel_id, user_id, action_type, input_text, output_text, status)
VALUES 
    (123, 456, 'summarization', 
     'Analyzed 85 messages', 
     'Q1: How do we deploy...', 
     'success')
```

---

## Output Format Examples

### Extractive Summary Format

```
Q1: What framework should we use?
A1: React seems like the best choice for our needs.

Q2: How will we handle state management?
A2: Redux or Zustand, let's discuss more.

• The team discussed deployment options
• AWS was mentioned as the primary cloud provider
• Performance testing should be done before launch

KEY DECISIONS:
✓ React will be our frontend framework
✓ Deployment will be on AWS
```

### Gemini AI Enhanced Format

```
📋 CONVERSATION SUMMARY

The team had a productive discussion about the project architecture.
The main focus was on frontend technology choices and deployment strategy.

KEY POINTS:
1. React was chosen as the frontend framework due to its ecosystem
2. AWS will be used for cloud deployment
3. The team agreed to use Docker for containerization

DECISIONS MADE:
• Frontend: React with TypeScript
• Backend: Node.js with Express
• Deployment: Docker on AWS ECS

NEXT STEPS:
- Set up CI/CD pipeline
- Create initial project structure
- Schedule follow-up meeting
```

---

## Configuration

### Gemini API Setup

```python
# config.py
GEMINI_API_KEY = "your-api-key-here"

# The agent will automatically try these models:
model_names = [
    'gemini-1.5-pro-latest',
    'gemini-1.5-pro',
    'gemini-pro-latest',
    'gemini-pro'
]
```

### Adjustable Parameters

```python
# In SummarizerAgent.__init__()
self.min_messages_for_summary = 20  # Minimum messages needed
self.max_summary_sentences = 10     # Max sentences in extractive summary
```

---

## Summary

The Summarizer Agent helps AuraFlow users by:
- ✅ Creating concise summaries of long conversations
- ✅ Extracting Q&A pairs and key decisions
- ✅ Identifying active participants
- ✅ Using smart sentence scoring for relevance
- ✅ Avoiding duplicate/similar content
- ✅ Optional AI enhancement with Gemini

It's like having a smart assistant that takes meeting notes! 📝
