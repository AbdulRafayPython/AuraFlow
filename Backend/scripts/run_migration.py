"""Run the account_status migration."""
import pymysql
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT

conn = pymysql.connect(
    host=DB_HOST, user=DB_USER, password=DB_PASSWORD,
    database=DB_NAME, port=DB_PORT
)
cur = conn.cursor()

statements = [
    "ALTER TABLE users ADD COLUMN account_status ENUM('active','suspended','banned') NOT NULL DEFAULT 'active' AFTER role",
    "ALTER TABLE users ADD COLUMN account_status_reason TEXT DEFAULT NULL AFTER account_status",
    "ALTER TABLE users ADD COLUMN account_status_until TIMESTAMP NULL DEFAULT NULL AFTER account_status_reason",
    "ALTER TABLE users ADD COLUMN account_status_by INT DEFAULT NULL AFTER account_status_until",
    """CREATE TABLE IF NOT EXISTS admin_actions (
        id INT NOT NULL AUTO_INCREMENT,
        admin_id INT NOT NULL,
        target_user_id INT NOT NULL,
        action_type ENUM('warn','suspend','ban','unsuspend','unban','role_change') NOT NULL,
        reason TEXT DEFAULT NULL,
        details JSON DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_target_user (target_user_id),
        KEY idx_admin (admin_id),
        KEY idx_created (created_at),
        FOREIGN KEY (admin_id) REFERENCES users(id),
        FOREIGN KEY (target_user_id) REFERENCES users(id)
    )"""
]

for stmt in statements:
    try:
        cur.execute(stmt)
        print(f"OK: {stmt[:70]}...")
    except Exception as e:
        print(f"SKIP: {e}")

conn.commit()
cur.close()
conn.close()
print("Migration complete!")
