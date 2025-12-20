#!/usr/bin/env python3
"""
Script to run the reaction tables migration
"""
from database import get_db_connection
import os

def run_migration():
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Check if tables exist
        print("Checking existing tables...")
        cursor.execute("SHOW TABLES LIKE 'message_reactions'")
        mr_exists = len(cursor.fetchall()) > 0
        print(f"  message_reactions table exists: {mr_exists}")
        
        cursor.execute("SHOW TABLES LIKE 'direct_message_reactions'")
        dmr_exists = len(cursor.fetchall()) > 0
        print(f"  direct_message_reactions table exists: {dmr_exists}")
        
        if not dmr_exists:
            print("\nRunning migration: add_dm_reactions.sql...")
            
            # Read and execute migration file
            migration_file = os.path.join('migrations', 'add_dm_reactions.sql')
            with open(migration_file, 'r') as f:
                sql_script = f.read()
            
            # Split by semicolon and execute each statement
            statements = [s.strip() for s in sql_script.split(';') if s.strip()]
            
            for statement in statements:
                if statement.upper().startswith('USE'):
                    continue  # Skip USE statement, we're already connected
                try:
                    cursor.execute(statement)
                    print(f"  ✓ Executed: {statement[:50]}...")
                except Exception as e:
                    if 'already exists' in str(e) or 'Duplicate' in str(e):
                        print(f"  ⚠ Skipped (already exists): {statement[:50]}...")
                    else:
                        print(f"  ✗ Error: {e}")
                        raise
            
            conn.commit()
            print("\n✅ Migration completed successfully!")
        else:
            print("\n✅ All reaction tables already exist!")
        
        # Verify tables
        print("\nVerifying tables...")
        cursor.execute("SHOW TABLES LIKE '%reaction%'")
        tables = cursor.fetchall()
        print(f"Reaction tables found: {[t[list(t.keys())[0]] for t in tables]}")
        
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            cursor.close()
            conn.close()

if __name__ == '__main__':
    run_migration()
