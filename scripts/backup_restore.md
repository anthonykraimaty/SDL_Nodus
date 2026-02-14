Setup on your server:


# Make executable
chmod +x backend/scripts/backup-db.sh

# Test it
./backend/scripts/backup-db.sh
Cron job — daily at 2:00 AM:


crontab -e

# Add this line (use the absolute path to the script on your server):
0 2 * * * /home/sdl/nodus/backend/scripts/backup-db.sh >> ~/nodus-backups/backup.log 2>&1


# To restore a backup:
# Copy dump into container and restore
docker exec -i nodus_postgres pg_restore -U nodus_user -d nodus_db --clean --if-exists < ~/nodus-backups/nodus_db_2026-02-14_02-00-00.dump