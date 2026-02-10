"""
Logging Utility for AuraFlow Backend
Provides consistent logging across all modules with environment-aware output.
Security: Debug logs only in development, production logs are sanitized.
"""

import os
import logging
import sys
from functools import wraps
from datetime import datetime

# Environment detection
IS_PRODUCTION = os.getenv('FLASK_ENV', 'development') == 'production'
LOG_LEVEL = os.getenv('LOG_LEVEL', 'DEBUG' if not IS_PRODUCTION else 'INFO')

# Configure root logger
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    stream=sys.stdout
)

# Create module loggers
def get_logger(name: str) -> logging.Logger:
    """Get a logger for a specific module."""
    logger = logging.getLogger(f'auraflow.{name}')
    return logger


# Pre-configured loggers for common modules
auth_logger = get_logger('auth')
messages_logger = get_logger('messages')
moderation_logger = get_logger('moderation')
admin_logger = get_logger('admin')
agents_logger = get_logger('agents')
socket_logger = get_logger('socket')


def log_function_call(logger: logging.Logger):
    """Decorator to log function calls with timing."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = datetime.now()
            logger.debug(f"Calling {func.__name__}")
            try:
                result = func(*args, **kwargs)
                elapsed = (datetime.now() - start_time).total_seconds()
                logger.debug(f"{func.__name__} completed in {elapsed:.3f}s")
                return result
            except Exception as e:
                elapsed = (datetime.now() - start_time).total_seconds()
                logger.error(f"{func.__name__} failed after {elapsed:.3f}s: {e}")
                raise
        return wrapper
    return decorator


def sanitize_log_data(data: dict, sensitive_keys: list = None) -> dict:
    """Remove or mask sensitive data from logs."""
    if sensitive_keys is None:
        sensitive_keys = ['password', 'token', 'secret', 'api_key', 'email', 'avatar_url']
    
    sanitized = {}
    for key, value in data.items():
        if any(sk in key.lower() for sk in sensitive_keys):
            sanitized[key] = '***REDACTED***'
        elif isinstance(value, dict):
            sanitized[key] = sanitize_log_data(value, sensitive_keys)
        else:
            sanitized[key] = value
    return sanitized


class ProductionFilter(logging.Filter):
    """Filter out debug logs in production."""
    def filter(self, record):
        if IS_PRODUCTION and record.levelno < logging.INFO:
            return False
        return True


# Apply production filter to all loggers
if IS_PRODUCTION:
    for handler in logging.root.handlers:
        handler.addFilter(ProductionFilter())


# Export convenience functions
def debug(msg, *args, **kwargs):
    """Log debug message (development only)."""
    if not IS_PRODUCTION:
        logging.debug(msg, *args, **kwargs)

def info(msg, *args, **kwargs):
    """Log info message."""
    logging.info(msg, *args, **kwargs)

def warning(msg, *args, **kwargs):
    """Log warning message."""
    logging.warning(msg, *args, **kwargs)

def error(msg, *args, **kwargs):
    """Log error message."""
    logging.error(msg, *args, **kwargs)

def critical(msg, *args, **kwargs):
    """Log critical message."""
    logging.critical(msg, *args, **kwargs)
