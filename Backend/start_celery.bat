@echo off
REM AuraFlow Celery Startup Script for Windows
REM ============================================
REM
REM Prerequisites:
REM   1. Redis must be running (redis-server or Docker: docker run -d -p 6379:6379 redis)
REM   2. Virtual environment activated
REM   3. All requirements installed (pip install -r requirements.txt)
REM
REM Usage:
REM   start_celery.bat              - Start worker only
REM   start_celery.bat beat         - Start worker + beat scheduler
REM   start_celery.bat beat-only    - Start beat scheduler only

cd /d "%~dp0"

IF "%1"=="beat-only" (
    echo [CELERY] Starting Celery Beat scheduler...
    "%~dp0venv\Scripts\python.exe" -m celery -A celery_app beat --loglevel=info
) ELSE IF "%1"=="beat" (
    echo [CELERY] Starting Worker + Beat requires 2 terminals on Windows.
    echo [CELERY] Run: start_celery.bat           (worker)
    echo [CELERY] Run: start_celery.bat beat-only  (beat scheduler)
    echo.
    echo [CELERY] Starting Celery Worker...
    "%~dp0venv\Scripts\python.exe" -m celery -A celery_app worker --loglevel=info --pool=solo -Q default,high_priority,periodic
) ELSE (
    echo [CELERY] Starting Celery Worker...
    "%~dp0venv\Scripts\python.exe" -m celery -A celery_app worker --loglevel=info --pool=solo -Q default,high_priority,periodic
)
