"""
conftest.py — UAT
User Acceptance Tests simulate real end-user journeys via the Flask test client.
Unlike integration tests (which test individual routes), UAT tests simulate
complete workflows: Register → Login → Join Community → Send Message → Summarize.
DB is mocked for reproducibility, but the full Flask routing stack is exercised.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import pytest
from unittest.mock import patch, MagicMock


@pytest.fixture(scope="session")
def uat_app():
    with patch("database.get_db_connection", return_value=MagicMock()), \
         patch("services.redis_client.get_redis", return_value=None):
        import app as app_module
        flask_app = app_module.app
        flask_app.config["TESTING"] = True
        flask_app.config["JWT_SECRET_KEY"] = "uat-secret-key"
        yield flask_app


@pytest.fixture(scope="session")
def uat_client(uat_app):
    return uat_app.test_client()
