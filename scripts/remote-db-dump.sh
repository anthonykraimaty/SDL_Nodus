#!/bin/bash
# =============================================================================
# Run this script ON THE SERVER via SSH to dump the database
# Then download the dump file
# =============================================================================
# Usage:
#   1. SSH into your server
#   2. Run: ./remote-db-dump.sh
#   3. Download the resulting file
# =============================================================================

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_FILE="nodus_dump_${TIMESTAMP}.sql"

echo "Dumping database to $OUTPUT_FILE..."

# If using Docker on server
docker exec nodus_postgres pg_dump -U postgres nodus_db --no-owner --no-acl --clean --if-exists > "$OUTPUT_FILE"

# OR if PostgreSQL is installed directly (uncomment):
# pg_dump -U postgres -d nodus_db --no-owner --no-acl --clean --if-exists > "$OUTPUT_FILE"

echo "Done! File: $OUTPUT_FILE"
echo "Size: $(du -h $OUTPUT_FILE | cut -f1)"
echo ""
echo "Download with:"
echo "  scp root@your-server:~/$OUTPUT_FILE ./dumps/"
