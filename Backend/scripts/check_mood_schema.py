"""Check mood tracking related tables schema"""
from database import get_db_connection

conn = get_db_connection()
cur = conn.cursor()

# Check what tables exist
cur.execute("SHOW TABLES LIKE '%mood%'")
tables = cur.fetchall()
print("Tables with 'mood' in name:")
for table in tables:
    print(f"  - {table}")

# Check messages table schema (since we track mood from messages)
print("\nMessages table schema:")
cur.execute("DESCRIBE messages")
columns = cur.fetchall()
for col in columns:
    print(f"  {col['Field']}: {col['Type']}")

# Check if there are any agent-related tables
cur.execute("SHOW TABLES LIKE '%agent%'")
agent_tables = cur.fetchall()
print("\nAgent-related tables:")
for table in agent_tables:
    print(f"  - {table}")
    cur.execute(f"DESCRIBE {table[list(table.keys())[0]]}")
    cols = cur.fetchall()
    for col in cols:
        print(f"    {col['Field']}: {col['Type']}")

conn.close()
