# Production WSGI entry point
# Must monkey-patch gevent BEFORE importing app (Flask, DBUtils, etc.)
from gevent import monkey
monkey.patch_all()

import os
import sys

# Heavy ML agents are lazy-loaded in agents/__init__.py — startup is fast
from app import app, socketio

port = int(os.environ.get('PORT', 10000))
print(f"[WSGI] Serving on http://0.0.0.0:{port}", flush=True)

# socketio.run() detects gevent (already monkey-patched) and uses
# gevent.pywsgi.WSGIServer with WebSocketHandler automatically
socketio.run(app, host='0.0.0.0', port=port, log_output=True)
