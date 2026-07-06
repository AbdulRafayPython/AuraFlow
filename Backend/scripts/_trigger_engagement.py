import os, sys
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.getcwd())

from database import get_db_connection
from agents import event_bus

# Clear cooldown
conn = get_db_connection()
cur = conn.cursor()
cur.execute(
    "DELETE FROM agent_state WHERE agent_name='engagement' AND entity_type='channel' AND entity_id=17"
)
conn.commit()
conn.close()
print("Cooldown cleared")

# Publish channel.silent
event_bus.publish('channel.silent', {
    'channel_id': 17,
    'community_id': 4,
    'bucket': 15,
    'silent_minutes': 15
})
print("channel.silent published — watch for toast!")
