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

The API starts at `http://localhost:3001`. Its interactive API documentation is at `/documentation`.

## MVP capabilities

- Organizations, projects, and project-scoped access controls
- OpenAPI 3.0/3.1 validation and immutable version imports
- Breaking-change reports between specification versions
- Collection test execution with safe outbound-request controls
- Health endpoint and structured error responses

See [plan.md](./plan.md), [architecture.md](./architecture.md), and [design.md](./design.md) for the product blueprint.
