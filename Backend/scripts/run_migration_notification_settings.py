"""Run migration to add notification_settings column to users table."""
from database import get_db_connection

conn = get_db_connection()
try:
    with conn.cursor() as cur:
        cur.execute("SHOW COLUMNS FROM users LIKE 'notification_settings'")
        if cur.fetchone():
            print('Column notification_settings already exists')
        else:
            cur.execute('ALTER TABLE users ADD COLUMN notification_settings JSON DEFAULT NULL')
            conn.commit()
            print('Column notification_settings added successfully')
finally:
    conn.close()
