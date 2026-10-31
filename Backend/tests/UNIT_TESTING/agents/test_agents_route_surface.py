"""
The /api/agents routes nothing called were removed (L5g). This pins the surface: those paths are gone,
and every path the app uses is still registered, so a careless merge cannot bring one back or drop one.
"""

from __future__ import annotations

import pytest
from flask import Flask

from routes.agents import agents_bp

REMOVED = [
    "/mood/track/1", "/mood/history/1", "/mood/reanalyze/1", "/mood/recommendations/1", "/mood/insights/1",
    "/moderation/history", "/moderation/stats", "/engagement/metrics/1", "/engagement/trends/1",
    "/engagement/icebreaker", "/engagement/icebreaker/categories", "/engagement/challenge",
    "/engagement/starters", "/engagement/booster-pack", "/engagement/activity/stats/1",
    "/wellness/analyze", "/wellness/recommendations", "/wellness/insights/1", "/wellness/history",
    "/wellness/trends", "/knowledge/insights", "/knowledge/topics", "/knowledge/stats", "/knowledge/recent",
    "/focus/metrics", "/focus/recommendations", "/focus/goal",
    "/summarizer/schedule/00000000-0000-0000-0000-000000000000",
    "/summarizer/trigger/00000000-0000-0000-0000-000000000000",
    "/assistant/joke", "/assistant/motivation", "/translator/languages", "/translator/detect",
    "/support/ask", "/support/refresh/00000000-0000-0000-0000-000000000000", "/automessage/welcome/preview",
]

# (method, path) pairs the Frontend or a test uses.
KEPT = [
    ("GET", "/settings-schema"), ("POST", "/summarize/channel/1"), ("POST", "/summarize/dm/1"),
    ("GET", "/summaries/channel/1"), ("GET", "/summary/1"), ("GET", "/health"), ("GET", "/metrics"),
    ("GET", "/collaboration-graph"), ("POST", "/anything/feedback"), ("GET", "/anything/state"),
    ("PUT", "/anything/state"), ("GET", "/state/catalog"), ("POST", "/mood/analyze-message"),
    ("GET", "/mood/trends/1"), ("GET", "/mood/community"), ("POST", "/moderation/check"),
    ("POST", "/engagement/analyze"), ("GET", "/engagement/poll"), ("POST", "/engagement/send"),
    ("GET", "/engagement/poll/1"), ("POST", "/engagement/poll/1/vote"), ("POST", "/engagement/activity/log"),
    ("GET", "/wellness/check"), ("GET", "/knowledge/base/1"), ("POST", "/knowledge/extract/1"),
    ("POST", "/knowledge/extract"), ("GET", "/knowledge/search"), ("POST", "/focus/analyze"),
    ("GET", "/catalog"), ("GET", "/actions"), ("GET", "/logs"), ("DELETE", "/assistant/memory"),
    ("POST", "/assistant/ask"), ("POST", "/translator/translate"), ("POST", "/translator/message/1"),
    ("POST", "/automessage/quick-replies"), ("GET", "/summary-schedules"), ("GET", "/summary-schedules/pending"),
]


@pytest.fixture(scope="module")
def adapter():
    app = Flask(__name__)
    app.register_blueprint(agents_bp)
    return app.url_map.bind("localhost")


def _match(adapter, method, path):
    from werkzeug.exceptions import MethodNotAllowed, NotFound
    try:
        adapter.match("/api/agents" + path, method=method)
        return True
    except (NotFound, MethodNotAllowed):
        return False


@pytest.mark.parametrize("path", REMOVED)
@pytest.mark.parametrize("method", ["GET", "POST"])
def test_a_removed_route_is_gone(adapter, method, path):
    # "<name>/state"-style catch-alls must not swallow the old paths either
    assert not _match(adapter, method, path), f"{method} {path} is registered again"


@pytest.mark.parametrize("method,path", KEPT)
def test_a_route_the_app_uses_is_still_there(adapter, method, path):
    assert _match(adapter, method, path), f"{method} {path} is missing"
