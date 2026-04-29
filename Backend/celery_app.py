"""
AuraFlow Celery Configuration
==============================
Task queue for AI agent auto-execution, periodic checks, and background jobs.

Usage:
    # Start worker (Windows — must use solo or eventlet pool):
    celery -A celery_app worker --loglevel=info --pool=solo

    # Start beat scheduler (periodic tasks):
    celery -A celery_app beat --loglevel=info

    # Both in one process (dev only):
    celery -A celery_app worker --beat --loglevel=info --pool=solo
"""

import os
import sys
from celery import Celery
from celery.schedules import crontab
from kombu import Exchange, Queue
from dotenv import load_dotenv

# Ensure Backend/ is on sys.path so 'services', 'tasks', etc. are importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

load_dotenv()

REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')

# ── Create Celery App ────────────────────────────────────────────────
celery_app = Celery(
    'auraflow',
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=['tasks.agent_tasks', 'tasks.email_tasks']
)

# ── Celery Configuration ─────────────────────────────────────────────
celery_app.conf.update(
    # Serialization
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',

    # Timezone
    timezone='UTC',
    enable_utc=True,

    # Task tracking
    task_track_started=True,
    task_acks_late=True,

    # Worker settings
    worker_prefetch_multiplier=1,       # Fair task distribution
    worker_concurrency=2,               # 2 concurrent tasks (student project)
    worker_max_tasks_per_child=200,     # Restart worker after 200 tasks (prevent memory leaks)

    # Time limits
    task_soft_time_limit=120,           # 2 min soft limit
    task_time_limit=180,                # 3 min hard limit

    # Result expiry
    result_expires=3600,                # Results expire after 1 hour

    # Retry policy
    task_default_retry_delay=30,        # 30s between retries
    task_max_retries=3,

    # Rate limiting (global)
    task_default_rate_limit='30/m',     # Max 30 tasks per minute globally

    # Broker settings
    broker_connection_retry_on_startup=True,
    broker_connection_retry=False,          # Don't retry on .delay() — fail fast
    broker_connection_timeout=4,            # 4s timeout for broker connect
    broker_transport_options={
        'visibility_timeout': 300,      # 5 min visibility timeout
    },
)

# ── Queue Definitions ────────────────────────────────────────────────
# Explicitly declare all queues so the worker always knows what to consume.
# Without this, omitting -Q on the CLI falls back to the bare 'celery' queue
# which nothing routes to — causing all tasks to pile up silently.
_default_exchange = Exchange('default', type='direct')
celery_app.conf.task_queues = (
    Queue('default',       _default_exchange, routing_key='default'),
    Queue('high_priority', Exchange('high_priority', type='direct'), routing_key='high_priority'),
    Queue('periodic',      Exchange('periodic',      type='direct'), routing_key='periodic'),
)
celery_app.conf.task_default_queue    = 'default'
celery_app.conf.task_default_exchange = 'default'
celery_app.conf.task_default_routing_key = 'default'

# ── Periodic Tasks (Celery Beat) ─────────────────────────────────────
celery_app.conf.beat_schedule = {
    'check-community-engagement': {
        'task': 'tasks.agent_tasks.check_engagement_periodic',
        'schedule': crontab(minute='*/30'),       # Every 30 minutes
        'options': {'queue': 'periodic'},
    },
    'check-user-wellness': {
        'task': 'tasks.agent_tasks.check_wellness_periodic',
        'schedule': crontab(minute=0),            # Every hour (at :00)
        'options': {'queue': 'periodic'},
    },
    'extract-knowledge-periodic': {
        'task': 'tasks.agent_tasks.extract_knowledge_periodic',
        'schedule': crontab(minute=0, hour='*/2'), # Every 2 hours
        'options': {'queue': 'periodic'},
    },
    'cleanup-old-agent-logs': {
        'task': 'tasks.agent_tasks.cleanup_old_logs',
        'schedule': crontab(hour=3, minute=0),     # Daily at 3 AM
        'options': {'queue': 'periodic'},
    },
    'auto-summarize-communities': {
        'task': 'tasks.agent_tasks.auto_summarize_communities',
        'schedule': crontab(minute='*/30'),        # Every 30 minutes (checks schedule_time match)
        'options': {'queue': 'periodic'},
    },
    'check-user-summary-schedules': {
        'task': 'tasks.agent_tasks.check_user_summary_schedules',
        'schedule': crontab(minute='*'),             # Every minute — checks for due user schedules
        'options': {'queue': 'periodic'},
    },
    'flush-moderation-buffers': {
        'task': 'tasks.agent_tasks.flush_moderation_buffers',
        'schedule': 30.0,                             # Every 30 seconds — flush stale mod buffers
        'options': {'queue': 'high_priority'},
    },
}

# ── Task Routing ──────────────────────────────────────────────────────
celery_app.conf.task_routes = {
    'tasks.agent_tasks.batch_moderation_task': {'queue': 'high_priority'},
    'tasks.agent_tasks.flush_moderation_buffers': {'queue': 'high_priority'},
    'tasks.agent_tasks.retroactive_scan_task': {'queue': 'high_priority'},  # NEW — v2
    'tasks.agent_tasks.gemini_review_task': {'queue': 'high_priority'},
    'tasks.agent_tasks.track_mood_task': {'queue': 'default'},
    'tasks.agent_tasks.summarize_channel_task': {'queue': 'default'},
    'tasks.agent_tasks.analyze_focus_task': {'queue': 'default'},
    'tasks.agent_tasks.check_engagement_periodic': {'queue': 'periodic'},
    'tasks.agent_tasks.check_wellness_periodic': {'queue': 'periodic'},
    'tasks.agent_tasks.extract_knowledge_periodic': {'queue': 'periodic'},
    'tasks.agent_tasks.cleanup_old_logs': {'queue': 'periodic'},
    'tasks.agent_tasks.auto_summarize_communities': {'queue': 'periodic'},
    'tasks.agent_tasks.check_user_summary_schedules': {'queue': 'periodic'},
}
