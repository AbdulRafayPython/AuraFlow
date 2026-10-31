"""
Assistant-specific settings tests.

Verifies that ``allow_jokes`` and ``allow_motivation`` gate the lexicon
branches, that ``reply_style`` propagates into the LLM system prompt +
output cap, and that ``use_gemini`` short-circuits the LLM call entirely.

The ``use_gemini`` settings key keeps its historic name: it is persisted in
``user_agents.settings`` rows and rendered by the frontend, so renaming it
would orphan every saved preference. It gates the LLM regardless of which
provider is wired behind it (DeepSeek since the migration off Gemini).
"""

from __future__ import annotations

from unittest.mock import patch, MagicMock


def _build_agent_with_llm(reply_text: str):
    """Construct an AssistantAgent with a stubbed LLM client that returns
    ``reply_text``."""
    from agents.assistant import AssistantAgent

    a = AssistantAgent()
    fake_client = MagicMock()
    fake_client.chat.return_value = reply_text
    a.llm = fake_client
    a.llm_available = True
    return a


def test_allow_jokes_false_returns_polite_refusal():
    a = _build_agent_with_llm("ignored")  # LLM stub not exercised here

    with patch("agents.assistant.get_personal_settings",
               return_value={
                   'use_gemini': True, 'reply_style': 'concise',
                   'max_history': 5, 'allow_jokes': False,
                   'allow_motivation': True, 'memory_paused': False,
               }), \
         patch.object(a, "_log"):
        out = a.ask("tell me a joke", user_id=1)

    assert out['success'] is True
    assert out.get('tag') == 'joke_disabled'
    # No LLM call should have happened — we returned on the lexicon branch.
    a.llm.chat.assert_not_called()


def test_allow_motivation_false_returns_polite_refusal():
    a = _build_agent_with_llm("ignored")

    with patch("agents.assistant.get_personal_settings",
               return_value={
                   'use_gemini': True, 'reply_style': 'concise',
                   'max_history': 5, 'allow_jokes': True,
                   'allow_motivation': False, 'memory_paused': False,
               }), \
         patch.object(a, "_log"):
        # Use 'quote' — the existing _MOTIVATION_RE expects exact stems
        # like 'motivat', 'inspir', 'quote', 'encourage' as whole words.
        out = a.ask("share a quote", user_id=1)

    assert out.get('tag') == 'motivation_disabled'


def test_use_gemini_false_skips_llm_call():
    a = _build_agent_with_llm("should not be called")

    with patch("agents.assistant.get_personal_settings",
               return_value={
                   'use_gemini': False, 'reply_style': 'concise',
                   'max_history': 5, 'allow_jokes': True,
                   'allow_motivation': True, 'memory_paused': False,
               }), \
         patch.object(a, "_log"):
        out = a.ask("what is the weather like?", user_id=1)

    # Falls through to fallback bank — never calls the LLM.
    a.llm.chat.assert_not_called()
    assert out['source'] == 'fallback'


def test_reply_style_detailed_uses_longer_cap_than_concise():
    """The output cap should grow when reply_style='detailed'."""
    a = _build_agent_with_llm("x" * 1500)  # long reply

    with patch("agents.assistant.get_personal_settings",
               return_value={
                   'use_gemini': True, 'reply_style': 'concise',
                   'max_history': 5, 'allow_jokes': True,
                   'allow_motivation': True, 'memory_paused': False,
               }), \
         patch.object(a, "_log"):
        concise = a.ask("explain something", user_id=1)

    with patch("agents.assistant.get_personal_settings",
               return_value={
                   'use_gemini': True, 'reply_style': 'detailed',
                   'max_history': 5, 'allow_jokes': True,
                   'allow_motivation': True, 'memory_paused': False,
               }), \
         patch.object(a, "_log"):
        detailed = a.ask("explain something", user_id=1)

    assert len(detailed['reply']) > len(concise['reply'])


def test_reply_style_sets_max_tokens_on_the_call():
    """A 'concise' reply must not be billed for 'detailed' tokens."""
    a = _build_agent_with_llm("short answer")

    with patch("agents.assistant.get_personal_settings",
               return_value={
                   'use_gemini': True, 'reply_style': 'concise',
                   'max_history': 5, 'allow_jokes': True,
                   'allow_motivation': True, 'memory_paused': False,
               }), \
         patch.object(a, "_log"):
        a.ask("explain something", user_id=1)

    concise_tokens = a.llm.chat.call_args.kwargs['max_tokens']

    a.llm.chat.reset_mock()
    with patch("agents.assistant.get_personal_settings",
               return_value={
                   'use_gemini': True, 'reply_style': 'detailed',
                   'max_history': 5, 'allow_jokes': True,
                   'allow_motivation': True, 'memory_paused': False,
               }), \
         patch.object(a, "_log"):
        a.ask("explain something", user_id=1)

    assert a.llm.chat.call_args.kwargs['max_tokens'] > concise_tokens


def test_history_is_replayed_as_chat_turns():
    """Rolling memory becomes real user/assistant turns, not a prompt blob."""
    a = _build_agent_with_llm("answer")

    with patch("agents.assistant.get_personal_settings",
               return_value={
                   'use_gemini': True, 'reply_style': 'concise',
                   'max_history': 5, 'allow_jokes': True,
                   'allow_motivation': True, 'memory_paused': False,
               }), \
         patch.object(a, "_log"):
        a.ask("and the second one?", user_id=1,
              context="User: name two databases\nAssistant: MySQL and Redis")

    messages = a.llm.chat.call_args.kwargs['messages']
    assert [m['role'] for m in messages] == ['user', 'assistant', 'user']
    assert messages[0]['content'] == 'name two databases'
    assert messages[1]['content'] == 'MySQL and Redis'
    assert messages[2]['content'] == 'and the second one?'


def test_consecutive_same_role_turns_are_merged():
    """A half-written memory must not produce two user turns in a row."""
    a = _build_agent_with_llm("answer")

    with patch("agents.assistant.get_personal_settings",
               return_value={
                   'use_gemini': True, 'reply_style': 'concise',
                   'max_history': 5, 'allow_jokes': True,
                   'allow_motivation': True, 'memory_paused': False,
               }), \
         patch.object(a, "_log"):
        # Second question stored, its reply lost — two user lines in a row.
        a.ask("third question", user_id=1,
              context="User: first question\nUser: second question")

    messages = a.llm.chat.call_args.kwargs['messages']
    roles = [m['role'] for m in messages]
    assert all(a_ != b for a_, b in zip(roles, roles[1:])), roles
    # Nothing was dropped in the merge.
    joined = ' '.join(m['content'] for m in messages)
    for fragment in ('first question', 'second question', 'third question'):
        assert fragment in joined


def test_random_joke_blocked_by_allow_jokes_false():
    from agents.assistant import AssistantAgent
    a = AssistantAgent()
    with patch("agents.assistant.get_personal_settings",
               return_value={'allow_jokes': False, 'allow_motivation': True}):
        out = a.random_joke(user_id=1)
    assert out.get('tag') == 'joke_disabled'
