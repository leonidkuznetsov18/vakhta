#!/usr/bin/env bash
# pg_dump in custom format + upload to an S3-compatible bucket. Locally:
#   DATABASE_URL=... BACKUP_S3_ENDPOINT=... BACKUP_S3_BUCKET=... AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... scripts/db/backup.sh
# Without BACKUP_S3_BUCKET the dumps stay locally in ./backups.
#
# The database of DATABASE_URL (the pilot) keeps its historical key postgres/vakhta-<stamp>.dump.
# Multi-tenant platform (specs/011, AC-022): the control registry `vakhta_control` and every tenant
# database `vakhta_t_*` on the same cluster are dumped as separate objects under
# postgres/<database>/<database>-<stamp>.dump. BACKUP_ALL_DATABASES=false keeps the single dump.
# One failed tenant dump does not stop the others; the script still exits non-zero at the end.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is not set}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${BACKUP_DIR:-backups}"
mkdir -p "$OUT_DIR"

# PG_DUMP/PSQL let CI pick clients at least as new as the server (Debian wrappers default to the oldest).
PG_DUMP="${PG_DUMP:-pg_dump}"
PSQL="${PSQL:-psql}"
"$PG_DUMP" --version

# Replaces the database in a postgres:// URL; fails when the URL names no database to replace.
url_for_database() {
  local url="$1" name="$2" replaced
  replaced="$(printf '%s' "$url" | sed -E "s#^(postgres(ql)?://[^/?]+)/[^?]*#\\1/$name#")"
  if [ "$replaced" = "$url" ] && [[ "$url" != */"$name" && "$url" != */"$name"\?* ]]; then
    echo "cannot derive a URL for database $name: DATABASE_URL has no database path" >&2
    return 1
  fi
  printf '%s' "$replaced"
}

# dump_one <file> <key prefix> <url>; explicit checks because errexit is off inside `if` callers.
dump_one() {
  local file="$1" prefix="$2" url="$3" size
  # --no-owner/--no-privileges: restore into a database with a different owner (see restore.sh).
  "$PG_DUMP" --format=custom --compress=6 --no-owner --no-privileges --file "$file" "$url" || return 1
  size=$(wc -c <"$file" | tr -d ' ')
  echo "dump: $file ($size bytes)"
  if [ "$size" -le 1024 ]; then
    echo "dump is suspiciously small: $file" >&2
    return 1
  fi
  if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
    local endpoint_args=() key
    [ -n "${BACKUP_S3_ENDPOINT:-}" ] && endpoint_args=(--endpoint-url "$BACKUP_S3_ENDPOINT")
    key="$prefix/$(basename "$file")"
    aws ${endpoint_args[@]+"${endpoint_args[@]}"} s3 cp "$file" "s3://$BACKUP_S3_BUCKET/$key" --only-show-errors || return 1
    echo "uploaded: s3://$BACKUP_S3_BUCKET/$key"
    rm -f "$file"
  fi
}

# The pilot database: a failure here stops the job exactly as before.
dump_one "$OUT_DIR/vakhta-$STAMP.dump" "postgres" "$DATABASE_URL" || exit 1

if [ "${BACKUP_ALL_DATABASES:-true}" = "false" ]; then
  exit 0
fi

DATABASES="$("$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -At -c "
  SELECT datname FROM pg_database
  WHERE datallowconn AND NOT datistemplate AND datname <> current_database()
    AND (datname = 'vakhta_control' OR datname LIKE 'vakhta\\_t\\_%')
  ORDER BY datname")"

failed=()
count=0
while IFS= read -r name; do
  [ -n "$name" ] || continue
  if [[ ! "$name" =~ ^[a-z0-9_]+$ ]]; then
    echo "skipping unexpected database name: $name" >&2
    failed+=("$name")
    continue
  fi
  count=$((count + 1))
  if ! url="$(url_for_database "$DATABASE_URL" "$name")"; then
    failed+=("$name")
    continue
  fi
  if ! dump_one "$OUT_DIR/$name-$STAMP.dump" "postgres/$name" "$url"; then
    echo "dump failed: $name" >&2
    failed+=("$name")
  fi
done <<<"$DATABASES"

echo "platform databases: $count, failed: ${#failed[@]}"
if [ "${#failed[@]}" -gt 0 ]; then
  echo "failed databases: ${failed[*]}" >&2
  exit 1
fi
