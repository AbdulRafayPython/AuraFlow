# AuroFlow Backend

Quick start

1. Copy `.env.example` to `.env` and fill in your database credentials and JWT secret.

2. Create and activate the venv (PowerShell):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

3. Run the app:

```powershell
# Ensure .env is present
python app.py
```

Available API endpoints (prefix /api):

- POST /api/signup - body: {"username": "...", "password": "..."}
- POST /api/login - body: {"username": "...", "password": "..."}
- GET /api/protected - requires Authorization: Bearer <token>

Notes and next steps

- The project uses a simple shared PyMySQL connection in `database.py`. Consider using a connection pool for production.
- Make sure your `users` table has columns at least: `id`, `username`, `password`, `token`.
- Change `JWT_SECRET_KEY` in production and keep it secret.
