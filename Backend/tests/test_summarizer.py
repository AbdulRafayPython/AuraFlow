"""
Test Summarizer Agent
Quick test to verify the summarizer is working
"""

from agents.summarizer import SummarizerAgent
from database import get_db_connection

def test_summarizer():
    """Test the summarizer with sample data"""
    
    print("=" * 60)
    print("🤖 TESTING SUMMARIZER AGENT")
    print("=" * 60)
    
    # Initialize agent
    summarizer = SummarizerAgent()
    print("[TEST] ✅ Summarizer initialized")
    
    # Get a channel to test with
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Find a channel with messages
            cur.execute("""
                SELECT c.id, c.name, COUNT(m.id) as message_count
                FROM channels c
                LEFT JOIN messages m ON c.id = m.channel_id
                GROUP BY c.id, c.name
                HAVING COUNT(m.id) >= 20
                LIMIT 1
            """)
            
            channel = cur.fetchone()
            
            if not channel:
                print("[TEST] ⚠️  No channel found with enough messages (need 20+)")
                print("[TEST] Creating test messages...")
                
                # Create test channel and messages
                cur.execute("""
                    SELECT id FROM users LIMIT 1
                """)
                user = cur.fetchone()
                
                if not user:
                    print("[TEST] ❌ No users found in database")
                    return
                
                user_id = user['id']
                
                # Create test channel
                cur.execute("""
                    INSERT INTO channels (name, type, created_by)
                    VALUES ('Test Summarizer Channel', 'text', %s)
                """, (user_id,))
                conn.commit()
                channel_id = cur.lastrowid
                
                # Add user to channel
                cur.execute("""
                    INSERT INTO channel_members (channel_id, user_id)
                    VALUES (%s, %s)
                """, (channel_id, user_id))
                
                # Create test messages
                test_messages = [
                    "Hey team, we need to discuss the project timeline",
                    "I think we should prioritize the backend first",
                    "Good idea! The API needs to be stable",
                    "When is the deadline for this sprint?",
                    "Next Friday, so we have 5 days",
                    "That's tight. Should we split into two groups?",
                    "Yes, one for frontend and one for backend",
                    "I can take the frontend with React",
                    "Perfect, I'll handle the database schema",
                    "Don't forget about testing!",
                    "We should write unit tests as we go",
                    "Agreed. What about the documentation?",
                    "I'll document the API endpoints",
                    "Great! Let's have a standup tomorrow morning",
                    "10 AM works for me",
                    "Same here, let's do it on Zoom",
                    "Anyone needs help with their tasks?",
                    "I might need some help with the authentication",
                    "No problem, I can pair with you this afternoon",
                    "Thanks! That would be really helpful",
                    "Alright team, let's crush this sprint!",
                    "💪 Let's go!",
                    "One more thing - code review deadline is Thursday",
                    "Got it, I'll have my PRs ready by Wednesday",
                    "Perfect! This is going to be a great release"
                ]
                
                for msg in test_messages:
                    cur.execute("""
                        INSERT INTO messages (channel_id, sender_id, content, message_type)
                        VALUES (%s, %s, %s, 'text')
                    """, (channel_id, user_id, msg))
                
                conn.commit()
                print(f"[TEST] ✅ Created test channel with {len(test_messages)} messages")
                
                channel = {
                    'id': channel_id,
                    'name': 'Test Summarizer Channel',
                    'message_count': len(test_messages)
                }
            
            print(f"\n[TEST] Testing with channel: '{channel['name']}'")
            print(f"[TEST] Message count: {channel['message_count']}")
            
            # Test summarization
            print("\n[TEST] Generating summary...")
            result = summarizer.summarize_channel(
                channel_id=channel['id'],
                message_count=50,
                user_id=None
            )
            
            if result['success']:
                print("\n" + "=" * 60)
                print("✅ SUMMARY GENERATED SUCCESSFULLY")
                print("=" * 60)
                print(f"\n📊 Message Count: {result['message_count']}")
                print(f"👥 Participants: {', '.join(result['participants'])}")
                print(f"\n🔑 Key Points:")
                for kp in result['key_points']:
                    print(f"   • {kp}")
                print(f"\n📝 Summary:\n")
                print(result['summary'])
                print("\n" + "=" * 60)
                
                # Test retrieval
                print("\n[TEST] Testing summary retrieval...")
                summaries = summarizer.get_recent_summaries(channel['id'], limit=5)
                print(f"[TEST] ✅ Retrieved {len(summaries)} summaries")
                
            else:
                print(f"\n[TEST] ❌ Summarization failed: {result.get('error')}")
    
    finally:
        conn.close()
    
    print("\n[TEST] 🎉 Test complete!")

if __name__ == "__main__":
    test_summarizer()
