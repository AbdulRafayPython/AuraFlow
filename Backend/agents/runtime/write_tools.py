"""
Built-in write tools
====================
Tools that change something other people can see. They never run inside the
agent loop: the loop turns the call into an approval request, and
``agents.runtime.approvals`` runs the tool only after the approver agrees.

Authorisation happens twice on purpose: when the request is made (so an
impossible request is refused up front) and again when it is executed (so a
membership that ended while the approval was waiting is respected).

Importing this module registers the tools in ``TOOL_REGISTRY``.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from agents.runtime import permissions
from agents.runtime.tools import RISK_WRITE, ToolContext, ToolError, tool

MAX_POST_CHARS = 2000


def _target_channel(ctx: ToolContext, channel_id: Optional[int]) -> Dict[str, Any]:
    """The channel to post in, after checking that the acting person and the agent may use it."""
    cid = channel_id or ctx.channel_id
    if not cid:
        raise ToolError("channel_id is required because there is no current channel.")
    if not ctx.invoked_by:
        raise ToolError("No user is associated with this run, so nothing can be posted for them.")
    channel = permissions.channel_info(int(cid))
    if channel is None:
        raise ToolError(f"Channel {cid} does not exist.")
    if channel.get("type") == "voice":
        raise ToolError("Messages cannot be posted in a voice channel.")
    if not permissions.can_read_channel(ctx.invoked_by, channel["id"]):
        raise ToolError("Access denied: the person who asked is not a member of that channel.")
    defn = None
    agent_id = ctx.extra.get("agent_id")
    if agent_id:
        from agents.runtime.definitions import get_definition
        defn = get_definition(int(agent_id), include_inactive=True)
    if not permissions.agent_may_act_in_channel(defn, channel):
        raise ToolError("This agent is not allowed to post in that channel.")
    return channel


def _summarize_post(ctx: ToolContext, args: Dict[str, Any]) -> str:
    channel = _target_channel(ctx, args.get("channel_id"))
    text = str(args.get("text") or "").strip()
    shown = text if len(text) <= 300 else text[:299] + "…"
    return f"Post in #{channel['name']}: {shown}"[:500]


@tool(
    "post_message",
    "Post a new message in a channel as this agent. The person must approve it first, "
    "so write the final text exactly as it should appear. Defaults to the current channel.",
    {
        "type": "object",
        "properties": {
            "text": {"type": "string", "minLength": 1, "maxLength": MAX_POST_CHARS,
                     "description": "The message to post."},
            "channel_id": {"type": "integer", "description": "Channel to post in; defaults to the current one."},
        },
        "required": ["text"],
    },
    risk=RISK_WRITE,
    summarize=_summarize_post,
)
def post_message(ctx: ToolContext, text: str, channel_id: Optional[int] = None) -> Dict[str, Any]:
    from agents.runtime.definitions import get_definition
    from agents.runtime.posting import post_as_agent

    channel = _target_channel(ctx, channel_id)
    agent_id = ctx.extra.get("agent_id")
    defn = get_definition(int(agent_id)) if agent_id else None
    if defn is None:
        raise ToolError("The agent is not active, so it cannot post.")
    posted = post_as_agent(defn, channel["id"], text, run_id=ctx.run_id)
    if posted is None:
        raise ToolError("The message could not be posted.")
    return {"posted": True, "message_id": posted["id"], "channel": channel["name"]}


def _reminder_args(text: Any, in_minutes: Any) -> tuple:
    from agents.runtime import reminders
    text = str(text or "").strip()[:reminders.MAX_TEXT_CHARS]
    if not text:
        raise ToolError("A reminder needs some text.")
    if isinstance(in_minutes, bool) or not isinstance(in_minutes, int) or not 1 <= in_minutes <= reminders.MAX_MINUTES:
        raise ToolError(f"in_minutes must be a whole number from 1 to {reminders.MAX_MINUTES} (7 days).")
    return text, in_minutes


def _summarize_reminder(ctx: ToolContext, args: Dict[str, Any]) -> str:
    from agents.runtime import reminders
    channel = _target_channel(ctx, args.get("channel_id"))
    text, minutes = _reminder_args(args.get("text"), args.get("in_minutes"))
    return f"Remind you in #{channel['name']} in {reminders.describe_delay(minutes)}: {text}"[:500]


@tool(
    "schedule_reminder",
    "Remind the person who asked, later, by posting a message that mentions them in a channel. "
    "The person must approve it first. Give the delay as in_minutes (1 to 10080); convert hours or "
    "days yourself. Defaults to the current channel.",
    {
        "type": "object",
        "properties": {
            "text": {"type": "string", "minLength": 1, "maxLength": 300, "description": "Only the subject, for example \"submit the report\". "
                                          "The mention and the word \"reminder\" are added automatically."},
            "in_minutes": {"type": "integer", "minimum": 1, "maximum": 7 * 24 * 60,
                           "description": "Minutes from now."},
            "channel_id": {"type": "integer", "description": "Channel to post in; defaults to the current one."},
        },
        "required": ["text", "in_minutes"],
    },
    risk=RISK_WRITE,
    summarize=_summarize_reminder,
)
def schedule_reminder(ctx: ToolContext, text: str, in_minutes: int,
                      channel_id: Optional[int] = None) -> Dict[str, Any]:
    from agents.runtime import reminders

    text, in_minutes = _reminder_args(text, in_minutes)
    channel = _target_channel(ctx, channel_id)
    agent_id = ctx.extra.get("agent_id")
    if not agent_id:
        raise ToolError("The agent is not active, so it cannot set a reminder.")
    reminder_id = reminders.create(agent_id=int(agent_id), channel_id=channel["id"],
                                   user_id=ctx.invoked_by, text=text, in_minutes=in_minutes)
    if reminder_id is None:
        raise ToolError("You already have the maximum number of open reminders.")
    return {"scheduled": True, "reminder_id": reminder_id, "channel": channel["name"],
            "in": reminders.describe_delay(in_minutes)}


MIN_POLL_OPTIONS = 2
MAX_POLL_OPTIONS = 6


def _poll_options(raw: Any) -> list:
    options = [str(o).strip() for o in (raw or []) if str(o).strip()]
    if not MIN_POLL_OPTIONS <= len(options) <= MAX_POLL_OPTIONS:
        raise ToolError(f"A poll needs {MIN_POLL_OPTIONS} to {MAX_POLL_OPTIONS} options.")
    return [o[:100] for o in options]


def _summarize_poll(ctx: ToolContext, args: Dict[str, Any]) -> str:
    channel = _target_channel(ctx, args.get("channel_id"))
    question = str(args.get("question") or "").strip()[:200]
    options = _poll_options(args.get("options"))
    return f"Poll in #{channel['name']}: {question} ({' / '.join(options)})"[:500]


@tool(
    "create_poll",
    "Post a poll (a question with 2 to 6 short options that members vote on) in a channel as "
    "this agent. The person must approve it first. Defaults to the current channel.",
    {
        "type": "object",
        "properties": {
            "question": {"type": "string", "minLength": 1, "maxLength": 200},
            "options": {"type": "array", "items": {"type": "string", "maxLength": 100},
                        "minItems": MIN_POLL_OPTIONS, "maxItems": MAX_POLL_OPTIONS},
            "channel_id": {"type": "integer", "description": "Channel to post in; defaults to the current one."},
        },
        "required": ["question", "options"],
    },
    risk=RISK_WRITE,
    summarize=_summarize_poll,
)
def create_poll(ctx: ToolContext, question: str, options: list,
                channel_id: Optional[int] = None) -> Dict[str, Any]:
    from agents.runtime.definitions import get_definition
    from agents.runtime.posting import post_as_agent

    question = str(question or "").strip()[:200]
    if not question:
        raise ToolError("A poll needs a question.")
    options = _poll_options(options)
    channel = _target_channel(ctx, channel_id)
    agent_id = ctx.extra.get("agent_id")
    defn = get_definition(int(agent_id)) if agent_id else None
    if defn is None:
        raise ToolError("The agent is not active, so it cannot post.")
    fallback = "📊 " + question + "\n" + "\n".join(f"{i}. {o}" for i, o in enumerate(options, 1))
    posted = post_as_agent(defn, channel["id"], fallback, run_id=ctx.run_id,
                           card={"kind": "poll", "question": question, "options": options})
    if posted is None:
        raise ToolError("The poll could not be posted.")
    return {"posted": True, "message_id": posted["id"], "channel": channel["name"]}
