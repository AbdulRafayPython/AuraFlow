from database import get_db_connection
from datetime import datetime, timedelta

conn = get_db_connection()
with conn.cursor() as cur:
    # Check messages for user 1
    time_threshold = datetime.now() - timedelta(hours=24)
    
    print('=== Checking messages for user_id=1 ===')
    cur.execute('SELECT COUNT(*) as count FROM messages WHERE sender_id = 1')
    result = cur.fetchone()
    print(f"Total messages by user 1: {result['count']}")
    
    cur.execute('SELECT COUNT(*) as count FROM messages WHERE sender_id = 1 AND created_at >= %s', (time_threshold,))
    result = cur.fetchone()
    print(f"Messages in last 24h: {result['count']}")
    
    # Show recent messages
    cur.execute('''
        SELECT id, content, created_at, channel_id 
        FROM messages 
        WHERE sender_id = 1 
        ORDER BY created_at DESC 
        LIMIT 5
    ''')
    messages = cur.fetchall()
    print(f"\nRecent messages from user 1:")
    for m in messages:
        content = m['content'][:50] if m['content'] else 'N/A'
        print(f"  [{m['created_at']}] Channel {m['channel_id']}: {content}")
    
    # Check total messages in the database
    cur.execute('SELECT COUNT(*) as count FROM messages')
    result = cur.fetchone()
    print(f"\nTotal messages in database: {result['count']}")
    
    # Check who sent messages
    cur.execute('SELECT sender_id, COUNT(*) as count FROM messages GROUP BY sender_id LIMIT 10')
    senders = cur.fetchall()
    print(f"\nMessages by sender:")
    for s in senders:
        print(f"  User {s['sender_id']}: {s['count']} messages")

conn.close()
