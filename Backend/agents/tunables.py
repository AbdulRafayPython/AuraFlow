"""
AuraFlow Agent Tunables — Phase 5.2 catalog
============================================
Per-agent default values + clamp ranges for the "Agent Goals" admin
panel. Each tunable is described by a small dict so the GET endpoint
can return ``{current, defaults, clamps}`` without each agent having
to declare its own schema.

Shape per tunable:
    {
        "default":  <python value, used when no row exists>,
        "type":     "float" | "int" | "enum" | "tuple_hour_range" | "dict_readonly",
        "min":      <float|int>,             # for float/int
        "max":      <float|int>,             # for float/int
        "choices":  [<str>, ...],            # for enum
        "label":    <human-readable name>,
        "help":     <one-line description>,
    }

`AutonomousAgent._apply_clamps()` in ``base.py`` consults this catalog
to coerce values back into range whenever ``learn()`` would otherwise
drift outside the admin-configured window.

The frontend ``AgentGoals.tsx`` page renders one section per agent
using this same catalog — single source of truth, same numbers in the
UI as in the clamp enforcement.
"""

from __future__ import annotations

# Mapping: registered agent NAME → {tunable_key → spec}
TUNABLES: dict[str, dict[str, dict]] = {
    "translator": {
        "expected_language": {
            "default": "en",
            "type": "enum",
            "choices": ["en", "ur", "es", "fr", "ar", "de", "zh", "hi"],
            "label": "Expected Language",
            "help": "Messages in other languages are translated to this one.",
        },
        "min_chars": {
            "default": 6,
            "type": "int",
            "min": 1,
            "max": 50,
            "label": "Minimum Characters",
            "help": "Don't translate messages shorter than this.",
        },
    },
    "support": {
        "score_threshold": {
            "default": 0.30,
            "type": "float",
            "min": 0.10,
            "max": 0.85,
            "label": "Match Threshold",
            "help": "Lower = more aggressive doc matching; raises false positives.",
        },
    },
    "mood_tracker": {
        "escalation_threshold": {
            "default": -0.4,
            "type": "float",
            "min": -0.8,
            "max": 0.0,
            "label": "Escalation Threshold",
            "help": "Sentiment score below this triggers a wellness check-in.",
        },
    },
    "moderation": {
        "severity_threshold": {
            "default": 0.5,
            "type": "float",
            "min": 0.20,
            "max": 0.95,
            "label": "Severity Threshold",
            "help": "Violations at or above this score publish mod.violation.",
        },
    },
    "focus": {
        "drift_threshold": {
            "default": 0.25,
            "type": "float",
            "min": 0.05,
            "max": 0.45,
            "label": "Drift Threshold",
            "help": "Off-topic ratio that fires a focus.drift event.",
        },
    },
    "engagement": {
        "epsilon": {
            "default": 0.25,
            "type": "float",
            "min": 0.0,
            "max": 0.5,
            "label": "Exploration ε",
            "help": "Bandit exploration rate for icebreaker category picks.",
        },
        "category_rewards": {
            "default": {},
            "type": "dict_readonly",
            "label": "Category Rewards",
            "help": "Learned reward per icebreaker category (read-only).",
        },
    },
    "summarizer": {
        "min_messages": {
            "default": 15,
            "type": "int",
            "min": 5,
            "max": 80,
            "label": "Minimum Messages",
            "help": "Don't summarize until this many new messages exist.",
        },
        "summarise_last_n": {
            "default": 80,
            "type": "int",
            "min": 20,
            "max": 200,
            "label": "Window Size",
            "help": "How many recent messages are sent to the LLM each time.",
        },
    },
    "knowledge_builder": {
        "min_messages": {
            "default": 10,
            "type": "int",
            "min": 5,
            "max": 80,
            "label": "Minimum Messages",
            "help": "Don't extract knowledge until this many new messages.",
        },
        "lookback_hours": {
            "default": 2,
            "type": "int",
            "min": 1,
            "max": 12,
            "label": "Lookback (hours)",
            "help": "How far back to scan for facts/decisions.",
        },
    },
    "wellness": {
        "quiet_hours": {
            "default": [23, 6],
            "type": "tuple_hour_range",
            "label": "Quiet Hours",
            "help": "Don't send wellness DMs between these local hours (start, end).",
        },
        "cooldown_multiplier": {
            "default": 1.0,
            "type": "float",
            "min": 0.5,
            "max": 6.0,
            "label": "Cooldown Multiplier",
            "help": "Scales the base cooldown between wellness messages.",
        },
    },
    "auto_message": {
        "epsilon": {
            "default": 0.2,
            "type": "float",
            "min": 0.0,
            "max": 0.5,
            "label": "Exploration ε",
            "help": "Bandit exploration rate for welcome template picks.",
        },
        "template_rewards": {
            "default": {},
            "type": "dict_readonly",
            "label": "Template Rewards",
            "help": "Learned reward per welcome template (read-only).",
        },
    },
    "assistant": {
        "memory_size": {
            "default": 5,
            "type": "int",
            "min": 2,
            "max": 10,
            "label": "Memory Size",
            "help": "How many recent turns to keep in conversation memory.",
        },
        "memory_ttl_seconds": {
            "default": 1800,
            "type": "int",
            "min": 300,
            "max": 3600,
            "label": "Memory TTL (seconds)",
            "help": "How long a conversation memory survives idle.",
        },
    },
}


def defaults_for(agent_name: str) -> dict:
    """Plain ``{key: default}`` map for one agent. Empty dict if unknown."""
    return {k: v.get("default") for k, v in TUNABLES.get(agent_name, {}).items()}


def specs_for(agent_name: str) -> dict:
    """Full per-tunable spec map (with label/help/min/max)."""
    return TUNABLES.get(agent_name, {})


def known_agents() -> list[str]:
    """Names of agents that expose tunables — used to validate the URL
    segment on the state endpoints."""
    return list(TUNABLES.keys())


def apply_clamps(agent_name: str, thresholds: dict,
                 clamps: dict | None = None) -> dict:
    """Coerce ``thresholds`` values back into the admin-configured window.

    ``clamps`` is the optional override sub-dict admins set via the panel:
        {"severity_threshold": {"min": 0.4, "max": 0.7}}
    When a value is outside the override (or, if no override, outside the
    catalog default min/max), it's clipped to the nearest end. Unknown
    keys pass through untouched.

    Returns a *new* dict — does not mutate the input.
    """
    specs = TUNABLES.get(agent_name, {})
    if not specs:
        return dict(thresholds or {})
    clamps = clamps or {}
    out = dict(thresholds or {})
    for key, val in list(out.items()):
        spec = specs.get(key)
        if not spec:
            continue
        t = spec.get("type")
        # Pull catalog min/max as the absolute floor/ceiling, then layer
        # the per-community admin override on top.
        cat_min = spec.get("min")
        cat_max = spec.get("max")
        ov = clamps.get(key) or {}
        eff_min = ov.get("min", cat_min)
        eff_max = ov.get("max", cat_max)

        if t == "float":
            try:
                v = float(val)
            except (TypeError, ValueError):
                continue
            if eff_min is not None:
                v = max(float(eff_min), v)
            if eff_max is not None:
                v = min(float(eff_max), v)
            out[key] = round(v, 3)
        elif t == "int":
            try:
                v = int(val)
            except (TypeError, ValueError):
                continue
            if eff_min is not None:
                v = max(int(eff_min), v)
            if eff_max is not None:
                v = min(int(eff_max), v)
            out[key] = v
        elif t == "enum":
            choices = spec.get("choices") or []
            if choices and val not in choices:
                # Fall back to default rather than dropping the key.
                out[key] = spec.get("default")
        # dict_readonly / tuple_hour_range are not learn()-mutable — leave alone.
    return out
