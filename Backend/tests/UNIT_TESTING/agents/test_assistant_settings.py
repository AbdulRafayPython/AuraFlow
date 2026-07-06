"""
Assistant-specific settings tests.

Verifies that ``allow_jokes`` and ``allow_motivation`` gate the lexicon
branches, that ``reply_style`` propagates into the Gemini prompt + output
cap, and that ``use_gemini`` short-circuits the Gemini call entirely.
"""

from __future__ import annotations

from unittest.mock import patch, MagicMock


def _build_agent_with_gemini(monkeypatch_text: str):
    """Construct an AssistantAgent with a stubbed Gemini client that
    returns ``monkeypatch_text``."""
    from agents.assistant import AssistantAgent

    a = AssistantAgent()
    a.gemini_available = True
    fake_client = MagicMock()
    fake_resp = MagicMock()
    fake_resp.text = monkeypatch_text
    fake_client.models.generate_content.return_value = fake_resp
    a.gemini_client = fake_client
    return a


def test_allow_jokes_false_returns_polite_refusal():
    a = _build_agent_with_gemini("ignored")  # Gemini stub not exercised here

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
    # No Gemini call should have happened — we returned on the lexicon branch.
    a.gemini_client.models.generate_content.assert_not_called()


def test_allow_motivation_false_returns_polite_refusal():
    a = _build_agent_with_gemini("ignored")

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


def test_use_gemini_false_skips_gemini_call():
    a = _build_agent_with_gemini("should not be called")

    with patch("agents.assistant.get_personal_settings",
               return_value={
                   'use_gemini': False, 'reply_style': 'concise',
                   'max_history': 5, 'allow_jokes': True,
                   'allow_motivation': True, 'memory_paused': False,
               }), \
         patch.object(a, "_log"):
        out = a.ask("what is the weather like?", user_id=1)

    # Falls through to fallback bank — never calls Gemini.
    a.gemini_client.models.generate_content.assert_not_called()
    assert out['source'] == 'fallback'


def test_reply_style_detailed_uses_longer_cap_than_concise():
    """The Gemini output cap should grow when reply_style='detailed'."""
    a = _build_agent_with_gemini("x" * 1500)  # long reply

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


def test_random_joke_blocked_by_allow_jokes_false():
    from agents.assistant import AssistantAgent
    a = AssistantAgent()
    with patch("agents.assistant.get_personal_settings",
               return_value={'allow_jokes': False, 'allow_motivation': True}):
        out = a.random_joke(user_id=1)
    assert out.get('tag') == 'joke_disabled'
