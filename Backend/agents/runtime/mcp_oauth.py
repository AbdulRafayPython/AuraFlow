"""
OAuth login for MCP servers
===========================
Many hosted MCP servers (GitHub, Notion, Google Drive, ...) want a user to log in instead of
pasting a token. This implements the client side of the MCP authorization flow:

* **Discovery:** the server's ``/.well-known/oauth-protected-resource`` names its authorization
  server, whose ``/.well-known/oauth-authorization-server`` (or ``openid-configuration``) lists the
  endpoints. If nothing is published the usual ``/authorize``, ``/token``, ``/register`` are tried.
* **Client:** registered automatically (RFC 7591) when the server supports it; otherwise the
  owner pastes a client id (and secret) they created with the provider.
* **Login:** authorization-code flow with PKCE (S256), a random single-use ``state`` that lives
  10 minutes, and ``resource`` set to the MCP server (RFC 8707).
* **Tokens:** kept encrypted in ``agent_mcp_servers.oauth_json``; the access token is refreshed
  with the refresh token a minute before it expires.

Every URL we call (discovery, registration, token) must be a public https address
(``utils.net_guard``). The callback route has no login of its own: the unguessable ``state`` is
the proof that the person who started the flow is the one coming back.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import secrets
import time
from typing import Any, Callable, Dict, Optional, Tuple
from urllib.parse import urlencode, urlsplit

from utils.encryption import decrypt, encrypt
from utils.net_guard import UnsafeURL, check_public_url

log = logging.getLogger(__name__)

CALLBACK_PATH = "/api/agent-builder/mcp/oauth/callback"
STATE_TTL_MINUTES = 10
EXPIRY_SKEW_SECONDS = 60
TIMEOUT = 15
MAX_BODY_BYTES = 200_000


class OAuthError(Exception):
    """A problem with the login. The message is safe to show to the user."""


# ── stored blob ─────────────────────────────────────────────────────────

def load_blob(stored: Optional[str]) -> Dict[str, Any]:
    if not stored:
        return {}
    try:
        data = json.loads(decrypt(stored))
    except Exception:  # noqa: BLE001
        return {}
    return data if isinstance(data, dict) else {}


def dump_blob(blob: Dict[str, Any]) -> str:
    return encrypt(json.dumps(blob))


def is_connected(stored: Optional[str]) -> bool:
    return bool(load_blob(stored).get("access_token"))


def save_blob(cur: Any, server_id: int, blob: Dict[str, Any]) -> None:
    cur.execute("UPDATE agent_mcp_servers SET oauth_json = %s WHERE id = %s", (dump_blob(blob), server_id))


# ── small http helpers ──────────────────────────────────────────────────

def _http(http: Optional[Callable[..., Any]]) -> Any:
    if http is not None:
        return http
    import requests
    return requests


def _json_of(resp: Any) -> Dict[str, Any]:
    body = resp.content if hasattr(resp, "content") else b""
    if len(body or b"") > MAX_BODY_BYTES:
        raise OAuthError("The provider's reply is too large.")
    try:
        data = resp.json()
    except ValueError:
        raise OAuthError("The provider sent a reply that is not valid JSON.")
    return data if isinstance(data, dict) else {}


def _public(url: str) -> str:
    try:
        return check_public_url(url)
    except UnsafeURL as exc:
        raise OAuthError(str(exc))


def _get_json(http: Any, url: str) -> Optional[Dict[str, Any]]:
    try:
        resp = http.get(_public(url), timeout=TIMEOUT, allow_redirects=False, headers={"Accept": "application/json"})
    except OAuthError:
        raise
    except Exception:  # noqa: BLE001
        return None
    if getattr(resp, "status_code", 0) != 200:
        return None
    try:
        return _json_of(resp)
    except OAuthError:
        return None


def _post(http: Any, url: str, *, data: Optional[Dict[str, str]] = None, body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    kwargs: Dict[str, Any] = {"timeout": TIMEOUT, "allow_redirects": False, "headers": {"Accept": "application/json"}}
    if body is not None:
        kwargs["json"] = body
    else:
        kwargs["data"] = data
    try:
        resp = http.post(_public(url), **kwargs)
    except OAuthError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.info("[RUNTIME] OAuth request failed: %s", exc)
        raise OAuthError("The provider could not be reached.")
    result = _json_of(resp) if resp.status_code < 500 else {}
    if not 200 <= resp.status_code < 300:
        reason = str(result.get("error_description") or result.get("error") or f"HTTP {resp.status_code}")[:160]
        raise OAuthError(f"The provider refused the request: {reason}")
    return result


# ── discovery and registration ──────────────────────────────────────────

def _origin(url: str) -> str:
    parts = urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}"


def discover(server_url: str, http: Optional[Callable[..., Any]] = None) -> Dict[str, Any]:
    """Endpoints of the authorization server behind an MCP server URL."""
    h = _http(http)
    origin = _origin(server_url)
    issuer = origin
    resource = _get_json(h, origin + "/.well-known/oauth-protected-resource") or {}
    servers = resource.get("authorization_servers")
    if isinstance(servers, list) and servers and isinstance(servers[0], str):
        issuer = servers[0].rstrip("/")
    meta = (_get_json(h, issuer + "/.well-known/oauth-authorization-server")
            or _get_json(h, issuer + "/.well-known/openid-configuration") or {})
    endpoints = {
        "authorization_endpoint": meta.get("authorization_endpoint") or issuer + "/authorize",
        "token_endpoint": meta.get("token_endpoint") or issuer + "/token",
        "registration_endpoint": meta.get("registration_endpoint") or (None if meta else issuer + "/register"),
    }
    for key in ("authorization_endpoint", "token_endpoint"):
        _public(endpoints[key])
    methods = meta.get("code_challenge_methods_supported")
    if isinstance(methods, list) and "S256" not in methods:
        raise OAuthError("This provider does not support PKCE (S256), which is required.")
    return endpoints


def register_client(endpoints: Dict[str, Any], redirect_uri: str, http: Optional[Callable[..., Any]] = None) -> Dict[str, str]:
    """Dynamic client registration (RFC 7591). Returns ``{client_id, client_secret?}``."""
    if not endpoints.get("registration_endpoint"):
        raise OAuthError("This provider needs a client id. Create an app with the provider and paste its client id here.")
    reply = _post(_http(http), endpoints["registration_endpoint"], body={
        "client_name": "AuraFlow", "redirect_uris": [redirect_uri], "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"], "token_endpoint_auth_method": "none"})
    if not reply.get("client_id"):
        raise OAuthError("The provider did not register AuraFlow.")
    out = {"client_id": str(reply["client_id"])}
    if reply.get("client_secret"):
        out["client_secret"] = str(reply["client_secret"])
    return out


# ── PKCE and state ──────────────────────────────────────────────────────

def new_verifier() -> str:
    return secrets.token_urlsafe(64)


def challenge_of(verifier: str) -> str:
    return base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).rstrip(b"=").decode("ascii")


def validate_redirect_uri(uri: Any) -> str:
    """The callback of THIS app, as the browser reaches it (scheme://host/api/agent-builder/mcp/oauth/callback)."""
    parts = urlsplit(str(uri or ""))
    if parts.scheme not in ("http", "https") or not parts.netloc or parts.username or parts.password \
            or parts.path != CALLBACK_PATH or parts.query or parts.fragment:
        raise OAuthError("redirect_uri must be this site's MCP callback address.")
    return str(uri)


def start(cur: Any, server_id: int, server_url: str, blob: Dict[str, Any], user_id: int, redirect_uri: str,
          http: Optional[Callable[..., Any]] = None) -> str:
    """Prepare a login and return the address the person must open. Saves discovery results and the client."""
    redirect_uri = validate_redirect_uri(redirect_uri)
    endpoints = discover(server_url, http)
    blob = dict(blob, **{k: v for k, v in endpoints.items() if v})
    # A client the owner created with the provider ("manual_client") keeps its own redirect settings;
    # one we registered is registered again when the address of this site changes.
    if not blob.get("client_id") or (not blob.get("manual_client") and blob.get("redirect_uri") != redirect_uri):
        blob.update(register_client(endpoints, redirect_uri, http))
    blob["redirect_uri"] = redirect_uri
    verifier, state = new_verifier(), secrets.token_urlsafe(32)
    cur.execute("DELETE FROM agent_mcp_oauth_states WHERE created_at < DATE_SUB(NOW(), INTERVAL %s MINUTE)", (STATE_TTL_MINUTES,))
    cur.execute("INSERT INTO agent_mcp_oauth_states (state, server_id, user_id, code_verifier, redirect_uri) "
                "VALUES (%s, %s, %s, %s, %s)", (state, server_id, user_id, verifier, redirect_uri))
    save_blob(cur, server_id, blob)
    query = urlencode({"response_type": "code", "client_id": blob["client_id"], "redirect_uri": redirect_uri,
                       "code_challenge": challenge_of(verifier), "code_challenge_method": "S256", "state": state,
                       "resource": server_url})
    sep = "&" if "?" in blob["authorization_endpoint"] else "?"
    return f"{blob['authorization_endpoint']}{sep}{query}"


def _store_tokens(blob: Dict[str, Any], reply: Dict[str, Any]) -> Dict[str, Any]:
    if not reply.get("access_token"):
        raise OAuthError("The provider did not return an access token.")
    blob = dict(blob, access_token=str(reply["access_token"]))
    if reply.get("refresh_token"):
        blob["refresh_token"] = str(reply["refresh_token"])
    try:
        blob["expires_at"] = int(time.time()) + int(reply["expires_in"]) if reply.get("expires_in") else None
    except (TypeError, ValueError):
        blob["expires_at"] = None
    return blob


def _client_fields(blob: Dict[str, Any]) -> Dict[str, str]:
    fields = {"client_id": blob["client_id"]}
    if blob.get("client_secret"):
        fields["client_secret"] = blob["client_secret"]
    return fields


def complete(cur: Any, state: str, code: str, http: Optional[Callable[..., Any]] = None) -> int:
    """Finish a login from the provider's redirect. Returns the server id."""
    cur.execute("SELECT s.state, s.server_id, s.code_verifier, s.redirect_uri, m.oauth_json, m.url "
                "FROM agent_mcp_oauth_states s JOIN agent_mcp_servers m ON m.id = s.server_id "
                "WHERE s.state = %s AND s.created_at >= DATE_SUB(NOW(), INTERVAL %s MINUTE)", (state, STATE_TTL_MINUTES))
    row = cur.fetchone()
    cur.execute("DELETE FROM agent_mcp_oauth_states WHERE state = %s", (state,))      # single use, even if it fails below
    if not row:
        raise OAuthError("This login link has expired or was already used. Start again.")
    blob = load_blob(row["oauth_json"])
    if not blob.get("token_endpoint") or not blob.get("client_id"):
        raise OAuthError("The login was not set up correctly. Start again.")
    reply = _post(_http(http), blob["token_endpoint"], data={
        "grant_type": "authorization_code", "code": code, "redirect_uri": row["redirect_uri"],
        "code_verifier": row["code_verifier"], "resource": row["url"], **_client_fields(blob)})
    save_blob(cur, row["server_id"], _store_tokens(blob, reply))
    return int(row["server_id"])


def bearer_for(cur: Any, server_id: int, stored: Optional[str], http: Optional[Callable[..., Any]] = None,
               now: Optional[float] = None) -> str:
    """A current access token, refreshed (and saved) when it is about to expire."""
    blob = load_blob(stored)
    if not blob.get("access_token"):
        raise OAuthError("Not connected yet. Press Connect to log in.")
    expires_at = blob.get("expires_at")
    if expires_at and (now if now is not None else time.time()) >= expires_at - EXPIRY_SKEW_SECONDS:
        if not blob.get("refresh_token"):
            raise OAuthError("The login has expired. Press Connect to log in again.")
        reply = _post(_http(http), blob["token_endpoint"], data={
            "grant_type": "refresh_token", "refresh_token": blob["refresh_token"], **_client_fields(blob)})
        blob = _store_tokens(blob, reply)
        save_blob(cur, server_id, blob)
    return blob["access_token"]
