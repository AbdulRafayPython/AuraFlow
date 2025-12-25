"""
Smart Moderation Agent for AuraFlow
Context-aware content moderation with Roman Urdu support
"""

import json
import os
import re
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from collections import Counter

from database import get_db_connection


class ModerationAgent:
    """
    Smart content moderation with context awareness
    Detects profanity, hate speech, harassment, spam, and personal info
    """
    
    def __init__(self):
        """Initialize the moderation agent"""
        self.lexicon_path = os.path.join(
            os.path.dirname(__file__), 
            '..', 'lexicons', 'moderation_keywords.json'
        )
        self.load_lexicons()
        
    def load_lexicons(self):
        """Load moderation lexicons from JSON file"""
        try:
            with open(self.lexicon_path, 'r', encoding='utf-8') as f:
                self.lexicon = json.load(f)
            print("[MODERATION] Lexicons loaded successfully")
        except Exception as e:
            print(f"[MODERATION] Error loading lexicons: {e}")
            self.lexicon = {}
    
    def moderate_message(self, text: str, user_id: int, 
                        channel_id: int, message_id: Optional[int] = None,
                        log: bool = True) -> Dict[str, any]:
        """
        Moderate a message for inappropriate content
        
        Args:
            text: Message text
            user_id: User who sent the message
            channel_id: Channel where message was sent
            
        Returns:
            Moderation result with action and details
        """
        text_lower = text.lower()
        
        # Check for different violation types
        profanity_score = self._check_profanity(text_lower)
        hate_speech_score = self._check_hate_speech(text_lower)
        harassment_score = self._check_harassment(text_lower)
        spam_score = self._check_spam(text)
        personal_info = self._check_personal_info(text)
        
        # Calculate overall severity
        max_score = max(profanity_score, hate_speech_score, 
                       harassment_score, spam_score)
        
        # Determine action based on score
        action = 'allow'
        severity = 'none'
        reason = []
        
        if personal_info['detected']:
            action = 'flag'
            severity = 'medium'
            reason.append('personal_information_detected')
        
        if max_score >= 0.9:
            action = 'block'
            severity = 'high'
        elif max_score >= 0.6:
            action = 'flag'
            severity = 'medium'
        elif max_score >= 0.3:
            action = 'warn'
            severity = 'low'
        
        # Add specific reasons
        if profanity_score >= 0.3:
            reason.append('profanity')
        if hate_speech_score >= 0.3:
            reason.append('hate_speech')
        if harassment_score >= 0.3:
            reason.append('harassment')
        if spam_score >= 0.3:
            reason.append('spam')
        
        # Check user history for repeat offenders
        user_violations = self._get_user_violation_count(user_id, hours=24)
        if user_violations >= 3 and action != 'allow':
            action = 'block'
            severity = 'high'
            reason.append('repeat_offender')
        
        result = {
            'action': action,
            'severity': severity,
            'confidence': round(max_score, 2),
            'reasons': reason,
            'scores': {
                'profanity': round(profanity_score, 2),
                'hate_speech': round(hate_speech_score, 2),
                'harassment': round(harassment_score, 2),
                'spam': round(spam_score, 2)
            },
            'personal_info_detected': personal_info['detected'],
            'personal_info_types': personal_info['types']
        }
        
        # Log the moderation action (optional, and only when action is not allow)
        if log and action != 'allow':
            self._log_moderation_action(
                user_id, channel_id, text, action, 
                severity, reason, max_score, message_id
            )
        
        return result
    
    def _check_profanity(self, text: str) -> float:
        """Check for profanity in text"""
        profanity_words = []
        
        # Check English profanity
        for word in self.lexicon.get('profanity', {}).get('english', []):
            if re.search(r'\b' + re.escape(word) + r'\b', text, re.IGNORECASE):
                profanity_words.append(word)
        
        # Check Roman Urdu profanity
        for word in self.lexicon.get('profanity', {}).get('roman_urdu', []):
            if word in text:
                profanity_words.append(word)
        
        # Calculate score based on number and severity
        if not profanity_words:
            return 0.0
        
        # Base score on count (more words = higher score)
        score = min(len(profanity_words) * 0.3, 0.95)
        return score
    
    def _check_hate_speech(self, text: str) -> float:
        """Check for hate speech"""
        hate_words = []
        
        # Check English hate speech
        for word in self.lexicon.get('hate_speech', {}).get('english', []):
            if re.search(r'\b' + re.escape(word) + r'\b', text, re.IGNORECASE):
                hate_words.append(word)
        
        # Check Roman Urdu hate speech
        for word in self.lexicon.get('hate_speech', {}).get('roman_urdu', []):
            if word in text:
                hate_words.append(word)
        
        if not hate_words:
            return 0.0
        
        # Hate speech is always severe
        return min(0.7 + len(hate_words) * 0.1, 0.98)
    
    def _check_harassment(self, text: str) -> float:
        """Check for harassment"""
        harassment_words = []
        
        # Check English harassment
        for word in self.lexicon.get('harassment', {}).get('english', []):
            if re.search(r'\b' + re.escape(word) + r'\b', text, re.IGNORECASE):
                harassment_words.append(word)
        
        # Check Roman Urdu harassment
        for word in self.lexicon.get('harassment', {}).get('roman_urdu', []):
            if word in text:
                harassment_words.append(word)
        
        if not harassment_words:
            return 0.0
        
        return min(len(harassment_words) * 0.4, 0.9)
    
    def _check_spam(self, text: str) -> float:
        """Check for spam patterns"""
        spam_indicators = 0
        
        patterns = self.lexicon.get('spam_patterns', {})
        
        # Check repeated characters
        if 'repeated_characters' in patterns:
            pattern = patterns['repeated_characters']['pattern']
            if re.search(pattern, text):
                spam_indicators += 1
        
        # Check excessive caps
        if 'excessive_caps' in patterns:
            pattern = patterns['excessive_caps']['pattern']
            if re.search(pattern, text):
                spam_indicators += 1
        
        # Check excessive emojis
        if 'excessive_emojis' in patterns:
            emoji_pattern = re.compile("["
                u"\U0001F600-\U0001F64F"  # emoticons
                u"\U0001F300-\U0001F5FF"  # symbols & pictographs
                u"\U0001F680-\U0001F6FF"  # transport & map symbols
                u"\U0001F1E0-\U0001F1FF"  # flags
                u"\U00002702-\U000027B0"
                u"\U000024C2-\U0001F251"
                "]+", flags=re.UNICODE)
            emoji_count = len(emoji_pattern.findall(text))
            threshold = patterns['excessive_emojis']['threshold']
            if emoji_count > threshold:
                spam_indicators += 1
        
        # Check link spam
        if 'link_spam' in patterns:
            pattern = patterns['link_spam']['pattern']
            max_links = patterns['link_spam']['max_links']
            link_count = len(re.findall(pattern, text))
            if link_count > max_links:
                spam_indicators += 2  # Links are more serious
        
        return min(spam_indicators * 0.25, 0.9)
    
    def _check_personal_info(self, text: str) -> Dict[str, any]:
        """Check for personal information"""
        detected_types = []
        
        patterns = self.lexicon.get('personal_info_patterns', {})
        
        # Check phone numbers
        if 'phone' in patterns:
            if re.search(patterns['phone']['pattern'], text):
                detected_types.append('phone_number')
        
        # Check emails
        if 'email' in patterns:
            if re.search(patterns['email']['pattern'], text):
                detected_types.append('email_address')
        
        # Check credit cards
        if 'credit_card' in patterns:
            if re.search(patterns['credit_card']['pattern'], text):
                detected_types.append('credit_card')
        
        return {
            'detected': len(detected_types) > 0,
            'types': detected_types
        }
    
    def _get_user_violation_count(self, user_id: int, hours: int = 24) -> int:
        """Get user's violation count in recent hours"""
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                time_threshold = datetime.now() - timedelta(hours=hours)
                
                cur.execute("""
                    SELECT COUNT(*) as count
                    FROM ai_agent_logs
                    WHERE user_id = %s 
                    AND action_type = 'moderation'
                    AND created_at >= %s
                    AND (output_text LIKE %s OR output_text LIKE %s)
                """, (user_id, time_threshold, '%block%', '%flag%'))
                
                result = cur.fetchone()
                return result['count'] if result else 0
                
        except Exception as e:
            print(f"[MODERATION] Error fetching violation count: {e}")
            return 0
        finally:
            if conn:
                conn.close()
    
    def _log_moderation_action(self, user_id: int, channel_id: int,
                              message: str, action: str, severity: str,
                              reasons: List[str], confidence: float,
                              message_id: Optional[int] = None):
        """Log moderation action to database"""
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                # Get or create moderation agent ID
                cur.execute("""
                    SELECT id FROM ai_agents 
                    WHERE type = 'moderator' 
                    LIMIT 1
                """)
                agent_row = cur.fetchone()
                
                if not agent_row:
                    # Create moderator agent if it doesn't exist
                    cur.execute("""
                        INSERT INTO ai_agents (name, type, description, is_active)
                        VALUES ('Smart Moderation', 'moderator', 
                                'AI-powered content moderation with multi-language support', TRUE)
                    """)
                    agent_id = cur.lastrowid
                else:
                    agent_id = agent_row['id']
                
                output_data = {
                    'action': action,
                    'severity': severity,
                    'reasons': reasons,
                    'confidence': confidence
                }
                
                # Handle invalid channel_id (0 or None) - set to NULL for FK constraint
                db_channel_id = None if not channel_id or channel_id == 0 else channel_id
                
                # Verify channel exists if not None
                if db_channel_id is not None:
                    cur.execute("SELECT id FROM channels WHERE id = %s", (db_channel_id,))
                    if not cur.fetchone():
                        print(f"[MODERATION] Warning: Invalid channel_id {db_channel_id}, setting to NULL")
                        db_channel_id = None
                
                cur.execute("""
                    INSERT INTO ai_agent_logs 
                    (agent_id, user_id, channel_id, message_id, action_type, 
                     input_text, output_text, confidence_score)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    agent_id, user_id, db_channel_id, message_id, 'moderation',
                    message[:500],  # Truncate long messages
                    json.dumps(output_data),
                    confidence
                ))
                
                conn.commit()
        except Exception as e:
            print(f"[MODERATION] Error logging action: {e}")
        finally:
            if conn:
                conn.close()

    def log_moderation_action(self, user_id: int, channel_id: int,
                              message: str, action: str, severity: str,
                              reasons: List[str], confidence: float,
                              message_id: Optional[int] = None):
        """Public helper to log moderation actions with an optional message_id"""
        self._log_moderation_action(
            user_id, channel_id, message, action, severity, reasons, confidence, message_id
        )
    
    def get_user_moderation_history(self, user_id: int, 
                                    limit: int = 10) -> List[Dict]:
        """Get user's moderation history"""
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        id, channel_id, input_text,
                        output_text, confidence_score,
                        created_at
                    FROM ai_agent_logs
                    WHERE user_id = %s AND action_type = 'moderation'
                    ORDER BY created_at DESC
                    LIMIT %s
                """, (user_id, limit))
                
                logs = cur.fetchall()
                
                return [{
                    'id': log['id'],
                    'channel_id': log['channel_id'],
                    'message': log['input_text'],
                    'action': json.loads(log['output_text']) if log['output_text'] else {},
                    'confidence': round(log['confidence_score'], 2) if log['confidence_score'] else 0,
                    'created_at': log['created_at'].isoformat() if log['created_at'] else None
                } for log in logs]
                
        except Exception as e:
            print(f"[MODERATION] Error fetching history: {e}")
            return []
        finally:
            if conn:
                conn.close()

