"""
Migration: Fix ai_agent_logs schema & seed agent_registry features/defaults.
Run: python migrations/fix_agent_logs_and_seed.py
"""
import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from database import get_db_connection

def run():
    conn = get_db_connection()
    cur = conn.cursor()

    print("=== Step 1: Fix ai_agent_logs schema ===")
    alters = [
        ("agent_name",       "ALTER TABLE ai_agent_logs ADD COLUMN agent_name VARCHAR(100) NULL AFTER agent_id"),
        ("input_data",       "ALTER TABLE ai_agent_logs ADD COLUMN input_data TEXT NULL AFTER input_text"),
        ("output_data",      "ALTER TABLE ai_agent_logs ADD COLUMN output_data TEXT NULL AFTER output_text"),
        ("status",           "ALTER TABLE ai_agent_logs ADD COLUMN status VARCHAR(50) NULL DEFAULT 'success' AFTER confidence_score"),
        ("execution_time_ms","ALTER TABLE ai_agent_logs ADD COLUMN execution_time_ms INT NULL DEFAULT 0 AFTER status"),
    ]
    for col, sql in alters:
        try:
            cur.execute(sql)
            print(f"  + Added column: {col}")
        except Exception as e:
            if "Duplicate column" in str(e):
                print(f"  . Column {col} already exists")
            else:
                print(f"  ! Error adding {col}: {e}")
    conn.commit()

    # Add index
    try:
        cur.execute("CREATE INDEX idx_agent_name ON ai_agent_logs (agent_name)")
        print("  + Added index: idx_agent_name")
    except Exception as e:
        if "Duplicate" in str(e):
            print("  . Index idx_agent_name already exists")
        else:
            print(f"  ! Index error: {e}")
    conn.commit()

    print("\n=== Step 2: Seed agent_registry features & default_settings ===")
    features_data = {
        "moderation": ["Auto-detect toxic content", "Roman Urdu profanity detection", "Hate speech filtering",
                        "Configurable sensitivity", "Auto-moderation actions", "Violation tracking",
                        "Spam detection", "Context-aware analysis"],
        "engagement": ["Activity monitoring", "Icebreaker suggestions", "Quick polls", "Fun challenges",
                        "Conversation starters", "Engagement scoring", "Trend analysis", "Booster packs"],
        "knowledge":  ["Auto-extract Q&A pairs", "Searchable knowledge base", "Topic categorization",
                        "Duplicate detection", "Expert identification", "Scheduled extraction",
                        "FULLTEXT search", "Confidence scoring"],
        "focus":      ["Topic drift detection", "Focus scoring", "Distraction alerts", "Conversation analysis",
                        "Productivity metrics", "Session tracking", "Recommendations", "Periodic reports"],
        "summarizer": ["Channel summarization", "Bullet point format", "Key topics extraction", "Action items",
                        "Gemini AI powered", "Configurable length", "History tracking", "On-demand /summarize"],
        "mood":       ["Sentiment analysis", "Emotion detection", "Roman Urdu support", "Trend tracking",
                        "Mood history", "Visual reports", "Multi-language", "Real-time analysis"],
        "wellness":   ["Communication health score", "Break reminders", "Screen time monitoring",
                        "Burnout risk alerts", "Activity patterns", "Weekly reports",
                        "Wellbeing tips", "Personalized insights"],
    }

    default_settings_data = {
        "moderation": {"sensitivity": "medium", "auto_action": False, "roman_urdu": True,
                        "notify_user": True, "log_violations": True, "auto_warn": False},
        "engagement": {"auto_suggestions": True, "frequency": "low",
                        "activity_types": ["polls", "icebreakers", "challenges"], "min_members": 3},
        "knowledge":  {"auto_extract": True, "extract_hours": 2, "min_confidence": 0.6, "max_pairs_per_run": 20},
        "focus":      {"drift_threshold": 0.3, "check_interval": 50, "alert_on_drift": True, "report_frequency": "daily"},
        "summarizer": {"style": "bullet_points", "length": "medium", "max_messages": 100, "include_action_items": True},
        "mood":       {"roman_urdu": True, "emoji_analysis": True, "track_trends": True, "history_days": 30},
        "wellness":   {"break_reminders": True, "break_interval_minutes": 60, "daily_report": True, "burnout_alerts": True},
    }

    for agent_type, features in features_data.items():
        defaults = default_settings_data.get(agent_type, {})
        cur.execute(
            "UPDATE agent_registry SET features = %s, default_settings = %s WHERE agent_type = %s",
            (json.dumps(features), json.dumps(defaults), agent_type)
        )
        print(f"  + Updated: {agent_type} ({cur.rowcount} row)")
    conn.commit()

    # Verify
    print("\n=== Verification ===")
    cur.execute("DESCRIBE ai_agent_logs")
    print("ai_agent_logs columns:")
    for r in cur.fetchall():
        print(f"  {r['Field']:25s} {r['Type']}")

    cur.execute("SELECT agent_type, features IS NOT NULL as has_features, default_settings IS NOT NULL as has_defaults FROM agent_registry")
    print("\nagent_registry seed check:")
    for r in cur.fetchall():
        print(f"  {r['agent_type']:15s} features={r['has_features']}  defaults={r['has_defaults']}")

    conn.close()
    print("\n=== Migration complete! ===")

if __name__ == "__main__":
    run()
