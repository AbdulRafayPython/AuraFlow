"""
Unit tests for utils/ai/llm_client.py — the shared DeepSeek client.

Two things are under test here:

1. ``humanize_text`` — the guarantee that no agent output reaches a user
   carrying the markers of machine-written prose (em dashes, markdown
   emphasis, assistant openers and sign-offs, generated-sounding
   vocabulary), while genuine formatting like bullet lists survives.

2. The client's request/response handling — retries, timeouts, JSON mode,
   and the google-genai compatibility shim.

No network. The HTTP layer is stubbed at ``requests.Session.post``.
"""

from __future__ import annotations

import json
import sys
import os
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.ai.llm_client import (  # noqa: E402
    LLMClient, humanize_text, strip_json_fences, cache_key,
)

EM = "—"   # em dash
EN = "–"   # en dash


# ── humanize_text ────────────────────────────────────────────────────

class TestHumanizerDashes:

    def test_em_dash_becomes_comma(self):
        out = humanize_text(f"Docker is a platform{EM}it packages apps.")
        assert EM not in out
        assert "platform, it packages apps." in out

    def test_en_dash_removed(self):
        assert EN not in humanize_text(f"The build {EN} finally {EN} passed.")

    def test_spaced_hyphen_becomes_comma(self):
        out = humanize_text("Flask is small - it only does routing.")
        assert "small, it only does routing" in out

    def test_numeric_range_keeps_its_hyphen(self):
        """'10 - 20 minutes' is a range, not an em dash."""
        assert "10 - 20" in humanize_text("The call runs 10 - 20 minutes.")

    def test_hyphenated_word_survives(self):
        assert "well-being" in humanize_text("We discussed well-being today.")

    def test_bullet_hyphens_survive(self):
        text = "- First point\n- Second point"
        out = humanize_text(text)
        assert out.count("\n- ") == 1
        assert out.startswith("- First point")

    def test_em_dash_bullet_becomes_hyphen_bullet(self):
        out = humanize_text(f"{EM} First point\n{EM} Second point")
        assert EM not in out
        assert out.startswith("- First point")


class TestHumanizerVoice:

    def test_opener_stripped(self):
        assert humanize_text("Certainly! The answer is 42.") == "The answer is 42."

    def test_stacked_openers_stripped(self):
        out = humanize_text("Sure! I would be happy to help. The answer is 42.")
        assert out == "The answer is 42."

    def test_signoff_stripped(self):
        out = humanize_text("Redis caches sessions. I hope this helps!")
        assert out == "Redis caches sessions."

    def test_let_me_know_stripped(self):
        out = humanize_text("Done. Let me know if you need anything else.")
        assert out == "Done."

    def test_as_an_ai_stripped(self):
        out = humanize_text("As an AI language model, I cannot browse.")
        assert "AI" not in out
        assert out == "I cannot browse."

    def test_worth_noting_filler_stripped_and_recapitalised(self):
        out = humanize_text("Speed matters. It is important to note that caching helps.")
        assert "important to note" not in out
        assert "Caching helps." in out


class TestHumanizerVocabulary:

    @pytest.mark.parametrize("bad,good", [
        ("delve", "look"),
        ("tapestry", "mix"),
        ("leverage", "use"),
        ("utilize", "use"),
        ("robust", "solid"),
        ("seamless", "smooth"),
    ])
    def test_word_swapped(self, bad, good):
        out = humanize_text(f"We should {bad} the system.").lower()
        assert bad not in out
        assert good in out

    def test_a_myriad_of_reads_naturally(self):
        """'myriad' -> 'many' alone would produce 'a many of tools'."""
        out = humanize_text("We can use a myriad of tools.")
        assert "many tools" in out
        assert "a many" not in out

    def test_case_is_preserved(self):
        assert humanize_text("Furthermore, it works.").startswith("Also,")


class TestHumanizerFormatting:

    def test_markdown_bold_flattened(self):
        assert humanize_text("The **key** point.") == "The key point."

    def test_markdown_heading_flattened(self):
        assert humanize_text("### Summary\nIt works.") == "Summary\nIt works."

    def test_wrapping_quotes_removed(self):
        assert humanize_text('"Welcome aboard."') == "Welcome aboard."

    def test_blank_lines_between_sections_survive(self):
        out = humanize_text("- One\n\nKEY DECISIONS:\n- Two")
        assert "KEY DECISIONS:" in out
        assert "\n\n" in out


class TestHumanizerSafety:

    @pytest.mark.parametrize("value", ["", None])
    def test_empty_input(self, value):
        assert humanize_text(value) == ""

    def test_never_raises_on_odd_input(self):
        # Unbalanced markdown, stray dashes, control chars.
        assert humanize_text(f"**unclosed {EM}{EM} \x00 -") is not None


# ── strip_json_fences / cache_key ────────────────────────────────────

class TestHelpers:

    def test_strip_json_fence(self):
        assert strip_json_fences('```json\n{"a": 1}\n```') == '{"a": 1}'

    def test_strip_bare_fence(self):
        assert strip_json_fences('```\n{"a": 1}\n```') == '{"a": 1}'

    def test_unfenced_untouched(self):
        assert strip_json_fences('{"a": 1}') == '{"a": 1}'

    def test_cache_key_is_stable_and_short(self):
        assert cache_key("a", 1) == cache_key("a", 1)
        assert cache_key("a", 1) != cache_key("a", 2)
        assert len(cache_key("a", 1)) == 32


# ── LLMClient ────────────────────────────────────────────────────────

def _client() -> LLMClient:
    return LLMClient(api_key="test-key", base_url="https://example.test",
                     model="deepseek-chat", retries=1)


def _ok(content: str, total_tokens: int = 10):
    resp = MagicMock()
    resp.status_code = 200
    resp.json.return_value = {
        "choices": [{"message": {"content": content}}],
        "usage": {"total_tokens": total_tokens},
    }
    return resp


def _err(status: int):
    resp = MagicMock()
    resp.status_code = status
    resp.text = "boom"
    resp.headers = {}
    return resp


class TestClientCore:

    def test_complete_returns_humanized_text(self):
        c = _client()
        with patch.object(c._get_session(), "post",
                          return_value=_ok(f"Certainly! It works{EM}well.")):
            out = c.complete("hi")
        assert out == "It works, well."

    def test_no_api_key_returns_none(self):
        c = LLMClient(api_key="", base_url="https://example.test")
        assert c.complete("hi") is None

    def test_stats_track_calls_and_tokens(self):
        c = _client()
        with patch.object(c._get_session(), "post", return_value=_ok("ok", 42)):
            c.complete("hi")
        assert c.stats() == {"calls": 1, "tokens": 42, "errors": 0}

    def test_max_tokens_and_temperature_reach_the_payload(self):
        c = _client()
        with patch.object(c._get_session(), "post", return_value=_ok("ok")) as post:
            c.complete("hi", max_tokens=123, temperature=0.42)
        payload = post.call_args.kwargs["json"]
        assert payload["max_tokens"] == 123
        assert payload["temperature"] == 0.42

    def test_house_style_is_prepended_as_a_system_turn(self):
        c = _client()
        with patch.object(c._get_session(), "post", return_value=_ok("ok")) as post:
            c.complete("hi", system="Be brief.")
        messages = post.call_args.kwargs["json"]["messages"]
        assert messages[0]["role"] == "system"
        assert "Never use em dashes" in messages[0]["content"]
        assert "Be brief." in messages[0]["content"]

    def test_multi_turn_messages_are_passed_through(self):
        c = _client()
        turns = [{"role": "user", "content": "a"},
                 {"role": "assistant", "content": "b"},
                 {"role": "user", "content": "c"}]
        with patch.object(c._get_session(), "post", return_value=_ok("ok")) as post:
            c.chat(turns)
        sent = post.call_args.kwargs["json"]["messages"]
        assert sent[-3:] == turns


class TestClientRetries:

    def test_retries_on_429_then_succeeds(self):
        c = _client()
        with patch.object(c._get_session(), "post",
                          side_effect=[_err(429), _ok("recovered")]), \
             patch("utils.ai.llm_client.time.sleep"):
            assert c.complete("hi") == "Recovered"

    def test_retries_on_5xx(self):
        c = _client()
        with patch.object(c._get_session(), "post",
                          side_effect=[_err(503), _ok("recovered")]), \
             patch("utils.ai.llm_client.time.sleep"):
            assert c.complete("hi") == "Recovered"

    def test_does_not_retry_on_401(self):
        """An auth failure is our bug; retrying just spends the rate limit."""
        c = _client()
        with patch.object(c._get_session(), "post",
                          return_value=_err(401)) as post:
            assert c.complete("hi") is None
        assert post.call_count == 1

    def test_network_error_returns_none(self):
        c = _client()
        with patch.object(c._get_session(), "post",
                          side_effect=OSError("connection reset")), \
             patch("utils.ai.llm_client.time.sleep"):
            assert c.complete("hi") is None
        assert c.error_count > 0

    def test_timeout_is_a_total_budget_not_per_attempt(self):
        """Blocking routes bound the whole operation, retries included."""
        c = LLMClient(api_key="k", base_url="https://example.test", retries=5)
        clock = {"t": 0.0}

        def _advance(*_a, **_kw):
            clock["t"] += 1.5     # each attempt burns 1.5s
            raise OSError("timed out")

        with patch.object(c._get_session(), "post", side_effect=_advance), \
             patch("utils.ai.llm_client.time.monotonic", lambda: clock["t"]), \
             patch("utils.ai.llm_client.time.sleep"):
            assert c.complete("hi", timeout=4.0) is None

        # 4s budget / 1.5s per attempt — must stop well before all 6 retries.
        assert c.error_count <= 3, c.error_count

    def test_remaining_budget_caps_the_socket_timeout(self):
        c = _client()
        with patch.object(c._get_session(), "post", return_value=_ok("ok")) as post:
            c.complete("hi", timeout=2.0)
        connect_timeout, read_timeout = post.call_args.kwargs["timeout"]
        assert read_timeout <= 2.0
        assert connect_timeout <= 2.0


class TestClientJsonMode:

    def test_complete_json_parses_object(self):
        c = _client()
        with patch.object(c._get_session(), "post",
                          return_value=_ok('{"sentiment": "negative"}')):
            assert c.complete_json("classify this json") == {"sentiment": "negative"}

    def test_json_mode_sets_response_format(self):
        c = _client()
        with patch.object(c._get_session(), "post", return_value=_ok("{}")) as post:
            c.complete_json("classify this json")
        assert post.call_args.kwargs["json"]["response_format"] == {"type": "json_object"}

    def test_json_word_is_injected_when_missing(self):
        """DeepSeek's JSON mode 400s unless the prompt says 'json'."""
        c = _client()
        with patch.object(c._get_session(), "post", return_value=_ok("{}")) as post:
            c.complete_json("classify the mood")
        prompt = post.call_args.kwargs["json"]["messages"][-1]["content"]
        assert "json" in prompt.lower()

    def test_malformed_json_returns_none(self):
        c = _client()
        with patch.object(c._get_session(), "post", return_value=_ok("not json at all")):
            assert c.complete_json("give me json") is None

    def test_expect_list_unwraps_the_object(self):
        """JSON mode always returns an object; a caller wanting an array
        gets it under whatever key the model chose."""
        c = _client()
        with patch.object(c._get_session(), "post",
                          return_value=_ok('{"violations": [{"i": 1}]}')):
            assert c.complete_json("json", expect=list) == [{"i": 1}]

    def test_json_output_is_not_humanized(self):
        """The humanizer would rewrite words inside the payload."""
        c = _client()
        raw = '{"answer": "We should leverage Docker"}'
        with patch.object(c._get_session(), "post", return_value=_ok(raw)):
            out = c.complete_json("json")
        assert out["answer"] == "We should leverage Docker"
