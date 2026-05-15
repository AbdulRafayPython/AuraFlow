"""Gunicorn configuration for production deployment on Render."""
import os

# Gevent monkey-patch — MUST happen before gunicorn loads the app
from gevent import monkey
monkey.patch_all()

# Server socket
bind = f"0.0.0.0:{os.environ.get('PORT', '10000')}"

# Worker
# With gevent, a single OS process can run thousands of greenlets — adding
# more workers does NOT add concurrency for an I/O-bound app and only
# multiplies the DB connection footprint (TiDB Serverless caps us at 25).
workers = 1
worker_class = "gevent"
worker_connections = 1000      # max concurrent greenlets per worker
timeout = 120                  # 2 min is plenty for normal requests
keepalive = 5

# Recycle workers periodically to release memory accumulated by heavy
# ML deps (transformers/torch/spacy) that get lazily imported.
max_requests = 1000
max_requests_jitter = 50

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"
