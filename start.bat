@echo off
echo.
echo  ==========================================
echo   APPIA - AI Digital Twin
echo   Starting all services...
echo  ==========================================
echo.

REM Start Python FastAPI backend in a new terminal
echo  [1/2] Starting Python Simulation API on port 8004...
start "Appia Backend" cmd /k "cd /d %~dp0 && pip install fastapi uvicorn --break-system-packages -q && python -m uvicorn backend_api.main:app --port 8004 --reload"

REM Wait a moment
timeout /t 3 /nobreak >nul

REM Start React frontend
echo  [2/2] Starting React Dashboard on port 5174...
start "Appia Frontend" cmd /k "cd /d %~dp0\frontend && npm install && npm run dev"

echo.
echo  Appia is starting up!
echo  Dashboard: http://localhost:5174
echo  API docs:  http://localhost:8004/docs
echo.
pause
