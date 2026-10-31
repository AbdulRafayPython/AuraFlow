"""
POST /api/agents/moderation/check used to call ModerationAgent.moderate_message(),
a method that does not exist, so every request failed with a 500 (found in the
live check of all 11 agents). The route now calls instant_check() and shapes the
answer like the client's ModerationResult.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from agents.moderation import ModerationAgent
from routes import agents as agents_routes
from routes.agents import _moderation_result


def test_the_agent_has_the_method_the_route_calls():
    assert callable(getattr(ModerationAgent, "instant_check", None))
    assert not hasattr(ModerationAgent, "moderate_message")


@pytest.mark.parametrize("raw, flag_type, severity, action", [
    ({"block": False, "reason": ""}, "other", "low", "none"),
    ({"block": True, "reason": "Extreme content detected"}, "toxic", "critical", "delete"),
    ({"block": True, "warn": False, "reason": "spam_flood", "category": "spam"}, "spam", "high", "delete"),
    ({"block": False, "warn": True, "reason": "duplicate_spam", "category": "spam"}, "spam", "medium", "warn"),
    ({"block": False, "flag": True, "reason": "advance_fee", "category": "scam", "confidence": 0.8}, "spam", "medium", "flag"),
    ({"block": False, "flag_personal_info": True, "reason": "Personal information detected"}, "inappropriate", "low", "flag"),
])
def test_the_result_has_the_fields_the_client_expects(raw, flag_type, severity, action):
    out = _moderation_result(raw)
    assert (out["flag_type"], out["severity"], out["action_recommended"]) == (flag_type, severity, action)
    assert isinstance(out["confidence"], float) and 0.0 <= out["confidence"] <= 1.0
    assert out["reason"] == raw.get("reason", "")
    assert all(out[k] == v for k, v in raw.items() if k != "reason")          # original keys survive


def test_an_empty_answer_does_not_crash():
    assert _moderation_result(None)["action_recommended"] == "none"


def _call_route(app, body):
    conn = MagicMock()
    cur = conn.cursor.return_value.__enter__.return_value
    with app.test_request_context("/api/agents/moderation/check", method="POST", json=body), \
         patch.object(agents_routes, "get_jwt_identity", return_value="sarah_dev"), \
         patch("flask_jwt_extended.view_decorators.verify_jwt_in_request"), \
         patch.object(agents_routes, "get_db_connection", return_value=conn), \
         patch.object(agents_routes, "get_user_id", return_value=7), \
         patch.object(agents_routes, "_get_agent", return_value=ModerationAgent()):
        view = agents_routes.check_moderation
        return getattr(view, "__wrapped__", view)()


def test_the_route_answers_200_for_a_threat_and_for_normal_text():
    from flask import Flask
    app = Flask(__name__)
    resp, status = _call_route(app, {"text": "i will kill you all", "channel_id": 1})
    assert status == 200
    mod = resp.get_json()["moderation"]
    assert mod["action_recommended"] == "delete" and mod["block"] is True

    resp, status = _call_route(app, {"text": "see you at the lab tomorrow", "channel_id": 1})
    assert status == 200
    assert resp.get_json()["moderation"]["action_recommended"] == "none"
