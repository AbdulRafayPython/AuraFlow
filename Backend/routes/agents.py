"""
AI Agents API Routes
====================
RESTful endpoints for AI agent functionalities
"""

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import get_db_connection
from utils import get_user_id, resolve_public_community_id, get_community_id_from_public_id
import json

# Create blueprint
agents_bp = Blueprint('agents', __name__, url_prefix='/api/agents')

# Lazy agent singletons â€” created on first access, not at import time
_agents: dict = {}

def _get_agent(name: str):
    """Return a cached agent instance, creating it on first call."""
    if name not in _agents:
        if name == 'summarizer':
            from agents.summarizer import SummarizerAgent
            _agents[name] = SummarizerAgent()
        elif name == 'mood_tracker':
            from agents.mood_tracker import MoodTrackerAgent
            _agents[name] = MoodTrackerAgent()
        elif name == 'moderation':
            from agents.moderation import ModerationAgent
            _agents[name] = ModerationAgent()
        elif name == 'knowledge_builder':
            from agents.knowledge_builder import KnowledgeBuilderAgent
            _agents[name] = KnowledgeBuilderAgent()
        elif name == 'knowledge_builder_v2':
            from agents.knowledge_builder_v2 import KnowledgeBuilderAgent as KnowledgeBuilderV2
            _agents[name] = KnowledgeBuilderV2()
        elif name == 'focus':
            from agents.focus import FocusAgent
            _agents[name] = FocusAgent()
        elif name == 'engagement':
            from agents.engagement import EngagementAgent
            _agents[name] = EngagementAgent()
        elif name == 'wellness':
            from agents.wellness import WellnessAgent
            _agents[name] = WellnessAgent()
        elif name == 'assistant':
            from agents.assistant import AssistantAgent
            _agents[name] = AssistantAgent()
        elif name == 'auto_message':
            from agents.auto_message import AutoMessageAgent
            _agents[name] = AutoMessageAgent()
        elif name == 'support':
            from agents.support import SupportAgent
            _agents[name] = SupportAgent()
        elif name == 'translator':
            from agents.translator import TranslatorAgent
            _agents[name] = TranslatorAgent()
    return _agents[name]

# â”€â”€ Agent-type alias map â”€â”€
# Frontend may use e.g. 'mood_tracker' but agent_registry stores 'mood'.
AGENT_TYPE_ALIASES: dict[str, str] = {
    'mood_tracker': 'mood',
    'knowledge_builder': 'knowledge',
}

# Reverse: DB name â†’ frontend-friendly name (for catalog responses)
AGENT_TYPE_DISPLAY: dict[str, str] = {v: k for k, v in AGENT_TYPE_ALIASES.items()}

# Agents that are inherently per-user and cannot be installed at community
# scope. The registry's `category` column is used for catalog grouping, but
# install-gating is a narrower concern: several `personal`-category agents
# (summarizer, translator, assistant) legitimately run at community scope —
# e.g. tasks/agent_tasks.py::auto_summarize_periodic reads
# `community_agents WHERE agent_type='summarizer'`. Only mood/wellness are
# truly per-user (they track an individual's sentiment/burnout) and have no
# community-level dispatch path or UI.
_PERSONAL_ONLY_AGENTS: set[str] = {'mood', 'wellness'}

def _normalize_agent_type(agent_type: str) -> str:
    """Resolve frontend alias â†’ DB agent_type."""
    return AGENT_TYPE_ALIASES.get(agent_type, agent_type)

def _display_agent_type(agent_type: str) -> str:
    """Resolve DB agent_type â†’ frontend display name."""
    return AGENT_TYPE_DISPLAY.get(agent_type, agent_type)


# Per-agent settings whitelist + coercion. Keyed by DB agent_type (after
# alias normalisation), so 'mood' covers the 'mood_tracker' alias and
# 'knowledge' covers 'knowledge_builder'. The matrix mirrors
# Frontend/src/components/modals/AgentSettingsModal.tsx::SETTINGS_SCHEMA.
# Each tuple is (python_type, optional_min, optional_max, optional_choices).
_SETTINGS_VALIDATORS: dict[str, dict[str, tuple]] = {
    'moderation': {
        'auto_filter':         (bool, None, None, None),
        'sensitivity':         (int, 1, 10, None),
        'severity_threshold':  (str, None, None, ('low', 'medium', 'high', 'critical')),
        'notify_admins':       (bool, None, None, None),
        'roman_urdu_support':  (bool, None, None, None),
        'max_warnings':        (int, 1, 10, None),
    },
    'engagement': {
        'auto_analyze':        (bool, None, None, None),
        'analysis_interval':   (int, 10, 120, None),
        'track_threads':       (bool, None, None, None),
        'leaderboard':         (bool, None, None, None),
        'inactivity_alerts':   (bool, None, None, None),
    },
    'knowledge': {
        'auto_extract':              (bool, None, None, None),
        'extraction_interval_hours': (int, 1, 12, None),
        'min_quality_score':         (int, 1, 10, None),
        'auto_categorize':           (bool, None, None, None),
    },
    'summarizer': {
        'auto_summarize_enabled':       (bool, None, None, None),
        'schedule_time':                (str, None, None, None),  # 'HH:MM'
        'auto_summarize_message_count': (int, 50, 200, None),
        'summary_length':               (str, None, None, ('brief', 'standard', 'detailed')),
        'include_topics':               (bool, None, None, None),
        'include_action_items':         (bool, None, None, None),
        # Server-tracked field — not user-editable but written by the
        # scheduler. Allow as a pass-through so saving doesn't strip it.
        'last_auto_summary_date':       (str, None, None, None),
    },
    'mood': {
        'track_per_message':    (bool, None, None, None),
        'alert_negative_trend': (bool, None, None, None),
        'sensitivity':          (int, 1, 10, None),
        'language':             (str, None, None, ('english', 'roman_urdu', 'auto')),
    },
    'wellness': {
        'auto_check':          (bool, None, None, None),
        'break_reminders':     (bool, None, None, None),
        'check_interval_hours': (int, 1, 8, None),
        'burnout_detection':   (bool, None, None, None),
    },
    'focus': {
        'auto_analyze':       (bool, None, None, None),
        'session_reminders':  (bool, None, None, None),
        'analyze_threshold':  (int, 20, 100, None),
        'daily_reports':      (bool, None, None, None),
    },
    'assistant': {
        'use_gemini':       (bool, None, None, None),
        'reply_style':      (str, None, None, ('concise', 'friendly', 'detailed')),
        'max_history':      (int, 1, 10, None),
        'allow_jokes':      (bool, None, None, None),
        'allow_motivation': (bool, None, None, None),
        'memory_paused':    (bool, None, None, None),
    },
    'auto_message': {
        'welcome_enabled':         (bool, None, None, None),
        'post_in_default_channel': (bool, None, None, None),
        'quick_replies_enabled':   (bool, None, None, None),
        'use_gemini_polish':       (bool, None, None, None),
    },
    'support': {
        'min_score':         (int, 1, 10, None),
        'max_docs':          (int, 100, 1000, None),
        'use_gemini_polish': (bool, None, None, None),
        'show_sources':      (bool, None, None, None),
    },
    'translator': {
        'default_target': (str, None, None, (
            'en', 'ur', 'hi', 'es', 'fr', 'de', 'ar', 'zh-CN',
            'pt', 'ru', 'ja', 'tr', 'id', 'bn',
        )),
        'auto_detect':    (bool, None, None, None),
        'cache_enabled':  (bool, None, None, None),
    },
}


def _coerce_setting(value, spec: tuple):
    """Return ``(coerced, error_message_or_None)`` for one (key, value) pair.

    Handles JSON's bool/int/string trinity tolerantly: HTML form posts can
    arrive as the strings ``"true"`` / ``"false"`` / ``"5"`` for what is
    semantically bool/int.
    """
    py_type, lo, hi, choices = spec
    # Bool: accept JSON bool, 0/1, common strings
    if py_type is bool:
        if isinstance(value, bool):
            return value, None
        if isinstance(value, (int, float)):
            return bool(value), None
        if isinstance(value, str):
            lc = value.strip().lower()
            if lc in ('true', '1', 'yes', 'on'):
                return True, None
            if lc in ('false', '0', 'no', 'off'):
                return False, None
        return None, "expected boolean"
    # Int: coerce + range-check
    if py_type is int:
        try:
            coerced = int(value)
        except (TypeError, ValueError):
            return None, "expected integer"
        if lo is not None and coerced < lo:
            return None, f"min {lo}"
        if hi is not None and coerced > hi:
            return None, f"max {hi}"
        return coerced, None
    # String / enum
    if py_type is str:
        if not isinstance(value, str):
            return None, "expected string"
        if choices and value not in choices:
            return None, f"must be one of {choices}"
        return value, None
    return value, None


def _validate_agent_settings(agent_type_db: str, raw_settings: dict):
    """Validate ``raw_settings`` against the per-agent whitelist.

    Returns ``(coerced_dict, error_response_or_None)``. ``error_response``
    is a Flask ``jsonify, status`` tuple when validation fails, ``None``
    otherwise. Unknown agents are passed through unchanged so newly-added
    agents don't break before their schema entry is added — the call site
    can decide whether to be strict.
    """
    if not isinstance(raw_settings, dict):
        return {}, (jsonify({'error': 'settings must be an object'}), 400)
    schema = _SETTINGS_VALIDATORS.get(agent_type_db)
    if schema is None:
        # Unknown agent: pass through unchanged. Keeps the endpoint
        # forward-compatible.
        return raw_settings, None
    coerced: dict = {}
    errors: dict = {}
    unknown: list = []
    for key, val in raw_settings.items():
        if key not in schema:
            unknown.append(key)
            continue
        out, err = _coerce_setting(val, schema[key])
        if err:
            errors[key] = err
        else:
            coerced[key] = out
    if unknown:
        return coerced, (jsonify({
            'error': 'unknown setting keys',
            'unknown': unknown,
        }), 400)
    if errors:
        return coerced, (jsonify({
            'error': 'invalid setting values',
            'invalid': errors,
        }), 400)
    return coerced, None


# =====================================
# SUMMARIZER AGENT ROUTES
# =====================================

@agents_bp.route('/summarize/channel/<int:channel_id>', methods=['POST'])
@jwt_required()
def summarize_channel(channel_id):
    """
    Generate summary for a channel's recent messages
    
    Body (optional):
        - message_count: Number of messages to analyze (default: 100)
    
    Returns:
        Summary with key points and metadata
    """
    try:
        username = get_jwt_identity()
        
        # Get user ID
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            # Check channel access
            cur.execute("""
                SELECT 1 FROM channel_members 
                WHERE channel_id = %s AND user_id = %s
            """, (channel_id, user_id))
            
            if not cur.fetchone():
                return jsonify({'error': 'Access denied to this channel'}), 403
        
        conn.close()
        
        # Get parameters
        data = request.get_json() or {}
        message_count = min(data.get('message_count', 100), 200)  # Max 200 messages
        
        # Generate summary
        result = _get_agent("summarizer").summarize_channel(
            channel_id=channel_id,
            message_count=message_count,
            user_id=user_id
        )
        
        if result['success']:
            return jsonify({
                'success': True,
                'summary_id': result['summary_id'],
                'summary': result['summary'],
                'key_points': result.get('key_points', []),
                'message_count': result['message_count'],
                'participants': result.get('participants', []),
                'time_range': result.get('time_range')
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to generate summary')
            }), 400
            
    except Exception as e:
        print(f"[AGENTS API] Error in summarize_channel: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/summarize/dm/<int:peer_user_id>', methods=['POST'])
@jwt_required()
def summarize_dm(peer_user_id):
    """
    Generate an ephemeral summary of the 1:1 DM thread between the
    requester and ``peer_user_id``. Result is returned inline and is
    visible only to the requester — nothing is persisted to
    ``conversation_summaries`` (that table is channel-scoped).

    Body (optional):
        - message_count: messages to analyse (default 100, max 200).

    Returns 200 on success, 404 if the peer doesn't exist, 403 if the
    requester is not friends with the peer (DM access mirrors how the
    DM feature itself gates), and 400 if the summariser couldn't
    produce a result (e.g. too few messages).
    """
    try:
        username = get_jwt_identity()

        conn = get_db_connection()
        with conn.cursor() as cur:
            requester_id = get_user_id(username, cur)
            if requester_id is None:
                return jsonify({'error': 'User not found'}), 404

            if peer_user_id == requester_id:
                return jsonify(
                    {'error': 'Cannot summarize a thread with yourself'}
                ), 400

            cur.execute("SELECT 1 FROM users WHERE id = %s",
                        (peer_user_id,))
            if not cur.fetchone():
                return jsonify({'error': 'Peer user not found'}), 404

            # DM is only available between friends — mirror that gate.
            cur.execute("""
                SELECT 1 FROM friends
                WHERE (user_id = %s AND friend_id = %s)
                   OR (user_id = %s AND friend_id = %s)
                LIMIT 1
            """, (requester_id, peer_user_id,
                  peer_user_id, requester_id))
            if not cur.fetchone():
                return jsonify(
                    {'error': 'You can only summarize DMs with friends'}
                ), 403
        conn.close()

        data = request.get_json(silent=True) or {}
        message_count = min(int(data.get('message_count', 100) or 100), 200)

        result = _get_agent("summarizer").summarize_dm(
            peer_user_id=peer_user_id,
            requester_user_id=requester_id,
            message_count=message_count,
        )

        if result.get('success'):
            return jsonify({
                'success': True,
                'summary': result['summary'],
                'key_points': result.get('key_points', []),
                'action_items': result.get('action_items', []),
                'message_count': result['message_count'],
                'participants': result.get('participants', []),
                'method': result.get('method', 'extractive'),
                'summary_length': result.get('summary_length', 'standard'),
                'peer_user_id': peer_user_id,
                'time_range': result.get('time_range'),
            }), 200
        return jsonify({
            'success': False,
            'error': result.get('error', 'Failed to generate DM summary'),
            'message_count': result.get('message_count', 0),
        }), 400

    except Exception as e:
        print(f"[AGENTS API] Error in summarize_dm: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/summaries/channel/<int:channel_id>', methods=['GET'])
@jwt_required()
def get_channel_summaries(channel_id):
    """
    Get recent summaries for a channel
    
    Query params:
        - limit: Maximum number of summaries (default: 5)
    
    Returns:
        List of recent summaries
    """
    try:
        username = get_jwt_identity()
        print(f"[AGENTS API] Getting summaries for channel {channel_id} by user {username}")
        
        # Get user ID and check access
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            # Check channel access
            cur.execute("""
                SELECT 1 FROM channel_members 
                WHERE channel_id = %s AND user_id = %s
            """, (channel_id, user_id))
            
            if not cur.fetchone():
                return jsonify({'error': 'Access denied to this channel'}), 403
        
        conn.close()
        
        # Get limit parameter
        limit = min(request.args.get('limit', 5, type=int), 20)
        
        # Fetch summaries
        summaries = _get_agent("summarizer").get_recent_summaries(channel_id, limit)
        print(f"[AGENTS API] Found {len(summaries)} summaries for channel {channel_id}")
        
        return jsonify({
            'success': True,
            'summaries': summaries,
            'count': len(summaries)
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_channel_summaries: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/summary/<int:summary_id>', methods=['GET'])
@jwt_required()
def get_summary(summary_id):
    """
    Get a specific summary by ID
    
    Returns:
        Summary details
    """
    try:
        username = get_jwt_identity()
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get user ID
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            # Get summary with access check
            cur.execute("""
                SELECT 
                    cs.id, cs.channel_id, cs.summary,
                    cs.generated_by, cs.created_at
                FROM conversation_summaries cs
                JOIN channel_members cm ON cs.channel_id = cm.channel_id
                WHERE cs.id = %s AND cm.user_id = %s
            """, (summary_id, user_id))
            
            summary = cur.fetchone()
            
            if not summary:
                return jsonify({'error': 'Summary not found or access denied'}), 404
            
            return jsonify({
                'success': True,
                'summary': {
                    'id': summary['id'],
                    'channel_id': summary['channel_id'],
                    'summary': summary['summary'],
                    'created_at': summary['created_at'].isoformat() if summary['created_at'] else None,
                    'created_by': summary['generated_by']
                }
            }), 200
            
    except Exception as e:
        print(f"[AGENTS API] Error in get_summary: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# HEALTH CHECK
# =====================================

@agents_bp.route('/health', methods=['GET'])
def health_check():
    """Check if AI agents are operational"""
    return jsonify({
        'success': True,
        'agents': {
            'summarizer': 'active',
            'mood_tracker': 'active',
            'moderation': 'pending',
            'wellness': 'pending',
            'engagement': 'pending',
            'knowledge_builder': 'pending',
            'focus': 'pending'
        }
    }), 200


# =====================================
# AUTONOMOUS-AGENT METRICS DASHBOARD
# =====================================
# GET /api/agents/metrics?days=7[&community_id=N]
#
# Returns the three KPIs from §5.3 of AUTONOMOUS_AGENTS_PLAN.md:
#   - autonomy_ratio  = act decisions / total decisions  (over agent_actions)
#                       — measures how often the orchestrator decided to do
#                         something vs deferring/skipping. A "human-triggered"
#                         counter-point (slash-command + button invocations
#                         from ai_agent_logs) is included alongside so the
#                         jury can see autonomous : on-demand at a glance.
#   - goal_attainment = % windows where the community avg sentiment_score
#                       stayed >= 0.0 (i.e. mood was "ok or better"). Goal is
#                       intentionally simple here; per-channel/per-goal
#                       tuning belongs to the 5.2 admin panel.
#   - feedback_ratio  = positive feedback / (positive + negative)
#                       — counts thumbs-up vs thumbs-down only. engaged /
#                         ignored / dismissed are returned separately so the
#                         frontend can render the breakdown.
#
# Per-agent breakdown is included so the dashboard can show "which of the
# 11 agents is doing the most work" without a second round-trip.

@agents_bp.route('/metrics', methods=['GET'])
@jwt_required()
def get_agent_metrics():
    """Aggregate autonomy / goal / feedback KPIs for the last N days."""
    import logging
    log = logging.getLogger(__name__)

    try:
        days = int(request.args.get('days', 7))
    except (TypeError, ValueError):
        days = 7
    days = max(1, min(days, 90))  # clamp 1..90

    community_id = get_community_id_from_public_id(request.args.get('community_id'))

    # Build a single optional WHERE clause we can reuse across queries.
    scope_sql = ""
    scope_args: list = [days]
    if community_id:
        scope_sql = " AND community_id = %s"
        scope_args.append(community_id)

    # Same filter, but qualified with the agent_actions alias `aa` for
    # the feedback join query below.
    scope_sql_aa = scope_sql.replace("community_id = %s", "aa.community_id = %s") if scope_sql else ""

    out: dict = {
        'window_days': days,
        'community_id': community_id,
        'autonomy': {},
        'goal_attainment': {},
        'feedback': {},
        'per_agent': [],
    }

    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # ── 1. Autonomy: act/defer/skip mix from agent_actions ────
            cur.execute(
                f"""
                SELECT decision, COUNT(*) AS n
                FROM agent_actions
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
                  {scope_sql}
                GROUP BY decision
                """,
                tuple(scope_args),
            )
            decision_counts = {r['decision']: int(r['n']) for r in cur.fetchall()}
            acts = decision_counts.get('act', 0)
            defers = decision_counts.get('defer', 0)
            skips = decision_counts.get('skip', 0)
            total_decisions = acts + defers + skips

            # Human-triggered actions from ai_agent_logs (slash commands,
            # button clicks, REST agent endpoints). Best-effort: the table
            # may not always carry community_id for personal-scope calls.
            try:
                ai_log_scope_sql = ""
                ai_log_args: list = [days]
                if community_id:
                    ai_log_scope_sql = " AND community_id = %s"
                    ai_log_args.append(community_id)
                cur.execute(
                    f"""
                    SELECT COUNT(*) AS n
                    FROM ai_agent_logs
                    WHERE created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
                      {ai_log_scope_sql}
                    """,
                    tuple(ai_log_args),
                )
                row = cur.fetchone() or {}
                human_triggered = int(row.get('n') or 0)
            except Exception as exc:
                log.debug(f"[metrics] ai_agent_logs query skipped: {exc}")
                human_triggered = 0

            denom_decisions = total_decisions or 1
            out['autonomy'] = {
                'acts': acts,
                'defers': defers,
                'skips': skips,
                'total_decisions': total_decisions,
                'autonomy_ratio': round(acts / denom_decisions, 4),
                'human_triggered': human_triggered,
                # "Autonomous share" of all visible AI activity — how often
                # the agent decided unprompted vs the user pressing a button.
                'autonomous_share': round(
                    acts / max(1, acts + human_triggered), 4,
                ),
            }

            # ── 2. Goal attainment: mood stability over the window ────
            # "Goal met" = avg sentiment_score per hour >= 0.0 across the
            # community (or all communities if community_id is None).
            mood_scope_sql = ""
            mood_args: list = [days]
            if community_id:
                mood_scope_sql = (
                    " AND um.channel_id IN ("
                    "   SELECT id FROM channels WHERE community_id = %s"
                    " )"
                )
                mood_args.append(community_id)
            cur.execute(
                f"""
                SELECT DATE_FORMAT(um.created_at, '%%Y-%%m-%%d %%H:00:00') AS bucket,
                       AVG(um.sentiment_score) AS avg_score,
                       COUNT(*) AS n
                FROM user_moods um
                WHERE um.created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
                  AND um.sentiment_score IS NOT NULL
                  {mood_scope_sql}
                GROUP BY bucket
                """,
                tuple(mood_args),
            )
            buckets = cur.fetchall() or []
            total_buckets = len(buckets)
            met = sum(1 for b in buckets if (b['avg_score'] or 0) >= 0.0)
            denom_buckets = total_buckets or 1
            out['goal_attainment'] = {
                'goal_threshold': 0.0,
                'buckets': total_buckets,
                'met': met,
                'ratio': round(met / denom_buckets, 4),
                'avg_sentiment': round(
                    sum((b['avg_score'] or 0) for b in buckets) / denom_buckets, 4,
                ),
            }

            # ── 3. Feedback: counts per signal across agent_feedback ──
            # Join through agent_actions for the scope filter.
            cur.execute(
                f"""
                SELECT af.`signal` AS sig, COUNT(*) AS n
                FROM agent_feedback af
                JOIN agent_actions aa ON aa.id = af.action_id
                WHERE af.created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
                  {scope_sql_aa}
                GROUP BY af.`signal`
                """,
                tuple(scope_args),
            )
            sig_counts = {r['sig']: int(r['n']) for r in cur.fetchall()}
            pos = sig_counts.get('positive', 0)
            neg = sig_counts.get('negative', 0)
            denom_pn = (pos + neg) or 1
            out['feedback'] = {
                'positive': pos,
                'negative': neg,
                'engaged': sig_counts.get('engaged', 0),
                'dismissed': sig_counts.get('dismissed', 0),
                'ignored': sig_counts.get('ignored', 0),
                'feedback_ratio': round(pos / denom_pn, 4),
                'total': sum(sig_counts.values()),
            }

            # ── 4. Per-agent breakdown ───────────────────────────────
            cur.execute(
                f"""
                SELECT agent_name,
                       SUM(decision='act')   AS acts,
                       SUM(decision='defer') AS defers,
                       SUM(decision='skip')  AS skips,
                       COUNT(*)              AS total
                FROM agent_actions
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
                  {scope_sql}
                GROUP BY agent_name
                ORDER BY acts DESC, total DESC
                """,
                tuple(scope_args),
            )
            rows = cur.fetchall() or []
            out['per_agent'] = [
                {
                    'agent_name': r['agent_name'],
                    'acts': int(r['acts'] or 0),
                    'defers': int(r['defers'] or 0),
                    'skips': int(r['skips'] or 0),
                    'total': int(r['total'] or 0),
                    'autonomy_ratio': round(
                        (int(r['acts'] or 0)) / max(1, int(r['total'] or 0)), 4,
                    ),
                }
                for r in rows
            ]

        return jsonify(out), 200
    except Exception as exc:
        log.exception(f"[metrics] failed: {exc}")
        return jsonify({'error': 'metrics aggregation failed', 'detail': str(exc)}), 500
    finally:
        if conn:
            conn.close()


# =====================================================================
# AUTONOMOUS-AGENT COLLABORATION GRAPH                       (Phase 4.4)
# =====================================================================
# GET /api/agents/collaboration-graph?hours=24
#
# Returns a force-directed view of which autonomous agents triggered
# which over the last N hours, joined on agent_actions.correlation_id.
# This is *the* visualisation of the three known chains documented in
# docs/AUTONOMOUS_AGENTS_PLAN.md §4:
#
#   mood_tracker  → wellness          (mood.escalation)
#   moderation    → wellness          (mod.violation, victim chain)
#   focus         → summarizer + knowledge_builder  (focus.drift)
#
# Edges are directed: any pair (a1.agent, a2.agent) sharing the same
# correlation_id where a2 is the strictly-later 'act' row.
#
# Capped at 50 edges so the graph stays readable and one bad chain can't
# tank the page. The idx_correlation index on agent_actions keeps the
# self-join cheap for the typical 24-h window.
# ---------------------------------------------------------------------

@agents_bp.route('/collaboration-graph', methods=['GET'])
@jwt_required()
def get_agent_collaboration_graph():
    """Return {nodes, edges, window_hours} for the agent collaboration view."""
    import logging
    log = logging.getLogger(__name__)

    try:
        hours = int(request.args.get('hours', 24))
    except (TypeError, ValueError):
        hours = 24
    hours = max(1, min(hours, 24 * 90))  # clamp 1h..90d

    # Optional community scope — gated by community-admin check when set.
    community_id = get_community_id_from_public_id(request.args.get('community_id'))
    if community_id:
        user_id = get_jwt_identity()
        if not _check_community_admin(user_id, community_id):
            return jsonify({'error': 'forbidden'}), 403

    scope_sql = ""
    scope_args_node: list = [hours]
    scope_args_edge: list = [hours]
    if community_id:
        # Apply to both legs of the self-join so we don't see cross-community
        # correlation collisions (cheap UUIDs are globally unique anyway,
        # but a JSON-payload reused across communities could otherwise pair).
        scope_sql = " AND community_id = %s"
        scope_args_node.append(community_id)
        scope_args_edge.extend([community_id, community_id])

    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # ── Nodes: one row per agent that did anything in the window ──
            # Includes 'act' AND 'defer'/'skip' so the panel can show even
            # quiet agents (with 0 acts) — useful when the jury asks
            # "why isn't translator on the graph?"
            cur.execute(
                f"""
                SELECT agent_name,
                       SUM(decision='act')   AS acts,
                       SUM(decision='defer') AS defers,
                       SUM(decision='skip')  AS skips,
                       COUNT(*)              AS total,
                       MAX(created_at)       AS last_acted
                FROM agent_actions
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL %s HOUR)
                  {scope_sql}
                GROUP BY agent_name
                ORDER BY acts DESC, total DESC
                """,
                tuple(scope_args_node),
            )
            node_rows = cur.fetchall() or []

            # Last feedback signal per agent — gives the node an "outcome"
            # color. positive/engaged → green, negative/dismissed → red,
            # else neutral. One round-trip with a window function.
            # `signal` is a reserved word in MySQL 8 — the bare alias
            # (and even the bare column reference in some 8.0.x point
            # releases) trips a 1064 syntax error. Backtick the column
            # and alias to something neutral.
            cur.execute(
                f"""
                SELECT aa.agent_name AS agent_name, af.`signal` AS sig
                FROM agent_feedback af
                JOIN agent_actions aa ON aa.id = af.action_id
                JOIN (
                    SELECT aa2.agent_name AS agent_name, MAX(af2.created_at) AS mx
                    FROM agent_feedback af2
                    JOIN agent_actions aa2 ON aa2.id = af2.action_id
                    WHERE af2.created_at >= DATE_SUB(NOW(), INTERVAL %s HOUR)
                      {scope_sql.replace('community_id = %s', 'aa2.community_id = %s')}
                    GROUP BY aa2.agent_name
                ) latest
                  ON latest.agent_name = aa.agent_name
                 AND latest.mx        = af.created_at
                """,
                tuple(scope_args_node),
            )
            last_signal = {r['agent_name']: r['sig'] for r in (cur.fetchall() or [])}

            def _outcome_for(signal):
                if signal in ('positive', 'engaged'):
                    return 'positive'
                if signal in ('negative', 'dismissed'):
                    return 'negative'
                return 'neutral'

            nodes = [
                {
                    'id': r['agent_name'],
                    'acts': int(r['acts'] or 0),
                    'defers': int(r['defers'] or 0),
                    'skips': int(r['skips'] or 0),
                    'total': int(r['total'] or 0),
                    'last_acted': r['last_acted'].isoformat() if r['last_acted'] else None,
                    'last_signal': last_signal.get(r['agent_name']),
                    'outcome': _outcome_for(last_signal.get(r['agent_name'])),
                }
                for r in node_rows
            ]

            # ── Edges: self-join on correlation_id, strict time order ──
            # `a1.decision = 'act'` ensures the source agent actually fired
            # (defers shouldn't trigger a downstream chain). `a2.decision`
            # is left open so we surface the downstream agent's reaction
            # even when it deferred — that's exactly the audit story we
            # want (mod → wellness deferred during quiet hours).
            if community_id:
                edge_filter = " AND a1.community_id = %s AND a2.community_id = %s"
            else:
                edge_filter = ""

            cur.execute(
                f"""
                SELECT a1.agent_name AS source,
                       a2.agent_name AS target,
                       COUNT(*)      AS count,
                       MAX(a2.created_at) AS last_seen,
                       SUBSTRING_INDEX(GROUP_CONCAT(a1.correlation_id ORDER BY a2.created_at DESC), ',', 1) AS sample_correlation
                FROM agent_actions a1
                JOIN agent_actions a2
                  ON a1.correlation_id = a2.correlation_id
                 AND a2.created_at > a1.created_at
                 AND a2.agent_name <> a1.agent_name
                WHERE a1.created_at >= DATE_SUB(NOW(), INTERVAL %s HOUR)
                  AND a1.decision = 'act'
                  {edge_filter}
                GROUP BY a1.agent_name, a2.agent_name
                ORDER BY count DESC, last_seen DESC
                LIMIT 50
                """,
                tuple(scope_args_edge),
            )
            edge_rows = cur.fetchall() or []

            edges = [
                {
                    'source': r['source'],
                    'target': r['target'],
                    'count': int(r['count'] or 0),
                    'last_seen': r['last_seen'].isoformat() if r['last_seen'] else None,
                    'sample_correlation': r.get('sample_correlation'),
                }
                for r in edge_rows
            ]

        # If an edge references an agent that wasn't in node_rows (e.g.
        # the window slice cut off its own action row but kept the
        # downstream row — rare but possible at the boundary), inject
        # a stub node so the frontend graph doesn't drop the edge.
        known = {n['id'] for n in nodes}
        for e in edges:
            for endpoint in (e['source'], e['target']):
                if endpoint not in known:
                    nodes.append({
                        'id': endpoint, 'acts': 0, 'defers': 0, 'skips': 0,
                        'total': 0, 'last_acted': None,
                        'last_signal': None, 'outcome': 'neutral',
                    })
                    known.add(endpoint)

        return jsonify({
            'nodes': nodes,
            'edges': edges,
            'window_hours': hours,
            'community_id': community_id,
        }), 200
    except Exception as exc:
        log.exception(f"[collaboration-graph] failed: {exc}")
        return jsonify({'error': 'collaboration graph failed', 'detail': str(exc)}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# AUTONOMOUS-AGENT FEEDBACK ENDPOINT
# =====================================
# POST /api/agents/<name>/feedback
# Body: { "action_id": <int>, "signal": "positive|negative|dismissed|engaged|ignored",
#         "weight": <float, optional> }
#
# Writes one agent_feedback row keyed on the originating agent_actions
# row, then asks the autonomous agent (if registered) to learn from it.
# Both writes are best-effort: a missing/unregistered agent does NOT
# prevent the feedback row from being stored.

@agents_bp.route('/<name>/feedback', methods=['POST'])
@jwt_required()
def submit_agent_feedback(name):
    """Record user feedback on a logged agent action and trigger learn()."""
    from agents import memory as agent_memory

    body = request.get_json(silent=True) or {}
    action_id = body.get('action_id')
    correlation_id = body.get('correlation_id')
    signal = body.get('signal')
    try:
        weight = float(body.get('weight', 1.0))
    except (TypeError, ValueError):
        weight = 1.0

    if signal not in agent_memory.VALID_SIGNALS:
        return jsonify({
            'error': f"signal must be one of {agent_memory.VALID_SIGNALS}",
        }), 400

    # The frontend timeline/toast only has the correlation_id (it's the
    # stable identifier on emitted socket events). The legacy callers
    # still send action_id. Accept either — but require one.
    action = None
    if isinstance(action_id, int) and action_id > 0:
        action = agent_memory.get_action(action_id)
        if not action:
            return jsonify({'error': 'action_id not found'}), 404
        if action.get('agent_name') != name:
            return jsonify({'error': 'action_id does not belong to this agent'}), 400
    elif isinstance(correlation_id, str) and correlation_id:
        action = agent_memory.get_action_by_correlation(name, correlation_id)
        if not action:
            return jsonify({'error': 'no action found for this correlation_id'}), 404
        action_id = action['id']
    else:
        return jsonify({'error': 'action_id (int) or correlation_id (str) is required'}), 400

    current_user = get_jwt_identity()
    user_id = get_user_id(current_user) if current_user else None

    fb_id = agent_memory.record_feedback(
        action_id=action_id, signal=signal, user_id=user_id, weight=weight,
    )
    if not fb_id:
        return jsonify({'error': 'failed to record feedback'}), 500

    # Best-effort: trigger the agent's learn() hook. We resolve the
    # autonomous registry first (lighter), then fall back to the legacy
    # _get_agent() singleton if the agent exposes a `learn` method.
    try:
        from agents.orchestrator import _resolve  # autonomous registry
        agent = _resolve(name)
        if agent is None:
            try:
                agent = _get_agent(name)
            except Exception:
                agent = None
        if agent is not None and hasattr(agent, 'learn'):
            try:
                agent.learn(action_id, signal, weight=weight)
            except TypeError:
                # Older signature compatibility.
                agent.learn(action_id, signal)
    except Exception as exc:
        # Learning failure is non-fatal — the feedback row is what matters.
        import logging
        logging.getLogger(__name__).debug(f"[agents/feedback] learn() skipped: {exc}")

    return jsonify({
        'success': True,
        'feedback_id': fb_id,
        'action_id': action_id,
        'agent': name,
        'signal': signal,
    }), 201


# =====================================
# AGENT GOALS — PHASE 5.2
# =====================================
# GET /api/agents/<name>/state?community_id=N
#   →  { agent, community_id, enabled, current, defaults, clamps, specs,
#         last_acted_at, last_outcome }
#
# PUT /api/agents/<name>/state
#   body: { community_id, enabled?, thresholds?: {...}, clamps?: {...} }
#   →  { agent, community_id, enabled, current, clamps }
#
# Both require community-admin membership for the supplied community_id.
# Storage uses the existing agent_state table:
#   - learned values live in thresholds[<key>]
#   - admin clamp windows live in thresholds["_clamps"] = {<key>: {"min":x,"max":y}}
#   - kill-switch lives in goal_value.enabled (True by default when missing)

@agents_bp.route('/<name>/state', methods=['GET'])
@jwt_required()
def get_agent_state(name):
    """Return the per-community tunables / clamps / kill-switch for one agent."""
    from agents import memory as agent_memory
    from agents.tunables import specs_for, defaults_for, known_agents

    if name not in known_agents():
        return jsonify({'error': f'unknown agent {name!r}'}), 404

    raw_community_id = request.args.get('community_id')
    community_id = get_community_id_from_public_id(raw_community_id) if raw_community_id else None
    if not community_id:
        return jsonify({'error': 'community_id is required'}), 400

    username = get_jwt_identity()
    user_id = _get_user_id(username) if username else None
    if not user_id:
        return jsonify({'error': 'User not found'}), 404
    if not _check_community_admin(user_id, community_id):
        return jsonify({'error': 'Forbidden: community admin only'}), 403

    specs = specs_for(name)
    defaults = defaults_for(name)
    state = agent_memory.get_state(
        name, agent_memory.SCOPE_COMMUNITY, community_id) or {}
    th = dict(state.get("thresholds") or {})
    clamps = dict(th.pop("_clamps", {}) or {})  # surface clamps separately
    gv = state.get("goal_value") or {}
    enabled = bool(gv.get("enabled", True))

    # Fill in defaults for any tunable the row doesn't carry yet.
    current = {k: th.get(k, defaults.get(k)) for k in defaults.keys()}

    return jsonify({
        'agent': name,
        'community_id': community_id,
        'enabled': enabled,
        'current': current,
        'defaults': defaults,
        'clamps': clamps,
        'specs': specs,
        'last_acted_at': (state.get('last_acted_at').isoformat()
                          if state.get('last_acted_at') and hasattr(state['last_acted_at'], 'isoformat')
                          else state.get('last_acted_at')),
        'last_outcome': state.get('last_outcome'),
    }), 200


@agents_bp.route('/<name>/state', methods=['PUT'])
@jwt_required()
def put_agent_state(name):
    """Update tunables / clamps / kill-switch for one agent in one community.

    Validates the agent name against the tunables catalog. Numeric fields
    are coerced and clipped to the catalog's absolute min/max so the panel
    can't write outside the floor/ceiling defined in tunables.py.
    """
    from agents import memory as agent_memory
    from agents.tunables import (specs_for, defaults_for,
                                 known_agents, apply_clamps)

    if name not in known_agents():
        return jsonify({'error': f'unknown agent {name!r}'}), 404

    body = request.get_json(silent=True) or {}
    raw_community_id = body.get('community_id')
    community_id = get_community_id_from_public_id(raw_community_id) if raw_community_id else None
    if not community_id:
        return jsonify({'error': 'community_id is required'}), 400

    username = get_jwt_identity()
    user_id = _get_user_id(username) if username else None
    if not user_id:
        return jsonify({'error': 'User not found'}), 404
    if not _check_community_admin(user_id, community_id):
        return jsonify({'error': 'Forbidden: community admin only'}), 403

    specs = specs_for(name)
    # Load existing row so we can do a partial update.
    state = agent_memory.get_state(
        name, agent_memory.SCOPE_COMMUNITY, community_id) or {}
    th = dict(state.get("thresholds") or {})
    existing_clamps = dict(th.get("_clamps") or {})
    gv = dict(state.get("goal_value") or {})

    # ── thresholds (current learned values) ─────────────────────────
    new_thresholds = body.get('thresholds')
    if isinstance(new_thresholds, dict):
        for key, val in new_thresholds.items():
            if key == '_clamps' or key not in specs:
                continue  # reject unknown keys (and never let the client overwrite _clamps via this path)
            th[key] = val

    # ── clamps (admin overrides on top of catalog min/max) ──────────
    new_clamps = body.get('clamps')
    if isinstance(new_clamps, dict):
        for key, window in new_clamps.items():
            if key not in specs or not isinstance(window, dict):
                continue
            spec = specs[key]
            sub: dict = {}
            for end in ('min', 'max'):
                if end in window and window[end] is not None:
                    try:
                        v = float(window[end])
                    except (TypeError, ValueError):
                        continue
                    # Clip the clamp itself to the catalog's absolute window.
                    cat_min = spec.get('min')
                    cat_max = spec.get('max')
                    if cat_min is not None:
                        v = max(float(cat_min), v)
                    if cat_max is not None:
                        v = min(float(cat_max), v)
                    sub[end] = v
            if sub:
                existing_clamps[key] = sub
            elif key in existing_clamps:
                del existing_clamps[key]
        th['_clamps'] = existing_clamps

    # Re-apply clamps to current values so saving a tighter window
    # immediately pulls drifted thresholds back in.
    learned_only = {k: v for k, v in th.items() if k != '_clamps'}
    learned_only = apply_clamps(name, learned_only, existing_clamps)
    th = dict(learned_only)
    th['_clamps'] = existing_clamps

    # ── kill-switch ─────────────────────────────────────────────────
    if 'enabled' in body:
        gv['enabled'] = bool(body['enabled'])

    ok = agent_memory.set_state(
        name, agent_memory.SCOPE_COMMUNITY, community_id,
        thresholds=th,
        goal_value=gv if 'enabled' in body else None,
    )
    if not ok:
        return jsonify({'error': 'failed to persist agent state'}), 500

    defaults = defaults_for(name)
    current = {k: th.get(k, defaults.get(k)) for k in defaults.keys()}
    return jsonify({
        'agent': name,
        'community_id': community_id,
        'enabled': bool(gv.get('enabled', True)),
        'current': current,
        'clamps': existing_clamps,
    }), 200


@agents_bp.route('/state/catalog', methods=['GET'])
@jwt_required()
def get_agent_state_catalog():
    """List all known agents + their tunable specs in one shot.

    Used by the Agent Goals frontend to render the page in a single
    request instead of 11 GETs on mount.
    """
    from agents.tunables import TUNABLES
    return jsonify({
        'agents': list(TUNABLES.keys()),
        'tunables': TUNABLES,
    }), 200


# =====================================
# MOOD TRACKING ENDPOINTS
# =====================================

@agents_bp.route('/mood/track/<int:user_id>', methods=['POST'])
@jwt_required()
def track_mood(user_id):
    """
    Track a user's mood over a time period
    
    Request body:
        - time_period_hours: Hours to analyze (default: 24)
    
    Returns:
        Mood analysis with trends and insights
    """
    try:
        username = get_jwt_identity()
        
        # Get requesting user's ID
        conn = get_db_connection()
        with conn.cursor() as cur:
            requester_id = get_user_id(username, cur)
            if requester_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            # Users can only track their own mood (privacy)
            if requester_id != user_id:
                return jsonify({'error': 'Unauthorized'}), 403
        
        conn.close()
        
        # Get time period from request
        data = request.get_json() or {}
        time_period = data.get('time_period_hours', 24)
        
        # Track mood
        result = _get_agent("mood_tracker").track_user_mood(user_id, time_period)
        
        if result.get('success'):
            return jsonify(result), 200
        else:
            return jsonify(result), 400
            
    except Exception as e:
        print(f"[AGENTS API] Error in track_mood: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/mood/history/<int:user_id>', methods=['GET'])
@jwt_required()
def get_mood_history(user_id):
    """
    Get user's mood history
    
    Query params:
        - limit: Number of records (default: 10)
    
    Returns:
        List of mood analyses
    """
    try:
        username = get_jwt_identity()
        
        # Get requesting user's ID
        conn = get_db_connection()
        with conn.cursor() as cur:
            requester_id = get_user_id(username, cur)
            if requester_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            # Users can only view their own mood history
            if requester_id != user_id:
                return jsonify({'error': 'Unauthorized'}), 403
        
        conn.close()
        
        # Get limit from query params
        limit = request.args.get('limit', 10, type=int)
        
        # Get mood history
        history = _get_agent("mood_tracker").get_mood_history(user_id, limit)
        
        return jsonify({
            'success': True,
            'mood_history': history,
            'count': len(history)
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_mood_history: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/mood/analyze-message', methods=['POST'])
@jwt_required()
def analyze_message():
    """
    Analyze sentiment of a single message
    
    Request body:
        - text: Message text to analyze
    
    Returns:
        Sentiment analysis results
    """
    try:
        data = request.get_json()
        
        if not data or 'text' not in data:
            return jsonify({'error': 'Message text is required'}), 400
        
        text = data['text']
        
        # Analyze the message
        result = _get_agent("mood_tracker").analyze_message(text)
        
        return jsonify({
            'success': True,
            'analysis': result
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in analyze_message: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/mood/trends/<int:user_id>', methods=['GET'])
@jwt_required()
def get_mood_trends(user_id):
    """
    Get mood trends over time for visualization
    
    Query params:
        - days: Number of days to look back (default: 7)
    
    Returns:
        Time-series mood data for charts
    """
    try:
        username = get_jwt_identity()
        
        # Verify user access
        conn = get_db_connection()
        with conn.cursor() as cur:
            requester_id = get_user_id(username, cur)
            if requester_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            # Users can only view their own trends
            if requester_id != user_id:
                return jsonify({'error': 'Unauthorized'}), 403
        
        conn.close()
        
        days = request.args.get('days', 7, type=int)
        result = _get_agent("mood_tracker").get_mood_trends(user_id, days)
        
        return jsonify(result), 200 if result.get('success') else 400
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_mood_trends: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/mood/reanalyze/<int:user_id>', methods=['POST'])
@jwt_required()
def reanalyze_mood_history(user_id):
    """
    Re-analyze all user messages and rebuild mood history.
    Useful when the analysis algorithm is updated.
    
    Query params:
        - days: Number of days of history to process (default: 30)
    
    Returns:
        Summary of re-analysis results
    """
    try:
        username = get_jwt_identity()
        
        # Verify user access
        conn = get_db_connection()
        with conn.cursor() as cur:
            requester_id = get_user_id(username, cur)
            if requester_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            # Users can only re-analyze their own data
            if requester_id != user_id:
                return jsonify({'error': 'Unauthorized'}), 403
        
        conn.close()
        
        days = request.args.get('days', 30, type=int)
        result = _get_agent("mood_tracker").reanalyze_user_history(user_id, days)
        
        return jsonify(result), 200 if result.get('success') else 400
        
    except Exception as e:
        print(f"[AGENTS API] Error in reanalyze_mood_history: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/mood/community', methods=['GET'])
@jwt_required()
def get_community_mood():
    """
    Get aggregated mood analytics for a community or channel
    
    Query params:
        - community_id: Community ID (optional)
        - channel_id: Channel ID (optional)
        - hours: Hours to look back (default: 24)
    
    Returns:
        Community-wide mood statistics
    """
    try:
        community_id = get_community_id_from_public_id(request.args.get('community_id'))
        channel_id = request.args.get('channel_id', type=int)
        hours = request.args.get('hours', 24, type=int)
        
        if not community_id and not channel_id:
            return jsonify({'error': 'community_id or channel_id required'}), 400
        
        result = _get_agent("mood_tracker").get_community_mood(
            community_id=community_id,
            channel_id=channel_id,
            hours=hours
        )
        
        return jsonify(result), 200 if result.get('success') else 400
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_community_mood: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/mood/recommendations/<int:user_id>', methods=['GET'])
@jwt_required()
def get_mood_recommendations(user_id):
    """
    Get personalized wellness recommendations based on mood patterns
    
    Returns:
        Wellness recommendations and alerts
    """
    try:
        username = get_jwt_identity()
        
        # Verify user access
        conn = get_db_connection()
        with conn.cursor() as cur:
            requester_id = get_user_id(username, cur)
            if requester_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            if requester_id != user_id:
                return jsonify({'error': 'Unauthorized'}), 403
        
        conn.close()
        
        result = _get_agent("mood_tracker").get_wellness_recommendations(user_id)
        
        return jsonify(result), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_mood_recommendations: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/mood/insights/<int:user_id>', methods=['GET'])
@jwt_required()
def get_mood_insights(user_id):
    """
    Get detailed insights about user's mood patterns
    
    Returns:
        Comprehensive mood insights including day/time analysis
    """
    try:
        username = get_jwt_identity()
        
        # Verify user access
        conn = get_db_connection()
        with conn.cursor() as cur:
            requester_id = get_user_id(username, cur)
            if requester_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            if requester_id != user_id:
                return jsonify({'error': 'Unauthorized'}), 403
        
        conn.close()
        
        result = _get_agent("mood_tracker").get_mood_insights(user_id)
        
        return jsonify(result), 200 if result.get('success') else 400
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_mood_insights: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# =====================================
# MODERATION AGENT ROUTES
# =====================================

@agents_bp.route('/moderation/check', methods=['POST'])
@jwt_required()
def check_moderation():
    """Check message for moderation"""
    try:
        username = get_jwt_identity()
        data = request.get_json()
        
        if not data or 'text' not in data:
            return jsonify({'error': 'Message text is required'}), 400
        
        text = data.get('text')
        channel_id = data.get('channel_id', 0)
        
        # Get user ID
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
        conn.close()
        
        # Run moderation
        result = _get_agent("moderation").moderate_message(text, user_id, channel_id)
        
        return jsonify({
            'success': True,
            'moderation': result
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in check_moderation: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/moderation/history', methods=['GET'])
@jwt_required()
def get_moderation_history():
    """Get moderation action history (OWNER ONLY, community-scoped)"""
    try:
        username = get_jwt_identity()
        limit = request.args.get('limit', 10, type=int)
        community_id = get_community_id_from_public_id(request.args.get('community_id'))
        channel_id = request.args.get('channel_id', type=int)
        
        if not community_id:
            return jsonify({'error': 'community_id is required'}), 400
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get user ID
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            # OWNER-ONLY CHECK: Only community owners can view moderation logs
            cur.execute("""
                SELECT role FROM community_members
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            
            member = cur.fetchone()
            if not member or member['role'] != 'owner':
                return jsonify({'error': 'Access denied. Only community owners can view moderation logs.'}), 403
            
            # Build query with community and optional channel filtering
            query = """
                SELECT 
                    l.id, l.input_text, l.output_text, l.confidence_score,
                    l.created_at, l.message_id,
                    u.username, u.display_name,
                    c.name as channel_name, c.id as channel_id
                FROM ai_agent_logs l
                LEFT JOIN users u ON l.user_id = u.id
                LEFT JOIN channels c ON l.channel_id = c.id
                WHERE l.action_type = 'moderation'
                    AND c.community_id = %s
            """
            params = [community_id]
            
            if channel_id:
                query += " AND l.channel_id = %s"
                params.append(channel_id)
            
            query += " ORDER BY l.created_at DESC LIMIT %s"
            params.append(limit)
            
            cur.execute(query, params)
            logs = cur.fetchall()
            
            history = []
            for log in logs:
                try:
                    output_data = json.loads(log['output_text']) if log['output_text'] else {}
                except:
                    output_data = {}
                
                history.append({
                    'id': log['id'],
                    'message': log['input_text'][:100] + '...' if len(log['input_text'] or '') > 100 else log['input_text'],
                    'action': output_data.get('action', 'unknown'),
                    'severity': output_data.get('severity', 'none'),
                    'reasons': output_data.get('reasons', []),
                    'confidence': log['confidence_score'],
                    'timestamp': log['created_at'].isoformat() if log['created_at'] else None,
                    'message_id': log['message_id'],
                    'user': {
                        'username': log['username'],
                        'display_name': log['display_name']
                    },
                    'channel': {
                        'id': log['channel_id'],
                        'name': log['channel_name']
                    }
                })
        
        conn.close()
        
        return jsonify({
            'success': True,
            'history': history,
            'count': len(history)
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_moderation_history: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/moderation/stats', methods=['GET'])
@jwt_required()
def get_moderation_stats():
    """Get moderation statistics (OWNER ONLY, community-scoped)"""
    try:
        username = get_jwt_identity()
        days = request.args.get('days', 7, type=int)
        community_id = get_community_id_from_public_id(request.args.get('community_id'))
        
        if not community_id:
            return jsonify({'error': 'community_id is required'}), 400
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get user ID
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            # OWNER-ONLY CHECK
            cur.execute("""
                SELECT role FROM community_members
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            
            member = cur.fetchone()
            if not member or member['role'] != 'owner':
                return jsonify({'error': 'Access denied. Only community owners can view moderation stats.'}), 403
            
            # Get stats for the last N days from ai_agent_logs (community-scoped)
            cur.execute("""
                SELECT COUNT(*) as total_checked
                FROM ai_agent_logs l
                JOIN channels c ON l.channel_id = c.id
                WHERE l.action_type = 'moderation'
                    AND c.community_id = %s
                    AND l.created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
            """, (community_id, days))
            
            stats_row = cur.fetchone()
            total_checked = stats_row['total_checked'] or 0
            
            # Parse output_text to get action counts
            cur.execute("""
                SELECT l.output_text
                FROM ai_agent_logs l
                JOIN channels c ON l.channel_id = c.id
                WHERE l.action_type = 'moderation'
                    AND c.community_id = %s
                    AND l.created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
            """, (community_id, days))
            
            rows = cur.fetchall()
            
            blocked = 0
            flagged = 0
            warned = 0
            reasons_count = {}
            
            for row in rows:
                try:
                    data = json.loads(row['output_text']) if row['output_text'] else {}
                    action = data.get('action', 'allow')
                    
                    if action == 'block':
                        blocked += 1
                    elif action == 'flag':
                        flagged += 1
                    elif action == 'warn':
                        warned += 1
                    
                    # Count reasons
                    for reason in data.get('reasons', []):
                        reasons_count[reason] = reasons_count.get(reason, 0) + 1
                except:
                    pass
        
        conn.close()
        
        stats = {
            'total_messages_checked': total_checked,
            'flagged_messages': flagged,
            'blocked_messages': blocked,
            'warnings_issued': warned,
            'reasons_breakdown': reasons_count
        }
        
        return jsonify({
            'success': True,
            'stats': stats
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_moderation_stats: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500


# =====================================
# ENGAGEMENT AGENT ROUTES
# =====================================

@agents_bp.route('/engagement/analyze', methods=['POST'])
@jwt_required()
def analyze_engagement():
    """Analyze engagement in a channel"""
    try:
        username = get_jwt_identity()
        data = request.get_json()
        
        time_period_hours = data.get('time_period_hours', 6)
        channel_id = data.get('channel_id')
        
        print(f"[ENGAGEMENT] Analyzing engagement for user {username}, channel={channel_id}, hours={time_period_hours}")
        
        # Get user ID
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            # If no channel_id provided, try to get user's default/first channel
            if not channel_id:
                cur.execute("""
                    SELECT c.id 
                    FROM channels c
                    JOIN channel_members cm ON c.id = cm.channel_id
                    WHERE cm.user_id = %s
                    AND c.is_dm = false
                    ORDER BY c.created_at DESC
                    LIMIT 1
                """, (user_id,))
                channel_row = cur.fetchone()
                if channel_row:
                    channel_id = channel_row['id']
                else:
                    conn.close()
                    return jsonify({'error': 'No channels found. Please specify a channel_id.'}), 400
            
            # Verify user has access to the channel
            cur.execute("""
                SELECT 1 FROM channel_members 
                WHERE channel_id = %s AND user_id = %s
            """, (channel_id, user_id))
            
            if not cur.fetchone():
                conn.close()
                return jsonify({'error': 'Access denied to this channel'}), 403
        
        conn.close()
        
        # Analyze engagement
        result = _get_agent("engagement").analyze_engagement(channel_id, time_period_hours)
        
        if not result.get('success'):
            return jsonify(result), 400
        
        # Format response with safe defaults
        engagement_score = result.get('engagement_score', 0)
        response = {
            'success': True,
            'analysis': {
                'engagement_level': result.get('engagement_level', 'inactive'),
                'engagement_score': int(engagement_score * 100) if engagement_score else 0,  # Convert to 0-100
                'message_count': result.get('message_count', 0),
                'participant_count': result.get('participant_count', 0),
                'avg_messages_per_user': result.get('avg_messages_per_user', 0),
                'silence_minutes': result.get('silence_minutes', 0),
                'participation_balance': result.get('participation_balance', 0),
                'suggestions': result.get('suggestions', []),
                'time_period_hours': result.get('time_period_hours', time_period_hours)
            }
        }
        
        print(f"[ENGAGEMENT] Analysis complete: {result.get('engagement_level', 'unknown')} ({result.get('engagement_score', 0)})")
        
        return jsonify(response), 200
        
    except Exception as e:
        print(f"[ENGAGEMENT] Error analyzing engagement: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/engagement/metrics/<int:channel_id>', methods=['GET'])
@jwt_required()
def get_engagement_metrics(channel_id):
    """Get engagement metrics for a channel"""
    try:
        username = get_jwt_identity()
        hours = request.args.get('hours', 24, type=int)
        
        # Check access
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            cur.execute("""
                SELECT 1 FROM channel_members 
                WHERE channel_id = %s AND user_id = %s
            """, (channel_id, user_id))
            
            if not cur.fetchone():
                # Return empty metrics instead of 403 for better UX
                return jsonify({
                    'success': True,
                    'metrics': {
                        'total_messages': 0,
                        'active_users': 0,
                        'engagement_score': 0,
                        'silence_minutes': 0,
                        'avg_messages_per_user': 0
                    }
                }), 200
        
        conn.close()
        
        # Get real engagement metrics
        result = _get_agent("engagement").analyze_engagement(channel_id, hours)
        
        if not result.get('success'):
            return jsonify({
                'success': True,
                'metrics': {
                    'total_messages': 0,
                    'active_users': 0,
                    'engagement_score': 0,
                    'silence_minutes': 0,
                    'avg_messages_per_user': 0
                }
            }), 200
        
        return jsonify({
            'success': True,
            'metrics': {
                'total_messages': result.get('message_count', 0),
                'active_users': result.get('participant_count', 0),
                'engagement_score': int(result.get('engagement_score', 0) * 100),
                'silence_minutes': result.get('silence_minutes', 0),
                'avg_messages_per_user': result.get('avg_messages_per_user', 0)
            }
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_engagement_metrics: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/engagement/trends/<int:channel_id>', methods=['GET'])
@jwt_required()
def get_engagement_trends(channel_id):
    """Get engagement trends for a channel"""
    try:
        username = get_jwt_identity()
        limit = request.args.get('limit', 10, type=int)
        
        # Check access
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            cur.execute("""
                SELECT 1 FROM channel_members 
                WHERE channel_id = %s AND user_id = %s
            """, (channel_id, user_id))
            
            if not cur.fetchone():
                return jsonify({'error': 'Access denied'}), 403
        
        conn.close()
        
        # Get engagement history
        history = _get_agent("engagement").get_engagement_history(channel_id, limit)
        
        return jsonify({
            'success': True,
            'trends': history
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_engagement_trends: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# =====================================
# ICE-BREAKER ACTIVITIES ROUTES
# =====================================

@agents_bp.route('/engagement/icebreaker', methods=['GET'])
@jwt_required()
def get_icebreaker():
    """Get a random ice-breaker activity"""
    try:
        activity_type = request.args.get('type', 'random')
        result = _get_agent("engagement").get_icebreaker_activity(activity_type)
        return jsonify(result), 200 if result.get('success') else 400
    except Exception as e:
        print(f"[AGENTS API] Error in get_icebreaker: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/engagement/icebreaker/categories', methods=['GET'])
@jwt_required()
def get_icebreaker_categories():
    """Get all ice-breaker categories"""
    try:
        result = _get_agent("engagement").get_all_icebreaker_categories()
        return jsonify(result), 200 if result.get('success') else 400
    except Exception as e:
        print(f"[AGENTS API] Error in get_icebreaker_categories: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/engagement/poll', methods=['GET'])
@jwt_required()
def get_quick_poll():
    """Get a quick poll"""
    try:
        category = request.args.get('category', 'random')
        result = _get_agent("engagement").get_quick_poll(category)
        return jsonify(result), 200 if result.get('success') else 400
    except Exception as e:
        print(f"[AGENTS API] Error in get_quick_poll: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/engagement/challenge', methods=['GET'])
@jwt_required()
def get_fun_challenge():
    """Get a fun challenge"""
    try:
        challenge_type = request.args.get('type', 'random')
        result = _get_agent("engagement").get_fun_challenge(challenge_type)
        return jsonify(result), 200 if result.get('success') else 400
    except Exception as e:
        print(f"[AGENTS API] Error in get_fun_challenge: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/engagement/starters', methods=['GET'])
@jwt_required()
def get_conversation_starters():
    """Get conversation starters by category"""
    try:
        category = request.args.get('category', 'general')
        result = _get_agent("engagement").get_conversation_starter_by_category(category)
        return jsonify(result), 200 if result.get('success') else 400
    except Exception as e:
        print(f"[AGENTS API] Error in get_conversation_starters: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/engagement/booster-pack', methods=['GET'])
@jwt_required()
def get_booster_pack():
    """Get engagement booster pack based on engagement level"""
    try:
        engagement_level = request.args.get('level', 'low')
        result = _get_agent("engagement").get_engagement_booster_pack(engagement_level)
        return jsonify(result), 200 if result.get('success') else 400
    except Exception as e:
        print(f"[AGENTS API] Error in get_booster_pack: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/engagement/send', methods=['POST'])
@jwt_required()
def send_engagement_content():
    """Post engagement content (starter / poll / icebreaker / challenge /
    pack) into a channel as a real AI bot message. Used by the engagement
    agent UI so admins can spark a conversation on demand."""
    try:
        username = get_jwt_identity()
        data = request.get_json() or {}
        channel_id = data.get('channel_id')
        kind = (data.get('kind') or 'pack').lower()
        category = data.get('category')

        if not channel_id:
            return jsonify({'error': 'channel_id is required'}), 400
        if kind not in ('starter', 'poll', 'icebreaker', 'challenge', 'pack'):
            return jsonify({'error': f'Unknown kind: {kind}'}), 400

        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                user_id = get_user_id(username, cur)
                if user_id is None:
                    return jsonify({'error': 'User not found'}), 404

                # Resolve community + verify the caller is a member.
                cur.execute("""
                    SELECT c.community_id
                    FROM channels c
                    JOIN channel_members cm ON cm.channel_id = c.id
                    WHERE c.id = %s AND cm.user_id = %s
                """, (channel_id, user_id))
                row = cur.fetchone()
                if not row:
                    return jsonify({'error': 'Access denied to this channel'}), 403
                community_id = row['community_id']
        finally:
            conn.close()

        result = _get_agent("engagement").post_engagement_content(
            channel_id, community_id, kind=kind, category=category)

        if not result.get('posted'):
            return jsonify({'success': False,
                            'error': result.get('error', 'Failed to post')}), 500

        # Each booster is posted as its own message/card. Return the full list
        # so the frontend can optimistically render each card immediately.
        items = [{
            'message_id': it.get('message_id'),
            'channel_id': channel_id,
            'content': it.get('content'),
            'author': it.get('author', 'Engagement Agent'),
            'created_at': it.get('created_at'),
            'kind': it.get('kind'),
            'card': it.get('card'),
        } for it in result.get('items', [])]

        return jsonify({'success': True, 'kind': result.get('kind'),
                        'channel_id': channel_id, 'items': items}), 200

    except Exception as e:
        print(f"[AGENTS API] Error in send_engagement_content: {e}")
        return jsonify({'error': 'Internal server error'}), 500


def _poll_tallies(cur, message_id, num_options=None):
    """Return (tallies_list, total) for a poll. ``tallies_list`` is a list of
    vote counts indexed by option_index. If ``num_options`` is known the list
    is padded to that length so every option has a slot."""
    cur.execute(
        "SELECT option_index, COUNT(*) AS c FROM engagement_poll_votes "
        "WHERE message_id = %s GROUP BY option_index",
        (message_id,),
    )
    rows = cur.fetchall()
    counts = {int(r['option_index']): int(r['c']) for r in rows}
    size = num_options if num_options is not None else (
        (max(counts.keys()) + 1) if counts else 0)
    tallies = [counts.get(i, 0) for i in range(size)]
    total = sum(counts.values())
    return tallies, total


def _resolve_poll(cur, message_id):
    """Return (channel_id, num_options) for a poll card, or (None, None) if the
    message isn't a poll."""
    cur.execute(
        "SELECT channel_id, payload FROM engagement_cards "
        "WHERE message_id = %s AND kind = 'poll'",
        (message_id,),
    )
    row = cur.fetchone()
    if not row:
        return None, None
    payload = row['payload']
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except Exception:
            payload = {}
    options = payload.get('options') if isinstance(payload, dict) else None
    return row['channel_id'], (len(options) if options else None)


@agents_bp.route('/engagement/poll/<int:message_id>', methods=['GET'])
@jwt_required()
def get_poll(message_id):
    """Return current poll tallies + the caller's vote (or null)."""
    try:
        username = get_jwt_identity()
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                user_id = get_user_id(username, cur)
                if user_id is None:
                    return jsonify({'error': 'User not found'}), 404
                channel_id, num_options = _resolve_poll(cur, message_id)
                if channel_id is None:
                    return jsonify({'error': 'Poll not found'}), 404
                cur.execute(
                    "SELECT 1 FROM channel_members WHERE channel_id = %s AND user_id = %s",
                    (channel_id, user_id))
                if not cur.fetchone():
                    return jsonify({'error': 'Access denied'}), 403
                tallies, total = _poll_tallies(cur, message_id, num_options)
                cur.execute(
                    "SELECT option_index FROM engagement_poll_votes "
                    "WHERE message_id = %s AND user_id = %s",
                    (message_id, user_id))
                mv = cur.fetchone()
                my_vote = int(mv['option_index']) if mv else None
            return jsonify({'tallies': tallies, 'total': total,
                            'my_vote': my_vote}), 200
        finally:
            conn.close()
    except Exception as e:
        print(f"[AGENTS API] Error in get_poll: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/engagement/poll/<int:message_id>/vote', methods=['POST'])
@jwt_required()
def vote_poll(message_id):
    """Cast or change the caller's vote on a poll. One vote per user; voting a
    different option moves the vote. Emits ``poll_vote_update`` to the channel."""
    try:
        username = get_jwt_identity()
        data = request.get_json() or {}
        option_index = data.get('option_index')
        if option_index is None or not isinstance(option_index, int) or option_index < 0:
            return jsonify({'error': 'option_index (int >= 0) is required'}), 400

        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                user_id = get_user_id(username, cur)
                if user_id is None:
                    return jsonify({'error': 'User not found'}), 404
                channel_id, num_options = _resolve_poll(cur, message_id)
                if channel_id is None:
                    return jsonify({'error': 'Poll not found'}), 404
                if num_options is not None and option_index >= num_options:
                    return jsonify({'error': 'option_index out of range'}), 400
                cur.execute(
                    "SELECT 1 FROM channel_members WHERE channel_id = %s AND user_id = %s",
                    (channel_id, user_id))
                if not cur.fetchone():
                    return jsonify({'error': 'Access denied'}), 403

                cur.execute(
                    "INSERT INTO engagement_poll_votes "
                    "(message_id, user_id, option_index) VALUES (%s, %s, %s) "
                    "ON DUPLICATE KEY UPDATE option_index = VALUES(option_index)",
                    (message_id, user_id, option_index))
                tallies, total = _poll_tallies(cur, message_id, num_options)
                conn.commit()
        finally:
            conn.close()

        try:
            from app import socketio
            socketio.emit('poll_vote_update', {
                'message_id': message_id,
                'channel_id': channel_id,
                'tallies': tallies,
                'total': total,
            }, room=f'channel_{channel_id}', namespace='/')
        except Exception as emit_exc:
            print(f"[AGENTS API] poll_vote_update emit failed: {emit_exc}")

        return jsonify({'success': True, 'tallies': tallies, 'total': total,
                        'my_vote': option_index}), 200

    except Exception as e:
        print(f"[AGENTS API] Error in vote_poll: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/engagement/activity/log', methods=['POST'])
@jwt_required()
def log_activity():
    """Log when an activity is used"""
    try:
        username = get_jwt_identity()
        data = request.get_json()
        
        channel_id = data.get('channel_id')
        activity_type = data.get('activity_type')
        activity_title = data.get('activity_title')
        
        if not all([channel_id, activity_type, activity_title]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        # Get user ID
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
        conn.close()
        
        success = _get_agent("engagement").log_activity_usage(
            channel_id, activity_type, activity_title, user_id
        )
        
        return jsonify({
            'success': success,
            'message': 'Activity logged' if success else 'Failed to log activity'
        }), 200 if success else 500
        
    except Exception as e:
        print(f"[AGENTS API] Error in log_activity: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/engagement/activity/stats/<int:channel_id>', methods=['GET'])
@jwt_required()
def get_activity_stats(channel_id):
    """Get activity usage statistics for a channel"""
    try:
        days = request.args.get('days', 7, type=int)
        result = _get_agent("engagement").get_activity_stats(channel_id, days)
        return jsonify(result), 200 if result.get('success') else 400
    except Exception as e:
        print(f"[AGENTS API] Error in get_activity_stats: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# =====================================
# WELLNESS AGENT ROUTES
# =====================================

@agents_bp.route('/wellness/check', methods=['GET'])
@jwt_required()
def check_wellness():
    """
    Check current user's wellness status
    
    Returns:
        Wellness assessment with suggestions and metrics
    """
    try:
        username = get_jwt_identity()
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
        conn.close()
        
        result = _get_agent("wellness").check_user_wellness(user_id)
        
        return jsonify(result), 200 if result.get('success') else 400
        
    except Exception as e:
        print(f"[AGENTS API] Error in check_wellness: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/wellness/analyze', methods=['POST'])
@jwt_required()
def analyze_wellness():
    """
    Comprehensive wellness analysis for current user with mood integration
    
    Body (optional):
        - time_period_hours: Analysis time window (default: 24)
    
    Returns:
        Detailed wellness analysis with scores, mood data, and insights
    """
    try:
        username = get_jwt_identity()
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
        conn.close()
        
        data = request.get_json() or {}
        time_period_hours = data.get('time_period_hours', 24)
        
        # Get wellness check
        wellness_check = _get_agent("wellness").check_user_wellness(user_id)
        
        if not wellness_check.get('success'):
            return jsonify(wellness_check), 400
        
        # Get activity suggestions
        suggestions = _get_agent("wellness").suggest_wellness_activity(user_id, wellness_check)
        
        # === MOOD INTEGRATION ===
        # Get mood trends from mood tracker
        mood_trends = _get_agent("mood_tracker").get_mood_trends(user_id, days=7)
        mood_recommendations = _get_agent("mood_tracker").get_wellness_recommendations(user_id)
        mood_insights = _get_agent("mood_tracker").get_mood_insights(user_id)
        
        # Calculate comprehensive scores
        metrics = wellness_check.get('metrics', {})
        concerns = wellness_check.get('concerns', [])
        
        # Calculate category scores with mood data integration
        base_activity_score = _calculate_activity_score(metrics)
        base_stress_score = _calculate_stress_score(concerns)
        base_communication_score = _calculate_communication_score(metrics)
        base_digital_score = _calculate_digital_wellbeing_score(metrics, concerns)
        
        # Adjust scores based on mood data
        mood_adjustment = _calculate_mood_wellness_adjustment(mood_trends, mood_recommendations)
        
        category_scores = {
            'activity_balance': min(1.0, max(0, base_activity_score)),
            'stress_level': min(1.0, max(0, base_stress_score * mood_adjustment.get('stress_multiplier', 1.0))),
            'communication_health': min(1.0, max(0, base_communication_score)),
            'digital_wellbeing': min(1.0, max(0, base_digital_score)),
            'emotional_wellness': mood_adjustment.get('emotional_score', 0.65)
        }
        
        # Overall wellness score (weighted average)
        weights = {'activity_balance': 0.2, 'stress_level': 0.25, 'communication_health': 0.15, 
                   'digital_wellbeing': 0.15, 'emotional_wellness': 0.25}
        overall_score = sum(category_scores[k] * weights[k] for k in category_scores) / sum(weights.values())
        
        # Identify risk factors including mood-based ones
        risk_factors = _identify_risk_factors(concerns, metrics)
        mood_risk_factors = _identify_mood_risk_factors(mood_trends, mood_recommendations)
        risk_factors.extend(mood_risk_factors)
        
        # Positive indicators including mood-based ones
        positive_indicators = _identify_positive_indicators(wellness_check)
        mood_positive = _identify_mood_positive_indicators(mood_trends, mood_recommendations)
        positive_indicators.extend(mood_positive)
        
        # Build mood summary for response
        mood_summary = {
            'has_mood_data': mood_trends.get('has_data', False),
            'dominant_mood': mood_trends.get('dominant_mood'),
            'mood_trend': mood_trends.get('trend_direction'),
            'sentiment_distribution': mood_trends.get('distribution', {}),
            'average_sentiment': mood_trends.get('average_sentiment', 0),
            'mood_alerts': mood_recommendations.get('alerts', []) if mood_recommendations.get('has_recommendations') else []
        }
        
        # Combine suggestions from wellness and mood
        # Wellness suggestions can be dicts or strings, mood recommendations are strings
        all_suggestions = []
        
        # Add wellness suggestions (could be dicts with 'message' key or strings)
        for s in wellness_check.get('suggestions', []):
            if isinstance(s, dict):
                all_suggestions.append(s.get('message', str(s)))
            else:
                all_suggestions.append(str(s))
        
        # Add activity suggestions
        for s in suggestions.get('suggestions', []):
            if isinstance(s, dict):
                all_suggestions.append(s.get('message', str(s)))
            else:
                all_suggestions.append(str(s))
        
        # Add mood recommendations (should be strings)
        if mood_recommendations.get('has_recommendations'):
            for r in mood_recommendations.get('recommendations', []):
                if isinstance(r, str):
                    all_suggestions.append(r)
                elif isinstance(r, dict):
                    all_suggestions.append(r.get('message', r.get('title', str(r))))
        
        # Deduplicate and limit
        unique_suggestions = list(dict.fromkeys(all_suggestions))[:10]
        
        return jsonify({
            'success': True,
            'analysis': {
                'overall_wellness_score': round(overall_score, 2),
                'wellness_level': _get_wellness_level_from_score(overall_score),
                'category_scores': category_scores,
                'risk_factors': risk_factors,
                'positive_indicators': positive_indicators,
                'time_period_hours': time_period_hours
            },
            'mood_summary': mood_summary,
            'mood_insights': mood_insights if mood_insights.get('has_insights') else None,
            'metrics': metrics,
            'suggestions': unique_suggestions,
            'concerns': concerns
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in analyze_wellness: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500


def _calculate_mood_wellness_adjustment(mood_trends: dict, mood_recommendations: dict) -> dict:
    """Calculate wellness score adjustments based on mood data"""
    adjustment = {
        'stress_multiplier': 1.0,
        'emotional_score': 0.65  # Default neutral score
    }
    
    if not mood_trends.get('has_data'):
        return adjustment
    
    # Get mood distribution
    distribution = mood_trends.get('distribution', {})
    total = sum(distribution.values())
    
    if total > 0:
        positive_ratio = distribution.get('positive', 0) / total
        negative_ratio = distribution.get('negative', 0) / total
        
        # Calculate emotional wellness score (0-1)
        adjustment['emotional_score'] = max(0.2, min(0.95, 0.5 + (positive_ratio - negative_ratio) * 0.5))
        
        # Adjust stress multiplier based on negative mood patterns
        if negative_ratio > 0.5:
            adjustment['stress_multiplier'] = 0.7  # Lower stress score if highly negative
        elif negative_ratio > 0.3:
            adjustment['stress_multiplier'] = 0.85
        elif positive_ratio > 0.6:
            adjustment['stress_multiplier'] = 1.15  # Boost if mostly positive
    
    # Adjust based on trend direction
    trend = mood_trends.get('trend_direction')
    if trend == 'declining':
        adjustment['emotional_score'] *= 0.9
    elif trend == 'improving':
        adjustment['emotional_score'] = min(0.95, adjustment['emotional_score'] * 1.1)
    
    return adjustment


def _identify_mood_risk_factors(mood_trends: dict, mood_recommendations: dict) -> list:
    """Identify risk factors based on mood patterns"""
    risk_factors = []
    
    if not mood_trends.get('has_data'):
        return risk_factors
    
    distribution = mood_trends.get('distribution', {})
    total = sum(distribution.values())
    
    if total > 0:
        negative_ratio = distribution.get('negative', 0) / total
        
        if negative_ratio > 0.6:
            risk_factors.append({
                'factor': 'High Negative Mood Pattern',
                'description': 'Over 60% of your recent messages show negative sentiment. Consider practicing self-care.',
                'severity': 'high',
                'impact_score': 0.8,
                'category': 'emotional_wellness'
            })
        elif negative_ratio > 0.4:
            risk_factors.append({
                'factor': 'Elevated Negative Sentiment',
                'description': 'Your recent communications show moderately negative patterns.',
                'severity': 'medium',
                'impact_score': 0.5,
                'category': 'emotional_wellness'
            })
    
    if mood_trends.get('trend_direction') == 'declining':
        risk_factors.append({
            'factor': 'Declining Mood Trend',
            'description': 'Your mood has been trending downward over the past week.',
            'severity': 'medium',
            'impact_score': 0.6,
            'category': 'emotional_wellness'
        })
    
    # Check for mood alerts
    alerts = mood_recommendations.get('alerts', []) if mood_recommendations.get('has_recommendations') else []
    for alert in alerts:
        if alert.get('severity') == 'warning':
            risk_factors.append({
                'factor': alert.get('type', 'Mood Alert').replace('_', ' ').title(),
                'description': alert.get('message', 'Mood pattern requires attention'),
                'severity': 'medium',
                'impact_score': 0.55,
                'category': 'emotional_wellness'
            })
    
    return risk_factors


def _identify_mood_positive_indicators(mood_trends: dict, mood_recommendations: dict) -> list:
    """Identify positive indicators based on mood patterns"""
    positive_indicators = []
    
    if not mood_trends.get('has_data'):
        return positive_indicators
    
    distribution = mood_trends.get('distribution', {})
    total = sum(distribution.values())
    
    if total > 0:
        positive_ratio = distribution.get('positive', 0) / total
        
        if positive_ratio > 0.6:
            positive_indicators.append('Consistently positive communication patterns')
        
        if positive_ratio > 0.7:
            positive_indicators.append('Excellent emotional expression in messages')
    
    if mood_trends.get('trend_direction') == 'improving':
        positive_indicators.append('Mood trend is improving over recent days')
    
    dominant = mood_trends.get('dominant_mood')
    if dominant == 'positive':
        positive_indicators.append('Overall positive dominant mood detected')
    
    return positive_indicators


def _get_wellness_level_from_score(score: float) -> str:
    """Convert numeric score to wellness level label"""
    if score >= 0.85:
        return 'excellent'
    elif score >= 0.70:
        return 'good'
    elif score >= 0.50:
        return 'moderate'
    elif score >= 0.35:
        return 'concerning'
    else:
        return 'poor'


@agents_bp.route('/wellness/recommendations', methods=['GET'])
@jwt_required()
def get_wellness_recommendations():
    """
    Get personalized wellness recommendations
    
    Returns:
        List of wellness recommendations based on user's state
    """
    try:
        username = get_jwt_identity()
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
        conn.close()
        
        # Get current wellness state
        wellness_check = _get_agent("wellness").check_user_wellness(user_id)
        activity_suggestions = _get_agent("wellness").suggest_wellness_activity(user_id, wellness_check)
        
        # Build recommendations based on state
        recommendations = []
        concerns = wellness_check.get('concerns', [])
        wellness_level = wellness_check.get('wellness_level', 'good')
        
        # Add recommendations based on concerns
        if 'high_activity' in concerns:
            recommendations.append({
                'title': 'Take Regular Breaks',
                'description': 'Your messaging activity is higher than usual. Schedule short breaks every hour to maintain focus and reduce eye strain.',
                'priority': 'high',
                'category': 'break',
                'icon': 'coffee'
            })
        
        if 'continuous_activity' in concerns:
            recommendations.append({
                'title': 'Time for a Breather',
                'description': 'You\'ve been active for an extended period. Step away from the screen for 15 minutes to recharge.',
                'priority': 'high',
                'category': 'break',
                'icon': 'pause'
            })
        
        if 'stress_indicators' in concerns:
            recommendations.append({
                'title': 'Practice Mindfulness',
                'description': 'Your recent messages suggest some stress. Try a quick breathing exercise or a short walk.',
                'priority': 'high',
                'category': 'mental_health',
                'icon': 'brain'
            })
        
        if 'late_night_activity' in concerns:
            recommendations.append({
                'title': 'Prioritize Sleep',
                'description': 'Late-night screen time can affect sleep quality. Consider wrapping up and getting rest.',
                'priority': 'medium',
                'category': 'sleep',
                'icon': 'moon'
            })
        
        # Add general wellness recommendations
        if wellness_level == 'good' or len(recommendations) == 0:
            recommendations.extend([
                {
                    'title': 'Stay Hydrated',
                    'description': 'Remember to drink water regularly while you work.',
                    'priority': 'low',
                    'category': 'health',
                    'icon': 'droplet'
                },
                {
                    'title': 'Posture Check',
                    'description': 'Take a moment to check your posture. Sit up straight and relax your shoulders.',
                    'priority': 'low',
                    'category': 'physical',
                    'icon': 'activity'
                },
                {
                    'title': 'Eye Rest',
                    'description': 'Follow the 20-20-20 rule: Every 20 minutes, look at something 20 feet away for 20 seconds.',
                    'priority': 'low',
                    'category': 'health',
                    'icon': 'eye'
                }
            ])
        
        # Add activity suggestions
        for suggestion in activity_suggestions.get('suggestions', []):
            recommendations.append({
                'title': 'Wellness Activity',
                'description': suggestion,
                'priority': 'medium',
                'category': 'activity',
                'icon': 'sparkles'
            })
        
        return jsonify({
            'success': True,
            'recommendations': recommendations[:8],  # Limit to 8 recommendations
            'wellness_level': wellness_level,
            'concerns_count': len(concerns)
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_wellness_recommendations: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/wellness/insights/<int:user_id>', methods=['GET'])
@jwt_required()
def get_wellness_insights(user_id):
    """
    Get wellness insights and history
    
    Query params:
        - days: Number of days of history (default: 7)
    
    Returns:
        Wellness insights and historical data
    """
    try:
        username = get_jwt_identity()
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            requester_id = get_user_id(username, cur)
            if requester_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            if requester_id != user_id:
                return jsonify({'error': 'Unauthorized'}), 403
        conn.close()
        
        days = request.args.get('days', 7, type=int)
        
        # Get wellness history
        history = _get_agent("wellness").get_wellness_history(user_id, limit=days * 2)
        
        # Calculate insights from history
        insights = _calculate_wellness_insights(history)
        
        return jsonify({
            'success': True,
            'insights': insights,
            'history': history,
            'days': days
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_wellness_insights: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/wellness/history', methods=['GET'])
@jwt_required()
def get_wellness_history():
    """
    Get user's wellness check history
    
    Query params:
        - limit: Number of records (default: 10)
    
    Returns:
        List of past wellness checks
    """
    try:
        username = get_jwt_identity()
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
        conn.close()
        
        limit = request.args.get('limit', 10, type=int)
        history = _get_agent("wellness").get_wellness_history(user_id, limit=limit)
        
        return jsonify({
            'success': True,
            'history': history,
            'count': len(history)
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_wellness_history: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/wellness/trends', methods=['GET'])
@jwt_required()
def get_wellness_trends():
    """
    Get wellness trends over time
    
    Query params:
        - days: Number of days (default: 7)
    
    Returns:
        Wellness trend data for charts
    """
    try:
        username = get_jwt_identity()
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
        conn.close()
        
        days = request.args.get('days', 7, type=int)
        history = _get_agent("wellness").get_wellness_history(user_id, limit=days * 3)
        
        # Aggregate by day
        from collections import defaultdict
        daily_data = defaultdict(list)
        
        for record in history:
            if record.get('created_at'):
                date_str = record['created_at'][:10] if isinstance(record['created_at'], str) else record['created_at'].strftime('%Y-%m-%d')
                check_result = record.get('check_result', {})
                wellness_level = check_result.get('wellness_level', 'unknown')
                score = 1.0 if wellness_level == 'good' else 0.7 if wellness_level == 'monitor' else 0.4
                daily_data[date_str].append({
                    'score': score,
                    'level': wellness_level,
                    'concerns': len(check_result.get('concerns', []))
                })
        
        # Build trend data
        trends = []
        for date, records in sorted(daily_data.items()):
            avg_score = sum(r['score'] for r in records) / len(records)
            avg_concerns = sum(r['concerns'] for r in records) / len(records)
            trends.append({
                'date': date,
                'wellness_score': round(avg_score * 100),
                'checks_count': len(records),
                'avg_concerns': round(avg_concerns, 1),
                'dominant_level': max(set(r['level'] for r in records), key=lambda x: [r['level'] for r in records].count(x))
            })
        
        return jsonify({
            'success': True,
            'trends': trends,
            'days': days,
            'total_checks': len(history)
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_wellness_trends: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500


# Helper functions for wellness calculations
def _calculate_activity_score(metrics):
    """Calculate activity balance score (0-1)"""
    if not metrics:
        return 0.8  # Default good score
    
    avg_per_hour = metrics.get('avg_messages_per_hour', 0)
    # Ideal range: 10-30 messages per hour
    if 10 <= avg_per_hour <= 30:
        return 0.9
    elif avg_per_hour < 10:
        return 0.7  # Low activity
    elif avg_per_hour <= 50:
        return 0.6  # Slightly high
    else:
        return 0.4  # Too high


def _calculate_stress_score(concerns):
    """Calculate stress level score (0-1, higher is better/less stress)"""
    if 'stress_indicators' in concerns:
        return 0.3
    elif 'high_activity' in concerns or 'continuous_activity' in concerns:
        return 0.5
    elif 'late_night_activity' in concerns:
        return 0.6
    return 0.9


def _calculate_communication_score(metrics):
    """Calculate communication health score (0-1)"""
    if not metrics:
        return 0.7
    
    messages = metrics.get('messages_today', 0)
    duration = metrics.get('active_duration_hours', 0)
    
    if duration == 0:
        return 0.8
    
    # Check for balanced communication
    messages_per_hour = messages / max(duration, 1)
    if 5 <= messages_per_hour <= 40:
        return 0.85
    elif messages_per_hour < 5:
        return 0.6
    else:
        return 0.5


def _calculate_digital_wellbeing_score(metrics, concerns):
    """Calculate digital wellbeing score (0-1)"""
    score = 0.8  # Start with good score
    
    if 'late_night_activity' in concerns:
        score -= 0.2
    if 'continuous_activity' in concerns:
        score -= 0.15
    if 'high_activity' in concerns:
        score -= 0.1
    
    # Check time since last break
    if metrics:
        time_since_last = metrics.get('time_since_last_message_min', 0)
        if time_since_last > 30:  # Had a break
            score += 0.1
    
    return max(0.2, min(1.0, score))


def _identify_risk_factors(concerns, metrics):
    """Identify wellness risk factors"""
    risk_factors = []
    
    if 'high_activity' in concerns:
        risk_factors.append({
            'factor': 'High Message Volume',
            'description': 'You\'re sending more messages than usual, which may lead to fatigue.',
            'severity': 'medium',
            'impact_score': 0.6
        })
    
    if 'continuous_activity' in concerns:
        risk_factors.append({
            'factor': 'Extended Screen Time',
            'description': 'You\'ve been active without significant breaks.',
            'severity': 'high',
            'impact_score': 0.75
        })
    
    if 'stress_indicators' in concerns:
        risk_factors.append({
            'factor': 'Stress Detected',
            'description': 'Your recent messages show signs of stress or frustration.',
            'severity': 'high',
            'impact_score': 0.8
        })
    
    if 'late_night_activity' in concerns:
        risk_factors.append({
            'factor': 'Late Night Usage',
            'description': 'Using devices late at night can affect sleep quality.',
            'severity': 'medium',
            'impact_score': 0.5
        })
    
    return risk_factors


def _identify_positive_indicators(wellness_check):
    """Identify positive wellness indicators"""
    indicators = []
    metrics = wellness_check.get('metrics', {})
    concerns = wellness_check.get('concerns', [])
    
    if not concerns or len(concerns) == 0:
        indicators.append('No wellness concerns detected')
    
    if metrics.get('time_since_last_message_min', 0) > 15:
        indicators.append('Taking regular breaks')
    
    if metrics.get('active_duration_hours', 0) < 3:
        indicators.append('Healthy activity duration')
    
    if metrics.get('avg_messages_per_hour', 0) <= 30:
        indicators.append('Balanced communication pace')
    
    if wellness_check.get('wellness_level') == 'good':
        indicators.append('Overall wellness is good')
    
    return indicators if indicators else ['Keep maintaining your current habits']


def _calculate_wellness_insights(history):
    """Calculate insights from wellness history"""
    if not history:
        return {
            'has_insights': False,
            'message': 'Not enough data to generate insights'
        }
    
    # Analyze patterns
    levels = []
    total_concerns = 0
    concern_types = {}
    
    for record in history:
        check_result = record.get('check_result', {})
        levels.append(check_result.get('wellness_level', 'unknown'))
        
        concerns = check_result.get('concerns', [])
        total_concerns += len(concerns)
        for c in concerns:
            concern_types[c] = concern_types.get(c, 0) + 1
    
    # Calculate stats
    good_count = levels.count('good')
    total = len(levels)
    good_percentage = (good_count / total * 100) if total > 0 else 0
    
    # Find most common concern
    most_common_concern = max(concern_types.items(), key=lambda x: x[1])[0] if concern_types else None
    
    insights = []
    if good_percentage >= 70:
        insights.append('Your wellness has been consistently good')
    elif good_percentage >= 50:
        insights.append('Your wellness is moderate with room for improvement')
    else:
        insights.append('Your wellness could use more attention')
    
    if most_common_concern:
        concern_messages = {
            'high_activity': 'You tend to have high messaging activity',
            'continuous_activity': 'You often work for extended periods without breaks',
            'stress_indicators': 'Stress patterns have been detected in your messages',
            'late_night_activity': 'You frequently use the platform late at night'
        }
        insights.append(concern_messages.get(most_common_concern, f'Common pattern: {most_common_concern}'))
    
    return {
        'has_insights': True,
        'good_wellness_percentage': round(good_percentage),
        'total_checks': total,
        'avg_concerns_per_check': round(total_concerns / max(total, 1), 1),
        'most_common_concern': most_common_concern,
        'insights': insights
    }


# =====================================
# KNOWLEDGE BUILDER AGENT ROUTES
# =====================================

@agents_bp.route('/knowledge/base/<int:channel_id>', methods=['GET'])
@jwt_required()
def get_knowledge_base(channel_id):
    """
    Get knowledge base entries for a channel.
    This endpoint is used by the AIAgentContext.
    
    Query params:
        - limit: Maximum number of entries (default: 20)
    
    Returns:
        List of knowledge base entries
    """
    conn = None
    try:
        username = get_jwt_identity()
        limit = min(request.args.get('limit', 20, type=int), 100)
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get user ID
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            # Check if user is member of the channel
            cur.execute("""
                SELECT 1 FROM channel_members 
                WHERE channel_id = %s AND user_id = %s
            """, (channel_id, user_id))
            
            if not cur.fetchone():
                # Return empty result instead of 403 for better UX
                return jsonify({
                    'success': True,
                    'knowledge': [],
                    'total': 0
                }), 200
            
            # Get the community_id for this channel
            cur.execute("SELECT community_id FROM channels WHERE id = %s", (channel_id,))
            channel_row = cur.fetchone()
            if not channel_row:
                return jsonify({
                    'success': True,
                    'knowledge': [],
                    'total': 0
                }), 200
            
            community_id = channel_row['community_id']
            
            # Get knowledge base entries for this channel or community
            cur.execute("""
                SELECT 
                    kb.id, kb.title, kb.content, kb.source, kb.related_channel,
                    kb.created_at, kb.updated_at,
                    c.name as channel_name
                FROM knowledge_base kb
                LEFT JOIN channels c ON kb.related_channel = c.id
                WHERE kb.related_channel = %s
                ORDER BY kb.created_at DESC
                LIMIT %s
            """, (channel_id, limit))
            
            entries = cur.fetchall()
            
            result = []
            for entry in entries:
                result.append({
                    'id': entry['id'],
                    'title': entry['title'],
                    'content': entry['content'],
                    'source': entry['source'],
                    'channel_id': entry['related_channel'],
                    'channel_name': entry['channel_name'],
                    'created_at': entry['created_at'].isoformat() if entry['created_at'] else None,
                    'updated_at': entry['updated_at'].isoformat() if entry['updated_at'] else None
                })
            
            return jsonify({
                'success': True,
                'knowledge': result,
                'total': len(result)
            }), 200
            
    except Exception as e:
        print(f"[AGENTS API] Error in get_knowledge_base: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/knowledge/insights', methods=['GET'])
@jwt_required()
def get_knowledge_insights():
    """Get knowledge insights scoped to a community"""
    conn = None
    try:
        username = get_jwt_identity()
        time_period_hours = request.args.get('time_period_hours', 24, type=int)
        community_id = get_community_id_from_public_id(request.args.get('community_id'))

        if not community_id:
            return jsonify({'error': 'community_id is required'}), 400

        conn = get_db_connection()
        insights = {
            'total_knowledge_items': 0,
            'unique_topics': 0,
            'avg_relevance': 0,
            'growth_rate': 0,
            'insights': []
        }
        with conn.cursor() as cur:
            # Validate membership in the community
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404

            cur.execute(
                """
                SELECT 1 FROM community_members
                WHERE community_id = %s AND user_id = %s
                """,
                (community_id, user_id)
            )
            if not cur.fetchone():
                conn.close()
                return jsonify({'error': 'Access denied to this community'}), 403

            # Fetch knowledge entries for channels in this community
            cur.execute(
                """
                SELECT kb.id, kb.title, kb.content, kb.created_at
                FROM knowledge_base kb
                JOIN channels c ON kb.related_channel = c.id
                WHERE c.community_id = %s
                  AND kb.created_at >= DATE_SUB(NOW(), INTERVAL %s HOUR)
                ORDER BY kb.created_at DESC
                """,
                (community_id, time_period_hours)
            )
            rows = cur.fetchall()
            insights['total_knowledge_items'] = len(rows)
            topics = []
            relevance_scores = []
            types = set()
            
            for r in rows:
                try:
                    payload = json.loads(r['content']) if r['content'] else {}
                except Exception:
                    payload = {}
                
                # Collect all types
                item_type = payload.get('type', 'unknown')
                if item_type:
                    types.add(item_type)
                
                # Collect topics from various sources
                if item_type == 'topic' and payload.get('topic'):
                    topics.append(payload.get('topic'))
                elif item_type in ['faq', 'qa'] and payload.get('tags'):
                    topics.extend(payload.get('tags', []))
                elif item_type == 'decision' and payload.get('tags'):
                    topics.extend(payload.get('tags', []))
                elif item_type == 'definition' and payload.get('tags'):
                    topics.extend(payload.get('tags', []))
                
                # Collect relevance scores
                if 'relevance_score' in payload and isinstance(payload['relevance_score'], (int, float)):
                    relevance_scores.append(float(payload['relevance_score']))
            
            insights['unique_topics'] = len(set(topics))
            insights['avg_relevance'] = (sum(relevance_scores) / len(relevance_scores)) if relevance_scores else 0
            
            # Calculate growth rate (compare with previous period)
            cur.execute(
                """
                SELECT COUNT(*) as prev_count
                FROM knowledge_base kb
                JOIN channels c ON kb.related_channel = c.id
                WHERE c.community_id = %s
                  AND kb.created_at >= DATE_SUB(NOW(), INTERVAL %s HOUR)
                  AND kb.created_at < DATE_SUB(NOW(), INTERVAL %s HOUR)
                """,
                (community_id, time_period_hours * 2, time_period_hours)
            )
            prev_result = cur.fetchone()
            prev_count = prev_result['prev_count'] if prev_result else 0
            
            if prev_count > 0:
                insights['growth_rate'] = (len(rows) - prev_count) / prev_count
            else:
                insights['growth_rate'] = 1.0 if len(rows) > 0 else 0
            
            # Generate insights
            if len(rows) > 0:
                insights['insights'] = [
                    f"Found {len(rows)} knowledge items in the last {time_period_hours} hours",
                    f"Covering {len(set(topics))} unique topics" if topics else "No topics tagged yet",
                    f"Knowledge types: {', '.join(types)}" if types else "No categorized items"
                ]
        conn.close()
        return jsonify({'success': True, 'insights': insights}), 200

    except Exception as e:
        print(f"[AGENTS API] Error in get_knowledge_insights: {e}")
        import traceback
        traceback.print_exc()
        if conn:
            conn.close()
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/knowledge/topics', methods=['GET'])
@jwt_required()
def get_knowledge_topics():
    """Get knowledge topics scoped to a community"""
    conn = None
    try:
        username = get_jwt_identity()
        limit = request.args.get('limit', 20, type=int)
        community_id = get_community_id_from_public_id(request.args.get('community_id'))

        if not community_id:
            return jsonify({'error': 'community_id is required'}), 400

        conn = get_db_connection()
        topics_counter = {}
        with conn.cursor() as cur:
            # Validate membership in the community
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            cur.execute(
                """
                SELECT 1 FROM community_members
                WHERE community_id = %s AND user_id = %s
                """,
                (community_id, user_id)
            )
            if not cur.fetchone():
                conn.close()
                return jsonify({'error': 'Access denied to this community'}), 403

            # Fetch topics for channels within the community
            cur.execute(
                """
                SELECT kb.content
                FROM knowledge_base kb
                JOIN channels c ON kb.related_channel = c.id
                WHERE c.community_id = %s
                ORDER BY kb.created_at DESC
                LIMIT 500
                """,
                (community_id,)
            )
            rows = cur.fetchall()
            for r in rows:
                try:
                    payload = json.loads(r['content']) if r['content'] else {}
                except Exception:
                    payload = {}
                
                item_type = payload.get('type', 'unknown')
                
                # Extract topics from 'topic' type items
                if item_type == 'topic' and payload.get('topic'):
                    key = payload['topic']
                    topics_counter[key] = topics_counter.get(key, 0) + 1
                
                # Extract topics from tags in all item types (faq, definition, decision, qa)
                if item_type in ['faq', 'qa', 'definition', 'decision']:
                    tags = payload.get('tags', [])
                    if isinstance(tags, list):
                        for tag in tags:
                            if tag and isinstance(tag, str):
                                topics_counter[tag] = topics_counter.get(tag, 0) + 1
                
                # Also extract from question text for FAQs (for better topic detection)
                if item_type in ['faq', 'qa'] and payload.get('question'):
                    question = payload['question'].lower()
                    # Extract common tech keywords
                    tech_keywords = ['docker', 'react', 'mysql', 'python', 'flask', 
                                   'database', 'authentication', 'deployment', 'api',
                                   'javascript', 'typescript', 'node', 'express']
                    for keyword in tech_keywords:
                        if keyword in question:
                            topics_counter[keyword.capitalize()] = topics_counter.get(keyword.capitalize(), 0) + 1
                            
        conn.close()
        topics_sorted = sorted(topics_counter.items(), key=lambda x: x[1], reverse=True)[:limit]
        topics = [{'topic': t[0], 'count': t[1]} for t in topics_sorted]
        return jsonify({'success': True, 'topics': topics}), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_knowledge_topics: {e}")
        import traceback
        traceback.print_exc()
        if conn:
            conn.close()
@jwt_required()
def get_knowledge_base(channel_id):
    """Get knowledge base for a channel"""
    try:
        username = get_jwt_identity()
        limit = request.args.get('limit', 20, type=int)
        
        # Check access
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            cur.execute("""
                SELECT 1 FROM channel_members 
                WHERE channel_id = %s AND user_id = %s
            """, (channel_id, user_id))
            
            if not cur.fetchone():
                return jsonify({'error': 'Access denied'}), 403
        
        # Fetch knowledge_base entries for channel
        knowledge_items = []
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, title, content, created_at
                FROM knowledge_base
                WHERE related_channel = %s
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (channel_id, limit)
            )
            rows = cur.fetchall()
            for r in rows:
                try:
                    payload = json.loads(r['content']) if r['content'] else {}
                except Exception:
                    payload = {}
                # Map payload to frontend KnowledgeEntry shape
                if payload.get('type') == 'qa':
                    knowledge_items.append({
                        'id': r['id'],
                        'question': payload.get('question') or r['title'] or 'Q/A',
                        'answer': payload.get('answer') or '',
                        'tags': payload.get('tags') or [],
                        'relevance_score': payload.get('relevance_score') or 0,
                        'usage_count': payload.get('usage_count') or 0,
                        'created_at': r['created_at'].isoformat() if r.get('created_at') else None
                    })
                elif payload.get('type') == 'topic':
                    knowledge_items.append({
                        'id': r['id'],
                        'question': f"Topic: {payload.get('topic', r['title'] or 'Topic')}",
                        'answer': payload.get('summary') or '',
                        'tags': [payload.get('topic')] if payload.get('topic') else [],
                        'relevance_score': 0,
                        'usage_count': payload.get('message_count') or 0,
                        'created_at': r['created_at'].isoformat() if r.get('created_at') else None
                    })
                elif payload.get('type') == 'decision':
                    knowledge_items.append({
                        'id': r['id'],
                        'question': payload.get('decision') or r['title'] or 'Decision',
                        'answer': '',
                        'tags': payload.get('tags') or [],
                        'relevance_score': 0,
                        'usage_count': 0,
                        'created_at': r['created_at'].isoformat() if r.get('created_at') else None
                    })
                elif payload.get('type') == 'resource':
                    knowledge_items.append({
                        'id': r['id'],
                        'question': r['title'] or 'Resource',
                        'answer': payload.get('url') or '',
                        'tags': [],
                        'relevance_score': 0,
                        'usage_count': 0,
                        'created_at': r['created_at'].isoformat() if r.get('created_at') else None
                    })
                else:
                    knowledge_items.append({
                        'id': r['id'],
                        'question': r['title'] or 'Knowledge',
                        'answer': '',
                        'tags': [],
                        'relevance_score': 0,
                        'usage_count': 0,
                        'created_at': r['created_at'].isoformat() if r.get('created_at') else None
                    })
        conn.close()
        return jsonify({'success': True, 'knowledge': knowledge_items}), 200

    except Exception as e:
        print(f"[AGENTS API] Error in get_knowledge_base: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/knowledge/extract/<int:channel_id>', methods=['POST'])
@jwt_required()
def extract_knowledge_channel(channel_id):
    """Extract knowledge from a specific channel within a time window."""
    try:
        username = get_jwt_identity()
        data = request.get_json() or {}
        # Use time_period_hours if provided, else default to 24
        time_period_hours = int(data.get('time_period_hours', 24))

        # Access checks
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404

            cur.execute(
                """
                SELECT 1 FROM channel_members WHERE channel_id = %s AND user_id = %s
                """,
                (channel_id, user_id)
            )
            if not cur.fetchone():
                return jsonify({'error': 'Access denied'}), 403

        conn.close()

        # Perform extraction
        result = _get_agent("knowledge_builder").extract_knowledge(channel_id=channel_id, time_period_hours=time_period_hours)
        if not result.get('success'):
            return jsonify({'success': False, 'error': result.get('error', 'Extraction failed')}), 400

        # Build simple list for immediate response (QA + decisions + topics)
        knowledge_out = []
        for qa in result.get('qa_pairs', []):
            knowledge_out.append({
                'id': 0,
                'question': qa.get('question'),
                'answer': qa.get('answer'),
                'tags': [],
                'relevance_score': 0,
                'usage_count': 0,
                'created_at': qa.get('timestamp')
            })
        for dec in result.get('decisions', []):
            knowledge_out.append({
                'id': 0,
                'question': dec.get('decision'),
                'answer': '',
                'tags': [],
                'relevance_score': 0,
                'usage_count': 0,
                'created_at': dec.get('timestamp')
            })
        for entry in result.get('knowledge_entries', []):
            knowledge_out.append({
                'id': 0,
                'question': f"Topic: {entry.get('topic', 'General')}",
                'answer': entry.get('summary', ''),
                'tags': [entry.get('topic')] if entry.get('topic') else [],
                'relevance_score': 0,
                'usage_count': entry.get('message_count', 0),
                'created_at': entry.get('timestamp')
            })

        return jsonify({'success': True, 'knowledge': knowledge_out}), 200
    except Exception as e:
        print(f"[AGENTS API] Error in extract_knowledge_channel: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/knowledge/extract', methods=['POST'])
@jwt_required()
def extract_knowledge_time():
    """Extract knowledge across accessible channels within a time window (community-scoped)."""
    try:
        username = get_jwt_identity()
        data = request.get_json() or {}
        time_period_hours = int(data.get('time_period_hours', 24))
        topic_filter = data.get('topic')
        raw_community_id = data.get('community_id')
        community_id = get_community_id_from_public_id(raw_community_id) if raw_community_id else None

        if not community_id:
            return jsonify({'error': 'community_id is required'}), 400

        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404

            # Ensure membership in the requested community
            cur.execute(
                """
                SELECT 1 FROM community_members
                WHERE community_id = %s AND user_id = %s
                """,
                (community_id, user_id)
            )
            if not cur.fetchone():
                return jsonify({'error': 'Access denied to this community'}), 403

            # Get channels user is member of within the specified community
            cur.execute(
                """
                SELECT cm.channel_id
                FROM channel_members cm
                JOIN channels c ON cm.channel_id = c.id
                WHERE cm.user_id = %s AND c.community_id = %s
                """,
                (user_id, community_id)
            )
            channel_rows = cur.fetchall()
            channel_ids = [r['channel_id'] for r in channel_rows]

        conn.close()

        # Use v2 agent for better extraction
        total_faqs = 0
        total_definitions = 0
        total_decisions = 0
        extracted_channels = []
        
        for cid in channel_ids:
            # Use new v2 agent
            result = _get_agent("knowledge_builder_v2").extract_knowledge(channel_id=cid, time_period_hours=time_period_hours)
            
            if result.get('success'):
                faqs = result.get('faqs', 0)
                definitions = result.get('definitions', 0)
                decisions = result.get('decisions', 0)
                
                total_faqs += faqs
                total_definitions += definitions
                total_decisions += decisions
                
                extracted_channels.append({
                    'channel_id': cid,
                    'faqs': faqs,
                    'definitions': definitions,
                    'decisions': decisions,
                    'total': result.get('total_items', 0)
                })

        return jsonify({
            'success': True,
            'time_period_hours': time_period_hours,
            'channels_processed': extracted_channels,
            'total_items': total_faqs + total_definitions + total_decisions,
            'faqs': total_faqs,
            'definitions': total_definitions,
            'decisions': total_decisions,
            'message': f'Extracted {total_faqs} FAQs, {total_definitions} definitions, and {total_decisions} decisions'
        }), 200
    except Exception as e:
        print(f"[AGENTS API] Error in extract_knowledge_time: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/knowledge/search', methods=['GET'])
@jwt_required()
def search_knowledge():
    """Search knowledge base entries by text with optional channel/community filter."""
    try:
        username = get_jwt_identity()
        query = request.args.get('query', '', type=str)
        channel_id = request.args.get('channel_id', None, type=int)
        raw_community_id = request.args.get('community_id')
        community_id = get_community_id_from_public_id(raw_community_id) if raw_community_id else None

        # Basic access validation if channel_id provided
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            if channel_id:
                cur.execute(
                    """
                    SELECT 1 FROM channel_members WHERE channel_id = %s AND user_id = %s
                    """,
                    (channel_id, user_id)
                )
                if not cur.fetchone():
                    return jsonify({'error': 'Access denied'}), 403
            elif community_id:
                # Validate community membership
                cur.execute(
                    """
                    SELECT 1 FROM community_members WHERE community_id = %s AND user_id = %s
                    """,
                    (community_id, user_id)
                )
                if not cur.fetchone():
                    return jsonify({'error': 'Access denied to this community'}), 403

        results = []
        with conn.cursor() as cur:
            if channel_id:
                cur.execute(
                    """
                    SELECT id, title, content, created_at
                    FROM knowledge_base
                    WHERE related_channel = %s AND (title LIKE %s OR content LIKE %s)
                    ORDER BY created_at DESC
                    LIMIT 50
                    """,
                    (channel_id, f"%{query}%", f"%{query}%")
                )
            elif community_id:
                cur.execute(
                    """
                    SELECT kb.id, kb.title, kb.content, kb.created_at
                    FROM knowledge_base kb
                    JOIN channels c ON kb.related_channel = c.id
                    WHERE c.community_id = %s
                      AND (kb.title LIKE %s OR kb.content LIKE %s)
                    ORDER BY kb.created_at DESC
                    LIMIT 50
                    """,
                    (community_id, f"%{query}%", f"%{query}%")
                )
            else:
                cur.execute(
                    """
                    SELECT id, title, content, created_at
                    FROM knowledge_base
                    WHERE (title LIKE %s OR content LIKE %s)
                    ORDER BY created_at DESC
                    LIMIT 50
                    """,
                    (f"%{query}%", f"%{query}%")
                )
            rows = cur.fetchall()
            for r in rows:
                try:
                    payload = json.loads(r['content']) if r['content'] else {}
                except Exception:
                    payload = {}
                # Map similar to get_knowledge_base
                entry = {
                    'id': r['id'],
                    'question': r['title'] or 'Knowledge',
                    'answer': '',
                    'tags': [],
                    'relevance_score': 0,
                    'usage_count': 0,
                    'created_at': r['created_at'].isoformat() if r.get('created_at') else None
                }
                if payload.get('type') == 'qa':
                    entry.update({
                        'question': payload.get('question') or entry['question'],
                        'answer': payload.get('answer') or entry['answer'],
                        'tags': payload.get('tags') or []
                    })
                elif payload.get('type') == 'topic':
                    entry.update({
                        'question': f"Topic: {payload.get('topic', entry['question'])}",
                        'answer': payload.get('summary') or entry['answer'],
                        'tags': [payload.get('topic')] if payload.get('topic') else []
                    })
                elif payload.get('type') == 'decision':
                    entry.update({
                        'question': payload.get('decision') or entry['question'],
                        'answer': ''
                    })
                elif payload.get('type') == 'resource':
                    entry.update({
                        'answer': payload.get('url') or ''
                    })
                results.append(entry)
        conn.close()
        return jsonify({'success': True, 'results': results}), 200
    except Exception as e:
        print(f"[AGENTS API] Error in search_knowledge: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# =====================================
# FOCUS AGENT ROUTES
# =====================================

@agents_bp.route('/focus/analyze', methods=['POST'])
@jwt_required()
def analyze_focus():
    """Analyze conversation focus for a channel within a time window."""
    conn = None
    try:
        data = request.get_json() or {}
        time_period_hours = data.get('time_period_hours', 1)
        channel_id = data.get('channel_id')

        print(f"[AGENTS API] Focus analyze request: channel_id={channel_id}, hours={time_period_hours}")

        # Identify current user
        username = get_jwt_identity()
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                print(f'[AGENTS API] User not found: {username}')
                return jsonify({'error': 'User not found'}), 404

            # Resolve channel if not provided: pick most recent channel the user chatted in
            if not channel_id:
                cur.execute(
                    """
                    SELECT m.channel_id
                    FROM messages m
                    WHERE m.sender_id = %s
                    ORDER BY m.created_at DESC
                    LIMIT 1
                    """,
                    (user_id,)
                )
                recent = cur.fetchone()
                if recent:
                    channel_id = recent['channel_id']
                else:
                    # fallback to any channel the user is a member of
                    cur.execute(
                        "SELECT channel_id FROM channel_members WHERE user_id = %s LIMIT 1",
                        (user_id,)
                    )
                    member = cur.fetchone()
                    if member:
                        channel_id = member['channel_id']

            if not channel_id:
                print(f"[AGENTS API] No channel found for user {user_id}")
                return jsonify({'error': 'No channel activity found. Provide channel_id to analyze focus.'}), 400

            print(f"[AGENTS API] Analyzing channel {channel_id} for user {user_id}")

        # Run analysis (focus_agent opens its own DB connection)
        result = _get_agent("focus").analyze_focus(channel_id=channel_id, time_period_hours=time_period_hours)

        print(f"[AGENTS API] Focus analysis result: success={result.get('success')}, error={result.get('error')}")

        # Format response to match frontend expectations
        if result.get('success'):
            # Convert focus_score from 0-1 to 0-100 scale
            raw_score = result.get('focus_score', 0)
            focus_score_100 = int(raw_score * 100) if raw_score <= 1 else int(raw_score)
            
            # Get topic shifts count (it's an array of shift objects)
            topic_shifts = result.get('topic_shifts', [])
            shifts_count = len(topic_shifts) if isinstance(topic_shifts, list) else topic_shifts
            
            response_data = {
                'success': True,
                'analysis': {
                    'focus_score': focus_score_100,
                    'main_topics': result.get('dominant_topics', []),
                    'focus_shifts': shifts_count,
                    'analysis_period_hours': result.get('time_period_hours', time_period_hours),
                    'total_messages': result.get('message_count', 0),
                    'recommendations': [result.get('recommendation', 'No recommendations available')]
                }
            }
            print(f"[AGENTS API] Returning successful analysis: score={response_data['analysis']['focus_score']}")
            return jsonify(response_data), 200
        else:
            print(f"[AGENTS API] Analysis failed: {result.get('error')}")
            return jsonify(result), 400

    except Exception as e:
        print(f"[AGENTS API] Error in analyze_focus: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            conn.close()

@agents_bp.route('/focus/metrics', methods=['GET'])
@jwt_required()
def get_focus_metrics():
    """Get focus metrics"""
    try:
        username = get_jwt_identity()
        days = request.args.get('days', 7, type=int)
        
        print(f"[AGENTS API] Getting focus metrics for user: {username}, days: {days}")
        
        # Return mock data with proper structure
        metrics = {
            'totalSessions': 0,
            'totalFocusTime': 0,
            'averageSessionLength': 0,
            'completionRate': 0,
            'weeklyStreak': 0,
            'monthlyHours': 0
        }
        
        return jsonify(metrics), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_focus_metrics: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@agents_bp.route('/focus/recommendations', methods=['GET'])
@jwt_required()
def get_focus_recommendations():
    """Get focus recommendations"""
    try:
        username = get_jwt_identity()
        
        print(f"[AGENTS API] Getting focus recommendations for user: {username}")
        
        # Return helpful mock recommendations
        recommendations = [
            {
                'type': 'technique',
                'title': 'Try the Pomodoro Technique',
                'description': 'Work in 25-minute focused sessions with 5-minute breaks',
                'priority': 'high'
            },
            {
                'type': 'environment',
                'title': 'Minimize Distractions',
                'description': 'Turn off notifications and create a dedicated workspace',
                'priority': 'medium'
            },
            {
                'type': 'break',
                'title': 'Take Regular Breaks',
                'description': 'Step away from your screen every hour to maintain focus',
                'priority': 'medium'
            }
        ]
        
        return jsonify(recommendations), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_focus_recommendations: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@agents_bp.route('/focus/goal', methods=['POST'])
@jwt_required()
def set_focus_goal():
    """Set a focus goal"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'Goal data required'}), 400
        
        # Mock response for now
        return jsonify({
            'success': True,
            'message': 'Focus goal set successfully'
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in set_focus_goal: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# =====================================
# KNOWLEDGE BUILDER V2 ROUTES
# =====================================

@agents_bp.route('/knowledge/stats', methods=['GET'])
@jwt_required()
def get_knowledge_stats():
    """
    Get knowledge base statistics
    
    Query Params:
        - community_id: Filter by community (required for scoping)
    
    Returns:
        Statistics about stored knowledge items
    """
    conn = None
    try:
        username = get_jwt_identity()
        community_id = get_community_id_from_public_id(request.args.get('community_id'))
        
        if not community_id:
            return jsonify({'error': 'community_id is required'}), 400
        
        # Get user ID
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            # Verify community membership
            cur.execute("""
                SELECT 1 FROM community_members
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            
            if not cur.fetchone():
                return jsonify({'error': 'Access denied to this community'}), 403
            
            # Get stats scoped to community
            cur.execute("""
                SELECT content FROM knowledge_base kb
                JOIN channels c ON kb.related_channel = c.id
                WHERE c.community_id = %s
            """, (community_id,))
            
            items = cur.fetchall()
            
            # Count by type (support both old and new types)
            by_type = {'faq': 0, 'definition': 0, 'decision': 0}
            
            for item in items:
                try:
                    content = json.loads(item['content'])
                    item_type = content.get('type', 'unknown')
                    
                    # Map old types to new categories for backward compatibility
                    if item_type == 'qa':  # Old Q&A type maps to FAQ
                        by_type['faq'] += 1
                    elif item_type == 'topic':  # Old topic type (skip or count separately)
                        pass  # Topics are not FAQs, so don't count
                    elif item_type in by_type:  # New types: faq, definition, decision
                        by_type[item_type] += 1
                except:
                    continue
            
            return jsonify({
                'success': True,
                'total_items': len(items),
                'by_type': by_type,
                'note': 'Stats include both legacy (qa) and new (faq/definition/decision) types'
            }), 200
            
    except Exception as e:
        print(f"[AGENTS API] Error in get_knowledge_stats: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/knowledge/recent', methods=['GET'])
@jwt_required()
def get_recent_knowledge():
    """
    Get recent knowledge items
    
    Query Params:
        - community_id: Filter by community (required)
        - limit: Max results (optional, default 20)
    
    Returns:
        List of recent knowledge items with parsed content
    """
    conn = None
    try:
        username = get_jwt_identity()
        community_id = get_community_id_from_public_id(request.args.get('community_id'))
        limit = request.args.get('limit', default=20, type=int)
        
        if not community_id:
            return jsonify({'error': 'community_id is required'}), 400
        
        # Get user ID
        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = get_user_id(username, cur)
            if user_id is None:
                return jsonify({'error': 'User not found'}), 404
            
            # Verify community membership
            cur.execute("""
                SELECT 1 FROM community_members
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            
            if not cur.fetchone():
                return jsonify({'error': 'Access denied to this community'}), 403
            
            # Get recent items scoped to community
            cur.execute("""
                SELECT 
                    kb.id,
                    kb.title,
                    kb.content,
                    kb.source,
                    kb.created_at,
                    c.name as channel_name
                FROM knowledge_base kb
                JOIN channels c ON kb.related_channel = c.id
                WHERE c.community_id = %s
                ORDER BY kb.created_at DESC
                LIMIT %s
            """, (community_id, limit))
            
            items = cur.fetchall()
            
            # Parse and format items
            formatted_items = []
            for item in items:
                try:
                    content = json.loads(item['content'])
                    formatted_items.append({
                        'id': item['id'],
                        'title': item['title'],
                        'type': content.get('type', 'unknown'),
                        'question': content.get('question', item['title']),
                        'answer': content.get('answer', ''),
                        'tags': content.get('tags', []),
                        'channel_name': item['channel_name'],
                        'created_at': item['created_at'].isoformat() if hasattr(item['created_at'], 'isoformat') else str(item['created_at'])
                    })
                except Exception as e:
                    print(f"[KB Recent] Error parsing item {item['id']}: {e}")
                    continue
            
            return jsonify({
                'success': True,
                'items': formatted_items
            }), 200
            
    except Exception as e:
        print(f"[AGENTS API] Error in get_recent_knowledge: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


# ======================================================================
# AGENT CATALOG & MANAGEMENT ROUTES
# ======================================================================

def _get_user_id(username):
    """Helper: Get user ID from username."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            row = cur.fetchone()
            return row['id'] if row else None
    finally:
        conn.close()


def _check_community_admin(user_id, community_id):
    """Helper: Check if user is admin or owner of a community."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT role FROM community_members
                WHERE community_id = %s AND user_id = %s AND role IN ('admin', 'owner')
            """, (community_id, user_id))
            return cur.fetchone() is not None
    finally:
        conn.close()


def _check_community_member(user_id, community_id):
    """Helper: Check if user is a member of a community."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 1 FROM community_members
                WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            return cur.fetchone() is not None
    finally:
        conn.close()


@agents_bp.route('/catalog', methods=['GET'])
@jwt_required()
def get_agent_catalog():
    """
    Get the full agent catalog with install status per community/user.
    
    Query params:
        - community_id (optional): Show install status for this community
    
    Returns:
        List of all agents with metadata, features, and install status
    """
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404
        
        community_id = get_community_id_from_public_id(request.args.get('community_id'))
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get all agents from registry
            cur.execute("""
                SELECT agent_type, display_name, description, category, icon,
                       default_settings, features, is_active
                FROM agent_registry
                WHERE is_active = TRUE
                ORDER BY category, display_name
            """)
            agents = cur.fetchall()
            
            # Get user's personal agents
            cur.execute("""
                SELECT agent_type, enabled, settings, activated_at, last_used, usage_count
                FROM user_agents WHERE user_id = %s
            """, (user_id,))
            personal = {r['agent_type']: r for r in cur.fetchall()}
            
            # Get community agents if community_id provided
            community_installed = {}
            if community_id:
                cur.execute("""
                    SELECT ca.agent_type, ca.enabled, ca.settings, ca.installed_at,
                           ca.last_active, ca.usage_count, u.username as installed_by
                    FROM community_agents ca
                    JOIN users u ON ca.installed_by = u.id
                    WHERE ca.community_id = %s
                """, (community_id,))
                community_installed = {r['agent_type']: r for r in cur.fetchall()}
        
        catalog = []
        for agent in agents:
            frontend_type = _display_agent_type(agent['agent_type'])
            entry = {
                'agent_type': frontend_type,
                'display_name': agent['display_name'],
                'description': agent['description'],
                'category': agent['category'],
                'icon': agent['icon'],
                'default_settings': json.loads(agent['default_settings']) if agent['default_settings'] else {},
                'features': json.loads(agent['features']) if agent['features'] else [],
            }
            
            # Add personal install status
            if agent['category'] == 'personal' and agent['agent_type'] in personal:
                p = personal[agent['agent_type']]
                entry['personal_status'] = {
                    'activated': True,
                    'enabled': p['enabled'],
                    'settings': json.loads(p['settings']) if p['settings'] else None,
                    'activated_at': p['activated_at'].isoformat() if p['activated_at'] else None,
                    'last_used': p['last_used'].isoformat() if p['last_used'] else None,
                    'usage_count': p['usage_count'],
                }
            else:
                entry['personal_status'] = {'activated': False}
            
            # Add community install status
            if community_id and agent['agent_type'] in community_installed:
                c = community_installed[agent['agent_type']]
                entry['community_status'] = {
                    'installed': True,
                    'enabled': c['enabled'],
                    'settings': json.loads(c['settings']) if c['settings'] else None,
                    'installed_by': c['installed_by'],
                    'installed_at': c['installed_at'].isoformat() if c['installed_at'] else None,
                    'last_active': c['last_active'].isoformat() if c['last_active'] else None,
                    'usage_count': c['usage_count'],
                }
            elif community_id:
                entry['community_status'] = {'installed': False}
            
            catalog.append(entry)
        
        return jsonify({'success': True, 'agents': catalog}), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error in get_agent_catalog: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/install/community/<uuid:public_id>', methods=['POST'])
@jwt_required()
@resolve_public_community_id
def install_community_agent(community_id):
    """
    Install an agent for a community. Only admins/owners can install.
    
    Body:
        - agent_type: str (required)
        - settings: dict (optional, overrides defaults)
    """
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404
        
        # Check admin permission
        if not _check_community_admin(user_id, community_id):
            return jsonify({'error': 'Only community admins can install agents'}), 403
        
        data = request.get_json() or {}
        agent_type = data.get('agent_type')
        if not agent_type:
            return jsonify({'error': 'agent_type is required'}), 400
        agent_type = _normalize_agent_type(agent_type)
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Verify agent exists and is a community agent
            cur.execute("""
                SELECT agent_type, category, default_settings FROM agent_registry
                WHERE agent_type = %s AND is_active = TRUE
            """, (agent_type,))
            agent = cur.fetchone()
            
            if not agent:
                return jsonify({'error': 'Agent not found'}), 404
            if agent_type in _PERSONAL_ONLY_AGENTS:
                return jsonify({'error': 'This is a personal agent, use /activate/personal instead'}), 400
            
            # Check if already installed
            cur.execute("""
                SELECT id FROM community_agents
                WHERE community_id = %s AND agent_type = %s
            """, (community_id, agent_type))
            if cur.fetchone():
                return jsonify({'error': 'Agent already installed in this community'}), 409
            
            # Merge provided settings with defaults
            default_settings = json.loads(agent['default_settings']) if agent['default_settings'] else {}
            custom_settings = data.get('settings', {})
            merged_settings = {**default_settings, **custom_settings}
            
            # Install
            cur.execute("""
                INSERT INTO community_agents (community_id, agent_type, enabled, settings, installed_by)
                VALUES (%s, %s, TRUE, %s, %s)
            """, (community_id, agent_type, json.dumps(merged_settings), user_id))
            conn.commit()
        
        # Invalidate cache
        try:
            from services.redis_client import invalidate_installed_agents, invalidate_agent_settings, get_redis
            invalidate_installed_agents(community_id)
            invalidate_agent_settings(community_id, agent_type)
            _r = get_redis()
            if _r:
                _r.delete(f"mod:installed:{community_id}")
        except Exception:
            pass

        return jsonify({
            'success': True,
            'message': f'{agent_type} agent installed successfully',
            'agent_type': agent_type,
            'community_id': community_id,
        }), 201
        
    except Exception as e:
        print(f"[AGENTS API] Error installing agent: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/uninstall/community/<uuid:public_id>/<agent_type>', methods=['DELETE'])
@jwt_required()
@resolve_public_community_id
def uninstall_community_agent(community_id, agent_type):
    """Uninstall an agent from a community. Admins/owners only."""
    agent_type = _normalize_agent_type(agent_type)
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404
        
        if not _check_community_admin(user_id, community_id):
            return jsonify({'error': 'Only community admins can uninstall agents'}), 403
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                DELETE FROM community_agents
                WHERE community_id = %s AND agent_type = %s
            """, (community_id, agent_type))
            
            if cur.rowcount == 0:
                return jsonify({'error': 'Agent not installed in this community'}), 404
            
            conn.commit()

        try:
            from services.redis_client import invalidate_installed_agents, invalidate_agent_settings, get_redis
            invalidate_installed_agents(community_id)
            invalidate_agent_settings(community_id, agent_type)
            _r = get_redis()
            if _r:
                _r.delete(f"mod:installed:{community_id}")
        except Exception:
            pass

        return jsonify({
            'success': True,
            'message': f'{agent_type} agent uninstalled',
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error uninstalling agent: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/configure/community/<uuid:public_id>/<agent_type>', methods=['PUT'])
@jwt_required()
@resolve_public_community_id
def configure_community_agent(community_id, agent_type):
    """
    Update settings for an installed community agent. Admins/owners only.
    
    Body:
        - settings: dict (merged with existing)
        - enabled: bool (optional)
    """
    agent_type = _normalize_agent_type(agent_type)
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404
        
        if not _check_community_admin(user_id, community_id):
            return jsonify({'error': 'Only community admins can configure agents'}), 403
        
        data = request.get_json() or {}
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get current settings
            cur.execute("""
                SELECT id, settings, enabled FROM community_agents
                WHERE community_id = %s AND agent_type = %s
            """, (community_id, agent_type))
            current = cur.fetchone()
            
            if not current:
                return jsonify({'error': 'Agent not installed in this community'}), 404
            
            # Merge settings
            current_settings = json.loads(current['settings']) if current['settings'] else {}
            raw_new_settings = data.get('settings', {}) or {}
            # Schema-validate the patch (not the merged dict — only the
            # bits the caller is changing must clear the whitelist).
            coerced_new, err = _validate_agent_settings(agent_type, raw_new_settings)
            if err is not None:
                return err
            merged = {**current_settings, **coerced_new}

            # Update
            enabled = data.get('enabled', current['enabled'])
            cur.execute("""
                UPDATE community_agents
                SET settings = %s, enabled = %s
                WHERE community_id = %s AND agent_type = %s
            """, (json.dumps(merged), enabled, community_id, agent_type))
            conn.commit()
        
        try:
            from services.redis_client import invalidate_agent_settings, invalidate_installed_agents, get_redis
            invalidate_agent_settings(community_id, agent_type)
            invalidate_installed_agents(community_id)
            _r = get_redis()
            if _r:
                _r.delete(f"mod:installed:{community_id}")
        except Exception:
            pass

        return jsonify({
            'success': True,
            'settings': merged,
            'enabled': enabled,
        }), 200

    except Exception as e:
        print(f"[AGENTS API] Error configuring agent: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


# ── Per-channel coverage overrides (G1a) ──────────────────────────────────
#
# Two-state overrides on top of community_agents.enabled. Backed by
# community_channel_agents (see migrations/add_community_channel_agents.sql).
# Wired into dispatch via AutonomousAgent._is_enabled_for_channel
# (Backend/agents/base.py). Read/write surface is CoverageMatrix in
# Frontend/src/components/ai-agents/CommunityAgentsTab.tsx §D.
#
# A community-installed agent must exist for the override to be meaningful
# (the matrix UI only exposes cells whose agent is in community_agents).
# We still allow writing an override for an uninstalled agent — it sits
# dormant until install — because the alternative (deleting overrides on
# uninstall) would silently lose admin intent.

# Agents that the CoverageMatrix exposes as columns. Mirrors COVERAGE_COLUMNS
# in CommunityAgentsTab.tsx. Other agent types reject so accidental admin
# panel typos can't smuggle in arbitrary rows.
_COVERAGE_AGENT_TYPES: set[str] = {
    'moderation', 'support', 'summarizer', 'focus', 'engagement', 'translator',
}


@agents_bp.route(
    '/configure/channel/<uuid:public_id>/<int:channel_id>/<agent_type>',
    methods=['PUT'])
@jwt_required()
@resolve_public_community_id
def configure_channel_agent(community_id, channel_id, agent_type):
    """
    Per-channel override of an installed community agent.

    Body: {enabled: bool}.
    Two-state — settings/clamps still live on community_agents.settings.

    Auth: community admin/owner only.
    """
    agent_type = _normalize_agent_type(agent_type)
    if agent_type not in _COVERAGE_AGENT_TYPES:
        return jsonify({
            'error': f'agent_type must be one of {sorted(_COVERAGE_AGENT_TYPES)}'
        }), 400

    data = request.get_json(silent=True) or {}
    if 'enabled' not in data:
        return jsonify({'error': "missing 'enabled' (bool)"}), 400
    coerced_enabled, err = _coerce_setting(data['enabled'], (bool, None, None, None))
    if err is not None:
        return jsonify({'error': f"enabled: {err}"}), 400
    enabled_int = 1 if coerced_enabled else 0

    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404
        if not _check_community_admin(user_id, community_id):
            return jsonify({
                'error': 'Only community admins can configure agents'
            }), 403

        conn = get_db_connection()
        with conn.cursor() as cur:
            # Channel must belong to this community — prevents an admin in
            # community A from poking community B's channel rows.
            cur.execute("""
                SELECT 1 FROM channels
                WHERE id = %s AND community_id = %s
            """, (channel_id, community_id))
            if not cur.fetchone():
                return jsonify({
                    'error': 'Channel not found in this community'
                }), 404

            cur.execute("""
                INSERT INTO community_channel_agents
                    (community_id, channel_id, agent_type, enabled, updated_by)
                VALUES (%s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    enabled = VALUES(enabled),
                    updated_by = VALUES(updated_by)
            """, (community_id, channel_id, agent_type, enabled_int, user_id))
            conn.commit()

        return jsonify({
            'success': True,
            'community_id': community_id,
            'channel_id': channel_id,
            'agent_type': agent_type,
            'enabled': bool(enabled_int),
        }), 200

    except Exception as e:
        print(f"[AGENTS API] Error configuring channel agent: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/coverage/<uuid:public_id>', methods=['GET'])
@jwt_required()
@resolve_public_community_id
def get_channel_coverage(community_id):
    """
    Returns per-channel agent overrides for a community.

    Shape:
        {coverage: {channel_id (str): {agent_type: enabled (bool), ...}}}

    Only override rows are returned. Cells without an override should be
    rendered using the community-wide enabled flag from the installed-agents
    endpoint — the CoverageMatrix in CommunityAgentsTab.tsx merges these two
    sources.

    Auth: community membership (read-only is broader than admin write).
    """
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404
        if not _check_community_member(user_id, community_id):
            return jsonify({
                'error': 'Only community members can view coverage'
            }), 403

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT channel_id, agent_type, enabled
                FROM community_channel_agents
                WHERE community_id = %s
            """, (community_id,))
            rows = cur.fetchall() or []

        # Nested dict keyed by channel_id as string (JSON object keys must be
        # strings — frontend re-keys to number via Object.entries when it
        # consumes the shape).
        coverage: dict[str, dict[str, bool]] = {}
        for row in rows:
            ch = str(row['channel_id'])
            coverage.setdefault(ch, {})[row['agent_type']] = bool(row['enabled'])

        return jsonify({'coverage': coverage}), 200

    except Exception as e:
        print(f"[AGENTS API] Error fetching channel coverage: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


# â”€â”€ Summarizer Scheduler Endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@agents_bp.route('/summarizer/schedule/<uuid:public_id>', methods=['GET'])
@jwt_required()
@resolve_public_community_id
def get_summarizer_schedule(community_id):
    """Get the auto-summarize schedule settings for a community."""
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404

        if not _check_community_member(user_id, community_id):
            return jsonify({'error': 'Access denied'}), 403

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT settings, enabled FROM community_agents
                WHERE community_id = %s AND agent_type = 'summarizer'
            """, (community_id,))
            row = cur.fetchone()

        if not row:
            return jsonify({'error': 'Summarizer agent not installed'}), 404

        settings = json.loads(row['settings']) if row['settings'] else {}
        return jsonify({
            'success': True,
            'auto_summarize_enabled': settings.get('auto_summarize_enabled', False),
            'schedule_time': settings.get('schedule_time', '21:00'),
            'auto_summarize_message_count': settings.get('auto_summarize_message_count', 200),
            'last_auto_summary_date': settings.get('last_auto_summary_date', ''),
            'agent_enabled': row['enabled'],
        }), 200

    except Exception as e:
        print(f"[AGENTS API] Error getting summarizer schedule: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/summarizer/trigger/<uuid:public_id>', methods=['POST'])
@jwt_required()
@resolve_public_community_id
def trigger_auto_summarize(community_id):
    """Manually trigger auto-summarize for a community (admin only). Posts bot messages."""
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404

        if not _check_community_admin(user_id, community_id):
            return jsonify({'error': 'Only community admins can trigger auto-summarize'}), 403

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT settings, enabled, installed_by FROM community_agents
                WHERE community_id = %s AND agent_type = 'summarizer'
            """, (community_id,))
            row = cur.fetchone()

        if not row:
            return jsonify({'error': 'Summarizer agent not installed'}), 404
        if not row['enabled']:
            return jsonify({'error': 'Summarizer agent is disabled'}), 400

        conn.close()
        conn = None

        settings = json.loads(row['settings']) if row['settings'] else {}
        message_count = settings.get('auto_summarize_message_count', 200)
        sender_id = row['installed_by']

        from agents.summarizer import SummarizerAgent
        from tasks.agent_tasks import _format_summary_as_bot_message, _post_bot_message

        agent = SummarizerAgent()
        c = get_db_connection()
        try:
            with c.cursor() as cur:
                cur.execute("""
                    SELECT id, name FROM channels 
                    WHERE community_id = %s AND type = 'text'
                """, (community_id,))
                channels = cur.fetchall()
        finally:
            c.close()

        results = []
        for channel in channels:
            try:
                result = agent.summarize_channel(channel['id'], message_count, user_id)
                if result and result.get('success'):
                    bot_message = _format_summary_as_bot_message(result, channel['name'])
                    msg_id = _post_bot_message(channel['id'], community_id, bot_message, sender_id)
                    results.append({
                        'channel_id': channel['id'],
                        'channel_name': channel['name'],
                        'success': True,
                        'message_id': msg_id,
                    })
                else:
                    results.append({
                        'channel_id': channel['id'],
                        'channel_name': channel['name'],
                        'success': False,
                        'reason': 'No messages to summarize',
                    })
            except Exception as ch_err:
                results.append({
                    'channel_id': channel['id'],
                    'channel_name': channel['name'],
                    'success': False,
                    'reason': str(ch_err),
                })

        return jsonify({
            'success': True,
            'channels_processed': len(results),
            'results': results,
        }), 200

    except Exception as e:
        print(f"[AGENTS API] Error triggering auto-summarize: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/status/community/<uuid:public_id>', methods=['GET'])
@jwt_required()
@resolve_public_community_id
def get_community_agent_status(community_id):
    """Get all installed agents for a community with their status."""
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404
        
        # Members can view, but must be a member
        if not _check_community_member(user_id, community_id):
            return jsonify({'error': 'Access denied'}), 403
        
        # Try cache first
        try:
            from services.redis_client import get_installed_agents, set_installed_agents
            cached = get_installed_agents(community_id)
            if cached:
                return jsonify({'success': True, 'agents': cached}), 200
        except Exception:
            pass
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT ca.agent_type, ca.enabled, ca.settings, ca.installed_at,
                       ca.last_active, ca.usage_count,
                       ar.display_name, ar.description, ar.icon, ar.category, ar.features,
                       u.username as installed_by
                FROM community_agents ca
                JOIN agent_registry ar ON ca.agent_type = ar.agent_type
                JOIN users u ON ca.installed_by = u.id
                WHERE ca.community_id = %s
                ORDER BY ca.installed_at DESC
            """, (community_id,))
            agents = cur.fetchall()
        
        result = []
        for a in agents:
            result.append({
                'agent_type': _display_agent_type(a['agent_type']),
                'display_name': a['display_name'],
                'description': a['description'],
                'icon': a['icon'],
                'category': a['category'],
                'features': json.loads(a['features']) if a['features'] else [],
                'enabled': a['enabled'],
                'settings': json.loads(a['settings']) if a['settings'] else {},
                'installed_by': a['installed_by'],
                'installed_at': a['installed_at'].isoformat() if a['installed_at'] else None,
                'last_active': a['last_active'].isoformat() if a['last_active'] else None,
                'usage_count': a['usage_count'],
            })
        
        # Cache the result
        try:
            set_installed_agents(community_id, result)
        except Exception:
            pass
        
        return jsonify({'success': True, 'agents': result}), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error getting community status: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/activate/personal', methods=['POST'])
@jwt_required()
def activate_personal_agent():
    """
    Activate a personal agent for the current user.
    
    Body:
        - agent_type: str (required)
        - settings: dict (optional)
    """
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404
        
        data = request.get_json() or {}
        agent_type = data.get('agent_type')
        if not agent_type:
            return jsonify({'error': 'agent_type is required'}), 400
        agent_type = _normalize_agent_type(agent_type)
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Verify agent exists and is a personal agent
            cur.execute("""
                SELECT agent_type, category, default_settings FROM agent_registry
                WHERE agent_type = %s AND is_active = TRUE
            """, (agent_type,))
            agent = cur.fetchone()
            
            if not agent:
                return jsonify({'error': 'Agent not found'}), 404
            if agent['category'] != 'personal':
                return jsonify({'error': 'This is a community agent, use /install/community instead'}), 400
            
            # Check if already activated
            cur.execute("""
                SELECT id, enabled FROM user_agents
                WHERE user_id = %s AND agent_type = %s
            """, (user_id, agent_type))
            existing = cur.fetchone()
            
            if existing:
                if existing['enabled']:
                    return jsonify({'error': 'Agent already activated'}), 409
                # Re-activate if disabled
                cur.execute("""
                    UPDATE user_agents SET enabled = TRUE WHERE id = %s
                """, (existing['id'],))
                conn.commit()
                return jsonify({'success': True, 'message': f'{agent_type} re-activated'}), 200
            
            # Merge settings
            default_settings = json.loads(agent['default_settings']) if agent['default_settings'] else {}
            custom_settings = data.get('settings', {})
            merged_settings = {**default_settings, **custom_settings}
            
            cur.execute("""
                INSERT INTO user_agents (user_id, agent_type, enabled, settings)
                VALUES (%s, %s, TRUE, %s)
            """, (user_id, agent_type, json.dumps(merged_settings)))
            conn.commit()
        
        try:
            from services.redis_client import invalidate_personal_agents
            invalidate_personal_agents(user_id)
        except Exception:
            pass
        
        return jsonify({
            'success': True,
            'message': f'{agent_type} activated',
        }), 201
        
    except Exception as e:
        print(f"[AGENTS API] Error activating personal agent: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/deactivate/personal/<agent_type>', methods=['DELETE'])
@jwt_required()
def deactivate_personal_agent(agent_type):
    """Deactivate a personal agent for the current user."""
    agent_type = _normalize_agent_type(agent_type)
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE user_agents SET enabled = FALSE
                WHERE user_id = %s AND agent_type = %s
            """, (user_id, agent_type))
            
            if cur.rowcount == 0:
                return jsonify({'error': 'Agent not activated'}), 404
            conn.commit()
        
        try:
            from services.redis_client import invalidate_personal_agents
            invalidate_personal_agents(user_id)
        except Exception:
            pass
        
        return jsonify({'success': True, 'message': f'{agent_type} deactivated'}), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error deactivating agent: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/status/personal', methods=['GET'])
@jwt_required()
def get_personal_agent_status():
    """Get all personal agents for the current user with their status."""
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404
        
        # Try cache first
        try:
            from services.redis_client import get_personal_agents, set_personal_agents
            cached = get_personal_agents(user_id)
            if cached:
                return jsonify({'success': True, 'agents': cached}), 200
        except Exception:
            pass
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT ua.agent_type, ua.enabled, ua.settings, ua.activated_at,
                       ua.last_used, ua.usage_count,
                       ar.display_name, ar.description, ar.icon, ar.features
                FROM user_agents ua
                JOIN agent_registry ar ON ua.agent_type = ar.agent_type
                WHERE ua.user_id = %s
                ORDER BY ua.activated_at DESC
            """, (user_id,))
            agents = cur.fetchall()
        
        result = []
        for a in agents:
            result.append({
                'agent_type': _display_agent_type(a['agent_type']),
                'display_name': a['display_name'],
                'description': a['description'],
                'icon': a['icon'],
                'features': json.loads(a['features']) if a['features'] else [],
                'enabled': a['enabled'],
                'settings': json.loads(a['settings']) if a['settings'] else {},
                'activated_at': a['activated_at'].isoformat() if a['activated_at'] else None,
                'last_used': a['last_used'].isoformat() if a['last_used'] else None,
                'usage_count': a['usage_count'],
            })
        
        try:
            set_personal_agents(user_id, result)
        except Exception:
            pass
        
        return jsonify({'success': True, 'agents': result}), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error getting personal status: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/configure/personal/<agent_type>', methods=['PUT'])
@jwt_required()
def configure_personal_agent(agent_type):
    """
    Update settings for a personal agent.
    
    Body:
        - settings: dict (merged with existing)
        - enabled: bool (optional)
    """
    agent_type = _normalize_agent_type(agent_type)
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404
        
        data = request.get_json() or {}
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, settings, enabled FROM user_agents
                WHERE user_id = %s AND agent_type = %s
            """, (user_id, agent_type))
            current = cur.fetchone()
            
            if not current:
                return jsonify({'error': 'Agent not activated'}), 404
            
            current_settings = json.loads(current['settings']) if current['settings'] else {}
            raw_new_settings = data.get('settings', {}) or {}
            # Schema-validate against the per-agent whitelist before merge.
            coerced_new, err = _validate_agent_settings(agent_type, raw_new_settings)
            if err is not None:
                return err
            merged = {**current_settings, **coerced_new}
            enabled = data.get('enabled', current['enabled'])

            cur.execute("""
                UPDATE user_agents SET settings = %s, enabled = %s
                WHERE user_id = %s AND agent_type = %s
            """, (json.dumps(merged), enabled, user_id, agent_type))
            conn.commit()
        
        try:
            from services.redis_client import invalidate_personal_agents
            invalidate_personal_agents(user_id)
        except Exception:
            pass
        
        return jsonify({'success': True, 'settings': merged, 'enabled': enabled}), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error configuring personal agent: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


# DELETE /api/agents/assistant/memory
#
# Clears the per-user rolling assistant memory (Redis LIST at
# ``assistant:mem:{user_id}``, see Backend/agents/assistant.py).
# Powers the "Clear conversation memory" control in the My Assistant
# panel (frontend F3). No DB hit, no schema change — only Redis state.
@agents_bp.route('/assistant/memory', methods=['DELETE'])
@jwt_required()
def clear_assistant_memory():
    """Delete the rolling per-user assistant memory."""
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404

        try:
            from services.redis_client import get_redis
            r = get_redis()
        except Exception as exc:
            print(f"[AGENTS API] clear_assistant_memory: redis unavailable: {exc}")
            r = None

        if r is not None:
            try:
                r.delete(f"assistant:mem:{user_id}")
            except Exception as exc:
                print(f"[AGENTS API] clear_assistant_memory: redis delete failed: {exc}")
                return jsonify({'error': 'Failed to clear memory'}), 500

        return jsonify({'success': True}), 200

    except Exception as e:
        print(f"[AGENTS API] clear_assistant_memory error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/logs', methods=['GET'])
@jwt_required()
def get_agent_logs():
    """
    Get paginated agent execution logs.
    
    Query params:
        - agent_type: Filter by agent type
        - community_id: Filter by community
        - status: Filter by status (success/error/partial)
        - page: Page number (default 1)
        - limit: Items per page (default 20, max 100)
    """
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404
        
        agent_type = request.args.get('agent_type')
        community_id = get_community_id_from_public_id(request.args.get('community_id'))
        status = request.args.get('status')
        page = max(1, request.args.get('page', 1, type=int))
        limit = min(100, max(1, request.args.get('limit', 20, type=int)))
        offset = (page - 1) * limit
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Build query
            where = ["1=1"]
            params = []
            
            if agent_type:
                where.append("agent_name = %s")
                params.append(agent_type)
            if community_id:
                where.append("community_id = %s")
                params.append(community_id)
            if status:
                where.append("status = %s")
                params.append(status)
            
            where_clause = " AND ".join(where)
            
            # Count total
            cur.execute(f"SELECT COUNT(*) as total FROM ai_agent_logs WHERE {where_clause}", params)
            total = cur.fetchone()['total']
            
            # Get page
            cur.execute(f"""
                SELECT id, agent_name, action_type, input_data, output_data,
                       status, execution_time_ms, community_id, user_id, created_at
                FROM ai_agent_logs
                WHERE {where_clause}
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
            """, params + [limit, offset])
            logs = cur.fetchall()
        
        result = []
        for log in logs:
            result.append({
                'id': log['id'],
                'agent_name': log['agent_name'],
                'action_type': log['action_type'],
                'input_data': log['input_data'][:500] if log['input_data'] else None,
                'output_data': log['output_data'][:500] if log['output_data'] else None,
                'status': log['status'],
                'execution_time_ms': log['execution_time_ms'],
                'community_id': log['community_id'],
                'user_id': log['user_id'],
                'created_at': log['created_at'].isoformat() if log['created_at'] else None,
            })
        
        return jsonify({
            'success': True,
            'logs': result,
            'pagination': {
                'page': page,
                'limit': limit,
                'total': total,
                'pages': (total + limit - 1) // limit,
            }
        }), 200
        
    except Exception as e:
        print(f"[AGENTS API] Error getting logs: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


# ======================================================================
# AGENT ACTIONS — admin-scoped reads from agent_actions (G1b)
# ======================================================================
#
# `ai_agent_logs` (the /logs route above) is the post-execution log used
# by slash commands and human-triggered actions. `agent_actions` is the
# autonomous-decision log written by AutonomousAgent.handle() — each row
# carries the real UUID correlation_id needed for /agents/<name>/feedback
# to resolve. Section E of the Community Intelligence Hub now reads this
# route so Helpful / Not helpful / Dismiss votes resolve against real
# rows instead of synthetic 'log-<id>' strings.


@agents_bp.route('/actions', methods=['GET'])
@jwt_required()
def list_agent_actions():
    """
    Admin-scoped paginated reads from agent_actions.

    Query params:
      community_id (required, int)
      limit        (default 25, max 100)
      agent_name   (optional, exact match)
      decision     (optional, 'act'|'defer'|'skip')

    Returns:
      {actions: [...]}
      Each row: id, agent_name, community_id, channel_id, user_id,
                decision, reason, correlation_id, created_at, has_feedback.
      `has_feedback` is True iff the calling user has already voted on the row.
    """
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404

        community_id = get_community_id_from_public_id(request.args.get('community_id'))
        if community_id is None:
            return jsonify({'error': "missing 'community_id'"}), 400
        if not _check_community_admin(user_id, community_id):
            return jsonify({
                'error': 'Only community admins can view agent actions'
            }), 403

        limit = min(100, max(1, request.args.get('limit', 25, type=int)))
        agent_name = request.args.get('agent_name')
        decision = request.args.get('decision')
        if decision and decision not in ('act', 'defer', 'skip'):
            return jsonify({
                'error': "decision must be one of 'act','defer','skip'"
            }), 400

        where = ["a.community_id = %s"]
        params: list = [community_id]
        if agent_name:
            where.append("a.agent_name = %s")
            params.append(agent_name)
        if decision:
            where.append("a.decision = %s")
            params.append(decision)
        where_clause = " AND ".join(where)

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT a.id, a.agent_name, a.community_id, a.channel_id,
                       a.user_id, a.decision, a.reason, a.correlation_id,
                       a.created_at,
                       EXISTS(
                         SELECT 1 FROM agent_feedback f
                         WHERE f.action_id = a.id AND f.user_id = %s
                       ) AS has_feedback
                FROM agent_actions a
                WHERE {where_clause}
                ORDER BY a.created_at DESC
                LIMIT %s
            """, [user_id] + params + [limit])
            rows = cur.fetchall() or []

        actions = []
        for r in rows:
            actions.append({
                'id': r['id'],
                'agent_name': r['agent_name'],
                'community_id': r['community_id'],
                'channel_id': r['channel_id'],
                'user_id': r['user_id'],
                'decision': r['decision'],
                'reason': r['reason'] or '',
                'correlation_id': r['correlation_id'],
                'created_at': r['created_at'].isoformat()
                              if r['created_at'] else None,
                'has_feedback': bool(r['has_feedback']),
            })

        return jsonify({'actions': actions}), 200

    except Exception as e:
        print(f"[AGENTS API] Error listing agent actions: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


# ======================================================================
# MY SUMMARIES â€” User's generated summary history
# ======================================================================

@agents_bp.route('/my-summaries', methods=['GET'])
@jwt_required()
def get_my_summaries():
    """Get all summaries generated by the current user, optionally filtered by channel."""
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404

        channel_id = request.args.get('channel_id', type=int)
        limit = min(request.args.get('limit', 20, type=int), 50)

        conn = get_db_connection()
        with conn.cursor() as cur:
            if channel_id:
                cur.execute("""
                    SELECT cs.id, cs.channel_id, cs.summary, cs.generated_by, cs.created_at,
                           cs.message_count, cs.method, cs.participants, c.name AS channel_name
                    FROM conversation_summaries cs
                    LEFT JOIN channels c ON c.id = cs.channel_id
                    WHERE cs.created_by = %s AND cs.channel_id = %s
                    ORDER BY cs.created_at DESC
                    LIMIT %s
                """, (user_id, channel_id, limit))
            else:
                cur.execute("""
                    SELECT cs.id, cs.channel_id, cs.summary, cs.generated_by, cs.created_at,
                           cs.message_count, cs.method, cs.participants, c.name AS channel_name
                    FROM conversation_summaries cs
                    LEFT JOIN channels c ON c.id = cs.channel_id
                    WHERE cs.created_by = %s
                    ORDER BY cs.created_at DESC
                    LIMIT %s
                """, (user_id, limit))

            rows = cur.fetchall()
            import json
            summaries = []
            for r in rows:
                participants = r.get('participants', '[]')
                if isinstance(participants, str):
                    try:
                        participants = json.loads(participants)
                    except Exception:
                        participants = []
                summaries.append({
                    'id': r['id'],
                    'channel_id': r['channel_id'],
                    'channel_name': r.get('channel_name', ''),
                    'summary': r['summary'],
                    'generated_by': r['generated_by'],
                    'created_at': r['created_at'].isoformat() if r['created_at'] else None,
                    'message_count': r.get('message_count', 0),
                    'method': r.get('method', 'extractive'),
                    'participants': participants,
                })

        return jsonify({'success': True, 'summaries': summaries}), 200

    except Exception as e:
        print(f"[AGENTS API] Error getting my summaries: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/my-summaries/<int:summary_id>', methods=['DELETE'])
@jwt_required()
def delete_my_summary(summary_id):
    """Delete a summary the current user generated."""
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM conversation_summaries WHERE id = %s AND created_by = %s", (summary_id, user_id))
            if not cur.fetchone():
                return jsonify({'error': 'Summary not found or access denied'}), 404
            cur.execute("DELETE FROM conversation_summaries WHERE id = %s AND created_by = %s", (summary_id, user_id))
            conn.commit()

        return jsonify({'success': True}), 200

    except Exception as e:
        print(f"[AGENTS API] Error deleting summary: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


# ======================================================================
# SUMMARY SCHEDULE ENDPOINTS â€” Per-user scheduled auto-summaries
# ======================================================================

@agents_bp.route('/summary-schedules', methods=['GET'])
@jwt_required()
def get_summary_schedules():
    """Get all summary schedules for the current user."""
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT s.id, s.channel_id, s.community_id, s.schedule_time,
                       s.timezone, s.is_active, s.last_triggered_at,
                       s.created_at, s.updated_at,
                       c.name AS channel_name, cm.name AS community_name
                FROM user_summary_schedules s
                JOIN channels c ON c.id = s.channel_id
                JOIN communities cm ON cm.id = s.community_id
                WHERE s.user_id = %s
                ORDER BY s.created_at DESC
            """, (user_id,))
            rows = cur.fetchall()

        schedules = []
        for r in rows:
            # MySQL TIME column returns timedelta; convert to HH:MM string
            sched_time = r['schedule_time']
            if hasattr(sched_time, 'total_seconds'):
                total_secs = int(sched_time.total_seconds())
                sched_time_str = f"{total_secs // 3600:02d}:{(total_secs % 3600) // 60:02d}"
            else:
                sched_time_str = str(sched_time)[:5]

            schedules.append({
                'id': r['id'],
                'channel_id': r['channel_id'],
                'community_id': r['community_id'],
                'channel_name': r['channel_name'],
                'community_name': r['community_name'],
                'schedule_time': sched_time_str,
                'timezone': r['timezone'],
                'is_active': bool(r['is_active']),
                'last_triggered_at': r['last_triggered_at'].isoformat() if r['last_triggered_at'] else None,
                'created_at': r['created_at'].isoformat() if r['created_at'] else None,
            })

        return jsonify({'success': True, 'schedules': schedules}), 200

    except Exception as e:
        print(f"[AGENTS API] Error getting schedules: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/summary-schedules', methods=['POST'])
@jwt_required()
def create_summary_schedule():
    """Create or update a summary schedule for a channel."""
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404

        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        channel_id = data.get('channel_id')
        schedule_time = data.get('schedule_time')  # "HH:MM" or "HH:MM:SS"

        if not channel_id or not schedule_time:
            return jsonify({'error': 'channel_id and schedule_time required'}), 400

        timezone = data.get('timezone', 'UTC')

        conn = get_db_connection()
        with conn.cursor() as cur:
            # Verify channel exists and get community_id
            cur.execute("SELECT id, community_id FROM channels WHERE id = %s", (channel_id,))
            ch = cur.fetchone()
            if not ch:
                return jsonify({'error': 'Channel not found'}), 404
            community_id = ch['community_id']

            # Verify user is a member of the community
            cur.execute("""
                SELECT 1 FROM community_members WHERE community_id = %s AND user_id = %s
            """, (community_id, user_id))
            if not cur.fetchone():
                return jsonify({'error': 'Not a member of this community'}), 403

            # Upsert â€” one schedule per user per channel
            cur.execute("""
                INSERT INTO user_summary_schedules
                    (user_id, channel_id, community_id, schedule_time, timezone, is_active)
                VALUES (%s, %s, %s, %s, %s, TRUE)
                ON DUPLICATE KEY UPDATE
                    schedule_time = VALUES(schedule_time),
                    timezone = VALUES(timezone),
                    is_active = TRUE,
                    updated_at = NOW()
            """, (user_id, channel_id, community_id, schedule_time, timezone))
            conn.commit()

            # Get the created/updated record
            cur.execute("""
                SELECT id, schedule_time, timezone, is_active, created_at
                FROM user_summary_schedules
                WHERE user_id = %s AND channel_id = %s
            """, (user_id, channel_id))
            row = cur.fetchone()

        return jsonify({
            'success': True,
            'schedule': {
                'id': row['id'],
                'channel_id': channel_id,
                'community_id': community_id,
                'schedule_time': str(row['schedule_time']),
                'timezone': row['timezone'],
                'is_active': bool(row['is_active']),
            }
        }), 201

    except Exception as e:
        print(f"[AGENTS API] Error creating schedule: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/summary-schedules/<int:schedule_id>', methods=['PUT'])
@jwt_required()
def update_summary_schedule(schedule_id):
    """Update an existing summary schedule (time, active status)."""
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404

        data = request.get_json() or {}

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id FROM user_summary_schedules WHERE id = %s AND user_id = %s
            """, (schedule_id, user_id))
            if not cur.fetchone():
                return jsonify({'error': 'Schedule not found'}), 404

            updates = []
            params = []
            if 'schedule_time' in data:
                updates.append("schedule_time = %s")
                params.append(data['schedule_time'])
            if 'timezone' in data:
                updates.append("timezone = %s")
                params.append(data['timezone'])
            if 'is_active' in data:
                updates.append("is_active = %s")
                params.append(bool(data['is_active']))

            if not updates:
                return jsonify({'error': 'No fields to update'}), 400

            params.append(schedule_id)
            cur.execute(f"UPDATE user_summary_schedules SET {', '.join(updates)} WHERE id = %s", params)
            conn.commit()

        return jsonify({'success': True, 'message': 'Schedule updated'}), 200

    except Exception as e:
        print(f"[AGENTS API] Error updating schedule: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/summary-schedules/<int:schedule_id>', methods=['DELETE'])
@jwt_required()
def delete_summary_schedule(schedule_id):
    """Delete a summary schedule."""
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("DELETE FROM user_summary_schedules WHERE id = %s AND user_id = %s", (schedule_id, user_id))
            if cur.rowcount == 0:
                return jsonify({'error': 'Schedule not found'}), 404
            conn.commit()

        return jsonify({'success': True, 'message': 'Schedule deleted'}), 200

    except Exception as e:
        print(f"[AGENTS API] Error deleting schedule: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/summary-schedules/pending', methods=['GET'])
@jwt_required()
def get_pending_summaries():
    """Get undelivered scheduled summaries for the current user, optionally filtered by channel."""
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404

        channel_id = request.args.get('channel_id', type=int)

        conn = get_db_connection()
        with conn.cursor() as cur:
            if channel_id:
                cur.execute("""
                    SELECT id, channel_id, community_id, content, method, message_count, created_at
                    FROM scheduled_summaries
                    WHERE user_id = %s AND channel_id = %s AND is_delivered = FALSE
                    ORDER BY created_at DESC LIMIT 5
                """, (user_id, channel_id))
            else:
                cur.execute("""
                    SELECT id, channel_id, community_id, content, method, message_count, created_at
                    FROM scheduled_summaries
                    WHERE user_id = %s AND is_delivered = FALSE
                    ORDER BY created_at DESC LIMIT 20
                """, (user_id,))
            rows = cur.fetchall()

            # Mark as delivered
            if rows:
                ids = [r['id'] for r in rows]
                placeholders = ','.join(['%s'] * len(ids))
                cur.execute(f"UPDATE scheduled_summaries SET is_delivered = TRUE WHERE id IN ({placeholders})", ids)
                conn.commit()

        summaries = [{
            'id': r['id'],
            'channel_id': r['channel_id'],
            'community_id': r['community_id'],
            'content': r['content'],
            'method': r['method'],
            'message_count': r['message_count'],
            'created_at': r['created_at'].isoformat() if r['created_at'] else None,
        } for r in rows]

        return jsonify({'success': True, 'summaries': summaries}), 200

    except Exception as e:
        print(f"[AGENTS API] Error getting pending summaries: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


@agents_bp.route('/summary-schedules/pending/<int:summary_id>', methods=['DELETE'])
@jwt_required()
def delete_scheduled_summary(summary_id):
    """Delete a generated scheduled summary."""
    conn = None
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        if not user_id:
            return jsonify({'error': 'User not found'}), 404

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM scheduled_summaries WHERE id = %s AND user_id = %s",
                (summary_id, user_id),
            )
            if cur.rowcount == 0:
                return jsonify({'error': 'Summary not found'}), 404
            conn.commit()

        return jsonify({'success': True, 'message': 'Scheduled summary deleted'}), 200

    except Exception as e:
        print(f"[AGENTS API] Error deleting scheduled summary: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if conn:
            conn.close()


# =====================================
# ASSISTANT AGENT ROUTES
# =====================================

@agents_bp.route('/assistant/ask', methods=['POST'])
@jwt_required()
def assistant_ask():
    """Ask the AI Assistant a question."""
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        data = request.get_json(silent=True) or {}
        question = (data.get('question') or '').strip()
        if not question:
            return jsonify({'error': 'question is required'}), 400

        raw_community_id = data.get('community_id')
        result = _get_agent('assistant').ask(
            question=question,
            user_id=user_id,
            channel_id=data.get('channel_id'),
            community_id=get_community_id_from_public_id(raw_community_id) if raw_community_id else None,
            context=data.get('context'),
        )
        return jsonify(result), 200
    except Exception as e:
        print(f"[AGENTS API] assistant_ask error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/assistant/joke', methods=['GET'])
@jwt_required()
def assistant_joke():
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        return jsonify(_get_agent('assistant').random_joke(user_id=user_id)), 200
    except Exception as e:
        print(f"[AGENTS API] assistant_joke error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/assistant/motivation', methods=['GET'])
@jwt_required()
def assistant_motivation():
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        return jsonify(_get_agent('assistant').random_motivation(user_id=user_id)), 200
    except Exception as e:
        print(f"[AGENTS API] assistant_motivation error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# =====================================
# TRANSLATOR AGENT ROUTES
# =====================================

@agents_bp.route('/translator/translate', methods=['POST'])
@jwt_required()
def translator_translate():
    """Translate arbitrary text."""
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        data = request.get_json(silent=True) or {}
        text = (data.get('text') or '').strip()
        if not text:
            return jsonify({'error': 'text is required'}), 400

        # Pass user_id so the agent picks up the personal default_target,
        # auto_detect, and cache_enabled toggles from user_agents.settings.
        result = _get_agent('translator').translate(
            text=text,
            target_language=data.get('target_language', 'en'),
            source_language=data.get('source_language', 'auto'),
            user_id=user_id,
        )
        return jsonify({'success': True, **result}), 200
    except Exception as e:
        print(f"[AGENTS API] translator_translate error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/translator/message/<int:message_id>', methods=['POST'])
@jwt_required()
def translator_message(message_id: int):
    """Translate an existing message by id."""
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        data = request.get_json(silent=True) or {}
        target = data.get('target_language', 'en')

        result = _get_agent('translator').translate_message(
            message_id=message_id,
            target_language=target,
            user_id=user_id,
        )
        if not result.get('success'):
            status = 404 if result.get('error') == 'message_not_found' else 500
            return jsonify(result), status
        return jsonify(result), 200
    except Exception as e:
        print(f"[AGENTS API] translator_message error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/translator/languages', methods=['GET'])
@jwt_required()
def translator_languages():
    try:
        langs = _get_agent('translator').supported_languages()
        return jsonify({'success': True, 'languages': langs}), 200
    except Exception as e:
        print(f"[AGENTS API] translator_languages error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/translator/detect', methods=['POST'])
@jwt_required()
def translator_detect():
    try:
        data = request.get_json(silent=True) or {}
        text = (data.get('text') or '').strip()
        if not text:
            return jsonify({'error': 'text is required'}), 400
        return jsonify({
            'success': True,
            **_get_agent('translator').detect_language(text)
        }), 200
    except Exception as e:
        print(f"[AGENTS API] translator_detect error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# =====================================
# CONTEXT-AWARE SUPPORT AGENT ROUTES
# =====================================

@agents_bp.route('/support/ask', methods=['POST'])
@jwt_required()
def support_ask():
    """Q&A over a community's knowledge base."""
    try:
        username = get_jwt_identity()
        user_id = _get_user_id(username)
        data = request.get_json(silent=True) or {}
        question = (data.get('question') or '').strip()
        raw_community_id = data.get('community_id')
        community_id = get_community_id_from_public_id(raw_community_id) if raw_community_id else None
        if not question or not community_id:
            return jsonify({'error': 'question and community_id are required'}), 400

        result = _get_agent('support').ask(
            question=question,
            community_id=community_id,
            user_id=user_id,
            channel_id=data.get('channel_id'),
            polish=bool(data.get('polish', True)),
        )
        return jsonify(result), 200
    except Exception as e:
        print(f"[AGENTS API] support_ask error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/support/refresh/<uuid:public_id>', methods=['POST'])
@jwt_required()
@resolve_public_community_id
def support_refresh(community_id: int):
    try:
        _get_agent('support').invalidate(community_id)
        return jsonify({'success': True}), 200
    except Exception as e:
        print(f"[AGENTS API] support_refresh error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# =====================================
# AUTO MESSAGE AGENT ROUTES
# =====================================

@agents_bp.route('/automessage/welcome/preview', methods=['POST'])
@jwt_required()
def automessage_welcome_preview():
    """Preview a welcome message without posting."""
    try:
        data = request.get_json(silent=True) or {}
        community_name = data.get('community_name') or ''
        username_target = data.get('username') or ''
        if not community_name or not username_target:
            return jsonify({'error': 'community_name and username are required'}), 400

        raw_community_id = data.get('community_id')
        result = _get_agent('auto_message').generate_welcome(
            community_name=community_name,
            username=username_target,
            community_description=data.get('community_description'),
            community_id=get_community_id_from_public_id(raw_community_id) if raw_community_id else None,
            channel_id=data.get('channel_id'),
            post=False,
        )
        return jsonify(result), 200
    except Exception as e:
        print(f"[AGENTS API] automessage_welcome_preview error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@agents_bp.route('/automessage/quick-replies', methods=['POST'])
@jwt_required()
def automessage_quick_replies():
    """Return quick-reply suggestions for a message."""
    try:
        data = request.get_json(silent=True) or {}
        last_message = (data.get('last_message') or '').strip()
        max_n = int(data.get('max', 3))
        result = _get_agent('auto_message').quick_replies(
            last_message=last_message, max_suggestions=max_n,
        )
        return jsonify(result), 200
    except Exception as e:
        print(f"[AGENTS API] automessage_quick_replies error: {e}")
        return jsonify({'error': 'Internal server error'}), 500
