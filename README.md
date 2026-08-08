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

The workspace keeps the ten most recent executions for the selected collection. Expand an entry to inspect every request result, including its status code, duration, and assertion failure message.

## Generate smoke tests from OpenAPI

Open a specification reference in the workspace, provide its public API base URL, then select **Create smoke tests from OpenAPI**. API Sentinel creates one request for every eligible `GET` endpoint and derives its expected successful status code from the specification. To avoid accidental writes or incomplete URLs, `POST`, `PUT`, `PATCH`, `DELETE`, and paths containing parameters such as `/users/{id}` are skipped.

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
docker compose up -d api
curl http://localhost:3001/v1/health
```

PostgreSQL and Redis are available only inside the Compose network. Put a TLS reverse proxy in front of ports `3000` and `3001` before using production credentials over a public network. Set `ALLOW_INSECURE_HTTP_TARGETS=false` in production unless a public HTTP target is an explicit requirement.

The API starts at `http://localhost:3001`. Its interactive API documentation is at `/documentation`.

## MVP capabilities

- Organizations, projects, and project-scoped access controls
- OpenAPI 3.0/3.1 validation and immutable version imports
- Breaking-change reports between specification versions
- Collection test execution with safe outbound-request controls
- Health endpoint and structured error responses

See [plan.md](./plan.md), [architecture.md](./architecture.md), and [design.md](./design.md) for the product blueprint.
