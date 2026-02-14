# Production entry point — eventlet monkey-patch BEFORE any other imports
import eventlet
eventlet.monkey_patch()

import os
from app import app, socketio

port = int(os.environ.get('PORT', 5000))

print("=" * 60)
print("AuroFlow Backend Server Starting (Production)...")
print(f"Server: http://0.0.0.0:{port}")
print(f"WebSocket: ws://0.0.0.0:{port}")
print("=" * 60)

socketio.run(app, host='0.0.0.0', port=port, debug=False, log_output=True)
