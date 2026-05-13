"""
AuraFlow Agent Celery Tasks
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
    Batch Gemini moderation: drain the Redis buffer for a channel,
    send all messages to Gemini for contextual review, and emit
    retroactive moderation events for any flagged messages.
    """
    start = time.time()
    try:
        # Honour per-community moderation toggle. If the community admin has
        # disabled moderation for their community, drain & drop without calling Gemini.
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
        
        # Send batch to Gemini
        verdicts = agent.batch_gemini_review(messages)
        
        elapsed = time.time() - start
        
        # None = Gemini failure (timeout/503/error) → re-buffer for retry
        if verdicts is None:
            print(f"[BATCH_MOD] Gemini failed for channel {channel_id}, re-buffering {len(messages)} msgs for retry")
            for msg in messages:
                agent.push_to_buffer(channel_id, msg)
            _log_agent_action(
                'moderation', 'batch_review',
                {'channel_id': channel_id, 'message_count': len(messages)},
                {'result': 'gemini_failed_rebuffered'}, 'error', elapsed,
                community_id=community_id
            )
            return {'status': 'gemini_failed', 'channel_id': channel_id, 'rebuffered': len(messages)}
        
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
                    rm_cur.execute("SELECT name, logo_url, color, icon FROM communities WHERE id = %s", (community_id,))
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
                'removed_by': 'AuraFlow Moderation Agent',
                'violation_count': violation_count,
                'timestamp': datetime.utcnow().isoformat()
            }, room=room, namespace='/')
            
            sio.emit('community:removed', {
                'community_id': community_id, 'user_id': user_id,
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


# Legacy single-message Gemini review (kept for backward compat)
@celery_app.task(name='tasks.agent_tasks.gemini_review_task', bind=True, max_retries=1, rate_limit='30/m')
def gemini_review_task(self, text, message_id, user_id, channel_id, community_id,
                       username, keyword_scores, keyword_reasons):
    """Legacy single-message Gemini review. Use batch_moderation_task instead."""
    start = time.time()
    try:
        from agents.moderation import ModerationAgent
        agent = ModerationAgent()
        verdict = agent.gemini_review(
            text=text, message_id=message_id, user_id=user_id,
            channel_id=channel_id, keyword_scores=keyword_scores or {},
            keyword_reasons=keyword_reasons or []
        )
        elapsed = time.time() - start
        if verdict is None:
            return {'status': 'cleared', 'message_id': message_id}
        
        action = verdict['action']
        severity = verdict['severity']
        reasons = verdict['reasons']
        explanation = verdict.get('explanation', '')
        
        from flask_socketio import SocketIO as FlaskSocketIO
        REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
        sio = FlaskSocketIO(message_queue=REDIS_URL)
        room = f"channel_{channel_id}"
        
        _emit_moderation_event(
            sio, action, room, channel_id, community_id,
            message_id, user_id, username, severity, reasons,
            explanation, 0, f'@{username}, this message was flagged by AI review.'
        )
        
        return {'status': 'actioned', 'action': action, 'message_id': message_id}
    except Exception as e:
        print(f"[GEMINI_REVIEW] Error: {e}")
        raise self.retry(exc=e)


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
        result = agent.analyze_message(text)
        
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

@celery_app.task(name='tasks.agent_tasks.check_engagement_periodic')
def check_engagement_periodic():
    """
    Periodic: Check engagement for all communities with engagement agent installed.
    Runs every 30 minutes via Celery Beat.
    """
    conn = None
    processed = 0
    errors = 0
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get all communities with engagement agent enabled
            cur.execute("""
                SELECT ca.community_id, ca.settings
                FROM community_agents ca
                WHERE ca.agent_type = 'engagement' AND ca.enabled = TRUE
            """)
            communities = cur.fetchall()
        conn.close()
        conn = None
        
        from agents.engagement import EngagementAgent
        agent = EngagementAgent()
        
        for community in communities:
            try:
                community_id = community['community_id']
                settings = json.loads(community['settings']) if community['settings'] else {}
                hours = settings.get('check_hours', 24)
                
                # Get channels for this community
                c = get_db_connection()
                try:
                    with c.cursor() as cur:
                        cur.execute("""
                            SELECT id FROM channels WHERE community_id = %s
                        """, (community_id,))
                        channels = cur.fetchall()
                finally:
                    c.close()
                
                for channel in channels:
                    try:
                        result = agent.analyze_engagement(channel['id'], hours)
                        _increment_usage('community_agents', 'engagement', 'community_id', community_id)
                        processed += 1
                    except Exception as e:
                        print(f"[ENGAGEMENT_PERIODIC] Error for channel {channel['id']}: {e}")
                        errors += 1
                        
            except Exception as e:
                print(f"[ENGAGEMENT_PERIODIC] Error for community {community['community_id']}: {e}")
                errors += 1
        
        _log_agent_action(
            'engagement', 'periodic_check',
            {'type': 'periodic'},
            {'processed': processed, 'errors': errors},
            'success' if errors == 0 else 'partial',
            0
        )
        
        return {'processed': processed, 'errors': errors}
        
    except Exception as e:
        print(f"[ENGAGEMENT_PERIODIC] Fatal error: {e}")
        traceback.print_exc()
        return {'error': str(e)}
    finally:
        if conn:
            conn.close()


@celery_app.task(name='tasks.agent_tasks.check_wellness_periodic')
def check_wellness_periodic():
    """
    Periodic: Check wellness for all users with wellness agent activated.
    Runs every hour via Celery Beat.
    """
    conn = None
    processed = 0
    errors = 0
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get all users with wellness agent active
            cur.execute("""
                SELECT ua.user_id, ua.settings
                FROM user_agents ua
                WHERE ua.agent_type = 'wellness' AND ua.enabled = TRUE
            """)
            users = cur.fetchall()
        conn.close()
        conn = None
        
        from agents.wellness import WellnessAgent
        agent = WellnessAgent()
        
        for user in users:
            try:
                user_id = user['user_id']
                result = agent.check_user_wellness(user_id)
                _increment_usage('user_agents', 'wellness', 'user_id', user_id)
                processed += 1
            except Exception as e:
                print(f"[WELLNESS_PERIODIC] Error for user {user['user_id']}: {e}")
                errors += 1
        
        _log_agent_action(
            'wellness', 'periodic_check',
            {'type': 'periodic'},
            {'processed': processed, 'errors': errors},
            'success' if errors == 0 else 'partial',
            0
        )
        
        return {'processed': processed, 'errors': errors}
        
    except Exception as e:
        print(f"[WELLNESS_PERIODIC] Fatal error: {e}")
        traceback.print_exc()
        return {'error': str(e)}
    finally:
        if conn:
            conn.close()


@celery_app.task(name='tasks.agent_tasks.extract_knowledge_periodic')
def extract_knowledge_periodic():
    """
    Periodic: Extract knowledge from conversations for all communities with KB agent.
    Runs every 2 hours via Celery Beat.
    """
    conn = None
    processed = 0
    errors = 0
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT ca.community_id, ca.settings
                FROM community_agents ca
                WHERE ca.agent_type = 'knowledge' AND ca.enabled = TRUE
            """)
            communities = cur.fetchall()
        conn.close()
        conn = None
        
        from agents.knowledge_builder_v2 import KnowledgeBuilderAgent as KnowledgeBuilderV2
        agent = KnowledgeBuilderV2()
        
        for community in communities:
            try:
                community_id = community['community_id']
                settings = json.loads(community['settings']) if community['settings'] else {}
                hours = settings.get('extract_hours', 2)
                
                c = get_db_connection()
                try:
                    with c.cursor() as cur:
                        cur.execute("SELECT id FROM channels WHERE community_id = %s", (community_id,))
                        channels = cur.fetchall()
                finally:
                    c.close()
                
                for channel in channels:
                    try:
                        result = agent.extract_knowledge(channel['id'], hours)
                        _increment_usage('community_agents', 'knowledge', 'community_id', community_id)
                        processed += 1
                    except Exception as e:
                        print(f"[KB_PERIODIC] Error for channel {channel['id']}: {e}")
                        errors += 1
            except Exception as e:
                print(f"[KB_PERIODIC] Error for community {community['community_id']}: {e}")
                errors += 1
        
        _log_agent_action(
            'knowledge', 'periodic_extract',
            {'type': 'periodic'},
            {'processed': processed, 'errors': errors},
            'success' if errors == 0 else 'partial',
            0
        )
        
        return {'processed': processed, 'errors': errors}
        
    except Exception as e:
        print(f"[KB_PERIODIC] Fatal error: {e}")
        traceback.print_exc()
        return {'error': str(e)}
    finally:
        if conn:
            conn.close()


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
                INSERT INTO messages (channel_id, sender_id, content, message_type)
                VALUES (%s, %s, %s, 'ai')
            """, (channel_id, sender_id, content))
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


@celery_app.task(name='tasks.agent_tasks.auto_summarize_communities')
def auto_summarize_communities():
    """
    Periodic: Auto-summarize channels for communities with scheduled summarization.
    Runs every 30 minutes via Celery Beat. Checks each community's schedule_time setting
    and runs summarization if the current time matches (within ±15 min window).
    
    Settings used from community_agents.settings:
        - auto_summarize_enabled: bool (must be True)
        - schedule_time: str like "21:00" (24h format)
        - auto_summarize_message_count: int (default 200)
        - last_auto_summary_date: str "YYYY-MM-DD" (prevents double runs)
    """
    conn = None
    processed = 0
    errors = 0
    skipped = 0
    now = datetime.utcnow()
    today_str = now.strftime('%Y-%m-%d')

    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT ca.community_id, ca.settings, ca.installed_by
                FROM community_agents ca
                WHERE ca.agent_type = 'summarizer' AND ca.enabled = TRUE
            """)
            communities = cur.fetchall()
        conn.close()
        conn = None

        print(f"[AUTO_SUMMARIZE] Checking {len(communities)} communities at {now.strftime('%H:%M')} UTC")

        from agents.summarizer import SummarizerAgent
        agent = SummarizerAgent()

        for community in communities:
            try:
                community_id = community['community_id']
                sender_id = community['installed_by']
                settings = json.loads(community['settings']) if community['settings'] else {}

                # Check if auto-summarize is enabled
                if not settings.get('auto_summarize_enabled', False):
                    skipped += 1
                    continue

                schedule_time = settings.get('schedule_time', '')
                if not schedule_time:
                    skipped += 1
                    continue

                # Parse schedule_time (e.g., "21:00")
                try:
                    schedule_hour, schedule_minute = map(int, schedule_time.split(':'))
                except (ValueError, AttributeError):
                    print(f"[AUTO_SUMMARIZE] Invalid schedule_time '{schedule_time}' for community {community_id}")
                    skipped += 1
                    continue

                # Check if current time is within ±15 min of schedule_time
                scheduled_minutes = schedule_hour * 60 + schedule_minute
                current_minutes = now.hour * 60 + now.minute
                diff = abs(current_minutes - scheduled_minutes)
                # Handle midnight wraparound
                if diff > 720:
                    diff = 1440 - diff
                if diff > 15:
                    skipped += 1
                    continue

                # Check if already ran today (prevent double execution)
                last_date = settings.get('last_auto_summary_date', '')
                if last_date == today_str:
                    skipped += 1
                    continue

                print(f"[AUTO_SUMMARIZE] 🚀 Running auto-summarize for community {community_id}")

                # Get all text channels for this community
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

                message_count = settings.get('auto_summarize_message_count', 200)
                channel_count = 0

                for channel in channels:
                    try:
                        channel_id = channel['id']
                        channel_name = channel['name']

                        # Generate summary
                        result = agent.summarize_channel(channel_id, message_count, sender_id)

                        if result and result.get('success'):
                            # Format and post as bot message
                            bot_message = _format_summary_as_bot_message(result, channel_name)
                            _post_bot_message(channel_id, community_id, bot_message, sender_id)
                            channel_count += 1
                        else:
                            print(f"[AUTO_SUMMARIZE] Summary returned no results for channel {channel_id}")

                    except Exception as ch_err:
                        print(f"[AUTO_SUMMARIZE] Error for channel {channel['id']}: {ch_err}")
                        errors += 1

                # Update last_auto_summary_date in settings
                settings['last_auto_summary_date'] = today_str
                c2 = get_db_connection()
                try:
                    with c2.cursor() as cur:
                        cur.execute("""
                            UPDATE community_agents SET settings = %s
                            WHERE community_id = %s AND agent_type = 'summarizer'
                        """, (json.dumps(settings), community_id))
                        c2.commit()
                finally:
                    c2.close()

                _increment_usage('community_agents', 'summarizer', 'community_id', community_id)
                processed += 1
                print(f"[AUTO_SUMMARIZE] ✅ Community {community_id}: {channel_count} channels summarized")

            except Exception as e:
                print(f"[AUTO_SUMMARIZE] Error for community {community['community_id']}: {e}")
                traceback.print_exc()
                errors += 1

        _log_agent_action(
            'summarizer', 'auto_summarize_periodic',
            {'type': 'periodic', 'checked': len(communities)},
            {'processed': processed, 'skipped': skipped, 'errors': errors},
            'success' if errors == 0 else 'partial',
            0
        )

        print(f"[AUTO_SUMMARIZE] Done: {processed} processed, {skipped} skipped, {errors} errors")
        return {'processed': processed, 'skipped': skipped, 'errors': errors}

    except Exception as e:
        print(f"[AUTO_SUMMARIZE] Fatal error: {e}")
        traceback.print_exc()
        return {'error': str(e)}
    finally:
        if conn:
            conn.close()


# ======================================================================
# PER-USER SCHEDULED SUMMARY TASK
# ======================================================================

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
            cur.execute("""
                SELECT s.id, s.user_id, s.channel_id, s.community_id, s.timezone,
                       c.name AS channel_name
                FROM user_summary_schedules s
                JOIN channels c ON c.id = s.channel_id
                WHERE s.is_active = TRUE
                  AND TIME_FORMAT(s.schedule_time, '%%H:%%i') = %s
                  AND (s.last_triggered_at IS NULL OR DATE(s.last_triggered_at) < CURDATE())
            """, (current_time,))
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
                                link=f"/community/{schedule['community_id']}",
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
                                        'sender_name': 'AuraFlow',
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
# NEW — v2: RETROACTIVE MODERATION SCAN TASK
# ======================================================================

@celery_app.task(  # NEW — v2
    name='tasks.agent_tasks.retroactive_scan_task',  # NEW — v2
    bind=True,  # NEW — v2
    max_retries=0,  # NEW — v2
    rate_limit='2/m'  # NEW — v2
)  # NEW — v2
def retroactive_scan_task(self, channel_id, community_id, hours_back=48, triggered_by=None):  # NEW — v2
    """
    NEW — v2: Scan historical messages not yet reviewed by the moderation agent.
    channel_id=None scans ALL channels in the community sequentially.
    Emits moderation_scan_progress socket events to community_<id> room.
    Violations are emitted as moderation_retroactive (existing frontend handler).
    """
    from agents.moderation import ModerationAgent  # NEW — v2
    from services.redis_client import get_redis  # NEW — v2
    from flask_socketio import SocketIO as FlaskSocketIO  # NEW — v2

    REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')  # NEW — v2
    sio = FlaskSocketIO(message_queue=REDIS_URL)  # NEW — v2
    r = get_redis()  # NEW — v2

    # ── Resolve which channels to scan ───────────────────────────────────
    channels_to_scan = []  # NEW — v2
    if channel_id is None:  # NEW — v2
        conn = None  # NEW — v2
        try:  # NEW — v2
            conn = get_db_connection()  # NEW — v2
            with conn.cursor() as cur:  # NEW — v2
                cur.execute(  # NEW — v2
                    "SELECT id FROM channels WHERE community_id = %s",  # NEW — v2
                    (community_id,)  # NEW — v2
                )  # NEW — v2
                channels_to_scan = [row['id'] for row in cur.fetchall()]  # NEW — v2
        except Exception as e:  # NEW — v2
            print(f"[RETRO_SCAN_TASK] Failed to list channels for community {community_id}: {e}")  # NEW — v2
            return {'status': 'error', 'error': str(e)}  # NEW — v2
        finally:  # NEW — v2
            if conn:  # NEW — v2
                conn.close()  # NEW — v2
    else:  # NEW — v2
        channels_to_scan = [channel_id]  # NEW — v2

    task_results = []  # NEW — v2

    for ch_id in channels_to_scan:  # NEW — v2
        scan_key = f'mod:scan:{community_id}:{ch_id}'  # NEW — v2

        # Guard: one scan per channel at a time
        if r is not None and r.hget(scan_key, 'status') == b'running':  # NEW — v2
            print(f"[RETRO_SCAN_TASK] Scan already running for channel {ch_id}, skipping")  # NEW — v2
            task_results.append({'channel_id': ch_id, 'status': 'already_running'})  # NEW — v2
            continue  # NEW — v2

        # Mark as running
        if r is not None:  # NEW — v2
            r.hset(scan_key, mapping={  # NEW — v2
                'status': 'running',  # NEW — v2
                'scanned': 0,  # NEW — v2
                'total': 0,  # NEW — v2
                'flagged': 0,  # NEW — v2
                'started_at': datetime.utcnow().isoformat(),  # NEW — v2
                'triggered_by': str(triggered_by or 'system'),  # NEW — v2
            })  # NEW — v2
            r.expire(scan_key, 3600)  # 1h TTL  # NEW — v2

        # Build progress callback — called by retroactive_scan() after each batch
        _r = r  # capture for closure  # NEW — v2
        _scan_key = scan_key  # NEW — v2
        _ch_id = ch_id  # NEW — v2

        def _make_progress_callback(r_ref, key_ref, ch_ref):  # NEW — v2
            def _cb(scanned, total, flagged):  # NEW — v2
                if r_ref is not None:  # NEW — v2
                    r_ref.hset(key_ref, mapping={  # NEW — v2
                        'scanned': scanned, 'total': total, 'flagged': flagged  # NEW — v2
                    })  # NEW — v2
                percent = int(scanned / total * 100) if total > 0 else 0  # NEW — v2
                try:  # NEW — v2
                    sio.emit('moderation_scan_progress', {  # NEW — v2
                        'community_id': community_id,  # NEW — v2
                        'channel_id': ch_ref,  # NEW — v2
                        'status': 'running',  # NEW — v2
                        'scanned': scanned,  # NEW — v2
                        'total': total,  # NEW — v2
                        'flagged': flagged,  # NEW — v2
                        'percent': percent,  # NEW — v2
                    }, room=f"community_{community_id}", namespace='/')  # NEW — v2
                except Exception as emit_err:  # NEW — v2
                    print(f"[RETRO_SCAN_TASK] Progress emit error: {emit_err}")  # NEW — v2
            return _cb  # NEW — v2

        progress_callback = _make_progress_callback(_r, _scan_key, _ch_id)  # NEW — v2

        agent = ModerationAgent()  # NEW — v2
        try:  # NEW — v2
            result = agent.retroactive_scan(  # NEW — v2
                channel_id=ch_id,  # NEW — v2
                community_id=community_id,  # NEW — v2
                hours_back=hours_back,  # NEW — v2
                batch_size=10,  # NEW — v2
                progress_callback=progress_callback,  # NEW — v2
            )  # NEW — v2

            # Mark as done
            if r is not None:  # NEW — v2
                r.hset(scan_key, mapping={  # NEW — v2
                    'status': 'done',  # NEW — v2
                    'scanned': result.get('scanned', 0),  # NEW — v2
                    'total': result.get('scanned', 0),  # NEW — v2
                    'flagged': result.get('flagged', 0),  # NEW — v2
                    'finished_at': datetime.utcnow().isoformat(),  # NEW — v2
                })  # NEW — v2
                r.expire(scan_key, 3600)  # reset TTL  # NEW — v2

            # Emit final progress event
            try:  # NEW — v2
                sio.emit('moderation_scan_progress', {  # NEW — v2
                    'community_id': community_id,  # NEW — v2
                    'channel_id': ch_id,  # NEW — v2
                    'status': 'done',  # NEW — v2
                    'scanned': result.get('scanned', 0),  # NEW — v2
                    'total': result.get('scanned', 0),  # NEW — v2
                    'flagged': result.get('flagged', 0),  # NEW — v2
                    'percent': 100,  # NEW — v2
                }, room=f"community_{community_id}", namespace='/')  # NEW — v2
            except Exception:  # NEW — v2
                pass  # non-critical  # NEW — v2

            task_results.append({'channel_id': ch_id, 'status': 'done', **result})  # NEW — v2
            print(  # NEW — v2
                f"[RETRO_SCAN_TASK] Channel {ch_id}: "  # NEW — v2
                f"scanned={result.get('scanned')}, "  # NEW — v2
                f"flagged={result.get('flagged')}, "  # NEW — v2
                f"errors={result.get('errors')}"  # NEW — v2
            )  # NEW — v2

        except Exception as e:  # NEW — v2
            print(f"[RETRO_SCAN_TASK] Error scanning channel {ch_id}: {e}")  # NEW — v2
            traceback.print_exc()  # NEW — v2
            if r is not None:  # NEW — v2
                r.hset(scan_key, mapping={  # NEW — v2
                    'status': 'error',  # NEW — v2
                    'error': str(e)[:200],  # NEW — v2
                    'finished_at': datetime.utcnow().isoformat(),  # NEW — v2
                })  # NEW — v2
                r.expire(scan_key, 3600)  # NEW — v2
            task_results.append({'channel_id': ch_id, 'status': 'error', 'error': str(e)})  # NEW — v2

    return {'channels': task_results}  # NEW — v2
