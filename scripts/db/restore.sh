#!/usr/bin/env bash
# Відновлення дампа у ПОРОЖНЮ базу (навчання з docs/runbooks/recovery.md або аварія).
#   scripts/db/restore.sh backups/vakhta-20260906T023000Z.dump postgres://user:pass@host:5432/vakhta_restore
# Або з бакета: BACKUP_S3_ENDPOINT=... BACKUP_S3_BUCKET=... scripts/db/restore.sh s3://bucket/postgres/vakhta-....dump <url>
set -euo pipefail

SRC="${1:?шлях до дампа або s3://...}"
TARGET="${2:?DATABASE_URL цільової порожньої бази}"

if [[ "$SRC" == s3://* ]]; then
  ENDPOINT_ARGS=()
  [ -n "${BACKUP_S3_ENDPOINT:-}" ] && ENDPOINT_ARGS=(--endpoint-url "$BACKUP_S3_ENDPOINT")
  LOCAL="$(mktemp -t vakhta-restore.XXXXXX)"
  aws "${ENDPOINT_ARGS[@]}" s3 cp "$SRC" "$LOCAL" --only-show-errors
  SRC="$LOCAL"
fi

# Розширення міграції 0006 (btree_gist) і pgcrypto мають бути доступні цільовій ролі.
psql "$TARGET" -v ON_ERROR_STOP=1 -q -c "CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS btree_gist;"
pg_restore --no-owner --no-privileges --exit-on-error --dbname "$TARGET" "$SRC"

# Межа відновлених даних: останній момент у журналі подій (append-only, ADR-0001).
psql "$TARGET" -v ON_ERROR_STOP=1 -At -c "SELECT 'подій: ' || count(*) || ', остання: ' || coalesce(max(occurred_at)::text, 'немає') FROM domain_events;"
