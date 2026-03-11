"""
Database Cleanup & Normalization Migration
==========================================
1. Drop 8 unused tables (0 rows, 0 code references)
2. Drop dead columns from pinned_messages and users
3. Drop legacy moderation_logs table (0 rows, reads migrated to ai_agent_logs)
4. Add missing FK constraints for data integrity
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db_connection


def run_migration():
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            print("=" * 60)
            print("DATABASE CLEANUP & NORMALIZATION")
            print("=" * 60)

            # ──────────────────────────────────────────────
            # PHASE 1: Drop 8 completely unused tables
            # ──────────────────────────────────────────────
            unused_tables = [
                'user_roles',        # Must drop before 'roles' (has FK)
                'roles',
                'password_resets',
                'typing_indicators',
                'user_activity_log',
                'dm_read_status',
                'notifications',
                'user_mood_history',
            ]

            print("\n[PHASE 1] Dropping unused tables...")
            for table in unused_tables:
                cur.execute(f"SELECT COUNT(*) as cnt FROM `{table}`")
                count = cur.fetchone()['cnt']
                if count > 0:
                    print(f"  SKIP {table} - has {count} rows! Manual review needed.")
                    continue
                cur.execute(f"DROP TABLE IF EXISTS `{table}`")
                print(f"  DROPPED {table}")

            # ──────────────────────────────────────────────
            # PHASE 2: Drop legacy moderation_logs table
            # (0 rows, only SELECTed in admin - migrated to ai_agent_logs)
            # ──────────────────────────────────────────────
            print("\n[PHASE 2] Dropping legacy moderation_logs...")
            cur.execute("SELECT COUNT(*) as cnt FROM moderation_logs")
            ml_count = cur.fetchone()['cnt']
            if ml_count > 0:
                print(f"  SKIP moderation_logs - has {ml_count} rows! Manual review needed.")
            else:
                cur.execute("DROP TABLE IF EXISTS moderation_logs")
                print("  DROPPED moderation_logs")

            # ──────────────────────────────────────────────
            # PHASE 3: Drop dead columns
            # ──────────────────────────────────────────────
            print("\n[PHASE 3] Dropping dead columns...")

            # pinned_messages: is_dm_pin, dm_message_id, dm_pinned_by (never referenced)
            dead_columns = [
                ('pinned_messages', 'is_dm_pin'),
                ('pinned_messages', 'dm_message_id'),
                ('pinned_messages', 'dm_pinned_by'),
                ('users', 'token'),
            ]
            for table, col in dead_columns:
                cur.execute(f"""
                    SELECT COUNT(*) as cnt 
                    FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_SCHEMA = DATABASE() 
                    AND TABLE_NAME = '{table}' AND COLUMN_NAME = '{col}'
                """)
                if cur.fetchone()['cnt'] > 0:
                    cur.execute(f"ALTER TABLE `{table}` DROP COLUMN `{col}`")
                    print(f"  DROPPED {table}.{col}")
                else:
                    print(f"  SKIP {table}.{col} - already removed")

            # ──────────────────────────────────────────────
            # PHASE 4: Add missing FK constraints
            # ──────────────────────────────────────────────
            print("\n[PHASE 4] Adding missing FK constraints...")

            fk_additions = [
                # conversation_summaries.created_by → users.id
                ("conversation_summaries", "fk_cs_created_by",
                 "ADD CONSTRAINT fk_cs_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL"),

                # user_agents.user_id → users.id
                ("user_agents", "fk_ua_user",
                 "ADD CONSTRAINT fk_ua_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE"),

                # user_agents.agent_type → agent_registry.agent_type
                ("user_agents", "fk_ua_agent_type",
                 "ADD CONSTRAINT fk_ua_agent_type FOREIGN KEY (agent_type) REFERENCES agent_registry(agent_type) ON DELETE CASCADE"),

                # user_summary_schedules.user_id → users.id
                ("user_summary_schedules", "fk_uss_user",
                 "ADD CONSTRAINT fk_uss_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE"),

                # user_summary_schedules.channel_id → channels.id
                ("user_summary_schedules", "fk_uss_channel",
                 "ADD CONSTRAINT fk_uss_channel FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE"),

                # scheduled_summaries.schedule_id → user_summary_schedules.id
                ("scheduled_summaries", "fk_ss_schedule",
                 "ADD CONSTRAINT fk_ss_schedule FOREIGN KEY (schedule_id) REFERENCES user_summary_schedules(id) ON DELETE CASCADE"),

                # scheduled_summaries.user_id → users.id
                ("scheduled_summaries", "fk_ss_user",
                 "ADD CONSTRAINT fk_ss_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE"),

                # scheduled_summaries.channel_id → channels.id
                ("scheduled_summaries", "fk_ss_channel",
                 "ADD CONSTRAINT fk_ss_channel FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE"),
            ]

            for table, fk_name, alter_clause in fk_additions:
                # Check if FK already exists
                cur.execute("""
                    SELECT COUNT(*) as cnt
                    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
                    WHERE TABLE_SCHEMA = DATABASE()
                    AND TABLE_NAME = %s AND CONSTRAINT_NAME = %s
                """, (table, fk_name))
                if cur.fetchone()['cnt'] > 0:
                    print(f"  SKIP {fk_name} - already exists")
                    continue
                try:
                    cur.execute(f"ALTER TABLE `{table}` {alter_clause}")
                    print(f"  ADDED {fk_name} on {table}")
                except Exception as e:
                    print(f"  FAILED {fk_name} on {table}: {e}")

            conn.commit()
            print("\n" + "=" * 60)
            print("MIGRATION COMPLETE")
            print("=" * 60)

            # Verify final table count
            cur.execute("""
                SELECT COUNT(*) as cnt 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_SCHEMA = DATABASE()
            """)
            final_count = cur.fetchone()['cnt']
            print(f"\nFinal table count: {final_count} (was 43)")

    except Exception as e:
        conn.rollback()
        print(f"\nMIGRATION FAILED: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        conn.close()


if __name__ == '__main__':
    run_migration()
