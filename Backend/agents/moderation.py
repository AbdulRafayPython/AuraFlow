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

    def instant_check(self, text: str) -> Dict[str, any]:
        """
        Ultra-fast pre-broadcast check (<1ms). Only blocks extreme content.
        Returns {'block': True/False, 'reason': str}.
        Everything else is allowed through and reviewed by Gemini in batch.
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

