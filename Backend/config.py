import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Environment
FLASK_ENV = os.getenv('FLASK_ENV', 'development')
IS_PRODUCTION = FLASK_ENV == 'production'

# Database configuration variables
DB_HOST = os.getenv('DB_HOST')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')
DB_NAME = os.getenv('DB_NAME')
DB_PORT = int(os.getenv('DB_PORT', '3306'))

# Frontend URL for CORS (set in production)
FRONTEND_URL = os.getenv('FRONTEND_URL', '')

# SMTP configuration with defaults
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
SMTP_EMAIL = os.getenv("SMTP_EMAIL", "")
SMTP_APP_PASSWORD = os.getenv("SMTP_APP_PASSWORD", "")

# ── AI / LLM ────────────────────────────────────────────────────────────
# DeepSeek is the production provider for every agent. It is paid, so it
# has no free-tier daily wall to hit mid-demo, and deepseek-chat is cheap
# enough at the volumes the agent fleet runs at.
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
# deepseek-chat only. deepseek-reasoner emits a reasoning trace that blows
# both the socket-path latency budget and the token bill.
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

# Per-call ceilings shared by every agent (see utils/ai/llm_client.py).
LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "700"))
LLM_TIMEOUT_SECONDS = float(os.getenv("LLM_TIMEOUT_SECONDS", "20"))
LLM_HUMANIZE = (os.getenv("LLM_HUMANIZE", "true").strip().lower()
                in ("1", "true", "yes", "on"))

# Redis Configuration
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')

# Security - JWT
# In production, a real key must be set. Validation is enforced in wsgi.py
# so Celery workers (which don't use JWT) can import config freely.
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY") or os.urandom(32).hex()

# Session management
JWT_REFRESH_TOKEN_EXPIRES_DAYS = int(os.getenv("JWT_REFRESH_TOKEN_EXPIRES_DAYS", "7"))

# Rate limiting
RATE_LIMIT_DEFAULT = os.getenv("RATE_LIMIT_DEFAULT", "100 per minute")
RATE_LIMIT_AUTH = os.getenv("RATE_LIMIT_AUTH", "5 per minute")

# Web Push (VAPID) — generate once with: python -c "from pywebpush import webpush; from py_vapid import Vapid; v=Vapid(); v.generate_keys(); print(v.private_pem()); print(v.public_key)"
# Or set env vars VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_CLAIMS_EMAIL
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY", "")
VAPID_CLAIMS_EMAIL = os.getenv("VAPID_CLAIMS_EMAIL", SMTP_EMAIL or "mailto:admin@Auraflow.app")

# Log configuration status only in development
if not IS_PRODUCTION:
    print(f"[CONFIG] Environment: {FLASK_ENV}")
    print(f"[CONFIG] SMTP_EMAIL loaded: {bool(SMTP_EMAIL)}")
    print(f"[CONFIG] DEEPSEEK_API_KEY loaded: {bool(DEEPSEEK_API_KEY)} "
          f"(model={DEEPSEEK_MODEL})")