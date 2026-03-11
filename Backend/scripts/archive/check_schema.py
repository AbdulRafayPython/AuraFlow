from database import get_db_connection

conn = get_db_connection()
cur = conn.cursor()

print("\n=== conversation_summaries schema ===")
cur.execute('DESCRIBE conversation_summaries')
cols = cur.fetchall()
for c in cols:
    print(f"{c['Field']}: {c['Type']}")

print("\n=== ai_agent_logs schema ===")
cur.execute('DESCRIBE ai_agent_logs')
cols = cur.fetchall()
for c in cols:
    print(f"{c['Field']}: {c['Type']}")

conn.close()
