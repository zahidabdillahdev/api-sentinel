# API Sentinel

API Sentinel is a self-hosted API quality platform for managing OpenAPI
contracts, detecting breaking changes, running repeatable API checks, and
tracking reliability over time.

It gives backend, QA, and platform teams one workflow for answering four
questions:

1. What does this API promise?
2. What changed between contract versions?
3. Does the deployed API still behave as expected?
4. Can the same checks protect scheduled monitoring and CI pipelines?

## Core capabilities

| Area | Capabilities |
| --- | --- |
| Team workspace | Organizations, projects, invitations, sessions, and project-scoped roles. |
| API contracts | OpenAPI 3.x JSON import, immutable versions, API reference, and focused breaking-change reports. |
| API checks | Collections, environments, request payloads, encrypted variables, and status/header/JSON/latency assertions. |
| Execution | Durable BullMQ jobs, retries, heartbeats, stale-run recovery, organization-scoped quotas, and a separately scalable worker. |
| Automation | Cron schedules, overlap protection, signed failure webhooks, retry history, and retention controls. |
| Developer tooling | CI-friendly CLI, stable JSON output, deterministic exit codes, and a GitHub Actions example. |
| Operations | Redis-backed rate limits, audit events, HTTPS ingress, guarded deployment, and browser E2E coverage. |

## How it works

```text
Browser / CLI
      │
      ▼
  Next.js UI ─────► Fastify API ─────► PostgreSQL
                         │
                         ▼
                    Redis / BullMQ
                         │
                         ▼
                       Worker ───────► Target APIs
                         │
                         └───────────► Failure webhooks
```

- The API owns authentication, authorization, configuration, and durable run
  state.
- The worker is the only component that executes user-configured HTTP requests.
- PostgreSQL is the system of record; Redis carries queues and schedules.
- Caddy is the production TLS boundary and keeps application/database ports
  private.

## Quick start with Docker

### Requirements

- Docker Engine with Docker Compose v2
- Git
- `curl` for the health check

### Start the stack

```bash
git clone https://github.com/YOUR-USERNAME/api-sentinel.git
cd api-sentinel
cp .env.example .env

docker compose build api web
docker compose up -d postgres redis
docker compose run --rm api npx prisma migrate deploy
docker compose up -d

curl -fsS http://localhost:3001/v1/health
```

Open the following local endpoints:

| Endpoint | URL |
| --- | --- |
| Dashboard | `http://localhost:3000/workspace` |
| API | `http://localhost:3001/v1` |
| Interactive API documentation | `http://localhost:3001/documentation` |
| Health check | `http://localhost:3001/v1/health` |

Local HTTP is appropriate for loopback development. Use HTTPS for every shared,
remote, staging, or production installation.

## First workflow

After creating an account:

```text
Create organization and project
             │
             ▼
Create an environment with an API base URL
             │
             ▼
Import an OpenAPI 3.x JSON document
             │
             ├────────► Browse the generated API reference
             │
             ├────────► Compare immutable contract versions
             │
             ▼
Create or generate a test collection
             │
             ▼
Run checks and inspect assertion results
             │
             ├────────► Schedule recurring execution
             └────────► Notify a signed webhook on failure
```

### Important concepts

| Concept | Purpose |
| --- | --- |
| Organization | Team boundary containing members and projects. |
| Project | Ownership boundary for one API or related API surface. |
| Environment | Named base URL and write-only variables for a deployment such as staging or production. |
| Specification | Logical API contract with immutable imported versions. |
| Collection | Ordered group of reusable HTTP checks. |
| Run | Durable queued execution with request and assertion results. |
| Schedule | Cron-based recurring collection execution in an IANA timezone. |
| Notification rule | Signed HTTPS webhook invoked after a failed run. |

## Authentication and authorization

Create an account:

```bash
curl -X POST http://localhost:3001/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"name":"API Owner","email":"owner@example.com","password":"replace-with-a-strong-password"}'
```

Sign in:

```bash
curl -X POST http://localhost:3001/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"owner@example.com","password":"replace-with-a-strong-password"}'
```

Pass the returned token as a bearer token:

```bash
curl http://localhost:3001/v1/organizations \
  -H 'authorization: Bearer YOUR_TOKEN'
```

Sessions expire after seven days. Passwords are salted and hashed with scrypt;
only SHA-256 session-token digests are stored. `POST /v1/auth/logout` revokes
the active server-side session immediately.

Organization and project resources are protected by server-side role checks.
Client-side visibility is never treated as an authorization boundary.

## OpenAPI contract workflow

API Sentinel accepts OpenAPI 3.x JSON documents with `info.title`,
`info.version`, and `paths`. Each successful import creates an immutable version
containing the original document and extracted contract metadata.

The workspace can:

- Render a browsable reference of paths, methods, summaries, and responses.
- Compare two versions and classify supported changes as breaking or
  non-breaking.
- Generate smoke-test requests from eligible `GET` operations.

Generated smoke tests intentionally skip write methods and paths containing
parameters such as `/users/{id}`. This avoids accidental mutations and requests
that cannot be completed safely without user-provided values.

The current breaking-change detector covers removed operations, responses,
parameters, and schemas; newly required parameters and schema properties; and
new operations. It is intentionally a focused MVP detector, not yet a complete
OpenAPI compatibility engine.

## Collections and assertions

Every saved request has a required expected status and may also assert:

- An exact response-header value.
- A JSON value at a dot path such as `$.data.status`.
- A maximum response duration of up to ten seconds.

Expected JSON values must be valid JSON literals, for example `"healthy"`,
`true`, `42`, or `{ "status": "ok" }`.

Runs move through durable states:

```text
QUEUED → RUNNING → PASSED
                 └→ FAILED
```

The API persists the queued run before publishing its job. The dashboard polls
the run, and the worker records status, duration, assertion outcome, and a
readable failure reason for every request.

Admission is limited per organization across both manual and scheduled runs.
The check is serialized in PostgreSQL, so multiple API replicas and workers
cannot bypass it with concurrent requests. Manual requests above the limit
receive `429 ACTIVE_RUN_QUOTA_EXCEEDED`.

Workers heartbeat active executions. A maintenance job runs every minute and
fails queued or running records that have made no progress for the configured
recovery window. Conditional updates prevent recovery from overwriting a run
that completed or renewed its heartbeat concurrently.

## Environments and secrets

An environment provides a reusable base URL and write-only values such as API
tokens. Reference a value in request headers or bodies with `{{variableName}}`.

- Values are encrypted with AES-256-GCM before persistence.
- Plaintext values are never returned after creation.
- Decryption occurs only inside the worker during execution.
- Resolved secrets are redacted from stored errors.
- Editing an environment preserves its collection and secret relationships.

Generate a deployment-specific 32-byte key and store its 64-character
hexadecimal representation in `ENCRYPTION_KEY`:

```bash
openssl rand -hex 32
```

Back up the key in a secret manager. Losing it makes existing environment
secrets unrecoverable. Replacing it requires a controlled key-rotation
migration.

## Target request safety

The worker treats target URLs as untrusted input.

- HTTPS is required by default.
- Redirects are disabled.
- Requests have a ten-second timeout.
- Response bodies used by JSON assertions are streamed through a configurable
  size limit; unused bodies are cancelled without buffering.
- Loopback, private, link-local, and cloud-metadata destinations are blocked.
- DNS results are checked before a request is sent.
- Credentials embedded in target URLs are rejected.

Public HTTP endpoints may be enabled explicitly for trusted development or mock
targets:

```bash
ALLOW_INSECURE_HTTP_TARGETS=true
```

This option does not permit private-network targets. Never send production
credentials or sensitive payloads over HTTP.

## Schedules and failure webhooks

Schedules use BullMQ cron expressions and IANA timezones. Active-run uniqueness
prevents overlapping scheduled executions for the same collection.

Failure notification endpoints and signing secrets are encrypted. Deliveries:

- Use HTTPS only.
- Reject redirects and private-network targets.
- Time out after ten seconds.
- Retry up to three times.
- Record response status, duration, and error details.

Webhook requests include:

| Header | Meaning |
| --- | --- |
| `x-api-sentinel-event` | Stable event type, currently `collection.run.failed`. |
| `x-api-sentinel-event-id` | Stable identifier suitable for consumer deduplication. |
| `x-api-sentinel-signature` | Optional `sha256=<hex>` HMAC-SHA256 signature of the exact body. |

Consumers should deduplicate by event ID and return any `2xx` response to
acknowledge delivery.

## CLI and CI integration

Build the repository CLI:

```bash
npm ci
npm run build -w @api-sentinel/cli
```

Run a collection and wait for its terminal result:

```bash
export API_SENTINEL_URL=https://sentinel.example.com/v1
export API_SENTINEL_TOKEN=replace-with-a-private-token

node apps/cli/dist/index.js run \
  --collection COLLECTION_ID \
  --timeout 120 \
  --output pretty
```

Use `--output json` for a stable `schemaVersion: "1.0"` report.

| Exit code | Meaning |
| --- | --- |
| `0` | The collection completed with `PASSED`. |
| `1` | The collection ran successfully but one or more checks failed. |
| `2` | Configuration, authentication, API, network, or timeout failure. |

Store `API_SENTINEL_TOKEN` in the CI provider's secret store. Do not place it in
command arguments, repository variables, committed workflow files, or logs.

The example workflow at
[`.github/workflows/api-sentinel-example.yml`](./.github/workflows/api-sentinel-example.yml)
runs manually, uploads the JSON report, and maps API Sentinel's exit code to the
job result. Adapt it to `pull_request` after assigning a stable collection and
API URL.

## Development

### Run application services in Docker

Use the [quick start](#quick-start-with-docker) for the most reproducible local
environment.

### Run Node.js services on the host

The development overlay publishes PostgreSQL and Redis on loopback only:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.development.yml \
  up -d postgres redis
```

Change the gitignored `.env` values to:

```bash
DATABASE_URL=postgresql://api_sentinel:api_sentinel@localhost:5432/api_sentinel?schema=public
REDIS_URL=redis://localhost:6379
NEXT_PUBLIC_API_URL=http://localhost:3001/v1
APP_ORIGIN=http://localhost:3000
```

Then install dependencies, migrate, and start the API and dashboard in separate
terminals:

```bash
npm ci
npm run db:generate -w @api-sentinel/api
npm run db:migrate -w @api-sentinel/api
npm run dev -w @api-sentinel/api
```

```bash
npm run dev -w @api-sentinel/web
```

Start the worker in another terminal after building the API:

```bash
npm run build -w @api-sentinel/api
node apps/api/dist/worker.js
```

## Testing and quality gates

Run the static and unit-test suite:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run check:scripts
```

Run the first-value browser workflow in an isolated Compose project:

```bash
test -f .env || cp .env.example .env
npx playwright install --with-deps chromium
npm run test:e2e:stack
```

The Chromium test covers:

- Registration, server-side logout revocation, and login.
- Organization and project creation.
- Environment creation and editing.
- OpenAPI import.
- Collection and request creation.
- Worker execution and a passing result.
- Assertion failure details in the workspace.
- Viewer read access with denied mutation attempts.
- Active-run quota rejection against PostgreSQL.
- Stale queued-run recovery against PostgreSQL.

The wrapper uses application ports `3100` and `3101` plus loopback-only
PostgreSQL port `55432`, prints service logs on failure, and always removes only
its isolated containers, network, and database volume.

GitHub Actions runs two required jobs:

| Job | Coverage |
| --- | --- |
| `verify` | Install, lint, type-check, unit tests, build, and shell syntax validation. |
| `e2e` | Chromium, isolated Docker stack, migrations, worker execution, and report artifact. |

## Production self-hosting

The production Compose overlay:

- Publishes only ports `80` and `443` through Caddy.
- Keeps the API, web, PostgreSQL, and Redis ports private.
- Obtains and renews a publicly trusted TLS certificate.
- Routes `/v1/*` and `/documentation*` to Fastify.
- Routes all other requests to Next.js.
- Adds baseline browser security headers.

### Prerequisites

1. Point a DNS `A` or `AAAA` record at the server.
2. Allow inbound TCP `80`, TCP `443`, and optionally UDP `443` for HTTP/3.
3. Set production values in the gitignored `.env`:

   ```bash
   NODE_ENV=production
   APP_DOMAIN=sentinel.example.com
   ENCRYPTION_KEY=replace-with-64-random-hex-characters
   ALLOW_INSECURE_HTTP_TARGETS=false
   LOG_LEVEL=info
   ```

4. Deploy using the guarded release script:

   ```bash
   bash scripts/deploy-production.sh
   ```

   If Node.js and npm are already installed, `npm run deploy:production` is an
   equivalent convenience command.

The deployment command:

1. Validates the merged Compose configuration.
2. Builds API and web images with the production overlay.
3. Applies pending Prisma migrations.
4. Recreates services without exposing internal ports.
5. Retries public HTTPS health and workspace checks during startup.
6. Rejects a browser bundle containing the localhost API URL.
7. Prints recent API, web, and Caddy logs when deployment fails.

If a CDN or DNS proxy is placed in front of Caddy, use end-to-end strict TLS.
Never use a mode that terminates TLS at the proxy and sends unencrypted HTTP to
the origin.

## Configuration reference

| Variable | Required | Description |
| --- | --- | --- |
| `NODE_ENV` | Yes in production | `development`, `test`, or `production`. |
| `PORT` | No | Fastify port; defaults to `3001`. |
| `POSTGRES_PASSWORD` | Docker | Password used to initialize the Compose PostgreSQL service. |
| `DATABASE_URL` | Yes | PostgreSQL connection URL used by API, worker, and Prisma. |
| `REDIS_URL` | Yes | Redis connection URL used for rate limits, queues, and schedules. |
| `APP_ORIGIN` | Yes | Allowed browser origin for CORS. Production Compose derives it from `APP_DOMAIN`. |
| `APP_DOMAIN` | Production | Hostname used by Caddy; do not include a scheme or path. |
| `TRUST_PROXY` | Production proxy only | Trust proxy-derived client addresses; production Compose enables it behind Caddy. |
| `RATE_LIMIT_MAX` | No | Global requests per source IP per minute; defaults to `300`. |
| `MAX_ACTIVE_RUNS_PER_ORGANIZATION` | No | Maximum combined `QUEUED` and `RUNNING` executions per organization; defaults to `20`. |
| `RUN_STALE_AFTER_SECONDS` | No | Maximum time without run progress before recovery marks it failed; defaults to `300`. |
| `MAX_TARGET_RESPONSE_BYTES` | No | Maximum target body buffered for a JSON assertion; defaults to `1048576` (1 MiB). |
| `ENCRYPTION_KEY` | Production | Unique 32-byte key encoded as 64 hexadecimal characters. |
| `NEXT_PUBLIC_API_URL` | Web build | Browser-visible API URL embedded during the Next.js build. |
| `ALLOW_INSECURE_HTTP_TARGETS` | No | Permit trusted public HTTP targets; defaults to `false`. |
| `LOG_LEVEL` | No | Pino log level; defaults to `info`. |

## Operations and troubleshooting

Inspect service state:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml ps
```

Inspect recent logs:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  logs --tail=200 api worker web caddy
```

Check migration state:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  run --rm api npx prisma migrate status
```

Common failure modes:

| Symptom | Check |
| --- | --- |
| Browser reports `Failed to fetch` | Confirm HTTPS health, CORS origin, and that the web image was built with the production overlay. |
| Caddy cannot obtain a certificate | Verify DNS, ports 80/443, server clock, and that no other process owns the ports. |
| A run remains queued | Inspect Redis and worker health. Orphaned runs are failed automatically after the stale-run window. |
| Target rejected as unsafe | Use a public hostname and verify it does not resolve to loopback, private, link-local, or metadata addresses. |
| Secrets cannot be decrypted | Confirm the original `ENCRYPTION_KEY` is present and unchanged. |
| Migration fails | Stop the rollout, inspect `prisma migrate status`, and do not manually edit migration history. |

## Security model

- All API inputs are validated at the boundary.
- Authorization is enforced by organization/project relationships on the
  server.
- Authentication endpoints have stricter Redis-backed rate limits.
- Request bodies are limited to 2 MiB.
- Session tokens are random, stored only as hashes, revocable, and expire.
- Environment and webhook secrets use authenticated encryption.
- Sensitive headers and configured values are redacted from persisted errors.
- Outbound requests are isolated in the worker and pass URL, protocol, and DNS
  safety checks before execution.
- Production uses same-origin HTTPS with private backend ports.
- Audit events avoid full webhook URLs, encrypted values, and plaintext secrets.

Security-sensitive deployments should additionally provide external database
backups, secret-manager integration, infrastructure monitoring, and periodic
restore rehearsals.

## Repository layout

```text
apps/
  api/          Fastify API, Prisma schema, migrations, and worker entrypoint
  cli/          CI-oriented collection runner
  web/          Next.js dashboard
e2e/            Playwright browser workflows
scripts/        Guarded deployment and isolated E2E orchestration
docker-compose*.yml
                Local, production, development, and E2E service definitions
```

## Project documentation

- [Delivery plan](./plan.md)
- [Architecture](./architecture.md)
- [Product and UI design](./design.md)

The delivery plan distinguishes completed MVP behavior from planned production
hardening. Architecture and design documents describe the intended direction;
they should not be interpreted as claims that every target capability has
already shipped.
