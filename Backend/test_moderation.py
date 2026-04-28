"""Quick test script for batch moderation."""
import os
import requests, time

TOKEN = os.getenv('TEST_TOKEN')
if not TOKEN:
    raise SystemExit('Missing TEST_TOKEN environment variable for moderation test script')
HEADERS = {'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json'}
BASE = 'http://localhost:5000/api'
CHANNEL = 40

messages = [
    'Hello everyone how are you',
    'You are such a bastard',
    'I hate you all so much',
    'You are shit and worthless',
    'Go to hell you idiot',
]

print("=== Sending test messages to channel 40 (community 9) ===\n")
for i, msg in enumerate(messages):
    r = requests.post(f'{BASE}/messages/send', headers=HEADERS, json={'content': msg, 'channel_id': CHANNEL})
    resp = r.json()
    status = str(resp.get('message', resp.get('error', '')))
    print(f"  [{i+1}] HTTP {r.status_code} | '{msg}' -> {status[:80]}")
    time.sleep(0.5)

print(f"\n=== All {len(messages)} messages sent ===")
print("Check Celery worker logs for [BATCH_MOD] output.\n")

# Check Redis buffer directly
try:
    import sys
    sys.path.insert(0, '.')
    from services.redis_client import get_redis
    r = get_redis()
    if r:
        buf_key = f'mod:buffer:{CHANNEL}'
        ts_key = f'mod:buffer_ts:{CHANNEL}'
        buf_len = r.llen(buf_key)
        ts_val = r.get(ts_key)
        print(f"Redis buffer status:")
        print(f"  mod:buffer:{CHANNEL} -> {buf_len} messages")
        print(f"  mod:buffer_ts:{CHANNEL} -> {ts_val}")
        if buf_len > 0:
            items = r.lrange(buf_key, 0, -1)
            for item in items:
                print(f"    - {item[:120]}")
    else:
        print("Redis not available")
except Exception as e:
    print(f"Could not check Redis: {e}")
