"""
Trigger matching
================
Pure functions that decide which agents wake up for an event. No database or
network access here (the router passes in everything it needs), which keeps
them cheap enough to run on every message and easy to test.

Trigger types handled here: ``mention``, ``keyword``, ``channel_message``,
``member_joined``, ``channel_silent`` and ``focus_drift``. (``schedule`` is fired by
``agents.runtime.schedules``.)
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Set

from agents.runtime.definitions import AgentDefinition, TriggerDef

_MENTION_RE = re.compile(r"(?<![\w@])@([A-Za-z0-9_]{1,64})")

# Higher wins when one message matches an agent through several triggers.
PRIORITY = {"mention": 4, "reply": 3, "keyword": 2, "channel_message": 1, "member_joined": 1,
            "channel_silent": 1, "focus_drift": 1}


@dataclass(frozen=True)
class TriggerMatch:
    definition: AgentDefinition
    trigger: TriggerDef
    kind: str            # 'mention' | 'reply' | 'keyword' | 'channel_message' | 'member_joined' | 'channel_silent' | 'focus_drift'


def mentioned_usernames(content: str) -> Set[str]:
    return {m.lower() for m in _MENTION_RE.findall(content or "")}


# The old Assistant is gone; people who still write @assistant get Aura.
BUILTIN_ALIASES = ("assistant",)


def mention_names(defn: AgentDefinition) -> List[str]:
    """The names that call this agent: its handle, and for Aura the old @assistant."""
    names = [defn.bot_username.lower()]
    if defn.is_builtin:
        names.extend(BUILTIN_ALIASES)
    return names


def strip_mentions(content: str, username: str) -> str:
    """Remove ``@username`` tokens and tidy the leftover whitespace."""
    cleaned = re.sub(rf"(?<![\w@])@{re.escape(username)}\b[,:]?", "", content or "", flags=re.I)
    return re.sub(r"\s+", " ", cleaned).strip()


def _keyword_hit(text: str, keywords: Iterable[str]) -> bool:
    for kw in keywords:
        kw = (kw or "").strip()
        if kw and re.search(rf"(?<!\w){re.escape(kw)}(?!\w)", text, flags=re.I):
            return True
    return False


def _in_scope(defn: AgentDefinition, trigger: TriggerDef, channel_id: Optional[int],
              community_id: Optional[int], user_id: Optional[int] = None) -> bool:
    if defn.community_id is not None and defn.community_id != community_id:
        return False
    # A personal agent (no community) belongs to its owner; others cannot spend its budget.
    if defn.community_id is None and not defn.is_builtin and user_id != defn.owner_user_id:
        return False
    allow = defn.channel_allowlist
    if allow and channel_id not in allow:
        return False
    if trigger.channel_id is not None and trigger.channel_id != channel_id:
        return False
    return True


def _best(matches: List[TriggerMatch]) -> List[TriggerMatch]:
    """One match per agent: the strongest reason."""
    chosen: Dict[int, TriggerMatch] = {}
    for m in matches:
        cur = chosen.get(m.definition.id)
        if cur is None or PRIORITY[m.kind] > PRIORITY[cur.kind]:
            chosen[m.definition.id] = m
    return list(chosen.values())


def match_message(event: Dict[str, Any], definitions: Iterable[AgentDefinition], *,
                  reply_parent_bot_id: Optional[int] = None) -> List[TriggerMatch]:
    """Agents that should run for a new message.

    ``reply_parent_bot_id`` is the bot user the message replies to (if any); a
    reply to an agent's message counts as talking to that agent.
    """
    content = event.get("content") or ""
    channel_id = event.get("channel_id")
    community_id = event.get("community_id")
    user_id = event.get("user_id")
    mentioned = mentioned_usernames(content)

    found: List[TriggerMatch] = []
    for defn in definitions:
        for trig in defn.triggers:
            if not trig.enabled or not _in_scope(defn, trig, channel_id, community_id, user_id):
                continue
            if trig.type == "mention":
                if mentioned & set(mention_names(defn)):
                    found.append(TriggerMatch(defn, trig, "mention"))
                elif reply_parent_bot_id and reply_parent_bot_id == defn.bot_user_id:
                    found.append(TriggerMatch(defn, trig, "reply"))
            elif trig.type == "keyword":
                if _keyword_hit(content, (trig.config or {}).get("keywords") or []):
                    found.append(TriggerMatch(defn, trig, "keyword"))
            elif trig.type == "channel_message":
                found.append(TriggerMatch(defn, trig, "channel_message"))
    return _best(found)


def match_member_joined(event: Dict[str, Any],
                        definitions: Iterable[AgentDefinition]) -> List[TriggerMatch]:
    community_id = event.get("community_id")
    channel_id = event.get("first_channel_id")
    found: List[TriggerMatch] = []
    for defn in definitions:
        if defn.community_id != community_id:      # greeters belong to one community
            continue
        for trig in defn.triggers:
            if trig.enabled and trig.type == "member_joined" and \
                    (trig.channel_id is None or trig.channel_id == channel_id):
                found.append(TriggerMatch(defn, trig, "member_joined"))
    return _best(found)


def match_channel_event(kind: str, event: Dict[str, Any],
                        definitions: Iterable[AgentDefinition]) -> List[TriggerMatch]:
    """Agents that wake for a channel-level event (``channel_silent`` or ``focus_drift``).

    These events say something about a channel, not about a person, so only agents of that
    community are considered, and only when the trigger covers the channel. A ``channel_silent``
    trigger can ask for a longer silence than the event reports (``config.min_minutes``).
    """
    community_id = event.get("community_id")
    channel_id = event.get("channel_id")
    if community_id is None or channel_id is None:
        return []
    silent = int(event.get("silent_minutes") or 0)
    found: List[TriggerMatch] = []
    for defn in definitions:
        if defn.community_id != community_id:
            continue
        if defn.channel_allowlist and channel_id not in defn.channel_allowlist:
            continue
        for trig in defn.triggers:
            if not trig.enabled or trig.type != kind:
                continue
            if trig.channel_id is not None and trig.channel_id != channel_id:
                continue
            if kind == "channel_silent" and silent < int((trig.config or {}).get("min_minutes") or 0):
                continue
            found.append(TriggerMatch(defn, trig, kind))
    return _best(found)
