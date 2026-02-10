"""
Focus Agent for AuraFlow
Helps users stay on topic and tracks conversation focus
"""

import json
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from collections import Counter
import re

from database import get_db_connection
from utils.ai.text_processor import TextProcessor


class FocusAgent:
    """
    Monitors conversation topics and helps users stay focused
    Detects topic drift and provides focus metrics
    """
    
    def __init__(self):
        """Initialize the focus agent"""
        self.text_processor = TextProcessor()
        self.min_messages_for_analysis = 5
        
    def analyze_focus(self, channel_id: int, time_period_hours: int = 1) -> Dict[str, any]:
        """
        Analyze conversation focus in a channel
        
        Args:
            channel_id: Channel to analyze
            time_period_hours: Time window for analysis
            
        Returns:
            Focus analysis results
        """
        conn = None
        try:
            print(f"[FOCUS] Starting analysis for channel {channel_id}, hours={time_period_hours}")
            conn = get_db_connection()
            with conn.cursor() as cur:
                # Get recent messages
                time_threshold = datetime.now() - timedelta(hours=time_period_hours)
                
                cur.execute("""
                    SELECT m.id, m.content, m.sender_id, m.created_at,
                           u.username
                    FROM messages m
                    JOIN users u ON m.sender_id = u.id
                    WHERE m.channel_id = %s 
                    AND m.created_at >= %s
                    AND m.message_type = 'text'
                    ORDER BY m.created_at ASC
                """, (channel_id, time_threshold))
                
                messages = cur.fetchall()
                
                print(f"[FOCUS] Found {len(messages)} messages in channel {channel_id}")
                
                if len(messages) < self.min_messages_for_analysis:
                    print(f"[FOCUS] Not enough messages: {len(messages)} < {self.min_messages_for_analysis}")
                    return {
                        'success': False,
                        'error': f'Need at least {self.min_messages_for_analysis} messages for analysis. Found {len(messages)} messages in the last {time_period_hours} hours.'
                    }
                
                # Extract topics from messages
                all_topics = []
                message_topics = []
                
                for msg in messages:
                    keywords = self.text_processor.extract_keywords(
                        msg['content'], 
                        top_n=5
                    )
                    all_topics.extend(keywords)
                    message_topics.append({
                        'id': msg['id'],
                        'topics': keywords,
                        'time': msg['created_at']
                    })
                
                # Calculate topic distribution
                topic_counts = Counter(all_topics)
                total_topics = len(all_topics)
                
                # Get dominant topics
                dominant_topics = topic_counts.most_common(5)
                
                # Calculate base focus score from topics
                focus_score = self._calculate_focus_score(topic_counts, total_topics)
                
                # Detect topic shifts
                topic_shifts = self._detect_topic_shifts(message_topics)
                num_shifts = len(topic_shifts)
                
                # BOOST score based on topic shifts (most important indicator!)
                # Few shifts = very focused conversation
                shift_ratio = num_shifts / len(messages) if len(messages) > 0 else 0
                if num_shifts <= 1:
                    focus_score = min(1.0, focus_score + 0.35)  # Big boost for 0-1 shifts
                elif num_shifts <= 3:
                    focus_score = min(1.0, focus_score + 0.20)  # Good boost for 2-3 shifts
                elif shift_ratio < 0.1:  # Less than 10% of messages are shifts
                    focus_score = min(1.0, focus_score + 0.10)
                
                print(f"[FOCUS] Final score after shift boost: {focus_score:.2f} (shifts={num_shifts})")
                
                # Calculate engagement level
                participant_count = len(set(msg['sender_id'] for msg in messages))
                messages_per_participant = len(messages) / participant_count if participant_count > 0 else 0
                
                # Determine focus level based on final score
                if focus_score >= 0.65:
                    focus_level = 'high'
                    recommendation = 'Great focus! The conversation is staying on topic.'
                elif focus_score >= 0.4:
                    focus_level = 'medium'
                    recommendation = 'Moderate focus. Some topic drift detected.'
                else:
                    focus_level = 'low'
                    recommendation = 'Low focus. Consider refocusing the conversation.'
                
                result = {
                    'success': True,
                    'focus_score': round(focus_score, 2),
                    'focus_level': focus_level,
                    'dominant_topics': [{'topic': t[0], 'count': t[1]} for t in dominant_topics],
                    'topic_shifts': topic_shifts,
                    'message_count': len(messages),
                    'participant_count': participant_count,
                    'messages_per_participant': round(messages_per_participant, 2),
                    'recommendation': recommendation,
                    'time_period_hours': time_period_hours
                }
                
                # Save focus analysis
                self._save_focus_analysis(channel_id, result)
                
                return result
                
        except Exception as e:
            print(f"[FOCUS] Error analyzing focus: {e}")
            return {
                'success': False,
                'error': str(e)
            }
        finally:
            if conn:
                conn.close()
    
    def _calculate_focus_score(self, topic_counts: Counter, total: int) -> float:
        """
        Calculate focus score based on topic distribution
        Higher score = more focused conversation
        
        Simple approach:
        - How much do top topics dominate?
        - Are there few unique topics (focused) or many (scattered)?
        """
        if total == 0 or len(topic_counts) == 0:
            return 0.5
        
        num_unique_topics = len(topic_counts)
        top_topics = topic_counts.most_common(5)
        
        if not top_topics:
            return 0.5
        
        # Top 5 topics total mentions
        top_5_count = sum(count for _, count in top_topics)
        
        # SIMPLE SCORING:
        # 1. What percentage of ALL mentions are in top 5 topics?
        dominance = top_5_count / total if total > 0 else 0
        
        # 2. How few unique topics are there? (fewer = more focused)
        # If only 5-10 unique topics, very focused
        # If 50+ unique topics, scattered
        if num_unique_topics <= 5:
            topic_focus = 1.0
        elif num_unique_topics <= 10:
            topic_focus = 0.85
        elif num_unique_topics <= 20:
            topic_focus = 0.7
        elif num_unique_topics <= 30:
            topic_focus = 0.5
        else:
            topic_focus = 0.3
        
        # Combined score: 60% dominance + 40% topic focus
        focus_score = (dominance * 0.6) + (topic_focus * 0.4)
        
        # Ensure minimum score of 0.3 if there are any repeated topics
        if top_topics[0][1] > 1:  # Most common topic appears more than once
            focus_score = max(0.3, focus_score)
        
        # Cap at 1.0
        focus_score = min(1.0, focus_score)
        
        print(f"[FOCUS] Score: dominance={dominance:.2f}, unique_topics={num_unique_topics}, topic_focus={topic_focus:.2f}, final={focus_score:.2f}")
        
        return focus_score
    
    def _detect_topic_shifts(self, message_topics: List[Dict]) -> List[Dict]:
        """Detect significant topic shifts in conversation"""
        shifts = []
        
        if len(message_topics) < 3:
            return shifts
        
        # Use sliding window to detect shifts
        window_size = 3
        
        for i in range(len(message_topics) - window_size):
            window1_topics = set()
            window2_topics = set()
            
            # Get topics from two consecutive windows
            for j in range(window_size):
                window1_topics.update(message_topics[i + j]['topics'])
                window2_topics.update(message_topics[i + j + 1]['topics'])
            
            # Calculate topic overlap
            if window1_topics and window2_topics:
                overlap = len(window1_topics & window2_topics) / len(window1_topics | window2_topics)
                
                # If overlap is low, it's a topic shift
                if overlap < 0.3:
                    shifts.append({
                        'message_id': message_topics[i + window_size]['id'],
                        'time': message_topics[i + window_size]['time'].isoformat(),
                        'previous_topics': list(window1_topics),
                        'new_topics': list(window2_topics - window1_topics)
                    })
        
        return shifts
    
    def _save_focus_analysis(self, channel_id: int, analysis: Dict):
        """Save focus analysis to database"""
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                # Get or create the focus agent ID
                cur.execute("""
                    SELECT id FROM ai_agents WHERE type = 'focus' LIMIT 1
                """)
                agent_row = cur.fetchone()
                
                if not agent_row:
                    # Create focus agent if it doesn't exist
                    cur.execute("""
                        INSERT INTO ai_agents (name, type, description, is_active)
                        VALUES ('Focus Agent', 'focus', 
                                'AI-powered conversation focus analysis', TRUE)
                    """)
                    agent_id = cur.lastrowid
                else:
                    agent_id = agent_row['id']
                
                output_data = {
                    'focus_score': analysis['focus_score'],
                    'focus_level': analysis['focus_level'],
                    'dominant_topics': analysis['dominant_topics'],
                    'topic_shifts': len(analysis['topic_shifts']),
                    'message_count': analysis['message_count']
                }
                
                cur.execute("""
                    INSERT INTO ai_agent_logs 
                    (agent_id, channel_id, action_type, input_text, 
                     output_text, confidence_score)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (
                    agent_id, channel_id, 'focus_analysis',
                    f"Analyzed {analysis['message_count']} messages",
                    json.dumps(output_data),
                    analysis['focus_score']
                ))
                
                conn.commit()
        except Exception as e:
            print(f"[FOCUS] Error saving analysis: {e}")
        finally:
            if conn:
                conn.close()
    
    def get_focus_history(self, channel_id: int, limit: int = 10) -> List[Dict]:
        """Get focus analysis history for a channel"""
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        id, output_text, confidence_score, created_at
                    FROM ai_agent_logs
                    WHERE channel_id = %s AND action_type = 'focus_analysis'
                    ORDER BY created_at DESC
                    LIMIT %s
                """, (channel_id, limit))
                
                logs = cur.fetchall()
                
                return [{
                    'id': log['id'],
                    'analysis': json.loads(log['output_text']) if log['output_text'] else {},
                    'focus_score': round(log['confidence_score'], 2) if log['confidence_score'] else 0,
                    'created_at': log['created_at'].isoformat() if log['created_at'] else None
                } for log in logs]
                
        except Exception as e:
            print(f"[FOCUS] Error fetching history: {e}")
            return []
        finally:
            if conn:
                conn.close()
    
    def suggest_refocus(self, channel_id: int, current_focus: Dict) -> Dict[str, any]:
        """
        Suggest ways to refocus conversation
        
        Args:
            channel_id: Channel ID
            current_focus: Current focus analysis
            
        Returns:
            Refocus suggestions
        """
        suggestions = []
        
        if current_focus.get('focus_level') == 'low':
            # Get dominant topics
            dominant_topics = current_focus.get('dominant_topics', [])
            if dominant_topics:
                top_topic = dominant_topics[0]['topic']
                suggestions.append(
                    f"Try steering the conversation back to '{top_topic}'"
                )
            
            # Check for too many topic shifts
            shifts = current_focus.get('topic_shifts', [])
            if len(shifts) > 3:
                suggestions.append(
                    "Multiple topic changes detected. Consider summarizing and choosing one direction."
                )
            
            # Check engagement
            msg_per_participant = current_focus.get('messages_per_participant', 0)
            if msg_per_participant < 2:
                suggestions.append(
                    "Low engagement per participant. Encourage more focused discussion."
                )
        
        elif current_focus.get('focus_level') == 'medium':
            suggestions.append(
                "Focus is moderate. Stay on current topics to maintain clarity."
            )
        
        return {
            'success': True,
            'suggestions': suggestions,
            'current_focus_level': current_focus.get('focus_level'),
            'current_score': current_focus.get('focus_score')
        }

