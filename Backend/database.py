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

# TiDB Serverless free tier caps TOTAL connections to the cluster at 25 — and
# that budget is shared across EVERY process that connects (this web app, each
# Celery worker, and Celery beat). If the combined pools exceed 25, TiDB starts
# rejecting connections and requests fail (which surfaces as slow reloads and
# users getting logged out). So keep each process's pool small; if you run Celery
# alongside the app, give the workers a lower DB_MAX_CONNECTIONS so the sum < 25.
DB_MAX_CONNECTIONS = int(os.getenv('DB_MAX_CONNECTIONS', '10'))

# Build connection kwargs
_pool_kwargs = dict(
    creator=pymysql,
    maxconnections=DB_MAX_CONNECTIONS,
    # Keep only a FEW idle connections warm. TiDB Serverless closes idle
    # connections server-side fairly quickly, so hoarding many idle ones just
    # means they go stale and cause a slow reconnect-storm on the next burst —
    # and they eat into the shared 25-connection cap. ping=1 (below) transparently
    # replaces any that TiDB dropped, so a small warm pool is the right trade-off.
    mincached=1,             # keep 1 idle connection warm
    maxcached=3,             # cap idle pool size (was 15 — too many for TiDB)
    blocking=True,           # queue (don't error) when the pool is momentarily full
    maxusage=500,            # recycle connection after 500 uses
    setsession=[],           # no per-session SQL
    # ping=1 sends a COM_PING on every checkout so a connection TiDB silently
    # dropped (it closes idle conns) is detected/replaced before use.
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
    # TiDB Cloud requires TLS. Prefer an explicit CA file if provided via
    # DB_SSL_CA (e.g. the CA you download from the TiDB Cloud "Connect" dialog on
    # Windows), then fall back to the system CA bundle on Linux/macOS. If none is
    # found we pass an empty ssl dict, which makes PyMySQL build a default SSL
    # context that trusts the OS certificate store (works on Windows).
    _ca_paths = [
        os.getenv('DB_SSL_CA'),                  # explicit CA (TiDB Cloud download)
        '/etc/ssl/certs/ca-certificates.crt',   # Debian/Ubuntu (Render)
        '/etc/ssl/cert.pem',                     # macOS / Alpine
        '/etc/pki/tls/certs/ca-bundle.crt',      # RHEL/CentOS
    ]
    _ca = next((p for p in _ca_paths if p and os.path.exists(p)), None)
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
