@echo off
REM =============================================================================
REM Database Dump Script for Nodus (Windows)
REM =============================================================================
REM This script dumps the production database via SSH tunnel
REM
REM Prerequisites:
REM - SSH client (OpenSSH or PuTTY with plink)
REM - PostgreSQL installed (pg_dump in PATH)
REM
REM Usage:
REM   scripts\db-dump.bat [output_file]
REM =============================================================================

setlocal enabledelayedexpansion

REM Configuration - UPDATE THESE VALUES
set SSH_USER=root
set SSH_HOST=your-server.com
set SSH_PORT=22
set REMOTE_DB_HOST=localhost
set REMOTE_DB_PORT=5432
set REMOTE_DB_NAME=nodus_db
set REMOTE_DB_USER=postgres
set LOCAL_TUNNEL_PORT=54321

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
echo Nodus Production Database Dump (Windows)
echo ==============================================
echo.
echo This will:
echo 1. Create an SSH tunnel to the production server
echo 2. Dump the database through the tunnel
echo 3. Save to: %OUTPUT_FILE%
echo.

REM Start SSH tunnel in background
echo Starting SSH tunnel...
echo   Local port: %LOCAL_TUNNEL_PORT% -^> Remote: %REMOTE_DB_HOST%:%REMOTE_DB_PORT%
echo.

start /b ssh -N -L %LOCAL_TUNNEL_PORT%:%REMOTE_DB_HOST%:%REMOTE_DB_PORT% -p %SSH_PORT% %SSH_USER%@%SSH_HOST%

REM Wait for tunnel to establish
timeout /t 3 /nobreak > nul

echo SSH tunnel started (running in background).
echo.
echo Dumping database...
echo   Database: %REMOTE_DB_NAME%
echo   User: %REMOTE_DB_USER%
echo.

REM Dump the database
pg_dump -h localhost -p %LOCAL_TUNNEL_PORT% -U %REMOTE_DB_USER% -d %REMOTE_DB_NAME% --no-owner --no-acl --clean --if-exists > "%OUTPUT_FILE%"

if errorlevel 1 (
    echo.
    echo ERROR: Database dump failed!
    echo Make sure the SSH tunnel is working and credentials are correct.
    goto :cleanup
)

echo.
echo ==============================================
echo Database dump complete!
echo ==============================================
echo   File: %OUTPUT_FILE%
echo.

:cleanup
REM Note: SSH tunnel runs in background, close it manually or it will close when terminal closes
echo.
echo Note: SSH tunnel is still running in background.
echo Close this window or press Ctrl+C to terminate it.
echo.
echo To load this dump into your local database, run:
echo   scripts\db-load.bat %OUTPUT_FILE%

endlocal
