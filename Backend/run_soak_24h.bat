@echo off
REM 24-h soak for the autonomous-agents stack.
REM Run from a PowerShell or cmd window that you can leave open overnight
REM (or wrap with start /B / Task Scheduler if you want it detached).
REM
REM Outputs:
REM   soak_24h_<timestamp>.log  - full pytest stdout/stderr
REM   soak_24h_<timestamp>.exit - single line: pytest exit code

setlocal
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "STAMP=%%i"
if "%STAMP%"=="" set "STAMP=%RANDOM%%RANDOM%"
set "LOG=soak_24h_%STAMP%.log"
set "EXITFILE=soak_24h_%STAMP%.exit"

if "%SOAK_SECONDS%"=="" set SOAK_SECONDS=86400
if "%SOAK_RATE_HZ%"=="" set SOAK_RATE_HZ=5
if "%GEMINI_BUDGET_PER_MIN%"=="" set GEMINI_BUDGET_PER_MIN=30

echo [%date% %time%] starting 24-h soak  ^>  %LOG%
echo [%date% %time%] SOAK_SECONDS=%SOAK_SECONDS%  SOAK_RATE_HZ=%SOAK_RATE_HZ%  GEMINI_BUDGET_PER_MIN=%GEMINI_BUDGET_PER_MIN%  ^>^>  %LOG%

.\venv\Scripts\python.exe -m pytest tests/INTEGRATION_TESTING/test_agent_soak.py -s --tb=short > "%LOG%" 2>&1
echo %ERRORLEVEL% > "%EXITFILE%"

echo [%date% %time%] soak finished, exit=%ERRORLEVEL%, log=%LOG%
endlocal
