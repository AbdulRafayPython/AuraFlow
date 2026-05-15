import os
import ssl as _ssl_module
import pymysql
from pymysql.cursors import DictCursor
from dbutils.pooled_db import PooledDB
from config import DB_HOST, DB_USER, DB_PASSWORD, DB_NAME

# ─── Cloud / Port / SSL support ─────────────────────────────────────
# TiDB Cloud Serverless uses port 4000; standard MySQL uses 3306
DB_PORT = int(os.getenv('DB_PORT', '4000' if (DB_HOST or '').endswith('tidbcloud.com') else '3306'))
DB_SSL = os.getenv('DB_SSL', 'true' if (DB_HOST or '').endswith('tidbcloud.com') else 'false').lower() == 'true'

# Build connection kwargs
# ping=1 ⇒ DBUtils pings the connection on checkout and reconnects on a
# stale socket (TiDB Cloud kills idle connections after a few hours).
# Tighter timeouts fail fast on flaky network instead of holding a worker.
_pool_kwargs = dict(
    creator=pymysql,
    maxconnections=25,       # TiDB Serverless free tier hard cap
    mincached=2,             # keep 2 idle connections warm
    maxcached=8,             # cap idle pool size
    blocking=True,           # block (don't error) when pool exhausted
    maxusage=500,            # recycle connection after 500 uses
    setsession=[],           # no per-session SQL
    ping=1,                  # ping on checkout — auto-reconnect on stale conn
    host=DB_HOST,
    user=DB_USER,
    password=DB_PASSWORD,
    database=DB_NAME,
    port=DB_PORT,
    cursorclass=DictCursor,
    charset='utf8mb4',
    autocommit=False,
    connect_timeout=10,      # fail fast on unreachable host
    read_timeout=30,
    write_timeout=30,
)

if DB_SSL:
    # Use system CA bundle (available on Linux/Render and macOS)
    # TiDB Cloud requires proper certificate verification
    _ca_paths = [
        '/etc/ssl/certs/ca-certificates.crt',   # Debian/Ubuntu (Render)
        '/etc/ssl/cert.pem',                     # macOS / Alpine
        '/etc/pki/tls/certs/ca-bundle.crt',      # RHEL/CentOS
    ]
    _ca = next((p for p in _ca_paths if os.path.exists(p)), None)
    _ssl_opts = {'ca': _ca} if _ca else {}
    _pool_kwargs['ssl'] = {'ssl': _ssl_opts}

# ─── Connection Pool (lazy) ─────────────────────────────────────────
# Pool is created on first use, NOT at import time.
# This lets Celery workers import database.py without needing a live DB
# connection just to start up.
_pool = None
_pool_lock = __import__('threading').Lock()


def _get_pool():
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = PooledDB(**_pool_kwargs)
    return _pool


def get_db_connection():
    """Return a connection from the pool (drop-in replacement)."""
    return _get_pool().connection()
