# AuraFlow — Performance, Efficiency & Security Audit

**Date:** March 12, 2026  
**Scope:** Full-stack analysis (Backend + Frontend + Database)  
**Stack:** Flask · MySQL · Socket.IO · Celery · Redis · React · TypeScript · Vite

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Critical Security Fixes (P0)](#2-critical-security-fixes-p0)
3. [High-Priority Security (P1)](#3-high-priority-security-p1)
4. [Encryption & Data Protection](#4-encryption--data-protection)
5. [Backend Performance](#5-backend-performance)
6. [Frontend Performance](#6-frontend-performance)
7. [Database Optimization](#7-database-optimization)
8. [Current Strengths](#8-current-strengths)

---

## 1. Executive Summary

| Category | Current Grade | After Fixes |
|----------|:---:|:---:|
| Password Security | **A** | A |
| JWT / Session Management | **D** | A |
| CORS & Headers | **F** | A |
| Token Storage (Frontend) | **F** | A |
| Database & Pooling | **A** | A+ |
| Redis Caching | **A** | A |
| Real-time (Socket.IO) | **C** | A |
| Frontend Performance | **C** | B+ |
| Encryption (at rest/transit) | **D** | A |

**Bottom line:** Session management and password hashing are excellent. The critical gaps are CORS misconfiguration, missing security headers, localStorage token storage, and no rate limiting on sockets.

---

## 2. Critical Security Fixes (P0)

### 2.1 CORS — Wildcard + Credentials (CSRF Vulnerability)

**File:** `Backend/app.py` lines 63-80

**Current (broken):**
```python
CORS(app,
     resources={r"/*": {"origins": "*"}},
     supports_credentials=True, ...)

# after_request handler echoes request origin → bypasses browser CORS spec
response.headers['Access-Control-Allow-Origin'] = origin
response.headers['Access-Control-Allow-Credentials'] = 'true'
```

Any website can make authenticated requests to your API. An attacker on `evil.com` can steal user data.

**Fix:**
```python
ALLOWED_ORIGINS = [
    "http://localhost:5173",           # dev
    "https://auraflow.vercel.app",     # production
]

CORS(app,
     resources={r"/api/*": {"origins": ALLOWED_ORIGINS}},
     supports_credentials=True,
     allow_headers=["Content-Type", "Authorization"],
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     max_age=3600)

# Remove the manual Access-Control-Allow-Origin in after_request entirely,
# or restrict it:
@app.after_request
def after_request(response):
    origin = request.headers.get('Origin', '')
    if origin in ALLOWED_ORIGINS:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
    return response
```

Also fix the Socket.IO CORS in `app.py`:
```python
# FROM:
socketio = SocketIO(app, cors_allowed_origins="*")

# TO:
socketio = SocketIO(app, cors_allowed_origins=ALLOWED_ORIGINS)
```

---

### 2.2 Hardcoded JWT Secret Key

**File:** `Backend/app.py` line 91

**Current:**
```python
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "super-secret-key")
```

If `JWT_SECRET_KEY` env var is missing in production, anyone can forge tokens.

**Fix:**
```python
jwt_secret = os.getenv("JWT_SECRET_KEY")
if not jwt_secret:
    if os.getenv("FLASK_ENV") == "production" or os.getenv("RENDER"):
        raise RuntimeError("JWT_SECRET_KEY must be set in production!")
    jwt_secret = os.urandom(32).hex()  # random per dev restart
app.config["JWT_SECRET_KEY"] = jwt_secret
app.config["JWT_ALGORITHM"] = "HS256"       # make algorithm explicit
```

---

### 2.3 Missing Security Headers

**File:** `Backend/app.py` — no security headers sent on any response.

**Fix — add middleware:**
```python
@app.after_request
def set_security_headers(response):
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
    return response
```

---

### 2.4 No Rate Limiting on Socket Events (DoS Risk)

**File:** `Backend/routes/sockets.py`

Events like `new_message`, `send_offer`, `send_answer`, `voice_state_changed` have zero rate limits. A single user can flood the server.

**Fix:**
```python
from time import time
from collections import defaultdict

socket_rate_limits = defaultdict(list)  # {user_id: [timestamps]}

def check_socket_rate(user_id, event, limit=10, window=60):
    """Returns True if within limit, False if exceeded."""
    key = f"{user_id}:{event}"
    now = time()
    timestamps = socket_rate_limits[key]
    # Purge old entries
    socket_rate_limits[key] = [t for t in timestamps if now - t < window]
    if len(socket_rate_limits[key]) >= limit:
        return False
    socket_rate_limits[key].append(now)
    return True

# Usage in sockets.py:
@socketio.on('new_message')
def on_new_message(data):
    if not check_socket_rate(current_user_id, 'message', limit=15, window=60):
        emit('error', {'message': 'Rate limit exceeded'})
        return
    # ... existing logic
```

---

### 2.5 No Message Length Validation

**File:** `Backend/routes/messages.py` line ~598

No limit on message content — a single request can send megabytes of text, causing DB bloat and memory issues.

**Fix:**
```python
MAX_MESSAGE_LENGTH = 5000

content = data.get('content', '').strip()
if len(content) > MAX_MESSAGE_LENGTH:
    return jsonify({'error': f'Message too long (max {MAX_MESSAGE_LENGTH} chars)'}), 413
if not content and not attachments:
    return jsonify({'error': 'Message cannot be empty'}), 400
```

---

### 2.6 Owner Immunity from Moderation

**File:** `Backend/routes/messages.py` line ~666

Community owners bypass all content moderation. This means owners can post hate speech, spam, etc. unchecked.

**Fix:** Remove the owner bypass. Apply moderation to all users equally (log but don't restrict if you want owner leniency):

```python
# Apply moderation to ALL users, but adjust action:
result = moderation_agent.moderate(content, channel_id, user_id)
if result['flagged']:
    if user_id == community_owner_id:
        # Log but don't block for owners
        log_moderation(result, action='logged_owner')
    else:
        # Block/warn for regular users
        return jsonify({'error': 'Message flagged', 'reason': result['reason']}), 403
```

---

## 3. High-Priority Security (P1)

### 3.1 Move Tokens from localStorage to httpOnly Cookies

**Files:** `Frontend/src/services/appService.ts`, `Frontend/src/services/socketService.ts`

**Current:** Tokens stored in `localStorage` — any XSS vulnerability exposes them.

**Impact:** If any script injection succeeds, attacker gets 7-day refresh tokens.

**Fix (Backend):**
```python
from flask import make_response

@app.route('/api/login', methods=['POST'])
def login():
    # ... authenticate user ...
    response = make_response(jsonify({'user': user_data}))
    response.set_cookie('access_token', access_token,
        httponly=True, secure=True, samesite='Strict', max_age=900)
    response.set_cookie('refresh_token', refresh_token,
        httponly=True, secure=True, samesite='Strict', max_age=259200)  # 3 days
    return response
```

**Fix (Frontend):**
```typescript
// Remove all localStorage.getItem('token') calls
// Configure fetch to include credentials:
const response = await fetch(url, {
    credentials: 'include',  // sends httpOnly cookies automatically
    headers: { 'Content-Type': 'application/json' },
});
```

> **Note:** This is a significant refactor. If you can't do it immediately, at minimum reduce refresh token expiry from 7 days to 1 day.

---

### 3.2 Socket.IO Token in Query String

**File:** `Frontend/src/services/socketService.ts` line ~125

**Current:** `query: { token: "Bearer ..." }` — token visible in browser DevTools, server logs, referrer headers.

**Fix:** Use Socket.IO's `auth` option instead:
```typescript
this.socket = io(serverUrl, {
    auth: {
        token: `Bearer ${token}`,   // sent in handshake payload, not URL
    },
    transports: ['websocket'],
});
```

Backend side — parse from `auth` instead of `args`:
```python
@socketio.on('connect')
def handle_connect(auth):
    token = auth.get('token', '') if auth else ''
    # ... validate token
```

---

### 3.3 OTP Brute-Force Protection

**File:** `Backend/routes/auth.py` line ~217

No maximum OTP attempt limit. Attacker can try all 1M combinations of 6-digit OTP.

**Fix:**
```python
MAX_OTP_ATTEMPTS = 5

@app.route('/api/verify-otp', methods=['POST'])
def verify_otp():
    email = request.json.get('email')
    
    # Check attempt count (use Redis or DB)
    attempts_key = f"otp_attempts:{email}"
    attempts = redis.get(attempts_key) or 0
    if int(attempts) >= MAX_OTP_ATTEMPTS:
        return jsonify({'error': 'Too many attempts. Request a new OTP.'}), 429
    
    redis.incr(attempts_key)
    redis.expire(attempts_key, 300)  # 5-min window
    
    # ... verify OTP ...
```

---

### 3.4 Voice State — No Ownership Check

**File:** `Backend/routes/sockets.py` lines ~1817-1819

Any user can unmute/undeafen other users by sending a `voice_state_changed` event.

**Fix:**
```python
@socketio.on('voice_state_changed')
def handle_voice_state(data):
    requesting_user = get_current_user()
    target_user_id = data.get('user_id')
    
    # Only allow changing your own state
    if target_user_id != requesting_user['id']:
        emit('error', {'message': 'Cannot modify other users'})
        return
    # ... proceed
```

---

## 4. Encryption & Data Protection

### 4.1 Current State

| Data | Encrypted at Rest? | Encrypted in Transit? |
|------|:---:|:---:|
| Passwords | Yes (bcrypt, 12 rounds) | Yes (HTTPS) |
| JWT Tokens | N/A (signed, not encrypted) | Only if HTTPS enforced |
| Direct Messages | **No** | Only if HTTPS enforced |
| File Uploads | **No** | Only if HTTPS enforced |
| Database Connection | Optional (DB_SSL flag) | Depends on config |
| Redis Connection | **No TLS by default** | Depends on provider |

### 4.2 Encrypt Sensitive Database Fields

Direct messages and any PII should be encrypted at the application level before storing in MySQL.

**Install:** `pip install cryptography`

**Create encryption utility:**
```python
# Backend/utils/encryption.py
import os
from cryptography.fernet import Fernet
from base64 import urlsafe_b64encode
from hashlib import sha256

def get_cipher():
    key = os.getenv('ENCRYPTION_KEY')
    if not key:
        raise RuntimeError("ENCRYPTION_KEY env var required")
    # Derive a Fernet-compatible key from the secret
    derived = urlsafe_b64encode(sha256(key.encode()).digest())
    return Fernet(derived)

def encrypt_text(plaintext: str) -> str:
    """Encrypt a string, return base64-encoded ciphertext."""
    if not plaintext:
        return plaintext
    cipher = get_cipher()
    return cipher.encrypt(plaintext.encode('utf-8')).decode('utf-8')

def decrypt_text(ciphertext: str) -> str:
    """Decrypt a base64-encoded ciphertext, return plaintext."""
    if not ciphertext:
        return ciphertext
    cipher = get_cipher()
    return cipher.decrypt(ciphertext.encode('utf-8')).decode('utf-8')
```

**Usage — encrypt DM content before storing:**
```python
from utils.encryption import encrypt_text, decrypt_text

# When saving a DM:
encrypted_content = encrypt_text(content)
cursor.execute(
    "INSERT INTO direct_messages (sender_id, receiver_id, content) VALUES (%s, %s, %s)",
    (sender_id, receiver_id, encrypted_content)
)

# When reading DMs:
cursor.execute("SELECT content FROM direct_messages WHERE id = %s", (dm_id,))
row = cursor.fetchone()
plaintext = decrypt_text(row['content'])
```

**Environment variable to add:**
```bash
# Generate once:  python -c "import secrets; print(secrets.token_urlsafe(32))"
ENCRYPTION_KEY=your-32-byte-secret-key-here
```

### 4.3 Enforce HTTPS Everywhere

**Backend — enforce HTTPS in production (`app.py`):**
```python
@app.before_request
def enforce_https():
    if os.getenv('RENDER') and not request.is_secure:
        url = request.url.replace('http://', 'https://', 1)
        return redirect(url, code=301)
```

**Frontend — fix fallback URL (`src/config/api.ts`):**
```typescript
// FROM:
export const API_SERVER = isDev
  ? '' : (import.meta.env.VITE_BACKEND_URL || `http://${window.location.hostname}:5000`);

// TO:
export const API_SERVER = isDev
  ? '' : (import.meta.env.VITE_BACKEND_URL || `https://${window.location.hostname}`);
```

### 4.4 Enforce TLS for Database & Redis

**Database (`Backend/database.py`):**
```python
# Always enable SSL in production
ssl_config = None
if os.getenv('DB_SSL') or os.getenv('RENDER'):
    ssl_config = {'ssl': {'ca': '/etc/ssl/certs/ca-certificates.crt'}}
```

**Redis (`Backend/services/redis_client.py`):**
```python
# Ensure production Redis uses TLS
redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
if os.getenv('RENDER') and redis_url.startswith('redis://'):
    redis_url = redis_url.replace('redis://', 'rediss://', 1)  # TLS
```

---

## 5. Backend Performance

### 5.1 N+1 Queries in Admin Dashboard

**File:** `Backend/routes/admin.py` lines ~105-186

Admin stats endpoint runs separate queries per community (channels, members, messages).

**Fix — single aggregated query:**
```sql
SELECT
    c.id,
    c.name,
    COUNT(DISTINCT cm.user_id) AS member_count,
    COUNT(DISTINCT ch.id) AS channel_count,
    (SELECT COUNT(*) FROM messages m
     JOIN channels ch2 ON m.channel_id = ch2.id
     WHERE ch2.community_id = c.id) AS message_count
FROM communities c
LEFT JOIN community_members cm ON c.id = cm.community_id
LEFT JOIN channels ch ON c.id = ch.community_id
GROUP BY c.id;
```

### 5.2 Moderation Lexicon Reload Per Request

**File:** `Backend/agents/moderation.py` line ~22

The moderation agent reads JSON lexicon files from disk on every message.

**Fix — load once at module level:**
```python
import json, os

_lexicons_dir = os.path.join(os.path.dirname(__file__), '..', 'lexicons')

def _load_json(filename):
    with open(os.path.join(_lexicons_dir, filename), 'r', encoding='utf-8') as f:
        return json.load(f)

# Load ONCE at startup:
PROFANITY_LIST = _load_json('moderation_keywords.json')
SENTIMENT_LEXICON = _load_json('roman_urdu_sentiments.json')
STOPWORDS = _load_json('stopwords.json')
```

### 5.3 Token Blocklist Cleanup

**File:** `Backend/services/session_manager.py` line ~234

In-memory token blocklist cache grows indefinitely — expired entries never removed.

**Fix — schedule cleanup:**
```python
import threading

def schedule_cleanup(interval_seconds=3600):
    def run():
        while True:
            cleanup_expired_tokens()
            time.sleep(interval_seconds)
    t = threading.Thread(target=run, daemon=True)
    t.start()

# Call on app startup:
schedule_cleanup()
```

### 5.4 ReDoS in Moderation Regex

**File:** `Backend/agents/moderation.py` line ~168

Pattern `(.)\\1{4,}` can hang on pathological input (50K+ repeated chars).

**Fix:**
```python
import re

def safe_regex_search(pattern, text, timeout_chars=10000):
    """Limit regex input length to prevent ReDoS."""
    truncated = text[:timeout_chars]
    return re.search(pattern, truncated)
```

---

## 6. Frontend Performance

### 6.1 Add Code Splitting / Lazy Loading

**File:** `Frontend/src/App.tsx`

All pages are eagerly imported — the entire app loads upfront.

**Fix:**
```tsx
import { lazy, Suspense } from 'react';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const AgentDetails = lazy(() => import('@/pages/AgentDetails'));
const DiscoverCommunities = lazy(() => import('@/pages/DiscoverCommunities'));
const Settings = lazy(() => import('@/pages/Settings'));
const AdminLayout = lazy(() => import('@/pages/admin'));

function App() {
    return (
        <Suspense fallback={<div className="flex h-screen items-center justify-center">Loading...</div>}>
            <Routes>
                <Route path="/community/:id" element={<Dashboard />} />
                <Route path="/agents/:type" element={<AgentDetails />} />
                {/* ... */}
            </Routes>
        </Suspense>
    );
}
```

**Impact:** Reduces initial bundle by ~40-60%.

### 6.2 Memoize Context Values

**File:** `Frontend/src/contexts/RealtimeContext.tsx`

Context value object recreated on every render, causing all consumers to re-render.

**Fix:**
```tsx
const contextValue = useMemo(() => ({
    isConnected,
    communities,
    currentCommunity,
    channels,
    // ... other values
}), [isConnected, communities, currentCommunity, channels /* ... */]);

return (
    <RealtimeContext.Provider value={contextValue}>
        {children}
    </RealtimeContext.Provider>
);
```

Apply the same pattern to `AIAgentContext`, `FriendsContext`, `CallContext`.

### 6.3 Fix Memory Leaks in DirectMessagesContext

**File:** `Frontend/src/contexts/DirectMessagesContext.tsx`

`setTimeout` callbacks for deduplication IDs run even after component unmounts.

**Fix:** Clear all timeouts in the cleanup function of `useEffect`.

### 6.4 Replace Voice Participant Polling with Socket Events

**File:** `Frontend/src/components/sidebar/ChannelSidebar.tsx` lines ~154-180

Currently polls `GET /api/voice/participants` every 10 seconds.

**Fix:** Use existing socket events to push participant updates instead of polling. Emit `voice_participants_update` from the server whenever someone joins/leaves.

### 6.5 Add Error Boundaries

**File:** `Frontend/src/App.tsx`

No error boundary wrapping — a single component crash kills the entire app.

**Fix:**
```tsx
import { ErrorBoundary } from 'react-error-boundary';

function ErrorFallback({ error, resetErrorBoundary }) {
    return (
        <div className="flex flex-col items-center justify-center h-screen gap-4">
            <h1 className="text-2xl font-bold">Something went wrong</h1>
            <p className="text-gray-500">{error.message}</p>
            <button onClick={resetErrorBoundary} className="px-4 py-2 bg-purple-600 rounded text-white">
                Try Again
            </button>
        </div>
    );
}

export default function App() {
    return (
        <ErrorBoundary FallbackComponent={ErrorFallback}>
            <AppContent />
        </ErrorBoundary>
    );
}
```

### 6.6 Disable Source Maps in Production

**File:** `Frontend/vite.config.ts`

```typescript
export default defineConfig({
    build: {
        sourcemap: false,  // Don't expose source code in production
    },
    // ...
});
```

---

## 7. Database Optimization

### 7.1 Missing Indexes

Add these indexes for common query patterns:

```sql
-- Faster community channel listings
ALTER TABLE channel_members ADD INDEX idx_cm_user (user_id);

-- Faster unread counting
ALTER TABLE channel_read_status ADD INDEX idx_crs_channel_msg (channel_id, last_read_message_id);

-- Faster DM conversation lookups
ALTER TABLE direct_messages ADD INDEX idx_dm_unread (receiver_id, is_read, created_at DESC);
```

### 7.2 Connection Pool Max Usage

**File:** `Backend/database.py`

```python
# FROM:
maxusage=0   # unlimited reuse

# TO:
maxusage=100  # recycle connections after 100 uses (prevents stale connections)
```

### 7.3 Query Optimization for Message Loading

Use cursor-based pagination instead of OFFSET for message loading:

```sql
-- Instead of:
SELECT * FROM messages WHERE channel_id = ? ORDER BY created_at DESC LIMIT 50 OFFSET 200;

-- Use:
SELECT * FROM messages WHERE channel_id = ? AND id < ? ORDER BY id DESC LIMIT 50;
```

This eliminates the performance cliff as offset grows.

---

## 8. Current Strengths

These are already well-implemented and should be maintained:

| Feature | Implementation | Grade |
|---------|---------------|:---:|
| Password hashing | bcrypt, 12 rounds | **A** |
| Token rotation | Family-based with reuse detection | **A+** |
| Session management | Multi-device, individual revocation | **A** |
| Connection pooling | DBUtils, 20 connections, proper timeouts | **A** |
| Redis caching | Graceful degradation, proper TTLs | **A** |
| Email OTP | bcrypt-hashed OTP, 5-min expiry | **A** |
| Input validation (auth) | Password strength validation on signup | **A** |
| Bulk reactions API | Prevents N+1 on page loads | **A** |
| Flask-Compress | Gzip responses enabled | **A** |

---

## Implementation Priority

| Priority | Item | Effort | Impact |
|:---:|------|:---:|:---:|
| **P0** | Fix CORS (wildcard + credentials) | Small | Critical |
| **P0** | Remove hardcoded JWT secret | Small | Critical |
| **P0** | Add security headers middleware | Small | High |
| **P0** | Add message length validation | Small | High |
| **P0** | Add socket rate limiting | Medium | High |
| **P1** | Encrypt DM content (Fernet) | Medium | High |
| **P1** | Enforce HTTPS everywhere | Small | High |
| **P1** | Socket.IO `auth` instead of query | Small | Medium |
| **P1** | OTP brute-force protection | Small | Medium |
| **P1** | Voice state ownership check | Small | Medium |
| **P2** | Lazy loading (frontend) | Medium | Medium |
| **P2** | Memoize context values | Medium | Medium |
| **P2** | Move tokens to httpOnly cookies | Large | High |
| **P2** | Add error boundaries | Small | Medium |
| **P2** | DB missing indexes | Small | Medium |
| **P3** | Disable production source maps | Small | Low |
| **P3** | Replace voice polling with sockets | Medium | Low |
| **P3** | Cache moderation lexicons | Small | Low |

---

*Generated from analysis of ~15,000 lines across 30+ files in the AuraFlow codebase.*
