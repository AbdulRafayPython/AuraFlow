"""
Model router: pick an LLM client for a quality tier
===================================================
Agents ask for a *tier*, not a provider:

``fast``   the default DeepSeek client (cheap, low latency; most agents).
``smart``  an optional second OpenAI-compatible provider for harder work.

Configure ``smart`` with environment variables; without them it silently
falls back to ``fast`` so every deployment keeps working::

    LLM_SMART_API_KEY       required to enable the tier
    LLM_SMART_MODEL         required (e.g. a larger model name)
    LLM_SMART_BASE_URL      default: the fast tier's base URL
    LLM_SMART_MAX_TOKENS    default 1500
    LLM_SMART_TIMEOUT_SECONDS  default 40
"""

from __future__ import annotations

import logging
import os
import threading
from dataclasses import dataclass
from typing import Dict, Optional

from utils.ai.llm_client import LLMClient, get_llm_client, DEEPSEEK_BASE_URL

log = logging.getLogger(__name__)

TIER_FAST = "fast"
TIER_SMART = "smart"
TIERS = (TIER_FAST, TIER_SMART)


@dataclass(frozen=True)
class ModelChoice:
    """The client chosen for a tier.

    ``tier`` is the tier actually served; ``requested`` is what was asked for,
    so a caller (and the run log) can see when ``smart`` fell back to ``fast``.
    """
    client: Optional[LLMClient]
    tier: str
    requested: str
    model: str

    @property
    def available(self) -> bool:
        return self.client is not None and self.client.available

    @property
    def fell_back(self) -> bool:
        return self.tier != self.requested


_lock = threading.Lock()
_smart_client: Optional[LLMClient] = None
_smart_key: tuple = ()


def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


def _smart_settings() -> Optional[Dict[str, object]]:
    api_key = _env("LLM_SMART_API_KEY")
    model = _env("LLM_SMART_MODEL")
    if not api_key or not model:
        return None
    try:
        max_tokens = int(_env("LLM_SMART_MAX_TOKENS", "1500"))
        timeout = float(_env("LLM_SMART_TIMEOUT_SECONDS", "40"))
    except ValueError:
        max_tokens, timeout = 1500, 40.0
    return {
        "api_key": api_key,
        "base_url": _env("LLM_SMART_BASE_URL", DEEPSEEK_BASE_URL),
        "model": model,
        "max_tokens": max_tokens,
        "timeout": timeout,
    }


def _get_smart_client() -> Optional[LLMClient]:
    """Build (and cache) the smart client; rebuilt if the env changes."""
    global _smart_client, _smart_key
    settings = _smart_settings()
    if settings is None:
        return None
    key = tuple(sorted(settings.items()))
    with _lock:
        if _smart_client is None or _smart_key != key:
            _smart_client = LLMClient(
                api_key=str(settings["api_key"]),
                base_url=str(settings["base_url"]),
                model=str(settings["model"]),
                max_tokens=int(settings["max_tokens"]),  # type: ignore[arg-type]
                timeout=float(settings["timeout"]),      # type: ignore[arg-type]
            )
            _smart_key = key
            log.info("[ROUTER] smart tier ready (model=%s)", settings["model"])
        return _smart_client


def get_model(tier: str = TIER_FAST) -> ModelChoice:
    """Return the client for ``tier``.

    Unknown tiers are treated as ``fast``. ``smart`` falls back to ``fast``
    when it is not configured. When no key is configured at all the returned
    choice has ``client=None`` and ``available`` is False.
    """
    requested = tier if tier in TIERS else TIER_FAST

    if requested == TIER_SMART:
        smart = _get_smart_client()
        if smart is not None and smart.available:
            return ModelChoice(client=smart, tier=TIER_SMART,
                               requested=requested, model=smart.model)

    fast = get_llm_client()
    return ModelChoice(client=fast, tier=TIER_FAST, requested=requested,
                       model=fast.model if fast is not None else "")


def reset_for_tests() -> None:
    """Drop the cached smart client (tests change env between cases)."""
    global _smart_client, _smart_key
    with _lock:
        _smart_client = None
        _smart_key = ()


__all__ = ["ModelChoice", "get_model", "TIER_FAST", "TIER_SMART", "TIERS",
           "reset_for_tests"]
