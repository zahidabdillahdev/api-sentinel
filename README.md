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

## Production containers

```bash
docker compose build api
docker compose up -d postgres redis
docker compose run --rm api npx prisma migrate deploy
docker compose up -d api
curl http://localhost:3001/v1/health
```

PostgreSQL and Redis are available only inside the Compose network. Put a TLS reverse proxy in front of port `3001` before using production credentials over a public network.

The API starts at `http://localhost:3001`. Its interactive API documentation is at `/documentation`.

## MVP capabilities

- Organizations, projects, and project-scoped access controls
- OpenAPI 3.0/3.1 validation and immutable version imports
- Breaking-change reports between specification versions
- Collection test execution with safe outbound-request controls
- Health endpoint and structured error responses

See [plan.md](./plan.md), [architecture.md](./architecture.md), and [design.md](./design.md) for the product blueprint.
