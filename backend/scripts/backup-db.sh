#!/bin/bash
# ============================================================
# Nodus Database Backup Script
# Dumps PostgreSQL from Docker container to host filesystem
# ============================================================

set -euo pipefail

# ---- Configuration ----
BACKUP_DIR="$HOME/nodus-backups"
RETENTION_DAYS=30
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
DUMP_FILE="nodus_db_${TIMESTAMP}.dump"

# Docker container name
CONTAINER_NAME="${CONTAINER_NAME:-nodus_postgres}"

# Database credentials (match docker-compose.yml defaults)
DB_NAME="${POSTGRES_DB:-nodus_db}"
DB_USER="${POSTGRES_USER:-nodus_user}"

# ---- Setup ----
mkdir -p "$BACKUP_DIR"

# Verify container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "[$(date)] ERROR: Container '${CONTAINER_NAME}' is not running!"
  exit 1
fi

echo "[$(date)] Starting backup of '${DB_NAME}' from container '${CONTAINER_NAME}'..."

# ---- Dump from Docker container to host ----
docker exec "$CONTAINER_NAME" \
  pg_dump \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --format=custom \
    --compress=6 \
    --no-owner \
    --no-privileges \
  > "${BACKUP_DIR}/${DUMP_FILE}"

# Verify the backup file exists and is not empty
if [ ! -s "${BACKUP_DIR}/${DUMP_FILE}" ]; then
  echo "[$(date)] ERROR: Backup file is empty or missing!"
  rm -f "${BACKUP_DIR}/${DUMP_FILE}"
  exit 1
fi

FILESIZE=$(du -h "${BACKUP_DIR}/${DUMP_FILE}" | cut -f1)
echo "[$(date)] Backup complete: ${BACKUP_DIR}/${DUMP_FILE} (${FILESIZE})"

# ---- Rotate old backups ----
DELETED=$(find "$BACKUP_DIR" -name "nodus_db_*.dump" -type f -mtime +${RETENTION_DAYS} -print -delete | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date)] Removed ${DELETED} backup(s) older than ${RETENTION_DAYS} days."
fi

echo "[$(date)] Backup finished successfully."
