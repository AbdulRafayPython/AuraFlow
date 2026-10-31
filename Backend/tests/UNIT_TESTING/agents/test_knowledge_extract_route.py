"""
POST /api/agents/knowledge/extract/<channel_id> now runs the same agent as the whole-community
route (knowledge_builder_v2). The old v1 class is gone, so the answer carries the counts v2
reports instead of the v1 lists.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from flask import Flask

from routes import agents as agents_routes


class FakeKnowledgeBuilder:
    def __init__(self, result):
        self.result, self.calls = result, []

    def extract_knowledge(self, **kwargs):
        self.calls.append(kwargs)
        return self.result


def _call(agent, member=True, body=None):
    conn = MagicMock()
    cur = conn.cursor.return_value.__enter__.return_value
    cur.fetchone.return_value = {"1": 1} if member else None
    with Flask(__name__).test_request_context("/api/agents/knowledge/extract/2", method="POST", json=body or {}), \
         patch("flask_jwt_extended.view_decorators.verify_jwt_in_request"), \
         patch.object(agents_routes, "get_jwt_identity", return_value="sarah_dev"), \
         patch.object(agents_routes, "get_db_connection", return_value=conn), \
         patch.object(agents_routes, "get_user_id", return_value=7), \
         patch.object(agents_routes, "_get_agent", return_value=agent):
        view = agents_routes.extract_knowledge_channel
        out = getattr(view, "__wrapped__", view)(2)
    return out if isinstance(out, tuple) else (out, out.status_code)


def test_the_channel_route_reports_the_counts_from_the_agent():
    agent = FakeKnowledgeBuilder({"success": True, "faqs": 2, "definitions": 1, "decisions": 3, "total_items": 6})
    resp, status = _call(agent, body={"time_period_hours": 12})
    data = resp.get_json()
    assert status == 200 and data["total_items"] == 6 and (data["faqs"], data["definitions"], data["decisions"]) == (2, 1, 3)
    assert data["channel_id"] == 2 and data["time_period_hours"] == 12 and "2 FAQs" in data["message"]
    assert agent.calls == [{"channel_id": 2, "time_period_hours": 12}]


def test_the_channel_route_defaults_to_the_last_day():
    agent = FakeKnowledgeBuilder({"success": True, "total_items": 0})
    resp, status = _call(agent)
    assert status == 200 and resp.get_json()["time_period_hours"] == 24 and agent.calls[0]["time_period_hours"] == 24


def test_a_failed_extraction_is_a_400_with_the_reason():
    resp, status = _call(FakeKnowledgeBuilder({"success": False, "error": "Not enough messages"}))
    assert status == 400 and resp.get_json() == {"success": False, "error": "Not enough messages"}


def test_only_channel_members_may_extract():
    agent = FakeKnowledgeBuilder({"success": True})
    resp, status = _call(agent, member=False)
    assert status == 403 and agent.calls == []


def test_both_agent_names_give_the_v2_agent():
    agents_routes._agents.pop("knowledge_builder", None)
    agents_routes._agents.pop("knowledge_builder_v2", None)
    from agents.knowledge_builder_v2 import KnowledgeBuilderAgent
    assert isinstance(agents_routes._get_agent("knowledge_builder"), KnowledgeBuilderAgent)
    assert isinstance(agents_routes._get_agent("knowledge_builder_v2"), KnowledgeBuilderAgent)
