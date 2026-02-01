#!/bin/bash
# =============================================================================
# Database Load Script for Nodus
# =============================================================================
# This script loads a database dump into your local PostgreSQL
#
# Prerequisites:
# - PostgreSQL installed locally
# - psql command available
#
# Usage:
#   ./scripts/db-load.sh <dump_file>
#
# Example:
#   ./scripts/db-load.sh dumps/nodus_prod_20240115_120000.sql
# =============================================================================

set -e

# Configuration - UPDATE THESE VALUES
LOCAL_DB_HOST="localhost"
LOCAL_DB_PORT="5432"
LOCAL_DB_NAME="nodus_db"
LOCAL_DB_USER="postgres"

# Check arguments
if [ -z "$1" ]; then
    echo "Usage: $0 <dump_file>"
    echo ""
    echo "Available dumps:"
    ls -la dumps/*.sql 2>/dev/null || echo "  No dumps found in dumps/ directory"
    exit 1
fi

DUMP_FILE="$1"

# Check if dump file exists
if [ ! -f "$DUMP_FILE" ]; then
    echo "Error: Dump file not found: $DUMP_FILE"
    exit 1
fi

FILE_SIZE=$(du -h "$DUMP_FILE" | cut -f1)

echo "=============================================="
echo "Nodus Local Database Load"
echo "=============================================="
echo ""
echo "This will:"
echo "1. Drop and recreate the local database"
echo "2. Load the dump file into it"
echo ""
echo "Source: $DUMP_FILE ($FILE_SIZE)"
echo "Target: $LOCAL_DB_NAME on $LOCAL_DB_HOST:$LOCAL_DB_PORT"
echo ""
echo "WARNING: This will DESTROY your local database!"
echo ""
read -p "Are you sure you want to continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo "Dropping existing database (if exists)..."
PGPASSWORD="${LOCAL_DB_PASSWORD:-}" dropdb \
    -h $LOCAL_DB_HOST \
    -p $LOCAL_DB_PORT \
    -U $LOCAL_DB_USER \
    --if-exists \
    $LOCAL_DB_NAME 2>/dev/null || true

echo "Creating fresh database..."
PGPASSWORD="${LOCAL_DB_PASSWORD:-}" createdb \
    -h $LOCAL_DB_HOST \
    -p $LOCAL_DB_PORT \
    -U $LOCAL_DB_USER \
    $LOCAL_DB_NAME

echo "Loading dump..."
PGPASSWORD="${LOCAL_DB_PASSWORD:-}" psql \
    -h $LOCAL_DB_HOST \
    -p $LOCAL_DB_PORT \
    -U $LOCAL_DB_USER \
    -d $LOCAL_DB_NAME \
    -f "$DUMP_FILE" \
    --quiet

echo ""
echo "=============================================="
echo "Database load complete!"
echo "=============================================="
echo ""
echo "Your local database '$LOCAL_DB_NAME' now contains production data."
echo ""
echo "Next steps:"
echo "1. Update backend/.env with your local database URL"
echo "2. Run: cd backend && npm run dev"
echo "3. Run: cd frontend && npm run dev"
