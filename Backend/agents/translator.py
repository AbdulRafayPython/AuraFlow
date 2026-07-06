"""
Translator Agent
================
Lightweight on-demand translator using deep-translator (Google Translate
free tier) with googletrans as a fallback. No heavy ML models loaded.

Public surface
--------------
- detect_language(text)            -> {'language': 'en', 'confidence': 1.0}
- translate(text, target, source)  -> {'translated_text', 'source_language',
                                       'target_language', 'provider', 'cached'}
- translate_message(message_id, target, user_id) -> persists log row.
"""

from __future__ import annotations

import os
import re
import json
import time
import threading
from typing import Dict, Optional, Tuple

from database import get_db_connection
from agents.base import AutonomousAgent
from agents import event_bus as _event_bus
from agents._settings import get_personal_settings


_TRANSLATOR_DEFAULTS = {
    'default_target': 'en',
    'auto_detect': True,
    'cache_enabled': True,
}

# Primary engine: deep-translator (sync, no async loop required).
try:
    from deep_translator import GoogleTranslator as _DeepGoogle
    _DEEP_AVAILABLE = True
except Exception:  # pragma: no cover - import-time guard
    _DeepGoogle = None
    _DEEP_AVAILABLE = False

# Fallback engine: googletrans (async-ish). Used only when deep-translator
# raises a transient error.
try:
    from googletrans import Translator as _GTransTranslator
    _GTRANS_AVAILABLE = True
except Exception:  # pragma: no cover
    _GTransTranslator = None
    _GTRANS_AVAILABLE = False


# Languages we expose in the UI dropdown. Code -> human label.
SUPPORTED_LANGUAGES: Dict[str, str] = {
    'en': 'English',
    'ur': 'Urdu',
    'hi': 'Hindi',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'ar': 'Arabic',
    'zh-CN': 'Chinese (Simplified)',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'ja': 'Japanese',
    'tr': 'Turkish',
    'id': 'Indonesian',
    'bn': 'Bengali',
}


_ROMAN_URDU_HINTS = re.compile(
    r"\b(hai|nahi|kya|main|tum|aap|hum|kar|raha|rahi|rahe|kab|kahan|"
    r"kyun|kyon|theek|acha|achha|bhai|behen|ji|han|haan|nahin|kuch|"
    r"sab|abhi|baad|dost|pyar|pyaar|udas|udaas|khush|khushi|gham|"
    r"gussa|chalo|chal|chalein)\b",
    re.IGNORECASE,
)


class TranslatorAgent(AutonomousAgent):
    """Translate chat messages between supported languages.

    Autonomous role (Phase 1.1): subscribes to ``msg.created`` and, when
    it detects a non-English message that *might* benefit from auto-
    translation, publishes a ``lang.detected`` event so siblings
    (Assistant, Support) can adapt their language. Translator does NOT
    auto-post inline translations in Phase 1 — that requires the
    frontend chip work in Phase 4. For now, ``act`` is detection-only.
    """

    NAME = "translator"
    GOAL = {"detect_non_english_messages_for_routing": True}
    SUBSCRIBES = [_event_bus.TOPIC_MSG_CREATED]
    COOLDOWN_SECONDS = 5   # per-channel: don't spam lang.detected events

    def __init__(self):
        self.cache_ttl_seconds = 60 * 60 * 24  # 1 day in-memory cache
        self._cache: Dict[Tuple[str, str, str], Tuple[float, Dict]] = {}
        self._cache_lock = threading.Lock()

    # ------------------------------------------------------------------ utils
    def _normalize_target(self, target: str) -> str:
        if not target:
            return 'en'
        target = target.strip()
        # 'zh' -> 'zh-CN' for Google
        if target.lower() == 'zh':
            return 'zh-CN'
        return target

    def _is_likely_roman_urdu(self, text: str) -> bool:
        if not text:
            return False
        return bool(_ROMAN_URDU_HINTS.search(text))

    def _cache_get(self, key: Tuple[str, str, str]) -> Optional[Dict]:
        with self._cache_lock:
            entry = self._cache.get(key)
            if not entry:
                return None
            ts, value = entry
            if time.time() - ts > self.cache_ttl_seconds:
                self._cache.pop(key, None)
                return None
            return value

    def _cache_put(self, key: Tuple[str, str, str], value: Dict) -> None:
        with self._cache_lock:
            self._cache[key] = (time.time(), value)
            # Bound cache size
            if len(self._cache) > 2000:
                # Drop ~10% of oldest entries
                for k in sorted(self._cache, key=lambda k: self._cache[k][0])[:200]:
                    self._cache.pop(k, None)

    # --------------------------------------------------------------- detection
    def detect_language(self, text: str) -> Dict:
        """Detect source language. Returns dict with language code + confidence.
        Falls back to ``en`` when detection is unavailable.
        """
        text = (text or '').strip()
        if not text:
            return {'language': 'en', 'confidence': 0.0}

        # Roman-Urdu heuristic first (Google reports it as 'ur' poorly)
        if self._is_likely_roman_urdu(text):
            return {'language': 'ur', 'confidence': 0.6, 'romanized': True}

        # Try googletrans for detection (deep-translator has no detect API).
        if _GTRANS_AVAILABLE:
            try:
                t = _GTransTranslator()
                detected = t.detect(text)
                lang = getattr(detected, 'lang', None) or 'en'
                conf = float(getattr(detected, 'confidence', None) or 0.7)
                return {'language': lang, 'confidence': conf}
            except Exception:
                pass

        return {'language': 'en', 'confidence': 0.3}

    # ------------------------------------------------------------- translation
    def translate(
        self,
        text: str,
        target_language: str = 'en',
        source_language: str = 'auto',
        user_id: Optional[int] = None,
    ) -> Dict:
        """Translate ``text`` to ``target_language``. Returns a result dict.

        Always returns a dict — never raises. On hard failure ``provider`` is
        ``none`` and ``translated_text`` equals the input.

        ``user_id`` is optional; when provided we honor the per-user
        ``translator`` settings row (``default_target``, ``auto_detect``,
        ``cache_enabled``). Missing/falsey ``user_id`` keeps the legacy
        behaviour so socket and event-bus call sites that have no user
        context stay unchanged.
        """
        cfg = get_personal_settings(user_id, 'translator', _TRANSLATOR_DEFAULTS) \
            if user_id else dict(_TRANSLATOR_DEFAULTS)

        text = (text or '').strip()
        # Fall back to the user's configured default when the caller didn't
        # pin a target. The caller can still force 'en' by passing it
        # explicitly.
        if not target_language or target_language == 'en':
            # Treat the legacy default 'en' as "no preference" so the user's
            # configured default_target takes effect.
            effective_target = cfg.get('default_target') or 'en' if user_id else target_language
        else:
            effective_target = target_language
        target = self._normalize_target(effective_target or 'en')

        # Honor auto_detect=false by pinning source to the user's default
        # target language family — caller can still override with an
        # explicit source.
        raw_source = (source_language or 'auto').strip() or 'auto'
        if raw_source == 'auto' and user_id and not cfg.get('auto_detect', True):
            # If detection is disabled, treat source as English unless the
            # user configured a non-en default_target (in which case use that
            # as the source assumption). Cheap, predictable, no API call.
            raw_source = 'en'
        source = raw_source

        if not text:
            return {
                'translated_text': '',
                'source_language': source,
                'target_language': target,
                'provider': 'none',
                'cached': False,
            }

        cache_key = (text, source, target)
        cache_enabled = bool(cfg.get('cache_enabled', True))
        if cache_enabled:
            cached = self._cache_get(cache_key)
            if cached is not None:
                return {**cached, 'cached': True}

        # Engine 1: deep-translator
        if _DEEP_AVAILABLE:
            try:
                translated = _DeepGoogle(source=source, target=target).translate(text)
                if translated and translated.strip() and translated.strip() != text.strip():
                    result = {
                        'translated_text': translated,
                        'source_language': source,
                        'target_language': target,
                        'provider': 'deep_translator',
                        'cached': False,
                    }
                    if cache_enabled:
                        self._cache_put(cache_key, result)
                    return result
            except Exception as exc:
                # Fall through to googletrans
                print(f"[TRANSLATOR] deep-translator failed: {exc}")

        # Engine 2: googletrans (legacy)
        if _GTRANS_AVAILABLE:
            try:
                t = _GTransTranslator()
                out = t.translate(text, dest=target, src=source)
                translated = getattr(out, 'text', None)
                detected_src = getattr(out, 'src', source)
                if translated:
                    result = {
                        'translated_text': translated,
                        'source_language': detected_src,
                        'target_language': target,
                        'provider': 'googletrans',
                        'cached': False,
                    }
                    if cache_enabled:
                        self._cache_put(cache_key, result)
                    return result
            except Exception as exc:
                print(f"[TRANSLATOR] googletrans failed: {exc}")

        # Both engines failed — return original text so UI keeps working.
        return {
            'translated_text': text,
            'source_language': source,
            'target_language': target,
            'provider': 'none',
            'cached': False,
            'error': 'translation_unavailable',
        }

    # ----------------------------------------------------------- DB helpers
    def translate_message(
        self,
        message_id: int,
        target_language: str,
        user_id: Optional[int] = None,
    ) -> Dict:
        """Translate a stored message by id and log the action."""
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            # `messages` has no community_id column — a message's community is
            # derived from its channel, so join `channels` to fetch it.
            cur.execute(
                "SELECT m.id, m.content, m.sender_id, m.channel_id, c.community_id "
                "FROM messages m LEFT JOIN channels c ON m.channel_id = c.id "
                "WHERE m.id = %s",
                (message_id,),
            )
            row = cur.fetchone()
            if not row:
                cur.close(); conn.close()
                return {'success': False, 'error': 'message_not_found'}

            content = row['content'] if isinstance(row, dict) else row[1]
            channel_id = row['channel_id'] if isinstance(row, dict) else row[3]
            community_id = row['community_id'] if isinstance(row, dict) else row[4]

            result = self.translate(
                content or '',
                target_language=target_language,
                user_id=user_id,
            )

            # Log to ai_agent_logs (best-effort).
            try:
                cur.execute(
                    "INSERT INTO ai_agent_logs "
                    "(agent_name, action_type, user_id, channel_id, community_id, "
                    " input_data, output_data, status, execution_time_ms, created_at) "
                    "VALUES ('translator', 'translate', %s, %s, %s, %s, %s, %s, %s, NOW())",
                    (
                        user_id,
                        channel_id,
                        community_id,
                        json.dumps({'message_id': message_id, 'target': target_language})[:1000],
                        json.dumps(result)[:2000],
                        'success' if result.get('provider') != 'none' else 'failed',
                        0,
                    ),
                )
                conn.commit()
            except Exception as log_exc:
                print(f"[TRANSLATOR] log failed: {log_exc}")

            cur.close(); conn.close()
            return {'success': True, 'message_id': message_id, **result}
        except Exception as exc:
            print(f"[TRANSLATOR] translate_message error: {exc}")
            return {'success': False, 'error': str(exc)}

    def supported_languages(self) -> Dict[str, str]:
        return dict(SUPPORTED_LANGUAGES)

    # ────────────────────────────────────────────────────────────────────
    # Autonomous hooks (Phase 1.1)
    # ────────────────────────────────────────────────────────────────────

    def sense(self, event: dict) -> Optional[dict]:
        """Pre-filter: only consider plain text messages long enough to
        be worth language-detecting (≥ 6 chars, no leading slash)."""
        content = (event.get("content") or "").strip()
        if len(content) < 6 or content.startswith("/"):
            return None
        # G1a per-channel override (CoverageMatrix). Falls through to
        # community-level kill-switch via base.py helper.
        if not self._is_enabled_for_channel(
            event.get("community_id"), event.get("channel_id")
        ):
            return None
        return {
            "content":      content[:500],
            "channel_id":   event.get("channel_id"),
            "community_id": event.get("community_id"),
            "user_id":      event.get("user_id"),
            "message_id":   event.get("message_id"),
            # convenience handle for the base class cooldown
            "scope_type":   "channel",
            "scope_id":     event.get("channel_id"),
        }

    def decide(self, observation: dict):
        """Skip when the heuristic detector says English. Otherwise act."""
        det = self.detect_language(observation["content"])
        lang = (det or {}).get("language") or "en"
        if lang == "en":
            return ("skip", {"language": lang}, "english_message")
        if (det or {}).get("confidence", 0) < 0.4:
            return ("skip", {"language": lang}, f"low_confidence_{lang}")
        return ("act", {
            "language":    lang,
            "confidence":  det.get("confidence"),
            "romanized":   det.get("romanized", False),
            "message_id":  observation.get("message_id"),
            "channel_id":  observation.get("channel_id"),
            "community_id": observation.get("community_id"),
            "user_id":     observation.get("user_id"),
        }, f"detected_{lang}")

    def act(self, payload: dict, correlation_id: str) -> Optional[dict]:
        """Publish lang.detected for siblings; do NOT auto-translate yet."""
        try:
            _event_bus.publish(_event_bus.TOPIC_LANG_DETECTED, {
                "language":     payload.get("language"),
                "confidence":   payload.get("confidence"),
                "romanized":    payload.get("romanized", False),
                "message_id":   payload.get("message_id"),
                "channel_id":   payload.get("channel_id"),
                "community_id": payload.get("community_id"),
                "user_id":      payload.get("user_id"),
                "correlation_id": correlation_id,
            })
        except Exception:
            pass
        return {"published": True, "language": payload.get("language")}
