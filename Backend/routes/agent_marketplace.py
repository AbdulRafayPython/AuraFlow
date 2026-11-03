# routes/agent_marketplace.py — browse, publish and install shared agent recipes.
#
# Thin HTTP layer over agents/runtime/marketplace.py. Everything requires a logged-in user.
# Anyone can browse published listings; only someone who manages an agent can list it;
# installing creates a new DRAFT agent owned by the installer (same permission and quota
# rules as creating one from scratch).
import os
import uuid
from typing import Any, Dict

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from agents.runtime import builder, marketplace
from agents.runtime.builder import BuilderError
from agents.runtime.definitions import get_definition_by_public_id, invalidate_cache
from routes.agent_builder import _body, _community_param, _db, _load, _not_builtin, _out, _user_id

agent_marketplace_bp = Blueprint("agent_marketplace", __name__, url_prefix="/api/agent-marketplace")


@agent_marketplace_bp.errorhandler(BuilderError)
def _builder_error(err: BuilderError):
    body: Dict[str, Any] = {"error": err.message}
    if err.details:
        body["details"] = err.details
    return jsonify(body), err.status


def _listing_or_404(cur: Any, public_id: str, user_id: int) -> Dict[str, Any]:
    """A published listing, or the caller's own. Anything else looks like it does not exist."""
    row = marketplace.get_listing(cur, public_id, user_id)
    if row is None or (row["status"] != "published" and row["publisher_user_id"] != user_id):
        raise BuilderError("Listing not found", 404)
    return row


@agent_marketplace_bp.route("/categories", methods=["GET"])
@jwt_required()
def categories():
    return jsonify({"categories": list(marketplace.CATEGORIES)}), 200


@agent_marketplace_bp.route("/listings", methods=["GET"])
@jwt_required()
def browse():
    with _db() as (_, cur):
        user_id = _user_id(cur)
        try:
            limit, offset = int(request.args.get("limit", 24)), int(request.args.get("offset", 0))
        except ValueError:
            raise BuilderError("limit and offset must be numbers", 400)
        listings = marketplace.browse(
            cur, viewer_id=user_id, query=request.args.get("q", ""), category=request.args.get("category", ""), sort=request.args.get("sort", "popular"),
            mine=request.args.get("mine") in ("1", "true"), limit=limit, offset=offset,
            connection=request.args.get("connection", ""))
    return jsonify({"listings": listings}), 200


# Listing images (persona avatar or banner) uploaded before publishing. The returned url is
# what the publish call sends as icon_url / banner_url.
LISTING_UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads", "agent-listings")
_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}
_IMAGE_MAX_BYTES = 5 * 1024 * 1024


@agent_marketplace_bp.route("/listings/media", methods=["POST"])
@jwt_required()
def upload_listing_media():
    file = request.files.get("file")
    if file is None or not file.filename:
        raise BuilderError("Choose an image to upload.", 400)
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in _IMAGE_EXTENSIONS:
        raise BuilderError("Use a PNG, JPG, GIF or WebP image.", 400)
    data = file.read(_IMAGE_MAX_BYTES + 1)
    if len(data) > _IMAGE_MAX_BYTES:
        raise BuilderError("Images must be 5 MB or smaller.", 400)
    with _db() as (_, cur):
        _user_id(cur)  # a real, logged-in user
    os.makedirs(LISTING_UPLOAD_DIR, exist_ok=True)
    name = f"{uuid.uuid4()}.{ext}"
    with open(os.path.join(LISTING_UPLOAD_DIR, name), "wb") as fh:
        fh.write(data)
    return jsonify({"url": f"/uploads/agent-listings/{name}"}), 201


@agent_marketplace_bp.route("/listings/<public_id>", methods=["GET"])
@jwt_required()
def get_listing(public_id: str):
    with _db() as (_, cur):
        user_id = _user_id(cur)
        return jsonify(marketplace.public_view(_listing_or_404(cur, public_id, user_id), viewer_id=user_id)), 200


@agent_marketplace_bp.route("/listings/<public_id>/rating", methods=["PUT"])
@jwt_required()
def rate_listing(public_id: str):
    with _db() as (conn, cur):
        user_id = _user_id(cur)
        row = _listing_or_404(cur, public_id, user_id)
        marketplace.rate(cur, row, user_id, _body().get("stars"))
        conn.commit()
        return jsonify(marketplace.public_view(marketplace.get_listing(cur, public_id, user_id), viewer_id=user_id)), 200


@agent_marketplace_bp.route("/listings/<public_id>/rating", methods=["DELETE"])
@jwt_required()
def clear_listing_rating(public_id: str):
    with _db() as (conn, cur):
        user_id = _user_id(cur)
        row = _listing_or_404(cur, public_id, user_id)
        marketplace.clear_rating(cur, row, user_id)
        conn.commit()
        return jsonify(marketplace.public_view(marketplace.get_listing(cur, public_id, user_id), viewer_id=user_id)), 200


@agent_marketplace_bp.route("/agents/<agent_public_id>/listing", methods=["POST"])
@jwt_required()
def publish(agent_public_id: str):
    clean, errors = marketplace.validate_listing(_body())
    if errors:
        raise BuilderError("Invalid listing", 400, errors)
    with _db() as (conn, cur):
        user_id = _user_id(cur)
        defn = _load(cur, agent_public_id, user_id)
        _not_builtin(defn)
        listing_id = marketplace.publish(cur, defn, user_id, clean)
        conn.commit()
        row = marketplace.get_listing(cur, listing_id, user_id)
        return jsonify(marketplace.public_view(row, viewer_id=user_id)), 200


@agent_marketplace_bp.route("/listings/<public_id>", methods=["DELETE"])
@jwt_required()
def unpublish(public_id: str):
    with _db() as (conn, cur):
        user_id = _user_id(cur)
        row = marketplace.get_listing(cur, public_id, user_id)
        if row is None or (row["status"] != "published" and row["publisher_user_id"] != user_id):
            raise BuilderError("Listing not found", 404)
        if row["publisher_user_id"] != user_id and not builder.is_system_admin(cur, user_id):
            raise BuilderError("Only the publisher can remove this listing", 403)
        marketplace.unpublish(cur, row)
        conn.commit()
    return jsonify({"ok": True}), 200


@agent_marketplace_bp.route("/listings/<public_id>/install", methods=["POST"])
@jwt_required()
def install(public_id: str):
    data = _body()
    with _db() as (conn, cur):
        user_id = _user_id(cur)
        row = _listing_or_404(cur, public_id, user_id)
        if row["status"] != "published":
            raise BuilderError("This listing is no longer available.", 410)
        community_id = _community_param(data.get("community_id"))
        if not builder.can_create(cur, user_id, community_id):
            raise BuilderError("Only a community owner or admin can add agents to it.", 403)
        builder.check_quota(cur, user_id, community_id)

        fields, raw_triggers = marketplace.install_fields(row, str(data.get("name") or "").strip() or None)
        fields, errors = builder.validate_fields(fields)
        if errors:
            raise BuilderError("This listing is not valid any more", 409, errors)
        notes = []
        if community_id is None and any(t.get("type") == "member_joined" for t in raw_triggers):
            raw_triggers = [t for t in raw_triggers if t.get("type") != "member_joined"]
            notes.append("member_joined only works for community agents; it was left out.")
        triggers, trig_errors = builder.validate_triggers(
            raw_triggers, community_id=community_id, channel_ok=builder.channel_checker(cur, user_id, community_id))
        if trig_errors:
            raise BuilderError("This listing is not valid any more", 409, trig_errors)
        _, new_public_id = builder.create_agent(cur, owner_id=user_id, community_id=community_id, fields=fields,
                                                triggers=triggers, template_key=None)
        marketplace.count_install(cur, row)
        conn.commit()
    invalidate_cache()
    out = _out(get_definition_by_public_id(new_public_id))
    out["notes"] = notes
    return jsonify(out), 201
