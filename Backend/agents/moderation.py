"""
Smart Moderation Agent for AuraFlow
Hybrid Gemini AI + keyword-based content moderation with Roman Urdu support
"""

import json
import os
import re
import time
import hashlib
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from collections import Counter

from database import get_db_connection

# Module-level lexicon cache — loaded once, shared by all ModerationAgent instances
_lexicon_cache = None
_lexicon_path = os.path.join(os.path.dirname(__file__), '..', 'lexicons', 'moderation_keywords.json')

def _load_lexicon():
    global _lexicon_cache
    if _lexicon_cache is not None:
        return _lexicon_cache
    try:
        with open(_lexicon_path, 'r', encoding='utf-8') as f:
            _lexicon_cache = json.load(f)
        print("[MODERATION] Lexicons loaded and cached at module level")
    except Exception as e:
        print(f"[MODERATION] Error loading lexicons: {e}")
        _lexicon_cache = {}
    return _lexicon_cache


# ── Gemini AI integration (following summarizer.py pattern) ──
_gemini_client = None
_GEMINI_MODERATION_AVAILABLE = False

try:
    from google import genai
    from google.genai import errors as genai_errors
    from config import GEMINI_API_KEY
    _GEMINI_MODERATION_AVAILABLE = bool(GEMINI_API_KEY)
    if _GEMINI_MODERATION_AVAILABLE:
        _gemini_client = genai.Client(api_key=GEMINI_API_KEY)
        print("[MODERATION] ✅ Gemini AI client initialized for moderation")
    else:
        print("[MODERATION] ⚠️ No GEMINI_API_KEY — using keyword-only mode")
except ImportError:
    print("[MODERATION] ⚠️ google-genai not installed — using keyword-only mode")
except Exception as e:
    print(f"[MODERATION] ⚠️ Gemini init error: {e} — using keyword-only mode")


# ── Gemini result cache (TTL-based) ──
_gemini_cache: Dict[str, Tuple[dict, float]] = {}
_CACHE_TTL = 300   # 5 minutes
_CACHE_MAX = 100

def _cache_get(text: str) -> Optional[dict]:
    """Get cached Gemini result if still valid"""
    key = hashlib.sha256(text.encode('utf-8')).hexdigest()
    if key in _gemini_cache:
        result, ts = _gemini_cache[key]
        if time.time() - ts < _CACHE_TTL:
            return result
        del _gemini_cache[key]
    return None

def _cache_set(text: str, result: dict):
    """Cache a Gemini result with TTL"""
    global _gemini_cache
    if len(_gemini_cache) >= _CACHE_MAX:
        # Evict oldest entry
        oldest_key = min(_gemini_cache, key=lambda k: _gemini_cache[k][1])
        del _gemini_cache[oldest_key]
    key = hashlib.sha256(text.encode('utf-8')).hexdigest()
    _gemini_cache[key] = (result, time.time())


# ── Gemini moderation prompt (SINGLE message, kept for backward compat) ──
_GEMINI_MODERATION_PROMPT = """You are a content moderation AI for a community chat platform called AuraFlow.
Analyze the following message and determine if it violates community guidelines.

IMPORTANT CONTEXT:
- This is a casual chat platform. Users use slang, sarcasm, and informal language.
- Common positive/neutral uses of words should NOT be flagged:
  - "I killed it" (did well), "that's sick" (cool), "you're a beast" (impressive)
  - "I'm dead" (laughing), "fire" (awesome), "savage" (bold/impressive)
  - "slaying it", "crushed it", "destroyed the competition", "you're insane" (compliment)
  - "no cap", "bruh", "damn that's cool", "holy crap", "what the heck"
- Code snippets, programming terms (kill -9, exec, abort, crash, dump) are NOT violations.
- Focus on INTENT and CONTEXT, not just individual keywords.
- Support multiple languages including Roman Urdu (transliterated Urdu in English script) and Hinglish.
- Only flag content with genuinely harmful intent: actual abuse directed at a person, real threats, actual hate speech, real harassment.
- Mild swearing in casual conversation without targeting anyone should be "none" or "low" severity at most.

MESSAGE: "{message_text}"

Respond ONLY with valid JSON (no markdown fences, no explanation outside JSON):
{{"toxic": boolean, "category": "none" | "profanity" | "hate_speech" | "harassment" | "spam" | "threats" | "sexual_content", "confidence": float_0_to_1, "severity": "none" | "low" | "medium" | "high" | "critical", "explanation": "brief reason"}}"""


# ── Gemini BATCH moderation prompt ──
_GEMINI_BATCH_PROMPT = """You are a content moderation AI for a community chat platform called AuraFlow.
Analyze the following batch of chat messages IN CONTEXT and determine which ones violate community guidelines.

IMPORTANT RULES:
- This is a casual chat platform. Users use slang, sarcasm, and informal language.
- Common positive/neutral expressions should NOT be flagged:
  "I killed it" (did well), "that's sick" (cool), "you're a beast" (impressive),
  "I'm dead" (laughing), "fire" (awesome), "no cap", "bruh", etc.
- Code snippets and programming terms (kill -9, exec, abort, crash) are NOT violations.
- Focus on INTENT and CONTEXT across the conversation. A message that looks threatening alone might be a joke in context.
- Support multiple languages: English, Roman Urdu (transliterated Urdu in English script), Hinglish, etc.
- Only flag content with GENUINELY harmful intent: real abuse directed at a person, real threats, actual hate speech, actual harassment, spam, or sharing personal info.
- Mild swearing without targeting anyone is NOT a violation.
- If someone says "mazak hai" / "just kidding" / "jk" — consider context but still flag if the content is genuinely harmful.

MESSAGES:
{messages_block}

Respond with a JSON array containing ONLY the messages that violate guidelines.
Clean messages should be OMITTED entirely.
Each entry must have: msg_index (the number from the list), action ("warn"|"flag"|"block"), severity ("low"|"medium"|"high"|"critical"), category ("profanity"|"hate_speech"|"harassment"|"spam"|"threats"|"sexual_content"), confidence (0.0-1.0), explanation (brief reason).

If ALL messages are clean, return an empty array: []

Respond ONLY with valid JSON array (no markdown fences, no text outside JSON):"""


# ── Instant-block list: only the most extreme content gets blocked before broadcast ──
_INSTANT_BLOCK_WORDS = {
    # Extreme slurs / hate (English)
    'nigger', 'niggers', 'n1gger', 'n1ggers', 'faggot', 'faggots', 'f4ggot',
    'kike', 'kikes', 'chink', 'chinks', 'spic', 'spics', 'wetback', 'wetbacks',
    # Extreme slurs (Roman Urdu)
    'madarchod', 'maderchod', 'bhenchod', 'bhosdike', 'bhosdiwale',
    'chutiya', 'chutiye', 'harami', 'haramzada', 'haramzade',
    'randi', 'randibaaz', 'gaandu', 'gandu',
    # Extreme threats
    'i will kill you', 'ill kill you', 'gonna kill you',
    'jaan se maar dunga', 'jaan se mardunga', 'qatal kar dunga',
    'zinda nahi chorunga', 'zinda jala dunga',
}


class ModerationAgent:
    """
    Batch Gemini AI moderation with conversation context.
    
    Architecture:
      1. instant_check() — tiny instant-block list for extreme content (<1ms)
      2. Messages broadcast immediately after instant check
      3. Messages pushed to Redis buffer per channel
      4. When buffer reaches BATCH_SIZE or BATCH_TIMEOUT, Celery fires batch_gemini_review()
      5. Gemini reviews the batch with full conversation context
      6. Retroactive socket events sent for any flagged messages
    """
    
    BATCH_SIZE = 10        # Max messages per batch
    BATCH_TIMEOUT = 30     # Seconds before flushing a partial buffer
    BUFFER_KEY_PREFIX = 'mod:buffer:'       # Redis key prefix for message buffers
    BUFFER_TS_PREFIX = 'mod:buffer_ts:'     # Redis key prefix for buffer timestamps
    
    def __init__(self):
        """Initialize the moderation agent"""
        self.lexicon = _load_lexicon()
        self.gemini_available = _GEMINI_MODERATION_AVAILABLE
        self.gemini_client = _gemini_client
        self.gemini_model = 'gemini-2.5-flash'

    # ── Phase 1: Instant check (pre-broadcast) ──────────────────────────

    def instant_check(self, text: str, user_id=None, channel_id=None) -> Dict[str, any]:  # NEW — v2: added user_id, channel_id optional kwargs
        """
        Ultra-fast pre-broadcast check (<1ms). Only blocks extreme content.
        Returns {'block': True/False, 'reason': str}.
        Everything else is allowed through and reviewed by Gemini in batch.
        user_id / channel_id are optional — if provided, spam_check and scam_check also run.
        """
        text_lower = text.lower().strip()
        
        if len(text_lower) < 3:
            return {'block': False, 'reason': ''}
        
        # Check multi-word phrases first
        for phrase in _INSTANT_BLOCK_WORDS:
            if ' ' in phrase and phrase in text_lower:
                return {'block': True, 'reason': f'Extreme content detected: {phrase[:20]}'}
        
        # Check single words with word boundaries
        words_in_text = set(re.findall(r'\b\w+\b', text_lower))
        single_block_words = {w for w in _INSTANT_BLOCK_WORDS if ' ' not in w}
        matches = words_in_text & single_block_words
        if matches:
            return {'block': True, 'reason': f'Extreme content detected'}
        
        # Check personal info (immediate flag)
        personal_info = self._check_personal_info(text)
        if personal_info['detected']:
            return {'block': False, 'flag_personal_info': True,
                    'personal_info_types': personal_info['types'],
                    'reason': 'Personal information detected'}

        # NEW — v2: spam check (skipped gracefully when user_id or channel_id is None)
        if user_id is not None and channel_id is not None:
            spam = self.spam_check(user_id, channel_id, text)
            if spam.get('block') or spam.get('warn'):
                return spam

        # NEW — v2: scam check (pure regex, always runs)
        scam = self.scam_check(text)
        if scam.get('flag'):
            return scam

        return {'block': False, 'reason': ''}

    # ── Phase 2: Redis buffer operations ─────────────────────────────────

    def push_to_buffer(self, channel_id: int, message_data: dict) -> int:
        """
        Push a message to the channel's moderation buffer in Redis.
        Returns the current buffer length.
        message_data should have: {msg_id, user_id, username, content, timestamp}
        """
        from services.redis_client import get_redis
        r = get_redis()
        if r is None:
            return 0
        
        buffer_key = f'{self.BUFFER_KEY_PREFIX}{channel_id}'
        ts_key = f'{self.BUFFER_TS_PREFIX}{channel_id}'
        
        r.rpush(buffer_key, json.dumps(message_data))
        # Set timestamp on first message in buffer
        if not r.exists(ts_key):
            r.set(ts_key, time.time(), ex=self.BATCH_TIMEOUT * 6)
        
        # Set expiry on buffer key as safety net
        r.expire(buffer_key, self.BATCH_TIMEOUT * 6 + 60)
        
        return r.llen(buffer_key)

    def drain_buffer(self, channel_id: int) -> list:
        """
        Atomically drain the channel's buffer. Returns list of message dicts.
        Uses LRANGE + DELETE in a pipeline for atomicity.
        """
        from services.redis_client import get_redis
        r = get_redis()
        if r is None:
            return []
        
        buffer_key = f'{self.BUFFER_KEY_PREFIX}{channel_id}'
        ts_key = f'{self.BUFFER_TS_PREFIX}{channel_id}'
        
        pipe = r.pipeline()
        pipe.lrange(buffer_key, 0, -1)
        pipe.delete(buffer_key)
        pipe.delete(ts_key)
        results = pipe.execute()
        
        raw_messages = results[0]  # lrange result
        messages = []
        for raw in raw_messages:
            try:
                messages.append(json.loads(raw))
            except (json.JSONDecodeError, TypeError):
                continue
        return messages

    def should_flush(self, channel_id: int) -> bool:
        """Check if buffer should be flushed (size >= BATCH_SIZE or timeout)."""
        from services.redis_client import get_redis
        r = get_redis()
        if r is None:
            return False
        
        buffer_key = f'{self.BUFFER_KEY_PREFIX}{channel_id}'
        ts_key = f'{self.BUFFER_TS_PREFIX}{channel_id}'
        
        buf_len = r.llen(buffer_key)
        if buf_len >= self.BATCH_SIZE:
            return True
        
        ts_raw = r.get(ts_key)
        if ts_raw and buf_len > 0:
            first_ts = float(ts_raw)
            if (time.time() - first_ts) >= self.BATCH_TIMEOUT:
                return True
        
        return False

    def get_stale_channels(self) -> list:
        """
        Find all channel buffers that have timed out. Used by periodic flush task.
        Returns list of channel_ids that need flushing.
        """
        from services.redis_client import get_redis
        r = get_redis()
        if r is None:
            return []
        
        stale = []
        # Scan for all buffer timestamp keys
        cursor = 0
        while True:
            cursor, keys = r.scan(cursor, match=f'{self.BUFFER_TS_PREFIX}*', count=100)
            for ts_key in keys:
                try:
                    channel_id = int(ts_key.replace(self.BUFFER_TS_PREFIX, ''))
                    ts_raw = r.get(ts_key)
                    if ts_raw:
                        first_ts = float(ts_raw)
                        buf_key = f'{self.BUFFER_KEY_PREFIX}{channel_id}'
                        buf_len = r.llen(buf_key)
                        if buf_len > 0 and (time.time() - first_ts) >= self.BATCH_TIMEOUT:
                            stale.append(channel_id)
                except (ValueError, TypeError):
                    continue
            if cursor == 0:
                break
        return stale

    # ── Phase 3: Batch Gemini review ─────────────────────────────────────

    def batch_gemini_review(self, messages: list) -> list:
        """
        Send a batch of messages to Gemini for contextual moderation.
        
        Args:
            messages: list of dicts with {msg_id, user_id, username, content}
        
        Returns:
            list of violation dicts: [{msg_index, msg_id, user_id, action, severity,
                                       category, confidence, explanation}, ...]
            Empty list if all messages are clean.
        """
        if not messages:
            return []
        
        if not self.gemini_available or not self.gemini_client:
            print("[MODERATION] Gemini unavailable for batch review")
            return []
        
        # Build the messages block for the prompt
        lines = []
        for i, msg in enumerate(messages):
            username = msg.get('username', 'Unknown')
            content = msg.get('content', '')[:500]  # Truncate long messages
            lines.append(f"[{i}] {username}: {content}")
        
        messages_block = '\n'.join(lines)
        prompt = _GEMINI_BATCH_PROMPT.replace('{messages_block}', messages_block)
        
        try:
            from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
            start = time.time()
            
            def _call():
                return self.gemini_client.models.generate_content(
                    model=self.gemini_model,
                    contents=prompt,
                    config={
                        "response_mime_type": "application/json",
                        "temperature": 0.1,
                    }
                )
            
            # Batch gets more time than single message (15s)
            with ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(_call)
                response = future.result(timeout=15.0)
            
            elapsed_ms = int((time.time() - start) * 1000)
            
            if not response or not response.text:
                print(f"[MODERATION] Gemini batch returned empty response")
                return []
            
            raw = response.text.strip()
            # Strip markdown fences if present
            if raw.startswith("```"):
                raw = re.sub(r'^```(?:json)?\s*', '', raw)
                raw = re.sub(r'\s*```$', '', raw)
            
            verdicts = json.loads(raw)
            
            if not isinstance(verdicts, list):
                print(f"[MODERATION] Gemini batch returned non-array: {raw[:200]}")
                return []
            
            # Enrich verdicts with msg_id and user_id from original messages
            enriched = []
            for v in verdicts:
                idx = v.get('msg_index')
                if idx is None or idx < 0 or idx >= len(messages):
                    continue
                
                action = v.get('action', 'warn')
                if action not in ('warn', 'flag', 'block'):
                    action = 'warn'
                
                enriched.append({
                    'msg_index': idx,
                    'msg_id': messages[idx].get('msg_id'),
                    'user_id': messages[idx].get('user_id'),
                    'username': messages[idx].get('username', 'Unknown'),
                    'content': messages[idx].get('content', '')[:200],
                    'action': action,
                    'severity': v.get('severity', 'low'),
                    'category': v.get('category', 'unknown'),
                    'confidence': float(v.get('confidence', 0.5)),
                    'explanation': v.get('explanation', ''),
                })
            
            flagged_count = len(enriched)
            total_count = len(messages)
            print(f"[MODERATION] Gemini batch review ({elapsed_ms}ms): "
                  f"{flagged_count}/{total_count} messages flagged")
            
            return enriched
            
        except FuturesTimeout:
            print(f"[MODERATION] Gemini batch timed out (>15s)")
            return None  # None = failure (distinct from [] = all clean)
        except json.JSONDecodeError as e:
            print(f"[MODERATION] Gemini batch JSON parse error: {e}")
            return None
        except Exception as e:
            print(f"[MODERATION] Gemini batch error: {e}")
            return None

    # ── Legacy single-message Gemini review (backward compat) ────────────

    def _analyze_with_gemini(self, text: str) -> Optional[dict]:
        """Call Gemini API for single-message analysis with caching and 2s timeout"""
        if not self.gemini_available or not self.gemini_client:
            return None

        cached = _cache_get(text)
        if cached is not None:
            return cached

        try:
            from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
            start = time.time()
            prompt = _GEMINI_MODERATION_PROMPT.replace("{message_text}", text[:500])

            def _call():
                return self.gemini_client.models.generate_content(
                    model=self.gemini_model,
                    contents=prompt,
                    config={
                        "response_mime_type": "application/json",
                        "temperature": 0.1,
                    }
                )

            with ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(_call)
                response = future.result(timeout=2.0)

            elapsed_ms = int((time.time() - start) * 1000)

            if response and response.text:
                raw = response.text.strip()
                if raw.startswith("```"):
                    raw = re.sub(r'^```(?:json)?\s*', '', raw)
                    raw = re.sub(r'\s*```$', '', raw)
                result = json.loads(raw)
                if 'toxic' in result and 'confidence' in result:
                    _cache_set(text, result)
                    return result
            return None
        except Exception:
            return None

    def gemini_review(self, text: str, message_id: int, user_id: int,
                      channel_id: int, keyword_scores: dict,
                      keyword_reasons: list) -> Optional[Dict]:
        """
        Single-message Gemini review. Kept for backward compatibility.
        New code should use batch_gemini_review() instead.
        """
        gemini_result = self._analyze_with_gemini(text)
        
        if not gemini_result or gemini_result.get('confidence', 0) <= 0.5:
            return None
        
        if not gemini_result.get('toxic', False):
            return None
        
        gemini_severity = gemini_result.get('severity', 'low')
        gemini_category = gemini_result.get('category', 'none')
        gemini_conf = gemini_result.get('confidence', 0.5)
        
        reasons = list(keyword_reasons) if keyword_reasons else []
        if gemini_category != 'none' and gemini_category not in reasons:
            reasons.insert(0, gemini_category)
        
        if gemini_severity == 'critical' or gemini_conf >= 0.9:
            action = 'block'
            severity = 'critical' if gemini_severity == 'critical' else 'high'
        elif gemini_severity == 'high' or gemini_conf >= 0.75:
            action = 'flag'
            severity = 'high'
        elif gemini_severity == 'medium' or gemini_conf >= 0.6:
            action = 'flag'
            severity = 'medium'
        else:
            action = 'warn'
            severity = 'low'
        
        return {
            'action': action,
            'severity': severity,
            'reasons': reasons,
            'explanation': gemini_result.get('explanation', ''),
            'moderation_source': 'gemini',
            'confidence': round(gemini_conf, 2)
        }

    # ── Helpers ──────────────────────────────────────────────────────────

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
                     input_text, output_text, confidence_score,
                     agent_name, input_data, output_data, status, execution_time_ms)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s,
                            %s, %s, %s, %s, %s)
                """, (
                    agent_id, user_id, db_channel_id, message_id, 'moderation',
                    message[:500],  # Truncate long messages
                    json.dumps(output_data),
                    confidence,
                    'moderation',
                    json.dumps({'text': message[:200], 'user_id': user_id, 'channel_id': db_channel_id}),
                    json.dumps(output_data),
                    'success',
                    0
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

    # ── NEW — v2: Spam detection ──────────────────────────────────────────

    def spam_check(self, user_id, channel_id, content) -> dict:  # NEW — v2
        """
        NEW — v2: Redis-based spam detection using flood and duplicate checks.
        Returns {'block': bool, 'warn': bool, 'reason': str, 'category': 'spam'}
        Never raises — returns safe default on any Redis failure.
        """
        try:
            import uuid  # NEW — v2
            from services.redis_client import get_redis  # NEW — v2
            r = get_redis()  # NEW — v2
            if r is None:  # NEW — v2
                return {'block': False, 'warn': False, 'reason': '', 'category': 'spam'}  # NEW — v2

            spam_cfg = self.lexicon.get('spam_patterns', {})  # NEW — v2
            max_per_10s = spam_cfg.get('max_messages_per_10s', 5)  # NEW — v2
            max_dups = spam_cfg.get('max_duplicates_per_minute', 2)  # NEW — v2

            # Flood detection: sorted set with 10-second sliding window  # NEW — v2
            flood_key = f'mod:flood:{channel_id}:{user_id}'  # NEW — v2
            now = time.time()  # NEW — v2
            window_start = now - 10  # NEW — v2
            msg_uuid = str(uuid.uuid4())  # NEW — v2

            pipe = r.pipeline()  # NEW — v2
            pipe.zremrangebyscore(flood_key, '-inf', window_start)  # NEW — v2
            pipe.zadd(flood_key, {msg_uuid: now})  # NEW — v2
            pipe.zcard(flood_key)  # NEW — v2
            pipe.expire(flood_key, 15)  # NEW — v2
            results = pipe.execute()  # NEW — v2
            msg_count = results[2]  # NEW — v2

            if msg_count > max_per_10s:  # NEW — v2
                return {'block': True, 'warn': False, 'reason': 'spam_flood', 'category': 'spam'}  # NEW — v2

            # Duplicate detection: counter with 60-second TTL  # NEW — v2
            content_hash = hashlib.sha256(content.lower().strip().encode('utf-8')).hexdigest()  # NEW — v2
            dup_key = f'mod:dup:{channel_id}:{content_hash}'  # NEW — v2
            count = r.incr(dup_key)  # NEW — v2
            if count == 1:  # NEW — v2
                r.expire(dup_key, 60)  # NEW — v2

            if count > max_dups:  # NEW — v2
                return {'block': False, 'warn': True, 'reason': 'duplicate_spam', 'category': 'spam'}  # NEW — v2

            return {'block': False, 'warn': False, 'reason': '', 'category': 'spam'}  # NEW — v2

        except Exception as e:  # NEW — v2
            print(f"[MODERATION] spam_check error (non-fatal): {e}")  # NEW — v2
            return {'block': False, 'warn': False, 'reason': '', 'category': 'spam'}  # NEW — v2

    # ── NEW — v2: Scam detection ──────────────────────────────────────────

    def scam_check(self, content) -> dict:  # NEW — v2
        """
        NEW — v2: Pure regex scam detection against scam_patterns from the lexicon.
        No Redis, no DB, no Gemini. < 1ms.
        Returns {'block': False, 'flag': bool, 'reason': str, 'category': 'scam', 'confidence': float}
        """
        scam_patterns = self.lexicon.get('scam_patterns', {})  # NEW — v2
        content_lower = content.lower().strip()  # NEW — v2

        for pattern_category, patterns in scam_patterns.items():  # NEW — v2
            if not isinstance(patterns, list):  # NEW — v2
                continue  # NEW — v2
            for pattern in patterns:  # NEW — v2
                try:  # NEW — v2
                    if re.search(pattern, content_lower, re.IGNORECASE):  # NEW — v2
                        return {  # NEW — v2
                            'block': False, 'flag': True,  # NEW — v2
                            'reason': pattern_category,  # NEW — v2
                            'category': 'scam',  # NEW — v2
                            'confidence': 0.85  # NEW — v2
                        }  # NEW — v2
                except re.error:  # NEW — v2
                    continue  # skip invalid regex  # NEW — v2

        return {'block': False, 'flag': False, 'reason': '', 'category': 'scam', 'confidence': 0.0}  # NEW — v2

    # ── NEW — v2: Historical / retroactive scan ───────────────────────────

    def retroactive_scan(self, channel_id: int, community_id: int,  # NEW — v2
                         hours_back: int = 48, batch_size: int = 10,  # NEW — v2
                         progress_callback=None) -> dict:  # NEW — v2
        """
        NEW — v2: Scan historical messages not yet reviewed by the moderation agent.
        Paginates through the DB, sends batches to Gemini, applies 3-strike logic,
        and emits moderation_retroactive socket events for each violation.
        Skips messages already in ai_agent_logs (action_type='moderation').
        Calls progress_callback(scanned, total, flagged) after every batch.
        Returns: {'scanned': int, 'flagged': int, 'errors': int}
        """
        import os  # NEW — v2
        from flask_socketio import SocketIO as FlaskSocketIO  # NEW — v2

        REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')  # NEW — v2
        sio = FlaskSocketIO(message_queue=REDIS_URL)  # NEW — v2
        room = f"channel_{channel_id}"  # NEW — v2

        MAX_MESSAGES = 500  # NEW — v2
        scanned = 0  # NEW — v2
        flagged = 0  # NEW — v2
        errors = 0  # NEW — v2
        offset = 0  # NEW — v2
        consecutive_gemini_failures = 0  # NEW — v2

        # ── Get total unreviewed message count ────────────────────────────
        total = 0  # NEW — v2
        conn = None  # NEW — v2
        try:  # NEW — v2
            conn = get_db_connection()  # NEW — v2
            with conn.cursor() as cur:  # NEW — v2
                cur.execute("""
                    SELECT COUNT(*) AS cnt
                    FROM messages m
                    WHERE m.channel_id = %s
                      AND m.created_at >= DATE_SUB(NOW(), INTERVAL %s HOUR)
                      AND m.message_type = 'text'
                      AND m.content IS NOT NULL
                      AND m.id NOT IN (
                          SELECT message_id FROM ai_agent_logs
                          WHERE message_id IS NOT NULL
                            AND action_type = 'moderation'
                            AND channel_id = %s
                      )
                """, (channel_id, hours_back, channel_id))  # NEW — v2
                row = cur.fetchone()  # NEW — v2
                total = min(int(row['cnt']) if row else 0, MAX_MESSAGES)  # NEW — v2
        except Exception as e:  # NEW — v2
            print(f"[RETRO_SCAN] Error getting message count for channel {channel_id}: {e}")  # NEW — v2
            return {'scanned': 0, 'flagged': 0, 'errors': 1}  # NEW — v2
        finally:  # NEW — v2
            if conn:  # NEW — v2
                conn.close()  # NEW — v2

        if total == 0:  # NEW — v2
            return {'scanned': 0, 'flagged': 0, 'errors': 0}  # NEW — v2

        # ── Paginated scan loop ───────────────────────────────────────────
        while scanned < MAX_MESSAGES:  # NEW — v2
            conn = None  # NEW — v2
            rows = []  # NEW — v2
            try:  # NEW — v2
                conn = get_db_connection()  # NEW — v2
                with conn.cursor() as cur:  # NEW — v2
                    cur.execute("""
                        SELECT m.id, m.sender_id, m.content, m.created_at, u.username
                        FROM   messages m
                        JOIN   users u ON u.id = m.sender_id
                        WHERE  m.channel_id = %s
                          AND  m.created_at >= DATE_SUB(NOW(), INTERVAL %s HOUR)
                          AND  m.message_type = 'text'
                          AND  m.content IS NOT NULL
                          AND  m.id NOT IN (
                               SELECT message_id FROM ai_agent_logs
                               WHERE  message_id IS NOT NULL
                                 AND  action_type = 'moderation'
                                 AND  channel_id  = %s
                          )
                        ORDER  BY m.created_at ASC
                        LIMIT  %s OFFSET %s
                    """, (channel_id, hours_back, channel_id, batch_size, offset))  # NEW — v2
                    rows = cur.fetchall()  # NEW — v2
            except Exception as e:  # NEW — v2
                print(f"[RETRO_SCAN] DB query error at offset {offset}: {e}")  # NEW — v2
                errors += 1  # NEW — v2
                break  # NEW — v2
            finally:  # NEW — v2
                if conn:  # NEW — v2
                    conn.close()  # NEW — v2

            if not rows:  # NEW — v2
                break  # no more messages  # NEW — v2

            batch = [  # NEW — v2
                {
                    'msg_id': row['id'],  # NEW — v2
                    'user_id': row['sender_id'],  # NEW — v2
                    'username': row.get('username', 'Unknown'),  # NEW — v2
                    'content': row['content'],  # NEW — v2
                    'timestamp': row['created_at'].isoformat() if row.get('created_at') else None  # NEW — v2
                }
                for row in rows  # NEW — v2
            ]  # NEW — v2

            verdicts = self.batch_gemini_review(batch)  # NEW — v2

            if verdicts is None:  # Gemini failure  # NEW — v2
                consecutive_gemini_failures += 1  # NEW — v2
                errors += 1  # NEW — v2
                if consecutive_gemini_failures >= 3:  # NEW — v2
                    print("[RETRO_SCAN] 3 consecutive Gemini failures — aborting scan")  # NEW — v2
                    break  # NEW — v2
                offset += batch_size  # NEW — v2
                scanned += len(batch)  # NEW — v2
                if progress_callback:  # NEW — v2
                    try:  # NEW — v2
                        progress_callback(scanned, total, flagged)  # NEW — v2
                    except Exception:  # NEW — v2
                        pass  # NEW — v2
                continue  # NEW — v2

            consecutive_gemini_failures = 0  # reset on success  # NEW — v2

            # ── Process each violation ────────────────────────────────────
            for v in verdicts:  # NEW — v2
                msg_id = v['msg_id']  # NEW — v2
                user_id = v['user_id']  # NEW — v2
                username = v.get('username', 'Unknown')  # NEW — v2
                action = v['action']  # NEW — v2
                severity = v['severity']  # NEW — v2
                reasons = [v.get('category', 'unknown')]  # NEW — v2
                explanation = v.get('explanation', '')  # NEW — v2
                confidence = float(v.get('confidence', 0.5))  # NEW — v2

                violation_count = 0  # NEW — v2
                is_already_blocked = False  # NEW — v2
                is_owner = False  # NEW — v2
                conn = None  # NEW — v2
                try:  # NEW — v2
                    conn = get_db_connection()  # NEW — v2
                    with conn.cursor() as cur:  # NEW — v2
                        # Guard: already blocked/removed?  # NEW — v2
                        cur.execute(
                            "SELECT id FROM blocked_users WHERE community_id = %s AND user_id = %s LIMIT 1",
                            (community_id, user_id))  # NEW — v2
                        is_already_blocked = cur.fetchone() is not None  # NEW — v2

                        # Guard: community owner?  # NEW — v2
                        cur.execute(
                            "SELECT created_by FROM communities WHERE id = %s LIMIT 1",
                            (community_id,))  # NEW — v2
                        owner_row = cur.fetchone()  # NEW — v2
                        is_owner = bool(owner_row and owner_row.get('created_by') == user_id)  # NEW — v2

                        cur.execute(
                            "SELECT violation_count FROM community_members "
                            "WHERE community_id = %s AND user_id = %s FOR UPDATE",
                            (community_id, user_id))  # NEW — v2
                        member_row = cur.fetchone()  # NEW — v2
                        if member_row:  # NEW — v2
                            violation_count = (member_row.get('violation_count') or 0) + 1  # NEW — v2
                            cur.execute(
                                "UPDATE community_members SET violation_count = %s "
                                "WHERE community_id = %s AND user_id = %s",
                                (violation_count, community_id, user_id))  # NEW — v2

                        # Mark message flagged  # NEW — v2
                        cur.execute(
                            "UPDATE messages SET moderation_flagged = 1, moderation_score = %s WHERE id = %s",
                            (confidence, msg_id))  # NEW — v2

                        cur.execute("""
                            UPDATE community_agents
                            SET usage_count = usage_count + 1, last_active = NOW()
                            WHERE community_id = %s AND agent_type = 'moderation'
                        """, (community_id,))  # NEW — v2
                    conn.commit()  # NEW — v2
                except Exception as db_err:  # NEW — v2
                    print(f"[RETRO_SCAN] DB update failed user={user_id} msg={msg_id}: {db_err}")  # NEW — v2
                finally:  # NEW — v2
                    if conn:  # NEW — v2
                        conn.close()  # NEW — v2

                # Already removed — log only, skip re-emit  # NEW — v2
                if is_already_blocked:  # NEW — v2
                    self.log_moderation_action(  # NEW — v2
                        user_id, channel_id, v.get('content', '')[:500],  # NEW — v2
                        action, severity, reasons, confidence, msg_id)  # NEW — v2
                    flagged += 1  # NEW — v2
                    continue  # NEW — v2

                # 3-strike escalation (mirrors batch_moderation_task)  # NEW — v2
                if violation_count >= 3 and not is_owner:  # NEW — v2
                    final_action = 'remove_user'  # NEW — v2
                    user_message = (f'@{username} has been removed from this community '
                                    f'by the Moderation Agent for repeated violations.')  # NEW — v2
                elif violation_count == 2:  # NEW — v2
                    final_action = 'flag'  # NEW — v2
                    user_message = (f'@{username}, your content has been flagged for repeated violations '
                                    f'(2/3). One more violation will result in removal.')  # NEW — v2
                elif violation_count == 1:  # NEW — v2
                    final_action = 'warn'  # NEW — v2
                    user_message = (f'@{username}, this message may violate community guidelines '
                                    f'({", ".join(reasons)}). Please be mindful.')  # NEW — v2
                else:  # NEW — v2
                    final_action = action  # NEW — v2
                    user_message = f'@{username}, this message was flagged by AI review ({", ".join(reasons)}).'  # NEW — v2

                # Emit retroactive socket events  # NEW — v2
                try:  # NEW — v2
                    if final_action == 'remove_user':  # NEW — v2
                        community_data = None  # NEW — v2
                        try:  # NEW — v2
                            rm_conn = get_db_connection()  # NEW — v2
                            with rm_conn.cursor() as rm_cur:  # NEW — v2
                                rm_cur.execute("SELECT name, logo_url, color, icon FROM communities WHERE id = %s", (community_id,))  # NEW — v2
                                community_data = rm_cur.fetchone()  # NEW — v2
                                rm_cur.execute("INSERT IGNORE INTO blocked_users (community_id, user_id) VALUES (%s, %s)", (community_id, user_id))  # NEW — v2
                                rm_cur.execute("DELETE FROM channel_members WHERE user_id = %s AND channel_id IN (SELECT id FROM channels WHERE community_id = %s)", (user_id, community_id))  # NEW — v2
                                rm_cur.execute("DELETE FROM community_members WHERE community_id = %s AND user_id = %s", (community_id, user_id))  # NEW — v2
                            rm_conn.commit()  # NEW — v2
                            rm_conn.close()  # NEW — v2
                        except Exception as rm_err:  # NEW — v2
                            print(f"[RETRO_SCAN] Remove user DB error: {rm_err}")  # NEW — v2

                        sio.emit('moderation_retroactive', {  # NEW — v2
                            'message_id': msg_id, 'channel_id': channel_id,
                            'user_id': user_id, 'username': username,
                            'action': 'remove_user', 'severity': 'high',
                            'reasons': reasons, 'explanation': explanation,
                            'violation_count': violation_count, 'max_violations': 3,
                            'banner_text': user_message,
                            'timestamp': datetime.utcnow().isoformat()
                        }, room=room, namespace='/')  # NEW — v2

                        sio.emit('moderation_user_removed', {  # NEW — v2
                            'user_id': user_id, 'username': username,
                            'channel_id': channel_id, 'community_id': community_id,
                            'reason': f'Removed for repeated violations: {", ".join(reasons)} (3 strikes)',
                            'removed_by': 'AuraFlow Moderation Agent',
                            'violation_count': violation_count,
                            'timestamp': datetime.utcnow().isoformat()
                        }, room=room, namespace='/')  # NEW — v2

                        sio.emit('community:removed', {  # NEW — v2
                            'community_id': community_id, 'user_id': user_id,
                            'reason': 'violation',
                            'message': 'You were removed from this community for repeated violations (3 strikes).',
                            'notification': {
                                'community_name': community_data['name'] if community_data else 'Community',
                                'community_logo': community_data.get('logo_url') if community_data else None,
                                'community_color': community_data.get('color') if community_data else '#8B5CF6',
                                'community_icon': community_data.get('icon') if community_data else 'AF'
                            }
                        }, room=f"user_{user_id}", namespace='/')  # NEW — v2

                    else:  # warn or flag  # NEW — v2
                        sio.emit('moderation_retroactive', {  # NEW — v2
                            'message_id': msg_id, 'channel_id': channel_id,
                            'user_id': user_id, 'username': username,
                            'action': final_action, 'severity': severity,
                            'reasons': reasons, 'explanation': explanation,
                            'violation_count': violation_count, 'max_violations': 3,
                            'banner_text': user_message,
                            'timestamp': datetime.utcnow().isoformat()
                        }, room=room, namespace='/')  # NEW — v2

                    sio.emit('moderation_action_logged', {  # NEW — v2
                        'community_id': community_id, 'channel_id': channel_id,
                        'action': final_action, 'severity': severity,
                        'timestamp': datetime.utcnow().isoformat()
                    }, room=f"community_{community_id}", namespace='/')  # NEW — v2

                except Exception as emit_err:  # NEW — v2
                    print(f"[RETRO_SCAN] Socket emit failed: {emit_err}")  # NEW — v2

                self.log_moderation_action(  # NEW — v2
                    user_id, channel_id, v.get('content', '')[:500],  # NEW — v2
                    final_action, severity, reasons, confidence, msg_id)  # NEW — v2
                flagged += 1  # NEW — v2

            scanned += len(batch)  # NEW — v2
            offset += batch_size  # NEW — v2

            if progress_callback:  # NEW — v2
                try:  # NEW — v2
                    progress_callback(scanned, total, flagged)  # NEW — v2
                except Exception:  # NEW — v2
                    pass  # NEW — v2

            if len(rows) < batch_size:  # last page reached  # NEW — v2
                break  # NEW — v2

        print(f"[RETRO_SCAN] channel={channel_id} scanned={scanned} flagged={flagged} errors={errors}")  # NEW — v2
        return {'scanned': scanned, 'flagged': flagged, 'errors': errors}  # NEW — v2

