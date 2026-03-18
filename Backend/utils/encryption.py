"""
AuraFlow Field-Level Encryption Utility
========================================
Fernet-based symmetric encryption for sensitive fields (e.g. DM content).
Requires ENCRYPTION_KEY env var (base64-encoded 32-byte key).

Generate a key:
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""

import os
import logging
from functools import lru_cache

log = logging.getLogger(__name__)

_ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "")


@lru_cache(maxsize=1)
def _get_fernet():
    """Return a cached Fernet instance, or None if encryption is not configured."""
    if not _ENCRYPTION_KEY:
        return None
    try:
        from cryptography.fernet import Fernet
        return Fernet(_ENCRYPTION_KEY.encode())
    except Exception as e:
        log.warning(f"[ENCRYPTION] Failed to initialise Fernet: {e}")
        return None


def encrypt(plaintext: str) -> str:
    """Encrypt a string. Returns ciphertext or the original plaintext if encryption is unavailable."""
    f = _get_fernet()
    if f is None:
        return plaintext
    try:
        return f.encrypt(plaintext.encode()).decode()
    except Exception:
        return plaintext


def decrypt(ciphertext: str) -> str:
    """Decrypt a string. Returns plaintext or the original value if decryption fails."""
    f = _get_fernet()
    if f is None:
        return ciphertext
    try:
        return f.decrypt(ciphertext.encode()).decode()
    except Exception:
        return ciphertext
