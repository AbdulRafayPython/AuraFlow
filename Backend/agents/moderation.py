"""
Smart Moderation Agent for Auraflow
Hybrid LLM + keyword-based content moderation with Roman Urdu support
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
from agents.base import AutonomousAgent
from agents import event_bus as _event_bus
from agents import memory as _agent_memory
from agents._settings import get_community_settings


_MOD_DEFAULTS = {
    'auto_filter': True,
    'sensitivity': 7,
    'severity_threshold': 'medium',
    'notify_admins': True,
    'roman_urdu_support': True,
    'max_warnings': 3,
}


_SEVERITY_FLOOR = {
    'low': 0.25,
    'medium': 0.5,
    'high': 0.75,
    'critical': 0.9,
}

try:
    from services.platform_config import (
        is_auto_moderation_enabled,
        moderation_confidence_cutoff,
        auto_ban_threshold as _platform_auto_ban_threshold,
    )
except Exception:  # pragma: no cover — keep moderation usable if service not yet importable
    def is_auto_moderation_enabled() -> bool:
        return True
    def moderation_confidence_cutoff() -> float:
        return 0.70
    def _platform_auto_ban_threshold() -> int:
        return 5

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


# ── LLM integration (DeepSeek) ──
_llm_client = None
_LLM_MODERATION_AVAILABLE = False

try:
    from utils.ai.llm_client import get_llm_client, is_llm_available
    _LLM_MODERATION_AVAILABLE = is_llm_available()
    _llm_client = get_llm_client()
    if _LLM_MODERATION_AVAILABLE:
        print("[MODERATION] OK DeepSeek client initialized for moderation")
    else:
        print("[MODERATION] WARN No DEEPSEEK_API_KEY - using keyword-only mode")
except Exception as e:
    print(f"[MODERATION] WARN LLM init error: {e} - using keyword-only mode")


# ── LLM result cache (TTL-based) ──
_llm_cache: Dict[str, Tuple[dict, float]] = {}
_CACHE_TTL = 300   # 5 minutes
_CACHE_MAX = 100

def _cache_get(text: str) -> Optional[dict]:
    """Get cached verdict if still valid"""
    key = hashlib.sha256(text.encode('utf-8')).hexdigest()
    if key in _llm_cache:
        result, ts = _llm_cache[key]
        if time.time() - ts < _CACHE_TTL:
            return result
        del _llm_cache[key]
    return None

def _cache_set(text: str, result: dict):
    """Cache a verdict with TTL"""
    global _llm_cache
    if len(_llm_cache) >= _CACHE_MAX:
        # Evict oldest entry
        oldest_key = min(_llm_cache, key=lambda k: _llm_cache[k][1])
        del _llm_cache[oldest_key]
    key = hashlib.sha256(text.encode('utf-8')).hexdigest()
    _llm_cache[key] = (result, time.time())


# ── Moderation system prompt, shared by the single and batch reviewers ──
# The failure mode this guards against is over-flagging, not under-flagging:
# a false positive puts a warning banner on an innocent member's message and
# is what makes people stop trusting the agent. The instant-block list in
# this module already catches the extreme cases before broadcast, so the
# model's job here is judgement on the ambiguous middle.
_MODERATION_SYSTEM = """You review messages in Auraflow, a casual community chat app, and decide which ones genuinely violate community guidelines.

How people talk here:
- Slang, sarcasm, banter and mild swearing are normal and are not violations.
- Violent-sounding idioms used as praise are not violations: "I killed it", "that's sick", "you're a beast", "I'm dead", "fire", "savage", "slaying it", "crushed it", "destroyed the competition", "you're insane", "no cap", "bruh".
- Programming terms are not violations: kill -9, exec, abort, crash, dump, hang, terminate, fatal, deadlock.
- Messages mix English, Roman Urdu (Urdu typed in Latin script) and Hinglish. Judge the meaning, not the script.

Flag a message only when there is real harm in it:
- abuse aimed at a specific person, not swearing in general
- credible threats of violence
- hate speech targeting a protected group
- sustained harassment
- spam, scams, or someone posting another person's private information

Do not flag:
- swearing that is not aimed at anyone
- self-deprecation or dark humour between friends
- criticism of an idea, a tool, or the work, as opposed to the person
- a single rude word in an otherwise ordinary exchange

Judgement rules:
- Intent and context decide, never the presence of a word.
- "just kidding", "mazak hai", "jk" is evidence of banter, but it does not excuse content that would be harmful regardless.
- If you are genuinely unsure, report a low confidence rather than inventing certainty. Low-confidence verdicts are filtered out by the caller, which is the correct outcome for a borderline message.
- confidence is your actual certainty that this is a real violation, not the severity of the category."""

# ── Single-message prompt (kept for backward compat) ──
_LLM_MODERATION_PROMPT = """MESSAGE: "{message_text}"

Return a JSON object:
{{"toxic": boolean, "category": "none" | "profanity" | "hate_speech" | "harassment" | "spam" | "threats" | "sexual_content", "confidence": float between 0 and 1, "severity": "none" | "low" | "medium" | "high" | "critical", "explanation": "one short sentence"}}"""


# ── BATCH prompt — the primary path ──
# Batching is what makes contextual moderation affordable: one call covers
# ten messages, and the model can see that message [4] is a reply to the
# joke in message [2] rather than an unprovoked attack.
_LLM_BATCH_PROMPT = """Below are consecutive messages from one channel, in order. Review them together so you can see the conversation, not just isolated lines.

MESSAGES:
{messages_block}

Return a JSON object with one key, "violations", whose value is an array containing ONLY the messages that genuinely violate the guidelines. Omit clean messages entirely. If every message is clean, return {{"violations": []}}.

Each entry must have:
  msg_index: the number in brackets from the list above
  action: "warn" | "flag" | "block"
  severity: "low" | "medium" | "high" | "critical"
  category: "profanity" | "hate_speech" | "harassment" | "spam" | "threats" | "sexual_content"
  confidence: float between 0 and 1
  explanation: one short sentence naming what makes it a violation"""


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
    'i will kill you', "i'll kill you", 'ill kill you', 'gonna kill you',
    'i will kill u', "i'll kill u", 'im gonna kill you',
    'jaan se maar dunga', 'jaan se mardunga', 'qatal kar dunga',
    'zinda nahi chorunga', 'zinda jala dunga',
}


class ModerationAgent(AutonomousAgent):
    """
    Batch LLM moderation with conversation context.

    Architecture:
      1. instant_check() — tiny instant-block list for extreme content (<1ms)
      2. Messages broadcast immediately after instant check
      3. Messages pushed to Redis buffer per channel
      4. When buffer reaches BATCH_SIZE or BATCH_TIMEOUT, Celery fires batch_llm_review()
      5. The model reviews the batch with full conversation context
      6. Retroactive socket events sent for any flagged messages

    Autonomous role: subscribes to ``msg.created`` and runs
    the cheap ``instant_check`` + lexicon scan inside ``sense``. The
    existing pre-broadcast moderation in ``routes/sockets.py`` still
    handles the live block path; this hook complements it by emitting
    a ``mod.violation`` event whenever a violation is detected, which
    Wellness (victim support) and other downstream agents can subscribe
    to. Per-community adaptive sensitivity lives in
    ``agent_state.thresholds.severity_threshold``.
    """

    BATCH_SIZE = 10        # Max messages per batch
    BATCH_TIMEOUT = 30     # Seconds before flushing a partial buffer
    BUFFER_KEY_PREFIX = 'mod:buffer:'       # Redis key prefix for message buffers
    BUFFER_TS_PREFIX = 'mod:buffer_ts:'     # Redis key prefix for buffer timestamps

    # ── Autonomous contract ─────────────────────────────
    NAME = "moderation"
    GOAL = {"surface_violations_to_downstream_agents": True,
            "per_community_adaptive_threshold": True}
    SUBSCRIBES = [_event_bus.TOPIC_MSG_CREATED]
    SCOPE_TYPE = _agent_memory.SCOPE_COMMUNITY
    COOLDOWN_SECONDS = 0  # Per-message, not per-scope; violations are rare anyway

    # Severity ladder maps the existing categorical severity onto a
    # numeric score so the per-community threshold can shift sensitivity.
    _SEVERITY_SCORE = {
        "none": 0.0, "low": 0.25, "medium": 0.5,
        "high": 0.8, "critical": 1.0,
    }
    _DEFAULT_SEVERITY_THRESHOLD = 0.5  # medium-or-worse triggers an event
    
    def __init__(self):
        """Initialize the moderation agent"""
        self.lexicon = _load_lexicon()
        self.llm = _llm_client
        self.llm_available = _LLM_MODERATION_AVAILABLE and _llm_client is not None

    # ── Phase 1: Instant check (pre-broadcast) ──────────────────────────

    def instant_check(self, text: str, user_id=None, channel_id=None) -> Dict[str, any]:  # added user_id, channel_id optional kwargs
        """
        Ultra-fast pre-broadcast check (<1ms). Only blocks extreme content.
        Returns {'block': True/False, 'reason': str}.
        Everything else is allowed through and reviewed by the LLM in batch.
        user_id / channel_id are optional — if provided, spam_check and scam_check also run.
        """
        text_lower = text.lower().strip()
        # Normalize apostrophes/contractions so "i'll kill you" matches "ill kill you"
        text_normalized = text_lower.replace("'", '').replace('\u2019', '')
        
        if len(text_lower) < 3:
            return {'block': False, 'reason': ''}
        
        # Check multi-word phrases first (against both original and normalized)
        for phrase in _INSTANT_BLOCK_WORDS:
            if ' ' in phrase and (phrase in text_lower or phrase in text_normalized):
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

        # spam check (skipped gracefully when user_id or channel_id is None)
        if user_id is not None and channel_id is not None:
            spam = self.spam_check(user_id, channel_id, text)
            if spam.get('block') or spam.get('warn'):
                return spam

        # scam check (pure regex, always runs)
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

    # ── Phase 3: Batch LLM review ─────────────────────────────────────

    def batch_llm_review(self, messages: list) -> list:
        """
        Send a batch of messages to the LLM for contextual moderation.

        Args:
            messages: list of dicts with {msg_id, user_id, username, content}

        Returns:
            list of violation dicts: [{msg_index, msg_id, user_id, action, severity,
                                       category, confidence, explanation}, ...]
            Empty list if all messages are clean.
            None if the call failed, which the caller must not treat as clean.
        """
        if not messages:
            return []
        
        if not self.llm_available or not self.llm:
            print("[MODERATION] LLM unavailable for batch review")
            return []

        # Build the messages block for the prompt
        lines = []
        for i, msg in enumerate(messages):
            username = msg.get('username', 'Unknown')
            content = msg.get('content', '')[:500]  # Truncate long messages
            lines.append(f"[{i}] {username}: {content}")

        messages_block = '\n'.join(lines)
        prompt = _LLM_BATCH_PROMPT.replace('{messages_block}', messages_block)

        try:
            start = time.time()

            # Batch gets more time than a single message. The timeout is
            # enforced inside the client (socket-level), so no thread pool
            # is needed to bound it any more.
            data = self.llm.complete_json(
                prompt,
                system=_MODERATION_SYSTEM,
                temperature=0.1,   # moderation must be reproducible
                max_tokens=900,
                timeout=15.0,
            )

            elapsed_ms = int((time.time() - start) * 1000)

            if data is None:
                # Distinguish "call failed" from "nothing to flag": the
                # caller retries on None and would otherwise mark a whole
                # batch clean after a network blip.
                print("[MODERATION] LLM batch returned nothing")
                return None

            # JSON mode always returns an object, so the array arrives under
            # a key. Accept the documented one, then any array value.
            if isinstance(data, dict):
                verdicts = data.get('violations')
                if verdicts is None:
                    verdicts = next((v for v in data.values()
                                     if isinstance(v, list)), None)
            else:
                verdicts = data

            if verdicts is None:
                print(f"[MODERATION] LLM batch had no array: {str(data)[:200]}")
                return []
            if not isinstance(verdicts, list):
                print(f"[MODERATION] LLM batch returned non-array: {str(data)[:200]}")
                return []

            # Confidence cutoff from platform settings (low/med/high → 0.85/0.70/0.55).
            # Verdicts below the cutoff are dropped — admin chose a less aggressive
            # sensitivity, so weak signals shouldn't surface as flags.
            cutoff = moderation_confidence_cutoff()

            # Enrich verdicts with msg_id and user_id from original messages
            enriched = []
            for v in verdicts:
                idx = v.get('msg_index')
                if idx is None or idx < 0 or idx >= len(messages):
                    continue

                action = v.get('action', 'warn')
                if action not in ('warn', 'flag', 'block'):
                    action = 'warn'

                try:
                    conf = float(v.get('confidence', 0.5))
                except (TypeError, ValueError):
                    conf = 0.5
                if conf < cutoff:
                    continue

                enriched.append({
                    'msg_index': idx,
                    'msg_id': messages[idx].get('msg_id'),
                    'user_id': messages[idx].get('user_id'),
                    'username': messages[idx].get('username', 'Unknown'),
                    'content': messages[idx].get('content', '')[:200],
                    'action': action,
                    'severity': v.get('severity', 'low'),
                    'category': v.get('category', 'unknown'),
                    'confidence': conf,
                    'explanation': v.get('explanation', ''),
                })
            
            flagged_count = len(enriched)
            total_count = len(messages)
            print(f"[MODERATION] LLM batch review ({elapsed_ms}ms): "
                  f"{flagged_count}/{total_count} messages flagged")

            return enriched

        except Exception as e:
            print(f"[MODERATION] LLM batch error: {e}")
            return None


    # ── Legacy single-message review (backward compat) ───────────────────


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
    

    # ── Spam detection ──────────────────────────────────────────

    def spam_check(self, user_id, channel_id, content) -> dict:
        """
        Redis-based spam detection using flood and duplicate checks.
        Returns {'block': bool, 'warn': bool, 'reason': str, 'category': 'spam'}
        Never raises — returns safe default on any Redis failure.
        """
        try:
            import uuid
            from services.redis_client import get_redis
            r = get_redis()
            if r is None:
                return {'block': False, 'warn': False, 'reason': '', 'category': 'spam'}

            spam_cfg = self.lexicon.get('spam_patterns', {})
            max_per_10s = spam_cfg.get('max_messages_per_10s', 5)
            max_dups = spam_cfg.get('max_duplicates_per_minute', 2)

            # Flood detection: sorted set with 10-second sliding window
            flood_key = f'mod:flood:{channel_id}:{user_id}'
            now = time.time()
            window_start = now - 10
            msg_uuid = str(uuid.uuid4())

            pipe = r.pipeline()
            pipe.zremrangebyscore(flood_key, '-inf', window_start)
            pipe.zadd(flood_key, {msg_uuid: now})
            pipe.zcard(flood_key)
            pipe.expire(flood_key, 15)
            results = pipe.execute()
            msg_count = results[2]

            if msg_count > max_per_10s:
                return {'block': True, 'warn': False, 'reason': 'spam_flood', 'category': 'spam'}

            # Duplicate detection: counter with 60-second TTL
            content_hash = hashlib.sha256(content.lower().strip().encode('utf-8')).hexdigest()
            dup_key = f'mod:dup:{channel_id}:{content_hash}'
            count = r.incr(dup_key)
            if count == 1:
                r.expire(dup_key, 60)

            if count > max_dups:
                return {'block': False, 'warn': True, 'reason': 'duplicate_spam', 'category': 'spam'}

            return {'block': False, 'warn': False, 'reason': '', 'category': 'spam'}

        except Exception as e:
            print(f"[MODERATION] spam_check error (non-fatal): {e}")
            return {'block': False, 'warn': False, 'reason': '', 'category': 'spam'}

    # ── Scam detection ──────────────────────────────────────────

    def scam_check(self, content) -> dict:
        """
        Pure regex scam detection against scam_patterns from the lexicon.
        No Redis, no DB, no LLM. < 1ms.
        Returns {'block': False, 'flag': bool, 'reason': str, 'category': 'scam', 'confidence': float}
        """
        scam_patterns = self.lexicon.get('scam_patterns', {})
        content_lower = content.lower().strip()

        for pattern_category, patterns in scam_patterns.items():
            if not isinstance(patterns, list):
                continue
            for pattern in patterns:
                try:
                    if re.search(pattern, content_lower, re.IGNORECASE):
                        return {
                            'block': False, 'flag': True,
                            'reason': pattern_category,
                            'category': 'scam',
                            'confidence': 0.85
                        }
                except re.error:
                    continue  # skip invalid regex

        return {'block': False, 'flag': False, 'reason': '', 'category': 'scam', 'confidence': 0.0}

    # ── Historical / retroactive scan ───────────────────────────

    def retroactive_scan(self, channel_id: int, community_id: int,
                         hours_back: int = 48, batch_size: int = 10,
                         progress_callback=None) -> dict:
        """
        Scan historical messages not yet reviewed by the moderation agent.
        Paginates through the DB, sends batches to the LLM, applies 3-strike logic,
        and emits moderation_retroactive socket events for each violation.
        Skips messages already in ai_agent_logs (action_type='moderation').
        Calls progress_callback(scanned, total, flagged) after every batch.
        Returns: {'scanned': int, 'flagged': int, 'errors': int}
        """
        import os
        from flask_socketio import SocketIO as FlaskSocketIO

        REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
        sio = FlaskSocketIO(message_queue=REDIS_URL)
        room = f"channel_{channel_id}"

        MAX_MESSAGES = 500
        scanned = 0
        flagged = 0
        errors = 0
        offset = 0
        consecutive_llm_failures = 0

        # ── Get total unreviewed message count ────────────────────────────
        total = 0
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
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
                """, (channel_id, hours_back, channel_id))
                row = cur.fetchone()
                total = min(int(row['cnt']) if row else 0, MAX_MESSAGES)
        except Exception as e:
            print(f"[RETRO_SCAN] Error getting message count for channel {channel_id}: {e}")
            return {'scanned': 0, 'flagged': 0, 'errors': 1}
        finally:
            if conn:
                conn.close()

        if total == 0:
            return {'scanned': 0, 'flagged': 0, 'errors': 0}

        # ── Paginated scan loop ───────────────────────────────────────────
        while scanned < MAX_MESSAGES:
            conn = None
            rows = []
            try:
                conn = get_db_connection()
                with conn.cursor() as cur:
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
                    """, (channel_id, hours_back, channel_id, batch_size, offset))
                    rows = cur.fetchall()
            except Exception as e:
                print(f"[RETRO_SCAN] DB query error at offset {offset}: {e}")
                errors += 1
                break
            finally:
                if conn:
                    conn.close()

            if not rows:
                break  # no more messages

            batch = [
                {
                    'msg_id': row['id'],
                    'user_id': row['sender_id'],
                    'username': row.get('username', 'Unknown'),
                    'content': row['content'],
                    'timestamp': row['created_at'].isoformat() if row.get('created_at') else None
                }
                for row in rows
            ]

            verdicts = self.batch_llm_review(batch)

            if verdicts is None:  # LLM failure
                consecutive_llm_failures += 1
                errors += 1
                if consecutive_llm_failures >= 3:
                    print("[RETRO_SCAN] 3 consecutive LLM failures — aborting scan")
                    break
                offset += batch_size
                scanned += len(batch)
                if progress_callback:
                    try:
                        progress_callback(scanned, total, flagged)
                    except Exception:
                        pass
                continue

            consecutive_llm_failures = 0  # reset on success

            # ── Process each violation ────────────────────────────────────
            for v in verdicts:
                msg_id = v['msg_id']
                user_id = v['user_id']
                username = v.get('username', 'Unknown')
                action = v['action']
                severity = v['severity']
                reasons = [v.get('category', 'unknown')]
                explanation = v.get('explanation', '')
                confidence = float(v.get('confidence', 0.5))

                violation_count = 0
                is_already_blocked = False
                is_owner = False
                conn = None
                try:
                    conn = get_db_connection()
                    with conn.cursor() as cur:
                        # Guard: already blocked/removed?
                        cur.execute(
                            "SELECT id FROM blocked_users WHERE community_id = %s AND user_id = %s LIMIT 1",
                            (community_id, user_id))
                        is_already_blocked = cur.fetchone() is not None

                        # Guard: community owner?
                        cur.execute(
                            "SELECT created_by FROM communities WHERE id = %s LIMIT 1",
                            (community_id,))
                        owner_row = cur.fetchone()
                        is_owner = bool(owner_row and owner_row.get('created_by') == user_id)

                        cur.execute(
                            "SELECT violation_count FROM community_members "
                            "WHERE community_id = %s AND user_id = %s FOR UPDATE",
                            (community_id, user_id))
                        member_row = cur.fetchone()
                        if member_row:
                            violation_count = (member_row.get('violation_count') or 0) + 1
                            cur.execute(
                                "UPDATE community_members SET violation_count = %s "
                                "WHERE community_id = %s AND user_id = %s",
                                (violation_count, community_id, user_id))

                        # Mark message flagged
                        cur.execute(
                            "UPDATE messages SET moderation_flagged = 1, moderation_score = %s WHERE id = %s",
                            (confidence, msg_id))

                        cur.execute("""
                            UPDATE community_agents
                            SET usage_count = usage_count + 1, last_active = NOW()
                            WHERE community_id = %s AND agent_type = 'moderation'
                        """, (community_id,))
                    conn.commit()
                except Exception as db_err:
                    print(f"[RETRO_SCAN] DB update failed user={user_id} msg={msg_id}: {db_err}")
                finally:
                    if conn:
                        conn.close()

                # Already removed — log only, skip re-emit
                if is_already_blocked:
                    self.log_moderation_action(
                        user_id, channel_id, v.get('content', '')[:500],
                        action, severity, reasons, confidence, msg_id)
                    flagged += 1
                    continue

                # Auto-ban threshold: community max_warnings setting takes
                # precedence over the platform default when the community
                # has configured it. This lets community admins tighten or
                # loosen escalation without a sys-admin round-trip.
                try:
                    mcfg = get_community_settings(
                        community_id, 'moderation', _MOD_DEFAULTS)
                    community_max = int(mcfg.get('max_warnings', 0) or 0)
                except Exception:
                    community_max = 0
                if community_max >= 1:
                    ab_threshold = min(10, community_max)
                else:
                    ab_threshold = max(1, int(_platform_auto_ban_threshold() or 3))

                # N-strike escalation (mirrors batch_moderation_task)
                if violation_count >= ab_threshold and not is_owner:
                    final_action = 'remove_user'
                    user_message = (f'@{username} has been removed from this community '
                                    f'by the Moderation Agent for repeated violations.')
                elif violation_count == max(1, ab_threshold - 1):
                    final_action = 'flag'
                    user_message = (f'@{username}, your content has been flagged for repeated violations '
                                    f'({violation_count}/{ab_threshold}). One more violation will result in removal.')
                elif violation_count >= 1:
                    final_action = 'warn'
                    user_message = (f'@{username}, this message may violate community guidelines '
                                    f'({", ".join(reasons)}). Please be mindful.')
                else:
                    final_action = action
                    user_message = f'@{username}, this message was flagged by AI review ({", ".join(reasons)}).'

                # Emit retroactive socket events
                try:
                    if final_action == 'remove_user':
                        community_data = None
                        try:
                            rm_conn = get_db_connection()
                            with rm_conn.cursor() as rm_cur:
                                rm_cur.execute("SELECT name, logo_url, color, icon, public_id FROM communities WHERE id = %s", (community_id,))
                                community_data = rm_cur.fetchone()
                                rm_cur.execute("INSERT IGNORE INTO blocked_users (community_id, user_id) VALUES (%s, %s)", (community_id, user_id))
                                rm_cur.execute("DELETE FROM channel_members WHERE user_id = %s AND channel_id IN (SELECT id FROM channels WHERE community_id = %s)", (user_id, community_id))
                                rm_cur.execute("DELETE FROM community_members WHERE community_id = %s AND user_id = %s", (community_id, user_id))
                            rm_conn.commit()
                            rm_conn.close()
                        except Exception as rm_err:
                            print(f"[RETRO_SCAN] Remove user DB error: {rm_err}")

                        sio.emit('moderation_retroactive', {
                            'message_id': msg_id, 'channel_id': channel_id,
                            'user_id': user_id, 'username': username,
                            'action': 'remove_user', 'severity': 'high',
                            'reasons': reasons, 'explanation': explanation,
                            'violation_count': violation_count, 'max_violations': 3,
                            'banner_text': user_message,
                            'timestamp': datetime.utcnow().isoformat()
                        }, room=room, namespace='/')

                        sio.emit('moderation_user_removed', {
                            'user_id': user_id, 'username': username,
                            'channel_id': channel_id, 'community_id': community_id,
                            'reason': f'Removed for repeated violations: {", ".join(reasons)} (3 strikes)',
                            'removed_by': 'Auraflow Moderation Agent',
                            'violation_count': violation_count,
                            'timestamp': datetime.utcnow().isoformat()
                        }, room=room, namespace='/')

                        sio.emit('community:removed', {
                            'community_id': community_id,
                            'community_public_id': community_data['public_id'] if community_data else None,
                            'user_id': user_id,
                            'reason': 'violation',
                            'message': 'You were removed from this community for repeated violations (3 strikes).',
                            'notification': {
                                'community_name': community_data['name'] if community_data else 'Community',
                                'community_logo': community_data.get('logo_url') if community_data else None,
                                'community_color': community_data.get('color') if community_data else '#8B5CF6',
                                'community_icon': community_data.get('icon') if community_data else 'AF'
                            }
                        }, room=f"user_{user_id}", namespace='/')

                    else:  # warn or flag
                        sio.emit('moderation_retroactive', {
                            'message_id': msg_id, 'channel_id': channel_id,
                            'user_id': user_id, 'username': username,
                            'action': final_action, 'severity': severity,
                            'reasons': reasons, 'explanation': explanation,
                            'violation_count': violation_count, 'max_violations': 3,
                            'banner_text': user_message,
                            'timestamp': datetime.utcnow().isoformat()
                        }, room=room, namespace='/')

                    sio.emit('moderation_action_logged', {
                        'community_id': community_id, 'channel_id': channel_id,
                        'action': final_action, 'severity': severity,
                        'timestamp': datetime.utcnow().isoformat()
                    }, room=f"community_{community_id}", namespace='/')

                    # §3.5: push admin_alert for high/critical severity to admin rooms.
                    # Respect the community's notify_admins toggle — we still
                    # log + apply the moderation action; we only suppress
                    # the in-app admin notification stream.
                    if severity in ('high', 'critical'):
                        mod_cfg = get_community_settings(
                            community_id, 'moderation', _MOD_DEFAULTS)
                        if mod_cfg.get('notify_admins', True):
                            alert_payload = {
                                'kind': 'moderation',
                                'severity': severity,
                                'community_id': community_id,
                                'channel_id': channel_id,
                                'user_id': user_id,
                                'username': username,
                                'action': final_action,
                                'reasons': reasons,
                                'message': (v.get('content') or '')[:200],
                                'timestamp': datetime.utcnow().isoformat(),
                            }
                            sio.emit('admin_alert', alert_payload,
                                     room=f"community_admins_{community_id}", namespace='/')
                            sio.emit('admin_alert', alert_payload,
                                     room='system_admins', namespace='/')

                except Exception as emit_err:
                    print(f"[RETRO_SCAN] Socket emit failed: {emit_err}")

                self.log_moderation_action(
                    user_id, channel_id, v.get('content', '')[:500],
                    final_action, severity, reasons, confidence, msg_id)
                flagged += 1

            scanned += len(batch)
            offset += batch_size

            if progress_callback:
                try:
                    progress_callback(scanned, total, flagged)
                except Exception:
                    pass

            if len(rows) < batch_size:  # last page reached
                break

        print(f"[RETRO_SCAN] channel={channel_id} scanned={scanned} flagged={flagged} errors={errors}")
        return {'scanned': scanned, 'flagged': flagged, 'errors': errors}

    # ────────────────────────────────────────────────────────────────────
    # Autonomous hooks
    # ────────────────────────────────────────────────────────────────────

    def sense(self, event: dict) -> Optional[Dict]:
        """Run the cheap instant_check + lexicon scan. Returns an
        observation only when something potentially flaggable is found —
        the vast majority of clean messages drop here, so this stays cheap.

        We do NOT call the LLM here; the batched pipeline in
        ``routes/sockets.py`` and ``tasks/agent_tasks.py`` still owns
        that side. This hook is purely an event surface.
        """
        content = (event.get("content") or "").strip()
        if not content or content.startswith("/") or len(content) < 3:
            return None
        # Community admin kill-switch (Agent Goals panel) +
        # G1a per-channel override (CoverageMatrix). The channel-scoped
        # helper falls through to the community-level check when there is
        # no per-channel row, so this single call covers both gates.
        if not self._is_enabled_for_channel(
            event.get("community_id"), event.get("channel_id")
        ):
            return None
        # Community-configurable auto_filter toggle — when off, autonomous
        # moderation pauses but admin/on-demand moderation routes still
        # work. roman_urdu_support is honored downstream by instant_check.
        community_id = event.get("community_id")
        mcfg = (get_community_settings(int(community_id), 'moderation', _MOD_DEFAULTS)
                if community_id else dict(_MOD_DEFAULTS))
        if not mcfg.get('auto_filter', True):
            return None
        try:
            # roman_urdu_support: when disabled, the instant_check call
            # ignores the Roman-Urdu lexicon. The agent supports both;
            # we pass the flag as a hint via kwargs (falls back silently
            # for older signatures).
            try:
                instant = self.instant_check(
                    content,
                    roman_urdu=bool(mcfg.get('roman_urdu_support', True)),
                )
            except TypeError:
                instant = self.instant_check(content)
        except Exception:
            return None

        violation = bool(instant.get("block")) or bool(instant.get("flag_personal_info")) \
            or bool(instant.get("flag"))
        if not violation:
            return None

        # Map the instant_check result onto our shared severity ladder.
        if instant.get("block"):
            category = "extreme"
            severity = "critical"
        elif instant.get("flag_personal_info"):
            category = "personal_info"
            severity = "high"
        elif instant.get("flag"):
            category = instant.get("category") or "scam"
            severity = instant.get("severity") or "high"
        else:
            category = "unknown"
            severity = "low"

        return {
            "content":      content[:500],
            "user_id":      event.get("user_id"),
            "channel_id":   event.get("channel_id"),
            "community_id": event.get("community_id"),
            "message_id":   event.get("message_id"),
            "category":     category,
            "severity":     severity,
            "reason":       instant.get("reason"),
            "scope_type":   _agent_memory.SCOPE_COMMUNITY,
            "scope_id":     event.get("community_id"),
        }

    def decide(self, observation: Dict):
        """Compare the violation's severity score against the per-community
        threshold. ``act`` when at-or-above; ``defer`` otherwise so the
        decision is still logged and feedback can teach us to lower the
        threshold for sensitive communities.

        The base threshold is the bandit-tuned ``severity_threshold`` from
        agent_state; we then floor it by the admin's chosen
        ``severity_threshold`` enum and shift it by the ``sensitivity``
        slider so the UI controls measurably move where we draw the line.
        """
        sev_score = self._SEVERITY_SCORE.get(observation.get("severity", "none"), 0.0)
        community_id = observation.get("community_id")
        threshold = self._severity_threshold(community_id)
        if community_id:
            cfg = get_community_settings(int(community_id), 'moderation', _MOD_DEFAULTS)
            # Admin-set minimum (low/medium/high/critical) — never act
            # below this even if the bandit thinks we should.
            floor = _SEVERITY_FLOOR.get(
                str(cfg.get('severity_threshold') or 'medium').lower(), 0.5)
            threshold = max(threshold, floor)
            # Sensitivity slider 1..10 — 7 is neutral. Each step shifts
            # the threshold ±0.02 (10 steps total range = ±0.20).
            try:
                sens = max(1, min(10, int(cfg.get('sensitivity', 7))))
                threshold = max(0.10, min(0.95,
                    threshold + (7 - sens) * 0.02))
            except (TypeError, ValueError):
                pass
        if sev_score < threshold:
            return ("defer", observation,
                    f"severity_{sev_score:.2f}_below_{threshold:.2f}")
        return ("act", {**observation, "severity_score": sev_score},
                f"violation_{observation.get('category')}_{observation.get('severity')}")

    def act(self, payload: Dict, correlation_id: str) -> Optional[Dict]:
        """Publish ``mod.violation`` on the agent bus so downstream
        agents (Wellness victim-support) can react. We do NOT
        delete or warn from here — that's owned by the existing
        instant-check + batch-review pipeline. Defence in depth: the
        autonomous emit is informational.
        """
        try:
            _event_bus.publish(_event_bus.TOPIC_MOD_VIOLATION, {
                "user_id":      payload.get("user_id"),
                "channel_id":   payload.get("channel_id"),
                "community_id": payload.get("community_id"),
                "message_id":   payload.get("message_id"),
                "category":     payload.get("category"),
                "severity":     payload.get("severity"),
                "severity_score": payload.get("severity_score"),
                "reason":       payload.get("reason"),
                "correlation_id": correlation_id,
            })
        except Exception as exc:
            print(f"[MODERATION] mod.violation publish failed: {exc}")
            return {"published": False}
        return {"published": True, "category": payload.get("category"),
                "severity": payload.get("severity")}

    def learn(self, action_id: int, signal: str, *, weight: float = 1.0) -> None:
        """Per-community threshold adapts to moderator feedback.

        - ``positive`` (mod confirmed the flag was correct) → lower
          threshold so similar future content trips faster.
        - ``negative`` / ``dismissed`` (false positive) → raise
          threshold; this community is more permissive.
        """
        try:
            action = _agent_memory.get_action(action_id)
            if not action or not action.get("community_id"):
                return super().learn(action_id, signal, weight=weight)
            community_id = action["community_id"]
            state = _agent_memory.get_state(
                self.NAME, _agent_memory.SCOPE_COMMUNITY, community_id) or {}
            th = dict(state.get("thresholds") or {})
            cur = float(th.get("severity_threshold", self._DEFAULT_SEVERITY_THRESHOLD))
            if signal in ("positive", "engaged"):
                cur = max(0.20, cur - 0.05 * float(weight))
            elif signal in ("negative", "dismissed"):
                cur = min(0.95, cur + 0.05 * float(weight))
            th["severity_threshold"] = round(cur, 3)
            # Respect the admin-configured clamp window so
            # learn() can't drift outside the bounds the community admin
            # set via the Agent Goals panel.
            th = self._apply_clamps(th, community_id=community_id)
            outcome = ("positive" if signal in ("positive", "engaged")
                       else "negative" if signal in ("negative", "dismissed")
                       else "neutral")
            _agent_memory.set_state(
                self.NAME, _agent_memory.SCOPE_COMMUNITY, community_id,
                thresholds=th, last_outcome=outcome,
            )
        except Exception as exc:
            print(f"[MODERATION] learn failed: {exc}")
        super().learn(action_id, signal, weight=weight)

    def _severity_threshold(self, community_id: Optional[int]) -> float:
        if not community_id:
            return self._DEFAULT_SEVERITY_THRESHOLD
        try:
            state = _agent_memory.get_state(
                self.NAME, _agent_memory.SCOPE_COMMUNITY, community_id)
            if not state:
                return self._DEFAULT_SEVERITY_THRESHOLD
            th = state.get("thresholds") or {}
            raw = float(th.get("severity_threshold", self._DEFAULT_SEVERITY_THRESHOLD))
            # Enforce admin clamp window at read-time too, not
            # just at learn-time. An admin tightening the clamp should take
            # effect immediately even if learn() last ran with a wider window.
            clamped = self._apply_clamps({"severity_threshold": raw},
                                         community_id=community_id)
            return float(clamped.get("severity_threshold", raw))
        except Exception:
            return self._DEFAULT_SEVERITY_THRESHOLD

