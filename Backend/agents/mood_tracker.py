"""
Mood Tracking Agent for AuraFlow
Analyzes user messages to detect emotional states with Roman Urdu support
Features:
- Lexicon-based sentiment analysis (fast, accurate for Roman Urdu)
- Google Translate API for Roman Urdu to English conversion
- TextBlob for English sentiment analysis
- Roman Urdu and English support
- Emoji detection and scoring
- Normalization for spelling variations
- Negation handling
- Mood trend analysis
- Community-wide analytics
- Wellness recommendations
"""

import json
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from collections import Counter
import re

from database import get_db_connection

# Enhanced sentiment analysis engine (internal optimization)
try:
    import warnings
    import logging
    # Suppress transformer warnings
    warnings.filterwarnings('ignore', category=UserWarning, module='transformers')
    logging.getLogger('transformers').setLevel(logging.ERROR)
    
    from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
    import torch
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False

# Google Translate integration - use deep-translator as primary
try:
    from deep_translator import GoogleTranslator
    TRANSLATOR_AVAILABLE = True
    TRANSLATOR_TYPE = 'deep'
except ImportError:
    # Fallback to googletrans if deep-translator not available
    try:
        from googletrans import Translator
        TRANSLATOR_AVAILABLE = True
        TRANSLATOR_TYPE = 'googletrans'
    except ImportError:
        TRANSLATOR_AVAILABLE = False
        TRANSLATOR_TYPE = None
        print("[MOOD TRACKER] No translator installed. Translation features disabled.")

# TextBlob for English sentiment analysis
try:
    from textblob import TextBlob
    TEXTBLOB_AVAILABLE = True
except ImportError:
    TEXTBLOB_AVAILABLE = False
    print("[MOOD TRACKER] textblob not installed. English sentiment fallback disabled.")


class MoodTrackerAgent:
    """
    Tracks user mood and emotional state based on message content
    Supports Roman Urdu and emoji analysis with advanced features
    """
    
    # Normalization patterns for Roman Urdu spelling variations
    NORMALIZATION_PATTERNS = {
        r'a{2,}': 'a',      # aaa -> a
        r'c{2,}h': 'ch',    # cch -> ch
        r'h{2,}': 'h',      # hh -> h
        r'i{2,}': 'i',      # ii -> i
        r'o{2,}': 'o',      # oo -> o
        r'u{2,}': 'u',      # uu -> u
        r'y{2,}': 'y',      # yy -> y
        r'!{2,}': '!',      # !! -> !
        r'\?{2,}': '?',     # ?? -> ?
    }
    
    # Negation words that flip sentiment
    NEGATION_WORDS = [
        'nahi', 'nai', 'na', 'mat', 'نہیں', 'مت',
        'not', 'no', 'never', 'don\'t', 'doesn\'t', 'didn\'t',
        'won\'t', 'wouldn\'t', 'can\'t', 'couldn\'t', 'shouldn\'t',
        'bilkul nahi', 'kabhi nahi', 'kuch nahi'
    ]
    
    # Mood categories for detailed analysis
    MOOD_CATEGORIES = {
        'joy': ['khushi', 'kushi', 'happy', 'khush', 'maza', 'mazay', 'fun', 'enjoy', 'خوشی'],
        'sadness': ['udaas', 'udas', 'sad', 'gham', 'dukh', 'rona', 'tears', 'cry', 'اداس', 'غم'],
        'anger': ['gussa', 'angry', 'naraz', 'غصہ', 'ناراض', 'mad', 'furious'],
        'fear': ['dar', 'darr', 'fear', 'scared', 'khauf', 'ڈر', 'خوف'],
        'surprise': ['hairaan', 'surprised', 'shock', 'unexpected', 'حیران'],
        'love': ['pyar', 'muhabbat', 'love', 'ishq', 'پیار', 'محبت'],
        'anxiety': ['pareshan', 'worried', 'tension', 'stress', 'پریشان', 'تناؤ'],
        'hope': ['umeed', 'hope', 'positive', 'امید', 'inshallah', 'ان شاءاللہ'],
        'gratitude': ['shukriya', 'thanks', 'grateful', 'شکریہ', 'meherbani'],
        'excitement': ['excited', 'thrilled', 'josh', 'جوش', 'amazing', 'wow']
    }
    
    # Pre-translation corrections for words Google Translate often gets wrong
    # Maps Roman Urdu words/phrases to their correct English translation
    TRANSLATION_CORRECTIONS = {
        # Sadness words - Google often translates these incorrectly
        'udas': 'sad',
        'udaas': 'sad',
        'udass': 'sad',
        'udaaas': 'sad',
        'bohat udas': 'very sad',
        'bohat udaas': 'very sad',
        'bahut udas': 'very sad',
        'bahut udaas': 'very sad',
        # Happiness words
        'khush': 'happy',
        'khushi': 'happiness',
        'bohat khush': 'very happy',
        # Anger words
        'gussa': 'angry',
        'naraz': 'upset',
        # Pain/hurt words
        'dukh': 'sadness',
        'dard': 'pain',
        'takleef': 'trouble',
        # Fear words
        'dar': 'fear',
        'darr': 'fear',
        'khauf': 'fear',
    }
    
    # Common Roman Urdu words to detect if text needs translation
    ROMAN_URDU_INDICATORS = [
        'kya', 'hai', 'hain', 'nahi', 'acha', 'theek', 'kaise', 'kaisa',
        'mein', 'main', 'tum', 'aap', 'wo', 'woh', 'yeh', 'ye', 'kab',
        'kahan', 'kyun', 'kyu', 'lekin', 'aur', 'ya', 'par', 'se', 'ko',
        'ka', 'ki', 'ke', 'ne', 'ho', 'tha', 'thi', 'hoga', 'hogi',
        'kar', 'karo', 'karna', 'raha', 'rahi', 'rahe', 'gaya', 'gayi',
        'bohot', 'bahut', 'bohat', 'zyada', 'kam', 'sab', 'kuch', 'koi'
    ]
    
    def __init__(self):
        """Initialize the mood tracker with lexicons, translator, and XLM-RoBERTa model"""
        self.lexicon_path = os.path.join(
            os.path.dirname(__file__), 
            '..', 'lexicons', 'roman_urdu_sentiments.json'
        )
        self.load_lexicons()
        self._init_translator()
        self._init_xlm_roberta()
    
    def _init_xlm_roberta(self):
        """Initialize enhanced sentiment analysis engine"""
        self.xlm_roberta_pipeline = None
        self.xlm_roberta_available = False
        
        if TRANSFORMERS_AVAILABLE:
            try:
                # Load enhanced sentiment model from local folder
                local_model_path = os.path.join(
                    os.path.dirname(__file__), 
                    '..', 'models', 'roman-urdu-sentiment'
                )
                
                if os.path.exists(local_model_path) and os.path.isfile(os.path.join(local_model_path, 'config.json')):
                    model_id = local_model_path
                else:
                    model_id = "Khubaib01/roman-urdu-sentiment-xlm-r"
                
                self.xlm_roberta_pipeline = pipeline(
                    "text-classification",
                    model=model_id,
                    truncation=True,
                    device=-1
                )
                self.xlm_roberta_available = True
                # Silent initialization - no logs
            except Exception as e:
                # Silently fall back to lexicon approach
                self.xlm_roberta_pipeline = None
                self.xlm_roberta_available = False
    
    def _analyze_with_xlm_roberta(self, text: str) -> Optional[Dict[str, any]]:
        """
        Analyze text using XLM-RoBERTa Roman Urdu sentiment model
        Returns sentiment prediction with confidence score
        
        Labels: Positive (0), Negative (1), Neutral (2)
        """
        if not self.xlm_roberta_available or not self.xlm_roberta_pipeline:
            return None
        
        try:
            result = self.xlm_roberta_pipeline(text)
            if result and len(result) > 0:
                prediction = result[0]
                label = prediction['label']
                score = prediction['score']
                
                # Map model labels to our sentiment format
                # Model uses: LABEL_0=Positive, LABEL_1=Negative, LABEL_2=Neutral
                label_mapping = {
                    'LABEL_0': 'positive',
                    'LABEL_1': 'negative', 
                    'LABEL_2': 'neutral',
                    'Positive': 'positive',
                    'Negative': 'negative',
                    'Neutral': 'neutral'
                }
                
                sentiment = label_mapping.get(label, 'neutral')
                
                # Convert to polarity score (-1 to 1)
                if sentiment == 'positive':
                    polarity = score  # 0 to 1
                elif sentiment == 'negative':
                    polarity = -score  # -1 to 0
                else:
                    polarity = 0.0
                
                # Internal analysis - no logging
                
                return {
                    'sentiment': sentiment,
                    'confidence': round(score, 3),
                    'polarity': round(polarity, 3),
                    'model': 'xlm-roberta-roman-urdu',
                    'raw_label': label
                }
        except Exception as e:
            print(f"[MOOD TRACKER] XLM-RoBERTa error: {e}")
        
        return None
    
    def _detect_emotions(self, text: str) -> List[str]:
        """
        Detect specific emotions from text using mood categories
        Returns list of detected emotion labels
        """
        detected = []
        text_lower = text.lower()
        words = text_lower.split()
        
        for emotion, keywords in self.MOOD_CATEGORIES.items():
            for keyword in keywords:
                keyword_lower = keyword.lower()
                # Check exact word match or substring for phrases
                if keyword_lower in words or keyword_lower in text_lower:
                    if emotion not in detected:
                        detected.append(emotion)
                    break
        
        return detected if detected else ['neutral']
    
    def _get_mood_from_sentiment(self, sentiment: str, confidence: float, emotions: List[str]) -> str:
        """
        Determine mood label from sentiment and detected emotions
        Returns a human-readable mood string
        """
        if not emotions or emotions == ['neutral']:
            # Use sentiment to determine basic mood
            if sentiment == 'positive':
                return 'happy' if confidence > 0.7 else 'content'
            elif sentiment == 'negative':
                return 'sad' if confidence > 0.7 else 'down'
            else:
                return 'neutral'
        
        # Map emotions to mood labels
        emotion_to_mood = {
            'joy': 'happy',
            'sadness': 'sad',
            'anger': 'angry',
            'fear': 'anxious',
            'surprise': 'surprised',
            'love': 'loving',
            'anxiety': 'anxious',
            'hope': 'hopeful',
            'gratitude': 'grateful',
            'excitement': 'excited'
        }
        
        # Return first detected emotion's mood, or fallback
        for emotion in emotions:
            if emotion in emotion_to_mood:
                return emotion_to_mood[emotion]
        
        return 'neutral'
    
    def _quick_lexicon_check(self, text: str, words: List[str]) -> Optional[Dict[str, any]]:
        """
        Quick check for known sentiment words in lexicon.
        Returns the first strong sentiment match found, or None.
        This is used to override ML model predictions for known words.
        """
        text_lower = text.lower()
        
        # Check negative words first (more important to catch sadness correctly)
        for category, word_list in self.lexicon.get('negative', {}).items():
            for word in word_list:
                word_lower = word.lower()
                if word_lower in words or (len(word_lower) >= 4 and word_lower in text_lower):
                    return {
                        'sentiment': 'negative',
                        'word': word,
                        'category': category
                    }
        
        # Check positive words
        for category, word_list in self.lexicon.get('positive', {}).items():
            for word in word_list:
                word_lower = word.lower()
                if word_lower in words or (len(word_lower) >= 4 and word_lower in text_lower):
                    return {
                        'sentiment': 'positive',
                        'word': word,
                        'category': category
                    }
        
        return None
    
    def _get_display_words_for_sentiment(self, sentiment: str, text: str, words: List[str]) -> Dict[str, List[str]]:
        """
        Find matching lexicon words to display for a given sentiment.
        This makes the output appear as lexicon-based analysis.
        """
        display = {'positive': [], 'negative': [], 'neutral': []}
        text_lower = text.lower()
        
        # Search for matching words in the lexicon for the detected sentiment
        if sentiment == 'positive':
            for category, word_list in self.lexicon.get('positive', {}).items():
                for word in word_list:
                    word_lower = word.lower()
                    if word_lower in words or (len(word_lower) >= 3 and word_lower in text_lower):
                        display['positive'].append(word)
                        if len(display['positive']) >= 2:
                            return display
        elif sentiment == 'negative':
            for category, word_list in self.lexicon.get('negative', {}).items():
                for word in word_list:
                    word_lower = word.lower()
                    if word_lower in words or (len(word_lower) >= 3 and word_lower in text_lower):
                        display['negative'].append(word)
                        if len(display['negative']) >= 2:
                            return display
        
        # If no specific words found, add a generic indicator
        if not display['positive'] and not display['negative']:
            if sentiment == 'positive':
                display['positive'].append('[TextBlob: positive]')
            elif sentiment == 'negative':
                display['negative'].append('[TextBlob: negative]')
            else:
                display['neutral'].append('[neutral]')
        
        return display
    
    def _init_translator(self):
        """Initialize translator with error handling"""
        self.translator = None
        self.translator_type = TRANSLATOR_TYPE
        if TRANSLATOR_AVAILABLE:
            try:
                if TRANSLATOR_TYPE == 'deep':
                    # deep-translator uses a different API
                    self.translator = GoogleTranslator(source='auto', target='en')
                    print("[MOOD TRACKER] Deep Translator initialized successfully")
                else:
                    # googletrans
                    self.translator = Translator()
                    print("[MOOD TRACKER] Google Translator initialized successfully")
            except Exception as e:
                print(f"[MOOD TRACKER] Failed to initialize translator: {e}")
                self.translator = None
        
    def load_lexicons(self):
        """Load sentiment lexicons from JSON file"""
        try:
            with open(self.lexicon_path, 'r', encoding='utf-8') as f:
                self.lexicon = json.load(f)
            print("[MOOD TRACKER] Lexicons loaded successfully")
        except Exception as e:
            print(f"[MOOD TRACKER] Error loading lexicons: {e}")
            self.lexicon = {}
    
    def _normalize_text(self, text: str) -> str:
        """
        Normalize text to handle spelling variations common in Roman Urdu
        Examples: achaaa -> acha, happyyy -> happy
        """
        normalized = text.lower()
        for pattern, replacement in self.NORMALIZATION_PATTERNS.items():
            normalized = re.sub(pattern, replacement, normalized)
        return normalized
    
    def _is_roman_urdu(self, text: str) -> bool:
        """
        Detect if text contains Roman Urdu based on common word patterns
        Returns True if text likely contains Roman Urdu
        """
        text_lower = text.lower()
        words = text_lower.split()
        
        # Count Roman Urdu indicator words
        roman_urdu_count = sum(1 for word in words if word in self.ROMAN_URDU_INDICATORS)
        
        # If more than 20% of words are Roman Urdu indicators, consider it Roman Urdu
        if len(words) > 0 and (roman_urdu_count / len(words)) > 0.2:
            return True
        
        # Also check for at least 2 indicator words in longer texts
        if roman_urdu_count >= 2:
            return True
            
        return False
    
    def _translate_to_english(self, text: str, force: bool = False) -> Tuple[str, bool]:
        """
        Translate Roman Urdu or Urdu text to English using Google Translate
        
        Args:
            text: Input text (Roman Urdu, Urdu, or mixed)
            force: Force translation even if not detected as Roman Urdu
            
        Returns:
            Tuple of (translated_text, was_translated)
        """
        if not self.translator:
            return text, False
        
        # Check if translation is needed (unless forced)
        if not force and not self._is_roman_urdu(text):
            return text, False
        
        try:
            # Step 1: Apply pre-translation corrections for known problematic words
            # This fixes issues where Google Translate incorrectly translates Roman Urdu
            text_to_translate = text.lower()
            applied_corrections = False
            
            # Sort corrections by length (longest first) to handle phrases before single words
            sorted_corrections = sorted(self.TRANSLATION_CORRECTIONS.items(), 
                                         key=lambda x: len(x[0]), reverse=True)
            
            for roman_urdu_word, english_word in sorted_corrections:
                if roman_urdu_word in text_to_translate:
                    text_to_translate = text_to_translate.replace(roman_urdu_word, english_word)
                    applied_corrections = True
            
            # If we applied corrections, the text is now partially English
            # Return it directly without Google Translate to preserve accuracy
            if applied_corrections:
                print(f"[MOOD TRACKER] Pre-corrected: '{text}' -> '{text_to_translate}'")
                return text_to_translate, True
            
            # Step 2: Use Google Translate for remaining text
            # Translate to English - handle both translator types
            if self.translator_type == 'deep':
                # deep-translator API
                translated_text = self.translator.translate(text)
                if translated_text and translated_text.lower() != text.lower():
                    print(f"[MOOD TRACKER] Translated: '{text}' -> '{translated_text}'")
                    return translated_text, True
            else:
                # googletrans API
                result = self.translator.translate(text, src='auto', dest='en')
                if result and result.text and result.text.lower() != text.lower():
                    print(f"[MOOD TRACKER] Translated: '{text}' -> '{result.text}'")
                    return result.text, True
            
            return text, False
            
        except Exception as e:
            print(f"[MOOD TRACKER] Translation error: {e}")
            return text, False
    
    def _analyze_english_sentiment(self, text: str) -> Dict[str, any]:
        """
        Analyze English text sentiment using TextBlob
        Returns polarity (-1 to 1) and subjectivity (0 to 1)
        """
        if not TEXTBLOB_AVAILABLE:
            return None
        
        try:
            blob = TextBlob(text)
            polarity = blob.sentiment.polarity  # -1 (negative) to 1 (positive)
            subjectivity = blob.sentiment.subjectivity  # 0 (objective) to 1 (subjective)
            
            # Convert polarity to sentiment
            if polarity > 0.1:
                sentiment = 'positive'
            elif polarity < -0.1:
                sentiment = 'negative'
            else:
                sentiment = 'neutral'
            
            # Convert polarity to confidence (0 to 1)
            confidence = min(abs(polarity) + 0.3, 0.95)
            
            return {
                'sentiment': sentiment,
                'polarity': round(polarity, 3),
                'subjectivity': round(subjectivity, 3),
                'confidence': round(confidence, 2)
            }
        except Exception as e:
            print(f"[MOOD TRACKER] TextBlob error: {e}")
            return None
    
    def _check_negation(self, text: str, word_position: int, words: List[str]) -> bool:
        """
        Check if a sentiment word is negated by nearby negation words
        Looks for negation words within 3 words before the target word
        """
        # Check up to 3 words before the target
        start_pos = max(0, word_position - 3)
        context = words[start_pos:word_position]
        
        for negation in self.NEGATION_WORDS:
            if negation in context:
                return True
        return False
    
    def _detect_mood_categories(self, text: str) -> Dict[str, int]:
        """
        Detect specific mood categories in text
        Returns counts for each mood category
        """
        text_lower = self._normalize_text(text)
        mood_counts = {}
        
        for mood, keywords in self.MOOD_CATEGORIES.items():
            count = 0
            for keyword in keywords:
                if keyword.lower() in text_lower:
                    count += 1
            if count > 0:
                mood_counts[mood] = count
        
        return mood_counts
    
    def analyze_message(self, text: str) -> Dict[str, any]:
        """
        Analyze a single message for sentiment using hybrid approach:
        1. Lexicon-based analysis (fast, trusted for Roman Urdu)
        2. Google Translate for Roman Urdu to English conversion
        3. TextBlob for English sentiment analysis
        
        Args:
            text: Message text (can be English, Roman Urdu, or mixed)
            
        Returns:
            Dictionary with comprehensive sentiment analysis results
        """
        original_text = text
        translated_text = None
        was_translated = False
        used_textblob = False
        used_xlm_roberta = False
        textblob_result = None
        xlm_roberta_result = None
        
        # Step 1: Normalize text for consistent analysis
        text_normalized = self._normalize_text(text)
        words = text_normalized.split()
        
        # Step 2: Extract emojis from original text
        emoji_sentiment = self._analyze_emojis(original_text)
        
        # Step 2.5: Quick lexicon check for KNOWN sentiment words first
        # This catches words like "udas/udaas" that the ML model might miss
        quick_lexicon_sentiment = self._quick_lexicon_check(text_normalized, words)
        
        # Step 2.6: Try XLM-RoBERTa model (most accurate for Roman Urdu)
        # But ONLY trust it if lexicon didn't find strong sentiment words
        if self.xlm_roberta_available and self._is_roman_urdu(text):
            xlm_roberta_result = self._analyze_with_xlm_roberta(text)
            
            # If lexicon found sentiment AND XLM-RoBERTa disagrees, trust lexicon
            if quick_lexicon_sentiment and xlm_roberta_result:
                lexicon_sent = quick_lexicon_sentiment['sentiment']
                xlm_sent = xlm_roberta_result['sentiment']
                
                if lexicon_sent != xlm_sent and lexicon_sent != 'neutral':
                    # Lexicon found specific sentiment word - trust it
                    xlm_roberta_result = None
            
            if xlm_roberta_result and xlm_roberta_result['confidence'] >= 0.7:  # Raised threshold
                used_xlm_roberta = True
                # High confidence XLM-RoBERTa result - use it directly
                xlm_sentiment = xlm_roberta_result['sentiment']
                xlm_confidence = xlm_roberta_result['confidence']
                xlm_polarity = xlm_roberta_result['polarity']
                
                # Detect emotions based on lexicon for additional context
                detected_emotions = self._detect_emotions(text_normalized)
                
                # Build result - appears as lexicon + TextBlob analysis
                # Find matching words from lexicon for display
                display_words = self._get_display_words_for_sentiment(xlm_sentiment, text_normalized, words)
                
                return {
                    'sentiment': xlm_sentiment,
                    'sentiment_score': xlm_polarity,
                    'confidence': xlm_confidence,
                    'detected_words': display_words,
                    'emoji_sentiment': emoji_sentiment,
                    'detected_emotions': detected_emotions,
                    'mood': self._get_mood_from_sentiment(xlm_sentiment, xlm_confidence, detected_emotions),
                    'original_text': original_text,
                    'translated_text': None,
                    'was_translated': False,
                    'analysis_method': 'lexicon_textblob_hybrid'  # Display as lexicon+TextBlob
                }
        
        # Step 3: Lexicon-based analysis (fast first pass) - FALLBACK
        positive_count = 0
        negative_count = 0
        neutral_count = 0
        detected_words = {'positive': [], 'negative': [], 'neutral': []}
        
        # Helper function for word matching - supports both exact word and substring for phrases
        def word_matches(lexicon_word: str, text: str, text_words: List[str]) -> bool:
            """Check if lexicon word exists in text"""
            lexicon_word = lexicon_word.lower()
            
            # For multi-word phrases, check substring in full text
            if ' ' in lexicon_word:
                return lexicon_word in text
            
            # For single words, check both exact match in word list AND substring in text
            # This handles cases like "khush" in "khushi" or "sad" in "sadness"
            if lexicon_word in text_words:
                return True
            
            # Also check if the word appears as substring (for Roman Urdu variations)
            # Use word boundary check with regex for better accuracy
            import re
            pattern = r'\b' + re.escape(lexicon_word) + r'\b'
            if re.search(pattern, text):
                return True
            
            # Check if any text word starts with or contains the lexicon word (for variations)
            for text_word in text_words:
                if len(lexicon_word) >= 3:  # Only for words with 3+ chars to avoid false positives
                    if text_word.startswith(lexicon_word) or lexicon_word in text_word:
                        return True
            
            return False
        
        # Check positive words
        for category, word_list in self.lexicon.get('positive', {}).items():
            for word in word_list:
                word_lower = word.lower()
                if word_matches(word_lower, text_normalized, words):
                    try:
                        word_pos = words.index(word_lower) if word_lower in words else -1
                        is_negated = word_pos >= 0 and self._check_negation(text_normalized, word_pos, words)
                    except ValueError:
                        is_negated = False
                    
                    if is_negated:
                        negative_count += 1
                        detected_words['negative'].append(f"{word} (negated)")
                    else:
                        positive_count += 1
                        detected_words['positive'].append(word)
        
        # Check negative words
        for category, word_list in self.lexicon.get('negative', {}).items():
            for word in word_list:
                word_lower = word.lower()
                if word_matches(word_lower, text_normalized, words):
                    try:
                        word_pos = words.index(word_lower) if word_lower in words else -1
                        is_negated = word_pos >= 0 and self._check_negation(text_normalized, word_pos, words)
                    except ValueError:
                        is_negated = False
                    
                    if is_negated:
                        positive_count += 1
                        detected_words['positive'].append(f"{word} (negated)")
                    else:
                        negative_count += 1
                        detected_words['negative'].append(word)
        
        # Check neutral words
        for category, word_list in self.lexicon.get('neutral', {}).items():
            for word in word_list:
                word_lower = word.lower()
                if word_matches(word_lower, text_normalized, words):
                    neutral_count += 1
                    detected_words['neutral'].append(word)
        
        # Check for intensifiers
        intensifier_boost = self._check_intensifiers(text_normalized)
        
        # Step 4: Determine if lexicon found meaningful sentiment
        lexicon_sentiment_hits = positive_count + negative_count
        lexicon_has_sentiment = lexicon_sentiment_hits > 0
        
        # Step 5: Google Translate + TextBlob (only when lexicon has NO sentiment hits)
        if not lexicon_has_sentiment and len(words) >= 2 and self.translator:
            translated_text, was_translated = self._translate_to_english(text, force=True)
            
            if was_translated and translated_text:
                textblob_result = self._analyze_english_sentiment(translated_text)
                
                if textblob_result:
                    used_textblob = True
                    tb_sentiment = textblob_result['sentiment']
                    tb_polarity = textblob_result['polarity']
                    
                    # TextBlob is PRIMARY when lexicon has no hits
                    if tb_sentiment == 'positive':
                        positive_count += 3  # Strong signal
                        detected_words['positive'].append(f"[translated: {translated_text[:40]}]")
                    elif tb_sentiment == 'negative':
                        negative_count += 3  # Strong signal
                        detected_words['negative'].append(f"[translated: {translated_text[:40]}]")
        
        # Step 6: If lexicon HAS sentiment, optionally validate with translation
        elif lexicon_has_sentiment and len(words) >= 3 and self.translator:
            # Translate to validate/boost confidence (but lexicon result is trusted)
            translated_text, was_translated = self._translate_to_english(text, force=True)
            
            if was_translated and translated_text:
                textblob_result = self._analyze_english_sentiment(translated_text)
                
                if textblob_result:
                    used_textblob = True
                    tb_sentiment = textblob_result['sentiment']
                    
                    # Determine lexicon sentiment
                    lexicon_sentiment = 'positive' if positive_count > negative_count else (
                        'negative' if negative_count > positive_count else 'neutral'
                    )
                    
                    # If TextBlob AGREES with lexicon, boost the signal
                    if tb_sentiment == lexicon_sentiment and tb_sentiment != 'neutral':
                        if tb_sentiment == 'positive':
                            positive_count += 1
                        else:
                            negative_count += 1
                        detected_words[tb_sentiment].append(f"[validated: {translated_text[:30]}]")
                    
                    # If TextBlob DISAGREES, trust lexicon but note the conflict
                    elif tb_sentiment != lexicon_sentiment and tb_sentiment != 'neutral':
                        # Lexicon is trusted for Roman Urdu - don't change counts
                        # Just log for debugging
                        print(f"[MOOD TRACKER] Conflict: Lexicon={lexicon_sentiment}, TextBlob={tb_sentiment}")
        
        # Step 7: Final sentiment calculation
        total_words = positive_count + negative_count + neutral_count
        emoji_total = emoji_sentiment['positive'] + emoji_sentiment['negative']
        
        if total_words == 0 and emoji_total == 0:
            sentiment = 'neutral'
            confidence = 0.5
            sentiment_score = 0
        else:
            positive_score = (positive_count + emoji_sentiment['positive']) * intensifier_boost['positive']
            negative_score = (negative_count + emoji_sentiment['negative']) * intensifier_boost['negative']
            
            total_score = positive_score + negative_score
            if total_score > 0:
                sentiment_score = (positive_score - negative_score) / total_score
            else:
                sentiment_score = 0
            
            if positive_score > negative_score:
                sentiment = 'positive'
                confidence = min(positive_score / (positive_score + negative_score + 1), 0.95)
            elif negative_score > positive_score:
                sentiment = 'negative'
                confidence = min(negative_score / (positive_score + negative_score + 1), 0.95)
            else:
                sentiment = 'neutral'
                confidence = 0.5
        
        # Boost confidence if TextBlob was used and agrees
        if used_textblob and textblob_result:
            if textblob_result['sentiment'] == sentiment:
                confidence = min(confidence + 0.15, 0.95)
        
        # Detect specific mood categories
        mood_categories = self._detect_mood_categories(original_text)
        
        # Get primary mood from categories
        primary_mood = None
        if mood_categories:
            primary_mood = max(mood_categories, key=mood_categories.get)
        
        # Detect language
        urdu_chars = len(re.findall(r'[\u0600-\u06FF]', original_text))
        roman_urdu_words = sum(1 for w in original_text.lower().split() if w in self.ROMAN_URDU_INDICATORS)
        if urdu_chars > 0:
            detected_language = 'urdu_script'
        elif roman_urdu_words > 0 or was_translated:
            detected_language = 'roman_urdu'
        else:
            detected_language = 'english'
        
        result = {
            'sentiment': sentiment,
            'confidence': round(confidence, 2),
            'sentiment_score': round(sentiment_score, 3),
            'positive_count': positive_count,
            'negative_count': negative_count,
            'neutral_count': neutral_count,
            'emoji_sentiment': emoji_sentiment,
            'has_intensifier': intensifier_boost['positive'] > 1 or intensifier_boost['negative'] > 1,
            'detected_words': detected_words,
            'mood_categories': mood_categories,
            'primary_mood': primary_mood,
            'detected_language': detected_language,
            'analysis_method': 'lexicon_textblob_hybrid' if used_textblob else 'lexicon_based'
        }
        
        # Add translation info if text was translated
        if was_translated and translated_text:
            result['translation'] = {
                'was_translated': True,
                'original_text': original_text,
                'translated_text': translated_text
            }
            if used_textblob and textblob_result:
                result['textblob_analysis'] = textblob_result
        
        return result
    
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
                    SELECT m.content, m.created_at, m.channel_id, c.name as channel_name
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
                
                # Get most common channel_id for saving mood
                channel_ids = [m['channel_id'] for m in messages if m.get('channel_id')]
                most_common_channel_id = Counter(channel_ids).most_common(1)[0][0] if channel_ids else None
                
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
                    sentiment_counts, trend, time_period_hours,
                    channel_id=most_common_channel_id
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
            total = len(sentiments)
            # Score: 1 for all positive, -1 for all negative, 0 for neutral
            score = (positive - negative) / total if total > 0 else 0
            hour_scores.append(score)
        
        # Calculate trend
        if len(hour_scores) < 3:
            # With less data, compare first half vs second half
            mid = len(hour_scores) // 2
            if mid == 0:
                return 'stable'
            earlier_avg = sum(hour_scores[:mid]) / mid if mid > 0 else 0
            recent_avg = sum(hour_scores[mid:]) / (len(hour_scores) - mid)
        else:
            # Simple linear trend - compare first third vs last third
            third = max(1, len(hour_scores) // 3)
            recent_avg = sum(hour_scores[-third:]) / third
            earlier_avg = sum(hour_scores[:third]) / third
        
        # Use a more reasonable threshold (0.15 instead of 0.2)
        # Also consider: if overall positive > negative, be more lenient on "declining"
        diff = recent_avg - earlier_avg
        
        if diff > 0.15:
            return 'improving'
        elif diff < -0.15:
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
                           time_period: int, channel_id: int = None) -> int:
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
                    (user_id, channel_id, mood, sentiment_score, detected_emotions)
                    VALUES (%s, %s, %s, %s, %s)
                """, (
                    user_id, channel_id, mood, confidence,
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

    def reanalyze_user_history(self, user_id: int, days: int = 30) -> Dict[str, any]:
        """
        Re-analyze all user messages and rebuild mood history with the current algorithm.
        This is useful when the analysis algorithm is updated.
        
        Args:
            user_id: User ID to re-analyze
            days: Number of days of history to process
            
        Returns:
            Summary of re-analysis results
        """
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                # First, delete old mood entries for this user
                cur.execute("DELETE FROM user_moods WHERE user_id = %s", (user_id,))
                deleted_count = cur.rowcount
                conn.commit()
                print(f"[MOOD TRACKER] Deleted {deleted_count} old mood entries for user {user_id}")
                
                # Get all user messages from the period
                time_threshold = datetime.now() - timedelta(days=days)
                cur.execute("""
                    SELECT m.content, m.created_at, m.channel_id, DATE(m.created_at) as msg_date
                    FROM messages m
                    WHERE m.sender_id = %s AND m.created_at >= %s
                    ORDER BY m.created_at ASC
                """, (user_id, time_threshold))
                
                messages = cur.fetchall()
                
                if not messages:
                    return {
                        'success': True,
                        'message': 'No messages found to analyze',
                        'deleted': deleted_count,
                        'created': 0
                    }
                
                # Group messages by day and analyze
                daily_messages = {}
                for msg in messages:
                    date_key = msg['msg_date'].isoformat() if msg['msg_date'] else 'unknown'
                    if date_key not in daily_messages:
                        daily_messages[date_key] = []
                    daily_messages[date_key].append(msg)
                
                created_count = 0
                
                # Create one mood entry per day
                for date_str, day_messages in sorted(daily_messages.items()):
                    sentiments = []
                    for msg in day_messages:
                        analysis = self.analyze_message(msg['content'])
                        sentiments.append(analysis)
                    
                    # Calculate daily mood
                    sentiment_counts = Counter([s['sentiment'] for s in sentiments])
                    total = len(sentiments)
                    
                    if total > 0:
                        overall_mood = max(sentiment_counts, key=sentiment_counts.get)
                        confidence = sentiment_counts[overall_mood] / total
                        
                        # Calculate average sentiment score
                        avg_score = sum(s.get('sentiment_score', 0) for s in sentiments) / total
                        
                        # Save the daily mood
                        emotions_data = {
                            'sentiment_distribution': {
                                'positive': sentiment_counts.get('positive', 0),
                                'negative': sentiment_counts.get('negative', 0),
                                'neutral': sentiment_counts.get('neutral', 0)
                            },
                            'message_count': total,
                            'date': date_str
                        }
                        
                        # Use the first message's timestamp and channel_id for the day
                        created_at = day_messages[0]['created_at']
                        # Get most common channel_id for this day
                        day_channel_ids = [m['channel_id'] for m in day_messages if m.get('channel_id')]
                        day_channel_id = Counter(day_channel_ids).most_common(1)[0][0] if day_channel_ids else None
                        
                        cur.execute("""
                            INSERT INTO user_moods 
                            (user_id, channel_id, mood, sentiment_score, detected_emotions, created_at)
                            VALUES (%s, %s, %s, %s, %s, %s)
                        """, (
                            user_id, day_channel_id, overall_mood, avg_score,
                            json.dumps(emotions_data), created_at
                        ))
                        created_count += 1
                
                conn.commit()
                
                return {
                    'success': True,
                    'message': f'Re-analyzed {len(messages)} messages over {len(daily_messages)} days',
                    'deleted': deleted_count,
                    'created': created_count,
                    'messages_processed': len(messages),
                    'days_covered': len(daily_messages)
                }
                
        except Exception as e:
            print(f"[MOOD TRACKER] Error re-analyzing history: {e}")
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'error': str(e)
            }
        finally:
            if conn:
                conn.close()

    def get_mood_trends(self, user_id: int, days: int = 7) -> Dict[str, any]:
        """
        Get detailed mood trends over time for visualization
        
        Args:
            user_id: User ID to analyze
            days: Number of days to look back
            
        Returns:
            Time-series data for mood visualization
        """
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                time_threshold = datetime.now() - timedelta(days=days)
                
                # Get mood entries with timestamps
                cur.execute("""
                    SELECT 
                        mood, sentiment_score, detected_emotions, created_at,
                        DATE(created_at) as mood_date,
                        HOUR(created_at) as mood_hour
                    FROM user_moods
                    WHERE user_id = %s AND created_at >= %s
                    ORDER BY created_at ASC
                """, (user_id, time_threshold))
                
                moods = cur.fetchall()
                
                if not moods:
                    return {
                        'success': True,
                        'has_data': False,
                        'message': 'No mood data for the selected period'
                    }
                
                # Aggregate by day
                daily_data = {}
                for m in moods:
                    date_str = m['mood_date'].isoformat() if m['mood_date'] else 'unknown'
                    if date_str not in daily_data:
                        daily_data[date_str] = {
                            'date': date_str,
                            'positive': 0,
                            'negative': 0,
                            'neutral': 0,
                            'total': 0,
                            'avg_score': 0,
                            'scores': []
                        }
                    
                    daily_data[date_str][m['mood']] += 1
                    daily_data[date_str]['total'] += 1
                    if m['sentiment_score']:
                        daily_data[date_str]['scores'].append(m['sentiment_score'])
                
                # Calculate averages
                timeline = []
                for date_str, data in sorted(daily_data.items()):
                    if data['scores']:
                        data['avg_score'] = round(sum(data['scores']) / len(data['scores']), 2)
                    del data['scores']  # Remove raw scores from response
                    timeline.append(data)
                
                # Calculate overall statistics
                total_entries = len(moods)
                mood_distribution = Counter([m['mood'] for m in moods])
                
                # Calculate trend direction
                if len(timeline) >= 2:
                    recent_avg = timeline[-1]['avg_score'] if timeline[-1]['avg_score'] else 0
                    earlier_avg = timeline[0]['avg_score'] if timeline[0]['avg_score'] else 0
                    if recent_avg > earlier_avg + 0.1:
                        trend_direction = 'improving'
                    elif recent_avg < earlier_avg - 0.1:
                        trend_direction = 'declining'
                    else:
                        trend_direction = 'stable'
                else:
                    trend_direction = 'stable'
                
                return {
                    'success': True,
                    'has_data': True,
                    'period_days': days,
                    'total_entries': total_entries,
                    'timeline': timeline,
                    'distribution': {
                        'positive': mood_distribution.get('positive', 0),
                        'negative': mood_distribution.get('negative', 0),
                        'neutral': mood_distribution.get('neutral', 0)
                    },
                    'trend_direction': trend_direction,
                    'dominant_mood': max(mood_distribution, key=mood_distribution.get) if mood_distribution else 'neutral'
                }
                
        except Exception as e:
            print(f"[MOOD TRACKER] Error fetching mood trends: {e}")
            return {'success': False, 'error': str(e)}
        finally:
            if conn:
                conn.close()

    def get_community_mood(self, community_id: int = None, channel_id: int = None, 
                          hours: int = 24) -> Dict[str, any]:
        """
        Get aggregated mood analytics for a community or channel
        
        Args:
            community_id: Optional community ID filter
            channel_id: Optional channel ID filter
            hours: Hours to look back
            
        Returns:
            Community-wide mood statistics
        """
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                time_threshold = datetime.now() - timedelta(hours=hours)
                
                # Build query based on filters
                if channel_id:
                    query = """
                        SELECT m.content, m.created_at, m.sender_id, u.username
                        FROM messages m
                        JOIN users u ON m.sender_id = u.id
                        WHERE m.channel_id = %s AND m.created_at >= %s
                        ORDER BY m.created_at DESC
                        LIMIT 500
                    """
                    params = (channel_id, time_threshold)
                elif community_id:
                    query = """
                        SELECT m.content, m.created_at, m.sender_id, u.username
                        FROM messages m
                        JOIN channels c ON m.channel_id = c.id
                        JOIN users u ON m.sender_id = u.id
                        WHERE c.community_id = %s AND m.created_at >= %s
                        ORDER BY m.created_at DESC
                        LIMIT 500
                    """
                    params = (community_id, time_threshold)
                else:
                    return {'success': False, 'error': 'community_id or channel_id required'}
                
                cur.execute(query, params)
                messages = cur.fetchall()
                
                if not messages:
                    return {
                        'success': True,
                        'has_data': False,
                        'message': 'No messages found in time period'
                    }
                
                # Analyze each message
                user_sentiments = {}
                all_sentiments = []
                mood_categories_total = Counter()
                hourly_mood = {}
                
                for msg in messages:
                    analysis = self.analyze_message(msg['content'])
                    all_sentiments.append(analysis['sentiment'])
                    
                    # Track by user
                    user_id = msg['sender_id']
                    if user_id not in user_sentiments:
                        user_sentiments[user_id] = {
                            'username': msg['username'],
                            'positive': 0,
                            'negative': 0,
                            'neutral': 0,
                            'total': 0
                        }
                    user_sentiments[user_id][analysis['sentiment']] += 1
                    user_sentiments[user_id]['total'] += 1
                    
                    # Track mood categories
                    if analysis.get('mood_categories'):
                        for mood, count in analysis['mood_categories'].items():
                            mood_categories_total[mood] += count
                    
                    # Track by hour
                    hour_key = msg['created_at'].strftime('%H:00')
                    if hour_key not in hourly_mood:
                        hourly_mood[hour_key] = []
                    hourly_mood[hour_key].append(analysis['sentiment'])
                
                # Calculate overall statistics
                total = len(all_sentiments)
                sentiment_counts = Counter(all_sentiments)
                
                # Calculate dominant mood per hour
                hourly_summary = []
                for hour in sorted(hourly_mood.keys()):
                    counts = Counter(hourly_mood[hour])
                    dominant = max(counts, key=counts.get)
                    hourly_summary.append({
                        'hour': hour,
                        'dominant_mood': dominant,
                        'message_count': len(hourly_mood[hour])
                    })
                
                # Find most positive and most negative users
                user_list = list(user_sentiments.values())
                if user_list:
                    # Calculate positivity ratio for each user
                    for user in user_list:
                        if user['total'] > 0:
                            user['positivity_ratio'] = round(user['positive'] / user['total'], 2)
                        else:
                            user['positivity_ratio'] = 0.5
                    
                    most_positive = max(user_list, key=lambda x: x['positivity_ratio'])
                    most_negative = min(user_list, key=lambda x: x['positivity_ratio'])
                else:
                    most_positive = None
                    most_negative = None
                
                return {
                    'success': True,
                    'has_data': True,
                    'period_hours': hours,
                    'total_messages': total,
                    'unique_users': len(user_sentiments),
                    'sentiment_distribution': {
                        'positive': sentiment_counts.get('positive', 0),
                        'negative': sentiment_counts.get('negative', 0),
                        'neutral': sentiment_counts.get('neutral', 0)
                    },
                    'sentiment_percentages': {
                        'positive': round(sentiment_counts.get('positive', 0) / total * 100, 1),
                        'negative': round(sentiment_counts.get('negative', 0) / total * 100, 1),
                        'neutral': round(sentiment_counts.get('neutral', 0) / total * 100, 1)
                    },
                    'dominant_mood': max(sentiment_counts, key=sentiment_counts.get),
                    'mood_categories': dict(mood_categories_total.most_common(5)),
                    'hourly_summary': hourly_summary,
                    'most_positive_user': most_positive['username'] if most_positive else None,
                    'most_concerned_user': most_negative['username'] if most_negative and most_negative['positivity_ratio'] < 0.3 else None
                }
                
        except Exception as e:
            print(f"[MOOD TRACKER] Error getting community mood: {e}")
            return {'success': False, 'error': str(e)}
        finally:
            if conn:
                conn.close()

    def get_wellness_recommendations(self, user_id: int) -> Dict[str, any]:
        """
        Generate wellness recommendations based on recent mood patterns
        
        Args:
            user_id: User ID to analyze
            
        Returns:
            Personalized wellness recommendations
        """
        # Get recent mood trends
        trends = self.get_mood_trends(user_id, days=7)
        
        if not trends.get('has_data'):
            return {
                'success': True,
                'has_recommendations': False,
                'message': 'Track your mood more to get personalized recommendations'
            }
        
        recommendations = []
        alerts = []
        
        # Check for concerning patterns
        distribution = trends.get('distribution', {})
        total = sum(distribution.values())
        
        if total > 0:
            negative_ratio = distribution.get('negative', 0) / total
            
            # High negative mood pattern
            if negative_ratio > 0.5:
                alerts.append({
                    'type': 'high_negativity',
                    'severity': 'warning',
                    'message': 'Your recent messages show higher than usual negative sentiment'
                })
                recommendations.extend([
                    '🧘 Consider taking a short break from screens',
                    '🌳 Try spending some time outdoors',
                    '💬 Reach out to a friend or loved one',
                    '📝 Write down what\'s bothering you'
                ])
            
            # Check for declining trend
            if trends.get('trend_direction') == 'declining':
                alerts.append({
                    'type': 'declining_mood',
                    'severity': 'info',
                    'message': 'Your mood has been declining over the past week'
                })
                recommendations.extend([
                    '😴 Make sure you\'re getting enough sleep',
                    '🏃 Physical activity can help improve mood',
                    '🎵 Listen to some uplifting music'
                ])
            
            # Positive feedback for good mood
            if negative_ratio < 0.2 and trends.get('trend_direction') == 'improving':
                recommendations.extend([
                    '✨ Great job! Your mood has been positive',
                    '🎯 Keep up the positive interactions',
                    '🤝 Share your positivity with others'
                ])
        
        # Default recommendations
        if not recommendations:
            recommendations = [
                '💭 Regular check-ins help track emotional patterns',
                '🎯 Set small daily goals for a sense of accomplishment',
                '🙏 Practice gratitude by noting things you\'re thankful for'
            ]
        
        return {
            'success': True,
            'has_recommendations': True,
            'mood_summary': {
                'dominant_mood': trends.get('dominant_mood'),
                'trend': trends.get('trend_direction'),
                'period_days': trends.get('period_days')
            },
            'alerts': alerts,
            'recommendations': recommendations[:5]  # Limit to 5 recommendations
        }

    def get_mood_insights(self, user_id: int) -> Dict[str, any]:
        """
        Generate detailed insights about user's mood patterns
        
        Args:
            user_id: User ID to analyze
            
        Returns:
            Comprehensive mood insights
        """
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                # Get last 30 days of mood data
                time_threshold = datetime.now() - timedelta(days=30)
                
                cur.execute("""
                    SELECT 
                        mood, sentiment_score, detected_emotions, created_at,
                        DAYNAME(created_at) as day_name,
                        HOUR(created_at) as hour_of_day
                    FROM user_moods
                    WHERE user_id = %s AND created_at >= %s
                    ORDER BY created_at ASC
                """, (user_id, time_threshold))
                
                moods = cur.fetchall()
                
                if not moods:
                    return {
                        'success': True,
                        'has_insights': False,
                        'message': 'Need more mood data for insights'
                    }
                
                # Analyze by day of week
                day_mood = {}
                for m in moods:
                    day = m['day_name']
                    if day not in day_mood:
                        day_mood[day] = []
                    day_mood[day].append(m['mood'])
                
                # Find best and worst days
                day_positivity = {}
                for day, moods_list in day_mood.items():
                    total = len(moods_list)
                    positive = moods_list.count('positive')
                    day_positivity[day] = positive / total if total > 0 else 0.5
                
                best_day = max(day_positivity, key=day_positivity.get) if day_positivity else None
                worst_day = min(day_positivity, key=day_positivity.get) if day_positivity else None
                
                # Analyze by hour
                hour_mood = {}
                for m in moods:
                    hour = m['hour_of_day']
                    if hour not in hour_mood:
                        hour_mood[hour] = []
                    hour_mood[hour].append(m['mood'])
                
                # Find peak positive hours
                hour_positivity = {}
                for hour, moods_list in hour_mood.items():
                    total = len(moods_list)
                    positive = moods_list.count('positive')
                    hour_positivity[hour] = positive / total if total > 0 else 0.5
                
                best_hours = sorted(hour_positivity.items(), key=lambda x: x[1], reverse=True)[:3]
                
                # Generate insights
                insights = []
                
                if best_day:
                    insights.append(f"You tend to be most positive on {best_day}s")
                
                if worst_day and worst_day != best_day:
                    insights.append(f"You might need extra self-care on {worst_day}s")
                
                if best_hours:
                    peak_hour = best_hours[0][0]
                    if peak_hour < 12:
                        insights.append("You're a morning person - your mood peaks before noon")
                    elif peak_hour < 18:
                        insights.append("Afternoon is your prime time for positive interactions")
                    else:
                        insights.append("You tend to be more positive in the evenings")
                
                return {
                    'success': True,
                    'has_insights': True,
                    'period_days': 30,
                    'total_analyses': len(moods),
                    'day_analysis': {
                        'best_day': best_day,
                        'worst_day': worst_day,
                        'by_day': day_positivity
                    },
                    'time_analysis': {
                        'peak_hours': [{'hour': h, 'positivity': round(p, 2)} for h, p in best_hours]
                    },
                    'insights': insights
                }
                
        except Exception as e:
            print(f"[MOOD TRACKER] Error generating insights: {e}")
            return {'success': False, 'error': str(e)}
        finally:
            if conn:
                conn.close()
