# AuroFlow — Cloudflare Tunnel Deployment Guide

> **Goal:** Expose your locally-running AuroFlow backend publicly via Cloudflare Tunnel with a custom domain, free SSL, WebSocket support, and DDoS protection — without hosting on a cloud server.

---

## Table of Contents

1. [How It Works](#1-how-it-works)
2. [Prerequisites](#2-prerequisites)
3. [Security Hardening (Do This First)](#3-security-hardening-do-this-first)
4. [Install & Configure Cloudflare Tunnel](#4-install--configure-cloudflare-tunnel)
5. [Configure Cloudflare Dashboard](#5-configure-cloudflare-dashboard)
6. [Update Environment Variables](#6-update-environment-variables)
7. [Update Frontend Configuration](#7-update-frontend-configuration)
8. [Running Everything Locally](#8-running-everything-locally)
9. [Run Tunnel as a Windows Service](#9-run-tunnel-as-a-windows-service)
10. [Verify the Deployment](#10-verify-the-deployment)
11. [Architecture Overview](#11-architecture-overview)
12. [Troubleshooting](#12-troubleshooting)
13. [Limitations & Considerations](#13-limitations--considerations)

---

## 1. How It Works

```
Internet Users
      │
      ▼
Cloudflare Edge  (SSL/TLS terminated, DDoS protection, WAF)
      │  HTTPS
      ▼
cloudflared daemon  (running on your Windows PC)
      │  HTTP tunnel
      ▼
localhost:5000  (Flask + Flask-SocketIO)
      │
      ├── TiDB Cloud MySQL  (remote, already configured)
      └── Redis             (local, required for SocketIO + Celery)
```

- **Cloudflare manages SSL** — your PC serves plain HTTP internally, Cloudflare handles HTTPS externally.
- **No open inbound ports** — the tunnel is an outbound connection from your PC to Cloudflare. No firewall/router changes needed.
- **WebSockets pass through** — Cloudflare Tunnel supports the `Upgrade` header required by Socket.IO.

---

## 2. Prerequisites

| Requirement | Notes |
|-------------|-------|
| Cloudflare account | Free plan is sufficient |
| Domain added to Cloudflare | Any domain with Cloudflare as DNS |
| Windows PC with Redis running | WSL Redis or Windows Redis |
| Python venv activated | Backend dependencies installed |
| `cloudflared` installed | See Step 4 |

---

## 3. Security Hardening (Do This First)

These issues were found in the codebase and **must be fixed before going public**.

### 3.1 — Strengthen JWT Secret

The default `JWT_SECRET_KEY=AuraFlow123` is too weak for production. Generate a strong one:

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

Replace the value in `Backend/.env`:

```env
JWT_SECRET_KEY=<paste-generated-key-here>
```

### 3.2 — Lock Down CORS

The backend's CORS logic falls back to `"*"` if `FRONTEND_URL` is empty. Once you have your domain, set **both** of these in `Backend/.env`:

```env
FRONTEND_URL=https://your-frontend-domain.com
ALLOWED_ORIGINS=https://your-frontend-domain.com
```

If your frontend is also served locally (e.g., via Vite dev server), add both origins comma-separated:

```env
ALLOWED_ORIGINS=https://your-frontend-domain.com,http://localhost:5173
```

### 3.3 — Protect `.env` from Git

`Backend/.env` is already in `.gitignore` ✅

However `Frontend/.env.production` is **not** ignored and may be committed. Add it to `.gitignore`:

```
# In root .gitignore, under FRONTEND section
Frontend/.env.production
```

### 3.4 — Never Expose These in Public Repos

Ensure the following are only in `.env` files (never hardcoded):

- `JWT_SECRET_KEY`
- `DB_PASSWORD`
- `SMTP_APP_PASSWORD`
- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- `VAPID_PRIVATE_KEY`

### 3.5 — Rate Limiting

Your `config.py` already defines rate limits via env vars. Confirm they're set in `Backend/.env`:

```env
RATE_LIMIT_DEFAULT=100 per minute
RATE_LIMIT_AUTH=5 per minute
```

---

## 4. Install & Configure Cloudflare Tunnel

### 4.1 — Install cloudflared

```powershell
winget install Cloudflare.cloudflared
```

Verify installation:

```powershell
cloudflared --version
```

### 4.2 — Login to Cloudflare

```powershell
cloudflared tunnel login
```

A browser window opens. Select your domain and authorize. A certificate is saved to `C:\Users\<you>\.cloudflared\cert.pem`.

### 4.3 — Create a Named Tunnel

```powershell
cloudflared tunnel create auroflow-backend
```

Note the **tunnel ID** printed (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). A credentials JSON file is saved to `C:\Users\<you>\.cloudflared\<tunnel-id>.json`.

### 4.4 — Create the Config File

Create `C:\Users\<you>\.cloudflared\config.yml`:

```yaml
tunnel: auroflow-backend
credentials-file: C:\Users\<YOUR-USERNAME>\.cloudflared\<YOUR-TUNNEL-ID>.json

ingress:
  - hostname: api.yourdomain.com
    service: http://localhost:5000
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
      tcpKeepAlive: 30s
      keepAliveTimeout: 90s
      keepAliveConnections: 100
  - service: http_status:404
```

> Replace `api.yourdomain.com` with your actual subdomain. Replace `<YOUR-USERNAME>` and `<YOUR-TUNNEL-ID>` accordingly.

### 4.5 — Create DNS Record

```powershell
cloudflared tunnel route dns auroflow-backend api.yourdomain.com
```

This creates a `CNAME` record in Cloudflare DNS automatically. You can verify it in the Cloudflare Dashboard → DNS → Records.

---

## 5. Configure Cloudflare Dashboard

Go to [dash.cloudflare.com](https://dash.cloudflare.com) and make these changes for your domain.

### 5.1 — SSL/TLS Mode

**SSL/TLS → Overview** → Set encryption mode to **Full** (not Full Strict, since the tunnel uses HTTP internally).

### 5.2 — Enable WebSockets

**Network → WebSockets** → Toggle **ON**

This is required for Socket.IO to work through the tunnel.

### 5.3 — Recommended Security Settings

| Setting | Location | Recommended Value |
|---------|----------|-------------------|
| SSL Mode | SSL/TLS → Overview | Full |
| WebSockets | Network | On |
| Always Use HTTPS | SSL/TLS → Edge Certificates | On |
| Min TLS Version | SSL/TLS → Edge Certificates | TLS 1.2 |
| HSTS | SSL/TLS → Edge Certificates | Enable (max-age=31536000) |
| Bot Fight Mode | Security → Bots | On (free) |
| Browser Integrity Check | Security → Settings | On |

### 5.4 — Optional: WAF Rules

Under **Security → WAF**, you can add rules such as:
- Block requests without `User-Agent`
- Rate-limit `/api/login` and `/api/signup` endpoints

---

## 6. Update Environment Variables

Update `Backend/.env` with the following (add or modify):

```env
# === PRODUCTION SETTINGS ===
FLASK_ENV=production

# === CORS — set to your actual frontend URL ===
FRONTEND_URL=https://your-frontend-domain.com
ALLOWED_ORIGINS=https://your-frontend-domain.com

# === STRONG JWT SECRET ===
JWT_SECRET_KEY=<your-generated-64-char-hex-key>

# === REDIS (local) ===
REDIS_URL=redis://127.0.0.1:6379/0

# === Keep your existing DB, SMTP, API key settings ===
```

---

## 7. Update Frontend Configuration

### 7.1 — Update `Frontend/.env.production`

```env
VITE_BACKEND_URL=https://api.yourdomain.com
```

### 7.2 — Rebuild the Frontend

```powershell
cd F:\BSCS\FYP\AuroFlow\Frontend
npm run build
```

The built output in `Frontend/dist/` can be deployed to:
- **Vercel** (recommended, free) — just connect your GitHub repo
- **Cloudflare Pages** — drag and drop `dist/` folder
- **Netlify** — connect GitHub repo

> For local development, Vite's proxy (`vite.config.ts`) still routes `/api`, `/socket.io`, `/uploads` to `localhost:5000` — no changes needed for dev workflow.

---

## 8. Running Everything Locally

Open **4 separate PowerShell terminals** in the Backend directory:

### Terminal 1 — Redis

```powershell
# Via WSL:
wsl redis-server

# Or if Redis for Windows is installed:
redis-server
```

Verify Redis is running:

```powershell
redis-cli ping
# Should return: PONG
```

### Terminal 2 — Flask Backend

```powershell
cd F:\BSCS\FYP\AuroFlow\Backend
# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Run with gevent (production mode):
python wsgi.py

# Or for simpler local run:
python app.py
```

### Terminal 3 — Celery Worker

```powershell
cd F:\BSCS\FYP\AuroFlow\Backend
.\venv\Scripts\Activate.ps1
celery -A celery_app worker --loglevel=info --concurrency=2
```

### Terminal 4 — Cloudflare Tunnel

```powershell
cloudflared tunnel run auroflow-backend
```

You should see:
```
INF Starting tunnel tunnelID=<your-id>
INF Connection established connIndex=0 location=SIN
INF Connection established connIndex=1 location=SIN
```

Your backend is now live at `https://api.yourdomain.com` 🎉

---

## 9. Run Tunnel as a Windows Service

To have the tunnel start automatically when Windows boots (no manual terminal needed):

```powershell
# Install as service (run as Administrator)
cloudflared service install

# Start the service
Start-Service cloudflared

# Check status
Get-Service cloudflared

# Stop the service
Stop-Service cloudflared

# Uninstall service
cloudflared service uninstall
```

> The service reads `C:\Users\<you>\.cloudflared\config.yml` automatically.

---

## 10. Verify the Deployment

### 10.1 — Health Check

```powershell
curl https://api.yourdomain.com/api/me
# Expected: 401 Unauthorized (means backend is reachable)
```

### 10.2 — Check Headers

```powershell
curl -I https://api.yourdomain.com/api/me
```

Expected security headers:
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

### 10.3 — Test WebSocket (Socket.IO)

Open browser console on your frontend and check that Socket.IO connects:
```
socket connected: <socket-id>
```

### 10.4 — CORS Check

```powershell
curl -H "Origin: https://your-frontend-domain.com" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS https://api.yourdomain.com/api/me -v
```

Should return `Access-Control-Allow-Origin: https://your-frontend-domain.com`.

---

## 11. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        YOUR WINDOWS PC                               │
│                                                                       │
│  ┌──────────────┐   ┌──────────────┐   ┌───────────────────────┐   │
│  │  Flask App   │   │    Celery    │   │   cloudflared daemon  │   │
│  │  (port 5000) │   │   Worker(s)  │   │  (outbound to CF)     │   │
│  └──────┬───────┘   └──────┬───────┘   └───────────┬───────────┘   │
│         │                  │                         │               │
│         └──────────────────┤                         │               │
│                       ┌────▼────┐                    │               │
│                       │  Redis  │                    │               │
│                       │ :6379   │                    │               │
│                       └─────────┘                    │               │
└─────────────────────────────────────────────────────┼───────────────┘
                                                       │ outbound TLS
                                                       ▼
                                            ┌──────────────────┐
                                            │  Cloudflare Edge │
                                            │  (DDoS, WAF, SSL)│
                                            └────────┬─────────┘
                                                     │ HTTPS
                                                     ▼
                                            api.yourdomain.com
                                                     │
                                                     ▼
                                            ┌──────────────────┐
                                            │   Internet Users │
                                            └──────────────────┘

Remote services (always on):
  ┌─────────────────────────┐
  │  TiDB Cloud MySQL       │
  │  (ap-southeast-1)       │
  └─────────────────────────┘
```

---

## 12. Troubleshooting

### Tunnel won't connect
```powershell
# Check credentials file exists
dir C:\Users\<you>\.cloudflared\

# Re-login if needed
cloudflared tunnel login

# Run with verbose logging
cloudflared --loglevel debug tunnel run auroflow-backend
```

### 502 Bad Gateway
- Flask backend is not running on port 5000
- Check Terminal 2 for errors
- Ensure venv is activated and dependencies are installed

### WebSocket disconnects / Socket.IO not connecting
- Confirm **WebSockets is ON** in Cloudflare Dashboard → Network
- Set `pingTimeout` and `pingInterval` in SocketIO init (already set: 25s / 15s ✅)
- Cloudflare free plan has a **100-second timeout** on HTTP connections — Socket.IO ping keeps connections alive

### CORS errors in browser
- Verify `FRONTEND_URL` and `ALLOWED_ORIGINS` in `Backend/.env` exactly match the frontend origin (including `https://`)
- Rebuild and redeploy frontend after updating env vars
- Restart Flask after updating `.env`

### Celery tasks not running
- Verify Redis is running: `redis-cli ping`
- Check `REDIS_URL` in `.env` matches your Redis address
- Restart Celery worker after any code changes

### Rate limit hit (429 errors)
- Increase `RATE_LIMIT_AUTH` temporarily for testing
- Or whitelist your IP in Cloudflare WAF rules

---

## 13. Limitations & Considerations

| Limitation | Details |
|------------|---------|
| **PC must stay on** | If your machine shuts down, the backend goes offline |
| **Upload bandwidth** | Your internet upload speed is the bottleneck for all traffic |
| **Cloudflare free timeout** | 100-second idle timeout on HTTP; WebSocket pings handle this |
| **No horizontal scaling** | Single local machine — not suitable for high concurrent load |
| **Redis is single point of failure** | If Redis crashes, SocketIO and Celery stop working |
| **File uploads go through Cloudflare** | Large file uploads may be slow depending on upload speed |
| **Cloudflare free plan** | 100GB bandwidth/month free; sufficient for FYP/demo usage |

### Recommended for FYP / Demo Use ✅
This setup is well-suited for:
- Project demonstrations and presentations
- FYP viva and evaluation
- Sharing with small groups of users for testing
- Development with remote teammates

### When to Move to a VPS
Consider migrating to Railway / Render / Fly.io / VPS when:
- You need 24/7 uptime without keeping your PC on
- You have more than ~10 concurrent users
- You're going to production with real end users
