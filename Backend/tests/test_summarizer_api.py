"""
Test script for Summarizer Agent API endpoints
"""
import requests
import json

BASE_URL = "http://localhost:5000"

def test_summarizer_api():
    """Test the Summarizer Agent API endpoints"""
    
    print("=" * 60)
    print("🧪 TESTING SUMMARIZER API ENDPOINTS")
    print("=" * 60)
    
    # First, login to get JWT token
    print("\n[1] Logging in to get authentication token...")
    login_response = requests.post(f"{BASE_URL}/auth/login", json={
        "username": "abdulrafay",
        "password": "123"
    })
    
    if login_response.status_code != 200:
        print(f"❌ Login failed: {login_response.text}")
        print("\nPlease update the username/password in test_summarizer_api.py")
        return
    
    token = login_response.json()['access_token']
    headers = {"Authorization": f"Bearer {token}"}
    print("✅ Login successful")
    
    # Test 1: Health check
    print("\n[2] Testing health check endpoint...")
    health_response = requests.get(f"{BASE_URL}/agents/health")
    print(f"Status: {health_response.status_code}")
    print(f"Response: {health_response.json()}")
    
    # Test 2: Generate summary for a channel
    print("\n[3] Generating summary for channel...")
    channel_id = 1  # Update with an actual channel ID from your database
    summarize_response = requests.post(
        f"{BASE_URL}/agents/summarize/channel/{channel_id}",
        headers=headers
    )
    
    print(f"Status: {summarize_response.status_code}")
    if summarize_response.status_code == 200:
        result = summarize_response.json()
        print("✅ Summary generated successfully!")
        print(f"\n📊 Summary Details:")
        print(f"   Messages analyzed: {result.get('message_count', 0)}")
        print(f"   Participants: {', '.join(result.get('participants', []))}")
        print(f"\n📝 Summary:\n{result.get('summary', '')}")
        
        if result.get('key_points'):
            print(f"\n🔑 Key Points:")
            for i, point in enumerate(result.get('key_points', []), 1):
                print(f"   {i}. {point}")
    else:
        print(f"❌ Error: {summarize_response.text}")
    
    # Test 3: Get recent summaries for channel
    print(f"\n[4] Fetching recent summaries for channel {channel_id}...")
    summaries_response = requests.get(
        f"{BASE_URL}/agents/summaries/channel/{channel_id}",
        headers=headers,
        params={"limit": 5}
    )
    
    print(f"Status: {summaries_response.status_code}")
    if summaries_response.status_code == 200:
        result = summaries_response.json()
        print(f"✅ Found {result.get('count', 0)} summaries")
        
        for i, summary in enumerate(result.get('summaries', []), 1):
            print(f"\n   Summary #{i}:")
            print(f"   ID: {summary.get('id')}")
            print(f"   Created: {summary.get('created_at')}")
            print(f"   By: {summary.get('created_by')}")
            print(f"   Preview: {summary.get('summary', '')[:100]}...")
    else:
        print(f"❌ Error: {summaries_response.text}")
    
    # Test 4: Get specific summary
    if summaries_response.status_code == 200:
        summaries = summaries_response.json().get('summaries', [])
        if summaries:
            summary_id = summaries[0]['id']
            print(f"\n[5] Fetching specific summary (ID: {summary_id})...")
            
            summary_response = requests.get(
                f"{BASE_URL}/agents/summary/{summary_id}",
                headers=headers
            )
            
            print(f"Status: {summary_response.status_code}")
            if summary_response.status_code == 200:
                result = summary_response.json()
                summary = result.get('summary', {})
                print(f"✅ Summary retrieved")
                print(f"\n   ID: {summary.get('id')}")
                print(f"   Channel: {summary.get('channel_id')}")
                print(f"   Created: {summary.get('created_at')}")
                print(f"   Summary: {summary.get('summary', '')}")
            else:
                print(f"❌ Error: {summary_response.text}")
    
    print("\n" + "=" * 60)
    print("✅ API TESTING COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    try:
        test_summarizer_api()
    except requests.exceptions.ConnectionError:
        print("❌ Error: Could not connect to the backend server")
        print("Make sure the Flask server is running on http://localhost:5000")
    except Exception as e:
        print(f"❌ Error: {e}")
