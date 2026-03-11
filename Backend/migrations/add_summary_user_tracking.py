"""Migration: Add created_by and method columns to conversation_summaries"""
from database import get_db_connection

def run():
    conn = get_db_connection()
    cur = conn.cursor()
    
    # Add created_by column if not exists
    try:
        cur.execute("ALTER TABLE conversation_summaries ADD COLUMN created_by INT NULL AFTER generated_by")
        print("Added created_by column")
    except Exception as e:
        if '1060' in str(e):
            print("created_by column already exists")
        else:
            raise
    
    # Add method column if not exists
    try:
        cur.execute("ALTER TABLE conversation_summaries ADD COLUMN method VARCHAR(50) DEFAULT 'extractive' AFTER message_count")
        print("Added method column")
    except Exception as e:
        if '1060' in str(e):
            print("method column already exists")
        else:
            raise
    
    # Add index on created_by
    try:
        cur.execute("ALTER TABLE conversation_summaries ADD INDEX idx_user_summaries (created_by, created_at DESC)")
        print("Added idx_user_summaries index")
    except Exception as e:
        if '1061' in str(e):
            print("idx_user_summaries index already exists")
        else:
            raise
    
    conn.commit()
    print("Migration complete!")
    conn.close()

if __name__ == '__main__':
    run()
