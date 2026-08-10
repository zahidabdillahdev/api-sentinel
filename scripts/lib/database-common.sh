#!/usr/bin/env bash

database_script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
database_repo_root="$(cd -- "$database_script_dir/../.." && pwd -P)"

database_env_value() {
  local name="$1"
  local fallback="${2-}"
  local value=""

  if [[ -n "${!name-}" ]]; then
    value="${!name}"
  elif [[ -f "$database_repo_root/.env" ]]; then
    value="$(sed -n "s/^${name}=//p" "$database_repo_root/.env" | tail -n 1)"
  fi
  printf '%s' "${value:-$fallback}"
}

database_require_commands() {
  local command_name
  for command_name in "$@"; do
    command -v "$command_name" >/dev/null || {
      printf 'Required command is unavailable: %s\n' "$command_name" >&2
      return 1
    }
  done
}

database_load_settings() {
  BACKUP_ENCRYPTION_KEY="$(database_env_value BACKUP_ENCRYPTION_KEY)"
  BACKUP_DIR="$(database_env_value BACKUP_DIR backups/postgres)"
  BACKUP_RETENTION_DAYS="$(database_env_value BACKUP_RETENTION_DAYS 30)"

  if [[ ! "$BACKUP_ENCRYPTION_KEY" =~ ^[A-Fa-f0-9]{64}$ ]]; then
    printf 'BACKUP_ENCRYPTION_KEY must contain exactly 64 hexadecimal characters.\n' >&2
    return 1
  fi
  if [[ ! "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]] ||
    ((BACKUP_RETENTION_DAYS < 1 || BACKUP_RETENTION_DAYS > 3650)); then
    printf 'BACKUP_RETENTION_DAYS must be an integer between 1 and 3650.\n' >&2
    return 1
  fi
  if [[ -n "${COMPOSE_PROJECT_NAME:-}" ]] &&
    [[ ! "$COMPOSE_PROJECT_NAME" =~ ^[a-z0-9][a-z0-9_-]*$ ]]; then
    printf 'COMPOSE_PROJECT_NAME contains unsupported characters.\n' >&2
    return 1
  fi

  if [[ "$BACKUP_DIR" != /* ]]; then
    BACKUP_DIR="$database_repo_root/$BACKUP_DIR"
  fi
  mkdir -p -- "$BACKUP_DIR"
  BACKUP_DIR="$(cd -- "$BACKUP_DIR" && pwd -P)"
  if [[ "$BACKUP_DIR" == "/" || "$BACKUP_DIR" == "$database_repo_root" ]]; then
    printf 'BACKUP_DIR must be a dedicated directory below or outside the repository root.\n' >&2
    return 1
  fi
  chmod 700 "$BACKUP_DIR"
  export BACKUP_DIR BACKUP_ENCRYPTION_KEY BACKUP_RETENTION_DAYS
}

database_compose() {
  local compose_args=()
  if [[ -f "$database_repo_root/.env" ]]; then
    compose_args+=(--env-file "$database_repo_root/.env")
  fi
  compose_args+=(-f "$database_repo_root/docker-compose.yml")
  if [[ -n "${COMPOSE_PROJECT_NAME:-}" ]]; then
    compose_args=(-p "$COMPOSE_PROJECT_NAME" "${compose_args[@]}")
  fi
  docker compose "${compose_args[@]}" "$@"
}

database_decrypt() {
  local archive="$1"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 \
    -pass env:BACKUP_ENCRYPTION_KEY -in "$archive"
}

database_verify_checksum() {
  local archive="$1"
  local checksum_file="${archive}.sha256"
  local expected=""
  local actual=""

  test -f "$checksum_file" || {
    printf 'Missing checksum sidecar: %s\n' "$checksum_file" >&2
    return 1
  }
  expected="$(awk 'NR == 1 { print $1 }' "$checksum_file")"
  if [[ ! "$expected" =~ ^[A-Fa-f0-9]{64}$ ]]; then
    printf 'Checksum sidecar is malformed: %s\n' "$checksum_file" >&2
    return 1
  fi
  actual="$(sha256sum "$archive" | awk '{ print $1 }')"
  if [[ "$actual" != "$expected" ]]; then
    printf 'Backup checksum mismatch: %s\n' "$archive" >&2
    return 1
  fi
}
