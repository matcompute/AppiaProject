@echo off
setlocal enabledelayedexpansion
echo.
echo  ==========================================
echo   APPIA -- Spring Boot Backend
echo   Starting on http://localhost:8080
echo  ==========================================
echo.

REM -- Load .env ----------------------------------------------------------------
IF EXIST "%~dp0.env" (
    echo  Loading .env ...
    FOR /F "usebackq tokens=1,* delims==" %%A IN ("%~dp0.env") DO (
        SET "_k=%%A"
        IF NOT "!_k:~0,1!"=="#" IF NOT "%%A"=="" SET %%A=%%B
    )
    echo  .env loaded.
    echo.
)

REM -- Verify key ---------------------------------------------------------------
IF "%GOOGLE_API_KEY%"=="" (
    echo  ERROR: GOOGLE_API_KEY missing in .env
    pause & exit /b 1
)
echo  Gemini key OK.
echo.

REM -- Run Spring Boot ----------------------------------------------------------
echo  Starting Spring Boot on http://localhost:8080
echo  Press Ctrl+C to stop.
echo.

mvn -f "%~dp0pom.xml" spring-boot:run

echo.
pause
