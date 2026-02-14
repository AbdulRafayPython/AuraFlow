# Production WSGI entry point
# 1. Monkey-patch gevent first
from gevent import monkey
monkey.patch_all()

import os
import sys

port = int(os.environ.get('PORT', 10000))

# 2. Bind and start accepting on the port IMMEDIATELY
#    This satisfies Render's port scanner while the heavy app loads
from gevent.pywsgi import WSGIServer

def _loading_app(environ, start_response):
    """Temporary app that responds while the real app loads."""
    start_response('200 OK', [('Content-Type', 'text/plain')])
    return [b'AuroFlow is starting...']

server = WSGIServer(('0.0.0.0', port), _loading_app, log=None)
server.start()  # Non-blocking — starts accepting in a greenlet
print(f"[WSGI] Port {port} bound, loading application...", flush=True)

# 3. Now do the heavy import (torch, transformers, spacy, etc.)
from app import app, socketio

# 4. Swap in the real Flask app and keep serving
print(f"[WSGI] Application loaded, serving on http://0.0.0.0:{port}", flush=True)
server.stop()
server = WSGIServer(('0.0.0.0', port), app, log=sys.stdout)
server.serve_forever()
