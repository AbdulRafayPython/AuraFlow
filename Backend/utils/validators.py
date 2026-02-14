# utils/validators.py — Input validation helpers for AuraFlow authentication
# Additive module: does NOT modify any existing logic.
import re


def validate_email(email: str) -> tuple:
    """
    Validate email format.
    Returns (is_valid: bool, error_message: str).
    """
    if not email or not email.strip():
        return False, "Email is required"

    email = email.strip()

    if len(email) > 255:
        return False, "Email must be less than 255 characters"

    # RFC-5322 simplified pattern — covers 99 %+ of real-world addresses
    email_regex = r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$'
    if not re.match(email_regex, email):
        return False, "Please enter a valid email address"

    return True, ""


def validate_password_strength(password: str) -> tuple:
    """
    Validate password complexity.
    Returns (is_valid: bool, error_message: str).

    Rules:
      - 8–128 characters
      - At least one uppercase letter
      - At least one lowercase letter
      - At least one digit
      - At least one special character
    """
    if not password:
        return False, "Password is required"

    if len(password) < 8:
        return False, "Password must be at least 8 characters long"

    if len(password) > 128:
        return False, "Password must be less than 128 characters"

    if not re.search(r'[A-Z]', password):
        return False, "Password must contain at least one uppercase letter"

    if not re.search(r'[a-z]', password):
        return False, "Password must contain at least one lowercase letter"

    if not re.search(r'\d', password):
        return False, "Password must contain at least one digit"

    if not re.search(r'[!@#$%^&*()\-_=+\[\]{}|;:\'",.<>?/`~\\]', password):
        return False, "Password must contain at least one special character (!@#$...)"

    return True, ""


def validate_username(username: str) -> tuple:
    """
    Validate username format.
    Returns (is_valid: bool, error_message: str).
    """
    if not username or not username.strip():
        return False, "Username is required"

    username = username.strip()

    if len(username) < 3:
        return False, "Username must be at least 3 characters"

    if len(username) > 32:
        return False, "Username must be less than 32 characters"

    if not re.match(r'^[a-zA-Z0-9_]+$', username):
        return False, "Username can only contain letters, numbers, and underscores"

    return True, ""
