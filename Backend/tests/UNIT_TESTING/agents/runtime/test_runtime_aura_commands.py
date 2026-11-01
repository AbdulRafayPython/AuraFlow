"""/ask, /joke and /motivation are answered by Aura, and @assistant still reaches her."""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from agents import orchestrator
from agents.runtime import aura_ask
from agents.runtime.definitions import AgentDefinition, TriggerDef
from agents.runtime.triggers import BUILTIN_ALIASES, match_message, mention_names, strip_mentions
from tasks.agent_runtime_tasks import build_user_message


def aura(**kw):
    return AgentDefinition(id=1, public_id="p", bot_user_id=500, bot_username="aura", name="Aura",
                           template_key="aura", triggers=(TriggerDef(id=1, type="mention"),), **kw)


def custom(username="faq_bot"):
    return AgentDefinition(id=2, public_id="q", bot_user_id=501, bot_username=username, name="FAQ",
                           community_id=3, triggers=(TriggerDef(id=2, type="mention"),))


# ── @assistant still reaches Aura ───────────────────────────────────────

def test_aura_answers_to_her_handle_and_to_the_old_assistant_name():
    assert mention_names(aura()) == ["aura", "assistant"] and BUILTIN_ALIASES == ("assistant",)
    for text in ("@aura hi", "@assistant hi", "hey @Assistant, what is up"):
        [m] = match_message({"content": text, "channel_id": 11, "community_id": 3}, [aura()])
        assert m.kind == "mention"


def test_other_agents_do_not_get_the_alias():
    assert mention_names(custom()) == ["faq_bot"]
    assert match_message({"content": "@assistant hi", "channel_id": 11, "community_id": 3}, [custom()]) == []
    assert match_message({"content": "@assistant hi", "channel_id": 11, "community_id": 3},
                         [custom("assistant")])                      # a user's own agent named "assistant" still works


def test_the_question_loses_either_handle():
    assert build_user_message(aura(), {"type": "mention", "content": "@assistant what is a deadlock?"}) == "what is a deadlock?"
    assert build_user_message(aura(), {"type": "mention", "content": "@aura and @assistant hello"}) == "and hello"
    assert build_user_message(aura(), {"type": "mention", "content": "@assistant"}) == "Hello"


# ── the old Assistant no longer acts on its own ─────────────────────────

def test_the_old_assistant_is_not_registered_with_the_orchestrator():
    assert "assistant" not in orchestrator._REGISTRY
    assert "custom_router" in orchestrator._REGISTRY


# ── answering in the channel ────────────────────────────────────────────

@pytest.fixture
def posted(monkeypatch):
    seen = {}
    monkeypatch.setattr(aura_ask, "ask", lambda uid, q, **kw: seen.update(ask=(uid, q, kw)) or {"reply": "The answer."})
    monkeypatch.setattr(aura_ask, "ensure_aura", lambda: SimpleNamespace(id=9, name="Aura"))
    monkeypatch.setattr(aura_ask, "post_as_agent",
                        lambda defn, channel, text, **kw: seen.update(post=(channel, text, kw)) or {"id": 5, "content": text})
    return seen


def test_the_answer_is_posted_as_aura(posted):
    out = aura_ask.reply_in_channel(7, "what is a deadlock?", 11, username="sarah")
    assert out == {"id": 5, "content": "The answer."}
    assert posted["ask"] == (7, "what is a deadlock?", {"channel_id": 11, "username": "sarah"})
    assert posted["post"] == (11, "The answer.", {"broadcast": True})


def test_the_caller_can_ask_to_broadcast_later(posted):
    aura_ask.reply_in_channel(7, "q", 11, broadcast=False)
    assert posted["post"][2] == {"broadcast": False}


def test_a_problem_is_passed_on_and_nothing_is_posted(monkeypatch):
    def refuse(*a, **k):
        raise aura_ask.AskError("You are not a member of that channel.", 403)

    monkeypatch.setattr(aura_ask, "ask", refuse)
    monkeypatch.setattr(aura_ask, "post_as_agent", lambda *a, **k: pytest.fail("must not post"))
    with pytest.raises(aura_ask.AskError):
        aura_ask.reply_in_channel(7, "q", 11)


def test_the_one_liner_prompts_ask_for_only_the_text():
    assert "joke" in aura_ask.JOKE_PROMPT and "only the joke" in aura_ask.JOKE_PROMPT
    assert "motivational" in aura_ask.MOTIVATION_PROMPT and "only the line" in aura_ask.MOTIVATION_PROMPT


# ── the slash command wrapper (REST path) ───────────────────────────────

def test_the_rest_command_returns_the_payload_for_the_handler_to_send(monkeypatch):
    from routes import messages
    monkeypatch.setattr(aura_ask, "reply_in_channel", lambda *a, **k: {"id": 5, "kw": k})
    out = messages._aura_command("hello", 7, 11, "sarah")
    assert out["success"] is True and out["posted_as_bot"] is True
    assert out["bot_payload"]["kw"] == {"username": "sarah", "broadcast": False}      # sent after the command's own message


def test_the_rest_command_reports_a_problem_to_the_person(monkeypatch):
    from routes import messages

    def refuse(*a, **k):
        raise aura_ask.AskError("You are asking too fast. Wait a minute.", 429)

    monkeypatch.setattr(aura_ask, "reply_in_channel", refuse)
    assert messages._aura_command("hi", 7, 11, "sarah") == {
        "type": "assistant", "success": False, "error": "You are asking too fast. Wait a minute."}


def test_the_rest_command_needs_a_channel():
    from routes import messages
    out = messages._aura_command("hi", 7, None, "sarah")
    assert out["success"] is False and "channel" in out["error"]


def test_a_payload_that_could_not_be_stored_is_an_error(monkeypatch):
    from routes import messages
    monkeypatch.setattr(aura_ask, "reply_in_channel", lambda *a, **k: None)
    assert messages._aura_command("hi", 7, 11, "sarah")["success"] is False
