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

# cron runs with a minimal PATH (often just /usr/bin:/bin) which usually lacks
# `docker`. Without this the job fails every night with "docker: not found".
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH:-}"

# Run from cron, e.g.:
#   0 2 * * * /home/sdl/nodus/backend/scripts/backup-db.sh >> ~/nodus-backups/backup.log 2>&1
# $HOME is not always set by cron; fall back so BACKUP_DIR never becomes "/nodus-backups".
: "${HOME:=$(getent passwd "$(id -u)" | cut -d: -f6)}"
export HOME

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
#
# Written to a .part file first and renamed only once pg_dump has exited 0 AND
# the archive has been read back successfully. A dump that dies halfway (disk
# full, container OOM, dropped connection) still writes some bytes, so a plain
# "is the file non-empty?" test accepts a TRUNCATED backup and reports success
# — the kind of thing you only discover during a restore.
TMP_FILE="${DAILY_DIR}/${DUMP_FILE}.part"
trap 'rm -f "$TMP_FILE"' EXIT

if ! docker exec "$CONTAINER_NAME"   pg_dump     -U "$DB_USER"     -d "$DB_NAME"     --format=custom     --compress=6     --no-owner     --no-privileges   > "$TMP_FILE"; then
  echo "[$(date)] ERROR: pg_dump failed - discarding partial file."
  exit 1
fi

if [ ! -s "$TMP_FILE" ]; then
  echo "[$(date)] ERROR: Backup file is empty!"
  exit 1
fi

# Integrity check: pg_restore --list parses the whole custom-format archive and
# fails on a truncated or corrupt one. This turns "a file exists" into
# "a restorable backup exists".
if ! docker exec -i "$CONTAINER_NAME" pg_restore --list > /dev/null < "$TMP_FILE"; then
  echo "[$(date)] ERROR: dump is unreadable (truncated or corrupt) - discarding."
  exit 1
fi

# Sanity check: a backup far smaller than the previous largest usually means
# the dump ran against an empty or half-restored database. Warn, but keep it.
PREV=$(find "$DAILY_DIR" -name 'nodus_db_*.dump' -type f -printf '%s
' 2>/dev/null | sort -n | tail -1 || true)
NEW_SIZE=$(stat -c%s "$TMP_FILE")
if [ -n "${PREV:-}" ] && [ "$PREV" -gt 0 ] && [ "$NEW_SIZE" -lt $(( PREV / 2 )) ]; then
  echo "[$(date)] WARNING: this backup (${NEW_SIZE} bytes) is under half the previous largest (${PREV} bytes) - check the database!"
fi

mv "$TMP_FILE" "${DAILY_DIR}/${DUMP_FILE}"
trap - EXIT

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
