@echo off
REM =============================================================================
REM Database Sync Script for Nodus (Windows)
REM =============================================================================
REM Dumps production database via SSH tunnel (port 54321) and loads locally
REM
REM Prerequisites:
REM - SSH tunnel already running: ssh -L 54321:localhost:5435 user@server
REM - Local PostgreSQL running on port 5432
REM
REM Usage:
REM   scripts\db-sync.bat
REM =============================================================================

setlocal enabledelayedexpansion

REM PostgreSQL path
set PG_BIN=C:\Program Files\PostgreSQL\17\bin

REM Remote (via tunnel)
set TUNNEL_PORT=54321
set REMOTE_DB_NAME=nodus_db
set REMOTE_DB_USER=nodus_user
set REMOTE_DB_PASSWORD=kaftaaa

REM Local
set LOCAL_PORT=5432
set LOCAL_DB_NAME=nodus_db
set LOCAL_DB_USER=postgres
set LOCAL_DB_PASSWORD=daftar12

REM Generate timestamp for filename
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set TIMESTAMP=%datetime:~0,8%_%datetime:~8,6%
set DUMP_FILE=dumps\nodus_prod_%TIMESTAMP%.sql

REM Create dumps directory
if not exist "dumps" mkdir dumps

echo ==============================================
echo Nodus Database Sync
echo ==============================================
echo.
echo Step 1: Dump production via tunnel (port %TUNNEL_PORT%)
echo Step 2: Load into local database (port %LOCAL_PORT%)
echo.
echo Dump file: %DUMP_FILE%
echo.

REM Step 1: Dump from production via tunnel
echo [1/2] Dumping production database...
echo       Connecting to localhost:%TUNNEL_PORT%...
echo.

set PGPASSWORD=%REMOTE_DB_PASSWORD%
"%PG_BIN%\pg_dump.exe" -h localhost -p %TUNNEL_PORT% -U %REMOTE_DB_USER% -d %REMOTE_DB_NAME% --no-owner --no-acl --clean --if-exists > "%DUMP_FILE%" 2>&1

if errorlevel 1 (
    echo.
    echo ERROR: Database dump failed!
    echo.
    echo Make sure:
    echo   - SSH tunnel is running: ssh -L 54321:localhost:5435 user@server
    echo   - Database credentials are correct
    echo.
    type "%DUMP_FILE%"
    exit /b 1
)

for %%A in ("%DUMP_FILE%") do set DUMP_SIZE=%%~zA
set /a DUMP_SIZE_KB=%DUMP_SIZE%/1024
echo       Done! Size: %DUMP_SIZE_KB% KB
echo.

REM Step 2: Load into local database
echo [2/2] Loading into local database...
echo       Dropping and recreating %LOCAL_DB_NAME%...
echo.

REM Switch to local password
set PGPASSWORD=%LOCAL_DB_PASSWORD%

REM Drop existing database
"%PG_BIN%\dropdb.exe" -h localhost -p %LOCAL_PORT% -U %LOCAL_DB_USER% --if-exists %LOCAL_DB_NAME% 2>nul

REM Create fresh database
"%PG_BIN%\createdb.exe" -h localhost -p %LOCAL_PORT% -U %LOCAL_DB_USER% %LOCAL_DB_NAME%

if errorlevel 1 (
    echo.
    echo ERROR: Failed to create local database!
    echo Make sure local PostgreSQL is running.
    exit /b 1
)

REM Load the dump
"%PG_BIN%\psql.exe" -h localhost -p %LOCAL_PORT% -U %LOCAL_DB_USER% -d %LOCAL_DB_NAME% -f "%DUMP_FILE%" -q 2>nul

if errorlevel 1 (
    echo.
    echo ERROR: Failed to load dump!
    exit /b 1
)

echo       Done!
echo.
echo ==============================================
echo Sync complete!
echo ==============================================
echo.
echo Production data is now in your local database.
echo.
echo Dump saved: %DUMP_FILE%
echo.
echo Next steps:
echo   1. cd backend ^&^& npm run dev
echo   2. cd frontend ^&^& npm run dev
echo.

REM Reset all user account passwords to test123 for local development
REM This is bcrypt hash for 'test123'
echo Resetting all user account passwords to 'test123'...
"%PG_BIN%\psql.exe" -h localhost -p %LOCAL_PORT% -U %LOCAL_DB_USER% -d %LOCAL_DB_NAME% -c "UPDATE \"User\" SET password = '$2b$10$JpqCthXtWA8gL0Bfb8pwd.iAAHIBmmtrw/huW8exRCVKvUKx2xYsm';" -q 2>nul

REM Clear password from environment
set PGPASSWORD=

echo.
echo NOTE: All user account passwords have been reset to 'test123'
echo You can now login with any user email and password: test123
echo.

endlocal
