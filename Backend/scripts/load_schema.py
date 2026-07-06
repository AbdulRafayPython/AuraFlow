"""
Load the canonical schema (migrations/schema.sql) into the database configured
in your .env — use this to initialise a fresh TiDB cluster (e.g. the new
Singapore one) from scratch.

Run from the Backend/ directory:
    .\\venv\\Scripts\\python.exe scripts\\load_schema.py

It connects with the SAME host/SSL settings your app uses, creates the database
if it doesn't exist yet, then applies every statement in schema.sql.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pymysql
from config import DB_HOST, DB_USER, DB_PASSWORD, DB_NAME

# Mirror database.py's auto-detection so this matches how the app connects.
DB_PORT = int(os.getenv('DB_PORT', '4000' if (DB_HOST or '').endswith('tidbcloud.com') else '3306'))
DB_SSL = os.getenv('DB_SSL', 'true' if (DB_HOST or '').endswith('tidbcloud.com') else 'false').lower() == 'true'

_connect_kwargs = dict(
    host=DB_HOST,
    user=DB_USER,
    password=DB_PASSWORD,
    port=DB_PORT,
    charset='utf8mb4',
    autocommit=True,            # DDL: commit each statement as we go
    connect_timeout=15,
)

if DB_SSL:
    # Same approach as database.py: prefer an explicit CA via DB_SSL_CA (the file
    # you downloaded from the TiDB Cloud Connect dialog), then a system CA bundle,
    # otherwise let Python build a default SSL context (trusts the OS cert store).
    _ca_paths = [
        os.getenv('DB_SSL_CA'),
        '/etc/ssl/certs/ca-certificates.crt',
        '/etc/ssl/cert.pem',
        '/etc/pki/tls/certs/ca-bundle.crt',
    ]
    _ca = next((p for p in _ca_paths if p and os.path.exists(p)), None)
    _connect_kwargs['ssl'] = {'ssl': {'ca': _ca} if _ca else {}}
    print(f"TLS CA: {_ca or '(OS default cert store)'}")


def split_statements(sql_text):
    """Split schema.sql into individual statements.

    schema.sql has no stored procedures/triggers/DELIMITER blocks, so a simple
    line-accumulator that flushes on a trailing ';' is correct. Full-line
    comments (-- ...) and blank lines are skipped.
    """
    statements = []
    buffer = []
    for raw in sql_text.splitlines():
        line = raw.strip()
        if not line or line.startswith('--'):
            continue
        buffer.append(raw)
        if line.endswith(';'):
            stmt = '\n'.join(buffer).strip().rstrip(';').strip()
            if stmt:
                statements.append(stmt)
            buffer = []
    # Any trailing statement without a final ';'
    tail = '\n'.join(buffer).strip().rstrip(';').strip()
    if tail:
        statements.append(tail)
    return statements


def main():
    schema_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        'migrations', 'schema.sql'
    )
    if not os.path.exists(schema_path):
        print(f"ERROR: schema not found at {schema_path}")
        sys.exit(1)

    print(f"Connecting to {DB_HOST}:{DB_PORT} (ssl={DB_SSL}) ...")
    conn = pymysql.connect(**_connect_kwargs)
    try:
        with conn.cursor() as cur:
            # Create + select the target database (fresh cluster won't have it).
            cur.execute(f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}` "
                        f"DEFAULT CHARACTER SET utf8mb4")
            cur.execute(f"USE `{DB_NAME}`")
            print(f"Using database `{DB_NAME}`")

            with open(schema_path, encoding='utf-8') as f:
                statements = split_statements(f.read())

            print(f"Applying {len(statements)} statements ...")
            ok = 0
            failed = 0
            for stmt in statements:
                preview = ' '.join(stmt.split())[:70]
                try:
                    cur.execute(stmt)
                    ok += 1
                    print(f"  OK   {preview}")
                except Exception as e:
                    failed += 1
                    print(f"  FAIL {preview}\n       -> {e}")

            print(f"\nDone. {ok} succeeded, {failed} failed.")
            if failed:
                print("Review the FAIL lines above. Re-running is safe "
                      "(DROP TABLE IF EXISTS / CREATE TABLE).")
    finally:
        conn.close()


if __name__ == '__main__':
    main()
