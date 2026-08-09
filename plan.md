# API Sentinel — Delivery Plan

## Implementation status — 2026-08-09

API Sentinel is currently an **MVP in active development**, deployed as a Next.js dashboard, Fastify API, and BullMQ worker backed by PostgreSQL and Redis.

| Area | Status | Delivered behaviour |
| --- | --- | --- |
| Identity and access | Delivered | Register/login sessions, organization membership, invitations, project-scoped RBAC. |
| OpenAPI workspace | Delivered | OpenAPI 3.x JSON import, immutable versions, API reference, version diff. |
| Manual API checks | Delivered | Collections, environments, encrypted secrets, configurable request payloads, assertions, and run history. |
| OpenAPI smoke generation | Delivered | Generate safe `GET` requests without path parameters from a reference. |
| Automation | Delivered | Durable worker execution, retries, cron schedules, and signed failure webhooks with delivery history. |
| CI distribution | Delivered | Collection runner CLI, deterministic exit codes, versioned JSON reports, and a GitHub Actions example. |

### Next engineering sequence

1. Activate the prepared Caddy HTTPS overlay after the external DNS record points to the VPS.
2. Add request quotas, expanded integration/end-to-end coverage, and operational runbooks; Redis-backed rate limiting is delivered.

## Product goal

API Sentinel is a team workspace for importing OpenAPI specifications, running API and contract checks, detecting breaking changes, and tracking API reliability over time. It gives backend engineers, QA, platform teams, and API consumers one reliable view of API quality.

## Target users

| User | Primary job |
| --- | --- |
| Backend engineer | Publish an API specification and catch breaking changes before release. |
| QA engineer | Build, run, and review repeatable API test suites. |
| DevOps / platform engineer | Schedule health checks and receive actionable alerts. |
| Engineering lead | Understand API reliability, change risk, and ownership. |

## Release 1 target scope

1. Organization, project, and member management with role-based access control.
2. OpenAPI 3.x import from file or URL, validation, and version history.
3. Readable API reference: endpoints, schemas, parameters, request bodies, and responses.
4. API test collections with requests, variables, assertions, and environments.
5. On-demand and scheduled test execution.
6. Breaking-change comparison between specification versions.
7. Run history, failure details, basic latency/error metrics, and email/webhook alerts.
8. A CLI for running a collection in CI and reporting a machine-readable result.

## Explicitly deferred

- API gateway or traffic proxying
- Full distributed tracing and log ingestion
- Visual no-code test builder beyond the initial request editor
- Native mobile application
- Marketplace integrations beyond GitHub Actions and generic webhooks
- AI-generated tests; this can be an optional later enhancement, not a dependency

## Milestones

### M0 — Foundation — substantially delivered

- Establish TypeScript monorepo, linting, formatting, conventional commits, and CI.
- Add Docker Compose for PostgreSQL, Redis, API service, and worker.
- Implement authentication, organizations, projects, and RBAC.
- Create database migrations, seed data, structured logging, and error reporting.

**Exit condition:** a user can sign in, create a project, invite a member, and run the system locally and in a preview environment.

### M1 — Specification workspace — substantially delivered

- Implement OpenAPI upload and URL import.
- Validate and normalize OpenAPI 3.x documents.
- Persist immutable specification versions and parsed endpoint metadata.
- Build the specification list, version detail page, and searchable API reference.

**Exit condition:** a project has versioned, browsable API documentation with clear import failures.

### M2 — Test execution — substantially delivered

- Create collection, request, environment, and assertion models.
- Build a safe worker-based HTTP test runner with timeouts, retries, and redacted secrets.
- Support status, header, JSON-path, and response-time assertions.
- Display individual test and aggregate run results.

**Exit condition:** users can execute a saved collection on demand and diagnose a failed assertion.

### M3 — Automation and change safety — in progress

- Add cron-like schedules with retry policies and execution locking. **Delivered.**
- Compare two specification versions and classify breaking changes.
- Create alert rules and generic webhook delivery with signed payloads and retry history. **Delivered.**
- Add email delivery and richer alert routing policies.
- Ship the CLI and a GitHub Actions example. **Delivered.**

**Exit condition:** a team can block a pull request or deployment on contract-test failure or a breaking API change.

### M4 — Production hardening — in progress

- Add audit logging and retention jobs. **Delivered for schedule, webhook, and retention configuration.**
- Add Redis-backed global/authentication rate limiting. **Delivered.**
- Add request quotas and expanded audit coverage.
- Instrument API, worker, and external HTTP calls with OpenTelemetry.
- Add backups, restore rehearsal, dashboards, and runbooks.
- Complete accessibility, load, integration, and end-to-end tests.

Project-scoped 24-hour reliability metrics and cursor-paginated collection history are delivered as the first M4 observability increment.

**Exit condition:** the service has documented operational ownership and can safely support real team data.

## Repository layout

```text
apps/
  web/                 Next.js dashboard
  api/                 Fastify HTTP API
  worker/              BullMQ execution and scheduled-job worker
  cli/                 CI-friendly command-line client
packages/
  contracts/           Shared API schemas and generated types
  openapi/             Parsing, validation, and diff engine
  test-runner/         Request execution and assertion engine
  ui/                  Reusable accessible React components
  config/              Shared ESLint, TypeScript, and test configuration
infra/
  docker/              Local runtime files
  github/              CI workflows and action examples
docs/
```

## Quality gates

- TypeScript strict mode; no unchecked `any` in application code.
- Unit tests for parsers, diff classification, assertion evaluation, and authorization.
- Integration tests against PostgreSQL and Redis.
- Playwright coverage for sign-in, import, test execution, and failure review.
- Every pull request: formatting, linting, type checking, tests, build, dependency audit, and secret scan.
- Main branch releases only from a passing, reviewed pull request.

## Initial success metrics

- A new user imports and views a valid OpenAPI document in under five minutes.
- A saved collection runs within 30 seconds for normal test sizes.
- Breaking-change detection produces an explainable result with endpoint and field context.
- Failed scheduled checks notify the configured channel within five minutes.
