import os
import pymysql
from pymysql.cursors import DictCursor
from dbutils.pooled_db import PooledDB
from config import DB_HOST, DB_USER, DB_PASSWORD, DB_NAME

# ─── Cloud / Port / SSL support ─────────────────────────────────────
DB_PORT = int(os.getenv('DB_PORT', '3306'))
DB_SSL = os.getenv('DB_SSL', 'false').lower() == 'true'

# Build connection kwargs
_pool_kwargs = dict(
    creator=pymysql,
    maxconnections=20,       # max simultaneous connections
    mincached=2,             # keep 2 idle connections ready
    maxcached=10,            # cap idle pool size
    blocking=True,           # block rather than error when pool exhausted
    maxusage=0,              # unlimited reuse per connection
    setsession=[],           # no per-session SQL
    host=DB_HOST,
    user=DB_USER,
    password=DB_PASSWORD,
    database=DB_NAME,
    port=DB_PORT,
    cursorclass=DictCursor,
    charset='utf8mb4',
    autocommit=False,
)

if DB_SSL:
    _pool_kwargs['ssl'] = {'ssl': {}}

# ─── Connection Pool ────────────────────────────────────────────────
_pool = PooledDB(**_pool_kwargs)


def get_db_connection():
    """Return a connection from the pool (drop-in replacement)."""
    return _pool.connection()
