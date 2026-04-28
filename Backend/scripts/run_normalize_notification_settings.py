"""Run the notification settings normalization migration."""
from database import get_db_connection
import json

conn = get_db_connection()
cur = conn.cursor()

# 1. Create table
cur.execute("""CREATE TABLE IF NOT EXISTS user_notification_settings (
    user_id INT PRIMARY KEY,
    notify_direct_messages TINYINT(1) NOT NULL DEFAULT 1,
    notify_channel_messages TINYINT(1) NOT NULL DEFAULT 1,
    notify_friend_requests TINYINT(1) NOT NULL DEFAULT 1,
    notify_friend_online TINYINT(1) NOT NULL DEFAULT 0,
    notification_sounds TINYINT(1) NOT NULL DEFAULT 1,
    email_alerts_enabled TINYINT(1) NOT NULL DEFAULT 1,
    email_dms_and_calls TINYINT(1) NOT NULL DEFAULT 1,
    email_community_messages TINYINT(1) NOT NULL DEFAULT 0,
    email_agent_notifications TINYINT(1) NOT NULL DEFAULT 1,
    email_agent_summaries TINYINT(1) NOT NULL DEFAULT 1,
    email_batch_interval_minutes INT NOT NULL DEFAULT 5,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)""")
print('Table created')

# 2. Migrate existing JSON data
cur.execute("SELECT id, notification_settings FROM users WHERE notification_settings IS NOT NULL")
rows = cur.fetchall()
for row in rows:
    uid = row['id']
    raw = row['notification_settings']
    if isinstance(raw, str):
        settings = json.loads(raw)
    elif isinstance(raw, dict):
        settings = raw
    else:
        continue

    cur.execute("""INSERT IGNORE INTO user_notification_settings
        (user_id, email_alerts_enabled, email_dms_and_calls, email_community_messages,
         email_agent_notifications, email_agent_summaries, email_batch_interval_minutes)
        VALUES (%s, %s, %s, %s, %s, %s, %s)""",
        (uid,
         1 if settings.get('email_alerts_enabled', True) else 0,
         1 if settings.get('email_dms_and_calls', True) else 0,
         1 if settings.get('email_community_messages', False) else 0,
         1 if settings.get('email_agent_notifications', True) else 0,
         1 if settings.get('email_agent_summaries', True) else 0,
         settings.get('email_batch_interval_minutes', 5)))

print(f'Migrated {len(rows)} existing rows')

# 3. Insert defaults for remaining users
cur.execute("""INSERT IGNORE INTO user_notification_settings (user_id)
    SELECT id FROM users WHERE id NOT IN (SELECT user_id FROM user_notification_settings)""")
print(f'Inserted {cur.rowcount} default rows')

conn.commit()
conn.close()
print('Migration complete!')
