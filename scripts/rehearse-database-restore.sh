#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=scripts/lib/database-common.sh
source "$script_dir/lib/database-common.sh"

if (($# > 1)); then
  printf 'Usage: %s [BACKUP_FILE]\n' "$0" >&2
  exit 2
fi

database_require_commands docker openssl sha256sum
database_load_settings

if (($# == 1)); then
  archive="$1"
else
  archive="$(bash "$script_dir/backup-database.sh")"
fi
test -f "$archive" || {
  printf 'Backup file does not exist: %s\n' "$archive" >&2
  exit 1
}
archive="$(cd -- "$(dirname -- "$archive")" && pwd -P)/$(basename -- "$archive")"
database_verify_checksum "$archive"

container_name="api-sentinel-restore-check-${RANDOM}-$$"
rehearsal_password="restore_rehearsal_only"
cleanup_rehearsal() {
  local exit_code=$?
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  exit "$exit_code"
}
trap cleanup_rehearsal EXIT

docker run -d --name "$container_name" --network none \
  -e POSTGRES_USER=api_sentinel \
  -e POSTGRES_PASSWORD="$rehearsal_password" \
  -e POSTGRES_DB=api_sentinel_rehearsal \
  postgres:16-alpine >/dev/null

postgres_ready=false
for _attempt in {1..30}; do
  if docker exec "$container_name" pg_isready \
    --username api_sentinel --dbname api_sentinel_rehearsal >/dev/null 2>&1; then
    postgres_ready=true
    break
  fi
  sleep 1
done
if [[ "$postgres_ready" != "true" ]]; then
  printf 'Temporary PostgreSQL did not become ready for rehearsal.\n' >&2
  exit 1
fi

database_decrypt "$archive" |
  docker exec -i "$container_name" pg_restore --exit-on-error \
    --no-owner --no-privileges --username api_sentinel \
    --dbname api_sentinel_rehearsal

table_count="$(docker exec "$container_name" psql --username api_sentinel \
  --dbname api_sentinel_rehearsal --tuples-only --no-align \
  --command "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public';")"
migration_count="$(docker exec "$container_name" psql --username api_sentinel \
  --dbname api_sentinel_rehearsal --tuples-only --no-align \
  --command 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;')"
failed_migrations="$(docker exec "$container_name" psql --username api_sentinel \
  --dbname api_sentinel_rehearsal --tuples-only --no-align \
  --command 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL;')"

if ((table_count < 2 || migration_count < 1)) || [[ "$failed_migrations" != "0" ]]; then
  printf 'Restore rehearsal validation failed: tables=%s migrations=%s unfinished=%s\n' \
    "$table_count" "$migration_count" "$failed_migrations" >&2
  exit 1
fi

trap - EXIT
docker rm -f "$container_name" >/dev/null
printf 'Restore rehearsal passed: %s tables, %s completed migrations.\n' \
  "$table_count" "$migration_count"
