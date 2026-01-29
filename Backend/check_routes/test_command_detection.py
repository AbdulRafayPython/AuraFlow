"""
Quick test to verify command detection works
"""

def test_command_detection():
    """Test command detection logic"""
    
    print("=" * 60)
    print("🤖 TESTING COMMAND DETECTION")
    print("=" * 60)
    
    test_messages = [
        "/summarize",
        "/summarize 50",
        "/help",
        "Hello world",
        " /summarize",  # with leading space
        "/unknown",
    ]
    
    for msg in test_messages:
        is_command = msg.strip().startswith('/')
        print(f"Message: '{msg}'")
        print(f"Is command: {is_command}")
        
        if is_command:
            parts = msg.strip().split()
            command = parts[0].lower()
            args = parts[1:] if len(parts) > 1 else []
            print(f"  Command: {command}")
            print(f"  Args: {args}")
        print()

if __name__ == '__main__':
    test_command_detection()
