#!/usr/bin/env bash
set -Eeuo pipefail

if (($# != 1)) || [[ ! "$1" =~ ^[a-z0-9][a-z0-9_-]*$ ]]; then
  printf 'Usage: %s COMPOSE_PROJECT_NAME\n' "$0" >&2
  exit 2
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
backup_test_dir="$(mktemp -d)"
export COMPOSE_PROJECT_NAME="$1"
export BACKUP_DIR="$backup_test_dir"
export BACKUP_RETENTION_DAYS=1
export BACKUP_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

cleanup_test_backups() {
  local exit_code=$?
  find "$backup_test_dir" -mindepth 1 -maxdepth 1 -type f -delete 2>/dev/null || true
  rmdir "$backup_test_dir" 2>/dev/null || true
  exit "$exit_code"
}
trap cleanup_test_backups EXIT

docker compose -p "$COMPOSE_PROJECT_NAME" -f "$script_dir/../docker-compose.yml" \
  exec -T postgres psql --username api_sentinel --dbname api_sentinel \
  --set ON_ERROR_STOP=1 --command \
  'CREATE TABLE "BackupRestoreProbe" (value text PRIMARY KEY); INSERT INTO "BackupRestoreProbe" VALUES ('"'"'preserved'"'"');'

archive="$(bash "$script_dir/backup-database.sh")"
if bash "$script_dir/restore-database.sh" "$archive" >/dev/null 2>&1; then
  printf 'Restore accepted a request without explicit database confirmation.\n' >&2
  exit 1
fi

invalid_archive="$backup_test_dir/invalid-checksum.dump.enc"
cp -- "$archive" "$invalid_archive"
printf '%064d  %s\n' 0 "$(basename -- "$invalid_archive")" \
  >"${invalid_archive}.sha256"
if bash "$script_dir/rehearse-database-restore.sh" "$invalid_archive" \
  >/dev/null 2>&1; then
  printf 'Restore rehearsal accepted an invalid checksum.\n' >&2
  exit 1
fi

docker compose -p "$COMPOSE_PROJECT_NAME" -f "$script_dir/../docker-compose.yml" \
  exec -T postgres psql --username api_sentinel --dbname api_sentinel \
  --set ON_ERROR_STOP=1 --command 'DELETE FROM "BackupRestoreProbe";'

bash "$script_dir/restore-database.sh" --confirm api_sentinel "$archive"
probe_count="$(docker compose -p "$COMPOSE_PROJECT_NAME" \
  -f "$script_dir/../docker-compose.yml" exec -T postgres psql \
  --username api_sentinel --dbname api_sentinel --tuples-only --no-align \
  --command 'SELECT count(*) FROM "BackupRestoreProbe" WHERE value = '"'"'preserved'"'"';')"
if [[ "$probe_count" != "1" ]]; then
  printf 'Restored database did not preserve the backup probe.\n' >&2
  exit 1
fi

bash "$script_dir/rehearse-database-restore.sh" "$archive"
printf 'Backup, destructive restore, and isolated rehearsal checks passed.\n'
