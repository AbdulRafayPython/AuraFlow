"""
Mood Tracking Agent for AuraFlow
Analyzes user messages to detect emotional states with Roman Urdu support
"""

import json
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from collections import Counter
import re

from database import get_db_connection


class MoodTrackerAgent:
    """
    Tracks user mood and emotional state based on message content
    Supports Roman Urdu and emoji analysis
    """
    
    def __init__(self):
        """Initialize the mood tracker with lexicons"""
        self.lexicon_path = os.path.join(
            os.path.dirname(__file__), 
            '..', 'lexicons', 'roman_urdu_sentiments.json'
        )
        self.load_lexicons()
        
    def load_lexicons(self):
        """Load sentiment lexicons from JSON file"""
        try:
            with open(self.lexicon_path, 'r', encoding='utf-8') as f:
                self.lexicon = json.load(f)
            print("[MOOD TRACKER] Lexicons loaded successfully")
        except Exception as e:
            print(f"[MOOD TRACKER] Error loading lexicons: {e}")
            self.lexicon = {}
    
    def analyze_message(self, text: str) -> Dict[str, any]:
        """
        Analyze a single message for sentiment
        
        Args:
            text: Message text (can be English, Roman Urdu, or mixed)
            
        Returns:
            Dictionary with sentiment analysis results
        """
        text_lower = text.lower()
        
        # Extract emojis
        emoji_sentiment = self._analyze_emojis(text)
        
        # Count sentiment words
        positive_count = 0
        negative_count = 0
        neutral_count = 0
        
        # Check positive words
        for category, words in self.lexicon.get('positive', {}).items():
            for word in words:
                if word.lower() in text_lower:
                    positive_count += 1
        
        # Check negative words
        for category, words in self.lexicon.get('negative', {}).items():
            for word in words:
                if word.lower() in text_lower:
                    negative_count += 1
        
        # Check neutral words (questions, greetings)
        for category, words in self.lexicon.get('neutral', {}).items():
            for word in words:
                if word.lower() in text_lower:
                    neutral_count += 1
        
        # Check for intensifiers
        intensifier_boost = self._check_intensifiers(text_lower)
        
        # Calculate sentiment scores
        total_words = positive_count + negative_count + neutral_count
        if total_words == 0:
            sentiment = 'neutral'
            confidence = 0.5
        else:
            positive_score = (positive_count + emoji_sentiment['positive']) * intensifier_boost['positive']
            negative_score = (negative_count + emoji_sentiment['negative']) * intensifier_boost['negative']
            
            if positive_score > negative_score:
                sentiment = 'positive'
                confidence = min(positive_score / (positive_score + negative_score + 1), 0.95)
            elif negative_score > positive_score:
                sentiment = 'negative'
                confidence = min(negative_score / (positive_score + negative_score + 1), 0.95)
            else:
                sentiment = 'neutral'
                confidence = 0.5
        
        return {
            'sentiment': sentiment,
            'confidence': round(confidence, 2),
            'positive_count': positive_count,
            'negative_count': negative_count,
            'emoji_sentiment': emoji_sentiment,
            'has_intensifier': intensifier_boost['positive'] > 1 or intensifier_boost['negative'] > 1
        }
    
    def _analyze_emojis(self, text: str) -> Dict[str, int]:
        """Analyze emojis in text"""
        emoji_counts = {'positive': 0, 'negative': 0, 'neutral': 0}
        
        for emoji in self.lexicon.get('emojis', {}).get('positive', []):
            emoji_counts['positive'] += text.count(emoji)
        
        for emoji in self.lexicon.get('emojis', {}).get('negative', []):
            emoji_counts['negative'] += text.count(emoji)
        
        for emoji in self.lexicon.get('emojis', {}).get('neutral', []):
            emoji_counts['neutral'] += text.count(emoji)
        
        return emoji_counts
    
    def _check_intensifiers(self, text: str) -> Dict[str, float]:
        """Check for intensifier words that boost sentiment"""
        boost = {'positive': 1.0, 'negative': 1.0}
        
        # Check positive intensifiers
        for word in self.lexicon.get('intensifiers', {}).get('positive', []):
            if word.lower() in text:
                boost['positive'] = 1.5
                break
        
        # Check negative intensifiers
        for word in self.lexicon.get('intensifiers', {}).get('negative', []):
            if word.lower() in text:
                boost['negative'] = 1.5
                break
        
        return boost
    
    def track_user_mood(self, user_id: int, time_period_hours: int = 24) -> Dict[str, any]:
        """
        Track a user's mood over a time period
        
        Args:
            user_id: User ID to track
            time_period_hours: Hours to look back (default: 24)
            
        Returns:
            Mood analysis with trends and insights
        """
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                # Get user's recent messages
                time_threshold = datetime.now() - timedelta(hours=time_period_hours)
                
                cur.execute("""
                    SELECT m.content, m.created_at, c.name as channel_name
                    FROM messages m
                    LEFT JOIN channels c ON m.channel_id = c.id
                    WHERE m.sender_id = %s AND m.created_at >= %s
                    ORDER BY m.created_at DESC
                    LIMIT 100
                """, (user_id, time_threshold))
                
                messages = cur.fetchall()
                
                if not messages:
                    return {
                        'success': False,
                        'error': 'No messages found in time period'
                    }
                
                # Analyze all messages
                sentiments = []
                hourly_sentiment = {}
                
                for msg in messages:
                    analysis = self.analyze_message(msg['content'])
                    sentiments.append(analysis)
                    
                    # Group by hour
                    hour_key = msg['created_at'].strftime('%Y-%m-%d %H:00')
                    if hour_key not in hourly_sentiment:
                        hourly_sentiment[hour_key] = []
                    hourly_sentiment[hour_key].append(analysis['sentiment'])
                
                # Calculate overall mood
                sentiment_counts = Counter([s['sentiment'] for s in sentiments])
                total = len(sentiments)
                
                overall_mood = max(sentiment_counts, key=sentiment_counts.get)
                mood_confidence = sentiment_counts[overall_mood] / total
                
                # Calculate mood trend
                trend = self._calculate_trend(hourly_sentiment)
                
                # Get dominant emotions
                emotions = self._get_dominant_emotions(messages)
                
                # Save mood analysis
                mood_id = self._save_mood_analysis(
                    user_id, overall_mood, mood_confidence,
                    sentiment_counts, trend, time_period_hours
                )
                
                return {
                    'success': True,
                    'mood_id': mood_id,
                    'overall_mood': overall_mood,
                    'confidence': round(mood_confidence, 2),
                    'message_count': total,
                    'sentiment_distribution': {
                        'positive': sentiment_counts.get('positive', 0),
                        'negative': sentiment_counts.get('negative', 0),
                        'neutral': sentiment_counts.get('neutral', 0)
                    },
                    'trend': trend,
                    'dominant_emotions': emotions,
                    'time_period_hours': time_period_hours
                }
                
        except Exception as e:
            print(f"[MOOD TRACKER] Error tracking mood: {e}")
            return {
                'success': False,
                'error': str(e)
            }
        finally:
            if conn:
                conn.close()
    
    def _calculate_trend(self, hourly_sentiment: Dict[str, List[str]]) -> str:
        """Calculate mood trend over time"""
        if len(hourly_sentiment) < 2:
            return 'stable'
        
        # Sort by time
        sorted_hours = sorted(hourly_sentiment.keys())
        
        # Get sentiment scores for each hour
        hour_scores = []
        for hour in sorted_hours:
            sentiments = hourly_sentiment[hour]
            positive = sentiments.count('positive')
            negative = sentiments.count('negative')
            score = (positive - negative) / len(sentiments)
            hour_scores.append(score)
        
        # Calculate trend
        if len(hour_scores) < 3:
            return 'stable'
        
        # Simple linear trend
        recent_avg = sum(hour_scores[-3:]) / 3
        earlier_avg = sum(hour_scores[:3]) / 3
        
        if recent_avg > earlier_avg + 0.2:
            return 'improving'
        elif recent_avg < earlier_avg - 0.2:
            return 'declining'
        else:
            return 'stable'
    
    def _get_dominant_emotions(self, messages: List[Dict]) -> List[str]:
        """Extract dominant emotions from messages"""
        emotions = []
        
        for msg in messages:
            text = msg['content'].lower()
            
            # Check for specific emotion categories
            if any(word in text for word in ['khushi', 'khush', 'happy', 'خوش', 'مزہ']):
                emotions.append('happiness')
            elif any(word in text for word in ['udaas', 'sad', 'اداس', 'غم']):
                emotions.append('sadness')
            elif any(word in text for word in ['gussa', 'angry', 'غصہ', 'naraz']):
                emotions.append('anger')
            elif any(word in text for word in ['dar', 'darr', 'fear', 'ڈر']):
                emotions.append('fear')
            elif any(word in text for word in ['pyar', 'love', 'پیار', 'muhabbat']):
                emotions.append('love')
        
        # Get top 3 emotions
        if emotions:
            emotion_counts = Counter(emotions)
            return [e[0] for e in emotion_counts.most_common(3)]
        
        return []
    
    def _save_mood_analysis(self, user_id: int, mood: str, confidence: float,
                           sentiment_counts: Counter, trend: str,
                           time_period: int) -> int:
        """Save mood analysis to database"""
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                # Prepare detected_emotions JSON
                emotions_data = {
                    'sentiment_distribution': {
                        'positive': sentiment_counts.get('positive', 0),
                        'negative': sentiment_counts.get('negative', 0),
                        'neutral': sentiment_counts.get('neutral', 0)
                    },
                    'trend': trend,
                    'time_period_hours': time_period
                }
                
                cur.execute("""
                    INSERT INTO user_moods 
                    (user_id, mood, sentiment_score, detected_emotions)
                    VALUES (%s, %s, %s, %s)
                """, (
                    user_id, mood, confidence,
                    json.dumps(emotions_data)
                ))
                
                conn.commit()
                return cur.lastrowid
        except Exception as e:
            print(f"[MOOD TRACKER] Error saving mood: {e}")
            return 0
        finally:
            if conn:
                conn.close()
    
    def get_mood_history(self, user_id: int, limit: int = 10) -> List[Dict]:
        """Get user's mood history"""
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        id, mood, sentiment_score,
                        detected_emotions, created_at
                    FROM user_moods
                    WHERE user_id = %s
                    ORDER BY created_at DESC
                    LIMIT %s
                """, (user_id, limit))
                
                moods = cur.fetchall()
                
                return [{
                    'id': m['id'],
                    'mood': m['mood'],
                    'confidence': round(m['sentiment_score'], 2) if m['sentiment_score'] else 0,
                    'detected_emotions': json.loads(m['detected_emotions']) if m['detected_emotions'] else {},
                    'created_at': m['created_at'].isoformat() if m['created_at'] else None
                } for m in moods]
                
        except Exception as e:
            print(f"[MOOD TRACKER] Error fetching mood history: {e}")
            return []
        finally:
            if conn:
                conn.close()
