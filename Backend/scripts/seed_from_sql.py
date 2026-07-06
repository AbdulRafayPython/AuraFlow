"""
Run a .sql data file (default: migrations/seed_data.sql) against the database
configured in .env — reuses the same TLS connection + statement splitter as
scripts/load_schema.py.

Run from the Backend/ directory (AFTER load_schema.py has created the tables):
    .\\venv\\Scripts\\python.exe scripts\\seed_from_sql.py
    .\\venv\\Scripts\\python.exe scripts\\seed_from_sql.py migrations\\some_other.sql
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))   # Backend/  (config, etc.)
sys.path.insert(0, _HERE)                     # scripts/  (load_schema)

import pymysql
from load_schema import _connect_kwargs, split_statements  # shared conn + splitter
from config import DB_NAME


def main():
    default_path = os.path.join(os.path.dirname(_HERE), 'migrations', 'seed_data.sql')
    path = sys.argv[1] if len(sys.argv) > 1 else default_path
    if not os.path.exists(path):
        print(f"ERROR: SQL file not found: {path}")
        sys.exit(1)

    print(f"Seeding from {path}")
    conn = pymysql.connect(**_connect_kwargs)
    try:
        with conn.cursor() as cur:
            cur.execute(f"USE `{DB_NAME}`")
            print(f"Using database `{DB_NAME}`")
            statements = split_statements(open(path, encoding='utf-8').read())
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
        conn.commit()
        print(f"\nDone. {ok} succeeded, {failed} failed.")
        if failed:
            print("Re-running is safe (the seed uses ON DUPLICATE KEY UPDATE).")
    finally:
        conn.close()


if __name__ == '__main__':
    main()
