#!/usr/bin/env bash
# Dump the whole database to a gzipped archive and optionally upload it to an
# S3-compatible bucket (Cloudflare R2). See docs/BACKUP_RESTORE.md.
#
# Required: MONGO_URI
# Optional: BACKUP_DIR (default ./backups)
#           BACKUP_PASSPHRASE   encrypts the archive with AES-256 (openssl)
#           BACKUP_BUCKET + BACKUP_S3_ENDPOINT + AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY
#                               uploads to s3://$BACKUP_BUCKET/mongo/
set -euo pipefail

: "${MONGO_URI:?MONGO_URI is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
ARCHIVE="$BACKUP_DIR/forma-$STAMP.archive.gz"

mkdir -p "$BACKUP_DIR"
echo "Dumping database to $ARCHIVE"
mongodump --uri="$MONGO_URI" --archive="$ARCHIVE" --gzip --readPreference=secondaryPreferred

if [[ -n "${BACKUP_PASSPHRASE:-}" ]]; then
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
    -in "$ARCHIVE" -out "$ARCHIVE.enc" -pass env:BACKUP_PASSPHRASE
  rm -f "$ARCHIVE"
  ARCHIVE="$ARCHIVE.enc"
fi

SIZE_BYTES="$(wc -c < "$ARCHIVE" | tr -d ' ')"
if [[ "$SIZE_BYTES" -lt 1024 ]]; then
  echo "Backup archive is suspiciously small ($SIZE_BYTES bytes); refusing to continue" >&2
  exit 1
fi
echo "Archive ready: $ARCHIVE ($SIZE_BYTES bytes)"

if [[ -n "${BACKUP_BUCKET:-}" ]]; then
  : "${BACKUP_S3_ENDPOINT:?BACKUP_S3_ENDPOINT is required when BACKUP_BUCKET is set}"
  aws s3 cp "$ARCHIVE" "s3://$BACKUP_BUCKET/mongo/$(basename "$ARCHIVE")" \
    --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors
  echo "Uploaded to s3://$BACKUP_BUCKET/mongo/$(basename "$ARCHIVE")"
fi
