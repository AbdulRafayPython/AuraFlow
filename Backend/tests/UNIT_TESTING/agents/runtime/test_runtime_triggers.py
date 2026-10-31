"""Trigger matching: which agents wake up for which message."""
from __future__ import annotations

import pytest

from agents.runtime.definitions import AgentDefinition, TriggerDef
from agents.runtime.triggers import (
    match_member_joined, match_message, mentioned_usernames, strip_mentions)


def agent(id=1, username="aura", community_id=None, triggers=(), channel_ids=None, bot_user_id=None):
    return AgentDefinition(
        id=id, public_id=f"pub-{id}", bot_user_id=bot_user_id or 100 + id, bot_username=username,
        name=username.title(), community_id=community_id, triggers=tuple(triggers),
        permissions={"channel_ids": channel_ids} if channel_ids else {})


MENTION = TriggerDef(id=1, type="mention")


def event(content="hello", channel_id=11, community_id=3, **kw):
    return {"content": content, "channel_id": channel_id, "community_id": community_id, **kw}


# ── mentions ────────────────────────────────────────────────────────────

@pytest.mark.parametrize("text,expected", [
    ("@aura hi", {"aura"}),
    ("hey @Aura, @faq_bot please", {"aura", "faq_bot"}),
    ("mail me at sam@aura.com", set()),          # an email is not a mention
    ("@@aura", set()),
    ("no mention here", set()),
    ("", set()),
])
def test_mentioned_usernames(text, expected):
    assert mentioned_usernames(text) == expected


@pytest.mark.parametrize("text,expected", [
    ("@aura what is up", "what is up"),
    ("hey @Aura, summarize this", "hey summarize this"),
    ("@aura", ""),
    ("ask @aurora not aura", "ask @aurora not aura"),    # different username untouched
])
def test_strip_mentions(text, expected):
    assert strip_mentions(text, "aura") == expected


def test_mention_wakes_the_agent():
    a = agent(triggers=[MENTION])
    [m] = match_message(event("@aura hi"), [a])
    assert m.definition is a and m.kind == "mention"


def test_no_mention_no_match():
    assert match_message(event("hello team"), [agent(triggers=[MENTION])]) == []


def test_mention_of_another_agent_does_not_wake_this_one():
    a, b = agent(1, "aura", triggers=[MENTION]), agent(2, "faq_bot", triggers=[MENTION])
    [m] = match_message(event("@faq_bot hi"), [a, b])
    assert m.definition is b


def test_two_agents_mentioned_both_wake():
    a, b = agent(1, "aura", triggers=[MENTION]), agent(2, "faq_bot", triggers=[MENTION])
    assert {m.definition.id for m in match_message(event("@aura @faq_bot hi"), [a, b])} == {1, 2}


def test_reply_to_an_agents_message_counts_as_talking_to_it():
    a = agent(bot_user_id=500, triggers=[MENTION])
    [m] = match_message(event("and what about fees?"), [a], reply_parent_bot_id=500)
    assert m.kind == "reply"
    assert match_message(event("and what about fees?"), [a], reply_parent_bot_id=999) == []


def test_mention_beats_reply_when_both_apply():
    a = agent(bot_user_id=500, triggers=[MENTION])
    [m] = match_message(event("@aura and fees?"), [a], reply_parent_bot_id=500)
    assert m.kind == "mention"


# ── keyword / channel_message ───────────────────────────────────────────

def test_keyword_matches_whole_words_case_insensitively():
    t = TriggerDef(id=2, type="keyword", config={"keywords": ["fees", "deadline"]})
    a = agent(triggers=[t])
    assert match_message(event("When is the DEADLINE?"), [a])[0].kind == "keyword"
    assert match_message(event("the feesome crowd"), [a]) == []        # not a whole word
    assert match_message(event("nothing relevant"), [a]) == []


def test_keyword_trigger_without_keywords_never_fires():
    assert match_message(event("anything"), [agent(triggers=[TriggerDef(id=2, type="keyword", config={})])]) == []


def test_channel_message_fires_for_every_message_in_scope():
    a = agent(triggers=[TriggerDef(id=3, type="channel_message", channel_id=11)])
    assert match_message(event("whatever", channel_id=11), [a])[0].kind == "channel_message"
    assert match_message(event("whatever", channel_id=12), [a]) == []


def test_one_match_per_agent_uses_the_strongest_reason():
    a = agent(triggers=[MENTION, TriggerDef(id=2, type="keyword", config={"keywords": ["fees"]}),
                        TriggerDef(id=3, type="channel_message")])
    matches = match_message(event("@aura fees?"), [a])
    assert len(matches) == 1 and matches[0].kind == "mention"
    assert match_message(event("fees?"), [a])[0].kind == "keyword"
    assert match_message(event("hello"), [a])[0].kind == "channel_message"


# ── scope ───────────────────────────────────────────────────────────────

def test_community_agent_ignores_other_communities():
    a = agent(community_id=3, triggers=[MENTION])
    assert match_message(event("@aura hi", community_id=3), [a])
    assert match_message(event("@aura hi", community_id=4), [a]) == []


def test_global_agent_works_in_any_community():
    a = agent(community_id=None, triggers=[MENTION])
    assert match_message(event("@aura hi", community_id=99), [a])


def test_channel_allowlist_restricts_where_the_agent_answers():
    a = agent(triggers=[MENTION], channel_ids=[11, 12])
    assert match_message(event("@aura hi", channel_id=11), [a])
    assert match_message(event("@aura hi", channel_id=13), [a]) == []


def test_trigger_pinned_to_a_channel():
    a = agent(triggers=[TriggerDef(id=1, type="mention", channel_id=11)])
    assert match_message(event("@aura hi", channel_id=11), [a])
    assert match_message(event("@aura hi", channel_id=12), [a]) == []


def test_disabled_trigger_is_ignored():
    a = agent(triggers=[TriggerDef(id=1, type="mention", enabled=False)])
    assert match_message(event("@aura hi"), [a]) == []


def test_agent_without_triggers_never_matches():
    assert match_message(event("@aura hi"), [agent(triggers=[])]) == []


# ── member joined ───────────────────────────────────────────────────────

def test_member_joined_trigger():
    a = agent(community_id=3, triggers=[TriggerDef(id=5, type="member_joined")])
    ev = {"community_id": 3, "first_channel_id": 20, "user_id": 9}
    [m] = match_member_joined(ev, [a])
    assert m.kind == "member_joined"
    assert match_member_joined({**ev, "community_id": 4}, [a]) == []
    # a mention-only agent does not greet newcomers
    assert match_member_joined(ev, [agent(triggers=[MENTION])]) == []


# ── personal agents answer only their owner ─────────────────────────────

def personal(owner=7, **kw):
    return AgentDefinition(id=9, public_id="pub-9", bot_user_id=509, bot_username="myagent", name="Mine",
                           owner_user_id=owner, community_id=None, triggers=(MENTION,), **kw)


def test_personal_agent_answers_its_owner():
    assert match_message(event("@myagent hi", user_id=7), [personal()])


def test_personal_agent_ignores_everyone_else():
    assert match_message(event("@myagent hi", user_id=8), [personal()]) == []
    assert match_message(event("@myagent hi"), [personal()]) == []          # no user at all


def test_builtin_agent_answers_everyone():
    builtin = AgentDefinition(id=1, public_id="pub-1", bot_user_id=500, bot_username="aura", name="Aura",
                              template_key="aura", owner_user_id=1, triggers=(MENTION,))
    assert match_message(event("@aura hi", user_id=8), [builtin])


def test_member_joined_needs_the_agents_own_community():
    greeter = AgentDefinition(id=2, public_id="p2", bot_user_id=502, bot_username="g", name="G",
                              community_id=3, triggers=(TriggerDef(id=5, type="member_joined"),))
    other = AgentDefinition(id=3, public_id="p3", bot_user_id=503, bot_username="h", name="H",
                            community_id=None, owner_user_id=1, triggers=(TriggerDef(id=6, type="member_joined"),))
    ev = {"community_id": 3, "first_channel_id": 20, "user_id": 9}
    assert [m.definition.id for m in match_member_joined(ev, [greeter, other])] == [2]
