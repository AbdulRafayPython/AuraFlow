from agents.mood_tracker import MoodTrackerAgent

m = MoodTrackerAgent()

# Test various messages
tests = [
    'Mujhe bohat nuqsan hogaya hai',
    'I am very happy today',
    'Yeh bohat acha hai',
    'This is terrible',
    'Main bohat khush hun',
    'I feel sad and depressed',
    'Mujhe dukh hua',
    'Great work!',
    'hello how are you',
    'shukriya bohat acha',
    'ye galat hai',
    'maza aa gaya'
]

print("=" * 80)
print("MOOD ANALYSIS TEST")
print("=" * 80)

for t in tests:
    r = m.analyze_message(t)
    sentiment = r['sentiment']
    confidence = r['confidence']
    detected = r['detected_words']
    method = r.get('analysis_method', 'lexicon')
    translation = r.get('translation', {}).get('translated_text', '')
    
    print(f"\nInput: {t}")
    print(f"  Sentiment: {sentiment} ({confidence * 100:.0f}% confidence)")
    print(f"  Method: {method}")
    print(f"  Detected: {detected}")
    if translation:
        print(f"  Translation: {translation}")
