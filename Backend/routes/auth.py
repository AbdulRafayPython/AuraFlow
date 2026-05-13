
import logging
from flask import  request, jsonify
from flask_jwt_extended import (
    create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity, get_jwt, decode_token
)
from database import get_db_connection
from services.otp_service import verify_otp
from services.session_manager import (
    create_session, rotate_refresh_token, revoke_session,
    revoke_all_sessions, get_active_sessions, revoke_session_by_id,
    blocklist_access_token, check_refresh_rate_limit
)
from config import JWT_REFRESH_TOKEN_EXPIRES_DAYS
# FIX 1: Use cached user-id helper to eliminate repeated DB lookups
from utils import get_user_id, invalidate_user_id_cache
from services.redis_client import cache_get, cache_set, cache_delete
import secrets
from datetime import datetime, timedelta
from utils import get_avatar_url, format_user_data
from utils.validators import validate_email, validate_password_strength, validate_username
import bcrypt
import uuid

logging.basicConfig(level=logging.DEBUG)


# ----------------------------------------------------------------------
# SIGNUP
# ----------------------------------------------------------------------
def signup():
    # Honour the platform-wide registration toggle (system-admin setting).
    try:
        from services.platform_config import is_registration_enabled, is_maintenance_mode
        if is_maintenance_mode():
            return jsonify({'error': 'Platform is in maintenance mode. Please try again later.'}), 503
        if not is_registration_enabled():
            return jsonify({'error': 'Registration is currently disabled.'}), 403
    except Exception:
        pass

    data = request.get_json() or {}
    username      = data.get('username')
    password      = data.get('password')
    email         = data.get('email')
    display_name  = data.get('displayName')

    if not username or not password:
        return jsonify({'error': 'username and password are required'}), 400

    # ── NEW: Input validation ──────────────────────────────────────
    valid, msg = validate_username(username)
    if not valid:
        return jsonify({'error': msg}), 400

    if not email:
        return jsonify({'error': 'Email is required'}), 400

    valid, msg = validate_email(email)
    if not valid:
        return jsonify({'error': msg}), 400

    valid, msg = validate_password_strength(password)
    if not valid:
        return jsonify({'error': msg}), 400
    # ── END validation ─────────────────────────────────────────────

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s", (username,))
            if cur.fetchone():
                return jsonify({'error': 'User already exists'}), 400

            if email:
                cur.execute("SELECT id FROM users WHERE email = %s", (email,))
                if cur.fetchone():
                    return jsonify({'error': 'Email already in use'}), 400

            hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            
            # 🔥 FIX: Generate proper avatar URL
            avatar_url = get_avatar_url(username)
            print("[DEBUG] Generated avatar URL during signup:", avatar_url)

            # ── NEW: Generate email-verification token ─────────────
            verification_token = secrets.token_urlsafe(48)
            verification_expires = datetime.utcnow() + timedelta(hours=24)
            # ── END ────────────────────────────────────────────────
            
            cur.execute(
                """
                INSERT INTO users (email, display_name, username, password, avatar_url, is_first_login,
                                   email_verified, email_verification_token, email_verification_expires)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (email, display_name or username, username, hashed, avatar_url, 1,
                 0, verification_token, verification_expires)
            )
        conn.commit()
        print(f"[INFO] User registered: {username} with avatar: {avatar_url}")

        # ── NEW: Send verification email (non-blocking on failure) ─
        try:
            from services.email_service import send_verification_email
            frontend_url = request.headers.get('Origin', 'http://localhost:5173')
            send_verification_email(email, verification_token, frontend_url)
        except Exception as mail_err:
            logging.warning(f"[SIGNUP] Verification email failed for {email}: {mail_err}")
        # ── END ────────────────────────────────────────────────────

    finally:
        conn.close()

    return jsonify({
        'message': 'Account created! Please check your email to verify your account.',
        'requiresVerification': True
    }), 201

# ----------------------------------------------------------------------
# LOGIN
# ----------------------------------------------------------------------
def login():
    data = request.get_json() or {}
    identifier = data.get('username')  # username or email
    password   = data.get('password')

    if not identifier or not password:
        return jsonify({'error': 'username (or email) and password are required'}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, username, email, display_name, bio, avatar_url, 
                       status, custom_status, is_first_login, password,
                       email_verified, role
                FROM users 
                WHERE username = %s OR email = %s
                """,
                (identifier, identifier)
            )
            row = cur.fetchone()
            if not row:
                return jsonify({'error': 'Invalid credentials'}), 401

            stored_hash = row['password']
            if not bcrypt.checkpw(password.encode('utf-8'), stored_hash.encode('utf-8')):
                return jsonify({'error': 'Invalid credentials'}), 401

            # ── NEW: Block login if email is not verified ──────────
            if not row.get('email_verified', 1):
                return jsonify({
                    'error': 'Please verify your email before logging in. Check your inbox for a verification link.',
                    'code': 'EMAIL_NOT_VERIFIED',
                    'email': row.get('email', '')
                }), 403
            # ── END ────────────────────────────────────────────────

            token = create_access_token(identity=row['username'])

            # FIX 1: Seed the user-id Redis cache now — avoids DB lookup on every
            # subsequent request from this user during the session.
            cache_set(f"user:id:{row['username']}", row['id'], ttl=3600)

            # Determine user role: system_admin > admin (community owner) > user
            system_role = row.get('role') or 'user'

            if system_role == 'system_admin':
                role = 'system_admin'
            else:
                # FIX 6: Cache the "is owner" flag to avoid a repeated membership scan.
                _owner_key = f"user:is_owner:{row['id']}"
                _cached_owner = cache_get(_owner_key)
                if _cached_owner is not None:
                    is_community_owner = _cached_owner
                else:
                    cur.execute(
                        "SELECT 1 FROM community_members WHERE user_id = %s AND role = 'owner' LIMIT 1",
                        (row['id'],)
                    )
                    is_community_owner = cur.fetchone() is not None
                    cache_set(_owner_key, is_community_owner, ttl=300)
                role = 'admin' if is_community_owner else 'user'

            # ── Create refresh token & session (reuse existing connection) ──
            refresh_token = create_refresh_token(identity=row['username'])
            refresh_decoded = decode_token(refresh_token)
            refresh_jti = refresh_decoded['jti']
            device_info = request.headers.get('User-Agent', 'Unknown')[:500]
            ip_address = request.remote_addr
            refresh_expires = datetime.utcnow() + timedelta(days=JWT_REFRESH_TOKEN_EXPIRES_DAYS)
            token_family = str(uuid.uuid4())
            cur.execute("""
                INSERT INTO refresh_tokens
                    (jti, user_id, token_family, device_info, ip_address, expires_at)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (refresh_jti, row['id'], token_family, device_info, ip_address, refresh_expires))

        conn.commit()
    finally:
        conn.close()

    # 🔥 FIX: Use format_user_data helper for consistent avatar URL
    user_data = format_user_data(row)
    user_data['is_first_login'] = bool(row.get('is_first_login', False))
    user_data['role'] = role
    
    print(f"[LOGIN] User: {user_data['username']}, Role: {user_data['role']}")

    return jsonify({
        "token": token,
        "refresh_token": refresh_token,
        "user": user_data
    }), 200

# ----------------------------------------------------------------------
# FIRST LOGIN FOR ONBOARDING
# ----------------------------------------------------------------------
@jwt_required()
def update_first_login():
    current_user = get_jwt_identity()
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # FIX 5: Use cached user_id (PK) for the UPDATE instead of scanning by username
            user_id = get_user_id(current_user, cur)
            if user_id:
                cur.execute(
                    "UPDATE users SET is_first_login = %s WHERE id = %s",
                    (0, user_id)
                )
        conn.commit()
    finally:
        conn.close()
    return jsonify({'message': 'First login flag updated'}), 200

# ----------------------------------------------------------------------
# LOGOUT
# ----------------------------------------------------------------------
@jwt_required()
def logout():
    current_user = get_jwt_identity()
    jwt_data = get_jwt()

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # FIX 1: Use cached get_user_id — no raw DB lookup needed
            user_id = get_user_id(current_user, cur)

        conn.commit()
    finally:
        conn.close()

    # Invalidate the user-id cache on logout so a deactivated account cannot
    # reuse a stale cached ID after token expiry.
    if user_id:
        invalidate_user_id_cache(current_user)
        cache_delete(f"user:is_owner:{user_id}")

    if user_id:
        # Blocklist the current access token so it can't be reused
        access_jti = jwt_data.get('jti')
        if access_jti:
            access_exp = datetime.utcfromtimestamp(jwt_data.get('exp', 0))
            blocklist_access_token(access_jti, user_id, access_exp)

        # Revoke the refresh token if the client sends it
        body = request.get_json(silent=True) or {}
        refresh_token_raw = body.get('refresh_token')
        if refresh_token_raw:
            try:
                refresh_decoded = decode_token(refresh_token_raw)
                refresh_jti = refresh_decoded.get('jti')
                if refresh_jti:
                    revoke_session(refresh_jti, user_id)
            except Exception:
                pass  # Invalid/expired refresh token — still complete logout

    return jsonify({'message': 'Logged out successfully'}), 200

# ----------------------------------------------------------------------
# Get User Data
# ----------------------------------------------------------------------
@jwt_required()
def get_me():
    current_user = get_jwt_identity()
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # FIX 1: Include 'role' in the SELECT to eliminate the extra query below
            cur.execute(
                """
                SELECT id, username, email, display_name, bio, avatar_url,
                      status, custom_status, is_first_login, role
                FROM users 
                WHERE username = %s
                """,
                (current_user,)
            )
            row = cur.fetchone()
            if not row:
                return jsonify({'error': 'User not found'}), 404

            # FIX 1: Seed user-id cache while we already have the row in memory
            cache_set(f"user:id:{current_user}", row['id'], ttl=3600)
            
            # Determine user role: system_admin > admin (community owner) > user
            user_id = row['id']
            # role is already in the SELECT above — no second query needed
            system_role = row.get('role') or 'user'

            if system_role == 'system_admin':
                role = 'system_admin'
            else:
                # FIX 6: Cache the "is owner" flag to avoid a repeated membership scan
                _owner_key = f"user:is_owner:{user_id}"
                _cached_owner = cache_get(_owner_key)
                if _cached_owner is not None:
                    is_community_owner = _cached_owner
                else:
                    cur.execute(
                        "SELECT 1 FROM community_members WHERE user_id = %s AND role = 'owner' LIMIT 1",
                        (user_id,)
                    )
                    is_community_owner = cur.fetchone() is not None
                    cache_set(_owner_key, is_community_owner, ttl=300)
                role = 'admin' if is_community_owner else 'user'
    finally:
        conn.close()

    # 🔥 FIX: Use format_user_data helper
    user_data = format_user_data(row)
    user_data['is_first_login'] = bool(row.get('is_first_login', False))
    user_data['role'] = role

    # Include notification settings from normalized table
    conn2 = get_db_connection()
    try:
        with conn2.cursor() as cur2:
            cur2.execute("SELECT * FROM user_notification_settings WHERE user_id = %s", (user_data['id'],))
            ns_row = cur2.fetchone()
            if ns_row:
                user_data['notification_settings'] = {
                    col: bool(ns_row[col]) if col != 'email_batch_interval_minutes' else ns_row[col]
                    for col in NOTIFICATION_COLUMNS
                }
            else:
                user_data['notification_settings'] = dict(NOTIFICATION_DEFAULTS)
    finally:
        conn2.close()
    
    print(f"[GET_ME] User: {user_data['username']}, Role: {user_data['role']}")

    return jsonify(user_data), 200

#---------------------------------------------------------------------------------
# forgot-password
#----------------------------------------------------------------------------------
def forgot_password():
    from services.email_service import send_otp_email
    from services.otp_service import create_and_store_otp
    
    data = request.get_json()
    email = data.get("email")

    if not email:
        return jsonify({"error": "Email is required"}), 400
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM users WHERE email=%s", (email,))
            user = cur.fetchone()

            if not user:
                return jsonify({"error": "User not found"}), 404

            # Generate 6-digit OTP using otp_service
            otp = create_and_store_otp(email)
            
            # Send OTP via email
            send_otp_email(email, otp)
    finally:
        conn.close()

    return jsonify({
        "message": "Reset password OTP has been sent to your email"
    }), 200

def verify_otp_endpoint():
    from services.otp_service import verify_otp
    from services.redis_client import get_redis
    
    data = request.get_json()
    email = data.get("email")
    otp = data.get("otp")

    if not email or not otp:
        return jsonify({"error": "Email and OTP are required"}), 400

    # Rate limit OTP attempts: max 5 per 15 minutes per email
    r = get_redis()
    if r:
        key = f"otp_attempts:{email}"
        attempts = r.incr(key)
        if attempts == 1:
            r.expire(key, 900)  # 15 min window
        if attempts > 5:
            return jsonify({"error": "Too many OTP attempts. Try again later."}), 429

    valid, error_msg = verify_otp(email, otp)
    
    if not valid:
        return jsonify({"error": error_msg}), 400

    # Clear rate limit on success
    if r:
        r.delete(f"otp_attempts:{email}")

    return jsonify({
        "message": "OTP verified successfully",
        "email": email
    }), 200

#----------------------------------------------------------------------------------------
# reset password
#------------------------------------------------------------------------

def reset_password():
    logging.debug("========== Reset Password API Called ==========")

    data = request.get_json()
    logging.debug(f"Incoming Request Data: {data}")

    email = data.get("email")
    otp = data.get("otp")
    new_password = data.get("new_password")

    if not email or not otp or not new_password:
        logging.error("Missing fields: Email, OTP, or Password not provided.")
        return jsonify({"error": "Email, OTP, and new password are required"}), 400

    # OTP validation
    logging.debug(f"Verifying OTP for email: {email}, OTP: {otp}")
    valid, error_msg = verify_otp(email, otp)

    logging.debug(f"OTP Verification result: valid={valid}, message={error_msg}")

    if not valid:
        logging.error(f"OTP Validation Failed: {error_msg}")
        return jsonify({"error": error_msg}), 400

    # Updating password in DB
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            logging.debug(f"Checking if user exists for email: {email}")
            cur.execute("SELECT id FROM users WHERE email=%s", (email,))
            user = cur.fetchone()

            logging.debug(f"User lookup result: {user}")

            if not user:
                logging.error("User not found in database.")
                return jsonify({"error": "User not found"}), 404

            # Password hashing
            hashed_pw = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt()).decode('utf-8')
            logging.debug(f"Generated hashed password: {hashed_pw}")

            logging.debug("Updating user password in database...")
            cur.execute("UPDATE users SET password=%s WHERE id=%s", (hashed_pw, user["id"]))

            logging.debug("Deleting OTP from otp_store for this email...")
            cur.execute("DELETE FROM otp_codes WHERE email=%s", (email,))


        conn.commit()
        logging.debug("Password update committed to DB successfully.")

    except Exception as e:
        logging.exception("Unexpected error during password reset")
        return jsonify({"error": "Internal Server Error", "details": str(e)}), 500

    finally:
        conn.close()
        logging.debug("Database connection closed.")

    logging.debug("Password reset successfully completed.")
    logging.debug("==============================================")

    return jsonify({"message": "Password reset successfully"}), 200


#----------------------------------------------------------------------------------------
# Update Profile
#------------------------------------------------------------------------

@jwt_required()
def update_profile():
    """Update user profile (display_name, bio, avatar_url) - supports both JSON and file upload"""
    current_user = get_jwt_identity()
    
    # Check if it's a file upload (multipart/form-data) or JSON
    if request.content_type and 'multipart/form-data' in request.content_type:
        # Handle file upload
        display_name = request.form.get('display_name')
        bio = request.form.get('bio')
        avatar_file = request.files.get('avatar')
        remove_avatar = request.form.get('remove_avatar') == 'true'
        
        avatar_url = None
        
        if remove_avatar:
            # Set avatar_url to None to revert to Dicebear
            avatar_url = None
        elif avatar_file:
            # Handle file upload - save to uploads directory
            import os
            from werkzeug.utils import secure_filename
            
            # Create uploads directory if it doesn't exist
            upload_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'uploads', 'avatars')
            os.makedirs(upload_dir, exist_ok=True)
            
            # Generate unique filename
            ext = os.path.splitext(avatar_file.filename)[1]
            filename = f"{current_user}_{int(datetime.now().timestamp())}{ext}"
            filepath = os.path.join(upload_dir, secure_filename(filename))
            
            # Save file
            avatar_file.save(filepath)
            
            # Store relative URL path
            avatar_url = f"/uploads/avatars/{secure_filename(filename)}"
    else:
        # Handle JSON request
        data = request.get_json() or {}
        display_name = data.get('display_name')
        bio = data.get('bio')
        avatar_url = data.get('avatar_url')
        remove_avatar = data.get('remove_avatar', False)
        
        if remove_avatar:
            avatar_url = None
    
    # At least one field must be provided
    if not any([display_name, bio, avatar_url is not None, remove_avatar]):
        return jsonify({'error': 'At least one field (display_name, bio, or avatar_url) is required'}), 400
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Build dynamic update query based on what fields are provided
            update_fields = []
            update_values = []
            
            if display_name is not None:
                update_fields.append('display_name = %s')
                update_values.append(display_name)
            
            if bio is not None:
                update_fields.append('bio = %s')
                update_values.append(bio)
            
            if avatar_url is not None or remove_avatar:
                update_fields.append('avatar_url = %s')
                update_values.append(avatar_url)
            
            update_values.append(current_user)
            
            query = f"UPDATE users SET {', '.join(update_fields)} WHERE username = %s"
            cur.execute(query, update_values)
        
        conn.commit()
    except Exception as e:
        logging.error(f"Error updating profile: {str(e)}")
        return jsonify({'error': 'Failed to update profile'}), 500
    finally:
        conn.close()
    
    return jsonify({
        'message': 'Profile updated successfully',
        'avatar_url': get_avatar_url(current_user, avatar_url) if avatar_url else None
    }), 200


# ----------------------------------------------------------------------
# EMAIL VERIFICATION
# ----------------------------------------------------------------------
def verify_email():
    """
    Verify a user's email via the token sent during signup.
    Query params: token, email
    """
    token = request.args.get('token') or (request.get_json() or {}).get('token')
    email = request.args.get('email') or (request.get_json() or {}).get('email')

    if not token or not email:
        return jsonify({'error': 'Verification token and email are required'}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, email_verified, email_verification_token, email_verification_expires
                FROM users WHERE email = %s
                """,
                (email,)
            )
            user = cur.fetchone()

            if not user:
                return jsonify({'error': 'User not found'}), 404

            if user['email_verified']:
                return jsonify({'message': 'Email is already verified. You can log in.', 'alreadyVerified': True}), 200

            if user['email_verification_token'] != token:
                return jsonify({'error': 'Invalid verification token'}), 400

            if user['email_verification_expires'] and datetime.utcnow() > user['email_verification_expires']:
                return jsonify({
                    'error': 'Verification link has expired. Please request a new one.',
                    'code': 'TOKEN_EXPIRED'
                }), 400

            # Mark as verified
            cur.execute(
                """
                UPDATE users
                SET email_verified = 1,
                    email_verification_token = NULL,
                    email_verification_expires = NULL
                WHERE id = %s
                """,
                (user['id'],)
            )
        conn.commit()
        logging.info(f"[VERIFY] Email verified for {email}")
    finally:
        conn.close()

    return jsonify({'message': 'Email verified successfully! You can now log in.'}), 200


def resend_verification():
    """
    Resend the verification email for a user whose email is not yet verified.
    Body: { email }
    """
    data = request.get_json() or {}
    email = data.get('email')

    if not email:
        return jsonify({'error': 'Email is required'}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email_verified FROM users WHERE email = %s",
                (email,)
            )
            user = cur.fetchone()
            if not user:
                # Don't reveal whether user exists
                return jsonify({'message': 'If that email is registered, a new verification link has been sent.'}), 200

            if user['email_verified']:
                return jsonify({'message': 'Email is already verified.'}), 200

            # Generate new token
            new_token = secrets.token_urlsafe(48)
            new_expires = datetime.utcnow() + timedelta(hours=24)
            cur.execute(
                """
                UPDATE users
                SET email_verification_token = %s, email_verification_expires = %s
                WHERE id = %s
                """,
                (new_token, new_expires, user['id'])
            )
        conn.commit()

        # Send email
        try:
            from services.email_service import send_verification_email
            frontend_url = request.headers.get('Origin', 'http://localhost:5173')
            send_verification_email(email, new_token, frontend_url)
        except Exception as mail_err:
            logging.warning(f"[RESEND] Verification email failed for {email}: {mail_err}")

    finally:
        conn.close()

    return jsonify({'message': 'If that email is registered, a new verification link has been sent.'}), 200


# ======================================================================
# SESSION MANAGEMENT ENDPOINTS
# ======================================================================

# ----------------------------------------------------------------------
# REFRESH TOKEN  (POST /api/token/refresh)
# ----------------------------------------------------------------------
@jwt_required(refresh=True)
def refresh():
    """
    Rotate the refresh token and issue a fresh access token.
    The client sends the refresh token in the Authorization header.
    Token rotation + reuse detection is handled by session_manager.
    """
    current_user = get_jwt_identity()
    old_jwt = get_jwt()
    old_jti = old_jwt['jti']

    # Rate limit
    if check_refresh_rate_limit(current_user):
        return jsonify({'error': 'Too many refresh attempts. Try again later.'}), 429

    # Resolve user_id
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # FIX 1: Use cached lookup — skips DB on warm cache
            user_id = get_user_id(current_user, cur)
            if not user_id:
                return jsonify({'error': 'User not found'}), 404
    finally:
        conn.close()

    # Create new token pair
    new_access_token = create_access_token(identity=current_user)
    new_refresh_token = create_refresh_token(identity=current_user)
    new_refresh_jti = decode_token(new_refresh_token)['jti']
    new_expires = datetime.utcnow() + timedelta(days=JWT_REFRESH_TOKEN_EXPIRES_DAYS)

    # Rotate: revoke old refresh, store new (with reuse detection)
    result = rotate_refresh_token(old_jti, new_refresh_jti, new_expires, user_id)

    if not result['success']:
        if result['reason'] == 'reuse_detected':
            return jsonify({
                'error': 'Session compromised. Please log in again.',
                'code': 'SESSION_COMPROMISED'
            }), 401
        return jsonify({'error': 'Invalid refresh token'}), 401

    return jsonify({
        'token': new_access_token,
        'refresh_token': new_refresh_token,
    }), 200


# ----------------------------------------------------------------------
# GET ACTIVE SESSIONS  (GET /api/sessions)
# ----------------------------------------------------------------------
@jwt_required()
def get_sessions():
    """List all active sessions for the current user (multi-device view)."""
    current_user = get_jwt_identity()

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # FIX 1: Use cached lookup — skips DB on warm cache
            user_row_id = get_user_id(current_user, cur)
            if not user_row_id:
                return jsonify({'error': 'User not found'}), 404
            sessions = get_active_sessions(user_row_id)
    finally:
        conn.close()

    return jsonify({'sessions': sessions}), 200


# ----------------------------------------------------------------------
# REVOKE A SESSION  (POST /api/sessions/revoke)
# ----------------------------------------------------------------------
@jwt_required()
def revoke_session_endpoint():
    """Revoke a specific session by its database row ID."""
    current_user = get_jwt_identity()
    data = request.get_json() or {}
    session_id = data.get('session_id')

    if not session_id:
        return jsonify({'error': 'session_id is required'}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # FIX 1: Use cached lookup — skips DB on warm cache
            _uid = get_user_id(current_user, cur)
            if not _uid:
                return jsonify({'error': 'User not found'}), 404
    finally:
        conn.close()

    success = revoke_session_by_id(session_id, _uid)
    if success:
        return jsonify({'message': 'Session revoked'}), 200
    return jsonify({'error': 'Session not found or already revoked'}), 404


# ----------------------------------------------------------------------
# REVOKE ALL SESSIONS  (POST /api/sessions/revoke-all)
# ----------------------------------------------------------------------
@jwt_required()
def revoke_all_sessions_endpoint():
    """Revoke ALL sessions for the current user. Forces re-login on every device."""
    current_user = get_jwt_identity()

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # FIX 1: Use cached lookup — skips DB on warm cache
            _uid = get_user_id(current_user, cur)
            if not _uid:
                return jsonify({'error': 'User not found'}), 404
    finally:
        conn.close()

    count = revoke_all_sessions(_uid)
    return jsonify({'message': f'Revoked {count} sessions', 'revoked_count': count}), 200


# ======================================================================
# NOTIFICATION SETTINGS ENDPOINTS (normalized table)
# ======================================================================

# All columns in user_notification_settings (except PKs and timestamps)
NOTIFICATION_COLUMNS = [
    "notify_direct_messages", "notify_channel_messages", "notify_friend_requests",
    "notify_friend_online", "notification_sounds",
    "email_alerts_enabled", "email_dms_and_calls", "email_community_messages",
    "email_agent_notifications", "email_agent_summaries", "email_batch_interval_minutes",
]

NOTIFICATION_DEFAULTS = {
    "notify_direct_messages": True,
    "notify_channel_messages": True,
    "notify_friend_requests": True,
    "notify_friend_online": False,
    "notification_sounds": True,
    "email_alerts_enabled": True,
    "email_dms_and_calls": True,
    "email_community_messages": False,
    "email_agent_notifications": True,
    "email_agent_summaries": True,
    "email_batch_interval_minutes": 5,
}

ALLOWED_NOTIFICATION_KEYS = set(NOTIFICATION_COLUMNS)


@jwt_required()
def get_notification_settings():
    """GET /api/users/settings/notifications — return the user's notification prefs."""
    current_user = get_jwt_identity()
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # FIX 1: Use cached lookup — skips DB on warm cache
            user_id = get_user_id(current_user, cur)
            if not user_id:
                return jsonify({'error': 'User not found'}), 404

            cur.execute("SELECT * FROM user_notification_settings WHERE user_id = %s", (user_id,))
            row = cur.fetchone()

            if not row:
                # Auto-create default row
                cur.execute("INSERT INTO user_notification_settings (user_id) VALUES (%s)", (user_id,))
                conn.commit()
                result = dict(NOTIFICATION_DEFAULTS)
            else:
                result = {col: bool(row[col]) if col != 'email_batch_interval_minutes' else row[col]
                          for col in NOTIFICATION_COLUMNS}
    finally:
        conn.close()

    return jsonify(result), 200


@jwt_required()
def update_notification_settings():
    """PATCH /api/users/settings/notifications — update notification prefs (partial)."""
    current_user = get_jwt_identity()
    data = request.get_json() or {}

    # Only allow known keys
    clean = {k: v for k, v in data.items() if k in ALLOWED_NOTIFICATION_KEYS}
    if not clean:
        return jsonify({'error': 'No valid notification settings provided'}), 400

    # Validate types
    for key, val in clean.items():
        if key == 'email_batch_interval_minutes':
            if not isinstance(val, int) or val < 1 or val > 60:
                return jsonify({'error': f'{key} must be an integer between 1 and 60'}), 400
        else:
            if not isinstance(val, bool):
                return jsonify({'error': f'{key} must be a boolean'}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # FIX 1: Use cached lookup — skips DB on warm cache
            user_id = get_user_id(current_user, cur)
            if not user_id:
                return jsonify({'error': 'User not found'}), 404

            # Upsert: ensure row exists
            cur.execute(
                "INSERT IGNORE INTO user_notification_settings (user_id) VALUES (%s)",
                (user_id,)
            )

            # Build SET clause dynamically
            set_parts = [f"{k} = %s" for k in clean.keys()]
            values = [int(v) if isinstance(v, bool) else v for v in clean.values()]
            values.append(user_id)

            cur.execute(
                f"UPDATE user_notification_settings SET {', '.join(set_parts)} WHERE user_id = %s",
                tuple(values)
            )
        conn.commit()

        # Read back full settings
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM user_notification_settings WHERE user_id = %s", (user_id,))
            row = cur.fetchone()
            result = {col: bool(row[col]) if col != 'email_batch_interval_minutes' else row[col]
                      for col in NOTIFICATION_COLUMNS}
    except Exception as e:
        logging.error(f"[NOTIF SETTINGS] Update failed: {e}")
        return jsonify({'error': 'Failed to update notification settings'}), 500
    finally:
        conn.close()

    return jsonify(result), 200