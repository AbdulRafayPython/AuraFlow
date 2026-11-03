"""Agent marketplace: the snapshot that is shared, publishing, browsing and installing."""
from __future__ import annotations

import datetime
import json

import pytest
from flask import Flask
from flask_jwt_extended import JWTManager, create_access_token

from runtime_fakes import make_db  # noqa: F401  (pytest fixture)
from agents.runtime import builder, marketplace
from agents.runtime.builder import BuilderError
from agents.runtime.definitions import AgentDefinition, TriggerDef
from routes import agent_builder as ab
from routes import agent_marketplace as am

LID = "listing-1"


def defn(**kw):
    base = dict(
        id=5, public_id="pub-5", bot_user_id=505, bot_username="faq_bot", name="FAQ Bot", owner_user_id=7,
        community_id=3, status="active", instructions="Answer fee questions kindly.", model_tier="smart",
        tools=("search_knowledge", "post_message", "mcp_notion_search", "not_a_tool"),
        permissions={"channel_ids": [11, 12]}, avatar_url="/uploads/x.png",
        triggers=(TriggerDef(id=1, type="mention"),
                  TriggerDef(id=2, type="keyword", config={"keywords": ["fees"]}),
                  TriggerDef(id=3, type="schedule", channel_id=11, config={"every": "daily"}),
                  TriggerDef(id=4, type="channel_message", channel_id=11),
                  TriggerDef(id=5, type="member_joined", enabled=False)))
    base.update(kw)
    return AgentDefinition(**base)


def listing_row(**kw):
    base = dict(id=1, public_id=LID, source_agent_id=5, publisher_user_id=7, title="Fee helper",
                description="Answers fee questions", category="support", status="published", installs=3,
                publisher_username="sarah", updated_at=datetime.datetime(2026, 10, 29, 9, 0),
                snapshot=json.dumps({"name": "FAQ Bot", "instructions": "Answer fee questions kindly.",
                                     "model_tier": "smart", "tools": ["search_knowledge"],
                                     "triggers": [{"type": "mention"},
                                                  {"type": "keyword", "config": {"keywords": ["fees"]}}]}))
    base.update(kw)
    return base


# ── snapshot and validation ─────────────────────────────────────────────

def test_the_snapshot_shares_the_recipe_and_nothing_private():
    snap = marketplace.build_snapshot(defn())
    assert snap == {"name": "FAQ Bot", "instructions": "Answer fee questions kindly.", "model_tier": "smart",
                    "tools": ["search_knowledge", "post_message"],
                    "triggers": [{"type": "mention"}, {"type": "keyword", "config": {"keywords": ["fees"]}}],
                    "connections": []}
    text = json.dumps(snap)
    assert "uploads" not in text and "11" not in text and "channel" not in text


def test_validate_listing_accepts_good_input_and_defaults_the_category():
    clean, errors = marketplace.validate_listing({"title": " Fee helper ", "description": "x"})
    assert errors == [] and clean == {"title": "Fee helper", "description": "x", "category": "other", "tagline": "",
                                      "overview": None, "icon_url": None, "banner_url": None}


@pytest.mark.parametrize("data, fragment", [
    ({"title": "x"}, "title"), ({"title": "ok title", "description": "d" * 301}, "description"),
    ({"title": "ok title", "category": "weapons"}, "category")])
def test_validate_listing_rejects_bad_input(data, fragment):
    _, errors = marketplace.validate_listing(data)
    assert errors and fragment in errors[0]


def test_public_view_hides_ids_of_people_and_marks_my_own():
    view = marketplace.public_view(listing_row(), viewer_id=7)
    assert view["mine"] is True and view["publisher"] == "sarah" and view["triggers"] == ["mention", "keyword"]
    assert view["updated_at"] == "2026-10-29T09:00:00Z"
    assert marketplace.public_view(listing_row(), viewer_id=8)["mine"] is False
    assert "publisher_user_id" not in view and "source_agent_id" not in view


def test_a_broken_snapshot_reads_as_empty():
    assert marketplace.snapshot_of({"snapshot": "not json"}) == {}
    assert marketplace.snapshot_of({"snapshot": "[1]"}) == {}


# ── database operations ─────────────────────────────────────────────────

CLEAN = {"title": "Fee helper", "description": "d", "category": "support"}


def test_publishing_creates_one_listing(make_db):
    _, cur = make_db([("SELECT public_id FROM agent_listings", None)], [])
    pid = marketplace.publish(cur, defn(), 7, CLEAN)
    sql, params = cur.sql_containing("INSERT INTO agent_listings")[0]
    assert params[0] == pid and params[1:3] == (5, 7) and "search_knowledge" in params[-1]


def test_publishing_again_updates_the_same_listing(make_db):
    _, cur = make_db([("SELECT public_id FROM agent_listings", {"public_id": LID})], [])
    assert marketplace.publish(cur, defn(), 7, CLEAN) == LID
    assert cur.sql_containing("INSERT INTO agent_listings") == []
    assert "status = 'published'" in cur.sql_containing("UPDATE agent_listings")[0][0]


def test_the_builtin_agent_and_empty_agents_cannot_be_listed(make_db):
    _, cur = make_db([], [])
    with pytest.raises(BuilderError, match="built-in"):
        marketplace.publish(cur, defn(template_key="aura"), 7, CLEAN)
    with pytest.raises(BuilderError, match="instructions"):
        marketplace.publish(cur, defn(instructions=""), 7, CLEAN)


def test_browse_shows_published_listings_with_escaped_search(make_db):
    _, cur = make_db([("FROM agent_listings l", [listing_row()])], [])
    out = marketplace.browse(cur, viewer_id=8, query="100%_off", category="support", limit=500)
    sql, params = cur.executed[0]
    assert "l.status = 'published'" in sql and "l.category = %s" in sql
    assert params[0] == 8 and params[1] == "support" and params[2] == r"%100\%\_off%" and params[-2:] == (marketplace.MAX_PAGE, 0)
    assert out[0]["id"] == LID


def test_browse_mine_lists_my_own_including_unpublished(make_db):
    _, cur = make_db([("FROM agent_listings l", [])], [])
    marketplace.browse(cur, viewer_id=7, mine=True)
    sql, params = cur.executed[0]
    assert "publisher_user_id = %s" in sql and "status = 'published'" not in sql and params[:2] == (7, 7)


def test_install_fields_only_keep_tools_that_still_exist():
    row = listing_row(snapshot=json.dumps({"name": "N", "instructions": "Do the thing well.",
                                           "tools": ["search_knowledge", "gone_tool"], "triggers": [{"type": "mention"}]}))
    fields, triggers = marketplace.install_fields(row, name="Mine")
    assert fields["name"] == "Mine" and fields["tools"] == ["search_knowledge"] and triggers == [{"type": "mention"}]


# ── routes ──────────────────────────────────────────────────────────────

class Env:
    pass


@pytest.fixture
def api(monkeypatch, make_db):
    env = Env()
    env.row = listing_row()
    env.defn = defn()
    env.conn, env.cur = make_db([], ["routes.agent_builder"])
    monkeypatch.setattr(ab, "get_user_id", lambda name, cur: 7)
    monkeypatch.setattr(ab, "get_definition_by_public_id", lambda pid: env.defn if pid == "pub-5" else None)
    monkeypatch.setattr(ab, "get_community_public_id_for", lambda cid: f"comm-{cid}")
    monkeypatch.setattr(ab, "get_community_id_from_public_id", lambda pid: 3 if pid == "comm-3" else None)
    monkeypatch.setattr(am, "get_definition_by_public_id", lambda pid: env.defn)
    monkeypatch.setattr(am, "invalidate_cache", lambda: None)
    monkeypatch.setattr(builder, "can_manage", lambda cur, uid, d: True)
    monkeypatch.setattr(builder, "can_view", lambda cur, uid, d: True)
    monkeypatch.setattr(builder, "can_create", lambda cur, uid, cid: True)
    monkeypatch.setattr(builder, "check_quota", lambda cur, uid, cid: None)
    monkeypatch.setattr(builder, "is_system_admin", lambda cur, uid: False)
    monkeypatch.setattr(builder, "channel_checker", lambda cur, uid, cid: (lambda ch: True))
    monkeypatch.setattr(marketplace, "get_listing", lambda cur, pid, viewer_id=0: env.row if pid == LID else None)
    env.created, env.installs = {}, []

    def fake_create(cur, **kw):
        env.created.update(kw)
        return 9, "pub-5"
    monkeypatch.setattr(builder, "create_agent", fake_create)
    monkeypatch.setattr(marketplace, "count_install", lambda cur, row: env.installs.append(row["id"]))

    app = Flask(__name__)
    app.config.update(JWT_SECRET_KEY="test-secret-key-for-unit-tests-123456", TESTING=True)
    JWTManager(app)
    app.register_blueprint(am.agent_marketplace_bp)
    with app.app_context():
        token = create_access_token(identity="sarah")
    env.http, env.headers = app.test_client(), {"Authorization": f"Bearer {token}"}
    env.call = lambda method, path, **kw: getattr(env.http, method)(
        "/api/agent-marketplace" + path, headers=env.headers, **kw)
    return env


def test_every_endpoint_needs_a_token(api):
    for method, path in [("get", "/categories"), ("get", "/listings"), ("get", f"/listings/{LID}"),
                         ("post", "/agents/pub-5/listing"), ("delete", f"/listings/{LID}"),
                         ("post", f"/listings/{LID}/install")]:
        assert getattr(api.http, method)("/api/agent-marketplace" + path).status_code == 401, path


def test_blueprint_is_registered_in_app_py():
    from pathlib import Path
    source = (Path(__file__).resolve().parents[4] / "app.py").read_text(encoding="utf-8")
    assert "app.register_blueprint(agent_marketplace_bp)" in source


def test_categories(api):
    assert api.call("get", "/categories").get_json()["categories"] == list(marketplace.CATEGORIES)


def test_get_listing_and_hidden_unpublished_ones(api):
    assert api.call("get", f"/listings/{LID}").get_json()["title"] == "Fee helper"
    api.row = listing_row(status="unpublished", publisher_user_id=8)
    assert api.call("get", f"/listings/{LID}").status_code == 404           # not mine, not public
    api.row = listing_row(status="unpublished", publisher_user_id=7)
    assert api.call("get", f"/listings/{LID}").status_code == 200           # my own is still visible to me
    assert api.call("get", "/listings/nope").status_code == 404


def test_browse_validates_paging(api):
    assert api.call("get", "/listings?limit=abc").status_code == 400


def test_publish_validates_then_lists_the_agent(api, monkeypatch):
    assert api.call("post", "/agents/pub-5/listing", json={"title": "x"}).status_code == 400
    monkeypatch.setattr(marketplace, "publish", lambda cur, d, uid, clean: LID)
    r = api.call("post", "/agents/pub-5/listing", json={"title": "Fee helper", "category": "support"})
    assert r.status_code == 200 and r.get_json()["id"] == LID and api.conn.commits == 1


def test_the_builtin_agent_cannot_be_published(api):
    api.defn = defn(template_key="aura")
    assert api.call("post", "/agents/pub-5/listing", json={"title": "Aura copy"}).status_code == 403


def test_only_the_publisher_or_an_admin_can_remove_a_listing(api, monkeypatch):
    api.row = listing_row(publisher_user_id=8)
    assert api.call("delete", f"/listings/{LID}").status_code == 403
    monkeypatch.setattr(builder, "is_system_admin", lambda cur, uid: True)
    assert api.call("delete", f"/listings/{LID}").status_code == 200
    api.row = listing_row(publisher_user_id=7)
    monkeypatch.setattr(builder, "is_system_admin", lambda cur, uid: False)
    assert api.call("delete", f"/listings/{LID}").get_json() == {"ok": True}
    assert any("status = 'unpublished'" in sql for sql, _ in api.cur.executed)


def test_install_creates_a_draft_owned_by_the_installer(api):
    r = api.call("post", f"/listings/{LID}/install", json={"community_id": "comm-3", "name": "My Fee Bot"})
    assert r.status_code == 201
    assert api.created["owner_id"] == 7 and api.created["community_id"] == 3 and api.created["template_key"] is None
    assert api.created["fields"]["name"] == "My Fee Bot" and api.created["fields"]["tools"] == ["search_knowledge"]
    assert [t["type"] for t in api.created["triggers"]] == ["mention", "keyword"]
    assert api.installs == [1] and api.conn.commits == 1
    assert r.get_json()["notes"] == []


def test_installing_for_yourself_leaves_out_member_joined(api):
    api.row = listing_row(snapshot=json.dumps({"name": "Welcomer", "instructions": "Welcome people warmly.",
                                               "tools": [], "triggers": [{"type": "member_joined"}, {"type": "mention"}]}))
    r = api.call("post", f"/listings/{LID}/install", json={})
    assert r.status_code == 201 and "member_joined" in r.get_json()["notes"][0]
    assert [t["type"] for t in api.created["triggers"]] == ["mention"]


def test_install_needs_permission_and_a_live_listing(api, monkeypatch):
    monkeypatch.setattr(builder, "can_create", lambda cur, uid, cid: False)
    assert api.call("post", f"/listings/{LID}/install", json={"community_id": "comm-3"}).status_code == 403
    monkeypatch.setattr(builder, "can_create", lambda cur, uid, cid: True)
    api.row = listing_row(status="unpublished", publisher_user_id=7)
    assert api.call("post", f"/listings/{LID}/install", json={}).status_code == 410
    assert api.created == {} and api.installs == []


def test_install_respects_the_quota(api, monkeypatch):
    def full(cur, uid, cid):
        raise BuilderError("You already have the maximum of 5 agents. Archive one first.", 409)
    monkeypatch.setattr(builder, "check_quota", full)
    assert api.call("post", f"/listings/{LID}/install", json={}).status_code == 409
    assert api.created == {}


def test_a_listing_that_became_invalid_is_not_installed(api):
    api.row = listing_row(snapshot=json.dumps({"name": "X", "instructions": "short", "tools": [], "triggers": []}))
    r = api.call("post", f"/listings/{LID}/install", json={})
    assert r.status_code == 409 and r.get_json()["details"]
    assert api.created == {}


# ── ratings ─────────────────────────────────────────────────────────────

def test_ratings_show_the_average_the_count_and_my_own(make_db):
    _, cur = make_db([("FROM agent_listings l", [listing_row(rating_avg=4.333, rating_count=3, my_rating=5)])], [])
    [listing] = marketplace.browse(cur, viewer_id=8)
    assert (listing["rating"], listing["rating_count"], listing["my_rating"]) == (4.3, 3, 5)
    _, cur = make_db([("FROM agent_listings l", [listing_row(rating_avg=None, rating_count=0, my_rating=None)])], [])
    [listing] = marketplace.browse(cur, viewer_id=8)
    assert (listing["rating"], listing["rating_count"], listing["my_rating"]) == (None, 0, None)


@pytest.mark.parametrize("sort, fragment", [("top_rated", "rs.avg_stars DESC"), ("newest", "ORDER BY l.id DESC"),
                                            ("popular", "l.installs DESC"), ("; DROP TABLE x", "l.installs DESC")])
def test_listings_can_be_sorted_but_only_by_known_orders(make_db, sort, fragment):
    _, cur = make_db([("FROM agent_listings l", [])], [])
    marketplace.browse(cur, viewer_id=8, sort=sort)
    sql = cur.executed[0][0]
    assert fragment in sql and "DROP" not in sql


def test_a_rating_is_stored_once_per_person_and_can_change(make_db):
    _, cur = make_db([], [])
    marketplace.rate(cur, listing_row(), 8, 4)
    sql, params = cur.sql_containing("INSERT INTO agent_listing_ratings")[0]
    assert "ON DUPLICATE KEY UPDATE" in sql and params == (1, 8, 4)


@pytest.mark.parametrize("stars", [0, 6, -1, 3.5, "5", True, None])
def test_stars_must_be_a_whole_number_from_1_to_5(make_db, stars):
    _, cur = make_db([], [])
    with pytest.raises(BuilderError, match="1 to 5"):
        marketplace.rate(cur, listing_row(), 8, stars)
    assert cur.executed == []


def test_you_cannot_rate_your_own_or_a_removed_listing(make_db):
    _, cur = make_db([], [])
    with pytest.raises(BuilderError, match="your own"):
        marketplace.rate(cur, listing_row(publisher_user_id=8), 8, 5)
    with pytest.raises(BuilderError, match="no longer"):
        marketplace.rate(cur, listing_row(status="unpublished"), 8, 5)
    assert cur.executed == []


def test_a_rating_can_be_taken_back(make_db):
    _, cur = make_db([], [], rowcount=1)
    assert marketplace.clear_rating(cur, listing_row(), 8) is True
    assert cur.executed[0][1] == (1, 8)
    _, cur = make_db([], [], rowcount=0)
    assert marketplace.clear_rating(cur, listing_row(), 8) is False


def test_rating_over_http(api):
    api.row = listing_row(publisher_user_id=8, rating_avg=4.0, rating_count=1, my_rating=4)
    r = api.call("put", f"/listings/{LID}/rating", json={"stars": 4})
    assert r.status_code == 200 and r.get_json()["my_rating"] == 4 and r.get_json()["rating"] == 4.0 and api.conn.commits == 1
    assert api.call("put", f"/listings/{LID}/rating", json={"stars": 9}).status_code == 400
    assert api.call("put", f"/listings/{LID}/rating", json={}).status_code == 400
    api.row = listing_row(publisher_user_id=7)
    assert api.call("put", f"/listings/{LID}/rating", json={"stars": 5}).status_code == 403     # my own listing
    api.row = listing_row(publisher_user_id=8, status="unpublished")
    assert api.call("put", f"/listings/{LID}/rating", json={"stars": 5}).status_code == 404     # hidden from me
    assert api.call("put", "/listings/nope/rating", json={"stars": 5}).status_code == 404


def test_taking_a_rating_back_over_http(api):
    api.row = listing_row(publisher_user_id=8)
    assert api.call("delete", f"/listings/{LID}/rating").status_code == 200
    assert any("DELETE FROM agent_listing_ratings" in sql for sql, _ in api.cur.executed)
    assert api.http.delete(f"/api/agent-marketplace/listings/{LID}/rating").status_code == 401


# ── listing look (persona, banner, tagline, overview) and MCP connection names ──

def test_the_snapshot_lists_mcp_server_names_only():
    snap = marketplace.build_snapshot(defn(), ["HubSpot", "Notion", "HubSpot", ""])
    assert snap["connections"] == [{"kind": "mcp", "name": "HubSpot"}, {"kind": "mcp", "name": "Notion"}]
    assert "mcp_notion_search" not in snap["tools"]


@pytest.mark.parametrize("field, value, ok", [
    ("icon_url", "/agents/personas/support.webp", True),
    ("icon_url", "/uploads/agent-listings/0f8b5c2e-1d2a-4b3c-9d4e-5f6a7b8c9d0e.png", True),
    ("icon_url", "https://evil.example/x.png", False),
    ("icon_url", "/agents/personas/../../etc.webp", False),
    ("banner_url", "/agents/banners/learning.webp", True),
    ("banner_url", "/agents/personas/support.webp", False),
    ("tagline", "t" * 81, False),
    ("overview", "o" * 2001, False),
])
def test_validate_listing_checks_the_look(field, value, ok):
    _, errors = marketplace.validate_listing({"title": "ok title", field: value})
    assert (errors == []) is ok


def test_publishing_stores_the_look_and_mcp_names(make_db):
    _, cur = make_db([("FROM agent_mcp_servers", [{"name": "HubSpot"}]),
                      ("SELECT public_id FROM agent_listings", None)], [])
    clean = dict(CLEAN, tagline="Answers fee questions", overview="Long text", icon_url="/agents/personas/support.webp",
                 banner_url="/agents/banners/support.webp")
    marketplace.publish(cur, defn(), 7, clean)
    _, params = cur.sql_containing("INSERT INTO agent_listings")[0]
    assert params[6:10] == ("Answers fee questions", "Long text", "/agents/personas/support.webp",
                            "/agents/banners/support.webp")
    assert json.loads(params[-1])["connections"] == [{"kind": "mcp", "name": "HubSpot"}]
    mcp_sql, mcp_params = cur.sql_containing("FROM agent_mcp_servers")[0]
    assert "url" not in mcp_sql.split("FROM")[0] and mcp_params == (5,)


def test_public_view_includes_the_look_and_connections():
    row = listing_row(tagline="Fees, fast", overview="More", icon_url="/agents/personas/support.webp", banner_url=None,
                      snapshot=json.dumps({"tools": [], "connections": [{"kind": "mcp", "name": "HubSpot"}, {"bad": 1}]}))
    view = marketplace.public_view(row, viewer_id=1)
    assert view["tagline"] == "Fees, fast" and view["icon_url"] == "/agents/personas/support.webp"
    assert view["connections"] == [{"kind": "mcp", "name": "HubSpot"}]


def test_browse_can_filter_to_agents_with_mcp_connections(make_db):
    _, cur = make_db([("FROM agent_listings l", [])], [])
    marketplace.browse(cur, viewer_id=1, connection="mcp")
    sql, _ = cur.executed[0]
    assert "$.connections" in sql
