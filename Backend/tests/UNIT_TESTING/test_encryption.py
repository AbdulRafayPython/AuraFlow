"""
TC-UT-11 to TC-UT-18
Unit tests for utils/encryption.py
Tests: encrypt/decrypt roundtrip, passthrough when no key set, tampered ciphertext.
No database, no network.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest


class TestEncryptionNoKey:
    """TC-UT-11 to TC-UT-12: Behaviour when ENCRYPTION_KEY is not set (passthrough mode)."""

    def setup_method(self):
        """Ensure ENCRYPTION_KEY is unset and Fernet cache is cleared."""
        os.environ.pop("ENCRYPTION_KEY", None)
        # Clear the lru_cache so _get_fernet() re-evaluates
        import utils.encryption as enc
        enc._get_fernet.cache_clear()
        enc._ENCRYPTION_KEY = ""

    def test_encrypt_returns_plaintext_when_no_key(self):
        """TC-UT-11: encrypt() returns plaintext unchanged when key not configured."""
        from utils.encryption import encrypt
        result = encrypt("Hello AuraFlow")
        assert result == "Hello AuraFlow"

    def test_decrypt_returns_ciphertext_when_no_key(self):
        """TC-UT-12: decrypt() returns value unchanged when key not configured."""
        from utils.encryption import decrypt
        result = decrypt("some_token_value")
        assert result == "some_token_value"


class TestEncryptionWithKey:
    """TC-UT-13 to TC-UT-18: Behaviour with a valid Fernet key."""

    def setup_method(self):
        """Generate and set a valid Fernet key for each test."""
        from cryptography.fernet import Fernet
        key = Fernet.generate_key().decode()
        os.environ["ENCRYPTION_KEY"] = key
        import utils.encryption as enc
        enc._get_fernet.cache_clear()
        enc._ENCRYPTION_KEY = key

    def teardown_method(self):
        os.environ.pop("ENCRYPTION_KEY", None)
        import utils.encryption as enc
        enc._get_fernet.cache_clear()
        enc._ENCRYPTION_KEY = ""

    def test_encrypt_produces_different_output(self):
        """TC-UT-13: encrypt() output differs from plaintext."""
        from utils.encryption import encrypt
        result = encrypt("secret message")
        assert result != "secret message"

    def test_roundtrip_short_string(self):
        """TC-UT-14: encrypt then decrypt returns original short string."""
        from utils.encryption import encrypt, decrypt
        original = "Hello AuraFlow!"
        assert decrypt(encrypt(original)) == original

    def test_roundtrip_long_string(self):
        """TC-UT-15: encrypt then decrypt returns original long string."""
        from utils.encryption import encrypt, decrypt
        original = "A" * 1000
        assert decrypt(encrypt(original)) == original

    def test_roundtrip_unicode_roman_urdu(self):
        """TC-UT-16: encrypt/decrypt preserves Roman Urdu and emoji content."""
        from utils.encryption import encrypt, decrypt
        original = "Bohat acha lag raha hai 😊🔥"
        assert decrypt(encrypt(original)) == original

    def test_tampered_ciphertext_returns_original(self):
        """TC-UT-17: decrypt() returns the tampered string when decryption fails (graceful fallback)."""
        from utils.encryption import decrypt
        tampered = "this_is_not_valid_fernet_ciphertext"
        result = decrypt(tampered)
        assert result == tampered   # fallback: return input unchanged

    def test_empty_string_roundtrip(self):
        """TC-UT-18: empty string survives encrypt/decrypt roundtrip."""
        from utils.encryption import encrypt, decrypt
        assert decrypt(encrypt("")) == ""
