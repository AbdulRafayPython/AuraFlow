import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Database configuration variables
DB_HOST = os.getenv('DB_HOST')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')
DB_NAME = os.getenv('DB_NAME') 

# SMTP configuration with defaults
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
SMTP_EMAIL = os.getenv("SMTP_EMAIL", "")
SMTP_APP_PASSWORD = os.getenv("SMTP_APP_PASSWORD", "")

# Debug print (remove after fixing)
print(f"[CONFIG] SMTP_EMAIL loaded: {bool(SMTP_EMAIL)}")
print(f"[CONFIG] SMTP_APP_PASSWORD loaded: {bool(SMTP_APP_PASSWORD)}")