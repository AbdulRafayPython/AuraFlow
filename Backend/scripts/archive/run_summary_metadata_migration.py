import pymysql
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db_connection

def run_migration():
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            print("[MIGRATION] Adding metadata columns to conversation_summaries...")
            
            # Add message_count column
            try:
                cur.execute("""
                    ALTER TABLE conversation_summaries
                    ADD COLUMN message_count INT DEFAULT 0
                """)
                print("✅ Added message_count column")
            except pymysql.err.OperationalError as e:
                if "Duplicate column" in str(e):
                    print("⚠️ message_count column already exists")
                else:
                    raise
            
            # Add participants column
            try:
                cur.execute("""
                    ALTER TABLE conversation_summaries
                    ADD COLUMN participants TEXT
                """)
                print("✅ Added participants column")
            except pymysql.err.OperationalError as e:
                if "Duplicate column" in str(e):
                    print("⚠️ participants column already exists")
                else:
                    raise
            
            # Add time_range_start column
            try:
                cur.execute("""
                    ALTER TABLE conversation_summaries
                    ADD COLUMN time_range_start TIMESTAMP NULL
                """)
                print("✅ Added time_range_start column")
            except pymysql.err.OperationalError as e:
                if "Duplicate column" in str(e):
                    print("⚠️ time_range_start column already exists")
                else:
                    raise
            
            # Add time_range_end column
            try:
                cur.execute("""
                    ALTER TABLE conversation_summaries
                    ADD COLUMN time_range_end TIMESTAMP NULL
                """)
                print("✅ Added time_range_end column")
            except pymysql.err.OperationalError as e:
                if "Duplicate column" in str(e):
                    print("⚠️ time_range_end column already exists")
                else:
                    raise
            
            # Add key_points column
            try:
                cur.execute("""
                    ALTER TABLE conversation_summaries
                    ADD COLUMN key_points TEXT
                """)
                print("✅ Added key_points column")
            except pymysql.err.OperationalError as e:
                if "Duplicate column" in str(e):
                    print("⚠️ key_points column already exists")
                else:
                    raise
            
            conn.commit()
            print("\n✅ Migration completed successfully!")
            
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    run_migration()
