"""One-off backfill: give every existing `users` row a distinct
`public_id` UUID. Run after add_user_public_id_step1.sql and before
add_user_public_id_step2.sql (which adds the NOT NULL + UNIQUE constraint).

Usage (from Backend/):
    ./venv/Scripts/python.exe migrations/backfill_user_public_id.py
"""
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db_connection  # noqa: E402


def main():
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE public_id IS NULL")
            rows = cur.fetchall()
            for row in rows:
                cur.execute(
                    "UPDATE users SET public_id = %s WHERE id = %s",
                    (str(uuid.uuid4()), row['id']),
                )
        conn.commit()
        print(f"Backfilled public_id for {len(rows)} users.")
    finally:
        conn.close()


if __name__ == '__main__':
    main()
