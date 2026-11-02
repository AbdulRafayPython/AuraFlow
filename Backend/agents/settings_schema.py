"""
Settings of the built-in agents: one definition for the form, the checks and the defaults
=========================================================================================
Each agent has a short list of settings a person can change (a switch, a slider, a choice).
This file is the single place that says what they are: the label and help text the form
shows, the allowed range or choices, and the default.

* ``validators()`` builds the checks ``routes/agents.py`` applies when settings are saved,
  so the form can never offer a value the server then refuses.
* ``schema()`` is what ``GET /api/agents/settings-schema`` returns, so the pages draw their
  forms from it instead of keeping their own copy.
* The defaults here must equal the ``*_DEFAULTS`` each agent reads; a test compares them.

Agents are keyed by their ``agent_registry`` name (``mood``, ``knowledge``); the longer
``mood_tracker`` / ``knowledge_builder`` are aliases the API accepts.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

TOGGLE, NUMBER, CHOICE, TEXT = "toggle", "number", "choice", "text"

LANGUAGES = (
    ("en", "English"), ("ur", "Urdu"), ("hi", "Hindi"), ("es", "Spanish"), ("fr", "French"),
    ("de", "German"), ("ar", "Arabic"), ("zh-CN", "Chinese"), ("pt", "Portuguese"),
    ("ru", "Russian"), ("ja", "Japanese"), ("tr", "Turkish"), ("id", "Indonesian"), ("bn", "Bengali"),
)


def toggle(key: str, label: str, help: str, default: bool) -> Dict[str, Any]:
    return {"key": key, "kind": TOGGLE, "label": label, "help": help, "default": default}


def number(key: str, label: str, help: str, default: int, lo: int, hi: int, step: int = 1) -> Dict[str, Any]:
    return {"key": key, "kind": NUMBER, "label": label, "help": help, "default": default,
            "min": lo, "max": hi, "step": step}


def choice(key: str, label: str, help: str, default: str, options: Tuple[Tuple[str, str], ...]) -> Dict[str, Any]:
    return {"key": key, "kind": CHOICE, "label": label, "help": help, "default": default,
            "options": [{"value": v, "label": t} for v, t in options]}


def text(key: str, label: str, help: str, default: str, hidden: bool = False) -> Dict[str, Any]:
    return {"key": key, "kind": TEXT, "label": label, "help": help, "default": default, "hidden": hidden}


SEVERITY = (("low", "Low"), ("medium", "Medium"), ("high", "High"), ("critical", "Critical"))
SUMMARY_LENGTH = (("brief", "Brief"), ("standard", "Standard"), ("detailed", "Detailed"))
MOOD_LANGUAGE = (("english", "English"), ("roman_urdu", "Roman Urdu"), ("auto", "Detect automatically"))

FIELDS: Dict[str, List[Dict[str, Any]]] = {
    "moderation": [
        toggle("auto_filter", "Remove harmful messages automatically", "Acts on clearly harmful messages without waiting for an admin.", True),
        number("sensitivity", "Sensitivity", "Higher catches more, but may flag harmless messages.", 7, 1, 10),
        choice("severity_threshold", "How serious before acting", "Messages this serious or worse are flagged.", "medium", SEVERITY),
        toggle("notify_admins", "Tell admins when something is flagged", "Sends a notification to the community's admins.", True),
        toggle("roman_urdu_support", "Understand Roman Urdu", "Also checks messages written in Roman Urdu.", True),
        number("max_warnings", "Warnings before a block", "A member is blocked after this many warnings.", 3, 1, 10),
    ],
    "engagement": [
        toggle("auto_analyze", "Check the community regularly", "Looks at activity on its own and nudges quiet channels.", True),
        number("analysis_interval", "How often to check (minutes)", "Time between automatic checks.", 30, 10, 120, 5),
        toggle("track_threads", "Follow conversation threads", "Counts replies and thread depth in its reports.", True),
        toggle("leaderboard", "Show top contributors", "Adds a contributor ranking to its reports.", True),
        toggle("inactivity_alerts", "Alert on inactive members", "Flags members who have gone quiet for a while.", False),
    ],
    "knowledge": [
        toggle("auto_extract", "Collect knowledge automatically", "Saves FAQs, definitions and decisions from chats on its own.", True),
        number("extraction_interval_hours", "How often to collect (hours)", "Time between automatic scans of recent chats.", 2, 1, 12),
        number("min_quality_score", "Quality needed to save (1 to 10)", "Higher keeps only the clearest entries.", 5, 1, 10),
        toggle("auto_categorize", "Sort entries into categories", "Tags each saved entry with a category.", True),
    ],
    "summarizer": [
        toggle("auto_summarize_enabled", "Summarize on a schedule", "Posts a recap of the day automatically.", False),
        text("schedule_time", "Time of the daily recap", "24-hour time, for example 21:00.", "21:00"),
        number("auto_summarize_message_count", "Messages to cover", "How many recent messages each recap looks at.", 200, 50, 200, 10),
        choice("summary_length", "How long a summary is", "Brief is a few lines, detailed lists every topic.", "standard", SUMMARY_LENGTH),
        toggle("include_topics", "List the main topics", "Adds a short list of what was discussed.", True),
        toggle("include_action_items", "List action items", "Adds who has to do what, when it came up.", True),
        text("last_auto_summary_date", "Last automatic recap", "Kept by the scheduler.", "", hidden=True),
    ],
    "mood": [
        toggle("track_per_message", "Read every message", "Records a mood reading for each message instead of once in a while.", True),
        toggle("alert_negative_trend", "Notice low spells", "Quietly flags when recent messages trend low. Only you see this.", True),
        number("sensitivity", "Sensitivity", "Higher notices smaller changes in mood.", 7, 1, 10),
        choice("language", "Language", "Which language your messages are mostly in.", "auto", MOOD_LANGUAGE),
    ],
    "wellness": [
        toggle("auto_check", "Check in automatically", "Watches for stress patterns on its own.", True),
        toggle("break_reminders", "Send break reminders", "Suggests short breaks during long sessions.", True),
        number("check_interval_hours", "How often to check (hours)", "Time between automatic check-ins.", 1, 1, 8),
        toggle("burnout_detection", "Watch for burnout", "Looks for signs of overwork and reaches out privately.", True),
    ],
    "focus": [
        toggle("auto_analyze", "Check focus automatically", "Watches how on-topic conversations stay.", True),
        toggle("session_reminders", "Remind about focus sessions", "Nudges at the start of a focus session.", True),
        number("analyze_threshold", "Messages before it checks", "It waits until a channel has this many new messages.", 50, 20, 100, 5),
        toggle("daily_reports", "Send a daily focus report", "A short summary once a day.", True),
    ],
    "auto_message": [
        toggle("welcome_enabled", "Welcome new members", "Greets people with a friendly message when they join.", True),
        toggle("post_in_default_channel", "Post welcomes in the main channel", "Otherwise the welcome is sent quietly to the member.", True),
        toggle("quick_replies_enabled", "Suggest quick replies", "Offers one-tap reply suggestions to keep chats flowing.", True),
        toggle("use_gemini_polish", "Use smarter AI wording", "Lets the AI refine the welcome for a more natural tone.", True),
    ],
    "support": [
        number("min_score", "How sure before answering (1 to 10)", "Higher means it only answers when it is more sure.", 2, 1, 10),
        number("max_docs", "Saved documents to search", "How many saved entries it looks through for each question.", 500, 100, 1000, 50),
        toggle("use_gemini_polish", "Use smarter AI wording", "Lets the AI turn a match into a clear answer.", True),
        toggle("show_sources", "Show where answers came from", "Adds a small note pointing to the source.", True),
    ],
    "translator": [
        choice("default_target", "Translate into", "The language messages are translated into by default.", "en", LANGUAGES),
        toggle("auto_detect", "Detect the original language", "Works out what language a message is written in.", True),
        toggle("cache_enabled", "Remember repeated translations", "Reuses a translation for the same text.", True),
    ],
}

# The API also accepts the longer names the older pages used.
ALIASES = {"mood_tracker": "mood", "knowledge_builder": "knowledge"}


def agent_key(name: str) -> str:
    return ALIASES.get(name, name)


def schema() -> Dict[str, List[Dict[str, Any]]]:
    """Every agent's fields, hidden ones left out (they are kept by the system, not edited)."""
    return {agent: [f for f in fields if not f.get("hidden")] for agent, fields in FIELDS.items()}


def defaults_for(agent: str) -> Dict[str, Any]:
    return {f["key"]: f["default"] for f in FIELDS.get(agent_key(agent), [])}


def validators() -> Dict[str, Dict[str, Tuple[type, Optional[int], Optional[int], Optional[tuple]]]]:
    """``{agent: {key: (python_type, min, max, choices)}}``, the shape ``_coerce_setting`` reads."""
    out: Dict[str, Dict[str, tuple]] = {}
    for agent, fields in FIELDS.items():
        checks: Dict[str, tuple] = {}
        for f in fields:
            kind = f["kind"]
            if kind == TOGGLE:
                checks[f["key"]] = (bool, None, None, None)
            elif kind == NUMBER:
                checks[f["key"]] = (int, f["min"], f["max"], None)
            elif kind == CHOICE:
                checks[f["key"]] = (str, None, None, tuple(o["value"] for o in f["options"]))
            else:
                checks[f["key"]] = (str, None, None, None)
        out[agent] = checks
    return out
