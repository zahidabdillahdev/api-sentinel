# API Sentinel — Architecture

## Current implementation versus target architecture

The repository currently runs `web` (Next.js), `api` (Fastify), and a separately scalable BullMQ `worker`, with private PostgreSQL and Redis dependencies. The API authorizes and queues runs; only the worker executes user-configured target requests.

The architecture is deployment-independent. Local Docker and self-hosted
installations run the same services and own their own PostgreSQL data. An
installation has no dependency on a central hosted service.

| Capability | Current implementation | Target production design |
| --- | --- | --- |
| Execution | BullMQ worker, retries, and atomic organization active-run quota | Cancellation, usage budgets, and workload classes |
| State | Durable `QUEUED`/`RUNNING`/terminal state machine | Heartbeats and stale-run recovery |
| Secrets | AES-256-GCM environment secrets using a deployment key | Managed-key envelope encryption and rotation |
| Storage | PostgreSQL documents and results | PostgreSQL plus object storage for bounded artifacts |
| Notifications | Encrypted generic failure webhooks with retry history | Email channels, routing policies, and dead-letter replay |

Collection schedules use BullMQ Job Schedulers keyed by the database schedule ID. The worker creates a new durable execution per occurrence; a partial unique index blocks overlapping `QUEUED`/`RUNNING` executions for the same schedule.

Notification rules belong to a collection. The worker evaluates enabled rules after a terminal failed run, decrypts the endpoint only in memory, signs a stable minimal payload with HMAC-SHA256 when configured, and persists one delivery record per attempt. Stable event IDs let consumers deduplicate retries.

Active-run admission is scoped to an organization. API-triggered and scheduled
runs acquire a PostgreSQL transaction advisory lock, count `QUEUED` and
`RUNNING` executions, and admit work only below the configured limit. This
keeps the quota consistent across API replicas and workers without relying on
process-local counters.

Project overview metrics are computed from PostgreSQL on demand with project-scoped relation filters. Run history uses stable execution IDs as cursors, validates that every cursor belongs to the authorized collection, and keeps payload size bounded with a maximum page size of 50.

An idempotent BullMQ Job Scheduler triggers retention cleanup daily. Each project has an allow-listed retention period; cleanup filters by project, terminal status, and `finishedAt` cutoff so active jobs cannot be removed. Configuration changes write project-scoped audit events through a single helper, and read pagination validates cursor ownership.

### Current request path

```text
Browser → Next.js dashboard → Fastify API → PostgreSQL
                                  │
                                  └→ Redis queue → Worker → public target API
                                                        └→ webhook endpoint
```

The API rejects loopback, private, link-local, and cloud-metadata targets. HTTPS is required by default; public HTTP is an explicit deployment-level development/staging exception and never permits private-network targets.

Fastify enforces a 2 MiB body ceiling and Redis-backed per-IP rate limits, with stricter authentication-route limits. Proxy-derived client addresses are trusted only when the explicit production proxy setting is enabled.

## Technical choices

| Area | Choice | Reason |
| --- | --- | --- |
| Primary language | TypeScript | One type-safe language across web, API, worker, CLI, and shared contracts. |
| Web app | Next.js + React | Productive dashboard development, routing, server rendering, and mature ecosystem. |
| HTTP API | Fastify | Fast, schema-oriented Node.js API with low operational overhead. |
| Database | PostgreSQL | Reliable relational data, JSONB for specification documents, and strong indexing. |
| Queue / scheduler | Redis + BullMQ | Durable asynchronous work, retries, delayed jobs, and worker separation. |
| ORM / migrations | Prisma | Type-safe data access and repeatable schema migrations. |
| Validation | Zod plus focused OpenAPI helpers | Runtime request validation and explicit MVP contract rules. |
| Observability | Structured Pino logs | Portable tracing and error monitoring remain target capabilities. |

## Target system context

```text
Browser / CLI
     |
     v
Next.js web app -------> Fastify API -------> PostgreSQL
                             |                   |
                             v                   v
                          Redis queue        Object storage
                             |
                             v
                        Worker service -------> Target APIs
                             |
                             v
                    Email / webhook providers
```

The API service owns authentication, authorization, configuration, and synchronous reads/writes. The worker is the only component that executes untrusted user-configured HTTP requests and scheduled work. This separation keeps slow or failing target APIs from degrading the user-facing API.

The repository-local CLI is a thin API client: it never executes target requests directly. It queues an authorized collection run, polls its durable state, emits a versioned JSON report, and maps terminal outcomes to deterministic process exit codes for CI systems.

## Core domains

| Domain | Responsibilities |
| --- | --- |
| Identity | Users, sessions, organizations, invitations, roles, and audit events. |
| Projects | Project settings, environments, API ownership, retention, and quotas. |
| Specifications | Raw OpenAPI documents, validation, parsed endpoint metadata, versions, and comparisons. |
| Collections | Requests, variables, assertions, environments, and secrets references. |
| Executions | Queued runs, per-request results, retries, durations, and failure details. |
| Automation | Schedules, alert policies, notifications, and delivery attempts. |

## Data model

```text
Organization 1---* Membership *---1 User
Organization 1---* Project
Project      1---* Environment
Project      1---* AuditEvent *---0..1 User
Project      1---* Specification 1---* SpecificationVersion
Project      1---* Collection 1---* TestRequest
Collection   1---* Schedule
ExecutionRun 1---* RequestResult *---1 TestRequest
TestRequest  1---* StatusAssertion
Collection   1---* NotificationRule 1---* WebhookDelivery *---1 ExecutionRun
```

Important storage rules:

- Specification versions are immutable and store the imported JSON document
  plus extracted title and API version metadata.
- Secrets are encrypted before persistence and never returned in plaintext after creation.
- Target response bodies and headers are not persisted; results retain status,
  duration, pass/fail state, and redacted error text.
- Execution data belongs to a project through its collection and read routes
  enforce organization-scoped authorization.
- Audit metadata excludes encrypted values and write-only secret material.

## Target execution flow

1. A user, schedule, or CLI request asks the API to execute a collection.
2. The API authorizes access, writes an `ExecutionRun` in `queued` state, and enqueues only its ID.
3. The worker loads the run, resolves encrypted environment secrets, and executes requests with strict limits.
4. The test-runner evaluates assertions and stores redacted results incrementally.
5. The worker marks the run terminal, emits metrics, and evaluates matching alert rules.
6. The UI polls or receives a server-sent event update and renders the result.

## Current breaking-change analysis

The focused diff engine compares operations and component schemas. It detects
removed operations, response codes, parameters, and schemas; newly required
parameters and schema properties; and newly added operations. Each finding has
a severity, stable code, location, and explanation. Reference resolution,
canonical normalization, enum narrowing, type compatibility, and constraint
analysis remain planned.

## Current security boundaries

- Authenticate every API and CLI request; enforce organization/project role checks server-side.
- Block requests to loopback, link-local, private-network, and cloud metadata ranges by default to limit SSRF.
- Reject redirects, preflight DNS results, require HTTPS by default, and enforce
  a ten-second execution timeout.
- Encrypt write-only secrets with a deployment key and redact resolved values
  from persisted execution errors.
- Rate-limit public endpoints, hash tokens, maintain audit trails, and validate all payloads.
- Serialize organization quota admission in PostgreSQL before adding work to the queue.

Managed-key rotation, DNS pinning, bounded response reads, cancellation, and
signed/idempotent worker job envelopes remain planned hardening work.

## Current reliability and operations

- API state is externalized to PostgreSQL and Redis; the worker has independent
  queue concurrency.
- PostgreSQL is the system of record. Redis carries rate-limit state, queues,
  schedules, and maintenance jobs.
- Jobs use bounded exponential retries and retain failed queue entries for
  diagnosis.
- The health endpoint verifies the API process and PostgreSQL connection.

Worker heartbeats, stale-run recovery, queue/database dashboards, alerting,
automated backups, point-in-time recovery, and restore rehearsals remain the
next operational milestone.

## Deployment

The repository ships separate web, API, and worker containers plus PostgreSQL,
Redis, and Caddy Compose services. Preview environments, image promotion,
managed data services, and secret-manager integration are recommended future
deployment improvements rather than current repository automation.

The included production Compose overlay adds Caddy as the TLS boundary and removes direct API/web host ports. Caddy uses one same-origin hostname, sends API/documentation paths to Fastify, sends application paths to Next.js, persists ACME material, and emits structured access logs. New installations must activate DNS before starting this overlay.

The repository deployment command is a fail-fast release gate: it validates the
merged Compose model, builds immutable API/web images with production arguments,
deploys migrations before services, checks public HTTPS readiness, and scans the
browser bundle to reject an accidentally embedded localhost API endpoint.

Browser E2E uses a separate Compose project, network, PostgreSQL volume, and
host ports. Chromium verifies the first-value workflow through the UI while the
real worker processes the queued run; teardown removes only the isolated test
resources. CI therefore exercises the same service boundaries as a self-hosted
installation without depending on an external environment.
