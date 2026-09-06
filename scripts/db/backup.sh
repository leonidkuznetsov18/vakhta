#!/usr/bin/env bash
# pg_dump у форматі custom + завантаження в S3-сумісний бакет. Локально:
#   DATABASE_URL=... BACKUP_S3_ENDPOINT=... BACKUP_S3_BUCKET=... AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... scripts/db/backup.sh
# Без BACKUP_S3_BUCKET дамп лишається локально в ./backups.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL не задано}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${BACKUP_DIR:-backups}"
FILE="$OUT_DIR/vakhta-$STAMP.dump"
mkdir -p "$OUT_DIR"

# --no-owner/--no-privileges: відновлення в керовану БД з іншим власником (Neon, Railway).
pg_dump --format=custom --compress=6 --no-owner --no-privileges --file "$FILE" "$DATABASE_URL"
SIZE=$(wc -c <"$FILE" | tr -d ' ')
echo "дамп: $FILE ($SIZE байт)"
[ "$SIZE" -gt 1024 ] || { echo "дамп підозріло малий" >&2; exit 1; }

if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  ENDPOINT_ARGS=()
  [ -n "${BACKUP_S3_ENDPOINT:-}" ] && ENDPOINT_ARGS=(--endpoint-url "$BACKUP_S3_ENDPOINT")
  aws "${ENDPOINT_ARGS[@]}" s3 cp "$FILE" "s3://$BACKUP_S3_BUCKET/postgres/$(basename "$FILE")" --only-show-errors
  echo "завантажено: s3://$BACKUP_S3_BUCKET/postgres/$(basename "$FILE")"
  rm -f "$FILE"
fi
