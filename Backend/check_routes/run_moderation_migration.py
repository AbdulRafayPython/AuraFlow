"""
Run moderation logs migration
"""
from database import get_db_connection

def run_migration():
    """Run the moderation logs migration"""
    conn = get_db_connection()
    
    try:
        with conn.cursor() as cur:
            # Read and execute the migration SQL
            with open('migrations/add_moderation_logs.sql', 'r') as f:
                sql_commands = f.read().split(';')
                
                for command in sql_commands:
                    command = command.strip()
                    if command:
                        try:
                            cur.execute(command)
                            print(f"✓ Executed: {command[:50]}...")
                        except Exception as e:
                            print(f"⚠ Error executing command: {e}")
                            print(f"  Command: {command[:100]}...")
            
            conn.commit()
            print("\n✓ Migration completed successfully!")
            
    except Exception as e:
        print(f"✗ Migration failed: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == '__main__':
    print("Running moderation logs migration...")
    run_migration()
