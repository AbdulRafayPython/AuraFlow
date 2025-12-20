# AuraFlow Backend

AI-powered communication platform backend with intelligent agents.

## 📁 Project Structure

```
Backend/
├── agents/                 # AI Agent implementations
│   ├── summarizer.py      # Conversation summarization
│   ├── mood_tracker.py    # Sentiment & mood analysis (Roman Urdu)
│   ├── moderation.py      # Content moderation
│   ├── focus.py           # Conversation focus tracking
│   ├── engagement.py      # Engagement analysis
│   ├── wellness.py        # User wellness monitoring
│   └── knowledge_builder.py # Knowledge extraction
├── routes/                 # API route handlers
├── services/              # Business logic services
├── utils/ai/              # AI utilities (text processing)
├── lexicons/              # Language data for AI agents
├── migrations/            # Database migrations
├── scripts/               # Utility scripts
├── tests/                 # Test files
└── uploads/               # User uploads
```

## 🤖 AI Agents

1. **Summarizer** - Conversation summarization with keyword extraction
2. **Mood Tracker** - Sentiment analysis (English + Roman Urdu)
3. **Smart Moderation** - Content moderation & spam detection
4. **Focus Agent** - Topic tracking & drift detection
5. **Engagement Agent** - Conversation engagement metrics
6. **Wellness Agent** - Activity monitoring & break reminders
7. **Knowledge Builder** - Q&A extraction & topic organization

## 🚀 Quick Start

1. Copy `.env.example` to `.env` and fill in your database credentials and JWT secret.

2. Create and activate the venv (PowerShell):

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

3. Run database migrations:

```powershell
python scripts/run_ai_migration.py
python scripts/run_mood_migration.py
```

4. Run the app:

```powershell
python app.py
```

## 🧪 Testing

Run all agent tests:
```powershell
python tests/test_all_agents.py
```

Individual tests:
```powershell
python tests/test_summarizer.py
python tests/test_mood_tracker.py
python tests/test_moderation.py
```

## 📚 Documentation

- `BACKEND_APIS_GUIDE.md` - Complete API documentation
- `agents/SUMMARIZER_README.md` - Summarizer agent details

Available API endpoints (prefix /api):

- POST /api/signup - body: {"username": "...", "password": "..."}
- POST /api/login - body: {"username": "...", "password": "..."}
- GET /api/protected - requires Authorization: Bearer <token>

Notes and next steps

- The project uses a simple shared PyMySQL connection in `database.py`. Consider using a connection pool for production.
- Make sure your `users` table has columns at least: `id`, `username`, `password`, `token`.
- Change `JWT_SECRET_KEY` in production and keep it secret.
