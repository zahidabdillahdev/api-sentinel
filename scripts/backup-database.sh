#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=scripts/lib/database-common.sh
source "$script_dir/lib/database-common.sh"

database_require_commands docker openssl sha256sum
database_load_settings

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="$BACKUP_DIR/api-sentinel-${timestamp}-${BASHPID}.dump.enc"
partial_archive="${archive}.partial.$$"
checksum_file="${archive}.sha256"
metadata_file="${archive}.metadata"
partial_checksum="${checksum_file}.partial.$$"
partial_metadata="${metadata_file}.partial.$$"

cleanup_partial_backup() {
  local exit_code=$?
  if ((exit_code != 0)); then
    rm -f -- "$partial_archive" "$partial_checksum" "$partial_metadata"
    printf 'Database backup failed; incomplete output was removed.\n' >&2
  fi
  exit "$exit_code"
}
trap cleanup_partial_backup EXIT

if [[ -e "$archive" ]]; then
  printf 'Refusing to overwrite an existing backup: %s\n' "$archive" >&2
  exit 1
fi

database_compose exec -T postgres \
  pg_dump --username api_sentinel --dbname api_sentinel --format=custom \
    --compress=6 --no-owner --no-privileges |
  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -md sha256 \
    -pass env:BACKUP_ENCRYPTION_KEY -out "$partial_archive"

test -s "$partial_archive"
database_decrypt "$partial_archive" |
  database_compose exec -T postgres pg_restore --list >/dev/null

mv -- "$partial_archive" "$archive"
digest="$(sha256sum "$archive" | awk '{ print $1 }')"
printf '%s  %s\n' "$digest" "$(basename -- "$archive")" >"$partial_checksum"
printf 'format=postgresql-custom+aes-256-cbc\ncreated_at=%s\ndatabase=api_sentinel\nsha256=%s\n' \
  "$timestamp" "$digest" >"$partial_metadata"
mv -- "$partial_checksum" "$checksum_file"
mv -- "$partial_metadata" "$metadata_file"
chmod 600 "$archive" "$checksum_file" "$metadata_file"

find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'api-sentinel-*.dump.enc' -o \
    -name 'api-sentinel-*.dump.enc.sha256' -o \
    -name 'api-sentinel-*.dump.enc.metadata' \) \
  -mtime "+$BACKUP_RETENTION_DAYS" -print -delete >&2

trap - EXIT
printf 'Encrypted database backup created: %s\n' "$archive" >&2
printf '%s\n' "$archive"
