import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from database import get_db_connection

conn = get_db_connection()
cur = conn.cursor()
tables = ['users','communities','channels','messages','direct_messages',
          'friends','friend_requests','message_reactions','ai_agents','community_members']
for t in tables:
    cur.execute("SELECT COUNT(*) as c FROM " + t)
    print(f"  {t}: {cur.fetchone()['c']}")
cur.close()
conn.close()
