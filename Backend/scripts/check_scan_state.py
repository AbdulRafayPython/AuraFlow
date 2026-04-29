import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from dotenv import load_dotenv; load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
from database import get_db_connection

conn = get_db_connection()
with conn.cursor() as cur:
    cur.execute(
        "SELECT ca.community_id, c.name, ca.enabled "
        "FROM community_agents ca "
        "JOIN communities c ON c.id = ca.community_id "
        "WHERE ca.agent_type = 'moderation' "
        "ORDER BY ca.community_id"
    )
    rows = cur.fetchall()
    print('Moderation agent status:')
    for r in rows:
        print('  Community %d (%s): enabled=%s' % (r['community_id'], r['name'], r['enabled']))

    cur.execute(
        "SELECT ch.community_id, c.name, COUNT(*) as unreviewed "
        "FROM messages m "
        "JOIN channels ch ON ch.id = m.channel_id "
        "JOIN communities c ON c.id = ch.community_id "
        "WHERE m.message_type = 'text' "
        "  AND m.content IS NOT NULL "
        "  AND m.created_at >= DATE_SUB(NOW(), INTERVAL 168 HOUR) "
        "  AND m.id NOT IN ( "
        "    SELECT message_id FROM ai_agent_logs "
        "    WHERE message_id IS NOT NULL AND action_type = 'moderation' "
        "  ) "
        "GROUP BY ch.community_id, c.name"
    )
    rows2 = cur.fetchall()
    print()
    print('Unreviewed messages (last 7 days):')
    if not rows2:
        print('  None — all messages already reviewed, or no text messages exist')
    for r in rows2:
        print('  Community %d (%s): %d messages' % (r['community_id'], r['name'], r['unreviewed']))

conn.close()
