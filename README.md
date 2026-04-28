# AuroFlow - Run Guide

This guide starts AuroFlow locally using the existing Backend virtual environment.

## Project Structure

- Backend: Flask, Socket.IO, Celery
- Frontend: React + Vite

## Prerequisites

- Python 3.12+
- Node.js + npm
- Existing backend venv at Backend/venv
- MySQL configured in Backend/.env
- Redis (required for Celery/background jobs)

## 1) Start Backend (existing venv only)

Open Terminal 1:

```powershell
cd Backend
.\venv\Scripts\python.exe app.py
```

Backend will run at:

- http://127.0.0.1:5000

## 2) Start Frontend

Open Terminal 2:

```powershell
cd Frontend
npm run dev
```

Frontend will run at:

- http://localhost:5173

## 3) Optional: Start Celery Worker (recommended)

Open Terminal 3:

```powershell
cd Backend
.\venv\Scripts\python.exe -m celery -A celery_app worker --loglevel=info --pool=solo
```

## 4) Optional: Start Celery Beat (scheduled jobs)

Open Terminal 4:

```powershell
cd Backend
.\venv\Scripts\python.exe -m celery -A celery_app beat --loglevel=info
```

## 5) Redis

Ensure Redis is running before Celery tasks.

If Redis is installed as a service, keep it started.

## Stop Services

- Press Ctrl+C in each terminal window.

## Notes

- Do not create a new backend venv. This project uses Backend/venv.
- If frontend dependencies are missing, run once:

```powershell
cd Frontend
npm install
```
