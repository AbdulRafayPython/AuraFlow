"""
Wellness Agent for AuraFlow
Promotes healthy communication habits and well-being
"""

import json
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from collections import Counter

from database import get_db_connection


class WellnessAgent:
    """
    Monitors user activity and promotes healthy habits
    Suggests breaks, positive communication, and work-life balance
    """
    
    def __init__(self):
        """Initialize the wellness agent"""
        self.max_continuous_hours = 3  # Alert after 3 hours continuous activity
        self.min_break_minutes = 15     # Suggest 15 min break
        self.max_messages_per_hour = 50 # Alert if exceeding
        
    def check_user_wellness(self, user_id: int) -> Dict[str, any]:
        """
        Check user's wellness metrics
        
        Args:
            user_id: User to check
            
        Returns:
            Wellness assessment with suggestions
        """
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
                
                # Check for excessive messaging
                if avg_per_hour > self.max_messages_per_hour:
                    concerns.append('high_activity')
                    suggestions.append({
                        'type': 'break',
                        'message': 'You\'ve been very active! Consider taking a short break. 🌟',
                        'priority': 'high'
                    })
                    wellness_level = 'attention_needed'
                
                # Check for continuous activity
                if active_duration >= self.max_continuous_hours and time_since_last < self.min_break_minutes:
                    concerns.append('continuous_activity')
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
                
                # Check stress indicators from messages
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
                output_data = {
                    'wellness_level': check_result['wellness_level'],
                    'concerns': check_result['concerns'],
                    'suggestions_count': len(check_result['suggestions']),
                    'metrics': check_result['metrics']
                }
                
                cur.execute("""
                    INSERT INTO ai_agent_logs 
                    (user_id, action_type, input_text, 
                     output_text, confidence_score)
                    VALUES (%s, %s, %s, %s, %s)
                """, (
                    user_id, 'wellness_check',
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

