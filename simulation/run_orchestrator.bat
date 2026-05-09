@echo off
setlocal
echo.
echo  ==========================================
echo   APPIA -- Live RL Orchestrator
echo   Python Agent --^> Spring Boot --^> Dashboard
echo  ==========================================
echo.
echo   1. Greedy Energy Agent  (no model needed - start here)
echo   2. Random Agent         (paper baseline)
echo   3. Compare ALL 3 agents (paper benchmark table)
echo   4. PPO Agent            (requires trained model)
echo.
set /p CHOICE=Choose (1-4):

if "%CHOICE%"=="1" goto GREEDY
if "%CHOICE%"=="2" goto RANDOM
if "%CHOICE%"=="3" goto COMPARE
if "%CHOICE%"=="4" goto PPO
echo  Invalid choice. Running Greedy by default.
goto GREEDY

:GREEDY
echo  Starting Greedy Energy Agent...
cd /d "%~dp0"
python live_orchestrator.py --agent greedy
goto END

:RANDOM
echo  Starting Random Agent...
cd /d "%~dp0"
python live_orchestrator.py --agent random
goto END

:COMPARE
echo  Starting comparison mode (PPO vs Greedy vs Random)...
cd /d "%~dp0"
python live_orchestrator.py --agent compare
goto END

:PPO
set /p MODEL=Path to model (e.g. models/appia_ppo):
echo  Starting PPO Agent...
cd /d "%~dp0"
python live_orchestrator.py --agent ppo --model "%MODEL%"
goto END

:END
pause
