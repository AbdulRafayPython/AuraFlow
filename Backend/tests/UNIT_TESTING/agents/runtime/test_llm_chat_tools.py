"""LLMClient.chat_tools: request shape and tool-call parsing."""
from __future__ import annotations

import json
from unittest.mock import MagicMock

from utils.ai.llm_client import LLMClient


def _resp(message, *, usage=None, finish="stop", status=200):
    r = MagicMock()
    r.status_code = status
    r.json.return_value = {
        "model": "m1",
        "choices": [{"message": message, "finish_reason": finish}],
        "usage": usage or {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
    }
    return r


def _client(response):
    c = LLMClient(api_key="k", base_url="http://x", model="m")
    session = MagicMock()
    session.post.return_value = response
    c._get_session = lambda: session
    return c, session


TOOLS = [{"type": "function", "function": {"name": "t", "description": "d",
                                           "parameters": {"type": "object", "properties": {}}}}]


def test_plain_answer():
    c, session = _client(_resp({"role": "assistant", "content": "  hello  "}))
    out = c.chat_tools([{"role": "user", "content": "hi"}], TOOLS, system="SYS")
    assert out.text == "hello"
    assert out.tool_calls == []
    assert out.prompt_tokens == 10 and out.completion_tokens == 5
    payload = session.post.call_args.kwargs["json"]
    assert payload["messages"][0] == {"role": "system", "content": "SYS"}
    assert payload["tools"] == TOOLS and payload["tool_choice"] == "auto"
    assert "response_format" not in payload


def test_no_house_style_is_injected():
    c, session = _client(_resp({"role": "assistant", "content": "x"}))
    c.chat_tools([{"role": "user", "content": "hi"}], TOOLS)
    payload = session.post.call_args.kwargs["json"]
    assert all(m["role"] != "system" for m in payload["messages"])


def test_tool_calls_are_parsed_and_message_is_replayable():
    msg = {"role": "assistant", "content": None, "tool_calls": [
        {"id": "c1", "type": "function",
         "function": {"name": "get_channel_history", "arguments": '{"limit": 5}'}},
        {"id": "c2", "type": "function",
         "function": {"name": "translate_text", "arguments": '{"text": "hi", "target_language": "ur"}'}},
    ]}
    c, _ = _client(_resp(msg, finish="tool_calls"))
    out = c.chat_tools([{"role": "user", "content": "x"}], TOOLS)
    assert [t.name for t in out.tool_calls] == ["get_channel_history", "translate_text"]
    assert out.tool_calls[0].arguments == {"limit": 5}
    assert out.tool_calls[0].id == "c1"
    assert out.finish_reason == "tool_calls"
    assert out.message["role"] == "assistant"
    assert out.message["content"] is None
    assert out.message["tool_calls"][1]["function"]["name"] == "translate_text"
    # the wire message must itself be valid JSON arguments
    json.loads(out.message["tool_calls"][0]["function"]["arguments"])


def test_invalid_json_arguments_are_reported_not_raised():
    msg = {"role": "assistant", "content": None, "tool_calls": [
        {"id": "c1", "type": "function", "function": {"name": "t", "arguments": "{oops"}}]}
    c, _ = _client(_resp(msg))
    call = c.chat_tools([{"role": "user", "content": "x"}], TOOLS).tool_calls[0]
    assert call.arguments == {}
    assert "not valid JSON" in call.error


def test_non_object_arguments_are_reported():
    msg = {"role": "assistant", "content": None, "tool_calls": [
        {"id": "c1", "type": "function", "function": {"name": "t", "arguments": "[1, 2]"}}]}
    c, _ = _client(_resp(msg))
    call = c.chat_tools([{"role": "user", "content": "x"}], TOOLS).tool_calls[0]
    assert call.error == "arguments must be a JSON object"


def test_empty_arguments_mean_no_arguments():
    msg = {"role": "assistant", "content": None, "tool_calls": [
        {"id": "c1", "type": "function", "function": {"name": "t", "arguments": ""}}]}
    c, _ = _client(_resp(msg))
    call = c.chat_tools([{"role": "user", "content": "x"}], TOOLS).tool_calls[0]
    assert call.arguments == {} and call.error is None


def test_humanize_applies_to_final_text_only():
    text = "Here is **bold** text — with a dash."
    c, _ = _client(_resp({"role": "assistant", "content": text}))
    out = c.chat_tools([{"role": "user", "content": "x"}], TOOLS, humanize=True)
    assert "**" not in out.text and "—" not in out.text
    assert out.message["content"] == out.text

    raw, _ = _client(_resp({"role": "assistant", "content": text}))
    assert raw.chat_tools([{"role": "user", "content": "x"}], TOOLS).text == text


def test_http_error_returns_none():
    c, _ = _client(_resp({"role": "assistant", "content": "x"}, status=400))
    assert c.chat_tools([{"role": "user", "content": "x"}], TOOLS) is None


def test_unavailable_without_key(monkeypatch):
    # an empty key falls back to DEEPSEEK_API_KEY from the environment
    monkeypatch.setattr("utils.ai.llm_client.DEEPSEEK_API_KEY", "")
    c = LLMClient(api_key="", base_url="http://x", model="m")
    assert c.available is False
    assert c.chat_tools([{"role": "user", "content": "x"}], TOOLS) is None


def test_no_tools_means_no_tool_fields():
    c, session = _client(_resp({"role": "assistant", "content": "x"}))
    c.chat_tools([{"role": "user", "content": "x"}], None)
    payload = session.post.call_args.kwargs["json"]
    assert "tools" not in payload and "tool_choice" not in payload


def test_token_counters_increment():
    c, _ = _client(_resp({"role": "assistant", "content": "x"}))
    c.chat_tools([{"role": "user", "content": "x"}], TOOLS)
    assert c.stats()["calls"] == 1 and c.stats()["tokens"] == 15
