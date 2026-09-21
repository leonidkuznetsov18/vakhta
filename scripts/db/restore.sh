#!/usr/bin/env bash
# Відновлення дампа у ПОРОЖНЮ базу (навчання з docs/runbooks/recovery.md або аварія).
#   scripts/db/restore.sh backups/vakhta-20260906T023000Z.dump postgres://user:pass@host:5432/vakhta_restore
# Або з бакета: BACKUP_S3_ENDPOINT=... BACKUP_S3_BUCKET=... scripts/db/restore.sh s3://bucket/postgres/vakhta-....dump <url>
#
# Tenant databases (specs/011) are owned by their role `vakhta_<id>_app`. Set RESTORE_ROLE to that
# role and connect as an administrator: every restored object is then owned by the tenant role,
# exactly as after provisioning. Extensions are created here by the administrator and their dump
# entries are skipped, because a tenant role may not own or comment on them.
set -euo pipefail

SRC="${1:?шлях до дампа або s3://...}"
TARGET="${2:?DATABASE_URL цільової порожньої бази}"
PSQL="${PSQL:-psql}"
PG_RESTORE="${PG_RESTORE:-pg_restore}"

if [[ "$SRC" == s3://* ]]; then
  ENDPOINT_ARGS=()
  [ -n "${BACKUP_S3_ENDPOINT:-}" ] && ENDPOINT_ARGS=(--endpoint-url "$BACKUP_S3_ENDPOINT")
  LOCAL="$(mktemp -t vakhta-restore.XXXXXX)"
  aws ${ENDPOINT_ARGS[@]+"${ENDPOINT_ARGS[@]}"} s3 cp "$SRC" "$LOCAL" --only-show-errors
  SRC="$LOCAL"
fi

# Розширення міграції 0006 (btree_gist) і pgcrypto мають бути доступні цільовій ролі.
"$PSQL" "$TARGET" -v ON_ERROR_STOP=1 -q -c "CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS btree_gist;"

LIST="$(mktemp -t vakhta-restore-list.XXXXXX)"
trap 'rm -f "$LIST"' EXIT
"$PG_RESTORE" --list "$SRC" | grep -vE ' (EXTENSION|COMMENT - EXTENSION) ' >"$LIST"

ROLE_ARGS=()
if [ -n "${RESTORE_ROLE:-}" ]; then
  [[ "$RESTORE_ROLE" =~ ^[a-z0-9_]+$ ]] || { echo "RESTORE_ROLE has an unexpected shape" >&2; exit 1; }
  ROLE_ARGS=(--role "$RESTORE_ROLE")
fi
"$PG_RESTORE" --no-owner --no-privileges --exit-on-error ${ROLE_ARGS[@]+"${ROLE_ARGS[@]}"} --use-list "$LIST" --dbname "$TARGET" "$SRC"

# Межа відновлених даних: останній момент у журналі подій (append-only, ADR-0001).
HAS_EVENTS="$("$PSQL" "$TARGET" -v ON_ERROR_STOP=1 -At -c "SELECT to_regclass('public.domain_events') IS NOT NULL")"
if [ "$HAS_EVENTS" = "t" ]; then
  "$PSQL" "$TARGET" -v ON_ERROR_STOP=1 -At -c "SELECT 'подій: ' || count(*) || ', остання: ' || coalesce(max(occurred_at)::text, 'немає') FROM domain_events;"
else
  "$PSQL" "$TARGET" -v ON_ERROR_STOP=1 -At -c "SELECT 'control registry, tenants: ' || count(*) FROM tenants;"
fi
