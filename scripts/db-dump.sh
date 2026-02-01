#!/bin/bash
# =============================================================================
# Database Dump Script for Nodus
# =============================================================================
# This script dumps the production database via SSH tunnel
#
# Prerequisites:
# - SSH access to your production server
# - pg_dump installed locally
#
# Usage:
#   ./scripts/db-dump.sh [output_file]
#
# Example:
#   ./scripts/db-dump.sh                    # Creates dump with timestamp
#   ./scripts/db-dump.sh my_backup.sql      # Creates dump with custom name
# =============================================================================

set -e

# Configuration - UPDATE THESE VALUES
SSH_USER="root"                          # Your SSH username
SSH_HOST="your-server.com"               # Your production server hostname/IP
SSH_PORT="22"                            # SSH port (usually 22)
REMOTE_DB_HOST="localhost"               # Database host on the server (usually localhost)
REMOTE_DB_PORT="5432"                    # PostgreSQL port on the server
REMOTE_DB_NAME="nodus_db"                # Database name
REMOTE_DB_USER="postgres"                # Database user
LOCAL_TUNNEL_PORT="54321"                # Local port for SSH tunnel

# Output file
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_FILE="${1:-dumps/nodus_prod_${TIMESTAMP}.sql}"

# Create dumps directory if it doesn't exist
mkdir -p "$(dirname "$OUTPUT_FILE")"

echo "=============================================="
echo "Nodus Production Database Dump"
echo "=============================================="
echo ""
echo "This will:"
echo "1. Create an SSH tunnel to the production server"
echo "2. Dump the database through the tunnel"
echo "3. Save to: $OUTPUT_FILE"
echo ""

# Check if tunnel port is already in use
if lsof -Pi :$LOCAL_TUNNEL_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "Warning: Port $LOCAL_TUNNEL_PORT is already in use."
    echo "An existing SSH tunnel may be running."
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "Starting SSH tunnel..."
echo "  Local port: $LOCAL_TUNNEL_PORT -> Remote: $REMOTE_DB_HOST:$REMOTE_DB_PORT"
echo ""

# Start SSH tunnel in background
ssh -f -N -L $LOCAL_TUNNEL_PORT:$REMOTE_DB_HOST:$REMOTE_DB_PORT \
    -p $SSH_PORT $SSH_USER@$SSH_HOST

# Give tunnel time to establish
sleep 2

# Check if tunnel is working
if ! lsof -Pi :$LOCAL_TUNNEL_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "Error: Failed to establish SSH tunnel"
    exit 1
fi

echo "SSH tunnel established."
echo ""
echo "Dumping database..."
echo "  Database: $REMOTE_DB_NAME"
echo "  User: $REMOTE_DB_USER"
echo ""

# Dump the database
PGPASSWORD="${REMOTE_DB_PASSWORD:-}" pg_dump \
    -h localhost \
    -p $LOCAL_TUNNEL_PORT \
    -U $REMOTE_DB_USER \
    -d $REMOTE_DB_NAME \
    --no-owner \
    --no-acl \
    --clean \
    --if-exists \
    > "$OUTPUT_FILE"

# Get file size
FILE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)

echo ""
echo "=============================================="
echo "Database dump complete!"
echo "=============================================="
echo "  File: $OUTPUT_FILE"
echo "  Size: $FILE_SIZE"
echo ""

# Kill the SSH tunnel
TUNNEL_PID=$(lsof -t -i:$LOCAL_TUNNEL_PORT 2>/dev/null || true)
if [ -n "$TUNNEL_PID" ]; then
    kill $TUNNEL_PID 2>/dev/null || true
    echo "SSH tunnel closed."
fi

echo ""
echo "To load this dump into your local database, run:"
echo "  ./scripts/db-load.sh $OUTPUT_FILE"
