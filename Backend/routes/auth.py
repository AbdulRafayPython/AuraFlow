from flask import request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from database import get_db_connection
from utils import get_avatar_url, format_user_data
import bcrypt

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