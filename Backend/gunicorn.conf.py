"""Gunicorn configuration for production deployment on Render."""
import os

# Gevent monkey-patch — MUST happen before gunicorn loads the app
from gevent import monkey
monkey.patch_all()

# Server socket
bind = f"0.0.0.0:{os.environ.get('PORT', '10000')}"

# Worker
workers = 1
worker_class = "gevent"
timeout = 300  # 5 min — enough for heavy model loading

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"
