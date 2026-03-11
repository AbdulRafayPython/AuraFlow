"""
Run migration to create user_moods table
"""
from database import get_db_connection

def run_migration():
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Read SQL file
            with open('migrations/add_user_moods_table.sql', 'r') as f:
                sql = f.read()
            
            # Execute migration
            cur.execute(sql)
            conn.commit()
            
            print("✅ user_moods table created successfully")
            
            # Verify table
            cur.execute("DESCRIBE user_moods")
            columns = cur.fetchall()
            
            print("\nTable structure:")
            for col in columns:
                print(f"  {col['Field']}: {col['Type']}")
                
    except Exception as e:
        print(f"❌ Migration failed: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    run_migration()
