"""
services/session_manager.py - Secure Session Management for AuraFlow

Handles:
  - Refresh token lifecycle (create, rotate, revoke)
  - Multi-device session tracking
  - Token reuse detection (family-based)
  - Access token blocklisting (in-memory cache + DB persistence)
  - Session enumeration and management
  - Rate limiting for refresh endpoint

Design notes:
  - Access token blocklist uses an in-memory dict for zero-DB-lookup validation.
    On startup, unexpired entries are loaded from DB to survive restarts.
  - Refresh tokens are always validated against DB (lower frequency, higher security).
  - Token families enable reuse detection: if a revoked refresh token is presented,
    the entire family is revoked (attacker stole an old token).
"""

import uuid
import time
import logging
from datetime import datetime, timedelta
from threading import Lock
from collections import defaultdict
from database import get_db_connection

log = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────
# In-Memory Access Token Blocklist Cache
# ─────────────────────────────────────────────────────────────────────
_blocklist_cache: dict[str, datetime] = {}   # jti -> expires_at
_blocklist_lock = Lock()


def _cache_blocklist(jti: str, expires_at: datetime):
    """Add a JTI to the in-memory blocklist cache."""
    with _blocklist_lock:
        _blocklist_cache[jti] = expires_at


def _is_in_blocklist_cache(jti: str) -> bool:
    """Check if a JTI is in the in-memory blocklist cache."""
    with _blocklist_lock:
        if jti in _blocklist_cache:
            if _blocklist_cache[jti] > datetime.utcnow():
                return True
            else:
                del _blocklist_cache[jti]
        return False


def cleanup_blocklist_cache():
    """Remove expired entries from the in-memory cache."""
    now = datetime.utcnow()
    with _blocklist_lock:
        expired = [jti for jti, exp in _blocklist_cache.items() if exp <= now]
        for jti in expired:
            del _blocklist_cache[jti]
    if expired:
        log.debug(f"[SESSION] Cleaned {len(expired)} expired entries from blocklist cache")


def load_blocklist_from_db():
    """Load unexpired blocklisted access tokens into memory on app startup."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT jti, expires_at FROM token_blocklist WHERE expires_at > NOW()")
            rows = cur.fetchall()
            with _blocklist_lock:
                for row in rows:
                    _blocklist_cache[row['jti']] = row['expires_at']
            log.info(f"[SESSION] Loaded {len(rows)} blocked tokens into cache")
    except Exception as e:
        log.warning(f"[SESSION] Could not load blocklist (table may not exist yet): {e}")
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────────────
# Token Blocklist Check  (called by Flask-JWT-Extended on every @jwt_required)
# ─────────────────────────────────────────────────────────────────────
def is_token_revoked(jwt_header: dict, jwt_payload: dict) -> bool:
    """
    Determine whether a JWT should be considered revoked.

    Access tokens  → in-memory cache ONLY (fast, no DB hit per request).
    Refresh tokens → DB lookup (only called on /api/token/refresh, acceptable).
    """
    jti = jwt_payload.get('jti')
    token_type = jwt_payload.get('type', 'access')

    if not jti:
        return False

    if token_type == 'access':
        return _is_in_blocklist_cache(jti)

    if token_type == 'refresh':
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT revoked_at FROM refresh_tokens WHERE jti = %s LIMIT 1",
                    (jti,)
                )
                row = cur.fetchone()
                if not row:
                    return True          # Token not in DB → treat as revoked
                return row['revoked_at'] is not None
        finally:
            conn.close()

    return False


# ─────────────────────────────────────────────────────────────────────
# Session Creation
# ─────────────────────────────────────────────────────────────────────
def create_session(user_id: int, username: str, refresh_jti: str,
                   refresh_expires: datetime,
                   device_info: str = None, ip_address: str = None) -> str:
    """
    Create a new session (refresh token record).
    Returns the token_family UUID.
    """
    token_family = str(uuid.uuid4())

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO refresh_tokens
                    (jti, user_id, token_family, device_info, ip_address, expires_at)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (refresh_jti, user_id, token_family,
                  device_info, ip_address, refresh_expires))
        conn.commit()
        log.info(f"[SESSION] Created session for {username} "
                 f"(family: {token_family[:8]}…, device: {(device_info or '')[:40]})")
    finally:
        conn.close()

    return token_family


# ─────────────────────────────────────────────────────────────────────
# Token Rotation (with reuse-attack detection)
# ─────────────────────────────────────────────────────────────────────
def rotate_refresh_token(old_jti: str, new_jti: str,
                         new_expires: datetime, user_id: int) -> dict:
    """
    Rotate a refresh token: revoke old, store new in the same family.

    Returns
    -------
    {"success": True,  "family": "<uuid>"}             — normal rotation
    {"success": False, "reason": "reuse_detected"}     — stolen-token replay
    {"success": False, "reason": "not_found"}          — jti not in DB
    {"success": False, "reason": "user_mismatch"}      — jti belongs to another user
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, user_id, token_family, revoked_at
                FROM refresh_tokens WHERE jti = %s
            """, (old_jti,))
            old_token = cur.fetchone()

            if not old_token:
                return {"success": False, "reason": "not_found"}

            if old_token['user_id'] != user_id:
                log.warning(f"[SESSION] Token user mismatch: "
                            f"token={old_token['user_id']} request={user_id}")
                return {"success": False, "reason": "user_mismatch"}

            token_family = old_token['token_family']

            # ⚠️ REUSE DETECTION
            # If the old token was already revoked, an attacker is replaying it.
            # Revoke the ENTIRE family to cut off both attacker and legitimate user
            # (forces re-login — safe default).
            if old_token['revoked_at'] is not None:
                log.warning(f"[SESSION] 🚨 REFRESH TOKEN REUSE DETECTED! "
                            f"Family: {token_family}")
                cur.execute("""
                    UPDATE refresh_tokens
                    SET revoked_at = NOW()
                    WHERE token_family = %s AND revoked_at IS NULL
                """, (token_family,))
                conn.commit()
                return {"success": False, "reason": "reuse_detected"}

            # Normal rotation: revoke old → insert new
            cur.execute("""
                UPDATE refresh_tokens
                SET revoked_at = NOW(), replaced_by = %s
                WHERE jti = %s
            """, (new_jti, old_jti))

            cur.execute("""
                INSERT INTO refresh_tokens
                    (jti, user_id, token_family, device_info, ip_address, expires_at)
                SELECT %s, user_id, token_family, device_info, ip_address, %s
                FROM refresh_tokens WHERE jti = %s
            """, (new_jti, new_expires, old_jti))

        conn.commit()
        log.info(f"[SESSION] Rotated refresh token (family: {token_family[:8]}…)")
        return {"success": True, "family": token_family}
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────────────
# Session Revocation
# ─────────────────────────────────────────────────────────────────────
def revoke_session(refresh_jti: str, user_id: int):
    """Revoke a single refresh token by its JTI."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE refresh_tokens
                SET revoked_at = NOW()
                WHERE jti = %s AND user_id = %s AND revoked_at IS NULL
            """, (refresh_jti, user_id))
        conn.commit()
        log.info(f"[SESSION] Revoked session {refresh_jti[:8]}… for user {user_id}")
    finally:
        conn.close()


def revoke_all_sessions(user_id: int) -> int:
    """Revoke ALL active sessions for a user (password change, security breach, etc.)."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE refresh_tokens
                SET revoked_at = NOW()
                WHERE user_id = %s AND revoked_at IS NULL
            """, (user_id,))
            revoked_count = cur.rowcount
        conn.commit()
        log.info(f"[SESSION] Revoked {revoked_count} sessions for user {user_id}")
        return revoked_count
    finally:
        conn.close()


def blocklist_access_token(jti: str, user_id: int, expires_at: datetime):
    """
    Blocklist an access token for early revocation (e.g., on logout).
    Persists to DB and adds to in-memory cache.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT IGNORE INTO token_blocklist (jti, user_id, expires_at)
                VALUES (%s, %s, %s)
            """, (jti, user_id, expires_at))
        conn.commit()
        _cache_blocklist(jti, expires_at)
        log.info(f"[SESSION] Blocklisted access token {jti[:8]}… for user {user_id}")
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────────────
# Session Listing (multi-device management)
# ─────────────────────────────────────────────────────────────────────
def get_active_sessions(user_id: int) -> list:
    """Return all active (non-revoked, non-expired) sessions for a user."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, jti, device_info, ip_address, created_at, expires_at
                FROM refresh_tokens
                WHERE user_id = %s
                  AND revoked_at IS NULL
                  AND expires_at > NOW()
                ORDER BY created_at DESC
            """, (user_id,))
            sessions = cur.fetchall()

            return [{
                'id': s['id'],
                'session_id': s['jti'],
                'device': s['device_info'] or 'Unknown device',
                'ip_address': s['ip_address'] or 'Unknown',
                'created_at': s['created_at'].isoformat() if s['created_at'] else None,
                'expires_at': s['expires_at'].isoformat() if s['expires_at'] else None,
            } for s in sessions]
    finally:
        conn.close()


def revoke_session_by_id(session_id: int, user_id: int) -> bool:
    """Revoke a specific session by its database row ID (for UI-driven management)."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE refresh_tokens
                SET revoked_at = NOW()
                WHERE id = %s AND user_id = %s AND revoked_at IS NULL
            """, (session_id, user_id))
            success = cur.rowcount > 0
        conn.commit()
        if success:
            log.info(f"[SESSION] Revoked session #{session_id} for user {user_id}")
        return success
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────────────
# Rate Limiting for Refresh Endpoint
# ─────────────────────────────────────────────────────────────────────
_refresh_rate_limit: dict[str, list[float]] = defaultdict(list)
_rate_lock = Lock()
REFRESH_RATE_MAX = 10      # max refreshes per window
REFRESH_RATE_WINDOW = 60   # seconds


def check_refresh_rate_limit(username: str) -> bool:
    """
    Returns True if the user has exceeded the refresh rate limit.
    Simple sliding-window counter (in-memory, per-process).
    """
    now = time.time()
    with _rate_lock:
        timestamps = _refresh_rate_limit[username]
        _refresh_rate_limit[username] = [t for t in timestamps if now - t < REFRESH_RATE_WINDOW]
        if len(_refresh_rate_limit[username]) >= REFRESH_RATE_MAX:
            return True
        _refresh_rate_limit[username].append(now)
    return False


# ─────────────────────────────────────────────────────────────────────
# Periodic Maintenance
# ─────────────────────────────────────────────────────────────────────
def cleanup_expired_tokens():
    """
    Remove expired refresh tokens (older than 30 days) and blocklist entries.
    Called periodically by a background thread.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                DELETE FROM refresh_tokens
                WHERE expires_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
            """)
            refresh_cleaned = cur.rowcount

            cur.execute("DELETE FROM token_blocklist WHERE expires_at < NOW()")
            blocklist_cleaned = cur.rowcount
        conn.commit()

        cleanup_blocklist_cache()

        if refresh_cleaned or blocklist_cleaned:
            log.info(f"[SESSION] Cleanup: {refresh_cleaned} expired refresh tokens, "
                     f"{blocklist_cleaned} expired blocklist entries removed")
    except Exception as e:
        log.warning(f"[SESSION] Cleanup error: {e}")
    finally:
        conn.close()
