# API Sentinel — Delivery Plan

## Implementation status — 2026-08-10

API Sentinel is currently an **MVP in active development**, deployed as a Next.js dashboard, Fastify API, and BullMQ worker backed by PostgreSQL and Redis.

Distribution is self-hosting first: localhost and independent HTTPS deployments
must remain fully functional without relying on a central hosted service.

| Area | Status | Delivered behaviour |
| --- | --- | --- |
| Identity and access | Delivered | Account creation, sign-in, server-side session revocation, organization membership, invitations, and project-scoped RBAC. |
| OpenAPI workspace | Delivered | OpenAPI 3.x JSON import, immutable versions, API reference, version diff. |
| Manual API checks | Delivered | Collections, editable environments, encrypted secrets, configurable request payloads, assertions, and run history. |
| OpenAPI smoke generation | Delivered | Generate safe `GET` requests without path parameters from a reference. |
| Automation | Delivered | Durable worker execution, retries, cron schedules, and signed failure webhooks with delivery history. |
| CI distribution | Delivered | Collection runner CLI, deterministic exit codes, versioned JSON reports, and a GitHub Actions example. |

### Next engineering sequence

1. Complete worker/queue observability, broader audit coverage, accessibility
   checks, and load tests. Encrypted backups, guarded restore, isolated recovery
   rehearsal, active-run quotas, heartbeat-based stale recovery, bounded
   response reads, and expanded browser E2E are delivered.

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
2. OpenAPI 3.x JSON import, validation, and version history.
3. Readable API reference: endpoints, schemas, parameters, request bodies, and responses.
4. API test collections with requests, variables, assertions, and environments.
5. On-demand and scheduled test execution.
6. Breaking-change comparison between specification versions.
7. Run history, failure details, basic latency/error metrics, and webhook alerts.
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

- Establish the TypeScript workspace, linting, conventional commits, and CI.
- Add Docker Compose for PostgreSQL, Redis, API service, and worker.
- Implement authentication, organizations, projects, and RBAC.
- Create database migrations, structured logging, and consistent error responses.

**Exit condition:** a user can sign in, create a project, invite a member, and
run the system locally or behind the included HTTPS production ingress.

### M1 — Specification workspace — substantially delivered

- Implement pasted OpenAPI JSON import. **Delivered.** File upload and remote URL
  retrieval remain planned ingestion options.
- Validate the required OpenAPI 3.x document shape. **Delivered.** Full parser
  validation, reference resolution, and normalization remain planned.
- Persist immutable specification versions and extracted contract metadata.
- Build the specification list, version detail view, and browsable API reference.

**Exit condition:** a project has versioned, browsable API documentation with clear import failures.

### M2 — Test execution — substantially delivered

- Create collection, request, environment, and assertion models.
- Build a safe worker-based HTTP test runner with timeouts, retries, and redacted secrets.
- Support status, header, JSON-path, and response-time assertions.
- Display individual test and aggregate run results.

**Exit condition:** users can execute a saved collection on demand and diagnose a failed assertion.

### M3 — Automation and change safety — in progress

- Add cron-like schedules with retry policies and execution locking. **Delivered.**
- Compare two specification versions with a focused set of breaking and
  non-breaking rules. **Delivered.** Broader compatibility coverage remains planned.
- Create alert rules and generic webhook delivery with signed payloads and retry history. **Delivered.**
- Add email delivery and richer alert routing policies.
- Ship the CLI and a GitHub Actions example. **Delivered.**

**Exit condition:** a team can block a pull request or deployment on contract-test failure or a breaking API change.

### M4 — Production hardening — in progress

- Add audit logging and retention jobs. **Delivered for schedule, webhook, and retention configuration.**
- Add Redis-backed global/authentication rate limiting. **Delivered.**
- Add organization-scoped active-run quotas. **Delivered.** Usage budgets and
  per-request limits remain planned.
- Add worker heartbeats, stale-run recovery, and bounded target response reads.
  **Delivered.** User cancellation remains planned.
- Expand audit coverage beyond retention, schedule, and webhook configuration.
- Instrument API, worker, and external HTTP calls with OpenTelemetry.
- Add encrypted backups, guarded restore, isolated rehearsal, and recovery
  runbooks. **Delivered.** Off-host replication, managed point-in-time recovery,
  dashboards, and alerting remain operator/platform responsibilities.
- Complete accessibility, load, and broader integration tests. First-value,
  assertion-failure, viewer-RBAC, quota, and stale-recovery E2E paths are delivered.
- Serve production deployments through a custom domain with automatic HTTPS and private backend ports. **Delivered.**

Project-scoped 24-hour reliability metrics and cursor-paginated collection history are delivered as the first M4 observability increment.

**Exit condition:** the service has documented operational ownership and can safely support real team data.

## Repository layout

```text
apps/
  web/                 Next.js dashboard
  api/                 Fastify API, Prisma schema, and BullMQ worker entrypoint
  cli/                 CI-friendly command-line client
e2e/                   Playwright browser workflows
scripts/               Deployment and E2E orchestration
docker-compose*.yml    Local, development, production, and E2E stacks
.github/workflows/     Verification, E2E, and CLI workflow example
```

## Quality gates

- TypeScript strict mode; no unchecked `any` in application code.
- Unit tests for OpenAPI rules, assertions, encryption, redaction, retention,
  metrics, authentication primitives, webhooks, and quota decisions.
- Integration tests against PostgreSQL and Redis.
- Playwright covers sign-up/sign-in, revoked logout sessions,
  project/environment setup, OpenAPI import, passing and failing execution,
  viewer authorization, and active-run quota rejection. The isolated workflow
  then validates encrypted backup, confirmation/checksum guards, destructive
  restore, data preservation, and disposable-container rehearsal.
- Every pull request and push to `main`: linting, type checking, unit tests,
  production builds, shell validation, and isolated Chromium E2E.
- Dependency auditing, secret scanning, mandatory review, and protected release
  promotion remain repository-governance work rather than current CI claims.

## Initial success metrics

- A new user imports and views a valid OpenAPI document in under five minutes.
- A saved collection runs within 30 seconds for normal test sizes.
- Breaking-change detection produces an explainable result with endpoint and field context.
- Failed scheduled checks notify the configured channel within five minutes.
