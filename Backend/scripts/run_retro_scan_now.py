import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

from agents.moderation import ModerationAgent
from database import get_db_connection

agent = ModerationAgent()

# Communities with unreviewed messages
targets = [
    (4, 'Design Studio'),
    (1, 'Web Dev Hub'),
    (9, 'Python'),
]

for community_id, name in targets:
    print('\n========== Community %d: %s ==========' % (community_id, name))

    conn = get_db_connection()
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM channels WHERE community_id = %s",
            (community_id,)
        )
        channels = [r['id'] for r in cur.fetchall()]
    conn.close()

    print('Channels to scan: %s' % channels)

    for ch_id in channels:
        print('\n  -- Channel %d --' % ch_id)
        result = agent.retroactive_scan(
            channel_id=ch_id,
            community_id=community_id,
            hours_back=168,
            batch_size=10,
            progress_callback=lambda s, t, f: print(
                '    Progress: %d/%d scanned, %d flagged' % (s, t, f)
            )
        )
        print('  Result: scanned=%d, flagged=%d, errors=%d' % (
            result['scanned'], result['flagged'], result['errors']
        ))

print('\n\nDone.')
