"""
Auraflow shared LLM client — DeepSeek (OpenAI-compatible)
=========================================================
Single entry point for every paid LLM call in the codebase. The whole fleet
runs on DeepSeek (``deepseek-chat``): paid, cheap per token, and with no
free-tier daily wall. Any OpenAI-compatible provider works, see
``utils/ai/model_router.py`` for picking a client per quality tier.

Three things this module gives every caller:

1. **One client, one budget.** A single pooled ``requests.Session`` with
   retries, hard timeouts and a per-call ``max_tokens`` cap, so no agent
   can silently run away with the bill.

2. **Real multi-turn calls.** :meth:`LLMClient.chat` takes OpenAI-style
   messages instead of one flattened prompt, and :meth:`LLMClient.chat_tools`
   adds function calling for the agent runtime. ``complete`` and
   ``complete_json`` funnel through ``chat``, so the soak harness patches
   ``chat`` and ``chat_tools`` to count every call the fleet makes.

3. **Humanized output by default.** Every prose completion is run through
   :func:`humanize_text`, which strips the tells that make text read as
   machine-written: em/en dashes, markdown bold, "As an AI…", "I hope this
   helps", "delve/tapestry/leverage"-class vocabulary, and assistant-voice
   openers. Bullet lists and section headers survive — the goal is text
   that reads like a person wrote it, not text with the formatting
   stripped out. JSON responses skip the humanizer entirely.

Configuration (all optional except the key)::

    DEEPSEEK_API_KEY       required; without it is_llm_available() is False
    DEEPSEEK_BASE_URL      default https://api.deepseek.com
    DEEPSEEK_MODEL         default deepseek-chat
    LLM_MAX_TOKENS         default 700   — per-call ceiling
    LLM_TIMEOUT_SECONDS    default 20    — read timeout
    LLM_RETRIES            default 2     — extra attempts on 429/5xx/timeout
    LLM_HUMANIZE           default true  — global humanizer kill-switch
    LLM_TEMPERATURE        default 0.6   — default for prose calls

Nothing here raises. Every failure path returns None / empty text so the
caller falls back to its rule-based branch.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import random
import re
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union

log = logging.getLogger(__name__)

try:
    import requests
except Exception:  # pragma: no cover — requests ships with the app
    requests = None  # type: ignore

# This module reads os.environ at import time and can be imported before
# ``config`` (which normally does the loading), e.g. by a Celery worker
# that pulls in an agent first. load_dotenv() is idempotent and cheap, so
# call it here rather than depend on import order.
try:
    from dotenv import load_dotenv as _load_dotenv
    _load_dotenv()
except Exception:  # pragma: no cover
    pass


# ── Configuration ───────────────────────────────────────────────────────

def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


def _env_int(name: str, default: int) -> int:
    try:
        return int(_env(name) or default)
    except (TypeError, ValueError):
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(_env(name) or default)
    except (TypeError, ValueError):
        return default


def _env_bool(name: str, default: bool) -> bool:
    raw = _env(name).lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")


DEEPSEEK_API_KEY = _env("DEEPSEEK_API_KEY")
DEEPSEEK_BASE_URL = _env("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
# deepseek-chat only. deepseek-reasoner emits a long reasoning trace, which
# blows both the latency budget on the socket hot path and the token bill.
DEEPSEEK_MODEL = _env("DEEPSEEK_MODEL", "deepseek-chat")

LLM_MAX_TOKENS = _env_int("LLM_MAX_TOKENS", 700)
LLM_TIMEOUT_SECONDS = _env_float("LLM_TIMEOUT_SECONDS", 20.0)
LLM_CONNECT_TIMEOUT = _env_float("LLM_CONNECT_TIMEOUT", 5.0)
LLM_RETRIES = _env_int("LLM_RETRIES", 2)
LLM_HUMANIZE = _env_bool("LLM_HUMANIZE", True)
LLM_TEMPERATURE = _env_float("LLM_TEMPERATURE", 0.6)


# ── House style ─────────────────────────────────────────────────────────
# Prepended to every prose call. The humanizer is the safety net; this is
# the cheaper first line of defence — a model that never writes the tells
# costs nothing to clean up afterwards.

HOUSE_STYLE = (
    "You are part of Auraflow, a community chat app. Write the way a thoughtful "
    "person types in chat.\n"
    "Style rules, all mandatory:\n"
    "- Never use em dashes or en dashes. Use a comma, a full stop, or split the "
    "sentence instead.\n"
    "- No markdown bold, italics or headings. Plain text only. Bullet lists are "
    "fine when the content is genuinely a list.\n"
    "- No assistant filler. Do not open with Sure, Certainly, Of course, Great "
    "question, or I'd be happy to. Do not close with I hope this helps or Let me "
    "know if you need anything else.\n"
    "- Do not mention that you are an AI, a model, or an assistant.\n"
    "- Avoid the words delve, tapestry, leverage, utilize, robust, seamless, "
    "plethora, myriad, pivotal, realm, landscape, testament, underscore, "
    "furthermore, moreover.\n"
    "- Vary sentence length. Do not write everything as a three item list.\n"
    "- Say the thing directly. No preamble, no restating the question."
)


# ── Humanizer ───────────────────────────────────────────────────────────

# Dash characters that must never survive into user-facing prose.
_DASH_CHARS = "—–―‒−"  # em, en, horbar, figure, minus

# Line-leading list markers we protect from dash rewriting. Dash characters
# are included because a line that opens with one is a bullet in practice,
# not punctuation; _strip_dashes normalises it to a plain hyphen.
_BULLET_RE = re.compile(rf"^(\s*)([-*•‣●{_DASH_CHARS}]\s+|\d+[.)]\s+)")

# Openers and sign-offs that mark text as assistant-written.
_OPENER_RE = re.compile(
    r"^\s*(?:sure(?:\s+thing)?|certainly|of\s+course|absolutely|"
    r"great\s+question|good\s+question|happy\s+to\s+help|"
    r"i(?:'d| would)\s+be\s+happy\s+to\s+help(?:\s+with\s+that)?|"
    r"here(?:'s| is)\s+(?:a|the|your)\b[^.\n]{0,40}:)"
    r"[!,.:]*\s*",
    re.IGNORECASE,
)

_SIGNOFF_RE = re.compile(
    r"(?:\n+|\s+)?(?:"
    r"i\s+hope\s+(?:this|that)\s+helps?[^\n]*|"
    r"hope\s+(?:this|that)\s+helps?[^\n]*|"
    r"let\s+me\s+know\s+if\s+[^\n]*|"
    r"feel\s+free\s+to\s+(?:ask|reach\s+out|let\s+me\s+know)[^\n]*|"
    r"if\s+you\s+have\s+any\s+(?:other\s+)?questions[^\n]*|"
    r"is\s+there\s+anything\s+else[^\n]*"
    r")\s*$",
    re.IGNORECASE,
)

# Phrases deleted outright wherever they appear.
_FILLER_RES = [
    re.compile(p, re.IGNORECASE) for p in (
        r"\bas\s+an\s+ai(?:\s+language\s+model)?\s*,?\s*",
        r"\bas\s+a\s+language\s+model\s*,?\s*",
        r"\bi(?:'m| am)\s+just\s+an\s+ai\s*,?\s*",
        r"\bit(?:'s| is)\s+(?:important|worth)\s+(?:to\s+note|noting|mentioning)\s+that\s+",
        r"\bit\s+should\s+be\s+noted\s+that\s+",
        r"\bplease\s+note\s+that\s+",
        r"\bneedless\s+to\s+say\s*,?\s*",
        r"\bat\s+the\s+end\s+of\s+the\s+day\s*,?\s*",
        r"\bin\s+the\s+world\s+of\s+",
        r"\bwhen\s+it\s+comes\s+to\s+",
    )
]

# Case-preserving vocabulary swaps. Keys are matched as whole words.
_WORD_SWAPS = {
    "delve into": "look at",
    "delve": "look",
    "delving": "looking",
    "tapestry": "mix",
    "leverage": "use",
    "leveraging": "using",
    "leverages": "uses",
    "utilize": "use",
    "utilizes": "uses",
    "utilizing": "using",
    "utilization": "use",
    "robust": "solid",
    "seamless": "smooth",
    "seamlessly": "smoothly",
    "a plethora of": "a lot of",
    "a myriad of": "many",
    "myriad of": "many",
    "plethora": "lot",
    "myriad": "many",
    "pivotal": "key",
    "crucial": "key",
    "paramount": "essential",
    "realm": "area",
    "landscape": "space",
    "testament": "sign",
    "underscore": "highlight",
    "underscores": "highlights",
    "furthermore": "also",
    "moreover": "also",
    "additionally": "also",
    "nevertheless": "still",
    "endeavor": "try",
    "commence": "start",
    "facilitate": "help",
    "facilitates": "helps",
    "ascertain": "find out",
    "subsequently": "then",
    "utilise": "use",
    "embark on": "start",
    "in order to": "to",
    "a wide range of": "many",
    "a variety of": "several",
    "navigate the complexities of": "handle",
    "unlock the potential of": "get more out of",
    "game changer": "big improvement",
    "cutting edge": "modern",
    "state of the art": "modern",
}

_SWAP_RE = re.compile(
    r"\b(" + "|".join(sorted((re.escape(k) for k in _WORD_SWAPS), key=len, reverse=True)) + r")\b",
    re.IGNORECASE,
)

# Markdown emphasis / headings we flatten.
_MD_BOLD_RE = re.compile(r"\*\*(.+?)\*\*", re.DOTALL)
_MD_BOLD_ALT_RE = re.compile(r"__(.+?)__", re.DOTALL)
_MD_ITALIC_RE = re.compile(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", re.DOTALL)
_MD_HEADING_RE = re.compile(r"^\s{0,3}#{1,6}\s+", re.MULTILINE)
_MD_FENCE_RE = re.compile(r"^\s*```[a-zA-Z0-9]*\s*$", re.MULTILINE)


def _match_case(source: str, replacement: str) -> str:
    """Copy ``source``'s capitalisation pattern onto ``replacement``."""
    if source.isupper() and len(source) > 1:
        return replacement.upper()
    if source[:1].isupper():
        return replacement[:1].upper() + replacement[1:]
    return replacement


def _strip_dashes(line: str) -> str:
    """Remove dash-as-punctuation from one line, preserving a list marker.

    A leading ``- `` / ``* `` / ``1. `` is formatting and stays. Everything
    else that reads as an em dash (a real em/en dash, or a spaced hyphen
    standing in for one) becomes a comma so the sentence still breathes.
    """
    bullet = ""
    m = _BULLET_RE.match(line)
    if m:
        bullet = m.group(0)
        line = line[len(bullet):]
        # Normalise an em-dash bullet into a plain hyphen bullet.
        bullet = re.sub(f"[{_DASH_CHARS}]", "-", bullet)

    # A dash-like char used as punctuation, with or without surrounding space.
    line = re.sub(rf"\s*[{_DASH_CHARS}]+\s*", ", ", line)
    # A spaced hyphen doing the same job. Skip numeric ranges (10 - 20).
    line = re.sub(r"(?<!\d)\s+-\s+(?!\d)", ", ", line)
    # A line that now starts with the comma we just inserted.
    line = re.sub(r"^\s*,\s*", "", line)
    return bullet + line


# Sentence starts, for re-capitalising after a filler phrase was deleted.
_SENTENCE_START_RE = re.compile(r"(^|[.!?]\s+|\n\s*(?:[-*•]\s+|\d+[.)]\s+)?)([a-z])")


def _recapitalize(text: str) -> str:
    """Upper-case the first letter of each sentence.

    Deleting a filler opener ("It is important to note that …") leaves the
    rest of the sentence starting lower-case. This puts it back.
    """
    return _SENTENCE_START_RE.sub(lambda m: m.group(1) + m.group(2).upper(), text)


def _tidy_punctuation(text: str) -> str:
    text = re.sub(r",\s*,+", ",", text)
    text = re.sub(r",\s*([.!?;:])", r"\1", text)
    text = re.sub(r"\s+([.,!?;:])", r"\1", text)
    text = re.sub(r"([.!?])\s*,", r"\1", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    # A stray comma left dangling at the end of a line.
    text = re.sub(r",\s*$", "", text, flags=re.MULTILINE)
    return text


def humanize_text(text: str, *, keep_bullets: bool = True) -> str:
    """Strip the markers of machine-written prose from ``text``.

    Removes em/en dashes, markdown emphasis, assistant openers and
    sign-offs, hedging filler, and the vocabulary that reads as generated.
    Line structure survives: bullets stay bullets, blank lines stay blank
    lines, ``SECTION:`` headers stay headers.

    Safe on empty input and never raises — a humanizer bug must not cost
    the caller its LLM response.
    """
    if not text:
        return ""
    try:
        out = str(text).strip()

        # Strip a whole-response code fence (models wrap prose in one when
        # the prompt mentioned formatting).
        out = _MD_FENCE_RE.sub("", out).strip()

        # Flatten markdown emphasis and headings.
        out = _MD_BOLD_RE.sub(r"\1", out)
        out = _MD_BOLD_ALT_RE.sub(r"\1", out)
        out = _MD_ITALIC_RE.sub(r"\1", out)
        out = _MD_HEADING_RE.sub("", out)

        # Openers, sign-offs, filler. Openers stack ("Sure! I'd be happy to
        # help. Docker is…"), so peel them until the text stops shrinking.
        for _ in range(3):
            stripped = _OPENER_RE.sub("", out, count=1).lstrip()
            if stripped == out:
                break
            out = stripped
        out = _SIGNOFF_RE.sub("", out)
        for pat in _FILLER_RES:
            out = pat.sub("", out)

        # Vocabulary.
        out = _SWAP_RE.sub(
            lambda m: _match_case(m.group(0), _WORD_SWAPS[m.group(0).lower()]), out)

        # Dashes, line by line so bullets are protected.
        lines = out.split("\n")
        if not keep_bullets:
            lines = [re.sub(r"^\s*[-*•]\s+", "", ln) for ln in lines]
        out = "\n".join(_strip_dashes(ln) for ln in lines)

        out = _tidy_punctuation(out)

        # Models like to wrap a one-line answer in quotes.
        out = out.strip()
        if len(out) > 1 and out[0] in "\"'“‘" and out[-1] in "\"'”’":
            out = out[1:-1].strip()

        # Deleting an opener or a filler phrase leaves a lower-case sentence.
        out = _recapitalize(out)
        return out.strip()
    except Exception as exc:  # noqa: BLE001 — never lose the response
        log.debug("humanize_text failed: %s", exc)
        return str(text).strip()


def strip_json_fences(raw: str) -> str:
    """Return ``raw`` with a surrounding ```json fence removed."""
    if not raw:
        return ""
    out = raw.strip()
    if out.startswith("```"):
        out = re.sub(r"^```[a-zA-Z0-9]*\s*", "", out)
        out = re.sub(r"\s*```$", "", out)
    return out.strip()


# ── Tool-calling response objects ───────────────────────────────────────

@dataclass
class ToolCall:
    """One function call requested by the model.

    ``arguments`` is the parsed JSON object. When the model produced
    unparseable arguments ``arguments`` is ``{}`` and ``error`` explains why,
    so the caller can feed the error back to the model instead of crashing.
    """
    id: str
    name: str
    arguments: Dict[str, Any] = field(default_factory=dict)
    raw_arguments: str = ""
    error: Optional[str] = None


@dataclass
class LLMToolResponse:
    """Result of :meth:`LLMClient.chat_tools`.

    ``message`` is the assistant turn in OpenAI wire format; append it to the
    conversation verbatim before the matching ``role="tool"`` messages.
    """
    text: str = ""
    tool_calls: List[ToolCall] = field(default_factory=list)
    finish_reason: str = ""
    usage: Dict[str, int] = field(default_factory=dict)
    model: str = ""
    message: Dict[str, Any] = field(default_factory=dict)

    @property
    def prompt_tokens(self) -> int:
        return int(self.usage.get("prompt_tokens") or 0)

    @property
    def completion_tokens(self) -> int:
        return int(self.usage.get("completion_tokens") or 0)


class LLMClient:
    """DeepSeek chat-completions client.

    Thread-safe: a single pooled ``requests.Session`` shared across Celery
    workers and Flask request threads. All public methods swallow their
    own errors and return ``None`` / ``""`` so callers keep their existing
    "LLM failed, use the rule-based path" branch.
    """

    def __init__(
        self,
        api_key: str = "",
        base_url: str = "",
        model: str = "",
        *,
        max_tokens: Optional[int] = None,
        timeout: Optional[float] = None,
        retries: Optional[int] = None,
    ):
        self.api_key = api_key or DEEPSEEK_API_KEY
        self.base_url = (base_url or DEEPSEEK_BASE_URL).rstrip("/")
        self.model = model or DEEPSEEK_MODEL
        self.max_tokens = max_tokens or LLM_MAX_TOKENS
        self.timeout = timeout or LLM_TIMEOUT_SECONDS
        self.retries = LLM_RETRIES if retries is None else retries

        self._lock = threading.Lock()
        self._session = None
        # Cheap in-process observability: how much are the agents spending?
        self.call_count = 0
        self.token_count = 0
        self.error_count = 0

    # ── plumbing ────────────────────────────────────────────────────

    @property
    def available(self) -> bool:
        return bool(self.api_key) and requests is not None

    def _get_session(self):
        if self._session is None:
            with self._lock:
                if self._session is None:
                    s = requests.Session()
                    s.headers.update({
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                        "User-Agent": "Auraflow-Agents/1.0",
                    })
                    try:
                        from requests.adapters import HTTPAdapter
                        adapter = HTTPAdapter(pool_connections=4, pool_maxsize=16)
                        s.mount("https://", adapter)
                        s.mount("http://", adapter)
                    except Exception:  # noqa: BLE001
                        pass
                    self._session = s
        return self._session

    # ── core call ───────────────────────────────────────────────────

    def chat(
        self,
        messages: List[Dict[str, str]],
        *,
        system: Optional[str] = None,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        timeout: Optional[float] = None,
        json_mode: bool = False,
        humanize: bool = True,
        house_style: bool = True,
        stop: Optional[List[str]] = None,
    ) -> Optional[str]:
        """Run a chat completion and return the assistant text.

        ``messages`` is a normal OpenAI-style list of ``{"role", "content"}``
        dicts, so multi-turn context is passed as real turns rather than a
        flattened transcript. Returns None on any failure.
        """
        if not self.available:
            return None
        if not messages:
            return None

        payload_messages: List[Dict[str, str]] = []
        sys_parts: List[str] = []
        if house_style and not json_mode:
            sys_parts.append(HOUSE_STYLE)
        if system:
            sys_parts.append(system)
        if sys_parts:
            payload_messages.append({"role": "system", "content": "\n\n".join(sys_parts)})
        payload_messages.extend(messages)

        payload: Dict[str, Any] = {
            "model": model or self.model,
            "messages": payload_messages,
            "max_tokens": int(max_tokens or self.max_tokens),
            "temperature": (LLM_TEMPERATURE if temperature is None else float(temperature)),
            "stream": False,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        if stop:
            payload["stop"] = stop

        text = self._post_with_retry(payload, timeout=timeout)
        if text is None:
            return None
        if humanize and not json_mode and LLM_HUMANIZE:
            text = humanize_text(text)
        return text

    def chat_tools(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        *,
        system: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: Optional[int] = None,
        timeout: Optional[float] = None,
        tool_choice: str = "auto",
        humanize: bool = False,
    ) -> Optional[LLMToolResponse]:
        """Chat completion with OpenAI-style function calling.

        ``tools`` is a list of ``{"type": "function", "function": {name,
        description, parameters}}`` dicts. ``messages`` may contain assistant
        turns with ``tool_calls`` and ``role="tool"`` results, so a whole
        agent loop can be replayed. Returns None on any failure.

        Unlike :meth:`chat`, no house style is injected (the system prompt
        belongs to the caller) and tool arguments are never humanized.
        ``humanize=True`` post-processes the final prose answer only, and only
        when the model made no tool calls.
        """
        if not self.available or not messages:
            return None

        payload_messages: List[Dict[str, Any]] = []
        if system:
            payload_messages.append({"role": "system", "content": system})
        payload_messages.extend(messages)

        payload: Dict[str, Any] = {
            "model": model or self.model,
            "messages": payload_messages,
            "max_tokens": int(max_tokens or self.max_tokens),
            "temperature": float(temperature),
            "stream": False,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = tool_choice

        result = self._post_with_retry(
            payload, timeout=timeout, extract=self._extract_tool_response)
        if result is None:
            return None
        if humanize and LLM_HUMANIZE and not result.tool_calls and result.text:
            result.text = humanize_text(result.text)
            result.message["content"] = result.text
        return result

    def _extract_tool_response(self, resp, payload: dict) -> Optional[LLMToolResponse]:
        try:
            data = resp.json()
        except Exception as exc:  # noqa: BLE001
            self.error_count += 1
            log.warning("[LLM] non-JSON response body: %s", exc)
            return None

        try:
            choices = data.get("choices") or []
            if not choices:
                log.warning("[LLM] empty choices: %s", str(data)[:200])
                return None
            choice = choices[0]
            msg = choice.get("message") or {}
            text = (msg.get("content") or "").strip()
            calls: List[ToolCall] = []
            wire_calls: List[Dict[str, Any]] = []
            for i, tc in enumerate(msg.get("tool_calls") or []):
                fn = tc.get("function") or {}
                raw_args = fn.get("arguments") or ""
                call_id = tc.get("id") or f"call_{i}"
                parsed: Dict[str, Any] = {}
                err: Optional[str] = None
                if raw_args.strip():
                    try:
                        value = json.loads(raw_args)
                        if isinstance(value, dict):
                            parsed = value
                        else:
                            err = "arguments must be a JSON object"
                    except (json.JSONDecodeError, ValueError) as exc:
                        err = f"arguments are not valid JSON: {exc}"
                calls.append(ToolCall(id=call_id, name=fn.get("name") or "",
                                      arguments=parsed, raw_arguments=raw_args,
                                      error=err))
                wire_calls.append({
                    "id": call_id, "type": "function",
                    "function": {"name": fn.get("name") or "",
                                 "arguments": raw_args or "{}"},
                })
        except Exception as exc:  # noqa: BLE001
            self.error_count += 1
            log.warning("[LLM] malformed tool response: %s", exc)
            return None

        usage = data.get("usage") or {}
        self.call_count += 1
        try:
            self.token_count += int(usage.get("total_tokens") or 0)
        except (TypeError, ValueError):
            pass

        message: Dict[str, Any] = {"role": "assistant", "content": text or None}
        if wire_calls:
            message["tool_calls"] = wire_calls
        return LLMToolResponse(
            text=text, tool_calls=calls,
            finish_reason=str(choice.get("finish_reason") or ""),
            usage={k: int(v) for k, v in usage.items() if isinstance(v, (int, float))},
            model=str(data.get("model") or payload.get("model") or ""),
            message=message,
        )

    def _post_with_retry(self, payload: dict, *, timeout: Optional[float],
                         extract: Any = None) -> Any:
        """POST with retries, bounded by a total deadline.

        ``extract`` turns a 200 response into the return value; it defaults
        to :meth:`_extract_text` (plain assistant text).

        ``timeout`` is the caller's budget for the whole operation, not per
        attempt. That distinction matters: several call sites (the /ask and
        /support routes) block a Flask worker on this, and a naive per-attempt
        timeout lets three retries hold the request open for 3x what the
        caller asked for. Retries only happen while there is budget left for
        another one to plausibly finish.
        """
        url = f"{self.base_url}/chat/completions"
        budget = timeout or self.timeout
        started = time.monotonic()
        attempts = max(1, self.retries + 1)
        session = self._get_session()

        def _remaining() -> float:
            return budget - (time.monotonic() - started)

        for attempt in range(attempts):
            remaining = _remaining()
            if remaining <= 0:
                log.warning("[LLM] budget of %.1fs exhausted after %d attempt(s)",
                            budget, attempt)
                return None

            try:
                resp = session.post(
                    url, json=payload,
                    timeout=(min(LLM_CONNECT_TIMEOUT, remaining), remaining),
                )
            except Exception as exc:  # network error / timeout
                self.error_count += 1
                if attempt == attempts - 1 or _remaining() <= 0:
                    log.warning("[LLM] request failed after %d attempt(s): %s",
                                attempt + 1, exc)
                    return None
                self._backoff(attempt, budget=_remaining())
                continue

            if resp.status_code == 200:
                return (extract or self._extract_text)(resp, payload)

            # 429 = rate limit, 5xx = transient. Anything else is our bug.
            if (resp.status_code in (429, 500, 502, 503, 504)
                    and attempt < attempts - 1 and _remaining() > 0):
                self._backoff(attempt, retry_after=resp.headers.get("Retry-After"),
                              budget=_remaining())
                continue

            self.error_count += 1
            log.warning("[LLM] HTTP %s: %s", resp.status_code, (resp.text or "")[:300])
            return None
        return None

    def _extract_text(self, resp, payload: dict) -> Optional[str]:
        try:
            data = resp.json()
        except Exception as exc:  # noqa: BLE001
            self.error_count += 1
            log.warning("[LLM] non-JSON response body: %s", exc)
            return None

        try:
            choices = data.get("choices") or []
            if not choices:
                log.warning("[LLM] empty choices: %s", str(data)[:200])
                return None
            content = (choices[0].get("message") or {}).get("content") or ""
        except Exception as exc:  # noqa: BLE001
            self.error_count += 1
            log.warning("[LLM] malformed response: %s", exc)
            return None

        usage = data.get("usage") or {}
        self.call_count += 1
        try:
            self.token_count += int(usage.get("total_tokens") or 0)
        except (TypeError, ValueError):
            pass
        return content.strip()

    @staticmethod
    def _backoff(attempt: int, retry_after: Optional[str] = None,
                 budget: Optional[float] = None) -> None:
        """Sleep before the next attempt, never past the caller's budget."""
        ceiling = 8.0 if budget is None else max(0.0, min(8.0, budget - 0.5))
        if ceiling <= 0:
            return
        if retry_after:
            try:
                time.sleep(min(float(retry_after), ceiling))
                return
            except (TypeError, ValueError):
                pass
        # 0.5s, 1.2s, 2.4s … with jitter so parallel workers don't sync up.
        time.sleep(min(0.5 * (2 ** attempt) + random.uniform(0, 0.4), ceiling))

    # ── convenience wrappers ────────────────────────────────────────

    def complete(
        self,
        prompt: str,
        *,
        system: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        timeout: Optional[float] = None,
        humanize: bool = True,
    ) -> Optional[str]:
        """One-shot prose completion. Humanized unless told otherwise."""
        return self.chat(
            messages=[{"role": "user", "content": prompt}],
            system=system, temperature=temperature, max_tokens=max_tokens,
            timeout=timeout, humanize=humanize,
        )

    def complete_json(
        self,
        prompt: str,
        *,
        system: Optional[str] = None,
        temperature: float = 0.1,
        max_tokens: Optional[int] = None,
        timeout: Optional[float] = None,
        expect: type = dict,
    ) -> Optional[Union[dict, list]]:
        """Structured completion. Returns parsed JSON, or None.

        Uses DeepSeek's native JSON mode, which makes the fence-stripping
        below belt-and-braces rather than load-bearing. ``expect`` guards
        against a model that returns the right JSON in the wrong shape
        (an object where the caller needs an array).
        """
        # DeepSeek's JSON mode requires the word "json" somewhere in the
        # prompt; every caller here already says "Return a JSON object",
        # but enforce it so a reworded prompt can't 400 the request.
        if "json" not in prompt.lower():
            prompt = prompt.rstrip() + "\n\nReturn the result as JSON."

        raw = self.chat(
            messages=[{"role": "user", "content": prompt}],
            system=system, temperature=temperature, max_tokens=max_tokens,
            timeout=timeout, json_mode=True, humanize=False,
        )
        if not raw:
            return None
        try:
            parsed = json.loads(strip_json_fences(raw))
        except (json.JSONDecodeError, ValueError) as exc:
            log.warning("[LLM] JSON parse failed: %s | raw=%s", exc, raw[:200])
            return None

        if expect is list and isinstance(parsed, dict):
            # JSON mode always returns an object, so a caller wanting an
            # array gets it wrapped under whatever key the model chose.
            for value in parsed.values():
                if isinstance(value, list):
                    return value
            return []
        if not isinstance(parsed, expect):
            log.warning("[LLM] JSON shape mismatch: wanted %s got %s",
                        expect.__name__, type(parsed).__name__)
            return None
        return parsed

    def stats(self) -> Dict[str, int]:
        """Per-process call/token/error counters, for the admin panel."""
        return {
            "calls": self.call_count,
            "tokens": self.token_count,
            "errors": self.error_count,
        }


# ── Module-level singleton ──────────────────────────────────────────────

_client_lock = threading.Lock()
_client: Optional[LLMClient] = None


def get_llm_client() -> Optional[LLMClient]:
    """Return the shared client, or None when no API key is configured.

    Returning None (rather than an unusable client) lets agents keep their
    existing ``if not self.llm: <rule-based path>`` guard.
    """
    global _client
    if _client is not None:
        return _client
    with _client_lock:
        if _client is None:
            if not DEEPSEEK_API_KEY:
                log.warning("[LLM] DEEPSEEK_API_KEY not set — agents run rule-based only")
                return None
            if requests is None:
                log.warning("[LLM] requests not installed — agents run rule-based only")
                return None
            _client = LLMClient()
            log.info("[LLM] DeepSeek client ready (model=%s)", _client.model)
    return _client


def is_llm_available() -> bool:
    """True when a DeepSeek key is configured and the HTTP client loaded."""
    return bool(DEEPSEEK_API_KEY) and requests is not None


def cache_key(*parts: Any) -> str:
    """Stable short hash over ``parts`` — for Redis-backed response caches."""
    joined = "\x1f".join(str(p) for p in parts)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()[:32]


__all__ = [
    "LLMClient", "LLMToolResponse", "ToolCall",
    "get_llm_client", "is_llm_available",
    "humanize_text", "strip_json_fences", "cache_key",
    "HOUSE_STYLE", "DEEPSEEK_MODEL",
]
