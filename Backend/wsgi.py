# Production WSGI entry point
# Gevent monkey-patch is done in gunicorn.conf.py (loaded before this module)
# This import-guard ensures it also works when run directly: python wsgi.py
import gevent.monkey
if not gevent.monkey.is_module_patched('os'):
    gevent.monkey.patch_all()

import os
from app import app, socketio

# When run directly (python wsgi.py), use socketio.run()
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    print("=" * 60)
    print("AuroFlow Backend Server Starting (Production)...")
    print(f"Server: http://0.0.0.0:{port}")
    print(f"WebSocket: ws://0.0.0.0:{port}")
    print("=" * 60)
    socketio.run(app, host='0.0.0.0', port=port, debug=False, log_output=True)
