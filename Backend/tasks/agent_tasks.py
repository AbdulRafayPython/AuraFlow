"""
Auraflow Agent Celery Tasks
=============================
Defines all background tasks for AI agent auto-execution.

Task Types:
    - On-demand: Triggered by user actions (message send, /summarize command)
    - Periodic:  Triggered by Celery Beat scheduler (engagement, wellness, knowledge)

Usage:
    # Fire-and-forget (non-blocking):
    moderate_message_task.delay(text, user_id, channel_id, community_id)
    
    # With callback:
    result = summarize_channel_task.apply_async(args=[channel_id, user_id, 100])
    summary = result.get(timeout=60)
"""

import json
import time
import traceback
import os
from datetime import datetime, timedelta
from celery_app import celery_app
from database import get_db_connection


def _log_agent_action(agent_name, action_type, input_data, output_data, status, execution_time, community_id=None, user_id=None):
    """Log agent execution to ai_agent_logs table."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO ai_agent_logs 
                (agent_name, action_type, input_data, output_data, status, execution_time_ms, community_id, user_id, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
            """, (
                agent_name,
                action_type,
                json.dumps(input_data) if isinstance(input_data, dict) else str(input_data),
                json.dumps(output_data) if isinstance(output_data, dict) else str(output_data),
                status,
                int(execution_time * 1000),
                community_id,
                user_id
            ))
            conn.commit()
    except Exception as e:
        print(f"[AGENT_LOG] Failed to log agent action: {e}")
    finally:
        if conn:
            conn.close()


def _is_agent_installed(community_id, agent_type):
    """Check if an agent is installed and enabled for a community."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT enabled FROM community_agents 
                WHERE community_id = %s AND agent_type = %s AND enabled = TRUE
            """, (community_id, agent_type))
            return cur.fetchone() is not None
    except Exception as e:
        # If table doesn't exist yet, return False gracefully
        print(f"[AGENT_CHECK] Error checking agent install: {e}")
        return False
    finally:
        if conn:
            conn.close()


def _is_personal_agent_active(user_id, agent_type):
    """Check if a personal agent is activated for a user."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT enabled FROM user_agents 
                WHERE user_id = %s AND agent_type = %s AND enabled = TRUE
            """, (user_id, agent_type))
            return cur.fetchone() is not None
    except Exception as e:
        print(f"[AGENT_CHECK] Error checking personal agent: {e}")
        return False
    finally:
        if conn:
            conn.close()


def _get_community_for_channel(channel_id):
    """Get community_id for a given channel."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT community_id FROM channels WHERE id = %s", (channel_id,))
            row = cur.fetchone()
            return row['community_id'] if row else None
    except Exception:
        return None
    finally:
        if conn:
            conn.close()


def _increment_usage(table, agent_type, id_col, id_val):
    """Increment usage_count and update last_active/last_used."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            time_col = 'last_active' if table == 'community_agents' else 'last_used'
            cur.execute(f"""
                UPDATE {table} 
                SET usage_count = usage_count + 1, {time_col} = NOW() 
                WHERE {id_col} = %s AND agent_type = %s
            """, (id_val, agent_type))
            conn.commit()
    except Exception as e:
        print(f"[AGENT_USAGE] Error incrementing usage: {e}")
    finally:
        if conn:
            conn.close()


# ======================================================================
# ON-DEMAND TASKS
# ======================================================================

@celery_app.task(name='tasks.agent_tasks.batch_moderation_task', bind=True, max_retries=1, rate_limit='30/m')
def batch_moderation_task(self, channel_id, community_id):
    """
    Batch LLM moderation: drain the Redis buffer for a channel,
    send all messages to the LLM for contextual review, and emit
    retroactive moderation events for any flagged messages.
    """
    start = time.time()
    try:
        # Honour per-community moderation toggle. If the community admin has
        # disabled moderation for their community, drain & drop without calling the LLM.
        try:
            from services.community_agent_config import is_agent_enabled
            if not is_agent_enabled(community_id, 'moderation'):
                from agents.moderation import ModerationAgent
                ModerationAgent().drain_buffer(channel_id)
                return {'status': 'disabled', 'community_id': community_id, 'channel_id': channel_id}
        except Exception:
            pass

        from agents.moderation import ModerationAgent
        agent = ModerationAgent()

        # Drain the buffer atomically
        messages = agent.drain_buffer(channel_id)
        if not messages:
            return {'status': 'empty', 'channel_id': channel_id}
        
        print(f"[BATCH_MOD] Processing {len(messages)} messages for channel {channel_id}")
        
        # Send batch to the LLM
        verdicts = agent.batch_llm_review(messages)
        
        elapsed = time.time() - start
        
        # None = LLM failure (timeout/503/error) → re-buffer for retry
        if verdicts is None:
            print(f"[BATCH_MOD] LLM failed for channel {channel_id}, re-buffering {len(messages)} msgs for retry")
            for msg in messages:
                agent.push_to_buffer(channel_id, msg)
            _log_agent_action(
                'moderation', 'batch_review',
                {'channel_id': channel_id, 'message_count': len(messages)},
                {'result': 'llm_failed_rebuffered'}, 'error', elapsed,
                community_id=community_id
            )
            return {'status': 'llm_failed', 'channel_id': channel_id, 'rebuffered': len(messages)}
        
        if not verdicts:
            # All clean
            _log_agent_action(
                'moderation', 'batch_review',
                {'channel_id': channel_id, 'message_count': len(messages)},
                {'result': 'all_clean'}, 'success', elapsed,
                community_id=community_id
            )
            return {'status': 'all_clean', 'channel_id': channel_id, 'reviewed': len(messages)}
        
        # Process each violation
        from flask_socketio import SocketIO as FlaskSocketIO
        REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
        sio = FlaskSocketIO(message_queue=REDIS_URL)
        room = f"channel_{channel_id}"
        
        for v in verdicts:
            msg_id = v['msg_id']
            user_id = v['user_id']
            username = v.get('username', 'Unknown')
            action = v['action']
            severity = v['severity']
            reasons = [v.get('category', 'unknown')]
            explanation = v.get('explanation', '')
            
            # Read and update violation_count
            violation_count = 0
            try:
                conn = get_db_connection()
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT violation_count FROM community_members WHERE community_id = %s AND user_id = %s FOR UPDATE",
                        (community_id, user_id)
                    )
                    row = cur.fetchone()
                    if row:
                        violation_count = (row.get('violation_count') or 0) + 1
                        cur.execute(
                            "UPDATE community_members SET violation_count = %s WHERE community_id = %s AND user_id = %s",
                            (violation_count, community_id, user_id)
                        )
                    cur.execute("""
                        UPDATE community_agents
                        SET usage_count = usage_count + 1, last_active = NOW()
                        WHERE community_id = %s AND agent_type = 'moderation'
                    """, (community_id,))
                conn.commit()
                conn.close()
            except Exception as db_err:
                print(f"[BATCH_MOD] DB update failed for user {user_id}: {db_err}")
            
            # 3-strike escalation
            if violation_count >= 3:
                final_action = 'remove_user'
                user_message = f'@{username} has been removed from this community by the Moderation Agent for repeated violations.'
            elif violation_count == 2:
                final_action = 'flag'
                user_message = f'@{username}, your content has been flagged for repeated violations (2/3). One more violation will result in removal.'
            elif violation_count == 1:
                final_action = 'warn'
                user_message = f'@{username}, this message may violate community guidelines ({", ".join(reasons)}). Please be mindful.'
            else:
                final_action = action
                user_message = f'@{username}, this message was flagged by AI review ({", ".join(reasons)}).'
            
            # Emit retroactive events
            _emit_moderation_event(
                sio, final_action, room, channel_id, community_id,
                msg_id, user_id, username, severity, reasons,
                explanation, violation_count, user_message
            )
            
            # Log moderation action
            agent.log_moderation_action(
                user_id, channel_id, v.get('content', '')[:500],
                final_action, severity, reasons,
                v.get('confidence', 0.5), msg_id
            )
            
            print(f"[BATCH_MOD] Retroactive {final_action} for msg {msg_id} by {username}")
        
        _log_agent_action(
            'moderation', 'batch_review',
            {'channel_id': channel_id, 'message_count': len(messages)},
            {'flagged': len(verdicts), 'actions': [v['action'] for v in verdicts]},
            'success', elapsed, community_id=community_id
        )
        
        return {
            'status': 'actioned',
            'channel_id': channel_id,
            'reviewed': len(messages),
            'flagged': len(verdicts)
        }
        
    except Exception as e:
        elapsed = time.time() - start
        print(f"[BATCH_MOD] Error: {e}")
        _log_agent_action(
            'moderation', 'batch_review',
            {'channel_id': channel_id},
            {'error': str(e)}, 'error', elapsed,
            community_id=community_id
        )
        raise self.retry(exc=e)


@celery_app.task(name='tasks.agent_tasks.flush_moderation_buffers')
def flush_moderation_buffers():
    """
    Periodic task (runs every 30s via Celery Beat).
    Finds channel buffers that have timed out and dispatches batch tasks.
    """
    try:
        from agents.moderation import ModerationAgent
        agent = ModerationAgent()
        stale_channels = agent.get_stale_channels()
        
        if not stale_channels:
            return {'flushed': 0}
        
        print(f"[BATCH_MOD] Flushing {len(stale_channels)} stale buffers")
        
        for channel_id in stale_channels:
            community_id = _get_community_for_channel(channel_id)
            if community_id:
                # Check if moderation agent is installed
                if _is_agent_installed(community_id, 'moderation'):
                    batch_moderation_task.delay(channel_id, community_id)
        
        return {'flushed': len(stale_channels)}
    except Exception as e:
        print(f"[BATCH_MOD] Flush error: {e}")
        return {'error': str(e)}


def _emit_moderation_event(sio, final_action, room, channel_id, community_id,
                           msg_id, user_id, username, severity, reasons,
                           explanation, violation_count, user_message):
    """Helper to emit retroactive moderation socket events."""
    try:
        if final_action == 'remove_user':
            # Remove user from community (3rd strike)
            community_data = None
            try:
                rm_conn = get_db_connection()
                with rm_conn.cursor() as rm_cur:
                    rm_cur.execute("SELECT name, logo_url, color, icon, public_id FROM communities WHERE id = %s", (community_id,))
                    community_data = rm_cur.fetchone()
                    rm_cur.execute("INSERT IGNORE INTO blocked_users (community_id, user_id) VALUES (%s, %s)", (community_id, user_id))
                    rm_cur.execute("DELETE FROM channel_members WHERE user_id = %s AND channel_id IN (SELECT id FROM channels WHERE community_id = %s)", (user_id, community_id))
                    rm_cur.execute("DELETE FROM community_members WHERE community_id = %s AND user_id = %s", (community_id, user_id))
                rm_conn.commit()
                rm_conn.close()
            except Exception as rm_err:
                print(f"[BATCH_MOD] Remove user DB error: {rm_err}")
            
            sio.emit('moderation_retroactive', {
                'message_id': msg_id, 'channel_id': channel_id,
                'user_id': user_id, 'username': username,
                'action': 'remove_user', 'severity': 'high',
                'reasons': reasons, 'explanation': explanation,
                'violation_count': violation_count, 'max_violations': 3,
                'banner_text': user_message,
                'timestamp': datetime.utcnow().isoformat()
            }, room=room, namespace='/')
            
            sio.emit('moderation_user_removed', {
                'user_id': user_id, 'username': username,
                'channel_id': channel_id, 'community_id': community_id,
                'reason': f'Removed for repeated violations: {", ".join(reasons)} (3 strikes)',
                'removed_by': 'Auraflow Moderation Agent',
                'violation_count': violation_count,
                'timestamp': datetime.utcnow().isoformat()
            }, room=room, namespace='/')
            
            sio.emit('community:removed', {
                'community_id': community_id,
                'community_public_id': community_data['public_id'] if community_data else None,
                'user_id': user_id,
                'reason': 'violation',
                'message': 'You were removed from this community for repeated violations (3 strikes).',
                'notification': {
                    'community_name': community_data['name'] if community_data else 'Community',
                    'community_logo': community_data.get('logo_url') if community_data else None,
                    'community_color': community_data.get('color') if community_data else '#8B5CF6',
                    'community_icon': community_data.get('icon') if community_data else 'AF'
                }
            }, room=f"user_{user_id}", namespace='/')
        
        else:
            # warn or flag
            sio.emit('moderation_retroactive', {
                'message_id': msg_id, 'channel_id': channel_id,
                'user_id': user_id, 'username': username,
                'action': final_action, 'severity': severity,
                'reasons': reasons, 'explanation': explanation,
                'violation_count': violation_count, 'max_violations': 3,
                'banner_text': user_message,
                'timestamp': datetime.utcnow().isoformat()
            }, room=room, namespace='/')
        
        # Notify community owners
        sio.emit('moderation_action_logged', {
            'community_id': community_id, 'channel_id': channel_id,
            'action': final_action, 'severity': severity,
            'timestamp': datetime.utcnow().isoformat()
        }, room=f"community_{community_id}", namespace='/')
        
    except Exception as emit_err:
        print(f"[BATCH_MOD] Socket emit failed: {emit_err}")


@celery_app.task(name='tasks.agent_tasks.track_mood_task', bind=True, max_retries=2, rate_limit='60/m')
def track_mood_task(self, text, user_id, channel_id=None):
    """
    Track mood/sentiment of a message using Mood Tracker Agent.
    Triggered on every message if user has mood tracker activated.
    """
    start = time.time()
    try:
        if not _is_personal_agent_active(user_id, 'mood'):
            return {'status': 'skipped', 'reason': 'not_active'}
        
        from agents.mood_tracker import MoodTrackerAgent
        agent = MoodTrackerAgent()
        # One message per task, rate-limited to 60/m by the decorator, and
        # the agent only reaches the LLM on messages the cheap path can't
        # call — so this is affordable.
        result = agent.analyze_message(text, allow_llm=True)
        
        # Store mood record in user_moods table
        if result and result.get('sentiment'):
            conn = get_db_connection()
            try:
                with conn.cursor() as cur:
                    sentiment = result['sentiment']
                    detected_emotions = json.dumps({
                        'scores': result.get('scores', {}),
                        'method': result.get('method', 'unknown'),
                    })
                    cur.execute("""
                        INSERT INTO user_moods 
                        (user_id, channel_id, mood, sentiment_score, detected_emotions, message_sample, created_at)
                        VALUES (%s, %s, %s, %s, %s, %s, NOW())
                    """, (
                        user_id, channel_id,
                        sentiment.get('label', 'neutral'),
                        sentiment.get('compound', 0),
                        detected_emotions,
                        text[:500]
                    ))
                    conn.commit()
            finally:
                conn.close()
        
        elapsed = time.time() - start
        _log_agent_action(
            'mood', 'track_mood',
            {'text': text[:200], 'user_id': user_id},
            result or {}, 'success', elapsed,
            user_id=user_id
        )
        _increment_usage('user_agents', 'mood', 'user_id', user_id)
        
        return result
        
    except Exception as e:
        elapsed = time.time() - start
        _log_agent_action(
            'mood', 'track_mood',
            {'text': text[:200], 'user_id': user_id},
            {'error': str(e)}, 'error', elapsed,
            user_id=user_id
        )
        raise self.retry(exc=e)


@celery_app.task(name='tasks.agent_tasks.summarize_channel_task', bind=True, max_retries=1, rate_limit='10/m')
def summarize_channel_task(self, channel_id, user_id, message_count=100):
    """
    Generate channel summary using Summarizer Agent.
    Triggered by /summarize command or API call.
    """
    start = time.time()
    try:
        from agents.summarizer import SummarizerAgent
        agent = SummarizerAgent()
        result = agent.summarize_channel(channel_id, message_count, user_id)
        
        elapsed = time.time() - start
        _log_agent_action(
            'summarizer', 'summarize_channel',
            {'channel_id': channel_id, 'message_count': message_count},
            result or {}, 'success', elapsed,
            user_id=user_id
        )
        _increment_usage('user_agents', 'summarizer', 'user_id', user_id)
        
        return result
        
    except Exception as e:
        elapsed = time.time() - start
        _log_agent_action(
            'summarizer', 'summarize_channel',
            {'channel_id': channel_id},
            {'error': str(e)}, 'error', elapsed,
            user_id=user_id
        )
        raise self.retry(exc=e)


@celery_app.task(name='tasks.agent_tasks.analyze_focus_task', bind=True, max_retries=1, rate_limit='20/m')
def analyze_focus_task(self, channel_id, community_id=None, hours=24):
    """
    Analyze conversation focus and detect topic drift.
    Triggered every N messages or on-demand.
    """
    start = time.time()
    try:
        if community_id is None:
            community_id = _get_community_for_channel(channel_id)
        
        if community_id and not _is_agent_installed(community_id, 'focus'):
            return {'status': 'skipped', 'reason': 'not_installed'}
        
        from agents.focus import FocusAgent
        agent = FocusAgent()
        result = agent.analyze_focus(channel_id, hours)
        
        elapsed = time.time() - start
        _log_agent_action(
            'focus', 'analyze_focus',
            {'channel_id': channel_id, 'hours': hours},
            result or {}, 'success', elapsed,
            community_id=community_id
        )
        if community_id:
            _increment_usage('community_agents', 'focus', 'community_id', community_id)
        
        return result
        
    except Exception as e:
        elapsed = time.time() - start
        _log_agent_action(
            'focus', 'analyze_focus',
            {'channel_id': channel_id},
            {'error': str(e)}, 'error', elapsed,
            community_id=community_id
        )
        raise self.retry(exc=e)


# ======================================================================
# PERIODIC TASKS (Celery Beat)
# ======================================================================

# ─────────────────────────────────────────────────────────────────────
#  Periodic fan-out children
# ─────────────────────────────────────────────────────────────────────
# The *_periodic tasks below used to loop over every user/community/channel
# INSIDE a single Celery task. That task is bound by celery_app.conf
# task_time_limit (180s hard kill), so once the tenant count grew past what
# one task could finish in 3 minutes, the worker killed it mid-sweep and
# every remaining row was silently skipped -- no error, no retry of the
# remainder, and always the same rows starved at the tail of the list.
# Each sweep is now a dispatcher that enqueues one child task per unit of
# work. Each child gets its own time limit, its own retry, and its own
# error isolation, and the pool drains them at whatever concurrency the
# worker is configured for.

@celery_app.task(name='tasks.agent_tasks.check_wellness_for_user',
                 bind=True, max_retries=1, rate_limit='120/m')
def check_wellness_for_user(self, user_id):
    """Wellness check for ONE user. Fanned out by check_wellness_periodic."""
    try:
        from agents.wellness import WellnessAgent
        WellnessAgent().check_user_wellness(user_id)
        _increment_usage('user_agents', 'wellness', 'user_id', user_id)
        return {'user_id': user_id, 'ok': True}
    except Exception as e:
        print(f"[WELLNESS_USER] Error for user {user_id}: {e}")
        return {'user_id': user_id, 'ok': False, 'error': str(e)}


@celery_app.task(name='tasks.agent_tasks.analyze_engagement_for_channel',
                 bind=True, max_retries=1, rate_limit='60/m')
def analyze_engagement_for_channel(self, channel_id, community_id, hours=24):
    """Engagement analysis for ONE channel. Fanned out by check_engagement_periodic."""
    try:
        from agents.engagement import EngagementAgent
        EngagementAgent().analyze_engagement(channel_id, hours)
        _increment_usage('community_agents', 'engagement', 'community_id', community_id)
        return {'channel_id': channel_id, 'ok': True}
    except Exception as e:
        print(f"[ENGAGEMENT_CHANNEL] Error for channel {channel_id}: {e}")
        return {'channel_id': channel_id, 'ok': False, 'error': str(e)}


@celery_app.task(name='tasks.agent_tasks.extract_knowledge_for_channel',
                 bind=True, max_retries=1, rate_limit='30/m')
def extract_knowledge_for_channel(self, channel_id, community_id, hours=2):
    """Knowledge extraction for ONE channel. Fanned out by extract_knowledge_periodic."""
    try:
        from agents.knowledge_builder_v2 import KnowledgeBuilderAgent as KnowledgeBuilderV2
        KnowledgeBuilderV2().extract_knowledge(channel_id, hours)
        _increment_usage('community_agents', 'knowledge', 'community_id', community_id)
        return {'channel_id': channel_id, 'ok': True}
    except Exception as e:
        print(f"[KB_CHANNEL] Error for channel {channel_id}: {e}")
        return {'channel_id': channel_id, 'ok': False, 'error': str(e)}


@celery_app.task(name='tasks.agent_tasks.check_engagement_periodic')
def check_engagement_periodic():
    """Dispatcher: enqueue one engagement analysis per channel.

    Runs every 30 minutes via Celery Beat. Previously this looped over every
    community AND every channel inside this single task (opening a fresh DB
    connection per community), so a large tenant list blew the 180s hard
    time limit and the tail of the list was silently never processed.

    Now: one JOINed query collects the work, then each channel becomes its
    own task. Also removes the per-community connection churn.
    """
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT ca.community_id, ca.settings, ch.id AS channel_id
                FROM community_agents ca
                JOIN channels ch ON ch.community_id = ca.community_id
                WHERE ca.agent_type = 'engagement' AND ca.enabled = TRUE
            """)
            rows = cur.fetchall()
    except Exception as e:
        print(f"[ENGAGEMENT_PERIODIC] Fatal error: {e}")
        traceback.print_exc()
        return {'error': str(e)}
    finally:
        if conn:
            conn.close()

    queued = 0
    for row in rows:
        try:
            settings = json.loads(row['settings']) if row['settings'] else {}
            hours = settings.get('check_hours', 24)
            analyze_engagement_for_channel.delay(
                row['channel_id'], row['community_id'], hours)
            queued += 1
        except Exception as e:
            print(f"[ENGAGEMENT_PERIODIC] Enqueue failed for channel "
                  f"{row.get('channel_id')}: {e}")

    _log_agent_action(
        'engagement', 'periodic_check',
        {'type': 'periodic'}, {'queued': queued},
        'success', 0,
    )
    return {'queued': queued}


@celery_app.task(name='tasks.agent_tasks.check_wellness_periodic')
def check_wellness_periodic():
    """Dispatcher: enqueue one wellness check per opted-in user.

    Runs hourly via Celery Beat. Previously looped over every enabled user
    inside this single task; past the 180s hard limit the worker killed it
    mid-sweep and the remaining users were silently skipped every hour.
    """
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT ua.user_id
                FROM user_agents ua
                WHERE ua.agent_type = 'wellness' AND ua.enabled = TRUE
            """)
            users = cur.fetchall()
    except Exception as e:
        print(f"[WELLNESS_PERIODIC] Fatal error: {e}")
        traceback.print_exc()
        return {'error': str(e)}
    finally:
        if conn:
            conn.close()

    queued = 0
    for user in users:
        try:
            check_wellness_for_user.delay(user['user_id'])
            queued += 1
        except Exception as e:
            print(f"[WELLNESS_PERIODIC] Enqueue failed for user "
                  f"{user.get('user_id')}: {e}")

    _log_agent_action(
        'wellness', 'periodic_check',
        {'type': 'periodic'}, {'queued': queued},
        'success', 0,
    )
    return {'queued': queued}


@celery_app.task(name='tasks.agent_tasks.extract_knowledge_periodic')
def extract_knowledge_periodic():
    """Dispatcher: enqueue one knowledge extraction per channel.

    Runs every 2 hours via Celery Beat. Same fan-out rationale as
    check_engagement_periodic -- the nested community/channel loop could not
    finish inside the 180s hard time limit once tenant count grew.
    """
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT ca.community_id, ca.settings, ch.id AS channel_id
                FROM community_agents ca
                JOIN channels ch ON ch.community_id = ca.community_id
                WHERE ca.agent_type = 'knowledge' AND ca.enabled = TRUE
            """)
            rows = cur.fetchall()
    except Exception as e:
        print(f"[KB_PERIODIC] Fatal error: {e}")
        traceback.print_exc()
        return {'error': str(e)}
    finally:
        if conn:
            conn.close()

    queued = 0
    for row in rows:
        try:
            settings = json.loads(row['settings']) if row['settings'] else {}
            hours = settings.get('extract_hours', 2)
            extract_knowledge_for_channel.delay(
                row['channel_id'], row['community_id'], hours)
            queued += 1
        except Exception as e:
            print(f"[KB_PERIODIC] Enqueue failed for channel "
                  f"{row.get('channel_id')}: {e}")

    _log_agent_action(
        'knowledge', 'periodic_extract',
        {'type': 'periodic'}, {'queued': queued},
        'success', 0,
    )
    return {'queued': queued}


@celery_app.task(name='tasks.agent_tasks.cleanup_old_logs')
def cleanup_old_logs():
    """
    Daily cleanup: Remove agent logs older than 30 days.
    Runs at 3 AM via Celery Beat.
    """
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                DELETE FROM ai_agent_logs 
                WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
            """)
            deleted = cur.rowcount
            conn.commit()
        
        print(f"[CLEANUP] Deleted {deleted} old agent log entries")
        return {'deleted': deleted}
        
    except Exception as e:
        print(f"[CLEANUP] Error: {e}")
        return {'error': str(e)}
    finally:
        if conn:
            conn.close()


# ======================================================================
# AUTO-SUMMARIZE PERIODIC TASK
# ======================================================================

def _format_summary_as_bot_message(result, channel_name=''):
    """Format a summary result dict into a nice chat message string."""
    summary_text = result.get('summary', 'No summary generated.')
    key_points = result.get('key_points', [])
    participants = result.get('participants', [])
    message_count = result.get('message_count', 0)
    time_range = result.get('time_range', {})

    lines = []
    lines.append(f"📋 Daily Summary — #{channel_name}" if channel_name else "📋 Daily Summary")
    lines.append("━" * 30)
    lines.append("")
    lines.append(summary_text)

    if key_points:
        lines.append("")
        lines.append("📌 Key Points:")
        for point in key_points[:8]:
            lines.append(f"  • {point}")

    if participants:
        lines.append("")
        lines.append(f"👥 Participants: {', '.join(participants[:15])}")

    lines.append("")
    lines.append(f"📊 {message_count} messages analyzed")

    if time_range.get('start') and time_range.get('end'):
        lines.append(f"🕐 Period: {time_range['start'][:16]} → {time_range['end'][:16]}")

    return "\n".join(lines)


def _post_bot_message(channel_id, community_id, content, sender_id):
    """
    Insert a bot summary message into the messages table and broadcast via SocketIO.
    Uses message_type='ai' so the frontend renders it with bot styling.
    """
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Insert the message
            cur.execute("""
                INSERT INTO messages (channel_id, sender_id, content, message_type, bot_name)
                VALUES (%s, %s, %s, 'ai', %s)
            """, (channel_id, sender_id, content, 'Summarizer Agent'))
            message_id = cur.lastrowid

            # Fetch for broadcast payload
            cur.execute("""
                SELECT m.*, u.username, u.display_name, u.avatar_url
                FROM messages m
                JOIN users u ON m.sender_id = u.id
                WHERE m.id = %s
            """, (message_id,))
            msg = cur.fetchone()
            conn.commit()

        if msg:
            # Broadcast via SocketIO from external process (Celery)
            try:
                from flask_socketio import SocketIO as FlaskSocketIO
                REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
                sio = FlaskSocketIO(message_queue=REDIS_URL)

                payload = {
                    'id': msg['id'],
                    'channel_id': msg['channel_id'],
                    'sender_id': sender_id,
                    'content': msg['content'],
                    'message_type': 'ai',
                    'reply_to': None,
                    'created_at': msg['created_at'].isoformat() if hasattr(msg['created_at'], 'isoformat') else str(msg['created_at']),
                    'author': 'Summarizer Agent',
                    'avatar': None,
                    'is_blocked': False,
                    'moderation': None,
                }
                sio.emit('message_received', payload, room=f"channel_{channel_id}", namespace='/')
                sio.emit('message_received', payload, room=f"community_{community_id}", namespace='/')
                print(f"[AUTO_SUMMARIZE] ✅ Bot message broadcast to channel {channel_id}")
            except Exception as emit_err:
                print(f"[AUTO_SUMMARIZE] ⚠️ Message saved but socket emit failed: {emit_err}")

        return message_id

    except Exception as e:
        print(f"[AUTO_SUMMARIZE] ❌ Failed to post bot message: {e}")
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        return None
    finally:
        if conn:
            conn.close()


@celery_app.task(name='tasks.agent_tasks.auto_summarize_community',
                 bind=True, max_retries=1, rate_limit='20/m')
def auto_summarize_community(self, community_id, sender_id, message_count=200):
    """Summarize every text channel of ONE community and post the results.

    Fanned out by auto_summarize_communities. The per-community
    `last_auto_summary_date` claim is stamped by the DISPATCHER before this
    is enqueued, so a second beat tick inside the +/-15min window cannot
    queue this community twice.
    """
    conn = None
    done = 0
    errors = 0
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, name FROM channels
                WHERE community_id = %s AND type = 'text'
            """, (community_id,))
            channels = cur.fetchall()
    except Exception as e:
        print(f"[AUTO_SUMMARIZE] Channel lookup failed for {community_id}: {e}")
        return {'community_id': community_id, 'error': str(e)}
    finally:
        if conn:
            conn.close()

    from agents.summarizer import SummarizerAgent
    agent = SummarizerAgent()

    for channel in channels:
        try:
            result = agent.summarize_channel(channel['id'], message_count, sender_id)
            if result and result.get('success'):
                bot_message = _format_summary_as_bot_message(result, channel['name'])
                _post_bot_message(channel['id'], community_id, bot_message, sender_id)
                done += 1
            else:
                print(f"[AUTO_SUMMARIZE] No results for channel {channel['id']}")
        except Exception as ch_err:
            print(f"[AUTO_SUMMARIZE] Error for channel {channel['id']}: {ch_err}")
            errors += 1

    _increment_usage('community_agents', 'summarizer', 'community_id', community_id)
    print(f"[AUTO_SUMMARIZE] Community {community_id}: {done} channels summarized")
    return {'community_id': community_id, 'channels': done, 'errors': errors}


@celery_app.task(name='tasks.agent_tasks.auto_summarize_communities')
def auto_summarize_communities():
    """Dispatcher: enqueue one auto-summarize task per DUE community.

    Runs every 30 minutes via Celery Beat. Most communities are filtered out
    cheaply here (not enabled / not inside the +/-15min schedule window /
    already run today), so only the few that are actually due become tasks.

    Previously the whole thing -- schedule filtering, per-community channel
    queries, summarization of every channel, LLM calls, bot posting -- ran
    inside this one task under the 180s hard time limit. Any community past
    that cutoff was silently skipped, and because the list order was stable
    it was always the same ones.

    The `last_auto_summary_date` claim is stamped HERE, before enqueueing,
    so the next beat tick inside the same window cannot double-queue.
    """
    conn = None
    now = datetime.utcnow()
    today_str = now.strftime('%Y-%m-%d')
    queued = 0
    skipped = 0

    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT ca.community_id, ca.settings, ca.installed_by
                FROM community_agents ca
                WHERE ca.agent_type = 'summarizer' AND ca.enabled = TRUE
            """)
            communities = cur.fetchall()

        print(f"[AUTO_SUMMARIZE] Checking {len(communities)} communities "
              f"at {now.strftime('%H:%M')} UTC")

        for community in communities:
            community_id = community['community_id']
            try:
                settings = json.loads(community['settings']) if community['settings'] else {}

                if not settings.get('auto_summarize_enabled', False):
                    skipped += 1
                    continue

                schedule_time = settings.get('schedule_time', '')
                if not schedule_time:
                    skipped += 1
                    continue

                try:
                    schedule_hour, schedule_minute = map(int, schedule_time.split(':'))
                except (ValueError, AttributeError):
                    print(f"[AUTO_SUMMARIZE] Invalid schedule_time "
                          f"'{schedule_time}' for community {community_id}")
                    skipped += 1
                    continue

                # Within +/-15 min of the scheduled time (midnight-safe)?
                scheduled_minutes = schedule_hour * 60 + schedule_minute
                current_minutes = now.hour * 60 + now.minute
                diff = abs(current_minutes - scheduled_minutes)
                if diff > 720:
                    diff = 1440 - diff
                if diff > 15:
                    skipped += 1
                    continue

                if settings.get('last_auto_summary_date', '') == today_str:
                    skipped += 1
                    continue

                # Claim BEFORE enqueueing so a second tick in this window
                # cannot queue the same community again.
                settings['last_auto_summary_date'] = today_str
                with conn.cursor() as cur:
                    cur.execute("""
                        UPDATE community_agents SET settings = %s
                        WHERE community_id = %s AND agent_type = 'summarizer'
                    """, (json.dumps(settings), community_id))
                conn.commit()

                auto_summarize_community.delay(
                    community_id,
                    community['installed_by'],
                    settings.get('auto_summarize_message_count', 200),
                )
                queued += 1
                print(f"[AUTO_SUMMARIZE] Queued community {community_id}")

            except Exception as e:
                print(f"[AUTO_SUMMARIZE] Error for community {community_id}: {e}")
                traceback.print_exc()

        _log_agent_action(
            'summarizer', 'auto_summarize_periodic',
            {'type': 'periodic', 'checked': len(communities)},
            {'queued': queued, 'skipped': skipped},
            'success', 0,
        )
        return {'queued': queued, 'skipped': skipped}

    except Exception as e:
        print(f"[AUTO_SUMMARIZE] Fatal error: {e}")
        traceback.print_exc()
        return {'error': str(e)}
    finally:
        if conn:
            conn.close()


@celery_app.task(name='tasks.agent_tasks.check_user_summary_schedules', bind=True, max_retries=1)
def check_user_summary_schedules(self):
    """
    Runs every minute via Celery Beat.
    Checks user_summary_schedules for any due schedules (current UTC minute matches)
    and generates + stores summaries.
    """
    conn = None
    try:
        conn = get_db_connection()
        now = datetime.utcnow()
        current_time = now.strftime('%H:%M')

        with conn.cursor() as cur:
            # Find schedules due this minute (UTC) that haven't been triggered today
            # `schedule_time` is compared as a bare range, NOT wrapped in
            # TIME_FORMAT(). Wrapping the column in a function makes the
            # predicate non-sargable, so MySQL/TiDB had to full-scan
            # user_summary_schedules -- every 60 seconds, forever. The range
            # form below can use idx_uss_due (is_active, schedule_time), added
            # in migrations/add_user_summary_schedules_index.sql.
            cur.execute("""
                SELECT s.id, s.user_id, s.channel_id, s.community_id, s.timezone,
                       c.name AS channel_name, co.public_id AS community_public_id
                FROM user_summary_schedules s
                JOIN channels c ON c.id = s.channel_id
                JOIN communities co ON co.id = s.community_id
                WHERE s.is_active = TRUE
                  AND s.schedule_time >= %s AND s.schedule_time < %s
                  AND (s.last_triggered_at IS NULL OR DATE(s.last_triggered_at) < CURDATE())
            """, (current_time + ':00', current_time + ':59.999999'))
            due = cur.fetchall()

        if not due:
            return {'checked': True, 'due': 0}

        print(f"[USER_SCHEDULES] Found {len(due)} due schedule(s) at {current_time} UTC")
        processed = 0

        for schedule in due:
            try:
                from agents.summarizer import SummarizerAgent
                summarizer = SummarizerAgent()
                result = summarizer.summarize_channel(
                    channel_id=schedule['channel_id'],
                    message_count=100,
                    user_id=schedule['user_id']
                )

                if result.get('success'):
                    content = _format_summary_as_bot_message(result, schedule['channel_name'])

                    conn2 = get_db_connection()
                    try:
                        with conn2.cursor() as cur2:
                            # Store the summary
                            cur2.execute("""
                                INSERT INTO scheduled_summaries
                                    (schedule_id, user_id, channel_id, community_id, content, method, message_count)
                                VALUES (%s, %s, %s, %s, %s, %s, %s)
                            """, (
                                schedule['id'], schedule['user_id'], schedule['channel_id'],
                                schedule['community_id'], content,
                                result.get('method', 'extractive'), result.get('message_count', 0)
                            ))

                            # Update last_triggered_at
                            cur2.execute("""
                                UPDATE user_summary_schedules SET last_triggered_at = NOW() WHERE id = %s
                            """, (schedule['id'],))
                            conn2.commit()

                        # Use Redis-backed SocketIO to emit from Celery worker
                        # (current_app.extensions is NOT available in Celery context)
                        REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
                        from flask_socketio import SocketIO as CelerySocketIO
                        sio = CelerySocketIO(message_queue=REDIS_URL)

                        # Deliver summary result to user's personal room
                        try:
                            sio.emit('summary_result', {
                                'channel_id': schedule['channel_id'],
                                'content': content,
                                'method': result.get('method', 'extractive'),
                                'message_count': result.get('message_count', 0),
                                'created_at': now.isoformat(),
                                'scheduled': True,
                            }, room=f"user_{schedule['user_id']}", namespace='/')
                            print(f"[USER_SCHEDULES] ✅ Delivered summary to user_{schedule['user_id']} via Redis-backed socket")
                        except Exception as sock_err:
                            print(f"[USER_SCHEDULES] Socket delivery failed (will be fetched later): {sock_err}")

                        # Send persistent notification (DB + web push) and emit via socket
                        try:
                            from services.notification_service import create_notification
                            msg_count = result.get('message_count', 0)
                            notif = create_notification(
                                user_id=schedule['user_id'],
                                type='summary_ready',
                                title=f"📝 Summary ready — #{schedule['channel_name']}",
                                body=f"Your scheduled summary ({msg_count} messages) is ready to view.",
                                icon_url='/AuraflowLogo.png',
                                link=f"/community/{schedule['community_public_id']}",
                                related_id=schedule['channel_id'],
                                emit=False,  # _socketio is None in Celery, we emit manually below
                            )
                            # Emit notification event via Redis-backed SocketIO
                            if notif:
                                sio.emit(
                                    'notification', notif,
                                    room=f"user_{schedule['user_id']}",
                                    namespace='/',
                                )
                                print(f"[USER_SCHEDULES] 🔔 Notification emitted for user {schedule['user_id']}")

                                # Also trigger web push for when the tab is closed/minimized
                                try:
                                    from services.notification_service import _send_web_push, _webpush
                                    if _webpush:
                                        _send_web_push(schedule['user_id'], notif)
                                        print(f"[USER_SCHEDULES] 📲 Web push sent for user {schedule['user_id']}")
                                except Exception as push_err:
                                    print(f"[USER_SCHEDULES] Web push failed (non-critical): {push_err}")

                                # Queue batched email notification for summary ready
                                try:
                                    from services.email_batch_service import queue_email_notification
                                    queue_email_notification(schedule['user_id'], 'summary_ready', {
                                        'sender_name': 'Auraflow',
                                        'preview': f"Your scheduled summary ({msg_count} messages) for #{schedule['channel_name']} is ready.",
                                        'community_name': schedule.get('community_name', ''),
                                        'channel_name': schedule.get('channel_name', ''),
                                    })
                                except Exception as email_err:
                                    print(f"[USER_SCHEDULES] Email batch queue failed (non-critical): {email_err}")
                        except Exception as notif_err:
                            print(f"[USER_SCHEDULES] Notification failed: {notif_err}")
                    finally:
                        conn2.close()

                    processed += 1
                    print(f"[USER_SCHEDULES] ✅ Generated summary for user {schedule['user_id']}, channel {schedule['channel_id']}")
                else:
                    print(f"[USER_SCHEDULES] ⚠️ Summary failed for schedule {schedule['id']}: {result.get('error')}")

            except Exception as sched_err:
                print(f"[USER_SCHEDULES] ❌ Error processing schedule {schedule['id']}: {sched_err}")

        return {'checked': True, 'due': len(due), 'processed': processed}

    except Exception as e:
        print(f"[USER_SCHEDULES] Fatal error: {e}")
        traceback.print_exc()
        return {'error': str(e)}
    finally:
        if conn:
            conn.close()


# ======================================================================
# RETROACTIVE MODERATION SCAN TASK
# ======================================================================

@celery_app.task(
    name='tasks.agent_tasks.retroactive_scan_task',
    bind=True,
    max_retries=0,
    rate_limit='2/m'
)
def retroactive_scan_task(self, channel_id, community_id, hours_back=48, triggered_by=None):
    """
    Scan historical messages not yet reviewed by the moderation agent.
    channel_id=None scans ALL channels in the community sequentially.
    Emits moderation_scan_progress socket events to community_<id> room.
    Violations are emitted as moderation_retroactive (existing frontend handler).
    """
    from agents.moderation import ModerationAgent
    from services.redis_client import get_redis
    from flask_socketio import SocketIO as FlaskSocketIO

    REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
    sio = FlaskSocketIO(message_queue=REDIS_URL)
    r = get_redis()

    # ── Resolve which channels to scan ───────────────────────────────────
    channels_to_scan = []
    if channel_id is None:
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id FROM channels WHERE community_id = %s",
                    (community_id,)
                )
                channels_to_scan = [row['id'] for row in cur.fetchall()]
        except Exception as e:
            print(f"[RETRO_SCAN_TASK] Failed to list channels for community {community_id}: {e}")
            return {'status': 'error', 'error': str(e)}
        finally:
            if conn:
                conn.close()
    else:
        channels_to_scan = [channel_id]

    task_results = []

    for ch_id in channels_to_scan:
        scan_key = f'mod:scan:{community_id}:{ch_id}'

        # Guard: one scan per channel at a time
        if r is not None and r.hget(scan_key, 'status') == b'running':
            print(f"[RETRO_SCAN_TASK] Scan already running for channel {ch_id}, skipping")
            task_results.append({'channel_id': ch_id, 'status': 'already_running'})
            continue

        # Mark as running
        if r is not None:
            r.hset(scan_key, mapping={
                'status': 'running',
                'scanned': 0,
                'total': 0,
                'flagged': 0,
                'started_at': datetime.utcnow().isoformat(),
                'triggered_by': str(triggered_by or 'system'),
            })
            r.expire(scan_key, 3600)  # 1h TTL

        # Build progress callback — called by retroactive_scan() after each batch
        _r = r  # capture for closure
        _scan_key = scan_key
        _ch_id = ch_id

        def _make_progress_callback(r_ref, key_ref, ch_ref):
            def _cb(scanned, total, flagged):
                if r_ref is not None:
                    r_ref.hset(key_ref, mapping={
                        'scanned': scanned, 'total': total, 'flagged': flagged
                    })
                percent = int(scanned / total * 100) if total > 0 else 0
                try:
                    sio.emit('moderation_scan_progress', {
                        'community_id': community_id,
                        'channel_id': ch_ref,
                        'status': 'running',
                        'scanned': scanned,
                        'total': total,
                        'flagged': flagged,
                        'percent': percent,
                    }, room=f"community_{community_id}", namespace='/')
                except Exception as emit_err:
                    print(f"[RETRO_SCAN_TASK] Progress emit error: {emit_err}")
            return _cb

        progress_callback = _make_progress_callback(_r, _scan_key, _ch_id)

        agent = ModerationAgent()
        try:
            result = agent.retroactive_scan(
                channel_id=ch_id,
                community_id=community_id,
                hours_back=hours_back,
                batch_size=10,
                progress_callback=progress_callback,
            )

            # Mark as done
            if r is not None:
                r.hset(scan_key, mapping={
                    'status': 'done',
                    'scanned': result.get('scanned', 0),
                    'total': result.get('scanned', 0),
                    'flagged': result.get('flagged', 0),
                    'finished_at': datetime.utcnow().isoformat(),
                })
                r.expire(scan_key, 3600)  # reset TTL

            # Emit final progress event
            try:
                sio.emit('moderation_scan_progress', {
                    'community_id': community_id,
                    'channel_id': ch_id,
                    'status': 'done',
                    'scanned': result.get('scanned', 0),
                    'total': result.get('scanned', 0),
                    'flagged': result.get('flagged', 0),
                    'percent': 100,
                }, room=f"community_{community_id}", namespace='/')
            except Exception:
                pass  # non-critical

            task_results.append({'channel_id': ch_id, 'status': 'done', **result})
            print(
                f"[RETRO_SCAN_TASK] Channel {ch_id}: "
                f"scanned={result.get('scanned')}, "
                f"flagged={result.get('flagged')}, "
                f"errors={result.get('errors')}"
            )

        except Exception as e:
            print(f"[RETRO_SCAN_TASK] Error scanning channel {ch_id}: {e}")
            traceback.print_exc()
            if r is not None:
                r.hset(scan_key, mapping={
                    'status': 'error',
                    'error': str(e)[:200],
                    'finished_at': datetime.utcnow().isoformat(),
                })
                r.expire(scan_key, 3600)
            task_results.append({'channel_id': ch_id, 'status': 'error', 'error': str(e)})

    return {'channels': task_results}
