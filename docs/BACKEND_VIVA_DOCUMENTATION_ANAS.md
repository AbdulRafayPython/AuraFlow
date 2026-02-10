# AuraFlow Backend Documentation
## VIVA Preparation Guide for Muhammad Anas

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Backend Architecture](#2-backend-architecture)
3. [Database Design](#3-database-design)
4. [Authentication System](#4-authentication-system)
5. [API Routes Overview](#5-api-routes-overview)
6. [AI Agents System](#6-ai-agents-system)
7. [Real-Time Communication (Socket.IO)](#7-real-time-communication-socketio)
8. [Admin Dashboard APIs](#8-admin-dashboard-apis)
9. [Security Implementation](#9-security-implementation)
10. [Common VIVA Questions & Answers](#10-common-viva-questions--answers)

---

## 1. Project Overview

### What is AuraFlow?
AuraFlow is an **AI-powered real-time communication platform** that combines messaging features (like Discord/Slack) with intelligent AI agents. Unlike traditional chat platforms, AuraFlow adds:

- **Emotional Intelligence**: Tracks user moods and sentiments
- **Content Moderation**: Automatically detects toxic content
- **Chat Summarization**: Condenses long conversations
- **Roman Urdu Support**: Full support for Pakistani users typing in Roman Urdu
- **Wellness Features**: Monitors user well-being and suggests breaks

### Team Members & Roles
| Name | Role |
|------|------|
| Abdul Rafay | Full-Stack Development, Flask APIs |
| Syeda Zehra Batool Abdi | Frontend (React.js) |
| Rabia Naseer | UI/UX Design and Testing |
| **Muhammad Anas** | **Backend & Database Support** |

### Technology Stack (Backend)
| Technology | Purpose |
|------------|---------|
| **Flask** | Python web framework for REST APIs |
| **Flask-SocketIO** | Real-time bidirectional communication |
| **Flask-JWT-Extended** | JWT token-based authentication |
| **MySQL** | Primary database (structured data) |
| **PyMySQL** | Python MySQL connector |
| **bcrypt** | Password hashing |
| **Google Generative AI (Gemini)** | AI-powered summaries |
| **Transformers (HuggingFace)** | Roman Urdu sentiment analysis |

---

## 2. Backend Architecture

### Folder Structure
```
Backend/
├── app.py                  # Main Flask application entry point
├── config.py               # Configuration (DB credentials, API keys)
├── database.py             # Database connection helper
├── utils.py                # Utility functions
├── requirements.txt        # Python dependencies
│
├── routes/                 # API Route handlers
│   ├── auth.py            # Authentication (login, signup, password reset)
│   ├── channels.py        # Community & channel management
│   ├── messages.py        # Message sending and retrieval
│   ├── friends.py         # Friend system
│   ├── reactions.py       # Emoji reactions
│   ├── sockets.py         # Socket.IO event handlers
│   ├── agents.py          # AI agent API endpoints
│   ├── admin.py           # Global admin dashboard
│   └── community_admin.py # Community-specific admin APIs
│
├── agents/                 # AI Agent implementations
│   ├── mood_tracker.py    # Sentiment analysis
│   ├── moderation.py      # Content moderation
│   ├── summarizer.py      # Chat summarization
│   ├── engagement.py      # Engagement boosters
│   ├── wellness.py        # User wellness monitoring
│   ├── knowledge_builder.py # Knowledge extraction
│   └── focus.py           # Topic focus analysis
│
├── lexicons/               # JSON data files for AI agents
│   ├── roman_urdu_sentiments.json
│   ├── moderation_keywords.json
│   └── stopwords.json
│
├── services/               # External services
│   ├── email_service.py   # Email sending (OTP)
│   └── otp_service.py     # OTP generation/verification
│
└── migrations/             # SQL migration files
```

### How Flask Application Works

**Main Entry Point (`app.py`):**
```python
from flask import Flask
from flask_jwt_extended import JWTManager
from flask_socketio import SocketIO

app = Flask(__name__)

# JWT Configuration for authentication
app.config["JWT_SECRET_KEY"] = "super-secret-key"
jwt = JWTManager(app)

# Socket.IO for real-time messaging
socketio = SocketIO(app, cors_allowed_origins=["http://localhost:5173"])

# Register routes
app.route("/api/login", methods=["POST"])(login)
app.route("/api/signup", methods=["POST"])(signup)
# ... more routes
```

**Key Concept: Route Registration**
- Routes are functions that handle HTTP requests
- `@jwt_required()` decorator protects routes requiring login
- Blueprints (`Blueprint`) group related routes together

---

## 3. Database Design

### Main Tables Explained

#### 1. Users Table
Stores all user information:
```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,    -- bcrypt hashed
  email VARCHAR(255) UNIQUE,
  display_name VARCHAR(255),
  avatar_url VARCHAR(500),
  status ENUM('online','idle','dnd','offline') DEFAULT 'offline',
  is_first_login TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 2. Communities Table (Like Discord Servers)
```sql
CREATE TABLE communities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon CHAR(2) DEFAULT 'AF',
  logo_url VARCHAR(500),
  created_by INT,        -- References users(id)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 3. Community Members (User-Community Relationship)
```sql
CREATE TABLE community_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  community_id INT,
  user_id INT,
  role ENUM('owner','admin','member') DEFAULT 'member',
  violation_count INT DEFAULT 0,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_member (community_id, user_id)
);
```

#### 4. Channels (Text/Voice channels within communities)
```sql
CREATE TABLE channels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type ENUM('text','voice','private') DEFAULT 'text',
  community_id INT,      -- Which community this channel belongs to
  created_by INT
);
```

#### 5. Messages
```sql
CREATE TABLE messages (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  channel_id INT,
  sender_id INT,
  content TEXT,
  message_type ENUM('text','image','file','system','ai') DEFAULT 'text',
  moderation_flagged BOOLEAN DEFAULT FALSE,
  moderation_score FLOAT DEFAULT 0.0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 6. AI Agent Logs
Records all AI agent activities:
```sql
CREATE TABLE ai_agent_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  agent_id INT,
  user_id INT,
  channel_id INT,
  message_id BIGINT,
  action_type VARCHAR(100),      -- e.g., 'mood_analysis', 'moderation'
  input_text TEXT,               -- Original message
  output_text TEXT,              -- AI analysis result (JSON)
  confidence_score FLOAT,
  created_at TIMESTAMP
);
```

### Database Connection Code
```python
# database.py
import pymysql
from config import DB_HOST, DB_USER, DB_PASSWORD, DB_NAME

def get_db_connection():
    return pymysql.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        cursorclass=pymysql.cursors.DictCursor  # Returns rows as dictionaries
    )
```

**Why DictCursor?**
- Normal cursor: `row[0], row[1]` (access by index)
- DictCursor: `row['username'], row['email']` (access by column name) - much cleaner!

---

## 4. Authentication System

### How Login Works

**Step 1: User sends credentials**
```
POST /api/login
Body: { "username": "anas", "password": "mypassword" }
```

**Step 2: Backend validates**
```python
def login():
    data = request.get_json()
    identifier = data.get('username')
    password = data.get('password')
    
    # 1. Find user in database
    cur.execute("SELECT * FROM users WHERE username = %s", (identifier,))
    user = cur.fetchone()
    
    # 2. Verify password using bcrypt
    if bcrypt.checkpw(password.encode(), user['password'].encode()):
        # 3. Generate JWT token
        token = create_access_token(identity=user['username'])
        return jsonify({"token": token, "user": user_data})
```

**Step 3: Frontend stores token**
- Token stored in localStorage or cookies
- Sent with every request in Authorization header: `Bearer <token>`

### JWT Token Explained
JWT (JSON Web Token) has 3 parts:
1. **Header**: Algorithm info
2. **Payload**: User data (username, expiry time)
3. **Signature**: Verification that token wasn't tampered

Example: `eyJhbGciOiJIUzI1NiIs...`

### Protected Routes
```python
@jwt_required()  # This decorator checks for valid token
def get_me():
    current_user = get_jwt_identity()  # Gets username from token
    # ... fetch user data
```

### Password Hashing with bcrypt
```python
# During signup - hash password before storing
hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())

# During login - verify password
bcrypt.checkpw(input_password.encode(), stored_hash.encode())
```

**Why bcrypt?**
- One-way hashing (can't reverse to get original password)
- Includes "salt" to prevent rainbow table attacks
- Slow by design (makes brute-force attacks harder)

---

## 5. API Routes Overview

### Authentication Routes (`routes/auth.py`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/signup` | POST | Register new user |
| `/api/login` | POST | Login and get JWT token |
| `/api/logout` | POST | Logout (invalidate token) |
| `/api/me` | GET | Get current user info |
| `/api/forgot-password` | POST | Send password reset OTP |
| `/api/verify-otp` | POST | Verify OTP code |
| `/api/reset-password` | POST | Set new password |

### Community & Channel Routes (`routes/channels.py`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/channels/communities` | GET | List user's communities |
| `/api/channels/communities` | POST | Create new community |
| `/api/channels/communities/<id>/channels` | GET | Get community's channels |
| `/api/channels/communities/<id>/channels` | POST | Create channel in community |
| `/api/channels/communities/<id>/join` | POST | Join a community |
| `/api/channels/communities/<id>/leave` | POST | Leave a community |

### Message Routes (`routes/messages.py`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/messages/channel/<id>` | GET | Get channel messages |
| `/api/messages/send` | POST | Send message to channel |
| `/api/messages/<id>` | PUT | Edit message |
| `/api/messages/<id>` | DELETE | Delete message |
| `/api/messages/direct/<user_id>` | GET | Get DM history |
| `/api/messages/direct/send` | POST | Send direct message |

### AI Agent Routes (`routes/agents.py`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agents/summarize/channel/<id>` | POST | Generate chat summary |
| `/api/agents/mood/analyze` | POST | Analyze message mood |
| `/api/agents/moderation/check` | POST | Check content for violations |
| `/api/agents/engagement/suggest` | GET | Get engagement suggestions |
| `/api/agents/wellness/check` | GET | Check user wellness |

---

## 6. AI Agents System

### Overview of All Agents

| Agent | Purpose | Technology |
|-------|---------|------------|
| Mood Tracker | Detects emotions in messages | Lexicon + XLM-RoBERTa |
| Moderation | Flags toxic content | Keyword matching + patterns |
| Summarizer | Condenses long chats | TF-IDF + Gemini AI |
| Engagement | Suggests activities | Rule-based templates |
| Wellness | Monitors user health | Activity analysis |
| Knowledge Builder | Extracts Q&A pairs | Pattern matching |
| Focus | Tracks conversation topics | Keyword extraction |

### 6.1 Mood Tracker Agent (Most Important!)

**File:** `agents/mood_tracker.py`

**What it does:**
- Analyzes messages to detect emotions (happy, sad, angry, etc.)
- Supports Roman Urdu (e.g., "bohat khush hun" = very happy)
- Uses multiple approaches for accuracy

**Three Analysis Methods:**

1. **Lexicon-Based (Primary)**
   - Dictionary of words with sentiment scores
   - Example: "khush" = +2, "udas" = -2
   ```python
   # Lexicon structure
   {
     "positive": {"khush": 2, "acha": 1, "happy": 2},
     "negative": {"udas": -2, "bura": -1, "sad": -2}
   }
   ```

2. **XLM-RoBERTa Model (Advanced)**
   - Transformer-based deep learning model
   - Pre-trained on Roman Urdu sentiment data
   ```python
   self.xlm_roberta_pipeline = pipeline(
       "text-classification",
       model="Khubaib01/roman-urdu-sentiment-xlm-r"
   )
   ```

3. **Translation Pipeline (Fallback)**
   - Translates Roman Urdu → English using Google Translate
   - Then analyzes English text with TextBlob

**Key Functions:**
```python
def analyze_message(self, text: str) -> Dict:
    """Main analysis function"""
    # 1. Normalize text (handle spelling variations)
    normalized = self._normalize_text(text)
    
    # 2. Check for emojis (😊 = positive, 😢 = negative)
    emoji_score = self._analyze_emojis(text)
    
    # 3. Analyze with lexicon
    lexicon_result = self._analyze_with_lexicon(normalized)
    
    # 4. If available, use XLM-RoBERTa for higher accuracy
    if self.xlm_roberta_available:
        model_result = self._analyze_with_xlm_roberta(text)
    
    # 5. Combine scores and return result
    return {
        'sentiment': 'positive/negative/neutral',
        'score': 0.75,
        'emotions': ['happy', 'excited']
    }
```

**Roman Urdu Normalization:**
Handles spelling variations common in Roman Urdu:
```python
NORMALIZATION_PATTERNS = {
    r'a{2,}': 'a',     # aaa → a
    r'h{2,}': 'h',     # hh → h
}
# "achaaa" becomes "acha"
```

### 6.2 Moderation Agent

**File:** `agents/moderation.py`

**What it does:**
- Detects profanity, hate speech, harassment, spam
- Supports multiple languages (English, Roman Urdu, Hinglish)
- Takes action: allow, warn, flag, or block

**Violation Types:**
1. **Profanity** - Swear words
2. **Hate Speech** - Discriminatory content
3. **Harassment** - Personal attacks
4. **Spam** - Repetitive/promotional content
5. **Threats** - Violence-related content
6. **Personal Info** - Phone numbers, emails (privacy)

**How it works:**
```python
def moderate_message(self, text: str, user_id: int, channel_id: int):
    text_lower = text.lower()
    
    # Check each violation type
    profanity_score = self._check_profanity(text_lower)
    hate_speech_score = self._check_hate_speech(text_lower)
    harassment_score = self._check_harassment(text_lower)
    
    # Determine action based on highest score
    max_score = max(profanity_score, hate_speech_score, harassment_score)
    
    if max_score >= 0.9:
        action = 'block'
        severity = 'critical'
    elif max_score >= 0.6:
        action = 'flag'
        severity = 'high'
    elif max_score >= 0.3:
        action = 'warn'
        severity = 'medium'
    else:
        action = 'allow'
        severity = 'none'
    
    return {'action': action, 'severity': severity, 'confidence': max_score}
```

**Repeat Offender Detection:**
```python
# Check if user has multiple violations in last 24 hours
user_violations = self._get_user_violation_count(user_id, hours=24)
if user_violations >= 3:
    action = 'block'  # Automatically block repeat offenders
```

### 6.3 Summarizer Agent

**File:** `agents/summarizer.py`

**What it does:**
- Creates concise summaries of long conversations
- Uses two methods: Extractive (TF-IDF) and Abstractive (Gemini AI)

**Two Summarization Methods:**

1. **Extractive (TF-IDF Based)**
   - Selects most important sentences from original text
   - Uses TF-IDF to score sentence importance
   ```python
   # TF-IDF = Term Frequency × Inverse Document Frequency
   # High score = important sentence
   ```

2. **Abstractive (Gemini AI)**
   - Generates new summary text using AI
   - More natural, human-like summaries
   ```python
   self.gemini_model = genai.GenerativeModel('gemini-1.5-pro')
   summary = self.gemini_model.generate_content(prompt)
   ```

**Summary Output:**
```json
{
  "success": true,
  "summary": "The team discussed the project deadline...",
  "key_points": [
    "Deadline moved to Friday",
    "Anas will handle database",
    "Meeting scheduled for 3 PM"
  ],
  "participants": ["anas", "rafay", "zehra"],
  "message_count": 150
}
```

### 6.4 Engagement Agent

**File:** `agents/engagement.py`

**What it does:**
- Detects inactive channels
- Suggests conversation starters, polls, ice-breakers
- Boosts community participation

**Features:**
- Conversation starters by category (tech, casual, motivational)
- Quick polls
- Ice-breaker games (Would You Rather, This or That)
- Activity suggestions

**Engagement Score Calculation:**
```python
def _calculate_engagement_score(self, channel_id, time_period_hours):
    # 4 components, each 0-100
    
    # 1. Frequency Score (30%): Messages per hour
    frequency_score = min(msg_per_hour / 10, 1.0) * 100
    
    # 2. Recency Score (30%): How recent was last message
    if silence_minutes < 60:
        recency_score = 100
    elif silence_minutes < 360:
        recency_score = 80
    # ...
    
    # 3. Participation Score (20%): Unique participants
    participation_score = min(participant_count / 5, 1.0) * 100
    
    # 4. Balance Score (20%): Even message distribution
    balance_score = (avg_per_user / max_messages) * 100
    
    # Weighted combination
    engagement_rate = (
        frequency_score * 0.30 +
        recency_score * 0.30 +
        participation_score * 0.20 +
        balance_score * 0.20
    )
```

### 6.5 Wellness Agent

**File:** `agents/wellness.py`

**What it does:**
- Monitors user activity patterns
- Detects signs of stress or fatigue
- Suggests breaks and healthy habits

**Checks performed:**
1. **Excessive Activity**: Too many messages per hour
2. **Continuous Activity**: No breaks for 3+ hours
3. **Late Night Activity**: Active between 11 PM - 5 AM
4. **Stress Indicators**: Negative language patterns

### 6.6 Knowledge Builder Agent

**File:** `agents/knowledge_builder.py`

**What it does:**
- Extracts useful information from conversations
- Creates FAQ-style knowledge entries
- Identifies Q&A pairs, decisions, and shared resources

**Extracts:**
1. **Topics**: Main discussion subjects
2. **Q&A Pairs**: Questions and their answers
3. **Decisions**: Conclusions reached by team
4. **Resources**: Links and references shared

---

## 7. Real-Time Communication (Socket.IO)

### What is Socket.IO?
- Enables **real-time, bidirectional** communication
- Unlike HTTP (request → response), sockets stay connected
- Used for: instant messaging, typing indicators, online status

### Key Events

**Server-Side (`routes/sockets.py`):**
```python
@socketio.on('join_channel')
def handle_join(data):
    """User joins a channel room"""
    channel_id = data['channel_id']
    join_room(f'channel_{channel_id}')
    emit('user_joined', {'user': username}, room=f'channel_{channel_id}')

@socketio.on('send_message')
def handle_message(data):
    """New message sent"""
    # Save to database
    # Broadcast to all users in channel
    emit('new_message', message_data, room=f'channel_{channel_id}')
    
@socketio.on('typing')
def handle_typing(data):
    """User is typing"""
    emit('user_typing', {'user': username}, room=f'channel_{channel_id}')
```

**Client-Side (React):**
```javascript
// Connect
const socket = io('http://localhost:5000');

// Listen for new messages
socket.on('new_message', (message) => {
    setMessages([...messages, message]);
});

// Send message
socket.emit('send_message', { channel_id: 1, content: 'Hello!' });
```

### Room Concept
- Each channel has a "room" identified by `channel_{id}`
- Messages are broadcast only to users in that room
- `join_room()` and `leave_room()` manage membership

---

## 8. Admin Dashboard APIs

### Community Admin Routes (`routes/community_admin.py`)

**Security Decorator:**
```python
@require_community_owner
def get_community_overview(community_id):
    """Only community owners/admins can access"""
    # Check if user has 'owner' or 'admin' role
    cur.execute("""
        SELECT role FROM community_members 
        WHERE user_id = %s AND community_id = %s 
        AND role IN ('owner', 'admin')
    """, (user_id, community_id))
```

**Key Endpoints:**

| Endpoint | Purpose |
|----------|---------|
| `/api/admin/owned-communities` | List communities user owns/admins |
| `/api/admin/community/<id>/overview` | Dashboard stats (users, messages, violations) |
| `/api/admin/community/<id>/members` | Member list with stats |
| `/api/admin/community/<id>/moderation/flagged` | Flagged messages |
| `/api/admin/community/<id>/moderation/blocked` | Blocked users |
| `/api/admin/community/<id>/analytics/engagement` | Engagement graphs |
| `/api/admin/community/<id>/analytics/mood` | Mood trends |
| `/api/admin/community/<id>/analytics/health` | Community health score |

### Overview Stats Calculation:
```python
# Total members
cur.execute("SELECT COUNT(*) FROM community_members WHERE community_id = %s")

# Online users
cur.execute("""
    SELECT COUNT(DISTINCT u.id) FROM users u
    JOIN community_members cm ON u.id = cm.user_id
    WHERE cm.community_id = %s AND u.status = 'online'
""")

# Messages today
cur.execute("""
    SELECT COUNT(*) FROM messages 
    WHERE channel_id IN (SELECT id FROM channels WHERE community_id = %s)
    AND created_at >= %s
""", (community_id, today_start))
```

---

## 9. Security Implementation

### 1. Password Security
- **bcrypt hashing**: Passwords are never stored in plain text
- **Salt**: Random data added before hashing (prevents rainbow table attacks)

### 2. JWT Token Security
- **Expiration**: Tokens expire after set time (prevents stolen token abuse)
- **Secret Key**: Only server knows the key to sign/verify tokens

### 3. SQL Injection Prevention
```python
# BAD (vulnerable):
cur.execute(f"SELECT * FROM users WHERE username = '{username}'")

# GOOD (parameterized):
cur.execute("SELECT * FROM users WHERE username = %s", (username,))
```

### 4. Role-Based Access Control (RBAC)
- **owner**: Full control over community
- **admin**: Manage members, channels (can't delete community)
- **member**: Basic access (read/write messages)

### 5. Rate Limiting
- Prevents brute-force attacks
- Limits API calls per user/IP

### 6. CORS Configuration
```python
CORS(app, origins=["http://localhost:5173"])  # Only allow frontend origin
```

---

## 10. Common VIVA Questions & Answers

### Q1: What is the role of Flask in your project?
**Answer:** Flask is our Python web framework that handles:
- REST API endpoints for frontend communication
- JWT authentication management
- Integration with Socket.IO for real-time features
- Routing HTTP requests to appropriate handlers
- It's lightweight and perfect for our microservice-style architecture.

### Q2: Why did you choose MySQL over MongoDB?
**Answer:** We chose MySQL because:
- Our data is highly relational (users → communities → channels → messages)
- ACID compliance ensures data consistency
- Strong support for JOINs needed for analytics queries
- Better for structured data like user accounts and permissions
- MongoDB would be better for unstructured data like document storage

### Q3: How does the Mood Tracker work with Roman Urdu?
**Answer:** It uses a three-layer approach:
1. **Lexicon-based**: Dictionary of 1000+ Roman Urdu words with sentiment scores
2. **XLM-RoBERTa**: A transformer model pre-trained on Roman Urdu data
3. **Translation fallback**: Translates to English, then analyzes with TextBlob

Key challenge was handling spelling variations (acha, achaa, achaaa) using normalization patterns.

### Q4: How do you ensure real-time messaging?
**Answer:** We use Socket.IO which:
- Maintains persistent WebSocket connections
- Groups users into "rooms" per channel
- Broadcasts messages instantly to all room members
- Handles reconnection automatically
- Falls back to HTTP polling if WebSocket fails

### Q5: Explain your authentication flow.
**Answer:**
1. User sends username/password to `/api/login`
2. Backend verifies password using bcrypt
3. If valid, generates JWT token with user identity
4. Token sent to frontend, stored in localStorage
5. Every API request includes token in `Authorization: Bearer <token>` header
6. `@jwt_required()` decorator validates token on protected routes

### Q6: How does content moderation work?
**Answer:**
1. Every message passes through ModerationAgent
2. Checks against multi-language keyword lexicons
3. Calculates scores for: profanity, hate speech, harassment, spam, threats
4. Takes action based on highest score:
   - Allow (< 0.3)
   - Warn (0.3-0.6)
   - Flag (0.6-0.9)
   - Block (> 0.9)
5. Tracks repeat offenders across 24-hour window
6. Logs all actions for admin review

### Q7: What is the purpose of ai_agent_logs table?
**Answer:** It stores all AI agent activities for:
- **Auditing**: See what decisions agents made and why
- **Analytics**: Track agent usage patterns
- **Debugging**: Identify issues in agent logic
- **Dashboard**: Show moderation stats, mood trends to admins
- **Transparency**: Users can understand why content was flagged

### Q8: How do you calculate community health score?
**Answer:** Health score combines three metrics:
1. **Engagement Rate (50%)**: Based on message frequency, recency, participation, and balance
2. **Retention Rate (30%)**: Percentage of previously active users who returned
3. **Growth Rate (20%)**: Change in activity compared to previous period

Formula: `Health = (Engagement × 0.5) + (Retention × 0.3) + (Growth × 0.2)`

### Q9: What security measures did you implement?
**Answer:**
1. Password hashing with bcrypt (salted)
2. JWT tokens with expiration
3. Parameterized SQL queries (prevent injection)
4. Role-based access control (owner/admin/member)
5. CORS restrictions (only allow known origins)
6. Input validation on all endpoints
7. Sensitive data never logged

### Q10: Explain the difference between extractive and abstractive summarization.
**Answer:**
- **Extractive**: Picks existing sentences from conversation based on importance (TF-IDF scoring). Fast, but may miss context.
- **Abstractive**: Generates new sentences using AI (Gemini). More natural, but requires API and is slower.

We use extractive as primary (works offline) and abstractive to enhance when Gemini is available.

### Q11: How do decorators work in your code?
**Answer:** Decorators wrap functions to add behavior. Example:
```python
@jwt_required()           # Checks for valid token
@require_community_owner  # Checks user is owner/admin
def get_overview(community_id):
    # Function only runs if both checks pass
```
They're executed top-to-bottom, and can stop execution if checks fail.

### Q12: What happens when a user sends a message?
**Answer:**
1. Frontend emits `send_message` socket event
2. Backend receives in `sockets.py`
3. Message saved to `messages` table
4. ModerationAgent checks content
5. MoodTrackerAgent analyzes sentiment
6. Results logged to `ai_agent_logs`
7. Message broadcast to all users in channel room
8. If flagged, admin notified

### Q13: Why did you use Blueprints in Flask?
**Answer:** Blueprints help organize code by:
- Grouping related routes (all auth routes together)
- Enabling URL prefixes (`/api/agents/*`)
- Making code modular and maintainable
- Allowing different files for different features
- Easy to register/unregister entire route groups

### Q14: How do you handle database connections?
**Answer:**
- `get_db_connection()` creates new connection
- `DictCursor` returns rows as dictionaries
- Connection closed in `finally` block (always runs)
- Transaction committed with `conn.commit()`
- Rollback on error with `conn.rollback()`

```python
conn = None
try:
    conn = get_db_connection()
    with conn.cursor() as cur:
        cur.execute(...)
    conn.commit()
except Exception as e:
    if conn: conn.rollback()
finally:
    if conn: conn.close()
```

---

## Quick Reference Card

### Start Backend Server
```bash
cd Backend
python app.py
```

### Test API Endpoints
```bash
# Login
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"anas","password":"test123"}'

# Get communities (with token)
curl http://localhost:5000/api/channels/communities \
  -H "Authorization: Bearer <your_token>"
```

### Key File Locations
| Feature | File |
|---------|------|
| Main app | `app.py` |
| Authentication | `routes/auth.py` |
| AI Agents | `agents/*.py` |
| Agent APIs | `routes/agents.py` |
| Admin APIs | `routes/community_admin.py` |
| Database schema | `schema.txt` |

---

## Good Luck with your VIVA! 🎓

**Remember:**
- Speak confidently about what you implemented
- It's okay to say "I don't know" if asked something beyond scope
- Relate answers to your specific role (Backend & Database Support)
- Show understanding of why decisions were made, not just what was done

---

*Document prepared for: Muhammad Anas (15127)*
*Project: AuraFlow - AI-Powered Communication Platform*
*Supervisor: Muhammad Zaid*
