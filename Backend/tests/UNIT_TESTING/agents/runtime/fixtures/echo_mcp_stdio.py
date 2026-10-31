"""A small MCP server over stdio: newline-delimited JSON-RPC. Used by tests and for local verification."""
import json
import os
import sys
import time

TOOLS = [
    {"name": "echo", "description": "Echo the text back.", "annotations": {"readOnlyHint": True},
     "inputSchema": {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]}},
    {"name": "secret_env", "description": "Report whether application secrets leaked into this process.",
     "annotations": {"readOnlyHint": True}, "inputSchema": {"type": "object", "properties": {}}},
    {"name": "alloc", "description": "Allocate N megabytes and report back.", "annotations": {"readOnlyHint": True},
     "inputSchema": {"type": "object", "properties": {"mb": {"type": "integer"}}}},
    {"name": "save", "description": "Save something.", "inputSchema": {"type": "object", "properties": {"what": {"type": "string"}}}},
]


def reply(request_id, result=None, error=None):
    message = {"jsonrpc": "2.0", "id": request_id}
    message.update({"error": error} if error else {"result": result})
    sys.stdout.write(json.dumps(message) + "\n")
    sys.stdout.flush()


for line in sys.stdin:
    try:
        msg = json.loads(line)
    except ValueError:
        continue
    if "id" not in msg:
        continue
    method, params = msg["method"], msg.get("params") or {}
    sys.stdout.write("this is a log line, not json\n")
    sys.stdout.write(json.dumps({"jsonrpc": "2.0", "method": "notifications/message", "params": {"level": "info"}}) + "\n")
    if method == "initialize":
        reply(msg["id"], {"protocolVersion": "2025-03-26", "capabilities": {"tools": {}, "resources": {}, "prompts": {}}})
    elif method == "resources/list":
        reply(msg["id"], {"resources": [{"uri": "file:///notes/hostel.txt", "name": "Hostel notes", "description": "Rent and rules"},
                                         {"uri": "file:///notes/library.txt", "name": "Library"}]})
    elif method == "resources/read":
        uri = params.get("uri")
        if uri == "file:///notes/hostel.txt":
            reply(msg["id"], {"contents": [{"uri": uri, "mimeType": "text/plain", "text": "Rent is due on the 1st."}]})
        elif uri == "file:///notes/logo.png":
            reply(msg["id"], {"contents": [{"uri": uri, "mimeType": "image/png", "blob": "AAAA"}]})
        else:
            reply(msg["id"], error={"code": -32002, "message": "Resource not found"})
    elif method == "prompts/list":
        reply(msg["id"], {"prompts": [{"name": "summarize", "description": "Summarize a topic",
                                        "arguments": [{"name": "topic", "required": True}, {"name": "style"}]}]})
    elif method == "prompts/get":
        if params.get("name") == "summarize":
            topic = (params.get("arguments") or {}).get("topic", "?")
            reply(msg["id"], {"description": "Summary request", "messages": [
                {"role": "user", "content": {"type": "text", "text": "Please summarize: " + str(topic)}}]})
        else:
            reply(msg["id"], error={"code": -32602, "message": "Unknown prompt"})
    elif method == "tools/list":
        reply(msg["id"], {"tools": TOOLS})
    elif method == "tools/call":
        name, args = params["name"], params.get("arguments") or {}
        if name == "echo":
            reply(msg["id"], {"content": [{"type": "text", "text": "echo: " + str(args.get("text"))}]})
        elif name == "secret_env":
            leaked = [k for k in os.environ if k in ("JWT_SECRET_KEY", "DB_PASSWORD", "DEEPSEEK_API_KEY")]
            reply(msg["id"], {"content": [{"type": "text", "text": "leaked=" + ",".join(leaked) + " keep=" + os.environ.get("KEEP", "")}]})
        elif name == "alloc":
            try:
                blob = bytearray(int(args.get("mb", 1)) * 1024 * 1024)
                reply(msg["id"], {"content": [{"type": "text", "text": f"allocated {len(blob) // (1024 * 1024)} MB"}]})
            except MemoryError:
                reply(msg["id"], {"isError": True, "content": [{"type": "text", "text": "MemoryError"}]})
        elif name == "hang":
            time.sleep(60)
        else:
            reply(msg["id"], {"content": [{"type": "text", "text": "saved"}]})
    else:
        reply(msg["id"], error={"code": -32601, "message": "Method not found"})
