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

## Generate smoke tests from OpenAPI

Open a specification reference in the workspace, provide its public API base URL, then select **Create smoke tests from OpenAPI**. API Sentinel creates one request for every eligible `GET` endpoint and derives its expected successful status code from the specification. To avoid accidental writes or incomplete URLs, `POST`, `PUT`, `PATCH`, `DELETE`, and paths containing parameters such as `/users/{id}` are skipped.

## Environment secrets

Each project environment can store write-only secrets such as `token` or `apiKey`. Reference them in request headers or bodies with `{{token}}`. Values are encrypted with AES-256-GCM before persistence, are never returned by read endpoints, are decrypted only during execution, and are redacted from stored execution errors.

Production requires a unique 32-byte encryption key encoded as 64 hexadecimal characters:

```bash
ENCRYPTION_KEY=replace-with-64-random-hex-characters
```

Keep this key outside Git and back it up in a secret manager. Losing it makes existing secrets unrecoverable; changing it requires a controlled key-rotation migration.

The runner blocks localhost, private-network, link-local, and cloud-metadata targets, disallows redirects, and enforces a ten-second timeout.

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

## MVP capabilities

- Organizations, projects, and project-scoped access controls
- OpenAPI 3.0/3.1 validation and immutable version imports
- Breaking-change reports between specification versions
- Collection test execution with safe outbound-request controls
- Durable queued execution in a separately scalable worker
- Cron-based collection schedules with timezone and overlap protection
- Encrypted, signed failure webhooks with retry history
- Health endpoint and structured error responses

See [plan.md](./plan.md), [architecture.md](./architecture.md), and [design.md](./design.md) for the product blueprint.
