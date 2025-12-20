"""
Text Processor Utility
======================
Clean and prepare text for AI processing
"""

import re
from typing import List, Dict, Optional


class TextProcessor:
    """Handle text cleaning, normalization, and preprocessing"""
    
    def __init__(self):
        self.url_pattern = re.compile(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+')
        self.mention_pattern = re.compile(r'@[\w]+')
        self.emoji_pattern = re.compile(
            "["
            "\U0001F600-\U0001F64F"  # emoticons
            "\U0001F300-\U0001F5FF"  # symbols & pictographs
            "\U0001F680-\U0001F6FF"  # transport & map symbols
            "\U0001F1E0-\U0001F1FF"  # flags (iOS)
            "\U00002702-\U000027B0"
            "\U000024C2-\U0001F251"
            "]+",
            flags=re.UNICODE
        )
    
    def clean_text(self, text: str, remove_urls: bool = True, 
                   remove_mentions: bool = False, 
                   remove_emojis: bool = False) -> str:
        """
        Clean text by removing URLs, mentions, emojis, etc.
        
        Args:
            text: Input text
            remove_urls: Remove URLs
            remove_mentions: Remove @mentions
            remove_emojis: Remove emoji characters
            
        Returns:
            Cleaned text
        """
        if not text:
            return ""
        
        cleaned = text.strip()
        
        # Remove URLs
        if remove_urls:
            cleaned = self.url_pattern.sub('', cleaned)
        
        # Remove mentions
        if remove_mentions:
            cleaned = self.mention_pattern.sub('', cleaned)
        
        # Remove emojis
        if remove_emojis:
            cleaned = self.emoji_pattern.sub('', cleaned)
        
        # Remove extra whitespace
        cleaned = ' '.join(cleaned.split())
        
        return cleaned
    
    def extract_sentences(self, text: str) -> List[str]:
        """
        Split text into sentences
        
        Args:
            text: Input text
            
        Returns:
            List of sentences
        """
        if not text:
            return []
        
        # Simple sentence splitting (can be enhanced with NLTK)
        sentences = re.split(r'[.!?]+', text)
        sentences = [s.strip() for s in sentences if s.strip()]
        
        return sentences
    
    def normalize_roman_urdu(self, text: str) -> str:
        """
        Normalize Roman Urdu text variations
        
        Args:
            text: Roman Urdu text
            
        Returns:
            Normalized text
        """
        if not text:
            return ""
        
        # Common Roman Urdu normalizations
        normalizations = {
            # Normalize repeated characters
            r'(.)\1{2,}': r'\1\1',  # aaa... -> aa
            # Common variations
            r'\bacha+\b': 'acha',
            r'\bbura+\b': 'bura',
            r'\bkha+sh\b': 'khush',
            r'\bkhus+hi+\b': 'khushi',
            r'\bghu+s+a+\b': 'ghussa',
            r'\bparesh+an+\b': 'pareshan',
            r'\bmaz+a+\b': 'maza',
            r'\bbeh+tar+\b': 'behtar',
        }
        
        normalized = text.lower()
        for pattern, replacement in normalizations.items():
            normalized = re.sub(pattern, replacement, normalized)
        
        return normalized
    
    def remove_stopwords(self, text: str, language: str = 'en') -> str:
        """
        Remove common stopwords
        
        Args:
            text: Input text
            language: Language code ('en', 'ur')
            
        Returns:
            Text without stopwords
        """
        # Basic English stopwords
        english_stopwords = {
            'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been',
            'and', 'or', 'but', 'if', 'of', 'at', 'by', 'for', 'with',
            'about', 'as', 'into', 'through', 'to', 'from', 'in', 'on'
        }
        
        # Basic Roman Urdu stopwords
        urdu_stopwords = {
            'hai', 'hain', 'tha', 'the', 'ka', 'ki', 'ke', 'ko', 'se',
            'mein', 'par', 'aur', 'ya', 'nahi', 'bhi', 'jo', 'is'
        }
        
        stopwords = english_stopwords if language == 'en' else urdu_stopwords
        
        words = text.lower().split()
        filtered = [w for w in words if w not in stopwords]
        
        return ' '.join(filtered)
    
    def extract_keywords(self, text: str, top_n: int = 5) -> List[str]:
        """
        Extract top keywords from text (simple frequency-based)
        
        Args:
            text: Input text
            top_n: Number of top keywords to return
            
        Returns:
            List of keywords
        """
        if not text:
            return []
        
        # Clean and split
        cleaned = self.clean_text(text, remove_urls=True, remove_mentions=True)
        words = cleaned.lower().split()
        
        # Count frequencies
        word_freq: Dict[str, int] = {}
        for word in words:
            if len(word) > 3:  # Only words longer than 3 chars
                word_freq[word] = word_freq.get(word, 0) + 1
        
        # Sort by frequency
        sorted_words = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)
        
        return [word for word, _ in sorted_words[:top_n]]
    
    def truncate_text(self, text: str, max_length: int = 200, 
                      suffix: str = "...") -> str:
        """
        Truncate text to max length
        
        Args:
            text: Input text
            max_length: Maximum length
            suffix: Suffix to add when truncated
            
        Returns:
            Truncated text
        """
        if not text or len(text) <= max_length:
            return text
        
        return text[:max_length - len(suffix)].strip() + suffix
