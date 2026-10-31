"""
Integrations for agents: API keys and outbound webhooks
=======================================================
*API keys* let an outside service act as one agent: post a message in a channel the agent may
use, or ask the agent to run. A key belongs to one agent and acts with the access of the agent's
owner (never more). Only a SHA-256 hash is stored; the key is shown once.

*Webhooks* make AuraFlow call a URL when the agent finishes a run (``run.finished``) or asks for
an approval (``approval.requested``). Calls are signed (``X-AuraFlow-Signature: sha256=<hmac of the
body>``), have a short timeout, never follow redirects and only go to public addresses.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import secrets
import time
from typing import Any, Dict, List, Optional, Tuple

from agents.runtime.builder import BuilderError
from database import get_db_connection
from utils.net_guard import UnsafeURL, check_public_url

log = logging.getLogger(__name__)

KEY_PREFIX = "afk_"
EVENTS = ("run.finished", "approval.requested")
MAX_KEYS_PER_AGENT = 5
MAX_WEBHOOKS_PER_AGENT = 3
MAX_KEY_NAME = 60
WEBHOOK_TIMEOUT = 5
RETRY_DELAYS = (30, 120, 600)      # seconds before attempt 2, 3 and 4
RETRYABLE_STATUSES = (408, 425, 429)
MAX_PUBLIC_TEXT = 2000
PUBLIC_RATE_PER_MIN = 30


# ── API keys ────────────────────────────────────────────────────────────

def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def new_key() -> str:
    return KEY_PREFIX + secrets.token_urlsafe(32)


def create_key(cur: Any, agent_id: int, user_id: int, name: str) -> Tuple[Dict[str, Any], str]:
    """Returns ``(public view, the key itself)``. The key cannot be read again."""
    name = (name or "").strip()
    if not 1 <= len(name) <= MAX_KEY_NAME:
        raise BuilderError(f"name must be 1 to {MAX_KEY_NAME} characters", 400)
    cur.execute("SELECT COUNT(*) AS n FROM agent_api_keys WHERE agent_id = %s AND revoked_at IS NULL", (agent_id,))
    if int((cur.fetchone() or {}).get("n") or 0) >= MAX_KEYS_PER_AGENT:
        raise BuilderError(f"An agent can have at most {MAX_KEYS_PER_AGENT} active keys. Revoke one first.", 409)
    key = new_key()
    cur.execute("INSERT INTO agent_api_keys (agent_id, name, key_prefix, key_hash, created_by) "
                "VALUES (%s, %s, %s, %s, %s)", (agent_id, name, key[:10], hash_key(key), user_id))
    return {"id": cur.lastrowid, "name": name, "prefix": key[:10], "created_at": None,
            "last_used_at": None, "revoked": False}, key


def list_keys(cur: Any, agent_id: int) -> List[Dict[str, Any]]:
    cur.execute("SELECT id, name, key_prefix, created_at, last_used_at, revoked_at FROM agent_api_keys "
                "WHERE agent_id = %s ORDER BY id DESC", (agent_id,))
    return [{"id": r["id"], "name": r["name"], "prefix": r["key_prefix"], "created_at": _iso(r["created_at"]),
             "last_used_at": _iso(r["last_used_at"]), "revoked": r["revoked_at"] is not None}
            for r in cur.fetchall() or []]


def revoke_key(cur: Any, agent_id: int, key_id: int) -> bool:
    cur.execute("UPDATE agent_api_keys SET revoked_at = NOW() WHERE id = %s AND agent_id = %s AND revoked_at IS NULL",
                (key_id, agent_id))
    return cur.rowcount == 1


def find_agent_for_key(cur: Any, key: str) -> Optional[Dict[str, Any]]:
    """The key row (with ``agent_id``) for an active key, else None. Records the use."""
    if not key or not key.startswith(KEY_PREFIX) or len(key) > 100:
        return None
    cur.execute("SELECT id, agent_id FROM agent_api_keys WHERE key_hash = %s AND revoked_at IS NULL", (hash_key(key),))
    row = cur.fetchone()
    if row:
        cur.execute("UPDATE agent_api_keys SET last_used_at = NOW() WHERE id = %s", (row["id"],))
    return row


def bearer_token(header: Optional[str]) -> str:
    parts = (header or "").split(None, 1)
    return parts[1].strip() if len(parts) == 2 and parts[0].lower() == "bearer" else ""


def within_rate(key_id: int, limit: int = PUBLIC_RATE_PER_MIN) -> bool:
    """At most ``limit`` calls a minute per key. Without Redis the limit is not enforced."""
    try:
        from services.redis_client import get_redis
        r = get_redis()
        if r is None:
            return True
        bucket = f"agent_api:rate:{key_id}:{int(time.time() // 60)}"
        n = r.incr(bucket)
        if n == 1:
            r.expire(bucket, 70)
        return n <= limit
    except Exception:  # noqa: BLE001
        return True


# ── webhooks ────────────────────────────────────────────────────────────

def validate_events(events: Any) -> str:
    if events in (None, "", []):
        events = ["run.finished"]
    if not isinstance(events, list) or not events or any(e not in EVENTS for e in events):
        raise BuilderError(f"events must be a list of: {', '.join(EVENTS)}", 400)
    return ",".join(dict.fromkeys(events))


def create_webhook(cur: Any, agent_id: int, user_id: int, url: str, events: Any) -> Tuple[Dict[str, Any], str]:
    try:
        url = check_public_url(url)
    except UnsafeURL as exc:
        raise BuilderError(str(exc), 400)
    joined = validate_events(events)
    cur.execute("SELECT COUNT(*) AS n FROM agent_webhooks WHERE agent_id = %s", (agent_id,))
    if int((cur.fetchone() or {}).get("n") or 0) >= MAX_WEBHOOKS_PER_AGENT:
        raise BuilderError(f"An agent can have at most {MAX_WEBHOOKS_PER_AGENT} webhooks.", 409)
    secret = secrets.token_hex(24)
    cur.execute("INSERT INTO agent_webhooks (agent_id, url, secret, events, created_by) VALUES (%s, %s, %s, %s, %s)",
                (agent_id, url, secret, joined, user_id))
    return {"id": cur.lastrowid, "url": url, "events": joined.split(","), "enabled": True,
            "last_status": None, "last_error": None, "last_at": None}, secret


def list_webhooks(cur: Any, agent_id: int) -> List[Dict[str, Any]]:
    cur.execute("SELECT id, url, events, enabled, last_status, last_error, last_at FROM agent_webhooks "
                "WHERE agent_id = %s ORDER BY id", (agent_id,))
    return [{"id": r["id"], "url": r["url"], "events": (r["events"] or "").split(","), "enabled": bool(r["enabled"]),
             "last_status": r["last_status"], "last_error": r["last_error"], "last_at": _iso(r["last_at"])}
            for r in cur.fetchall() or []]


def delete_webhook(cur: Any, agent_id: int, webhook_id: int) -> bool:
    cur.execute("DELETE FROM agent_webhooks WHERE id = %s AND agent_id = %s", (webhook_id, agent_id))
    return cur.rowcount == 1


def sign(secret: str, body: bytes) -> str:
    return "sha256=" + hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def envelope(event: str, agent_public_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    return {"event": event, "agent_id": agent_public_id, "created_at": int(time.time()), "data": data}


def subscribed(cur: Any, agent_id: int, event: str) -> List[int]:
    cur.execute("SELECT id, events FROM agent_webhooks WHERE agent_id = %s AND enabled = 1", (agent_id,))
    return [r["id"] for r in cur.fetchall() or [] if event in (r["events"] or "").split(",")]


def dispatch(agent_id: int, agent_public_id: str, event: str, data: Dict[str, Any]) -> int:
    """Queue ``event`` for every webhook of the agent that wants it. Never raises. Returns how many."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            ids = subscribed(cur, agent_id, event)
        if not ids:
            return 0
        from tasks.agent_runtime_tasks import deliver_webhook_task
        payload = envelope(event, agent_public_id, data)
        for webhook_id in ids:
            deliver_webhook_task.delay(webhook_id, payload)
        return len(ids)
    except Exception as exc:  # noqa: BLE001
        log.info("[RUNTIME] webhook dispatch failed: %s", exc)
        return 0
    finally:
        if conn:
            conn.close()


def is_retryable(status: Optional[int], reachable: bool) -> bool:
    """Worth another try: the receiver could not be reached, is overloaded (5xx) or asked us to slow down."""
    if status is None:
        return not reachable
    return status >= 500 or status in RETRYABLE_STATUSES


def deliver(cur: Any, webhook_id: int, payload: Dict[str, Any], *, http_post: Any = None) -> Optional[int]:
    """POST one signed event. Records the outcome on the webhook. Returns the HTTP status, if any."""
    return attempt(cur, webhook_id, payload, http_post=http_post)[0]


def attempt(cur: Any, webhook_id: int, payload: Dict[str, Any], *, http_post: Any = None) -> Tuple[Optional[int], bool]:
    """One delivery try. Returns ``(HTTP status or None, should_retry)``.

    A webhook that is gone, switched off or pointed at a forbidden address is never retried; a
    receiver that cannot be reached, answers 5xx / 408 / 425 / 429 is."""
    cur.execute("SELECT id, url, secret, enabled FROM agent_webhooks WHERE id = %s", (webhook_id,))
    hook = cur.fetchone()
    if not hook or not hook["enabled"]:
        return None, False
    status: Optional[int] = None
    error: Optional[str] = None
    unreachable = False
    try:
        url = check_public_url(hook["url"])
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        if http_post is None:
            import requests
            http_post = requests.post
        resp = http_post(url, data=body, timeout=WEBHOOK_TIMEOUT, allow_redirects=False, headers={
            "Content-Type": "application/json", "User-Agent": "AuraFlow-Webhook/1",
            "X-AuraFlow-Event": payload.get("event", ""), "X-AuraFlow-Signature": sign(hook["secret"], body)})
        status = int(resp.status_code)
        if not 200 <= status < 300:
            error = f"The receiver answered HTTP {status}."
    except UnsafeURL as exc:
        error = str(exc)
    except Exception as exc:  # noqa: BLE001
        log.info("[RUNTIME] webhook %s failed: %s", webhook_id, exc)
        error = "The receiver could not be reached."
        unreachable = True
    cur.execute("UPDATE agent_webhooks SET last_status = %s, last_error = %s, last_at = NOW() WHERE id = %s",
                (status, error, webhook_id))
    retry = False if error is None else is_retryable(status, reachable=not unreachable)
    return status, retry


def _iso(value: Any) -> Optional[str]:
    if not hasattr(value, "isoformat"):
        return value
    text = value.isoformat()
    return text if value.tzinfo else text + "Z"
