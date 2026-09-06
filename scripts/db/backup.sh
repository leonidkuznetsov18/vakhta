#!/usr/bin/env bash
# pg_dump in custom format + upload to an S3-compatible bucket. Locally:
#   DATABASE_URL=... BACKUP_S3_ENDPOINT=... BACKUP_S3_BUCKET=... AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... scripts/db/backup.sh
# Without BACKUP_S3_BUCKET the dump stays locally in ./backups.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is not set}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${BACKUP_DIR:-backups}"
FILE="$OUT_DIR/vakhta-$STAMP.dump"
mkdir -p "$OUT_DIR"

# PG_DUMP lets CI pick a client at least as new as the server (Debian/Ubuntu wrappers default to the oldest).
PG_DUMP="${PG_DUMP:-pg_dump}"
"$PG_DUMP" --version
# --no-owner/--no-privileges: restore into a managed database with a different owner (Neon, Railway).
"$PG_DUMP" --format=custom --compress=6 --no-owner --no-privileges --file "$FILE" "$DATABASE_URL"
SIZE=$(wc -c <"$FILE" | tr -d ' ')
echo "dump: $FILE ($SIZE bytes)"
[ "$SIZE" -gt 1024 ] || { echo "dump is suspiciously small" >&2; exit 1; }

if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  ENDPOINT_ARGS=()
  [ -n "${BACKUP_S3_ENDPOINT:-}" ] && ENDPOINT_ARGS=(--endpoint-url "$BACKUP_S3_ENDPOINT")
  aws "${ENDPOINT_ARGS[@]}" s3 cp "$FILE" "s3://$BACKUP_S3_BUCKET/postgres/$(basename "$FILE")" --only-show-errors
  echo "uploaded: s3://$BACKUP_S3_BUCKET/postgres/$(basename "$FILE")"
  rm -f "$FILE"
fi
