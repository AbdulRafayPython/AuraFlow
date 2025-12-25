"""
Test Smart Moderation Agent
Run this script to verify moderation detection works correctly
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from agents.moderation import ModerationAgent

def test_moderation():
    print("="*60)
    print("SMART MODERATION AGENT - TEST SUITE")
    print("="*60)
    
    agent = ModerationAgent()
    
    test_cases = [
        {
            "name": "Clean Message",
            "text": "Hello everyone, how are you doing today?",
            "expected": "allow"
        },
        {
            "name": "Mild Profanity",
            "text": "This is some damn good work!",
            "expected": "warn"
        },
        {
            "name": "Roman Urdu Profanity",
            "text": "Ye kya bakwas hai yaar",
            "expected": "flag/warn"
        },
        {
            "name": "Severe Hate Speech",
            "text": "You're such a terrorist scum, go die",
            "expected": "block"
        },
        {
            "name": "Spam - Repeated Chars",
            "text": "HELLOOOOOOOOO!!!!!!!!",
            "expected": "warn/flag"
        },
        {
            "name": "Spam - Excessive Caps",
            "text": "THIS IS ALL CAPS MESSAGE HELLO WORLD",
            "expected": "warn/flag"
        },
        {
            "name": "Personal Info - Phone",
            "text": "Call me at +92-300-1234567",
            "expected": "flag"
        },
        {
            "name": "Harassment",
            "text": "Shut up idiot, you're worthless",
            "expected": "flag/block"
        },
        {
            "name": "Roman Urdu Harassment",
            "text": "Chup kar bewakoof, nikal yahan se",
            "expected": "flag"
        },
        {
            "name": "Multiple Profanity",
            "text": "This is fucking bullshit damn it",
            "expected": "block"
        }
    ]
    
    print("\nRunning tests...\n")
    
    passed = 0
    failed = 0
    
    for i, test in enumerate(test_cases, 1):
        print(f"\n{i}. {test['name']}")
        print(f"   Text: \"{test['text']}\"")
        print(f"   Expected: {test['expected']}")
        
        result = agent.moderate_message(
            text=test['text'],
            user_id=1,
            channel_id=1
        )
        
        action = result['action']
        severity = result['severity']
        confidence = result['confidence']
        reasons = result.get('reasons', [])
        
        print(f"   Result: {action.upper()} (severity: {severity}, confidence: {confidence})")
        
        if reasons:
            print(f"   Reasons: {', '.join(reasons)}")
        
        # Check if result matches expected (loose matching)
        expected_actions = test['expected'].split('/')
        if action in expected_actions:
            print("   ✅ PASS")
            passed += 1
        else:
            print(f"   ❌ FAIL - Expected {test['expected']}, got {action}")
            failed += 1
    
    print("\n" + "="*60)
    print(f"RESULTS: {passed} passed, {failed} failed out of {len(test_cases)} tests")
    print("="*60)
    
    # Detailed score breakdown for one message
    print("\n" + "="*60)
    print("DETAILED ANALYSIS EXAMPLE")
    print("="*60)
    
    test_msg = "You're a fucking idiot, shut up and die"
    print(f"\nMessage: \"{test_msg}\"")
    
    result = agent.moderate_message(test_msg, 1, 1)
    
    print(f"\nAction: {result['action'].upper()}")
    print(f"Severity: {result['severity']}")
    print(f"Confidence: {result['confidence']}")
    print(f"\nScore Breakdown:")
    print(f"  - Profanity: {result['scores']['profanity']}")
    print(f"  - Hate Speech: {result['scores']['hate_speech']}")
    print(f"  - Harassment: {result['scores']['harassment']}")
    print(f"  - Spam: {result['scores']['spam']}")
    print(f"\nReasons: {', '.join(result.get('reasons', []))}")
    
    if result.get('personal_info_detected'):
        print(f"Personal Info Types: {', '.join(result.get('personal_info_types', []))}")

if __name__ == "__main__":
    test_moderation()
