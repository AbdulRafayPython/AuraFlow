"""
Test script for Mood Tracking Agent
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from agents.mood_tracker import MoodTrackerAgent


def test_mood_tracker():
    """Test the Mood Tracker Agent"""
    
    print("=" * 60)
    print("🧪 TESTING MOOD TRACKING AGENT")
    print("=" * 60)
    
    # Initialize agent
    print("\n[TEST] Initializing Mood Tracker...")
    tracker = MoodTrackerAgent()
    print("[TEST] ✅ Mood Tracker initialized")
    
    # Test 1: Analyze positive Roman Urdu message
    print("\n[TEST] Testing positive Roman Urdu message...")
    message1 = "Yaar aaj bahut maza aaya! Bohat khushi hui tumse milkar. Zabardast din tha! 😊❤️"
    result1 = tracker.analyze_message(message1)
    
    print(f"Message: {message1}")
    print(f"Sentiment: {result1['sentiment']}")
    print(f"Confidence: {result1['confidence']}")
    print(f"Positive words: {result1['positive_count']}")
    print(f"Emojis: {result1['emoji_sentiment']}")
    
    # Test 2: Analyze negative Roman Urdu message
    print("\n[TEST] Testing negative Roman Urdu message...")
    message2 = "Bohat udaas hun aaj. Kuch theek nahi lag raha. Bahut dard hai dil mein 😢💔"
    result2 = tracker.analyze_message(message2)
    
    print(f"Message: {message2}")
    print(f"Sentiment: {result2['sentiment']}")
    print(f"Confidence: {result2['confidence']}")
    print(f"Negative words: {result2['negative_count']}")
    print(f"Emojis: {result2['emoji_sentiment']}")
    
    # Test 3: Analyze mixed message
    print("\n[TEST] Testing mixed sentiment message...")
    message3 = "Kya baat hai! Lekin thora dar bhi lag raha hai. Dekhtay hain kya hota hai 🤔"
    result3 = tracker.analyze_message(message3)
    
    print(f"Message: {message3}")
    print(f"Sentiment: {result3['sentiment']}")
    print(f"Confidence: {result3['confidence']}")
    
    # Test 4: Analyze neutral message
    print("\n[TEST] Testing neutral message...")
    message4 = "Kya tum kal aa rahe ho? Kab milenge? Kahan jana hai?"
    result4 = tracker.analyze_message(message4)
    
    print(f"Message: {message4}")
    print(f"Sentiment: {result4['sentiment']}")
    print(f"Confidence: {result4['confidence']}")
    
    # Test 5: Track user mood (if user exists)
    print("\n[TEST] Testing mood tracking for user...")
    user_id = 1  # Update with actual user ID from your database
    
    print(f"Tracking mood for user {user_id}...")
    mood_result = tracker.track_user_mood(user_id, time_period_hours=168)  # Last week
    
    if mood_result.get('success'):
        print(f"\n✅ MOOD TRACKING SUCCESSFUL")
        print(f"Overall Mood: {mood_result['overall_mood']}")
        print(f"Confidence: {mood_result['confidence']}")
        print(f"Messages Analyzed: {mood_result['message_count']}")
        print(f"Trend: {mood_result['trend']}")
        print(f"\nSentiment Distribution:")
        dist = mood_result['sentiment_distribution']
        print(f"  Positive: {dist['positive']}")
        print(f"  Negative: {dist['negative']}")
        print(f"  Neutral: {dist['neutral']}")
        
        if mood_result.get('dominant_emotions'):
            print(f"\nDominant Emotions: {', '.join(mood_result['dominant_emotions'])}")
    else:
        print(f"❌ Error: {mood_result.get('error')}")
    
    # Test 6: Get mood history
    print("\n[TEST] Testing mood history retrieval...")
    history = tracker.get_mood_history(user_id, limit=5)
    
    print(f"✅ Retrieved {len(history)} mood records")
    for i, mood in enumerate(history, 1):
        print(f"\nRecord {i}:")
        print(f"  Mood: {mood['mood']}")
        print(f"  Confidence: {mood['confidence']}")
        if 'detected_emotions' in mood:
            emotions = mood['detected_emotions']
            if isinstance(emotions, dict):
                if 'trend' in emotions:
                    print(f"  Trend: {emotions['trend']}")
                if 'sentiment_distribution' in emotions:
                    print(f"  Sentiment: {emotions['sentiment_distribution']}")
        print(f"  Created: {mood['created_at']}")
    
    print("\n" + "=" * 60)
    print("✅ MOOD TRACKER TESTING COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    test_mood_tracker()
