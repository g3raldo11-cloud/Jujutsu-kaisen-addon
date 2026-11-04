#!/bin/sh
# Daily PostgreSQL backup with rotation. Files: /backups/ouroboros-YYYYmmdd-HHMM.sql.gz
set -eu
KEEP="${BACKUP_KEEP_DAYS:-14}"
while true; do
  STAMP=$(date +%Y%m%d-%H%M)
  FILE="/backups/ouroboros-$STAMP.sql.gz"
  if pg_dump --no-owner --format=plain | gzip -9 > "$FILE.tmp"; then
    mv "$FILE.tmp" "$FILE"
    echo "backup ok: $FILE"
  else
    rm -f "$FILE.tmp"
    echo "backup FAILED at $STAMP" >&2
  fi
  find /backups -name 'ouroboros-*.sql.gz' -mtime +"$KEEP" -delete
  sleep 86400
done
