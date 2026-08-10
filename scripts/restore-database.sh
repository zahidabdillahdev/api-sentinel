#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=scripts/lib/database-common.sh
source "$script_dir/lib/database-common.sh"

usage() {
  printf 'Usage: %s --confirm api_sentinel BACKUP_FILE\n' "$0" >&2
}

if (($# != 3)) || [[ "$1" != "--confirm" || "$2" != "api_sentinel" ]]; then
  usage
  exit 2
fi

archive="$3"
test -f "$archive" || {
  printf 'Backup file does not exist: %s\n' "$archive" >&2
  exit 1
}
archive="$(cd -- "$(dirname -- "$archive")" && pwd -P)/$(basename -- "$archive")"

database_require_commands docker openssl sha256sum
database_load_settings
database_verify_checksum "$archive"
database_decrypt "$archive" |
  database_compose exec -T postgres pg_restore --list >/dev/null

running_services=()
for service in api worker; do
  container_id="$(database_compose ps -q "$service")"
  if [[ -n "$container_id" ]] &&
    [[ "$(docker inspect --format '{{.State.Running}}' "$container_id")" == "true" ]]; then
    running_services+=("$service")
  fi
done

services_stopped=false
restore_started=false
safety_backup="not created"
restore_exit() {
  local exit_code=$?
  if ((exit_code != 0)) && [[ "$services_stopped" == "true" ]]; then
    if [[ "$restore_started" == "true" ]]; then
      printf 'Restore failed. API/worker remain stopped to protect the database.\n' >&2
      printf 'Safety backup: %s\n' "$safety_backup" >&2
    elif ((${#running_services[@]} > 0)); then
      database_compose start "${running_services[@]}" >/dev/null 2>&1 || true
      printf 'Restore stopped before modifying the database; services were restarted.\n' >&2
    fi
  fi
  exit "$exit_code"
}
trap restore_exit EXIT

if ((${#running_services[@]} > 0)); then
  database_compose stop "${running_services[@]}"
  services_stopped=true
fi

printf 'Creating a safety backup of the quiesced database before restore.\n' >&2
safety_backup="$(bash "$script_dir/backup-database.sh")"

restore_started=true
database_compose exec -T postgres \
  dropdb --username api_sentinel --force --if-exists api_sentinel
database_compose exec -T postgres \
  createdb --username api_sentinel --owner api_sentinel api_sentinel
database_decrypt "$archive" |
  database_compose exec -T postgres \
    pg_restore --exit-on-error --no-owner --no-privileges \
      --username api_sentinel --dbname api_sentinel

schema_ready="$(database_compose exec -T postgres psql \
  --username api_sentinel --dbname api_sentinel --tuples-only --no-align \
  --command "SELECT to_regclass('public.\"_prisma_migrations\"') IS NOT NULL;")"
if [[ "$schema_ready" != "t" ]]; then
  printf 'Restored database does not contain Prisma migration history.\n' >&2
  exit 1
fi
failed_migrations="$(database_compose exec -T postgres psql \
  --username api_sentinel --dbname api_sentinel --tuples-only --no-align \
  --command 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL;')"
if [[ "$failed_migrations" != "0" ]]; then
  printf 'Restored database contains %s unfinished migration(s).\n' "$failed_migrations" >&2
  exit 1
fi

if ((${#running_services[@]} > 0)); then
  database_compose start "${running_services[@]}"
  services_stopped=false
fi

if [[ " ${running_services[*]} " == *" api "* ]]; then
  api_ready=false
  for _attempt in {1..20}; do
    if database_compose exec -T api node -e \
      'fetch("http://127.0.0.1:3001/v1/health").then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))' \
      >/dev/null 2>&1; then
      api_ready=true
      break
    fi
    sleep 1
  done
  if [[ "$api_ready" != "true" ]]; then
    printf 'Database restored, but the API did not become healthy.\n' >&2
    exit 1
  fi
fi

trap - EXIT
printf 'Database restore verified from %s\n' "$archive"
printf 'Pre-restore safety backup: %s\n' "$safety_backup"
