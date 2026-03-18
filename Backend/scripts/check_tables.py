from database import get_db_connection
conn = get_db_connection()
cur = conn.cursor()
for t in ['ai_agents', 'agent_registry', 'community_agents', 'ai_agent_logs']:
    cur.execute(f"DESCRIBE {t}")
    print(f"=== {t} ===")
    for row in cur.fetchall():
        print(f"  {row['Field']:30s} {row['Type']}")
    print()
conn.close()
