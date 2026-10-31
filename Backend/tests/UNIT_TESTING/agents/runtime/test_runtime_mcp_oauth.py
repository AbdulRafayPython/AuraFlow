"""MCP OAuth login: discovery, PKCE, state, token exchange and refresh, and how it plugs into the MCP client."""
from __future__ import annotations

import base64
import hashlib
import json
import time
from urllib.parse import parse_qs, urlsplit

import pytest

from runtime_fakes import make_db  # noqa: F401  (pytest fixture)
from agents.runtime import mcp, mcp_oauth
from agents.runtime.builder import BuilderError
from agents.runtime.mcp_oauth import OAuthError
from utils import net_guard

SERVER = "https://mcp.example.com/mcp"
CALLBACK = "https://app.example.com/api/agent-builder/mcp/oauth/callback"
AS = "https://auth.example.com"


@pytest.fixture(autouse=True)
def plumbing(monkeypatch):
    monkeypatch.delenv("NET_GUARD_ALLOW_PRIVATE", raising=False)
    monkeypatch.setattr(net_guard.socket, "getaddrinfo", lambda host, port, type=0: [(2, 1, 6, "", ("93.184.216.34", port))])
    monkeypatch.setattr(mcp_oauth, "encrypt", lambda s: "ENC:" + s)
    monkeypatch.setattr(mcp_oauth, "decrypt", lambda s: s[4:] if s.startswith("ENC:") else (_ for _ in ()).throw(ValueError("bad")))


class Reply:
    def __init__(self, status=200, data=None):
        self.status_code = status
        self._data = data if data is not None else {}
        self.content = json.dumps(self._data).encode()

    def json(self):
        if self._data == "garbage":
            raise ValueError("no json")
        return self._data


class Provider:
    """A scripted provider: ``routes`` maps ``(method, url)`` to a Reply (or a callable)."""

    def __init__(self, routes):
        self.routes, self.calls = routes, []

    def _go(self, method, url, **kw):
        self.calls.append((method, url, kw))
        hit = self.routes.get((method, url))
        if hit is None:
            return Reply(404)
        return hit(kw) if callable(hit) else hit

    def get(self, url, **kw):
        return self._go("GET", url, **kw)

    def post(self, url, **kw):
        return self._go("POST", url, **kw)


FULL_DISCOVERY = {
    ("GET", "https://mcp.example.com/.well-known/oauth-protected-resource"): Reply(200, {"authorization_servers": [AS]}),
    ("GET", AS + "/.well-known/oauth-authorization-server"): Reply(200, {
        "authorization_endpoint": AS + "/authorize", "token_endpoint": AS + "/oauth/token",
        "registration_endpoint": AS + "/register", "code_challenge_methods_supported": ["S256"]}),
    ("POST", AS + "/register"): Reply(201, {"client_id": "client-abc"}),
}


# ── PKCE and redirect address ───────────────────────────────────────────

def test_the_pkce_challenge_is_the_s256_of_the_verifier():
    verifier = mcp_oauth.new_verifier()
    expected = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    assert mcp_oauth.challenge_of(verifier) == expected and 43 <= len(verifier) <= 128 and mcp_oauth.new_verifier() != verifier


@pytest.mark.parametrize("uri", [
    "https://evil.example/steal", "javascript:alert(1)", CALLBACK + "?x=1", CALLBACK + "#f", "ftp://app/api/agent-builder/mcp/oauth/callback",
    "https://user:pw@app.example.com/api/agent-builder/mcp/oauth/callback", "", None, "/api/agent-builder/mcp/oauth/callback"])
def test_only_this_apps_callback_is_accepted_as_a_redirect(uri):
    with pytest.raises(OAuthError, match="callback"):
        mcp_oauth.validate_redirect_uri(uri)


def test_the_callback_of_this_app_is_accepted_over_http_and_https():
    assert mcp_oauth.validate_redirect_uri(CALLBACK) == CALLBACK
    local = "http://localhost:8088/api/agent-builder/mcp/oauth/callback"
    assert mcp_oauth.validate_redirect_uri(local) == local


# ── discovery and registration ──────────────────────────────────────────

def test_discovery_follows_the_protected_resource_to_its_authorization_server():
    ep = mcp_oauth.discover(SERVER, Provider(FULL_DISCOVERY))
    assert ep == {"authorization_endpoint": AS + "/authorize", "token_endpoint": AS + "/oauth/token",
                  "registration_endpoint": AS + "/register"}


def test_without_published_metadata_the_usual_endpoints_are_assumed():
    ep = mcp_oauth.discover(SERVER, Provider({}))
    assert ep["authorization_endpoint"] == "https://mcp.example.com/authorize" and ep["token_endpoint"].endswith("/token")
    assert ep["registration_endpoint"].endswith("/register")


def test_a_provider_without_pkce_is_refused():
    routes = dict(FULL_DISCOVERY)
    routes[("GET", AS + "/.well-known/oauth-authorization-server")] = Reply(200, {
        "authorization_endpoint": AS + "/a", "token_endpoint": AS + "/t", "code_challenge_methods_supported": ["plain"]})
    with pytest.raises(OAuthError, match="PKCE"):
        mcp_oauth.discover(SERVER, Provider(routes))


def test_a_provider_pointing_at_a_private_address_is_refused(monkeypatch):
    routes = dict(FULL_DISCOVERY)
    routes[("GET", AS + "/.well-known/oauth-authorization-server")] = Reply(200, {
        "authorization_endpoint": "https://127.0.0.1/a", "token_endpoint": AS + "/t"})
    with pytest.raises(OAuthError, match="private or reserved"):
        mcp_oauth.discover(SERVER, Provider(routes))


def test_the_client_is_registered_without_a_secret_as_a_public_client():
    provider = Provider(FULL_DISCOVERY)
    out = mcp_oauth.register_client(mcp_oauth.discover(SERVER, provider), CALLBACK, provider)
    assert out == {"client_id": "client-abc"}
    body = provider.calls[-1][2]["json"]
    assert body["redirect_uris"] == [CALLBACK] and body["token_endpoint_auth_method"] == "none"
    assert "authorization_code" in body["grant_types"] and "refresh_token" in body["grant_types"]


def test_registration_needs_the_provider_to_offer_it():
    with pytest.raises(OAuthError, match="client id"):
        mcp_oauth.register_client({"registration_endpoint": None}, CALLBACK, Provider({}))
    with pytest.raises(OAuthError, match="did not register"):
        mcp_oauth.register_client({"registration_endpoint": AS + "/register"}, CALLBACK,
                                  Provider({("POST", AS + "/register"): Reply(201, {})}))


# ── starting a login ────────────────────────────────────────────────────

def test_starting_returns_a_pkce_authorization_address_and_remembers_the_state(make_db):
    _, cur = make_db([], [])
    url = mcp_oauth.start(cur, 9, SERVER, {}, 7, CALLBACK, Provider(FULL_DISCOVERY))
    parts = urlsplit(url)
    q = {k: v[0] for k, v in parse_qs(parts.query).items()}
    assert f"{parts.scheme}://{parts.netloc}{parts.path}" == AS + "/authorize"
    assert q["response_type"] == "code" and q["client_id"] == "client-abc" and q["redirect_uri"] == CALLBACK
    assert q["code_challenge_method"] == "S256" and q["resource"] == SERVER and len(q["state"]) >= 40
    insert = cur.sql_containing("INSERT INTO agent_mcp_oauth_states")[0][1]
    assert insert[0] == q["state"] and insert[1:3] == (9, 7) and insert[4] == CALLBACK
    assert mcp_oauth.challenge_of(insert[3]) == q["code_challenge"]            # the stored verifier matches the challenge
    saved = json.loads(cur.sql_containing("UPDATE agent_mcp_servers SET oauth_json")[0][1][0][4:])
    assert saved["client_id"] == "client-abc" and saved["token_endpoint"] == AS + "/oauth/token"


def test_old_unfinished_logins_are_cleaned_up_when_a_new_one_starts(make_db):
    _, cur = make_db([], [])
    mcp_oauth.start(cur, 9, SERVER, {}, 7, CALLBACK, Provider(FULL_DISCOVERY))
    assert "DELETE FROM agent_mcp_oauth_states WHERE created_at <" in cur.executed[0][0]


def test_a_client_the_owner_created_is_used_as_is(make_db):
    _, cur = make_db([], [])
    provider = Provider(FULL_DISCOVERY)
    url = mcp_oauth.start(cur, 9, SERVER, {"client_id": "mine", "manual_client": True}, 7, CALLBACK, provider)
    assert "client_id=mine" in url and not any(c[0] == "POST" for c in provider.calls)       # no registration


def test_a_client_is_registered_again_when_the_sites_address_changes(make_db):
    _, cur = make_db([], [])
    blob = {"client_id": "old", "redirect_uri": "https://other.example.com" + mcp_oauth.CALLBACK_PATH}
    url = mcp_oauth.start(cur, 9, SERVER, blob, 7, CALLBACK, Provider(FULL_DISCOVERY))
    assert "client_id=client-abc" in url


def test_starting_with_a_foreign_redirect_does_nothing(make_db):
    _, cur = make_db([], [])
    with pytest.raises(OAuthError):
        mcp_oauth.start(cur, 9, SERVER, {}, 7, "https://evil.example/cb", Provider(FULL_DISCOVERY))
    assert cur.executed == []


# ── finishing a login ───────────────────────────────────────────────────

def stored_blob(**kw):
    blob = {"client_id": "client-abc", "token_endpoint": AS + "/oauth/token"}
    blob.update(kw)
    return "ENC:" + json.dumps(blob)


def state_row(**kw):
    return dict({"state": "st", "server_id": 9, "code_verifier": "ver", "redirect_uri": CALLBACK,
                 "oauth_json": stored_blob(), "url": SERVER}, **kw)


def test_the_code_is_exchanged_with_the_verifier_and_the_tokens_are_saved_encrypted(make_db):
    _, cur = make_db([("FROM agent_mcp_oauth_states s", state_row())], [])
    seen = {}

    def token(kw):
        seen.update(kw["data"])
        return Reply(200, {"access_token": "AT", "refresh_token": "RT", "expires_in": 3600})
    provider = Provider({("POST", AS + "/oauth/token"): token})
    before = time.time()
    assert mcp_oauth.complete(cur, "st", "the-code", provider) == 9
    assert seen == {"grant_type": "authorization_code", "code": "the-code", "redirect_uri": CALLBACK, "code_verifier": "ver",
                    "resource": SERVER, "client_id": "client-abc"}
    saved = json.loads(cur.sql_containing("UPDATE agent_mcp_servers SET oauth_json")[0][1][0][4:])
    assert saved["access_token"] == "AT" and saved["refresh_token"] == "RT" and before + 3500 < saved["expires_at"] < time.time() + 3700
    assert cur.sql_containing("DELETE FROM agent_mcp_oauth_states WHERE state")        # single use


def test_an_unknown_expired_or_reused_state_is_refused(make_db):
    _, cur = make_db([("FROM agent_mcp_oauth_states s", None)], [])
    with pytest.raises(OAuthError, match="expired or was already used"):
        mcp_oauth.complete(cur, "nope", "code", Provider({}))
    assert "created_at >= DATE_SUB" in cur.executed[0][0]
    assert cur.sql_containing("DELETE FROM agent_mcp_oauth_states WHERE state")


def test_the_state_is_burned_even_when_the_provider_refuses(make_db):
    _, cur = make_db([("FROM agent_mcp_oauth_states s", state_row())], [])
    provider = Provider({("POST", AS + "/oauth/token"): Reply(400, {"error": "invalid_grant", "error_description": "code expired"})})
    with pytest.raises(OAuthError, match="code expired"):
        mcp_oauth.complete(cur, "st", "c", provider)
    assert cur.sql_containing("DELETE FROM agent_mcp_oauth_states WHERE state")
    assert cur.sql_containing("UPDATE agent_mcp_servers SET oauth_json") == []


def test_a_reply_without_an_access_token_is_not_saved(make_db):
    _, cur = make_db([("FROM agent_mcp_oauth_states s", state_row())], [])
    with pytest.raises(OAuthError, match="access token"):
        mcp_oauth.complete(cur, "st", "c", Provider({("POST", AS + "/oauth/token"): Reply(200, {"token_type": "bearer"})}))


def test_a_login_that_was_not_set_up_cannot_be_finished(make_db):
    _, cur = make_db([("FROM agent_mcp_oauth_states s", state_row(oauth_json=stored_blob(client_id="")))], [])
    with pytest.raises(OAuthError, match="not set up"):
        mcp_oauth.complete(cur, "st", "c", Provider({}))


def test_the_client_secret_is_sent_when_there_is_one(make_db):
    _, cur = make_db([("FROM agent_mcp_oauth_states s", state_row(oauth_json=stored_blob(client_secret="shh")))], [])
    seen = {}
    provider = Provider({("POST", AS + "/oauth/token"): lambda kw: seen.update(kw["data"]) or Reply(200, {"access_token": "AT"})})
    mcp_oauth.complete(cur, "st", "c", provider)
    assert seen["client_secret"] == "shh"


# ── using and refreshing the token ──────────────────────────────────────

def test_a_fresh_token_is_used_as_is(make_db):
    _, cur = make_db([], [])
    stored = stored_blob(access_token="AT", expires_at=int(time.time()) + 3600, refresh_token="RT")
    provider = Provider({})
    assert mcp_oauth.bearer_for(cur, 9, stored, provider) == "AT" and provider.calls == [] and cur.executed == []


def test_a_token_about_to_expire_is_refreshed_and_the_new_one_saved(make_db):
    _, cur = make_db([], [])
    stored = stored_blob(access_token="OLD", expires_at=int(time.time()) + 20, refresh_token="RT")
    seen = {}
    provider = Provider({("POST", AS + "/oauth/token"): lambda kw: seen.update(kw["data"]) or Reply(200, {
        "access_token": "NEW", "expires_in": 3600})})
    assert mcp_oauth.bearer_for(cur, 9, stored, provider) == "NEW"
    assert seen == {"grant_type": "refresh_token", "refresh_token": "RT", "client_id": "client-abc"}
    saved = json.loads(cur.sql_containing("UPDATE agent_mcp_servers SET oauth_json")[0][1][0][4:])
    assert saved["access_token"] == "NEW" and saved["refresh_token"] == "RT"        # the old refresh token is kept


def test_an_expired_login_without_a_refresh_token_asks_to_log_in_again(make_db):
    _, cur = make_db([], [])
    with pytest.raises(OAuthError, match="expired"):
        mcp_oauth.bearer_for(cur, 9, stored_blob(access_token="OLD", expires_at=1), Provider({}))


def test_not_logged_in_yet(make_db):
    _, cur = make_db([], [])
    for stored in (None, "", stored_blob(), "garbage"):
        with pytest.raises(OAuthError, match="Not connected"):
            mcp_oauth.bearer_for(cur, 9, stored, Provider({}))
    assert mcp_oauth.is_connected(stored_blob(access_token="x")) and not mcp_oauth.is_connected(stored_blob())


def test_a_provider_that_sends_garbage_or_is_down_gives_a_clean_error(make_db):
    _, cur = make_db([("FROM agent_mcp_oauth_states s", state_row())], [])

    class Down:
        def post(self, *a, **k):
            raise ConnectionError("10.1.2.3 refused")
    with pytest.raises(OAuthError, match="could not be reached") as err:
        mcp_oauth.complete(cur, "st", "c", Down())
    assert "10.1.2.3" not in str(err.value)


# ── how the MCP client uses it ──────────────────────────────────────────

def test_an_oauth_server_calls_with_the_logged_in_token(make_db, monkeypatch):
    _, cur = make_db([], [])
    stored = stored_blob(access_token="AT", expires_at=int(time.time()) + 3600)
    row = {"id": 9, "url": SERVER, "auth_token": None, "oauth_json": stored}
    seen = {}

    class Fake:
        def __init__(self, url, token=None, **kw):
            seen.update(url=url, token=token)
    monkeypatch.setattr(mcp, "McpClient", Fake)
    mcp.make_client(cur, row)
    assert seen == {"url": SERVER, "token": "AT"}


def test_a_server_that_needs_a_login_reports_it_as_an_mcp_error(make_db):
    _, cur = make_db([], [])
    with pytest.raises(mcp.McpError, match="Not connected"):
        mcp.make_client(cur, {"id": 9, "url": SERVER, "oauth_json": stored_blob()})


def test_adding_an_oauth_server_stores_no_token_and_the_owners_own_client(make_db):
    _, cur = make_db([("COUNT(*)", {"n": 0})], [], lastrowid=4)
    mcp.add_server(cur, 5, 7, "Notion", SERVER, "ignored", auth="oauth", client_id=" my-client ", client_secret="shh")
    params = cur.sql_containing("INSERT INTO agent_mcp_servers")[0][1]
    assert params[3] == "http" and params[4] is None                                  # no bearer token
    blob = json.loads(params[5][4:])
    assert blob == {"client_id": "my-client", "manual_client": True, "client_secret": "shh"}
    _, cur = make_db([("COUNT(*)", {"n": 0})], [], lastrowid=4)
    mcp.add_server(cur, 5, 7, "Notion", SERVER, "", auth="oauth")
    assert json.loads(cur.sql_containing("INSERT INTO agent_mcp_servers")[0][1][5][4:]) == {}


def test_an_unknown_auth_kind_is_refused(make_db):
    _, cur = make_db([], [])
    with pytest.raises(BuilderError, match="auth must be"):
        mcp.add_server(cur, 5, 7, "notion", SERVER, "", auth="magic")


def test_the_public_view_says_how_a_server_logs_in_and_never_shows_secrets():
    base = {"id": 1, "name": "n", "url": SERVER, "enabled": 1, "tools_json": None}
    assert mcp.public_view(dict(base, auth_token=None, oauth_json=None), 5)["auth"] == "none"
    assert mcp.public_view(dict(base, auth_token="enc", oauth_json=None), 5)["auth"] == "token"
    view = mcp.public_view(dict(base, auth_token=None, oauth_json=stored_blob(access_token="AT")), 5)
    assert view["auth"] == "oauth" and view["oauth_connected"] is True and "AT" not in json.dumps(view)
    assert mcp.public_view(dict(base, auth_token=None, oauth_json=stored_blob()), 5)["oauth_connected"] is False


def test_starting_oauth_needs_an_oauth_server_of_this_agent(make_db):
    _, cur = make_db([("FROM agent_mcp_servers WHERE id", None)], [])
    with pytest.raises(BuilderError) as err:
        mcp.start_oauth(cur, 5, 99, 7, CALLBACK)
    assert err.value.status == 404
    _, cur = make_db([("FROM agent_mcp_servers WHERE id", {"id": 9, "url": SERVER, "oauth_json": None})], [])
    with pytest.raises(BuilderError, match="does not use OAuth"):
        mcp.start_oauth(cur, 5, 9, 7, CALLBACK)
    _, cur = make_db([("FROM agent_mcp_servers WHERE id", {"id": 9, "url": SERVER, "oauth_json": stored_blob()})], [])
    with pytest.raises(BuilderError, match="callback"):
        mcp.start_oauth(cur, 5, 9, 7, "https://evil.example/x")
