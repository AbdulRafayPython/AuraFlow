"""
TC-UT-01 to TC-UT-10
Unit tests for utils/validators.py
Tests: validate_email, validate_password_strength, validate_username
No database, no network — pure logic tests.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from utils.validators import validate_email, validate_password_strength, validate_username


# ── validate_email ─────────────────────────────────────────────────────

class TestValidateEmail:
    """TC-UT-01 to TC-UT-03: Email validation."""

    def test_valid_email(self):
        """TC-UT-01: Standard valid email address accepted."""
        ok, msg = validate_email("student@kiet.edu.pk")
        assert ok is True
        assert msg == ""

    def test_invalid_email_missing_at(self):
        """TC-UT-02: Email without @ symbol rejected."""
        ok, msg = validate_email("studentkiet.edu.pk")
        assert ok is False
        assert "valid email" in msg.lower()

    def test_empty_email(self):
        """TC-UT-03: Blank email string rejected."""
        ok, msg = validate_email("")
        assert ok is False
        assert msg != ""

    def test_email_too_long(self):
        """TC-UT-03b: Email exceeding 255 characters rejected."""
        long_email = "a" * 251 + "@x.co"   # 256 chars — over the 255 limit
        ok, msg = validate_email(long_email)
        assert ok is False

    def test_email_no_tld(self):
        """TC-UT-03c: Email without TLD rejected."""
        ok, msg = validate_email("user@nodot")
        assert ok is False


# ── validate_password_strength ─────────────────────────────────────────

class TestValidatePasswordStrength:
    """TC-UT-04 to TC-UT-07: Password strength validation."""

    def test_strong_password(self):
        """TC-UT-04: Password meeting all rules accepted."""
        ok, msg = validate_password_strength("AuraFlow@2024")
        assert ok is True
        assert msg == ""

    def test_password_too_short(self):
        """TC-UT-05: Password under 8 chars rejected."""
        ok, msg = validate_password_strength("Ab1!")
        assert ok is False
        assert "8" in msg

    def test_password_no_uppercase(self):
        """TC-UT-06: Password without uppercase letter rejected."""
        ok, msg = validate_password_strength("auraflow@2024")
        assert ok is False
        assert "uppercase" in msg.lower()

    def test_password_no_special_char(self):
        """TC-UT-07: Password without special character rejected."""
        ok, msg = validate_password_strength("AuraFlow2024")
        assert ok is False
        assert "special" in msg.lower()

    def test_password_no_digit(self):
        """TC-UT-07b: Password without digit rejected."""
        ok, msg = validate_password_strength("AuraFlow@xxxx")
        assert ok is False
        assert "digit" in msg.lower()

    def test_empty_password(self):
        """TC-UT-07c: Empty password rejected."""
        ok, msg = validate_password_strength("")
        assert ok is False


# ── validate_username ──────────────────────────────────────────────────

class TestValidateUsername:
    """TC-UT-08 to TC-UT-10: Username validation."""

    def test_valid_username(self):
        """TC-UT-08: Alphanumeric username with underscore accepted."""
        ok, msg = validate_username("ali_hassan_99")
        assert ok is True
        assert msg == ""

    def test_username_too_short(self):
        """TC-UT-09: Username under 3 chars rejected."""
        ok, msg = validate_username("ab")
        assert ok is False
        assert "3" in msg

    def test_username_invalid_chars(self):
        """TC-UT-10: Username with spaces or symbols rejected."""
        ok, msg = validate_username("ali hassan!")
        assert ok is False
        assert "letters" in msg.lower() or "numbers" in msg.lower() or "underscores" in msg.lower()

    def test_username_too_long(self):
        """TC-UT-10b: Username over 32 chars rejected."""
        ok, msg = validate_username("a" * 33)
        assert ok is False

    def test_empty_username(self):
        """TC-UT-10c: Empty username rejected."""
        ok, msg = validate_username("")
        assert ok is False
