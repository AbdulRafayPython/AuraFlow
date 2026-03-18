"""
AuraFlow AI Agents Package
===========================
Intelligent agents for enhanced communication experience.
Agents are imported from their individual modules (e.g. agents.mood_tracker)
to avoid loading heavy ML dependencies at startup.
"""

__all__ = [
    'SummarizerAgent',
    'MoodTrackerAgent',
    'ModerationAgent',
    'WellnessAgent',
    'EngagementAgent',
    'KnowledgeBuilderAgent',
    'FocusAgent'
]


def __getattr__(name: str):
    """Lazy import: only load an agent class when accessed via the package."""
    _map = {
        'SummarizerAgent': '.summarizer',
        'MoodTrackerAgent': '.mood_tracker',
        'ModerationAgent': '.moderation',
        'WellnessAgent': '.wellness',
        'EngagementAgent': '.engagement',
        'KnowledgeBuilderAgent': '.knowledge_builder',
        'FocusAgent': '.focus',
    }
    if name in _map:
        import importlib
        mod = importlib.import_module(_map[name], __name__)
        return getattr(mod, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
