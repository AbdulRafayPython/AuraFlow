# 🤖 AuraFlow Agent Integration — Master Implementation Document

**Version:** 1.0  
**Created:** February 22, 2026  
**Status:** Active Implementation Guide  
**Purpose:** Full context + prompt for continuous AI-assisted development

---

## 📌 HOW TO USE THIS DOCUMENT

This document serves as **the single source of truth** for implementing the full Agent Integration system. Every phase has checkboxes. Mark `[x]` as each item is completed. When resuming work in a new session, provide this document as context so the AI has full project state.

---

## 🧠 PROJECT CONTEXT SUMMARY

### What Is AuraFlow?

AuraFlow is an **AI-powered communication platform** (FYP project) combining real-time messaging (text, voice, video calls, DMs) with **7 embedded AI agents** that automate community management, mood analysis, content moderation, and more.

### Tech Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| **Frontend** | React 18 + TypeScript + Vite | Tailwind CSS, Socket.IO client, React Router v6 |
| **Backend** | Flask + Python 3.x | Flask-SocketIO, Flask-JWT-Extended, PyMySQL |
| **Database** | MySQL 8 (utf8mb4) | DBUtils connection pooling (PooledDB, max 20 conns) |
| **Real-time** | Socket.IO | eventlet/gevent for production, threading for dev |
| **AI** | Multiple | Gemini API (summarizer), lexicon-based (mood), regex (moderation) |
| **Task Queue** | ✅ Celery 5.6.2 | Redis broker, solo pool (Windows), 3 queues |
| **Cache** | ✅ Redis (Memurai) | Agent settings cache, rate limiting, installed agents cache |

### Team Members

| # | Student ID | Name |
|---|-----------|------|
| 1 | 14497 | Abdul Rafay |
| 2 | 14514 | Syeda Zehra Batool Abdi |
| 3 | 14610 | Rabia Naseer |
| 4 | 15127 | Muhammad Anas |

**Supervisor:** Muhammad Zaid

---

## 🗂️ EXISTING CODEBASE INVENTORY

### Backend Agents (All Functional)

| Agent | File | Lines | Key Method | Dependencies |
|-------|------|-------|------------|-------------|
| **Moderation** | `agents/moderation.py` | 595 | `moderate_message(text, user_id, channel_id)` | JSON lexicon files |
| **Engagement** | `agents/engagement.py` | 935 | `analyze_engagement(channel_id, hours)` | DB only |
| **Focus** | `agents/focus.py` | 370 | `analyze_focus(channel_id, hours)` | TextProcessor |
| **Wellness** | `agents/wellness.py` | 383 | `check_user_wellness(user_id)` | DB only |
| **Mood Tracker** | `agents/mood_tracker.py` | 1677 | `analyze_message(text)` | deep_translator, textblob, transformers (optional) |
| **Summarizer** | `agents/summarizer.py` | 787 | `summarize_channel(channel_id, count, user_id)` | Gemini API, TextProcessor |
| **Knowledge Builder** | `agents/knowledge_builder.py` | 413 | `extract_knowledge(channel_id, hours)` | TextProcessor |
| **Knowledge Builder v2** | `agents/knowledge_builder_v2.py` | 529 | `extract_knowledge(channel_id, hours)` | Pure regex, no ML |

### Backend Routes

- **`routes/agents.py`** (2977 lines) — All agent API endpoints under `/api/agents/`
- **`routes/sockets.py`** (2381 lines) — All Socket.IO event handlers
- **`routes/messages.py`** — Channel + DM message CRUD
- **`app.py`** (465 lines) — Flask app with all route registration

### Frontend Agent UI (All Exist)

| Component | File | Purpose |
|-----------|------|---------|
| **AIAgentContext** | `contexts/AIAgentContext.tsx` | State + API methods for all agents |
| **AgentDetails** | `pages/AgentDetails.tsx` (367 lines) | Dynamic agent detail page (`/agent/:agentId`) |
| **DiscoverCommunities** | `pages/DiscoverCommunities.tsx` (978 lines) | Explore page with "AI Agents" tab |
| **SummarizerAgent** | `components/ai-agents/SummarizerAgent.tsx` | Summarizer UI |
| **MoodTrackerAgent** | `components/ai-agents/MoodTrackerAgent.tsx` | Mood tracker UI |
| **ModerationAgent** | `components/ai-agents/ModerationAgent.tsx` | Moderation UI |
| **EngagementAgent** | `components/ai-agents/EngagementAgent.tsx` | Engagement UI |
| **WellnessAgent** | `components/ai-agents/WellnessAgent.tsx` | Wellness UI |
| **KnowledgeBuilderAgent** | `components/ai-agents/KnowledgeBuilderAgent.tsx` | Knowledge builder UI |
| **FocusAgent** | `components/ai-agents/FocusAgent.tsx` | Focus agent UI |
| **AIAgentPanel** | `components/ai-agents/AIAgentPanel.tsx` | Dashboard agent panel |
| **AgentCard** | `components/ai-agents/AgentCard.tsx` | Reusable agent card |

### Database Tables (Already Exist)

| Table | Purpose |
|-------|---------|
| `ai_agents` | Agent registry (type enum, name, description, is_active) |
| `ai_agent_logs` | Action logs (agent_name, action_type, input/output, status, execution_time) |
| `conversation_summaries` | Stored channel summaries |
| `mood_tracking` | Per-message sentiment records |
| `user_mood_history` | Historical mood records |
| `user_moods` | Mood snapshots with detected_emotions JSON |
| `wellness_tracking` | Daily wellness metrics |
| `engagement_metrics` | Daily channel engagement |
| `knowledge_base` | Extracted Q&A pairs with FULLTEXT search |
| `moderation_log` | Legacy moderation log |
| `moderation_logs` | Newer moderation log |

### What Does NOT Exist Yet

| Component | Status |
|-----------|--------|
| `agent_registry` table (per architecture doc) | ✅ Created + seeded (7 agents with features/defaults) |
| `community_agents` table (installations) | ✅ Created with FK constraints + indexes |
| `user_agents` table (personal activations) | ✅ Created with FK constraints + indexes |
| Redis server / client library | ✅ Memurai v4.2.2 running on localhost:6379 |
| Celery task queue | ✅ celery_app.py + tasks/agent_tasks.py (8 tasks) |
| Community Settings → Agents tab | ✅ CommunityAgentsTab.tsx built |
| Agent install/uninstall flow | ✅ Full API + frontend modals |
| Agent auto-execution on messages | ✅ sockets.py + messages.py dispatch |
| Permission decorators for agents | ✅ _check_community_admin/_check_community_member in routes/agents.py |
| AgentDetailModal (install modal) | ✅ AgentDetailModal.tsx + AgentSettingsModal.tsx + AgentConfirmDialog.tsx |

---

## 🏗️ ARCHITECTURE — TARGET STATE

### System Architecture with Celery + Redis

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (React + Vite)                        │
│                                                                          │
│  ┌────────────────┐   ┌──────────────┐   ┌────────────────────────────┐ │
│  │ Explore Section│   │ Community    │   │ Agent Detail Pages         │ │
│  │ AI Agents Tab  │──▶│ Settings     │──▶│ /agent/:agentId            │ │
│  │ (Discovery)    │   │ Agents Tab   │   │ (Config + Testing + Logs)  │ │
│  └────────────────┘   └──────────────┘   └────────────────────────────┘ │
│          │                    │                        │                  │
│          ▼                    ▼                        ▼                  │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                  AIAgentContext (Enhanced)                       │   │
│  │  + installAgent() + uninstallAgent() + configureAgent()         │   │
│  │  + getCatalog()   + getCommunityAgents()                        │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                              │                                           │
└──────────────────────────────┼───────────────────────────────────────────┘
                               │ REST API + Socket.IO
┌──────────────────────────────┼───────────────────────────────────────────┐
│                              ▼            BACKEND (Flask)                │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────┐          │
│  │                   Flask App (app.py)                       │          │
│  │  routes/agents.py  — Agent CRUD + catalog + config        │          │
│  │  routes/messages.py — Message handling (triggers agents)   │          │
│  │  routes/sockets.py  — Real-time events                    │          │
│  └────────────┬──────────────────────────────────────────────┘          │
│               │                                                          │
│               ▼                                                          │
│  ┌────────────────────────┐    ┌─────────────────────────────┐          │
│  │   Celery Workers       │    │      Redis                   │          │
│  │                        │◀──▶│  - Task broker               │          │
│  │  beat (periodic tasks):│    │  - Result backend            │          │
│  │   • mood auto-track    │    │  - Socket.IO message queue   │          │
│  │   • engagement check   │    │  - Agent settings cache      │          │
│  │   • wellness scan      │    │  - Rate limiting             │          │
│  │                        │    │  - Session cache (optional)   │          │
│  │  workers (on-demand):  │    └─────────────────────────────┘          │
│  │   • moderation check   │                                              │
│  │   • summarize channel  │                                              │
│  │   • knowledge extract  │                                              │
│  │   • focus analyze      │                                              │
│  └────────────────────────┘                                              │
│               │                                                          │
└───────────────┼──────────────────────────────────────────────────────────┘
                │
┌───────────────┼──────────────────────────────────────────────────────────┐
│               ▼                  DATABASE (MySQL)                        │
│                                                                          │
│  ┌──────────────────┐  ┌───────────────────┐  ┌──────────────────┐     │
│  │  agent_registry   │  │ community_agents  │  │   user_agents    │     │
│  │  (7 agent defs)   │  │ (installations)   │  │  (activations)   │     │
│  └──────────────────┘  └───────────────────┘  └──────────────────┘     │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Existing: conversation_summaries, mood_tracking, moderation_log │   │
│  │  wellness_tracking, engagement_metrics, knowledge_base,          │   │
│  │  ai_agent_logs, user_moods, user_mood_history                    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

### Celery Task Types

| Task | Type | Trigger | Agent |
|------|------|---------|-------|
| `moderate_message_task` | On-demand | Every new channel message | Moderation |
| `track_mood_task` | On-demand | Every new message (user's) | Mood Tracker |
| `check_engagement_task` | Periodic (every 30min) | Celery Beat | Engagement |
| `check_wellness_task` | Periodic (every 1hr) | Celery Beat | Wellness |
| `summarize_channel_task` | On-demand | `/summarize` command or API | Summarizer |
| `extract_knowledge_task` | Periodic (every 2hr) or on-demand | Beat or API | Knowledge Builder |
| `analyze_focus_task` | On-demand | Every N messages or API | Focus |

### Redis Usage Plan

| Key Pattern | Purpose | TTL |
|-------------|---------|-----|
| `agent:settings:{community_id}:{agent_type}` | Cached agent settings | 5 min |
| `agent:installed:{community_id}` | List of installed agents | 5 min |
| `agent:personal:{user_id}` | User's active personal agents | 10 min |
| `agent:rate:{agent_type}:{entity_id}` | Rate limiting per agent | varies |
| `celery` | Task broker queue | auto |
| `celery-result-*` | Task results | 1 hr |

---

## 📋 IMPLEMENTATION PHASES

### Phase 1: Infrastructure (Redis + Celery Setup) ✅ COMPLETE
- [x] Install Redis for Windows (Memurai v4.2.2 at C:\Program Files\Memurai)
- [x] Add `redis`, `celery` to `requirements.txt`
- [x] Create `Backend/celery_app.py` — Celery configuration (3 queues, beat schedule)
- [x] Create `Backend/tasks/` directory with `__init__.py`
- [x] Add Redis config to `Backend/config.py` (REDIS_URL env var)
- [x] Update `Backend/app.py` to initialize Celery
- [x] Create `Backend/tasks/agent_tasks.py` — 8 Celery tasks (4 on-demand + 4 periodic)
- [x] Celery Beat schedule integrated in celery_app.py (no separate file needed)
- [x] Test: Redis PONG ✅, Worker registered all 8 tasks ✅, Beat scheduler running ✅
- [x] Add `start_celery.bat` helper script (worker + beat-only modes)

### Phase 2: Database Migration (New Tables) ✅ COMPLETE
- [x] Create `Backend/migrations/add_agent_integration_tables.sql`
  - `agent_registry` — 7 agents seeded with features JSON + default_settings JSON
  - `community_agents` — FK to communities, agent_registry, users + unique constraint
  - `user_agents` — FK to users, agent_registry + unique constraint
- [x] Run migration on development database
- [x] Verify tables created with correct indexes
- [x] Insert seed data for all 7 agents into `agent_registry`
- [x] Fix ai_agent_logs schema (added agent_name, input_data, output_data, status, execution_time_ms)

### Phase 3: Backend API — Agent Catalog & Management ✅ COMPLETE
- [x] Add new endpoints to `Backend/routes/agents.py` (lines 2980-3735):
  - `GET /api/agents/catalog` — Full catalog with install status (Redis cached)
  - `POST /api/agents/install/community/<id>` — Install community agent (admin check)
  - `DELETE /api/agents/uninstall/community/<id>/<type>` — Uninstall (admin check)
  - `PUT /api/agents/configure/community/<id>/<type>` — Configure settings (admin check)
  - `GET /api/agents/status/community/<id>` — Get community's installed agents (Redis cached)
  - `POST /api/agents/activate/personal` — Activate personal agent
  - `DELETE /api/agents/deactivate/personal/<type>` — Deactivate personal agent
  - `GET /api/agents/status/personal` — Get user's active agents (Redis cached)
  - `PUT /api/agents/configure/personal/<type>` — Configure personal agent settings
  - `GET /api/agents/logs` — Paginated agent execution logs
- [x] Add permission helpers in `Backend/routes/agents.py`:
  - `_check_community_admin(community_id, user_id)` — Verify admin/owner role
  - `_check_community_member(community_id, user_id)` — Verify membership
  - `_get_user_id()` — Get user ID from JWT
- [x] All endpoints tested via catalog/status API calls

### Phase 4: Agent Auto-Execution (Celery Tasks) ✅ COMPLETE
- [x] Wire moderation agent into sockets.py (conditional: checks community_agents install)
- [x] Wire mood tracker into sockets.py + messages.py (Celery fire-and-forget)
- [x] Wire focus analysis into sockets.py + messages.py (every 50 messages)
- [x] Create Celery Beat schedule in celery_app.py:
  - `check_engagement_periodic` every 30min for installed communities
  - `check_wellness_periodic` every 1hr for activated users
  - `extract_knowledge_periodic` every 2hr for installed communities
  - `cleanup_old_logs` daily at 3 AM
- [x] Add agent execution guards (_is_agent_installed, _is_personal_agent_active)
- [x] Log all agent executions to `ai_agent_logs` with timing (agent_name, status, execution_time_ms)
- [x] Usage tracking: usage_count + last_active/last_used incremented per execution
- [x] ModerationAgent logs to both old columns (input_text/output_text) and new columns (agent_name/input_data/output_data/status)

### Phase 5: Frontend — Agent Catalog & Discovery UI ✅ COMPLETE
- [x] Update `DiscoverCommunities.tsx` AI Agents tab:
  - Fetches from `/api/agents/catalog` via AIAgentContext
  - Shows install status per agent with AgentStatusBadge
  - Agent cards open AgentDetailModal on click
- [x] Create `AgentDetailModal.tsx`:
  - Community agent: Community dropdown → Install button
  - Personal agent: Activate button directly
  - Features list, description, settings preview
- [x] AgentStatusBadge.tsx shows installed/active/available states
- [x] Wire up install/uninstall/activate/deactivate via AgentModalsContext
- [x] Toast notifications for success/error states
- [x] Loading states and error handling

### Phase 6: Frontend — Community Settings Agents Tab ✅ COMPLETE
- [x] CommunityAgentsTab.tsx with installed agents list
- [x] Agent cards with enable/disable toggles
- [x] Configure button → AgentSettingsModal with per-agent settings
- [x] AgentSettingsModal.tsx — Dynamic settings UI per agent type
- [x] Usage stats display (usage_count, last_active)
- [x] Uninstall button → AgentConfirmDialog confirmation
- [x] AgentCommandModal for /summarize command

### Phase 7: Frontend — Enhanced Agent Detail Pages ✅ COMPLETE
- [x] AgentDetails.tsx with Capabilities, Settings, Logs, Testing tabs
- [x] **Capabilities tab**: Feature list from agent_registry features JSON
- [x] **Settings tab**: Mirrors community/personal settings
- [x] **Logs tab**: Paginated via `/api/agents/logs` endpoint
- [x] **Testing tab**: Interactive sandbox (moderation testing, mood analysis)
- [x] PersonalAgentsPanel.tsx for personal agent management

### Phase 8: Polish & Integration ✅ COMPLETE
- [x] Socket.IO events for agent actions:
  - `moderation_alert` — Real-time moderation notification (block/flag/warn)
  - `moderation_action_logged` — Community-wide moderation activity
  - `command_result` — Agent command results (/summarize, /help)
  - `message_blocked` / `moderation_warning` — User-facing moderation feedback
- [x] AgentModalsProvider context wired into App.tsx
- [x] Celery worker running with rate limiting (60/m moderation, 60/m mood, 10/m summarizer)
- [x] Error handling with max_retries (2 for on-demand, auto for periodic)
- [x] Rate limiting per agent via Redis (services/redis_client.py)
- [x] UI modal system: AgentDetailModal, AgentSettingsModal, AgentConfirmDialog, AgentCommandModal

---

## 🔧 KEY IMPLEMENTATION DETAILS

### Celery Configuration

**File: `Backend/celery_app.py`**
```python
from celery import Celery
from celery.schedules import crontab
from config import REDIS_URL

celery_app = Celery(
    'auraflow',
    broker=REDIS_URL,          # redis://localhost:6379/0
    backend=REDIS_URL,
    include=['tasks.agent_tasks']
)

celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,     # Fair task distribution
    task_soft_time_limit=120,         # 2 min soft limit
    task_time_limit=180,              # 3 min hard limit
    result_expires=3600,              # Results expire after 1 hour
)

# Periodic tasks (Celery Beat)
celery_app.conf.beat_schedule = {
    'check-community-engagement': {
        'task': 'tasks.agent_tasks.check_engagement_periodic',
        'schedule': crontab(minute='*/30'),  # Every 30 minutes
    },
    'check-user-wellness': {
        'task': 'tasks.agent_tasks.check_wellness_periodic',
        'schedule': crontab(minute='*/60'),  # Every hour
    },
    'extract-knowledge-periodic': {
        'task': 'tasks.agent_tasks.extract_knowledge_periodic',
        'schedule': crontab(minute='*/120'),  # Every 2 hours
    },
    'cleanup-old-agent-logs': {
        'task': 'tasks.agent_tasks.cleanup_old_logs',
        'schedule': crontab(hour=3, minute=0),  # Daily at 3 AM
    },
}
```

### Redis Config Addition

**Add to `Backend/config.py`:**
```python
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
```

### New Requirements

**Add to `requirements.txt`:**
```
redis>=5.0.0
celery>=5.3.0
```

### Migration SQL

**File: `Backend/migrations/add_agent_integration_tables.sql`**
```sql
USE auraflow;

-- Agent Registry (catalog of all 7 agents)
CREATE TABLE IF NOT EXISTS agent_registry (
    agent_type VARCHAR(50) PRIMARY KEY,
    display_name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    category ENUM('community', 'personal') NOT NULL,
    icon VARCHAR(10),
    default_settings JSON,
    features JSON,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Community Agent Installations
CREATE TABLE IF NOT EXISTS community_agents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    community_id INT NOT NULL,
    agent_type VARCHAR(50) NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    settings JSON,
    installed_by INT NOT NULL,
    installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active TIMESTAMP NULL,
    usage_count INT DEFAULT 0,
    FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_type) REFERENCES agent_registry(agent_type),
    FOREIGN KEY (installed_by) REFERENCES users(id),
    UNIQUE KEY unique_community_agent (community_id, agent_type),
    INDEX idx_community_enabled (community_id, enabled),
    INDEX idx_agent_type (agent_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Personal Agent Activations
CREATE TABLE IF NOT EXISTS user_agents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    agent_type VARCHAR(50) NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    settings JSON,
    activated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP NULL,
    usage_count INT DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_type) REFERENCES agent_registry(agent_type),
    UNIQUE KEY unique_user_agent (user_id, agent_type),
    INDEX idx_user_enabled (user_id, enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed agent registry
INSERT INTO agent_registry (agent_type, display_name, description, category, icon, default_settings, features) VALUES
('moderation', 'Moderation Agent', 'Auto-moderate toxic content, spam, hate speech, and violations with multi-language support including Roman Urdu', 'community', '🛡️',
 '{"sensitivity": "medium", "auto_action": false, "roman_urdu": true, "auto_delete_critical": true}',
 '["Real-time content scanning", "Multi-language support (English + Roman Urdu)", "Spam & repetition detection", "Hate speech & harassment filtering", "Personal info protection", "Admin notification system", "Configurable sensitivity levels"]'),

('engagement', 'Engagement Agent', 'Boost community activity with polls, challenges, icebreakers and conversation starters', 'community', '🎯',
 '{"auto_suggestions": true, "frequency": "low", "activity_types": ["polls", "icebreakers", "challenges"]}',
 '["Inactivity detection & alerts", "Polls & quick surveys", "Ice-breaker activities", "Fun challenges", "Conversation starters by category", "Engagement score tracking", "Activity usage analytics"]'),

('knowledge', 'Knowledge Builder', 'Extract Q&A pairs, definitions, and decisions to build a searchable knowledge base', 'community', '📚',
 '{"auto_extract": false, "min_relevance": 0.5, "dedup_threshold": 0.85}',
 '["FAQ extraction from conversations", "Definition & decision detection", "Auto-tagging with keywords", "Duplicate prevention", "Full-text search", "Usage tracking & analytics", "Community-wide knowledge insights"]'),

('focus', 'Focus Agent', 'Monitor conversation focus, detect topic drift, and keep discussions on track', 'community', '🎯',
 '{"alert_on_drift": true, "check_every_n_messages": 50, "min_focus_score": 0.6}',
 '["Topic extraction & keyword analysis", "Focus score calculation (0-1)", "Topic drift detection", "Dominant topic identification", "Conversation coherence tracking"]'),

('summarizer', 'Summarizer Agent', 'Generate intelligent conversation summaries with key points extraction', 'personal', '📝',
 '{"style": "bullet_points", "max_messages": 100, "use_ai": true}',
 '["Extractive summarization (TextRank)", "AI-powered summaries (Gemini)", "Key points extraction", "Participant identification", "Time range tracking", "Summary storage & retrieval"]'),

('mood', 'Mood Tracker', 'Track emotional tone in conversations with Roman Urdu support and sentiment visualization', 'personal', '😊',
 '{"auto_track": true, "include_emojis": true, "roman_urdu": true}',
 '["Roman Urdu sentiment analysis", "Emoji-aware scoring", "Negation handling", "Mood trend visualization", "Community-wide mood analytics", "Wellness recommendations", "Day/time pattern insights"]'),

('wellness', 'Wellness Agent', 'Monitor activity patterns and provide wellness suggestions based on usage behavior', 'personal', '🧘',
 '{"break_reminders": true, "activity_alerts": true, "check_interval_hours": 1}',
 '["Activity pattern monitoring", "Stress indicator detection", "Break reminders", "Wellness score tracking", "Personalized suggestions", "Historical trend analysis"]')

ON DUPLICATE KEY UPDATE display_name=VALUES(display_name), description=VALUES(description);
```

### Permission Matrix

| Action | Owner | Admin | Member | Non-Member |
|--------|-------|-------|--------|------------|
| View agent catalog | ✅ | ✅ | ✅ | ✅ |
| Install community agent | ✅ | ✅ | ❌ | ❌ |
| Uninstall community agent | ✅ | ✅ | ❌ | ❌ |
| Configure community agent | ✅ | ✅ | ❌ | ❌ |
| View installed agents | ✅ | ✅ | ✅ | ❌ |
| Activate personal agent | ✅ | ✅ | ✅ | ✅ |
| Use /summarize command | ✅ | ✅ | ✅ | ❌ |
| View agent analytics | ✅ | ✅ | ❌ | ❌ |

### Agent Classification

**Community-Level (Admin installs for entire community):**
- 🛡️ Moderation — Auto-executes on every message
- 🎯 Engagement — Periodic checks via Celery Beat
- 📚 Knowledge Builder — Periodic extraction or manual trigger
- 🎯 Focus — Trigger every N messages or manual

**Personal-Level (User activates for themselves):**
- 📝 Summarizer — Command: `/summarize`
- 😊 Mood Tracker — Auto-tracks user's messages
- 🧘 Wellness — Periodic wellness checks

---

## 📂 FILE STRUCTURE — NEW FILES TO CREATE

```
Backend/
├── celery_app.py                              ← Celery configuration
├── tasks/
│   ├── __init__.py
│   └── agent_tasks.py                         ← All Celery task definitions
├── migrations/
│   └── add_agent_integration_tables.sql       ← New tables migration
├── services/
│   └── redis_client.py                        ← Redis client wrapper

Frontend/src/
├── components/
│   └── modals/
│       └── AgentDetailModal.tsx               ← Install/activate modal
│   └── ai-agents/
│       └── AgentSettingsPanel.tsx              ← Per-agent settings form
├── services/
│   └── agentService.ts                        ← Agent API service layer
```

---

## 🔗 EXISTING FILE MODIFICATIONS NEEDED

| File | Changes |
|------|---------|
| `Backend/config.py` | Add REDIS_URL |
| `Backend/requirements.txt` | Add redis, celery |
| `Backend/app.py` | Initialize Celery, add Redis-backed Socket.IO |
| `Backend/routes/agents.py` | Add catalog/install/uninstall/configure/status endpoints |
| `Backend/routes/messages.py` | Wire agent auto-execution on message send |
| `Backend/routes/sockets.py` | Add agent event emissions |
| `Backend/utils.py` | Add permission decorators |
| `Frontend/src/contexts/AIAgentContext.tsx` | Add install/uninstall/configure/catalog methods |
| `Frontend/src/pages/DiscoverCommunities.tsx` | Fetch catalog from API, add install flow |
| `Frontend/src/pages/AgentDetails.tsx` | Fill Capabilities/Settings/Logs/Testing tabs |
| `Frontend/src/components/modals/CommunitySettingsModal.tsx` | Add Agents management tab |

---

## 🎨 UI DESIGN GUIDELINES

### Color System per Agent

| Agent | Primary Color | Gradient |
|-------|--------------|----------|
| Moderation | `red-500` | `from-red-500 to-rose-600` |
| Engagement | `emerald-500` | `from-emerald-500 to-teal-600` |
| Knowledge Builder | `indigo-500` | `from-indigo-500 to-blue-600` |
| Focus | `orange-500` | `from-orange-500 to-amber-600` |
| Summarizer | `blue-500` | `from-blue-500 to-cyan-600` |
| Mood Tracker | `pink-500` | `from-pink-500 to-rose-600` |
| Wellness | `purple-500` | `from-purple-500 to-violet-600` |

### Component Styling Standards

- **Cards**: `rounded-2xl`, `border border-[hsl(var(--theme-border-default)/0.3)]`, `backdrop-blur-sm`
- **Buttons**: `rounded-xl`, `active:scale-95`, gradient backgrounds for primary actions
- **Badges**: `rounded-full`, `text-[11px]`, `font-medium`, `px-2.5 py-0.5`
- **Toggles**: Custom switch with `bg-emerald-500` for active, theme transition
- **Modals**: `rounded-2xl`, `backdrop-blur-xl`, smooth enter/exit animations
- **Loading**: Skeleton shimmer with `animate-pulse`, matching card dimensions

---

## ⚡ PERFORMANCE CONSIDERATIONS

### Backend Optimization

1. **Celery Worker Concurrency**: Start with 2-4 workers (student project, limited resources)
2. **Redis Memory**: ~50MB should suffice for task queue + cache
3. **Agent Execution Guards**: Always check `community_agents` / `user_agents` before running
4. **Batch Operations**: Bulk-fetch agent settings for a community (single query, cached in Redis)
5. **Connection Pool**: Already using DBUtils PooledDB (max 20 connections)

### Frontend Optimization

1. **Lazy Load**: Agent detail pages and heavy components
2. **Cache API Responses**: SWR-style caching in AIAgentContext
3. **Debounce Settings**: Debounce settings changes (500ms)
4. **Skeleton Loading**: Show skeletons while fetching catalog/status
5. **Optimistic Updates**: Toggle agent enable/disable immediately, revert on error

---

## 🧪 TESTING CHECKLIST

### Backend Tests
- [ ] Agent catalog returns all 7 agents
- [ ] Install community agent (admin) → 201
- [ ] Install community agent (member) → 403
- [ ] Install duplicate agent → 409
- [ ] Uninstall agent → 200
- [ ] Configure agent settings → 200
- [ ] Activate personal agent → 201
- [ ] Deactivate personal agent → 200
- [ ] Message triggers moderation (when installed)
- [ ] Message skips moderation (when not installed)
- [ ] Celery Beat fires engagement check
- [ ] Celery Beat fires wellness check
- [ ] Redis caching works for agent settings
- [ ] Rate limiting prevents agent spam

### Frontend Tests
- [ ] Explore page shows catalog with correct categories
- [ ] Install modal shows user's communities
- [ ] Install succeeds with toast notification
- [ ] Agent appears in community settings after install
- [ ] Toggle enable/disable updates immediately
- [ ] Settings save correctly
- [ ] Uninstall removes with confirmation
- [ ] Personal agent activate/deactivate works
- [ ] Agent detail page shows all tabs
- [ ] Logs tab shows paginated history

---

## 🚀 STARTUP COMMANDS (Development)

```powershell
# Terminal 1: Redis
redis-server

# Terminal 2: Celery Worker  
cd Backend
venv\Scripts\activate
celery -A celery_app worker --loglevel=info --pool=solo -c 2

# Terminal 3: Celery Beat (periodic tasks)
cd Backend
venv\Scripts\activate
celery -A celery_app beat --loglevel=info

# Terminal 4: Flask Backend
cd Backend
venv\Scripts\activate
python app.py

# Terminal 5: Frontend
cd Frontend
npm run dev
```

---

## 📝 IMPLEMENTATION NOTES

### Critical Decisions

1. **Celery `--pool=solo` on Windows**: Windows doesn't support `prefork`, use `solo` or `eventlet`
2. **Redis on Windows**: Use Docker (`docker run -d -p 6379:6379 redis`) or Memurai/WSL
3. **Agent settings stored as JSON**: Maximum flexibility, no schema changes needed per agent
4. **community_agents vs ai_agents table**: Keep both — `ai_agents` is the legacy registry, `agent_registry` is the new normalized catalog. Migrate gradually.
5. **Socket.IO with Redis**: For multi-worker support, use `flask_socketio` with `message_queue='redis://...'`

### Common Gotchas

- Celery on Windows requires `--pool=solo` or `--pool=eventlet`
- Don't forget to run migrations before testing
- Agent auto-execution should be fire-and-forget (`.delay()`) — don't block message sending
- JSON settings in MySQL need `JSON` column type (MySQL 5.7+)
- When checking permissions, `community_members` table has `role` column ('owner', 'admin', 'member')

---

**This document will be updated as implementation progresses. Mark checkboxes [x] as items are completed.**
