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
            # Log version info if available
            if 'version' in self.lexicon:
                print(f"[MODERATION] Lexicon version: {self.lexicon['version']}")
            if 'metadata' in self.lexicon:
                meta = self.lexicon['metadata']
                print(f"[MODERATION] Supported languages: {len(meta.get('supported_languages', []))}")
        except Exception as e:
            print(f"[MODERATION] Error loading lexicons: {e}")
            self.lexicon = {}
    
    def _word_match(self, word: str, text: str, lang: str) -> bool:
        """Language-aware word matching"""
        # For English and similar languages, use word boundaries
        if lang in ['english', 'spanish', 'portuguese', 'french', 'german', 'italian', 'dutch']:
            try:
                return bool(re.search(r'\b' + re.escape(word) + r'\b', text, re.IGNORECASE))
            except re.error:
                return word.lower() in text
        else:
            # For transliterated languages (roman_urdu, hinglish, etc.), use substring match
            return word.lower() in text
    
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
        threat_score = self._check_threats(text_lower)
        personal_info = self._check_personal_info(text)
        
        # Calculate overall severity
        max_score = max(profanity_score, hate_speech_score, 
                       harassment_score, spam_score, threat_score)
        
        # Determine action based on score
        action = 'allow'
        severity = 'none'
        reason = []
        
        if personal_info['detected']:
            action = 'flag'
            severity = 'medium'
            reason.append('personal_information_detected')
        
        # Threats are critical - always block
        if threat_score >= 0.7:
            action = 'block'
            severity = 'critical'
            reason.append('threats_detected')
        elif max_score >= 0.9:
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
        if threat_score >= 0.3:
            reason.append('threats')
        
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
                'spam': round(spam_score, 2),
                'threats': round(threat_score, 2)
            },
            'personal_info_detected': personal_info['detected'],
            'personal_info_types': personal_info['types']
        }
        
        # Log the moderation action (log all checks for accurate stats)
        if log:
            self._log_moderation_action(
                user_id, channel_id, text, action, 
                severity, reason, max_score, message_id
            )
        
        return result
    
    def _check_profanity(self, text: str) -> float:
        """Check for profanity in text - supports nested severity levels and multiple languages"""
        profanity_data = self.lexicon.get('profanity', {})
        severe_count = 0
        moderate_count = 0
        mild_count = 0
        
        # Languages with severity levels (nested structure)
        severity_languages = ['english', 'roman_urdu']
        
        for lang in severity_languages:
            lang_data = profanity_data.get(lang, {})
            if isinstance(lang_data, dict):
                # Nested structure with severity levels
                for word in lang_data.get('severe', []):
                    if self._word_match(word, text, lang):
                        severe_count += 1
                for word in lang_data.get('moderate', []):
                    if self._word_match(word, text, lang):
                        moderate_count += 1
                for word in lang_data.get('mild', []):
                    if self._word_match(word, text, lang):
                        mild_count += 1
            elif isinstance(lang_data, list):
                # Flat list (legacy format)
                for word in lang_data:
                    if self._word_match(word, text, lang):
                        moderate_count += 1
        
        # Languages with flat lists (no severity levels)
        flat_languages = ['hinglish', 'spanish', 'portuguese', 'french', 'german', 
                         'arabic', 'turkish', 'italian', 'dutch', 'russian_transliterated',
                         'chinese_pinyin', 'japanese_romaji', 'korean_romanized']
        
        for lang in flat_languages:
            lang_data = profanity_data.get(lang, [])
            if isinstance(lang_data, list):
                for word in lang_data:
                    if self._word_match(word, text, lang):
                        moderate_count += 1
        
        # Calculate score based on severity
        if severe_count == 0 and moderate_count == 0 and mild_count == 0:
            return 0.0
        
        # Weighted scoring: severe=0.4, moderate=0.25, mild=0.1
        score = (severe_count * 0.4) + (moderate_count * 0.25) + (mild_count * 0.1)
        return min(score, 0.98)
    
    def _check_hate_speech(self, text: str) -> float:
        """Check for hate speech - supports nested category structure"""
        hate_data = self.lexicon.get('hate_speech', {})
        severe_count = 0
        moderate_count = 0
        
        # Categories with severity levels
        categories = ['racial_slurs', 'religious_discrimination', 'lgbtq_discrimination',
                     'disability_discrimination', 'gender_discrimination', 'age_discrimination',
                     'socioeconomic_discrimination', 'nationalist_extremism']
        
        for category in categories:
            cat_data = hate_data.get(category, {})
            if isinstance(cat_data, dict):
                # Check severe terms
                for word in cat_data.get('severe', []):
                    if self._word_match(word, text, 'english'):
                        severe_count += 1
                # Check moderate terms
                for word in cat_data.get('moderate', []):
                    if self._word_match(word, text, 'english'):
                        moderate_count += 1
            elif isinstance(cat_data, list):
                # Flat list (legacy format)
                for word in cat_data:
                    if self._word_match(word, text, 'english'):
                        severe_count += 1
        
        # Also check legacy format (english/roman_urdu flat lists)
        for word in hate_data.get('english', []):
            if isinstance(word, str) and self._word_match(word, text, 'english'):
                severe_count += 1
        for word in hate_data.get('roman_urdu', []):
            if isinstance(word, str) and word in text:
                severe_count += 1
        
        if severe_count == 0 and moderate_count == 0:
            return 0.0
        
        # Hate speech scoring: severe starts high, moderate adds less
        score = 0.7 + (severe_count * 0.15) + (moderate_count * 0.05)
        return min(score, 0.99)
    
    def _check_harassment(self, text: str) -> float:
        """Check for harassment - supports nested structure with categories"""
        harassment_data = self.lexicon.get('harassment', {})
        harassment_count = 0
        
        # Check direct_insults categories
        direct_insults = harassment_data.get('direct_insults', {})
        insult_categories = ['appearance_based', 'intelligence_based', 'personality_based']
        
        for category in insult_categories:
            for word in direct_insults.get(category, []):
                if self._word_match(word, text, 'english'):
                    harassment_count += 1
        
        # Check phrase categories
        phrase_categories = ['dismissive_phrases', 'condescending_phrases', 'threatening_phrases']
        for category in phrase_categories:
            for phrase in harassment_data.get(category, []):
                if phrase.lower() in text:
                    harassment_count += 1
        
        # Legacy format support (english/roman_urdu flat lists)
        for word in harassment_data.get('english', []):
            if isinstance(word, str) and self._word_match(word, text, 'english'):
                harassment_count += 1
        for word in harassment_data.get('roman_urdu', []):
            if isinstance(word, str) and word in text:
                harassment_count += 1
        
        if harassment_count == 0:
            return 0.0
        
        return min(harassment_count * 0.3, 0.95)
    
    def _check_threats(self, text: str) -> float:
        """Check for threats - violence, self-harm, doxxing, swatting"""
        threat_data = self.lexicon.get('threats', {})
        severe_count = 0
        moderate_count = 0
        concerning_count = 0
        
        # Check violence threats
        violence = threat_data.get('violence_threats', {})
        for word in violence.get('severe', []):
            if self._word_match(word, text, 'english'):
                severe_count += 1
        for word in violence.get('moderate', []):
            if self._word_match(word, text, 'english'):
                moderate_count += 1
        
        # Check self-harm mentions (handle with care)
        self_harm = threat_data.get('self_harm_mentions', {})
        for word in self_harm.get('severe', []):
            if self._word_match(word, text, 'english'):
                concerning_count += 1
        for word in self_harm.get('concerning', []):
            if self._word_match(word, text, 'english'):
                concerning_count += 0.5
        
        # Check doxxing attempts
        for phrase in threat_data.get('doxxing_attempts', []):
            if phrase.lower() in text:
                severe_count += 1
        
        # Check swatting-related content
        for phrase in threat_data.get('swatting_related', []):
            if phrase.lower() in text:
                severe_count += 2  # Very serious
        
        if severe_count == 0 and moderate_count == 0 and concerning_count == 0:
            return 0.0
        
        # Weighted scoring for threats
        score = (severe_count * 0.35) + (moderate_count * 0.15) + (concerning_count * 0.1)
        return min(score, 0.99)
    
    def _check_spam(self, text: str) -> float:
        """Check for spam patterns - enhanced with promotional, scam, and phishing detection"""
        spam_indicators = 0
        text_lower = text.lower()
        
        patterns = self.lexicon.get('spam_patterns', {})
        
        # Check repeated characters
        if 'repeated_characters' in patterns:
            pattern = patterns['repeated_characters'].get('pattern', '(.)\\1{4,}')
            try:
                if re.search(pattern, text):
                    spam_indicators += 1
            except re.error:
                pass
        
        # Check excessive caps
        if 'excessive_caps' in patterns:
            pattern = patterns['excessive_caps'].get('pattern', '[A-Z\\s]{15,}')
            try:
                if re.search(pattern, text):
                    spam_indicators += 1
            except re.error:
                pass
        
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
            threshold = patterns['excessive_emojis'].get('threshold', 8)
            if emoji_count > threshold:
                spam_indicators += 1
        
        # Check link spam
        if 'link_spam' in patterns:
            pattern = patterns['link_spam'].get('pattern', '(https?://|www\\.)[^\\s]{3,}')
            max_links = patterns['link_spam'].get('max_links', 2)
            try:
                link_count = len(re.findall(pattern, text))
                if link_count > max_links:
                    spam_indicators += 2  # Links are more serious
            except re.error:
                pass
        
        # Check mention spam
        if 'mention_spam' in patterns:
            pattern = patterns['mention_spam'].get('pattern', '@\\w+')
            max_mentions = patterns['mention_spam'].get('max_mentions', 5)
            try:
                mention_count = len(re.findall(pattern, text))
                if mention_count > max_mentions:
                    spam_indicators += 1
            except re.error:
                pass
        
        # Check promotional patterns
        promotional = patterns.get('promotional_patterns', [])
        promo_count = sum(1 for phrase in promotional if phrase.lower() in text_lower)
        if promo_count >= 2:
            spam_indicators += 1
        if promo_count >= 4:
            spam_indicators += 1
        
        # Check scam patterns (more severe)
        scam = patterns.get('scam_patterns', [])
        scam_count = sum(1 for phrase in scam if phrase.lower() in text_lower)
        if scam_count >= 1:
            spam_indicators += 2
        if scam_count >= 3:
            spam_indicators += 2
        
        # Check phishing patterns (most severe)
        phishing = patterns.get('phishing_patterns', [])
        phishing_count = sum(1 for phrase in phishing if phrase.lower() in text_lower)
        if phishing_count >= 1:
            spam_indicators += 3
        
        return min(spam_indicators * 0.15, 0.95)
    
    def _check_personal_info(self, text: str) -> Dict[str, any]:
        """Check for personal information - supports multiple patterns per type"""
        detected_types = []
        
        patterns = self.lexicon.get('personal_info_patterns', {})
        
        # Pattern type mapping (new structure uses different keys)
        pattern_checks = [
            ('phone_numbers', 'phone_number'),
            ('phone', 'phone_number'),  # Legacy support
            ('email_addresses', 'email_address'),
            ('email', 'email_address'),  # Legacy support
            ('credit_cards', 'credit_card'),
            ('credit_card', 'credit_card'),  # Legacy support
            ('social_security', 'ssn'),
            ('ip_addresses', 'ip_address'),
            ('physical_addresses', 'physical_address'),
            ('dates_of_birth', 'date_of_birth'),
            ('passport_numbers', 'passport'),
            ('drivers_license', 'drivers_license')
        ]
        
        for pattern_key, detected_name in pattern_checks:
            if pattern_key in patterns:
                pattern_data = patterns[pattern_key]
                
                # Handle multiple patterns (array) or single pattern
                if isinstance(pattern_data, dict):
                    pattern_list = pattern_data.get('patterns', [])
                    if not pattern_list and 'pattern' in pattern_data:
                        pattern_list = [pattern_data['pattern']]
                elif isinstance(pattern_data, str):
                    pattern_list = [pattern_data]
                else:
                    pattern_list = []
                
                for pattern in pattern_list:
                    try:
                        if re.search(pattern, text):
                            if detected_name not in detected_types:
                                detected_types.append(detected_name)
                            break
                    except re.error:
                        continue  # Skip invalid regex patterns
        
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

