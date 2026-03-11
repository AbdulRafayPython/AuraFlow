"""
Run the email verification migration.
Adds email_verified, email_verification_token, email_verification_expires
columns to the users table and back-fills existing users as verified.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db_connection

MIGRATION_STATEMENTS = [
    # Add columns if they don't exist (MySQL 8+ IF NOT EXISTS for ADD COLUMN isn't universal,
    # so we check information_schema first)
    """
    SET @col_exists = (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email_verified'
    );
    """,
]

def run():
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Check if column already exists
            cur.execute("""
                SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email_verified'
            """)
            exists = cur.fetchone()['cnt'] > 0

            if exists:
                print("[MIGRATION] email_verified column already exists — skipping.")
            else:
                print("[MIGRATION] Adding email verification columns...")
                cur.execute("ALTER TABLE users ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0")
                cur.execute("ALTER TABLE users ADD COLUMN email_verification_token VARCHAR(500) DEFAULT NULL")
                cur.execute("ALTER TABLE users ADD COLUMN email_verification_expires TIMESTAMP NULL DEFAULT NULL")

                # Index for fast token lookup
                cur.execute("ALTER TABLE users ADD INDEX idx_email_verification_token (email_verification_token)")

                # Back-fill: existing users are already trusted
                cur.execute("UPDATE users SET email_verified = 1")
                print("[MIGRATION] Columns added. Existing users marked as verified.")

            conn.commit()
            print("[MIGRATION] Done.")
    except Exception as e:
        print(f"[MIGRATION ERROR] {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    run()
