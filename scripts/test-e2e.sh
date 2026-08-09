#!/usr/bin/env bash
set -Eeuo pipefail

readonly compose_files=(-f docker-compose.yml -f docker-compose.e2e.yml)
readonly project_name=api-sentinel-e2e

cleanup() {
  local exit_code=$?
  if ((exit_code != 0)); then
    printf 'Browser E2E failed. Recent service logs follow.\n' >&2
    docker compose -p "$project_name" "${compose_files[@]}" \
      logs --tail=200 >&2 || true
  fi
  docker compose -p "$project_name" "${compose_files[@]}" \
    down --volumes --remove-orphans >/dev/null 2>&1 || true
  exit "$exit_code"
}
trap cleanup EXIT

for command_name in docker curl npm; do
  command -v "$command_name" >/dev/null || {
    printf 'Required command is unavailable: %s\n' "$command_name" >&2
    exit 1
  }
done

test -f .env || {
  printf 'Missing .env. Copy .env.example before running browser E2E.\n' >&2
  exit 1
}

docker compose -p "$project_name" "${compose_files[@]}" build api web
docker compose -p "$project_name" "${compose_files[@]}" up -d postgres redis
docker compose -p "$project_name" "${compose_files[@]}" \
  run --rm api npx prisma migrate deploy
docker compose -p "$project_name" "${compose_files[@]}" up -d

curl --fail --silent --show-error \
  --retry 12 --retry-delay 2 --retry-all-errors \
  http://127.0.0.1:3101/v1/health >/dev/null
curl --fail --silent --show-error \
  --retry 12 --retry-delay 2 --retry-all-errors \
  http://127.0.0.1:3100/workspace >/dev/null

PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 \
PLAYWRIGHT_API_URL=http://127.0.0.1:3101/v1 \
  npm run test:e2e
