from flask import request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from database import get_db_connection
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
            cur.execute(
                """
                INSERT INTO users (email, display_name, username, password, is_first_login)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (email, display_name, username, hashed, 1)
            )
        conn.commit()
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
                "SELECT * FROM users WHERE username = %s OR email = %s",
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

    return jsonify({
        "token": token,
        "user": {
            "username": row["username"],
            "email": row.get("email"),
            "display_name": row.get("display_name"),
            "bio": row.get("bio"),
            "is_first_login": bool(row.get("is_first_login", False))
        }
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
                "SELECT username, email, display_name, bio, is_first_login FROM users WHERE username = %s",
                (current_user,)
            )
            row = cur.fetchone()
            if not row:
                return jsonify({'error': 'User not found'}), 404
    finally:
        conn.close()

    return jsonify({
        "username": row["username"],
        "email": row.get("email"),
        "display_name": row.get("display_name"),
        "bio": row.get("bio"),
        "is_first_login": bool(row.get("is_first_login", False))
    }), 200
