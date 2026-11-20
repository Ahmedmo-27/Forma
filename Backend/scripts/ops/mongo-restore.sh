#!/usr/bin/env bash
# Restore a backup archive produced by mongo-backup.sh into a database.
# See docs/BACKUP_RESTORE.md before pointing this at production.
#
# Usage: RESTORE_URI="mongodb+srv://.../forma_restore" ./mongo-restore.sh <archive> [--drop]
#   <archive>  local path to forma-*.archive.gz or forma-*.archive.gz.enc
#   --drop     drop each collection before restoring it (full replace)
# Encrypted archives need BACKUP_PASSPHRASE.
# Set SOURCE_DB if the archive came from a database not named "forma".
set -euo pipefail

ARCHIVE="${1:?Usage: mongo-restore.sh <archive> [--drop]}"
DROP_FLAG="${2:-}"
: "${RESTORE_URI:?RESTORE_URI is required (the database to restore INTO)}"
SOURCE_DB="${SOURCE_DB:-forma}"

TARGET_DB="$(node -e 'const u=new URL(process.argv[1]);console.log(u.pathname.replace(/^\//,"")||"")' "$RESTORE_URI")"
if [[ -z "$TARGET_DB" ]]; then
  echo "RESTORE_URI must include a database name, e.g. .../forma_restore" >&2
  exit 1
fi

if [[ "$ARCHIVE" == *.enc ]]; then
  : "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required for encrypted archives}"
  DECRYPTED="${ARCHIVE%.enc}"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
    -in "$ARCHIVE" -out "$DECRYPTED" -pass env:BACKUP_PASSPHRASE
  ARCHIVE="$DECRYPTED"
fi

echo "Restoring $ARCHIVE ($SOURCE_DB) into database '$TARGET_DB'"
if [[ "$DROP_FLAG" == "--drop" ]]; then
  read -r -p "This DROPS every collection in '$TARGET_DB' before restoring. Type the database name to continue: " CONFIRM
  if [[ "$CONFIRM" != "$TARGET_DB" ]]; then
    echo "Confirmation did not match; aborting." >&2
    exit 1
  fi
fi

mongorestore --uri="$RESTORE_URI" --archive="$ARCHIVE" --gzip \
  --nsFrom="$SOURCE_DB.*" --nsTo="$TARGET_DB.*" \
  ${DROP_FLAG:+--drop}

echo "Restore finished. Verify counts with: mongosh \"\$RESTORE_URI\" --eval 'db.tenants.countDocuments()'"
