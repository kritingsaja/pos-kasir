#!/bin/bash
BACKUP_DIR="/root/pos-kasir-backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/pos-kasir-backup-$TIMESTAMP.tar.gz"

echo "=== BACKUP POS-KASIR ==="
echo "Backup file: $BACKUP_FILE"

# Stop PM2 process
pm2 stop pos-kasir --silent

# Create backup
tar -czf "$BACKUP_FILE" \
  /root/pos-kasir/*.js \
  /root/pos-kasir/*.json \
  /root/pos-kasir/*.db \
  /root/pos-kasir/ecosystem.config.js \
  2>/dev/null

# Restart PM2
pm2 start pos-kasir --silent

echo "Backup completed: $(ls -lh "$BACKUP_FILE")"
echo "To restore: tar -xzf $BACKUP_FILE -C /"
