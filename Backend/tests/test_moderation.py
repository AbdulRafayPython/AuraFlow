"""
Test script for Smart Moderation Agent
"""
from agents.moderation import ModerationAgent

def test_moderation():
    """Test the moderation agent"""
    
    print("=" * 60)
    print("🤖 TESTING SMART MODERATION AGENT")
    print("=" * 60)
    
    # Initialize agent
    print("\n[TEST] Initializing Moderation Agent...")
    moderator = ModerationAgent()
    print("[TEST] ✅ Moderation Agent initialized\n")
    
    # Test cases
    test_messages = [
        {
            "text": "Hello everyone! How are you doing today?",
            "description": "Clean message",
            "user_id": 1,
            "channel_id": 1
        },
        {
            "text": "You're such an idiot! Shut up stupid!",
            "description": "Harassment (English)",
            "user_id": 1,
            "channel_id": 1
        },
        {
            "text": "Tum bilkul bewakoof ho! Chup kar!",
            "description": "Harassment (Roman Urdu)",
            "user_id": 1,
            "channel_id": 1
        },
        {
            "text": "This is fucking bullshit! What the hell!",
            "description": "Profanity",
            "user_id": 1,
            "channel_id": 1
        },
        {
            "text": "Saala kutta! Harami kamina!",
            "description": "Profanity (Roman Urdu)",
            "user_id": 1,
            "channel_id": 1
        },
        {
            "text": "I hate those people! They should all die!",
            "description": "Hate speech",
            "user_id": 1,
            "channel_id": 1
        },
        {
            "text": "BUYYYYY NOWWWWW!!!! CLICKKK HEREEEE!!!!! 🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥",
            "description": "Spam (caps + emojis)",
            "user_id": 1,
            "channel_id": 1
        },
        {
            "text": "My phone is 555-123-4567 and email is test@example.com",
            "description": "Personal information",
            "user_id": 1,
            "channel_id": 1
        },
        {
            "text": "Check this out: http://spam.com http://spam2.com http://spam3.com http://spam4.com",
            "description": "Link spam",
            "user_id": 1,
            "channel_id": 1
        },
        {
            "text": "Yaar kya baat hai! Bahut achha lag raha hai 😊",
            "description": "Casual Roman Urdu (safe)",
            "user_id": 1,
            "channel_id": 1
        }
    ]
    
    # Test each message
    for i, test in enumerate(test_messages, 1):
        print(f"[TEST {i}] {test['description']}")
        print(f"Message: {test['text']}")
        
        result = moderator.moderate_message(
            test['text'], 
            test['user_id'], 
            test['channel_id']
        )
        
        print(f"Action: {result['action'].upper()}")
        print(f"Severity: {result['severity']}")
        print(f"Confidence: {result['confidence']}")
        
        if result['reasons']:
            print(f"Reasons: {', '.join(result['reasons'])}")
        
        print(f"Scores:")
        for score_type, score_value in result['scores'].items():
            if score_value > 0:
                print(f"  - {score_type}: {score_value}")
        
        if result['personal_info_detected']:
            print(f"Personal Info: {', '.join(result['personal_info_types'])}")
        
        print()
    
    # Test moderation history
    print("\n[TEST] Testing moderation history...")
    history = moderator.get_user_moderation_history(1, limit=5)
    print(f"✅ Retrieved {len(history)} moderation records\n")
    
    for i, record in enumerate(history, 1):
        print(f"Record {i}:")
        print(f"  Message: {record['message'][:50]}...")
        print(f"  Action: {record['action']}")
        print(f"  Timestamp: {record['created_at']}")
    
    print("\n" + "=" * 60)
    print("✅ MODERATION AGENT TESTING COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    test_moderation()
