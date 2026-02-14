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

# AI API Keys
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Security - JWT
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", os.urandom(32).hex() if not IS_PRODUCTION else None)
if IS_PRODUCTION and not JWT_SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY must be set in production environment")

# Session management
JWT_REFRESH_TOKEN_EXPIRES_DAYS = int(os.getenv("JWT_REFRESH_TOKEN_EXPIRES_DAYS", "7"))

# Rate limiting
RATE_LIMIT_DEFAULT = os.getenv("RATE_LIMIT_DEFAULT", "100 per minute")
RATE_LIMIT_AUTH = os.getenv("RATE_LIMIT_AUTH", "5 per minute")

# Log configuration status only in development
if not IS_PRODUCTION:
    print(f"[CONFIG] Environment: {FLASK_ENV}")
    print(f"[CONFIG] SMTP_EMAIL loaded: {bool(SMTP_EMAIL)}")
    print(f"[CONFIG] GEMINI_API_KEY loaded: {bool(GEMINI_API_KEY)}")