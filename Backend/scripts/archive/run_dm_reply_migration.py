"""Run the reply_to migration for direct_messages table."""
from database import get_db_connection

conn = get_db_connection()
cur = conn.cursor()

# Check if column already exists
cur.execute("SHOW COLUMNS FROM direct_messages")
cols = [row['Field'] for row in cur.fetchall()]

if 'reply_to' in cols:
    print("reply_to column already exists in direct_messages. Skipping.")
else:
    print("Adding reply_to column to direct_messages...")
    cur.execute("""
        ALTER TABLE direct_messages
        ADD COLUMN reply_to BIGINT NULL AFTER message_type
    """)
    cur.execute("""
        ALTER TABLE direct_messages
        ADD CONSTRAINT fk_dm_reply_to FOREIGN KEY (reply_to) REFERENCES direct_messages(id) ON DELETE SET NULL
    """)
    cur.execute("CREATE INDEX idx_dm_reply_to ON direct_messages(reply_to)")
    conn.commit()
    print("Migration applied successfully!")

conn.close()
