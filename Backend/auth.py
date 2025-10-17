from flask import request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from database import db
import bcrypt


def get_cursor():
    return db.cursor()


def signup():
    data = request.get_json() or {}
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'error': 'username and password are required'}), 400

    cursor = get_cursor()
    cursor.execute("SELECT * FROM users WHERE username = %s", (username,))
    existing_user = cursor.fetchone()
    if existing_user:
        return jsonify({'error': 'User already exists'}), 400

    # Hash the password before storing
    hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    cursor.execute("INSERT INTO users (username, password) VALUES (%s, %s)", (username, hashed_password))
    db.commit()

    return jsonify({'message': 'User registered successfully'}), 201


def login():
    data = request.get_json() or {}
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'error': 'username and password are required'}), 400

    cursor = get_cursor()
    cursor.execute("SELECT * FROM users WHERE username = %s", (username,))
    user = cursor.fetchone()
    if not user:
        return jsonify({'error': 'Invalid credentials'}), 401

    # stored password is expected to be a bcrypt hash
    try:
        stored_hash = user.get('password') if isinstance(user, dict) else user[2]
    except Exception:
        stored_hash = None

    if not stored_hash or not bcrypt.checkpw(password.encode('utf-8'), stored_hash.encode('utf-8')):
        return jsonify({'error': 'Invalid credentials'}), 401

    token = create_access_token(identity=username)

    cursor.execute("UPDATE users SET token = %s WHERE username = %s", (token, username))
    db.commit()

    return jsonify({'token': token}), 200


@jwt_required()
def logout():
    current_user = get_jwt_identity()
    cursor = get_cursor()
    
    # Clear the token in the database
    cursor.execute("UPDATE users SET token = NULL WHERE username = %s", (current_user,))
    db.commit()
    
    return jsonify({'message': 'Logged out successfully'}), 200


@jwt_required()
def protected():
    current_user = get_jwt_identity()
    cursor = get_cursor()
    
    # Verify the token is still valid in the database
    cursor.execute("SELECT token FROM users WHERE username = %s", (current_user,))
    user = cursor.fetchone()
    
    if not user or not user[0]:  # Check if token is NULL or user doesn't exist
        return jsonify({'error': 'Token has been invalidated. Please log in again.'}), 401
    
    return jsonify({'message': f'Hello {current_user}, you are authorized!'})