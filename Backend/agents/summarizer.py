"""
Summarizer Agent
================
Intelligent chat summarization using extractive methods
Supports both English and Roman Urdu conversations
"""

import re
from typing import List, Dict, Optional, Tuple
from datetime import datetime
import math
from collections import Counter

from database import get_db_connection
from utils.ai.text_processor import TextProcessor


class SummarizerAgent:
    """
    Summarize long chat conversations into concise summaries
    Uses extractive summarization with sentence scoring
    """
    
    def __init__(self):
        self.text_processor = TextProcessor()
        self.min_messages_for_summary = 10  # Minimum messages to trigger summary (reduced for testing)
        self.max_summary_sentences = 10     # Maximum sentences in summary
        
    def summarize_channel(self, channel_id: int, message_count: int = 100, 
                         user_id: Optional[int] = None) -> Dict:
        """
        Summarize recent messages in a channel
        
        Args:
            channel_id: Channel ID to summarize
            message_count: Number of recent messages to analyze
            user_id: User requesting the summary (for logging)
            
        Returns:
            Dict with summary and metadata
        """
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                # Fetch recent messages
                cur.execute("""
                    SELECT 
                        m.id, m.content, m.sender_id, m.created_at,
                        u.username, u.display_name
                    FROM messages m
                    JOIN users u ON m.sender_id = u.id
                    WHERE m.channel_id = %s 
                      AND m.message_type = 'text'
                      AND LENGTH(m.content) > 3
                    ORDER BY m.created_at DESC
                    LIMIT %s
                """, (channel_id, message_count))
                
                messages = cur.fetchall()
                
                print(f"[SUMMARIZER] Fetched {len(messages)} messages from database")
                
                if len(messages) < self.min_messages_for_summary:
                    return {
                        'success': False,
                        'error': f'Not enough messages to summarize (minimum {self.min_messages_for_summary})',
                        'message_count': len(messages)
                    }
                
                # Reverse to chronological order
                messages = list(reversed(messages))
                
                # Generate summary
                summary_result = self._generate_summary(messages)
                
                print(f"[SUMMARIZER] Generated summary with {len(summary_result['key_points'])} key points")
                
                # Save summary to database
                summary_id = self._save_summary(
                    channel_id=channel_id,
                    summary_text=summary_result['summary'],
                    message_count=len(messages),
                    start_message_id=messages[0]['id'],
                    end_message_id=messages[-1]['id'],
                    created_by=user_id
                )
                
                # Log agent activity
                self._log_activity(
                    channel_id=channel_id,
                    user_id=user_id,
                    input_data=f"Analyzed {len(messages)} messages",
                    output_data=summary_result['summary'][:500],
                    status='success'
                )
                
                return {
                    'success': True,
                    'summary_id': summary_id,
                    'summary': summary_result['summary'],
                    'key_points': summary_result['key_points'],
                    'message_count': len(messages),
                    'participants': summary_result['participants'],
                    'time_range': {
                        'start': messages[0]['created_at'].isoformat(),
                        'end': messages[-1]['created_at'].isoformat()
                    }
                }
                
        except Exception as e:
            print(f"[SUMMARIZER] Error: {e}")
            self._log_activity(
                channel_id=channel_id,
                user_id=user_id,
                input_data=f"Attempted to summarize {message_count} messages",
                output_data=None,
                status='failed',
                error_message=str(e)
            )
            return {
                'success': False,
                'error': str(e)
            }
        finally:
            if conn:
                conn.close()
    
    def _generate_summary(self, messages: List[Dict]) -> Dict:
        """
        Generate summary using extractive method
        
        Args:
            messages: List of message dictionaries
            
        Returns:
            Dict with summary, key points, and metadata
        """
        # Extract text from messages
        texts = []
        participants = set()
        
        for msg in messages:
            cleaned = self.text_processor.clean_text(
                msg['content'],
                remove_urls=False,  # Keep URLs for context
                remove_mentions=False,
                remove_emojis=True
            )
            
            if len(cleaned) > 10:  # Filter very short messages (reduced from 15)
                texts.append({
                    'text': cleaned,
                    'original': msg['content'],
                    'author': msg['display_name'] or msg['username'],
                    'timestamp': msg['created_at']
                })
                participants.add(msg['display_name'] or msg['username'])
        
        if not texts:
            return {
                'summary': 'No significant content to summarize.',
                'key_points': [],
                'participants': list(participants)
            }
        
        # Score sentences
        scored_sentences = self._score_sentences(texts)
        
        # Select top sentences for summary
        num_sentences = min(self.max_summary_sentences, max(3, len(texts) // 10))
        top_sentences = scored_sentences[:num_sentences]
        
        # Sort by original order (chronological)
        top_sentences.sort(key=lambda x: x['index'])
        
        # Build summary
        summary_parts = []
        for item in top_sentences:
            author = item['author']
            text = item['text']
            summary_parts.append(f"• {author}: {text}")
        
        summary = '\n'.join(summary_parts)
        
        # Extract key points (most frequent topics)
        all_text = ' '.join([t['text'] for t in texts])
        key_points = self.text_processor.extract_keywords(all_text, top_n=5)
        
        return {
            'summary': summary,
            'key_points': key_points,
            'participants': list(participants)
        }
    
    def _score_sentences(self, texts: List[Dict]) -> List[Dict]:
        """
        Score sentences based on various features
        
        Args:
            texts: List of text dictionaries
            
        Returns:
            Sorted list of scored sentences
        """
        # Build word frequency
        all_words = []
        for item in texts:
            words = item['text'].lower().split()
            all_words.extend(words)
        
        word_freq = Counter(all_words)
        
        # Score each sentence
        scored = []
        for idx, item in enumerate(texts):
            text = item['text']
            words = text.lower().split()
            
            if not words:
                continue
            
            # Calculate features
            # 1. Word frequency score
            freq_score = sum(word_freq.get(w, 0) for w in words) / len(words)
            
            # 2. Length score (prefer medium-length sentences)
            length_score = self._length_score(len(words))
            
            # 3. Position score (slight preference for earlier messages)
            position_score = 1.0 - (idx / len(texts)) * 0.2
            
            # 4. Question/important markers
            importance_score = self._importance_score(text)
            
            # Combined score
            total_score = (
                freq_score * 0.4 +
                length_score * 0.2 +
                position_score * 0.2 +
                importance_score * 0.2
            )
            
            scored.append({
                'text': text,
                'author': item['author'],
                'score': total_score,
                'index': idx
            })
        
        # Sort by score
        scored.sort(key=lambda x: x['score'], reverse=True)
        
        return scored
    
    def _length_score(self, word_count: int) -> float:
        """
        Score based on sentence length (Gaussian curve)
        Prefer medium-length sentences (15-30 words)
        """
        optimal_length = 20
        if word_count < 5:
            return 0.3
        
        # Gaussian-like scoring
        score = math.exp(-((word_count - optimal_length) ** 2) / (2 * 100))
        return max(0.3, min(1.0, score))
    
    def _importance_score(self, text: str) -> float:
        """
        Score based on importance markers
        """
        score = 0.5  # Base score
        
        # Question marks indicate important discussions
        if '?' in text:
            score += 0.3
        
        # Exclamation marks indicate emphasis
        if '!' in text:
            score += 0.2
        
        # Important keywords
        important_keywords = [
            'important', 'urgent', 'decided', 'agreed', 'meeting',
            'deadline', 'issue', 'problem', 'solution', 'update',
            'zaruri', 'important', 'faisla', 'meeting'  # Roman Urdu
        ]
        
        text_lower = text.lower()
        for keyword in important_keywords:
            if keyword in text_lower:
                score += 0.2
                break
        
        return min(1.0, score)
    
    def _save_summary(self, channel_id: int, summary_text: str, 
                     message_count: int, start_message_id: int,
                     end_message_id: int, created_by: Optional[int]) -> int:
        """Save summary to database"""
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                # Use actual schema: summary, generated_by (not summary_text, created_by)
                generated_by = 'summarizer_agent'
                if created_by:
                    cur.execute("SELECT username FROM users WHERE id = %s", (created_by,))
                    user = cur.fetchone()
                    if user:
                        generated_by = user['username']
                
                cur.execute("""
                    INSERT INTO conversation_summaries 
                    (channel_id, summary, generated_by)
                    VALUES (%s, %s, %s)
                """, (channel_id, summary_text, generated_by))
                
                conn.commit()
                return cur.lastrowid
        finally:
            if conn:
                conn.close()
    
    def _log_activity(self, channel_id: Optional[int], user_id: Optional[int],
                     input_data: str, output_data: Optional[str],
                     status: str, error_message: Optional[str] = None):
        """Log agent activity"""
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                # Use actual schema: action_type, input_text, output_text
                cur.execute("""
                    INSERT INTO ai_agent_logs 
                    (action_type, channel_id, user_id, 
                     input_text, output_text)
                    VALUES (%s, %s, %s, %s, %s)
                """, ('summarize_channel', channel_id, user_id,
                      input_data, output_data))
                
                conn.commit()
        except Exception as e:
            print(f"[SUMMARIZER] Failed to log activity: {e}")
        finally:
            if conn:
                conn.close()
    
    def get_recent_summaries(self, channel_id: int, limit: int = 5) -> List[Dict]:
        """
        Get recent summaries for a channel
        
        Args:
            channel_id: Channel ID
            limit: Maximum number of summaries to return
            
        Returns:
            List of summary dictionaries
        """
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        cs.id, cs.summary, cs.generated_by,
                        cs.created_at
                    FROM conversation_summaries cs
                    WHERE cs.channel_id = %s
                    ORDER BY cs.created_at DESC
                    LIMIT %s
                """, (channel_id, limit))
                
                summaries = cur.fetchall()
                
                return [{
                    'id': s['id'],
                    'summary': s['summary'],
                    'created_at': s['created_at'].isoformat() if s['created_at'] else None,
                    'created_by': s['generated_by']
                } for s in summaries]
                
        except Exception as e:
            print(f"[SUMMARIZER] Error fetching summaries: {e}")
            return []
        finally:
            if conn:
                conn.close()
