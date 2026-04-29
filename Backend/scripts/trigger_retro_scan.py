import sys, os
sys.path.insert(0, '.')
from dotenv import load_dotenv
load_dotenv()

from tasks.agent_tasks import retroactive_scan_task
from database import get_db_connection

conn = get_db_connection()
with conn.cursor() as cur:
    cur.execute('SELECT id, name FROM communities')
    communities = cur.fetchall()
conn.close()

print('Found %d communities:' % len(communities))
for c in communities:
    cid = c['id']
    name = c['name']
    print('  Community %d: %s' % (cid, name))
    task = retroactive_scan_task.apply_async(
        kwargs={
            'channel_id': None,
            'community_id': cid,
            'hours_back': 168,
            'triggered_by': 'admin_manual',
        },
        queue='high_priority',
    )
    print('  -> Task queued: %s' % task.id)

print('All scan tasks queued.')
