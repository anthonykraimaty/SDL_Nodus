#!/bin/bash
# ============================================================
# Nodus Database Backup Script
# Dumps PostgreSQL from Docker container to host filesystem
#
# Retention policy:
#   - daily/   : last 7 daily dumps (older ones deleted)
#   - monthly/ : one dump per month (first backup of each month),
#                kept indefinitely
# ============================================================

set -euo pipefail

# ---- Configuration ----
BACKUP_DIR="${BACKUP_DIR:-$HOME/nodus-backups}"
DAILY_DIR="${BACKUP_DIR}/daily"
MONTHLY_DIR="${BACKUP_DIR}/monthly"
DAILY_RETENTION_DAYS=7

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
YEAR_MONTH=$(date +"%Y-%m")
DUMP_FILE="nodus_db_${TIMESTAMP}.dump"
MONTHLY_FILE="nodus_db_${YEAR_MONTH}.dump"

# Docker container name
CONTAINER_NAME="${CONTAINER_NAME:-nodus_postgres}"

# Database credentials (match docker-compose.yml defaults)
DB_NAME="${POSTGRES_DB:-nodus_db}"
DB_USER="${POSTGRES_USER:-nodus_user}"

# ---- Setup ----
mkdir -p "$DAILY_DIR" "$MONTHLY_DIR"

# Verify container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "[$(date)] ERROR: Container '${CONTAINER_NAME}' is not running!"
  exit 1
fi

echo "[$(date)] Starting backup of '${DB_NAME}' from container '${CONTAINER_NAME}'..."

# ---- Dump from Docker container to host (daily) ----
docker exec "$CONTAINER_NAME" \
  pg_dump \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --format=custom \
    --compress=6 \
    --no-owner \
    --no-privileges \
  > "${DAILY_DIR}/${DUMP_FILE}"

# Verify the backup file exists and is not empty
if [ ! -s "${DAILY_DIR}/${DUMP_FILE}" ]; then
  echo "[$(date)] ERROR: Backup file is empty or missing!"
  rm -f "${DAILY_DIR}/${DUMP_FILE}"
  exit 1
fi

FILESIZE=$(du -h "${DAILY_DIR}/${DUMP_FILE}" | cut -f1)
echo "[$(date)] Daily backup complete: ${DAILY_DIR}/${DUMP_FILE} (${FILESIZE})"

# ---- Monthly snapshot (first successful backup of the month) ----
if [ ! -f "${MONTHLY_DIR}/${MONTHLY_FILE}" ]; then
  cp "${DAILY_DIR}/${DUMP_FILE}" "${MONTHLY_DIR}/${MONTHLY_FILE}"
  echo "[$(date)] Monthly snapshot saved: ${MONTHLY_DIR}/${MONTHLY_FILE}"
fi

# ---- Rotate old daily backups (monthly dir is never pruned) ----
DELETED=$(find "$DAILY_DIR" -name "nodus_db_*.dump" -type f -mtime +${DAILY_RETENTION_DAYS} -print -delete | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date)] Removed ${DELETED} daily backup(s) older than ${DAILY_RETENTION_DAYS} days."
fi

echo "[$(date)] Backup finished successfully."
