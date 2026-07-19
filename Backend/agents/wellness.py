"""
Wellness Agent for AuraFlow
Promotes healthy communication habits and well-being.

Autonomous role (Phase 3.2): completes the Mood→Wellness empathy chain.
Subscribes to ``mood.escalation`` (published by the mood_tracker after a
rolling-window of negative sentiment) and reacts with a private, opt-in
check-in delivered as a ``wellness_checkin`` Socket.IO event to the
user's personal room. We deliberately do NOT auto-post into the channel
or auto-DM via the `direct_messages` table — the soft toast/card is the
least intrusive intervention and matches the existing `support_suggestion`
pattern from Phase 1.4.
"""

import json
import os
import random
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from collections import Counter

from database import get_db_connection
from agents.base import AutonomousAgent
from agents import event_bus as _event_bus
from agents import memory as _agent_memory
from agents._settings import get_personal_settings
from services.redis_client import get_redis as _get_redis


# Per-user check-in cooldown AND cross-process dedupe TTL. The base-class
# cooldown (base.py _cooldown_active) reads last_acted_at then acts, so it
# only blocks re-fires *within one orchestrator process*: two orchestrator
# loops — a stray second Celery worker, or a second app.py, both common
# after restarts on Windows — each receive the same mood.escalation /
# mod.violation pub/sub message, each read "no recent act", both pass the
# cooldown, and both emit a wellness_checkin. The one browser in the user's
# room then renders N stacked toasts for a single trigger. An atomic Redis
# SET NX (see _claim_checkin) collapses that fan-out to a single emit across
# every process. TTL is derived from the cooldown so the "claim window ==
# cooldown window" invariant holds by construction. Mirrors
# engagement._NUDGE_DEDUPE_TTL / auto_message._claim_welcome.
_COOLDOWN_SECONDS = 60 * 60
_CHECKIN_DEDUPE_TTL = _COOLDOWN_SECONDS


_WELLNESS_DEFAULTS = {
    'auto_check': True,
    'break_reminders': True,
    'check_interval_hours': 1,
    'burnout_detection': True,
}


# Soft check-in copy. Kept minimal — Gemini polish is optional and
# lazily attempted only when GEMINI_API_KEY is configured.
_CHECKIN_TEMPLATES = [
    "Hey — your recent messages have a heavy tone. Want to take a short break together? 💚",
    "Just checking in. It looks like things have been rough lately. I'm here if you need a breather. 🌱",
    "Quick wellness ping: a 2-minute breathing pause might help right now. You've got this.",
    "Noticed you might be feeling down. Step away for water + a stretch? It really helps. ✨",
]

# Phase 4: de-escalation copy delivered after a moderation violation,
# aimed at the offender to coach calmer communication. Same bandit arms
# are reused — frontend distinguishes by `trigger` field.
_DEESCALATION_TEMPLATES = [
    "Hey, things looked a bit heated just now. Stepping away for a minute often helps. 🌱",
    "Quick reminder: tone can land harder than intended in chat. A short pause is on the house. 💚",
    "It seems messages got intense. Want to try rephrasing once your head's clear?",
    "Looks like a rough moment. Try drafting a calmer version — usually feels better to send.",
]


class WellnessAgent(AutonomousAgent):
    """
    Monitors user activity and promotes healthy habits
    Suggests breaks, positive communication, and work-life balance
    """

    # ── Autonomous contract (Phase 3.2 + Phase 4) ───────────────────
    NAME = "wellness"
    GOAL = {
        "respond_to_mood_escalation": True,
        "respond_to_moderation_violations": True,
        "low_intrusiveness": True,
        "respect_per_user_opt_in": True,
    }
    SUBSCRIBES = [
        _event_bus.TOPIC_MOOD_ESCALATION,
        _event_bus.TOPIC_MOD_VIOLATION,  # Phase 4: victim-support chain
    ]
    SCOPE_TYPE = _agent_memory.SCOPE_USER
    # Per-user cooldown: at most one check-in per hour even if the
    # escalation refires (mood_tracker has its own 30-min dedupe, but
    # this is a second belt-and-braces guard). The atomic cross-process
    # analog is _claim_checkin — see _CHECKIN_DEDUPE_TTL above.
    COOLDOWN_SECONDS = _COOLDOWN_SECONDS

    _DEFAULT_QUIET_HOURS = (24, 0)   # disabled: (24, 0) → condition never fires

    def __init__(self):
        """Initialize the wellness agent"""
        self.max_continuous_hours = 3  # Alert after 3 hours continuous activity
        self.min_break_minutes = 15     # Suggest 15 min break
        self.max_messages_per_hour = 50 # Alert if exceeding
        
    def check_user_wellness(self, user_id: int, *, scheduled: bool = False) -> Dict[str, any]:
        """
        Check user's wellness metrics

        Args:
            user_id: User to check
            scheduled: True when invoked by the periodic Celery task. Lets
                ``auto_check=false`` short-circuit scheduled runs while
                still letting on-demand UI calls (button press) work.

        Returns:
            Wellness assessment with suggestions
        """
        cfg = get_personal_settings(user_id, 'wellness', _WELLNESS_DEFAULTS)
        if scheduled and not cfg.get('auto_check', True):
            return {
                'success': True,
                'wellness_level': 'good',
                'message': 'Periodic wellness checks are paused for this user.',
                'suggestions': [],
                'skipped': 'auto_check_disabled',
            }
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                # Get user activity stats
                now = datetime.now()
                today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
                
                # Messages sent today
                cur.execute("""
                    SELECT 
                        COUNT(*) as message_count,
                        MIN(created_at) as first_message,
                        MAX(created_at) as last_message
                    FROM messages
                    WHERE sender_id = %s 
                    AND created_at >= %s
                """, (user_id, today_start))
                
                daily_stats = cur.fetchone()
                
                if not daily_stats or daily_stats['message_count'] == 0:
                    return {
                        'success': True,
                        'wellness_level': 'good',
                        'message': 'No activity detected today. Take your time! 😊',
                        'suggestions': []
                    }
                
                # Calculate activity duration
                first_msg = daily_stats['first_message']
                last_msg = daily_stats['last_message']
                active_duration = (last_msg - first_msg).total_seconds() / 3600  # hours
                
                # Get hourly distribution
                cur.execute("""
                    SELECT 
                        HOUR(created_at) as hour,
                        COUNT(*) as count
                    FROM messages
                    WHERE sender_id = %s 
                    AND created_at >= %s
                    GROUP BY HOUR(created_at)
                    ORDER BY count DESC
                """, (user_id, today_start))
                
                hourly_dist = cur.fetchall()
                
                # Calculate metrics
                message_count = daily_stats['message_count']
                avg_per_hour = message_count / active_duration if active_duration > 0 else 0
                
                # Find peak hour
                peak_hour = None
                peak_count = 0
                if hourly_dist:
                    peak_hour = hourly_dist[0]['hour']
                    peak_count = hourly_dist[0]['count']
                
                # Check for continuous activity (no breaks)
                time_since_last = (now - last_msg).total_seconds() / 60  # minutes
                
                # Generate wellness assessment
                concerns = []
                suggestions = []
                wellness_level = 'good'
                
                break_reminders = bool(cfg.get('break_reminders', True))

                # Check for excessive messaging
                if avg_per_hour > self.max_messages_per_hour:
                    concerns.append('high_activity')
                    if break_reminders:
                        suggestions.append({
                            'type': 'break',
                            'message': 'You\'ve been very active! Consider taking a short break. 🌟',
                            'priority': 'high'
                        })
                    wellness_level = 'attention_needed'

                # Check for continuous activity
                if active_duration >= self.max_continuous_hours and time_since_last < self.min_break_minutes:
                    concerns.append('continuous_activity')
                    if break_reminders:
                        suggestions.append({
                            'type': 'break',
                            'message': f'You\'ve been active for {int(active_duration)} hours. Time for a break! ☕',
                            'priority': 'high'
                        })
                    wellness_level = 'attention_needed'
                
                # Check time of day (late night activity)
                current_hour = now.hour
                if current_hour >= 23 or current_hour <= 5:
                    concerns.append('late_night_activity')
                    suggestions.append({
                        'type': 'sleep',
                        'message': 'It\'s late! Consider getting some rest. 😴',
                        'priority': 'medium'
                    })
                    if wellness_level == 'good':
                        wellness_level = 'monitor'
                
                # Positive feedback if all good
                if not concerns:
                    suggestions.append({
                        'type': 'encouragement',
                        'message': 'Your activity looks healthy! Keep maintaining balance. ✨',
                        'priority': 'low'
                    })
                
                # Check stress / burnout indicators from messages — opt-out
                # via the burnout_detection toggle. Skipping leaves the
                # response shape stable; callers see no 'stress_indicators'
                # concern instead of a falsey one.
                if cfg.get('burnout_detection', True):
                    stress_check = self._check_stress_indicators(user_id, conn)
                    if stress_check['has_stress_indicators']:
                        concerns.append('stress_indicators')
                        suggestions.append({
                            'type': 'wellness',
                            'message': 'Detected some stress in your messages. Remember to take care of yourself! 💚',
                            'priority': 'medium'
                        })
                        wellness_level = 'monitor'
                
                result = {
                    'success': True,
                    'wellness_level': wellness_level,
                    'concerns': concerns,
                    'suggestions': suggestions,
                    'metrics': {
                        'messages_today': message_count,
                        'active_duration_hours': round(active_duration, 2),
                        'avg_messages_per_hour': round(avg_per_hour, 2),
                        'time_since_last_message_min': round(time_since_last, 2),
                        'peak_hour': peak_hour,
                        'peak_hour_count': peak_count
                    }
                }
                
                # Log wellness check
                self._log_wellness_check(user_id, result)
                
                return result
                
        except Exception as e:
            print(f"[WELLNESS] Error checking wellness: {e}")
            return {
                'success': False,
                'error': str(e)
            }
        finally:
            if conn:
                conn.close()
    
    def _check_stress_indicators(self, user_id: int, conn) -> Dict[str, any]:
        """Check for stress indicators in recent messages"""
        try:
            with conn.cursor() as cur:
                # Get recent messages (last 2 hours)
                time_threshold = datetime.now() - timedelta(hours=2)
                
                cur.execute("""
                    SELECT content
                    FROM messages
                    WHERE sender_id = %s 
                    AND created_at >= %s
                    AND message_type = 'text'
                    ORDER BY created_at DESC
                    LIMIT 20
                """, (user_id, time_threshold))
                
                messages = cur.fetchall()
                
                if not messages:
                    return {'has_stress_indicators': False}
                
                # Stress keywords
                stress_keywords = [
                    'stress', 'stressed', 'tired', 'exhausted', 'overwhelmed',
                    'anxious', 'worried', 'frustrated', 'angry', 'upset',
                    'thaka hua', 'pareshan', 'tension', 'mushkil', 'masla'
                ]
                
                stress_count = 0
                for msg in messages:
                    content_lower = msg['content'].lower()
                    for keyword in stress_keywords:
                        if keyword in content_lower:
                            stress_count += 1
                            break
                
                # If more than 30% of recent messages contain stress keywords
                has_stress = (stress_count / len(messages)) > 0.3
                
                return {
                    'has_stress_indicators': has_stress,
                    'stress_message_count': stress_count,
                    'total_checked': len(messages)
                }
                
        except Exception as e:
            print(f"[WELLNESS] Error checking stress: {e}")
            return {'has_stress_indicators': False}
    
    def suggest_wellness_activity(self, user_id: int, 
                                  wellness_check: Dict) -> Dict[str, any]:
        """
        Suggest wellness activities based on user's state
        
        Args:
            user_id: User ID
            wellness_check: Current wellness check results
            
        Returns:
            Wellness activity suggestions
        """
        activities = {
            'break': [
                'Take a 5-minute walk',
                'Stretch your arms and legs',
                'Look away from the screen for a few minutes',
                'Get some fresh air',
                'Drink some water'
            ],
            'stress_relief': [
                'Practice deep breathing for 2 minutes',
                'Listen to calming music',
                'Do a quick meditation',
                'Talk to a friend',
                'Write down your thoughts'
            ],
            'productivity': [
                'Organize your workspace',
                'Make a to-do list for tomorrow',
                'Review what you\'ve accomplished today',
                'Plan your next task',
                'Take a power nap (15-20 min)'
            ],
            'social': [
                'Connect with a friend',
                'Share something positive',
                'Express gratitude to someone',
                'Join a group chat',
                'Plan a social activity'
            ]
        }
        
        suggestions = []
        wellness_level = wellness_check.get('wellness_level')
        concerns = wellness_check.get('concerns', [])
        
        if 'high_activity' in concerns or 'continuous_activity' in concerns:
            suggestions.extend(activities['break'][:2])
        
        if 'stress_indicators' in concerns:
            suggestions.extend(activities['stress_relief'][:2])
        
        if 'late_night_activity' in concerns:
            suggestions.append('Consider wrapping up for the day')
            suggestions.append('Set a reminder for tomorrow')
        
        if not suggestions:
            suggestions.extend(activities['productivity'][:1])
        
        return {
            'success': True,
            'suggestions': suggestions[:3],  # Limit to 3
            'wellness_level': wellness_level
        }
    
    def _log_wellness_check(self, user_id: int, check_result: Dict):
        """Log wellness check to database"""
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                # Get or create the wellness agent ID
                cur.execute("""
                    SELECT id FROM ai_agents WHERE type = 'wellness' LIMIT 1
                """)
                agent_row = cur.fetchone()
                
                if not agent_row:
                    # Create wellness agent if it doesn't exist
                    cur.execute("""
                        INSERT INTO ai_agents (name, type, description, is_active)
                        VALUES ('Wellness Agent', 'wellness', 
                                'AI-powered user wellness tracking', TRUE)
                    """)
                    agent_id = cur.lastrowid
                else:
                    agent_id = agent_row['id']
                
                output_data = {
                    'wellness_level': check_result['wellness_level'],
                    'concerns': check_result['concerns'],
                    'suggestions_count': len(check_result['suggestions']),
                    'metrics': check_result['metrics']
                }
                
                cur.execute("""
                    INSERT INTO ai_agent_logs 
                    (agent_id, user_id, action_type, input_text, 
                     output_text, confidence_score)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (
                    agent_id, user_id, 'wellness_check',
                    f"Checked wellness metrics",
                    json.dumps(output_data),
                    1.0 if check_result['wellness_level'] == 'good' else 0.5
                ))
                
                conn.commit()
        except Exception as e:
            print(f"[WELLNESS] Error logging check: {e}")
        finally:
            if conn:
                conn.close()
    
    def get_wellness_history(self, user_id: int, 
                            limit: int = 10) -> List[Dict]:
        """Get user's wellness history"""
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        id, output_text, confidence_score, created_at
                    FROM ai_agent_logs
                    WHERE user_id = %s 
                    AND action_type = 'wellness_check'
                    ORDER BY created_at DESC
                    LIMIT %s
                """, (user_id, limit))
                
                logs = cur.fetchall()
                
                return [{
                    'id': log['id'],
                    'check_result': json.loads(log['output_text']) if log['output_text'] else {},
                    'wellness_score': round(log['confidence_score'], 2) if log['confidence_score'] else 0,
                    'created_at': log['created_at'].isoformat() if log['created_at'] else None
                } for log in logs]
                
        except Exception as e:
            print(f"[WELLNESS] Error fetching history: {e}")
            return []
        finally:
            if conn:
                conn.close()

    # ────────────────────────────────────────────────────────────────────
    # Autonomous hooks (Phase 3.2) — Mood→Wellness empathy chain
    # ────────────────────────────────────────────────────────────────────

    def sense(self, event: dict) -> Optional[Dict]:
        """Filter incoming ``mood.escalation`` and ``mod.violation`` events.

        Drops events for users who have not opted in to the wellness
        agent. This is the cheapest gate, runs on every published event.
        """
        topic = event.get("topic")
        user_id = event.get("user_id")
        if not user_id:
            return None
        # Two supported triggers — derive the trigger kind for downstream
        # template selection. Default to mood (legacy behaviour).
        if topic == _event_bus.TOPIC_MOD_VIOLATION:
            trigger = "mod_violation"
            # Only respond to medium+ severity to avoid nagging on light
            # incidents — moderation has its own thresholds, but a second
            # gate is cheap insurance.
            severity_score = float(event.get("severity_score") or 0.0)
            if severity_score < 0.5:
                return None
        elif topic == _event_bus.TOPIC_MOOD_ESCALATION:
            trigger = "mood_escalation"
        elif topic is None:
            # Direct test invocation without a wrapped topic — default to mood.
            trigger = "mood_escalation"
        else:
            return None
        try:
            if not self._user_opted_in(int(user_id)):
                return None
        except Exception:
            # Be conservative: if the lookup fails we let it through —
            # acting wrongly here is much less costly than silently
            # missing a real wellness signal.
            pass

        # Honor the per-user auto_check toggle for autonomous check-ins.
        # auto_check is a separate axis from "opted-in": the user keeps the
        # wellness agent installed (so on-demand /wellness still works) but
        # opts out of unprompted nudges.
        try:
            wcfg = get_personal_settings(int(user_id), 'wellness', _WELLNESS_DEFAULTS)
            if not wcfg.get('auto_check', True):
                return None
        except Exception:
            pass
        return {
            "user_id":      int(user_id),
            "channel_id":   event.get("channel_id"),
            "community_id": event.get("community_id"),
            "message_id":   event.get("message_id"),
            "trigger":      trigger,
            # Mood-path fields (None on the moderation path).
            "score":        event.get("score"),
            "window_mean":  event.get("window_mean"),
            "threshold":    event.get("threshold"),
            "primary_mood": event.get("primary_mood"),
            "mood_correlation_id": (event.get("correlation_id")
                                     if trigger == "mood_escalation" else None),
            # Moderation-path fields (None on the mood path).
            "mod_category":   event.get("category"),
            "mod_severity":   event.get("severity"),
            "mod_severity_score": event.get("severity_score"),
            "mod_correlation_id": (event.get("correlation_id")
                                    if trigger == "mod_violation" else None),
            # Propagate the upstream correlation_id (whichever trigger
            # fired) so the collaboration graph can self-join
            # agent_actions for the mood→wellness and mod→wellness
            # edges. The trigger-specific fields above are retained for
            # downstream act() / learn() use.
            "correlation_id": event.get("correlation_id"),
            "scope_type":   _agent_memory.SCOPE_USER,
            "scope_id":     int(user_id),
        }

    def decide(self, observation: Dict):
        """Decide whether to send a check-in.

        ``defer`` when we're in the user's quiet hours; ``act`` otherwise.
        The base class's cooldown check (per-user, 1 hour) gates a second
        check-in even if we return ``act`` here.

        Moderation-triggered check-ins skip quiet hours — de-escalation
        is more time-sensitive than a generic mood check-in.
        """
        user_id = observation["user_id"]
        trigger = observation.get("trigger") or "mood_escalation"

        if trigger == "mood_escalation":
            now_hour = datetime.now().hour
            start, end = self._DEFAULT_QUIET_HOURS
            in_quiet = (now_hour >= start) or (now_hour < end)
            if in_quiet:
                return ("defer", observation,
                        f"quiet_hours_{now_hour:02d}_skipping_checkin")
        # Pick a template index up front so learn() can credit it later.
        idx = self._pick_template_index(user_id)
        if trigger == "mod_violation":
            reason = (f"deescalation_template_{idx}_"
                      f"sev_{observation.get('mod_severity')}")
        else:
            reason = (f"checkin_template_{idx}_"
                      f"mean_{observation.get('window_mean')}")
        return ("act", {**observation, "template_idx": idx}, reason)

    def act(self, payload: Dict, correlation_id: str) -> Optional[Dict]:
        """Emit a ``wellness_checkin`` socket event to the user's
        personal room. The frontend renders this as a soft toast/card
        with engage / dismiss buttons that feed back into ``learn()``.

        Phase 4: the ``trigger`` field tells the frontend whether this is
        a mood-driven empathy check-in or a moderation de-escalation
        nudge — different copy, different visual styling.
        """
        user_id = payload["user_id"]
        template_idx = payload.get("template_idx") or 0
        trigger = payload.get("trigger") or "mood_escalation"

        # Idempotency guard — collapse duplicate dispatch from multiple
        # orchestrator loops (stray second Celery worker / second app.py,
        # both common after restarts on Windows) to a single check-in.
        # Each loop receives the SAME mood.escalation / mod.violation
        # pub/sub message and runs this agent independently; the base-class
        # cooldown reads last_acted_at then acts, so N loops all see "no
        # recent act" and all emit, stacking N toasts on the user. Claim
        # BEFORE the optional Gemini polish so losers also skip that call.
        if not self._claim_checkin(user_id):
            return {"emitted": False, "deduped": True,
                    "template_idx": template_idx}

        # Build the message text. Optional Gemini polish if available;
        # fall back to the template verbatim.
        text = self._format_checkin(template_idx, payload)

        try:
            from app import socketio  # lazy: avoid circular import
            socketio.emit("wellness_checkin", {
                "user_id":         user_id,
                "channel_id":      payload.get("channel_id"),
                "community_id":    payload.get("community_id"),
                "message_id":      payload.get("message_id"),
                "trigger":         trigger,
                "text":            text,
                "primary_mood":    payload.get("primary_mood"),
                "window_mean":     payload.get("window_mean"),
                "mod_category":    payload.get("mod_category"),
                "mod_severity":    payload.get("mod_severity"),
                "template_idx":    template_idx,
                "correlation_id":  correlation_id,
            }, room=f"user_{user_id}", namespace="/")
        except Exception as exc:
            print(f"[WELLNESS] checkin emit failed: {exc}")
            return {"emitted": False, "template_idx": template_idx}

        # Stamp a wellness check log row so the existing history endpoint
        # surfaces autonomous check-ins alongside on-demand ones.
        try:
            self._log_wellness_check(user_id, {
                "wellness_level": "monitor",
                "concerns": ["mood_escalation"],
                "suggestions": [{"type": "checkin", "message": text,
                                 "priority": "medium"}],
                "metrics": {
                    "window_mean": payload.get("window_mean"),
                    "primary_mood": payload.get("primary_mood"),
                    "trigger": "autonomous_mood_escalation",
                },
            })
        except Exception:
            pass
        return {"emitted": True, "template_idx": template_idx,
                "text": text[:200]}

    def learn(self, action_id: int, signal: str, *, weight: float = 1.0) -> None:
        """Adapt the per-user check-in template arm via a tiny bandit.

        - ``positive`` / ``engaged`` → bump the chosen template's reward.
        - ``negative`` / ``dismissed`` → stretch the cooldown so we don't
          nag (recorded as ``cooldown_multiplier`` in agent_state).
        """
        try:
            action = _agent_memory.get_action(action_id)
            if not action or not action.get("user_id"):
                return super().learn(action_id, signal, weight=weight)
            user_id = action["user_id"]
            state = _agent_memory.get_state(self.NAME, _agent_memory.SCOPE_USER,
                                            user_id) or {}
            th = dict(state.get("thresholds") or {})
            rewards = dict(th.get("template_rewards") or {})
            # We don't have payload_json in get_action's projection; fetch
            # raw to recover the template_idx.
            tpl_idx = self._template_idx_for(action_id)
            if signal in ("positive", "engaged") and tpl_idx is not None:
                rewards[str(tpl_idx)] = (
                    float(rewards.get(str(tpl_idx), 0)) + float(weight)
                )
                th["template_rewards"] = rewards
            if signal in ("negative", "dismissed"):
                mult = float(th.get("cooldown_multiplier", 1.0))
                # Cap at 6× so we never go totally silent on a user.
                th["cooldown_multiplier"] = min(6.0, mult + 0.5 * float(weight))
            outcome = ("positive" if signal in ("positive", "engaged")
                       else "negative" if signal in ("negative", "dismissed")
                       else "neutral")
            _agent_memory.set_state(self.NAME, _agent_memory.SCOPE_USER, user_id,
                                    thresholds=th, last_outcome=outcome)
        except Exception as exc:
            print(f"[WELLNESS] learn failed: {exc}")
        super().learn(action_id, signal, weight=weight)

    # ── Internal helpers for the autonomous loop ────────────────────

    def _claim_checkin(self, user_id: int) -> bool:
        """Atomically claim the right to send one check-in to this user per
        cooldown window.

        Returns True if this caller won the claim (should emit), False if a
        concurrent orchestrator already claimed it. Fail-open: if Redis is
        unavailable we return True — the duplicate only happens *with* Redis +
        multiple loops anyway, and a single-process setup must still check in.
        Mirrors engagement._claim_nudge / auto_message._claim_welcome.
        """
        try:
            r = _get_redis()
            if r is None:
                return True
            key = f"wellness:checkin:{user_id}"
            # SET NX EX — only the first caller across all processes succeeds.
            return bool(r.set(key, "1", nx=True, ex=_CHECKIN_DEDUPE_TTL))
        except Exception:
            return True

    def _user_opted_in(self, user_id: int) -> bool:
        """Check the ``user_agents`` table for the per-user wellness toggle.
        Mirrors mood_tracker._user_opted_in but with agent_type='wellness'.
        """
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT enabled FROM user_agents "
                    "WHERE user_id=%s AND agent_type='wellness' AND enabled=TRUE",
                    (user_id,),
                )
                return cur.fetchone() is not None
        except Exception:
            return False
        finally:
            if conn:
                conn.close()

    def _pick_template_index(self, user_id: int) -> int:
        """ε-greedy template bandit, persisted in agent_state.thresholds.
        20% explore, 80% exploit the best-rewarded template for this user.
        """
        n = len(_CHECKIN_TEMPLATES)
        if n == 0:
            return 0
        state = _agent_memory.get_state(self.NAME, _agent_memory.SCOPE_USER,
                                        user_id) or {}
        rewards = (state.get("thresholds") or {}).get("template_rewards") or {}
        if random.random() < 0.2 or not rewards:
            return random.randrange(n)
        try:
            best_key = max(rewards, key=lambda k: float(rewards[k]))
            idx = int(best_key)
            if 0 <= idx < n:
                return idx
        except Exception:
            pass
        return random.randrange(n)

    def _format_checkin(self, template_idx: int, payload: Dict) -> str:
        """Pick the template and optionally polish via Gemini. The
        ``trigger`` field decides which template bank we draw from.
        """
        trigger = payload.get("trigger") or "mood_escalation"
        bank = (_DEESCALATION_TEMPLATES if trigger == "mod_violation"
                else _CHECKIN_TEMPLATES)
        idx = template_idx if 0 <= template_idx < len(bank) else 0
        base = bank[idx]

        # Best-effort Gemini polish — keep it short. Failure is silent.
        try:
            from config import GEMINI_API_KEY
            if not GEMINI_API_KEY:
                return base
            from google import genai
            client = genai.Client(api_key=GEMINI_API_KEY)
            if trigger == "mod_violation":
                context = ("a user whose message just crossed the moderation "
                           "line and could use a calmer follow-up")
            else:
                mood = payload.get("primary_mood") or "down"
                context = f"a friend who seems {mood}"
            prompt = (
                f"Rewrite this wellness check-in for {context}. Keep it warm, "
                "ONE sentence, plain text, no emojis.\n"
                f"Original: {base}\n\nRewrite:"
            )
            resp = client.models.generate_content(
                model="gemini-2.5-flash", contents=prompt,
            )
            text = (getattr(resp, "text", "") or "").strip().split("\n")[0]
            return text[:240] if text else base
        except Exception:
            return base

    def _template_idx_for(self, action_id: int) -> Optional[int]:
        """Pull the chosen template_idx out of an agent_actions.payload_json."""
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("SELECT payload_json FROM agent_actions WHERE id=%s",
                            (action_id,))
                row = cur.fetchone()
            if not row:
                return None
            raw = row["payload_json"] if isinstance(row, dict) else row[0]
            if isinstance(raw, (str, bytes, bytearray)):
                data = json.loads(raw)
            else:
                data = raw
            v = (data or {}).get("template_idx")
            return int(v) if v is not None else None
        except Exception:
            return None
        finally:
            if conn:
                conn.close()

