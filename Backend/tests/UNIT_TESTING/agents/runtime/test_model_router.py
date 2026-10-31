"""utils.ai.model_router: tier selection and fallback."""
from __future__ import annotations

import pytest

from utils.ai import model_router
from utils.ai.llm_client import LLMClient


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    for k in ("LLM_SMART_API_KEY", "LLM_SMART_MODEL", "LLM_SMART_BASE_URL",
              "LLM_SMART_MAX_TOKENS", "LLM_SMART_TIMEOUT_SECONDS"):
        monkeypatch.delenv(k, raising=False)
    model_router.reset_for_tests()
    yield
    model_router.reset_for_tests()


@pytest.fixture
def fast(monkeypatch):
    client = LLMClient(api_key="fast-key", base_url="http://fast", model="fast-model")
    monkeypatch.setattr(model_router, "get_llm_client", lambda: client)
    return client


def test_fast_returns_default_client(fast):
    c = model_router.get_model("fast")
    assert c.client is fast and c.tier == "fast" and c.model == "fast-model"
    assert c.available and not c.fell_back


def test_unknown_tier_is_fast(fast):
    c = model_router.get_model("turbo")
    assert c.tier == "fast" and c.requested == "fast"


def test_smart_falls_back_when_unconfigured(fast):
    c = model_router.get_model("smart")
    assert c.client is fast and c.tier == "fast" and c.requested == "smart"
    assert c.fell_back is True


def test_smart_needs_both_key_and_model(fast, monkeypatch):
    monkeypatch.setenv("LLM_SMART_API_KEY", "k")
    assert model_router.get_model("smart").fell_back is True
    monkeypatch.delenv("LLM_SMART_API_KEY")
    monkeypatch.setenv("LLM_SMART_MODEL", "big")
    assert model_router.get_model("smart").fell_back is True


def test_smart_uses_its_own_client(fast, monkeypatch):
    monkeypatch.setenv("LLM_SMART_API_KEY", "smart-key")
    monkeypatch.setenv("LLM_SMART_MODEL", "big-model")
    monkeypatch.setenv("LLM_SMART_BASE_URL", "http://smart/")
    monkeypatch.setenv("LLM_SMART_MAX_TOKENS", "999")
    c = model_router.get_model("smart")
    assert c.tier == "smart" and not c.fell_back
    assert c.client is not fast
    assert c.client.model == "big-model"
    assert c.client.api_key == "smart-key"
    assert c.client.base_url == "http://smart"
    assert c.client.max_tokens == 999


def test_smart_client_is_cached_and_rebuilt_on_env_change(fast, monkeypatch):
    monkeypatch.setenv("LLM_SMART_API_KEY", "k")
    monkeypatch.setenv("LLM_SMART_MODEL", "m1")
    a = model_router.get_model("smart").client
    assert model_router.get_model("smart").client is a
    monkeypatch.setenv("LLM_SMART_MODEL", "m2")
    b = model_router.get_model("smart").client
    assert b is not a and b.model == "m2"


def test_no_key_anywhere_is_unavailable(monkeypatch):
    monkeypatch.setattr(model_router, "get_llm_client", lambda: None)
    c = model_router.get_model("fast")
    assert c.client is None and c.available is False and c.model == ""
