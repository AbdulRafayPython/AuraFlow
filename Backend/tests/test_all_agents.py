"""
Comprehensive test script for all AI agents
"""
from agents.focus import FocusAgent
from agents.engagement import EngagementAgent
from agents.wellness import WellnessAgent
from agents.knowledge_builder import KnowledgeBuilderAgent

def test_focus_agent():
    """Test Focus Agent"""
    print("\n" + "=" * 60)
    print("🎯 TESTING FOCUS AGENT")
    print("=" * 60)
    
    focus = FocusAgent()
    print("[TEST] ✅ Focus Agent initialized\n")
    
    # Test focus analysis
    print("[TEST] Analyzing conversation focus for channel 1...")
    result = focus.analyze_focus(channel_id=1, time_period_hours=24)
    
    if result['success']:
        print("✅ FOCUS ANALYSIS SUCCESSFUL")
        print(f"Focus Level: {result['focus_level'].upper()}")
        print(f"Focus Score: {result['focus_score']}")
        print(f"Messages Analyzed: {result['message_count']}")
        print(f"Participants: {result['participant_count']}")
        
        if result['dominant_topics']:
            print("\nDominant Topics:")
            for topic in result['dominant_topics'][:5]:
                print(f"  - {topic['topic']}: {topic['count']} mentions")
        
        print(f"\nTopic Shifts: {result['topic_shifts']}")
        print(f"Recommendation: {result['recommendation']}")
        
        # Test refocus suggestions
        print("\n[TEST] Getting refocus suggestions...")
        suggestions = focus.suggest_refocus(1, result)
        if suggestions['success'] and suggestions['suggestions']:
            print("Suggestions:")
            for sugg in suggestions['suggestions']:
                print(f"  - {sugg}")
    else:
        print(f"❌ Error: {result.get('error')}")
    
    # Test history
    print("\n[TEST] Testing focus history...")
    history = focus.get_focus_history(1, limit=3)
    print(f"✅ Retrieved {len(history)} focus records")


def test_engagement_agent():
    """Test Engagement Agent"""
    print("\n" + "=" * 60)
    print("💬 TESTING ENGAGEMENT AGENT")
    print("=" * 60)
    
    engagement = EngagementAgent()
    print("[TEST] ✅ Engagement Agent initialized\n")
    
    # Test engagement analysis
    print("[TEST] Analyzing engagement for channel 1...")
    result = engagement.analyze_engagement(channel_id=1, time_period_hours=6)
    
    if result['success']:
        print("✅ ENGAGEMENT ANALYSIS SUCCESSFUL")
        print(f"Engagement Level: {result['engagement_level'].upper()}")
        print(f"Engagement Score: {result['engagement_score']}")
        print(f"Messages: {result['message_count']}")
        print(f"Participants: {result['participant_count']}")
        print(f"Avg Messages/User: {result['avg_messages_per_user']}")
        print(f"Silent for: {result['silence_minutes']:.1f} minutes")
        print(f"Participation Balance: {result['participation_balance']:.2f}")
        
        if result['suggestions']:
            print("\nSuggestions:")
            for sugg in result['suggestions']:
                print(f"  Type: {sugg['type']}")
                print(f"  Message: {sugg['message']}")
                print(f"  Reason: {sugg['reason']}\n")
    else:
        print(f"❌ Error: {result.get('error')}")
    
    # Test history
    print("[TEST] Testing engagement history...")
    history = engagement.get_engagement_history(1, limit=3)
    print(f"✅ Retrieved {len(history)} engagement records")


def test_wellness_agent():
    """Test Wellness Agent"""
    print("\n" + "=" * 60)
    print("💚 TESTING WELLNESS AGENT")
    print("=" * 60)
    
    wellness = WellnessAgent()
    print("[TEST] ✅ Wellness Agent initialized\n")
    
    # Test wellness check
    print("[TEST] Checking wellness for user 1...")
    result = wellness.check_user_wellness(user_id=1)
    
    if result['success']:
        print("✅ WELLNESS CHECK SUCCESSFUL")
        print(f"Wellness Level: {result['wellness_level'].upper()}")
        
        if 'metrics' in result:
            print("\nMetrics:")
            metrics = result['metrics']
            print(f"  Messages Today: {metrics.get('messages_today', 0)}")
            print(f"  Active Duration: {metrics.get('active_duration_hours', 0):.2f} hours")
            print(f"  Avg Messages/Hour: {metrics.get('avg_messages_per_hour', 0):.2f}")
            print(f"  Time Since Last: {metrics.get('time_since_last_message_min', 0):.1f} min")
        
        if result.get('concerns'):
            print(f"\nConcerns: {', '.join(result['concerns'])}")
        
        if result.get('suggestions'):
            print("\nSuggestions:")
            for sugg in result['suggestions']:
                print(f"  [{sugg['priority'].upper()}] {sugg['message']}")
        
        # Test wellness activity suggestions
        print("\n[TEST] Getting wellness activity suggestions...")
        activities = wellness.suggest_wellness_activity(1, result)
        if activities['success'] and activities['suggestions']:
            print("Activity Suggestions:")
            for activity in activities['suggestions']:
                print(f"  - {activity}")
    else:
        print(f"❌ Error: {result.get('error')}")
    
    # Test history
    print("\n[TEST] Testing wellness history...")
    history = wellness.get_wellness_history(1, limit=3)
    print(f"✅ Retrieved {len(history)} wellness records")


def test_knowledge_builder():
    """Test Knowledge Builder Agent"""
    print("\n" + "=" * 60)
    print("📚 TESTING KNOWLEDGE BUILDER AGENT")
    print("=" * 60)
    
    kb = KnowledgeBuilderAgent()
    print("[TEST] ✅ Knowledge Builder initialized\n")
    
    # Test knowledge extraction
    print("[TEST] Extracting knowledge from channel 1...")
    result = kb.extract_knowledge(channel_id=1, time_period_hours=24)
    
    if result['success']:
        print("✅ KNOWLEDGE EXTRACTION SUCCESSFUL")
        print(f"Total Items: {result['total_items']}")
        print(f"Knowledge Entries: {len(result['knowledge_entries'])}")
        print(f"Q&A Pairs: {len(result['qa_pairs'])}")
        print(f"Decisions: {len(result['decisions'])}")
        print(f"Resources: {len(result['resources'])}")
        
        if result['knowledge_entries']:
            print("\nKnowledge Entries:")
            for entry in result['knowledge_entries'][:3]:
                print(f"  Topic: {entry['topic']}")
                print(f"  Participants: {', '.join(entry['participants'])}")
                print(f"  Messages: {entry['message_count']}")
                print(f"  Summary: {entry['summary'][:80]}...\n")
        
        if result['qa_pairs']:
            print("Q&A Pairs:")
            for qa in result['qa_pairs'][:2]:
                print(f"  Q: {qa['question'][:60]}...")
                print(f"  A: {qa['answer'][:60]}...")
                print(f"  Asker: {qa['asker']} | Answerer: {qa['answerer']}\n")
        
        if result['decisions']:
            print("Decisions:")
            for dec in result['decisions'][:2]:
                print(f"  - {dec['decision'][:60]}...")
                print(f"    By: {dec['decided_by']}\n")
        
        if result['resources']:
            print("Resources:")
            for res in result['resources'][:3]:
                print(f"  - {res['url']}")
                print(f"    Shared by: {res['shared_by']}\n")
    else:
        print(f"❌ Error: {result.get('error')}")
    
    # Test search
    print("[TEST] Testing knowledge search...")
    search_results = kb.search_knowledge(1, "test", limit=5)
    print(f"✅ Found {len(search_results)} search results")
    
    # Test history
    print("\n[TEST] Testing knowledge history...")
    history = kb.get_knowledge_history(1, limit=3)
    print(f"✅ Retrieved {len(history)} knowledge records")


def main():
    """Run all agent tests"""
    print("\n" + "=" * 60)
    print("🤖 COMPREHENSIVE AI AGENTS TEST SUITE")
    print("=" * 60)
    
    try:
        test_focus_agent()
        test_engagement_agent()
        test_wellness_agent()
        test_knowledge_builder()
        
        print("\n" + "=" * 60)
        print("✅ ALL AGENT TESTS COMPLETED")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
