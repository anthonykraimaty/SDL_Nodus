@echo off
REM =============================================================================
REM Database Load Script for Nodus (Windows)
REM =============================================================================
REM This script loads a database dump into your local PostgreSQL
REM
REM Prerequisites:
REM - PostgreSQL installed (psql in PATH)
REM
REM Usage:
REM   scripts\db-load.bat <dump_file>
REM =============================================================================

setlocal enabledelayedexpansion

REM Configuration - UPDATE THESE VALUES
set LOCAL_DB_HOST=localhost
set LOCAL_DB_PORT=5432
set LOCAL_DB_NAME=nodus_db
set LOCAL_DB_USER=postgres

REM Check arguments
if "%~1"=="" (
    echo Usage: %0 ^<dump_file^>
    echo.
    echo Available dumps:
    dir /b dumps\*.sql 2>nul || echo   No dumps found in dumps\ directory
    goto :eof
)

set DUMP_FILE=%~1

REM Check if dump file exists
if not exist "%DUMP_FILE%" (
    echo Error: Dump file not found: %DUMP_FILE%
    goto :eof
)

echo ==============================================
echo Nodus Local Database Load (Windows)
echo ==============================================
echo.
echo This will:
echo 1. Drop and recreate the local database
echo 2. Load the dump file into it
echo.
echo Source: %DUMP_FILE%
echo Target: %LOCAL_DB_NAME% on %LOCAL_DB_HOST%:%LOCAL_DB_PORT%
echo.
echo WARNING: This will DESTROY your local database!
echo.
set /p CONFIRM=Are you sure you want to continue? (y/n):
if /i not "%CONFIRM%"=="y" (
    echo Aborted.
    goto :eof
)

echo.
echo Dropping existing database (if exists)...
dropdb -h %LOCAL_DB_HOST% -p %LOCAL_DB_PORT% -U %LOCAL_DB_USER% --if-exists %LOCAL_DB_NAME% 2>nul

echo Creating fresh database...
createdb -h %LOCAL_DB_HOST% -p %LOCAL_DB_PORT% -U %LOCAL_DB_USER% %LOCAL_DB_NAME%

if errorlevel 1 (
    echo ERROR: Failed to create database!
    goto :eof
)

echo Loading dump...
psql -h %LOCAL_DB_HOST% -p %LOCAL_DB_PORT% -U %LOCAL_DB_USER% -d %LOCAL_DB_NAME% -f "%DUMP_FILE%" -q

if errorlevel 1 (
    echo ERROR: Failed to load dump!
    goto :eof
)

echo.
echo ==============================================
echo Database load complete!
echo ==============================================
echo.
echo Your local database '%LOCAL_DB_NAME%' now contains production data.
echo.
echo Next steps:
echo 1. Update backend\.env with your local database URL
echo 2. Run: cd backend ^&^& npm run dev
echo 3. Run: cd frontend ^&^& npm run dev

endlocal
