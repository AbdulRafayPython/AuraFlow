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
_pool_kwargs = dict(
    creator=pymysql,
    maxconnections=15,       # TiDB Serverless free tier caps at 25 connections; stay under
    mincached=1,             # keep 1 idle connection ready
    maxcached=5,             # cap idle pool size
    blocking=True,           # block rather than error when pool exhausted
    maxusage=500,            # recycle connection after 500 uses
    setsession=[],           # no per-session SQL
    host=DB_HOST,
    user=DB_USER,
    password=DB_PASSWORD,
    database=DB_NAME,
    port=DB_PORT,
    cursorclass=DictCursor,
    charset='utf8mb4',
    autocommit=False,
    connect_timeout=15,
    read_timeout=60,
    write_timeout=60,
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

# ─── Connection Pool ────────────────────────────────────────────────
_pool = PooledDB(**_pool_kwargs)


def get_db_connection():
    """Return a connection from the pool (drop-in replacement)."""
    return _pool.connection()
