"""
Engagement Agent for AuraFlow
Boosts conversation engagement with smart suggestions
"""

import json
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from collections import Counter
import random

from database import get_db_connection


class EngagementAgent:
    """
    Analyzes conversation patterns and suggests engagement boosters
    Provides conversation starters and topic suggestions
    """
    
    def __init__(self):
        """Initialize the engagement agent"""
        self.min_silence_minutes = 5
        self.conversation_starters = self._load_conversation_starters()
        
    def _load_conversation_starters(self) -> Dict[str, List[str]]:
        """Load conversation starter templates"""
        return {
            'general': [
                "What's everyone working on today?",
                "Anyone have interesting plans for the weekend?",
                "What's the best thing that happened to you this week?",
                "If you could learn any skill instantly, what would it be?",
                "What's a topic you could talk about for hours?"
            ],
            'tech': [
                "What's your favorite programming language and why?",
                "Anyone working on an interesting project?",
                "What's the coolest tech you've learned recently?",
                "What's your go-to development tool?",
                "Share a coding tip that improved your productivity"
            ],
            'casual': [
                "What's everyone up to today? 😊",
                "Kya chal raha hai yaar? (What's going on?)",
                "Anyone up for a quick chat?",
                "What's making you happy today?",
                "Share something that made you smile recently"
            ],
            'icebreaker': [
                "Two truths and a lie - go!",
                "What's your unpopular opinion?",
                "Describe yourself in 3 emojis",
                "What's a skill you wish you had?",
                "Coffee or tea? ☕"
            ]
        }
    
    def analyze_engagement(self, channel_id: int, 
                          time_period_hours: int = 6) -> Dict[str, any]:
        """
        Analyze channel engagement levels
        
        Args:
            channel_id: Channel to analyze
            time_period_hours: Time window for analysis
            
        Returns:
            Engagement analysis with suggestions
        """
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                time_threshold = datetime.now() - timedelta(hours=time_period_hours)
                
                # Get message statistics
                cur.execute("""
                    SELECT 
                        COUNT(*) as message_count,
                        COUNT(DISTINCT sender_id) as participant_count,
                        MIN(created_at) as first_message,
                        MAX(created_at) as last_message
                    FROM messages
                    WHERE channel_id = %s 
                    AND created_at >= %s
                    AND message_type = 'text'
                """, (channel_id, time_threshold))
                
                stats = cur.fetchone()
                
                if not stats or stats['message_count'] == 0:
                    return {
                        'success': True,
                        'engagement_level': 'inactive',
                        'message_count': 0,
                        'suggestion': self._suggest_conversation_starter('general'),
                        'reason': 'No recent activity detected'
                    }
                
                # Calculate metrics
                message_count = stats['message_count']
                participant_count = stats['participant_count']
                
                # Calculate time since last message
                last_message_time = stats['last_message']
                silence_minutes = (datetime.now() - last_message_time).total_seconds() / 60
                
                # Get message distribution by user
                cur.execute("""
                    SELECT sender_id, COUNT(*) as count
                    FROM messages
                    WHERE channel_id = %s 
                    AND created_at >= %s
                    AND message_type = 'text'
                    GROUP BY sender_id
                    ORDER BY count DESC
                """, (channel_id, time_threshold))
                
                user_distribution = cur.fetchall()
                
                # Calculate engagement metrics
                avg_messages_per_user = message_count / participant_count if participant_count > 0 else 0
                
                # Check for balanced participation
                if user_distribution:
                    max_messages = user_distribution[0]['count']
                    participation_balance = (message_count / participant_count) / max_messages if max_messages > 0 else 0
                else:
                    participation_balance = 0
                
                # Determine engagement level
                engagement_score = self._calculate_engagement_score(
                    message_count, participant_count, 
                    silence_minutes, participation_balance,
                    time_period_hours
                )
                
                if engagement_score >= 0.7:
                    engagement_level = 'high'
                    suggestion_type = None
                elif engagement_score >= 0.4:
                    engagement_level = 'medium'
                    suggestion_type = 'boost'
                else:
                    engagement_level = 'low'
                    suggestion_type = 'revive'
                
                # Generate suggestions
                suggestions = self._generate_suggestions(
                    engagement_level, silence_minutes,
                    participant_count, suggestion_type
                )
                
                result = {
                    'success': True,
                    'engagement_level': engagement_level,
                    'engagement_score': round(engagement_score, 2),
                    'message_count': message_count,
                    'participant_count': participant_count,
                    'avg_messages_per_user': round(avg_messages_per_user, 2),
                    'silence_minutes': round(silence_minutes, 2),
                    'participation_balance': round(participation_balance, 2),
                    'suggestions': suggestions,
                    'time_period_hours': time_period_hours
                }
                
                # Log engagement analysis
                self._log_engagement_analysis(channel_id, result)
                
                return result
                
        except Exception as e:
            print(f"[ENGAGEMENT] Error analyzing engagement: {e}")
            return {
                'success': False,
                'error': str(e)
            }
        finally:
            if conn:
                conn.close()
    
    def _calculate_engagement_score(self, message_count: int, 
                                    participant_count: int,
                                    silence_minutes: float,
                                    participation_balance: float,
                                    time_period_hours: int) -> float:
        """Calculate overall engagement score"""
        
        # Message frequency score (messages per hour)
        msg_per_hour = message_count / time_period_hours if time_period_hours > 0 else 0
        frequency_score = min(msg_per_hour / 10, 1.0)  # Normalize to max 10 msg/hour = 1.0
        
        # Recency score (how recent was last message)
        if silence_minutes < 5:
            recency_score = 1.0
        elif silence_minutes < 30:
            recency_score = 0.7
        elif silence_minutes < 60:
            recency_score = 0.4
        else:
            recency_score = 0.1
        
        # Participation score (how many people are active)
        participation_score = min(participant_count / 5, 1.0)  # Normalize to 5+ users = 1.0
        
        # Balance score (how evenly distributed are messages)
        balance_score = participation_balance
        
        # Weighted combination
        engagement_score = (
            frequency_score * 0.3 +
            recency_score * 0.3 +
            participation_score * 0.2 +
            balance_score * 0.2
        )
        
        return engagement_score
    
    def _generate_suggestions(self, engagement_level: str, 
                             silence_minutes: float,
                             participant_count: int,
                             suggestion_type: Optional[str]) -> List[Dict]:
        """Generate engagement suggestions"""
        suggestions = []
        
        if engagement_level == 'low':
            if silence_minutes > 30:
                suggestions.append({
                    'type': 'conversation_starter',
                    'message': self._suggest_conversation_starter('general'),
                    'reason': f'Channel has been quiet for {int(silence_minutes)} minutes'
                })
            
            if participant_count < 3:
                suggestions.append({
                    'type': 'invite',
                    'message': 'Consider inviting more people to join the conversation',
                    'reason': 'Low participant count'
                })
            
            suggestions.append({
                'type': 'icebreaker',
                'message': self._suggest_conversation_starter('icebreaker'),
                'reason': 'Break the ice and get people talking'
            })
        
        elif engagement_level == 'medium':
            if silence_minutes > 10:
                suggestions.append({
                    'type': 'prompt',
                    'message': self._suggest_conversation_starter('casual'),
                    'reason': 'Keep the momentum going'
                })
            
            suggestions.append({
                'type': 'topic',
                'message': 'Try introducing a new but related topic',
                'reason': 'Maintain interest with variety'
            })
        
        else:  # high engagement
            suggestions.append({
                'type': 'appreciation',
                'message': 'Great conversation! Keep it going! 🎉',
                'reason': 'High engagement detected'
            })
        
        return suggestions
    
    def _suggest_conversation_starter(self, category: str = 'general') -> str:
        """Get a random conversation starter from category"""
        starters = self.conversation_starters.get(category, self.conversation_starters['general'])
        return random.choice(starters)
    
    def _log_engagement_analysis(self, channel_id: int, analysis: Dict):
        """Log engagement analysis to database"""
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                output_data = {
                    'engagement_level': analysis['engagement_level'],
                    'engagement_score': analysis['engagement_score'],
                    'message_count': analysis['message_count'],
                    'participant_count': analysis['participant_count'],
                    'suggestions': len(analysis['suggestions'])
                }
                
                cur.execute("""
                    INSERT INTO ai_agent_logs 
                    (channel_id, action_type, input_text, 
                     output_text, confidence_score)
                    VALUES (%s, %s, %s, %s, %s)
                """, (
                    channel_id, 'engagement_analysis',
                    f"Analyzed {analysis['message_count']} messages",
                    json.dumps(output_data),
                    analysis['engagement_score']
                ))
                
                conn.commit()
        except Exception as e:
            print(f"[ENGAGEMENT] Error logging analysis: {e}")
        finally:
            if conn:
                conn.close()
    
    def get_engagement_history(self, channel_id: int, 
                               limit: int = 10) -> List[Dict]:
        """Get engagement analysis history"""
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        id, output_text, confidence_score, created_at
                    FROM ai_agent_logs
                    WHERE channel_id = %s 
                    AND action_type = 'engagement_analysis'
                    ORDER BY created_at DESC
                    LIMIT %s
                """, (channel_id, limit))
                
                logs = cur.fetchall()
                
                return [{
                    'id': log['id'],
                    'analysis': json.loads(log['output_text']) if log['output_text'] else {},
                    'engagement_score': round(log['confidence_score'], 2) if log['confidence_score'] else 0,
                    'created_at': log['created_at'].isoformat() if log['created_at'] else None
                } for log in logs]
                
        except Exception as e:
            print(f"[ENGAGEMENT] Error fetching history: {e}")
            return []
        finally:
            if conn:
                conn.close()

