import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from database import get_db_connection
c = get_db_connection()
cur = c.cursor()
cur.execute("SHOW TABLES")
tables = [list(row.values())[0] for row in cur.fetchall()]
agent_tables = [t for t in tables if 'agent' in t.lower()]
print("Agent-related tables:", agent_tables)

# Check if ai_agents table exists
if 'ai_agents' in tables:
    cur.execute("DESCRIBE ai_agents")
    print("\nai_agents schema:")
    for row in cur.fetchall():
        print(f"  {row['Field']:25s} {row['Type']}")
    cur.execute("SELECT COUNT(*) as cnt FROM ai_agents")
    print(f"  rows: {cur.fetchone()['cnt']}")
else:
    print("\nai_agents table DOES NOT EXIST")

# Check mood_tracking table
if 'mood_tracking' in tables:
    cur.execute("DESCRIBE mood_tracking")
    print("\nmood_tracking schema:")
    for row in cur.fetchall():
        print(f"  {row['Field']:25s} {row['Type']}")
else:
    # Check for user_moods
    mood_tables = [t for t in tables if 'mood' in t.lower()]
    print(f"\nmood_tracking DOES NOT EXIST. Mood-related tables: {mood_tables}")
    for mt in mood_tables:
        cur.execute(f"DESCRIBE {mt}")
        print(f"\n{mt} schema:")
        for row in cur.fetchall():
            print(f"  {row['Field']:25s} {row['Type']}")

c.close()
