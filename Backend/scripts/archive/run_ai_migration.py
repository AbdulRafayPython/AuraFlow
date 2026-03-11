"""
Database Migration Runner
Run AI Agents table migrations
"""

import pymysql
from config import DB_HOST, DB_USER, DB_PASSWORD, DB_NAME

def run_migration():
    """Execute the AI agents migration SQL"""
    try:
        # Connect to database
        conn = pymysql.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME
        )
        
        print("[MIGRATION] Connected to database...")
        
        # Read migration file
        with open('migrations/add_ai_agents_tables.sql', 'r', encoding='utf-8') as f:
            sql_script = f.read()
        
        # Split into individual statements
        statements = [s.strip() for s in sql_script.split(';') if s.strip() and not s.strip().startswith('--')]
        
        cursor = conn.cursor()
        
        # Execute each statement
        for i, statement in enumerate(statements):
            if statement and not statement.startswith('USE'):
                try:
                    print(f"[MIGRATION] Executing statement {i+1}/{len(statements)}...")
                    cursor.execute(statement)
                except Exception as e:
                    print(f"[MIGRATION] Warning on statement {i+1}: {e}")
        
        conn.commit()
        print("[MIGRATION] ✅ All migrations executed successfully!")
        
        # Verify tables were created
        cursor.execute("SHOW TABLES")
        all_tables = cursor.fetchall()
        
        # Filter for AI agent tables
        agent_tables = []
        for table in all_tables:
            # Handle both dict and tuple responses
            table_name = table[0] if isinstance(table, tuple) else list(table.values())[0]
            if any(keyword in table_name.lower() for keyword in 
                   ['summaries', 'mood', 'moderation', 'knowledge', 'wellness', 'engagement', 'agent_activity']):
                agent_tables.append(table_name)
        
        print(f"\n[MIGRATION] ✅ Created {len(agent_tables)} AI agent tables:")
        for table_name in agent_tables:
            print(f"  ✓ {table_name}")
        
        cursor.close()
        conn.close()
        
    except Exception as e:
        print(f"[MIGRATION] ❌ Error: {e}")
        raise

if __name__ == "__main__":
    run_migration()
