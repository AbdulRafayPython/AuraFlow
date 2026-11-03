"""
Agent marketplace
=================
Publish an agent's recipe as a listing; install a listing as a new draft agent.

What is shared is a *snapshot* (instructions, tools, model tier, and mention / keyword /
member_joined triggers) taken at publish time. Knowledge files, channels, the avatar and the
community are never shared, so installing cannot leak anyone's data. Tools that depend on a
connection someone configured (``mcp_*``) are left out of the snapshot; only the *names* of the
MCP servers the agent uses are listed (``connections``), so people know what they will need to
connect themselves. URLs and tokens never leave the agent.

A listing also carries its own look and copy: a persona avatar (``icon_url``), a banner, a
one-line ``tagline`` and a longer ``overview``.

Everything that decides *whether* is here (and testable without HTTP); the blueprint in
``routes/agent_marketplace.py`` is thin.
"""

from __future__ import annotations

import json
import re
import uuid
from typing import Any, Dict, List, Optional, Tuple

from agents.runtime.builder import (
    MAX_DESCRIPTION, MAX_NAME, MIN_NAME, BuilderError, allowed_tool_names)
from agents.runtime.definitions import AgentDefinition

CATEGORIES = ("support", "community", "productivity", "learning", "fun", "other")
SHAREABLE_TRIGGERS = ("mention", "keyword", "member_joined")
MAX_PAGE = 50
MAX_TAGLINE = 80
MAX_OVERVIEW = 2000

# Listing images: one of the bundled gallery files, or an upload made through
# POST /api/agent-marketplace/listings/media.
_ICON_RE = re.compile(r"^(/agents/personas/[a-z0-9-]{1,40}\.webp|/uploads/agent-listings/[a-f0-9-]{36}\.(png|jpe?g|gif|webp))$")
_BANNER_RE = re.compile(r"^(/agents/banners/[a-z0-9-]{1,40}\.webp|/uploads/agent-listings/[a-f0-9-]{36}\.(png|jpe?g|gif|webp))$")


# ── snapshot ────────────────────────────────────────────────────────────

def build_snapshot(defn: AgentDefinition, mcp_server_names: Optional[List[str]] = None) -> Dict[str, Any]:
    known = set(allowed_tool_names())
    triggers = []
    for t in defn.triggers:
        if t.enabled and t.type in SHAREABLE_TRIGGERS:
            item: Dict[str, Any] = {"type": t.type}
            if t.type == "keyword" and (t.config or {}).get("keywords"):
                item["config"] = {"keywords": list(t.config["keywords"])}
            triggers.append(item)
    return {
        "name": defn.name, "instructions": defn.instructions, "model_tier": defn.model_tier,
        "tools": [t for t in defn.tools if t in known and not t.startswith("mcp_")],
        "triggers": triggers,
        "connections": [{"kind": "mcp", "name": n} for n in dict.fromkeys(mcp_server_names or []) if n],
    }


def snapshot_of(row: Dict[str, Any]) -> Dict[str, Any]:
    value = row.get("snapshot")
    if isinstance(value, (str, bytes)):
        try:
            value = json.loads(value)
        except ValueError:
            value = {}
    return value if isinstance(value, dict) else {}


# ── validation ──────────────────────────────────────────────────────────

def validate_listing(data: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    errors: List[str] = []
    title = str(data.get("title") or "").strip()
    if not MIN_NAME <= len(title) <= MAX_NAME:
        errors.append(f"title must be {MIN_NAME} to {MAX_NAME} characters")
    description = str(data.get("description") or "").strip()
    if len(description) > MAX_DESCRIPTION:
        errors.append(f"description must be at most {MAX_DESCRIPTION} characters")
    category = data.get("category") or "other"
    if category not in CATEGORIES:
        errors.append(f"category must be one of {list(CATEGORIES)}")
    tagline = str(data.get("tagline") or "").strip()
    if len(tagline) > MAX_TAGLINE:
        errors.append(f"tagline must be at most {MAX_TAGLINE} characters")
    overview = str(data.get("overview") or "").strip()
    if len(overview) > MAX_OVERVIEW:
        errors.append(f"overview must be at most {MAX_OVERVIEW} characters")
    icon_url = data.get("icon_url") or None
    if icon_url is not None and not (isinstance(icon_url, str) and _ICON_RE.match(icon_url)):
        errors.append("icon_url must be a gallery persona or an uploaded image")
    banner_url = data.get("banner_url") or None
    if banner_url is not None and not (isinstance(banner_url, str) and _BANNER_RE.match(banner_url)):
        errors.append("banner_url must be a gallery banner or an uploaded image")
    return {"title": title, "description": description, "category": category, "tagline": tagline,
            "overview": overview or None, "icon_url": icon_url, "banner_url": banner_url}, errors


# ── output ──────────────────────────────────────────────────────────────

def public_view(row: Dict[str, Any], *, viewer_id: Optional[int] = None) -> Dict[str, Any]:
    snap = snapshot_of(row)
    return {
        "id": row["public_id"], "title": row["title"], "description": row["description"] or "",
        "category": row["category"], "status": row["status"], "installs": row["installs"],
        "publisher": row.get("publisher_username"), "mine": viewer_id is not None and row["publisher_user_id"] == viewer_id,
        "instructions": snap.get("instructions", ""), "tools": snap.get("tools", []),
        "model_tier": snap.get("model_tier", "fast"),
        "triggers": [t["type"] for t in snap.get("triggers", [])],
        "connections": [c for c in snap.get("connections", []) if isinstance(c, dict) and c.get("name")],
        "tagline": row.get("tagline") or "", "overview": row.get("overview") or "",
        "icon_url": row.get("icon_url"), "banner_url": row.get("banner_url"),
        "rating": round(float(row["rating_avg"]), 1) if row.get("rating_avg") is not None else None,
        "rating_count": int(row.get("rating_count") or 0),
        "my_rating": int(row["my_rating"]) if row.get("my_rating") is not None else None,
        "updated_at": row["updated_at"].isoformat() + "Z" if hasattr(row.get("updated_at"), "isoformat") else None,
    }


# The first %s is the viewer (for ``my_rating``).
_SELECT = ("SELECT l.id, l.public_id, l.source_agent_id, l.publisher_user_id, l.title, l.description, l.category, "
           "l.tagline, l.overview, l.icon_url, l.banner_url, "
           "l.snapshot, l.status, l.installs, l.updated_at, u.username AS publisher_username, "
           "rs.avg_stars AS rating_avg, COALESCE(rs.n, 0) AS rating_count, mine.stars AS my_rating "
           "FROM agent_listings l JOIN users u ON u.id = l.publisher_user_id "
           "LEFT JOIN (SELECT listing_id, AVG(stars) AS avg_stars, COUNT(*) AS n FROM agent_listing_ratings "
           "GROUP BY listing_id) rs ON rs.listing_id = l.id "
           "LEFT JOIN agent_listing_ratings mine ON mine.listing_id = l.id AND mine.user_id = %s ")

SORTS = {
    "popular": "l.installs DESC, l.id DESC",
    "top_rated": "(rs.avg_stars IS NULL), rs.avg_stars DESC, rs.n DESC, l.installs DESC, l.id DESC",
    "newest": "l.id DESC",
}


# ── reads ───────────────────────────────────────────────────────────────

def get_listing(cur: Any, public_id: str, viewer_id: int = 0) -> Optional[Dict[str, Any]]:
    cur.execute(_SELECT + "WHERE l.public_id = %s", (viewer_id, public_id))
    return cur.fetchone()


def browse(cur: Any, *, viewer_id: int, query: str = "", category: str = "", mine: bool = False,
           sort: str = "popular", limit: int = 24, offset: int = 0, connection: str = "") -> List[Dict[str, Any]]:
    where, params = [], [viewer_id]
    if mine:
        where.append("l.publisher_user_id = %s")
        params.append(viewer_id)
    else:
        where.append("l.status = 'published'")
    if category in CATEGORIES:
        where.append("l.category = %s")
        params.append(category)
    if connection == "mcp":
        where.append("JSON_LENGTH(COALESCE(JSON_EXTRACT(l.snapshot, '$.connections'), JSON_ARRAY())) > 0")
    text = (query or "").strip()[:60]
    if text:
        like = "%" + text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        where.append("(l.title LIKE %s OR l.description LIKE %s)")
        params += [like, like]
    limit = max(1, min(int(limit), MAX_PAGE))
    order = SORTS.get(sort, SORTS["popular"])
    cur.execute(_SELECT + "WHERE " + " AND ".join(where) + f" ORDER BY {order} LIMIT %s OFFSET %s",
                tuple(params + [limit, max(int(offset), 0)]))
    return [public_view(r, viewer_id=viewer_id) for r in cur.fetchall() or []]


# ── ratings ─────────────────────────────────────────────────────────────

def rate(cur: Any, row: Dict[str, Any], user_id: int, stars: Any) -> None:
    """Set the person's 1 to 5 star rating (replacing an earlier one). The publisher cannot rate their own listing."""
    if isinstance(stars, bool) or not isinstance(stars, int) or not 1 <= stars <= 5:
        raise BuilderError("stars must be a whole number from 1 to 5", 400)
    if row["publisher_user_id"] == user_id:
        raise BuilderError("You cannot rate your own listing.", 403)
    if row["status"] != "published":
        raise BuilderError("This listing is no longer available.", 410)
    cur.execute("INSERT INTO agent_listing_ratings (listing_id, user_id, stars) VALUES (%s, %s, %s) "
                "ON DUPLICATE KEY UPDATE stars = VALUES(stars)", (row["id"], user_id, stars))


def clear_rating(cur: Any, row: Dict[str, Any], user_id: int) -> bool:
    cur.execute("DELETE FROM agent_listing_ratings WHERE listing_id = %s AND user_id = %s", (row["id"], user_id))
    return cur.rowcount == 1


# ── writes ──────────────────────────────────────────────────────────────

def publish(cur: Any, defn: AgentDefinition, publisher_id: int, clean: Dict[str, Any]) -> str:
    """Create or update the one listing of ``defn``. Returns its public id."""
    if defn.is_builtin:
        raise BuilderError("The built-in agent cannot be listed.", 403)
    if len(defn.instructions or "") < 10:
        raise BuilderError("Write the agent's instructions before listing it.", 400)
    # Names only: the MCP servers this agent is connected to (never their URL or token).
    cur.execute("SELECT name FROM agent_mcp_servers WHERE agent_id = %s AND enabled = 1 ORDER BY id", (defn.id,))
    mcp_names = [r["name"] for r in (cur.fetchall() or []) if r.get("name")]
    snapshot = json.dumps(build_snapshot(defn, mcp_names), ensure_ascii=False)
    look = (clean.get("tagline", ""), clean.get("overview"), clean.get("icon_url"), clean.get("banner_url"))
    cur.execute("SELECT public_id FROM agent_listings WHERE source_agent_id = %s", (defn.id,))
    existing = cur.fetchone()
    if existing:
        cur.execute("UPDATE agent_listings SET title = %s, description = %s, category = %s, tagline = %s, "
                    "overview = %s, icon_url = %s, banner_url = %s, snapshot = %s, status = 'published' "
                    "WHERE public_id = %s",
                    (clean["title"], clean["description"], clean["category"], *look, snapshot, existing["public_id"]))
        return existing["public_id"]
    public_id = str(uuid.uuid4())
    cur.execute("INSERT INTO agent_listings (public_id, source_agent_id, publisher_user_id, title, description, "
                "category, tagline, overview, icon_url, banner_url, snapshot) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (public_id, defn.id, publisher_id, clean["title"], clean["description"], clean["category"],
                 *look, snapshot))
    return public_id


def unpublish(cur: Any, row: Dict[str, Any]) -> None:
    cur.execute("UPDATE agent_listings SET status = 'unpublished' WHERE id = %s", (row["id"],))


def install_fields(row: Dict[str, Any], name: Optional[str] = None) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """The agent fields and raw triggers for a new draft made from a listing."""
    snap = snapshot_of(row)
    known = set(allowed_tool_names())
    fields = {
        "name": (name or snap.get("name") or row["title"]).strip(),
        "description": row["description"] or "",
        "instructions": snap.get("instructions", ""),
        "model_tier": snap.get("model_tier", "fast"),
        "tools": [t for t in snap.get("tools", []) if t in known],
    }
    return fields, [dict(t) for t in snap.get("triggers", [])]


def count_install(cur: Any, row: Dict[str, Any]) -> None:
    cur.execute("UPDATE agent_listings SET installs = installs + 1 WHERE id = %s", (row["id"],))
