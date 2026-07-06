@echo off
REM ============================================================
REM  AuraFlow — Start ALL background workers in one go (Windows)
REM ============================================================
REM
REM  One launch starts everything Celery-side:
REM    * Worker  : consumes default + high_priority + periodic queues
REM                (threads pool, 4 concurrent tasks)
REM    * Orchestrator : the autonomous-agent Redis bus subscriber,
REM                     auto-started in a daemon thread on worker boot
REM                     (see celery_app.py:_start_orchestrator)
REM    * Beat    : periodic scheduler, launched in its OWN window
REM                (Celery forbids embedded --beat on Windows)
REM
REM  Run EXACTLY ONE worker: the orchestrator runs one instance per
REM  worker, so a second worker would double-dispatch every bus event.
REM
REM  Prerequisites:
REM    1. Redis running on REDIS_URL from .env (default localhost:6379)
REM    2. Backend\.env filled (DB_*, JWT_SECRET_KEY, REDIS_URL, GEMINI_API_KEY)
REM    3. Dependencies installed in Backend\venv
REM
REM  NOTE: This does NOT start the Flask API. Run that separately:
REM        venv\Scripts\python.exe app.py
REM
REM  To stop: Ctrl+C in this window (worker), then close the Beat window.
REM ============================================================

cd /d "%~dp0"

set "PY=%~dp0venv\Scripts\python.exe"

if not exist "%PY%" (
    echo [ERROR] venv not found at %PY%
    echo         Create/activate the project venv first.
    exit /b 1
)

echo [CHECK] Verifying Redis is reachable...
"%PY%" -c "import os; from dotenv import load_dotenv; load_dotenv(); import redis; u=os.getenv('REDIS_URL','redis://localhost:6379/0'); redis.from_url(u).ping(); print('[OK] Redis reachable at', u)"
if errorlevel 1 (
    echo.
    echo [ERROR] Redis is not reachable. Start it first, e.g.:
    echo           redis-server
    echo         or via Docker:
    echo           docker run -d -p 6379:6379 redis
    exit /b 1
)

echo.
echo [CELERY] Launching Beat scheduler in a separate window...
start "AuraFlow Celery Beat" cmd /k ""%PY%" -m celery -A celery_app beat --loglevel=info"

echo [CELERY] Starting Worker + Orchestrator in this window.
echo [CELERY] Queues: default, high_priority, periodic  ^|  Pool: threads(4)
echo [CELERY] Press Ctrl+C here to stop the worker.
echo.

"%PY%" -m celery -A celery_app worker ^
    --loglevel=info ^
    --pool=threads ^
    --concurrency=4 ^
    -Q default,high_priority,periodic ^
    -n auraflow-worker@%%h
