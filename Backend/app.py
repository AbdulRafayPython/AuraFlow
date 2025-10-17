from flask import Flask
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from dotenv import load_dotenv
from datetime import timedelta
import os

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:8080"]}}, supports_credentials=True)

app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "dev-secret-change-me")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(minutes=int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", "10")))

jwt = JWTManager(app)

from auth import signup, login, protected, logout

# Register routes (function-based)
app.route("/api/signup", methods=["POST"])(signup)
app.route("/api/login", methods=["POST"])(login)
app.route("/api/protected", methods=["GET"])(protected)
app.route("/api/logout", methods=["POST"])(logout)

if __name__ == "__main__":
    app.run(debug=True)