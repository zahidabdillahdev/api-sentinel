#!/usr/bin/env bash
set -Eeuo pipefail

readonly compose_files=(-f docker-compose.yml -f docker-compose.production.yml)

on_error() {
  local exit_code=$?
  printf 'Production deployment failed. Recent service logs follow.\n' >&2
  docker compose "${compose_files[@]}" logs --tail=100 api web caddy >&2 || true
  exit "$exit_code"
}
trap on_error ERR

for command_name in docker curl; do
  command -v "$command_name" >/dev/null || {
    printf 'Required command is unavailable: %s\n' "$command_name" >&2
    exit 1
  }
done

test -f .env || {
  printf 'Missing .env. Copy .env.example and configure production values first.\n' >&2
  exit 1
}

app_domain="$(sed -n 's/^APP_DOMAIN=//p' .env | tail -n 1)"
if [[ ! "$app_domain" =~ ^[A-Za-z0-9.-]+$ ]]; then
  printf 'APP_DOMAIN must be a hostname without a scheme or path.\n' >&2
  exit 1
fi

docker compose "${compose_files[@]}" config --quiet
docker compose "${compose_files[@]}" build api web
docker compose "${compose_files[@]}" run --rm api npx prisma migrate deploy
docker compose "${compose_files[@]}" up -d --remove-orphans

curl --fail --silent --show-error \
  --retry 12 --retry-delay 2 --retry-all-errors \
  "https://${app_domain}/v1/health" >/dev/null
curl --fail --silent --show-error \
  --retry 12 --retry-delay 2 --retry-all-errors \
  "https://${app_domain}/workspace" >/dev/null

if docker compose "${compose_files[@]}" exec -T web \
  sh -c "grep -R -q 'http://localhost:3001/v1' .next/static/chunks"; then
  printf 'Deployment rejected: the web bundle contains the localhost API URL.\n' >&2
  exit 1
fi

docker compose "${compose_files[@]}" exec -T web \
  sh -c "grep -R -F -q 'https://${app_domain}/v1' .next/static/chunks"

trap - ERR
printf 'Production deployment verified at https://%s\n' "$app_domain"
