@echo off
REM =============================================================================
REM Database Dump Script - Uses existing SSH tunnel on port 54321
REM =============================================================================

setlocal enabledelayedexpansion

REM Configuration
set LOCAL_TUNNEL_PORT=54321
set REMOTE_DB_NAME=nodus_db
set REMOTE_DB_USER=postgres

REM Generate timestamp for filename
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set TIMESTAMP=%datetime:~0,8%_%datetime:~8,6%

REM Output file
if "%~1"=="" (
    set OUTPUT_FILE=dumps\nodus_prod_%TIMESTAMP%.sql
) else (
    set OUTPUT_FILE=%~1
)

REM Create dumps directory
if not exist "dumps" mkdir dumps

echo ==============================================
echo Nodus Database Dump (via existing tunnel)
echo ==============================================
echo.
echo Connecting to localhost:%LOCAL_TUNNEL_PORT%
echo Database: %REMOTE_DB_NAME%
echo Output: %OUTPUT_FILE%
echo.

pg_dump -h localhost -p %LOCAL_TUNNEL_PORT% -U %REMOTE_DB_USER% -d %REMOTE_DB_NAME% --no-owner --no-acl --clean --if-exists > "%OUTPUT_FILE%"

if errorlevel 1 (
    echo.
    echo ERROR: Database dump failed!
    echo Make sure SSH tunnel is running on port %LOCAL_TUNNEL_PORT%
    exit /b 1
)

echo.
echo ==============================================
echo Done! Saved to: %OUTPUT_FILE%
echo ==============================================
echo.
echo To load locally: scripts\db-load.bat %OUTPUT_FILE%

endlocal
