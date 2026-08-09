# API Sentinel

API Sentinel is an open-source workspace for OpenAPI versioning, breaking-change detection, repeatable API checks, and reliability history.

## Quick start

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:generate -w @api-sentinel/api
npm run db:migrate -w @api-sentinel/api
npm run dev
```

## Authentication

Create an account and keep the returned bearer token private:

```bash
curl -X POST http://localhost:3001/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"name":"API Owner","email":"owner@example.com","password":"replace-with-a-strong-password"}'
```

Pass the token to protected endpoints:

```bash
curl http://localhost:3001/v1/organizations \
  -H 'authorization: Bearer YOUR_TOKEN'
```

Sessions expire after seven days. The database stores only a SHA-256 digest of each session token; passwords are salted and hashed with scrypt. All organization, project, and specification routes enforce membership roles on the server.

## Test collections and target safety

Collections run public HTTP requests and can assert:

- Exact HTTP status code (required)
- Exact response header value (optional)
- A JSON value via a dot path such as `$.slideshow.title` (optional)
- Maximum response duration, up to 10 seconds (optional)

JSON expected values must be valid JSON literals: use `"healthy"`, `true`, `42`, or `{ "key": "value" }`. Header and JSON checks require both of their corresponding fields. Each run records the status, duration, pass/fail state, and a readable failure reason.

Runs are queued through Redis and executed by a dedicated BullMQ worker. The API returns a durable `QUEUED` run immediately, the dashboard polls through `RUNNING`, and the worker persists terminal results. Jobs retry transient worker failures up to three times with exponential backoff.

### Scheduled monitoring

Select a collection and create a schedule with a BullMQ cron expression and IANA timezone, for example `0 */5 * * * *` with `Asia/Jakarta`. Schedules can be paused and enabled from the workspace. A partial database uniqueness constraint prevents overlapping active runs for the same schedule, and disabled/deleted schedules are removed from Redis.

### Failure webhooks

Each collection can notify a generic HTTPS endpoint when a run fails. The endpoint URL and optional signing secret are encrypted with AES-256-GCM, are never returned by the API, and are decrypted only by the worker. Delivery attempts have a ten-second timeout, reject redirects and private-network targets, retry up to three times, and appear in the dashboard with response status and duration.

Webhook requests use `content-type: application/json` and include stable `x-api-sentinel-event` and `x-api-sentinel-event-id` headers. When a signing secret is configured, verify `x-api-sentinel-signature`, whose value is `sha256=` followed by the hexadecimal HMAC-SHA256 of the exact request body. A failure payload has this shape:

```json
{
  "schemaVersion": "1.0",
  "event": "collection.run.failed",
  "eventId": "run:RUN_ID",
  "occurredAt": "2026-08-09T01:00:01.000Z",
  "data": {
    "runId": "RUN_ID",
    "collection": { "id": "COLLECTION_ID", "name": "Production checks" },
    "status": "FAILED",
    "failedRequests": 1,
    "totalRequests": 3,
    "startedAt": "2026-08-09T01:00:00.000Z",
    "finishedAt": "2026-08-09T01:00:01.000Z"
  }
}
```

Consumers should deduplicate events by `x-api-sentinel-event-id`. Return any `2xx` status to acknowledge delivery; all other responses are recorded as failures and retried.

The workspace keeps the ten most recent executions for the selected collection. Expand an entry to inspect every request result, including its status code, duration, and assertion failure message.

### Reliability overview and history

The project overview aggregates the last 24 hours of runs into pass rate, passed/failed/active counts, average request duration, and active schedule totals. It also shows the five most recent runs across every collection. Collection history uses cursor pagination: select **Load older runs** to fetch the next ten without reloading or duplicating previous results.

### Retention and audit trail

Project administrators can retain completed runs for 7, 30, 90, 180, or 365 days. A BullMQ maintenance job runs every day at 03:00 UTC with exponential retries. It deletes only terminal `PASSED` and `FAILED` runs whose `finishedAt` timestamp is older than the project cutoff; queued/running executions and configuration records are preserved.

The governance panel exposes an append-only audit feed for retention, schedule, and webhook configuration changes. Events record the actor, action, target, timestamp, and non-sensitive context. Full webhook URLs, signing secrets, and environment secret values are never written to audit metadata.

## Generate smoke tests from OpenAPI

Open a specification reference in the workspace, provide its public API base URL, then select **Create smoke tests from OpenAPI**. API Sentinel creates one request for every eligible `GET` endpoint and derives its expected successful status code from the specification. To avoid accidental writes or incomplete URLs, `POST`, `PUT`, `PATCH`, `DELETE`, and paths containing parameters such as `/users/{id}` are skipped.

## CLI and continuous integration

Build the repository-local CLI, then provide an API URL ending in `/v1`, a bearer token, and the collection ID:

```bash
npm ci
npm run build -w @api-sentinel/cli

export API_SENTINEL_URL=https://sentinel.example.com/v1
export API_SENTINEL_TOKEN=replace-with-a-private-token
node apps/cli/dist/index.js run \
  --collection COLLECTION_ID \
  --timeout 120 \
  --output pretty
```

Use `--output json` to emit a stable `schemaVersion: "1.0"` report containing run metadata, aggregate counts, and per-request results. Keep the token in a CI secret; do not put it in arguments, logs, repository variables, or committed workflow files. Supported exit codes are:

| Exit code | Meaning |
| --- | --- |
| `0` | The collection finished with `PASSED`. |
| `1` | The collection ran successfully but one or more checks failed. |
| `2` | Configuration, authentication, API, network, or timeout error. |

The manually triggered example at [`.github/workflows/api-sentinel-example.yml`](./.github/workflows/api-sentinel-example.yml) reads `API_SENTINEL_TOKEN` from GitHub Actions secrets, uploads the JSON report as an artifact, and fails the job when the collection fails. For branch protection, adapt its `workflow_dispatch` trigger to `pull_request` after assigning a stable collection and API URL.

## Environment secrets

Each project environment can store write-only secrets such as `token` or `apiKey`. Reference them in request headers or bodies with `{{token}}`. Values are encrypted with AES-256-GCM before persistence, are never returned by read endpoints, are decrypted only during execution, and are redacted from stored execution errors.

Production requires a unique 32-byte encryption key encoded as 64 hexadecimal characters:

```bash
ENCRYPTION_KEY=replace-with-64-random-hex-characters
```

Keep this key outside Git and back it up in a secret manager. Losing it makes existing secrets unrecoverable; changing it requires a controlled key-rotation migration.

The runner blocks localhost, private-network, link-local, and cloud-metadata targets, disallows redirects, and enforces a ten-second timeout.

The API limits request bodies to 2 MiB and uses Redis-backed rate limiting so limits remain consistent across API replicas. The default is 300 requests per source IP per minute; register/login are restricted to 10 per minute. Configure the global ceiling with `RATE_LIMIT_MAX`. Only set `TRUST_PROXY=true` behind a trusted reverse proxy such as the included production Caddy service—never on a directly exposed API port.

HTTPS is required by default. Developer teams can explicitly support public HTTP staging or mock targets by setting the following environment variable:

```bash
ALLOW_INSECURE_HTTP_TARGETS=true
```

Only enable this for targets you trust. HTTP is unencrypted, so it must not be used with production credentials, secrets, or sensitive response data. The restriction against private networks remains active even when HTTP is enabled.

## Production containers

```bash
docker compose build api
docker compose up -d postgres redis
docker compose run --rm api npx prisma migrate deploy
docker compose up -d api worker web
curl http://localhost:3001/v1/health
```

PostgreSQL and Redis are available only inside the Compose network. Put a TLS reverse proxy in front of ports `3000` and `3001` before using production credentials over a public network. Set `ALLOW_INSECURE_HTTP_TARGETS=false` in production unless a public HTTP target is an explicit requirement.

The API starts at `http://localhost:3001`. Its interactive API documentation is at `/documentation`.

### Custom domain and automatic HTTPS

The production override runs Caddy as the only public entry point and removes direct host bindings for the web and API containers. Caddy routes `/v1/*` and `/documentation*` to Fastify, routes everything else to Next.js, adds baseline security headers, redirects HTTP to HTTPS, and persists certificate state.

1. Create a DNS `A` record for your subdomain pointing to the VPS public IPv4 address. Keep it **DNS only** until the origin certificate has been issued.
2. Allow inbound TCP `80` and TCP/UDP `443` in the VPS and provider firewalls.
3. Set `APP_DOMAIN` in the gitignored `.env` file, for example:

   ```bash
   APP_DOMAIN=sentinel.example.com
   ```

4. Deploy the production overlay:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.production.yml build api web
   docker compose -f docker-compose.yml -f docker-compose.production.yml run --rm api npx prisma migrate deploy
   docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
   curl -fsS https://sentinel.example.com/v1/health
   ```

5. If Cloudflare proxying is desired, enable the orange-cloud proxy only after direct HTTPS succeeds, then select **SSL/TLS → Full (strict)**. Never use Flexible mode because it leaves the Cloudflare-to-origin connection unencrypted and can create redirect loops.

Caddy requires the domain to resolve to the VPS, public ports 80/443, and persistent `/data` storage; it then obtains, renews, and serves certificates automatically. See the [Caddy automatic HTTPS requirements](https://caddyserver.com/docs/automatic-https) and [Cloudflare Full (strict) requirements](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/).

After HTTPS is active, use only the domain URL in tokens, CLI configuration, and browser sessions. Rotate any VPS password or token ever pasted into chat/history, prefer SSH keys, and disable password SSH authentication after confirming key access.

## MVP capabilities

- Organizations, projects, and project-scoped access controls
- OpenAPI 3.0/3.1 validation and immutable version imports
- Breaking-change reports between specification versions
- Collection test execution with safe outbound-request controls
- Durable queued execution in a separately scalable worker
- Cron-based collection schedules with timezone and overlap protection
- Encrypted, signed failure webhooks with retry history
- Project reliability metrics and cursor-paginated run history
- Configurable run retention and project-scoped audit events
- CI-friendly collection runner CLI with versioned JSON reports and deterministic exit codes
- Health endpoint and structured error responses

See [plan.md](./plan.md), [architecture.md](./architecture.md), and [design.md](./design.md) for the product blueprint.
