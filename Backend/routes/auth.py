
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
            
            # Check if user is admin (owner of any community)
            cur.execute(
                "SELECT 1 FROM community_members WHERE user_id = %s AND role = 'owner' LIMIT 1",
                (row['id'],)
            )
            is_admin = cur.fetchone() is not None
        conn.commit()
    finally:
        conn.close()

    # 🔥 FIX: Use format_user_data helper for consistent avatar URL
    user_data = format_user_data(row)
    user_data['is_first_login'] = bool(row.get('is_first_login', False))
    user_data['role'] = 'admin' if is_admin else 'user'
    
    print(f"[LOGIN] User: {user_data['username']}, Role: {user_data['role']}, Is Admin: {is_admin}")

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
            
            # Check if user is admin (owner of any community)
            user_id = row['id']
            cur.execute(
                "SELECT 1 FROM community_members WHERE user_id = %s AND role = 'owner' LIMIT 1",
                (user_id,)
            )
            is_admin = cur.fetchone() is not None
    finally:
        conn.close()

    # 🔥 FIX: Use format_user_data helper
    user_data = format_user_data(row)
    user_data['is_first_login'] = bool(row.get('is_first_login', False))
    user_data['role'] = 'admin' if is_admin else 'user'
    
    print(f"[GET_ME] User: {user_data['username']}, Role: {user_data['role']}, Is Admin: {is_admin}")

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