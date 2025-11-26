
import logging
from flask import  request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from database import get_db_connection
from services.otp_service import verify_otp
import secrets
from datetime import datetime, timedelta
from utils import get_avatar_url, format_user_data
import bcrypt
import uuid

logging.basicConfig(level=logging.DEBUG)


# ----------------------------------------------------------------------
# SIGNUP
# ----------------------------------------------------------------------
def signup():
    data = request.get_json() or {}
    username      = data.get('username')
    password      = data.get('password')
    email         = data.get('email')
    display_name  = data.get('displayName')

    if not username or not password:
        return jsonify({'error': 'username and password are required'}), 400

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
            
            cur.execute(
                """
                INSERT INTO users (email, display_name, username, password, avatar_url, is_first_login)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (email, display_name or username, username, hashed, avatar_url, 1)
            )
        conn.commit()
        print(f"[INFO] User registered: {username} with avatar: {avatar_url}")
    finally:
        conn.close()

    return jsonify({'message': 'User registered successfully'}), 201

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
                       status, custom_status, is_first_login, password
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

            token = create_access_token(identity=row['username'])
            cur.execute("UPDATE users SET token = %s WHERE username = %s", (token, row['username']))
        conn.commit()
    finally:
        conn.close()

    # 🔥 FIX: Use format_user_data helper for consistent avatar URL
    user_data = format_user_data(row)
    user_data['is_first_login'] = bool(row.get('is_first_login', False))

    return jsonify({
        "token": token,
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
            cur.execute(
                "UPDATE users SET is_first_login = %s WHERE username = %s",
                (0, current_user)
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
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE users SET token = NULL WHERE username = %s", (current_user,))
        conn.commit()
    finally:
        conn.close()
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
            cur.execute(
                """
                SELECT id, username, email, display_name, bio, avatar_url,
                       status, custom_status, is_first_login
                FROM users 
                WHERE username = %s
                """,
                (current_user,)
            )
            row = cur.fetchone()
            if not row:
                return jsonify({'error': 'User not found'}), 404
    finally:
        conn.close()

    # 🔥 FIX: Use format_user_data helper
    user_data = format_user_data(row)
    user_data['is_first_login'] = bool(row.get('is_first_login', False))

    return jsonify(user_data), 200
    return jsonify({
        "username": row["username"],
        "email": row.get("email"),
        "display_name": row.get("display_name"),
        "bio": row.get("bio"),
        "is_first_login": bool(row.get("is_first_login", False))
    }), 200
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
    
    data = request.get_json()
    email = data.get("email")
    otp = data.get("otp")

    if not email or not otp:
        return jsonify({"error": "Email and OTP are required"}), 400

    valid, error_msg = verify_otp(email, otp)
    
    if not valid:
        return jsonify({"error": error_msg}), 400

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
            cur.execute("DELETE FROM otp_store WHERE email=%s", (email,))


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