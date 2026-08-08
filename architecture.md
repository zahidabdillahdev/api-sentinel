# API Sentinel — Architecture

## Current implementation versus target architecture

The repository currently runs `web` (Next.js), `api` (Fastify), and a separately scalable BullMQ `worker`, with private PostgreSQL and Redis dependencies. The API authorizes and queues runs; only the worker executes user-configured target requests.

| Capability | Current implementation | Target production design |
| --- | --- | --- |
| Execution | BullMQ worker with queue isolation and retries | Cancellation, quotas, and workload classes |
| State | Durable `QUEUED`/`RUNNING`/terminal state machine | Heartbeats and stale-run recovery |
| Secrets | AES-256-GCM environment secrets using a deployment key | Managed-key envelope encryption and rotation |
| Storage | PostgreSQL documents and results | PostgreSQL plus object storage for bounded artifacts |
| Notifications | Not supported yet | Webhook/email delivery with retries and audit trail |

Collection schedules use BullMQ Job Schedulers keyed by the database schedule ID. The worker creates a new durable execution per occurrence; a partial unique index blocks overlapping `QUEUED`/`RUNNING` executions for the same schedule.

### Current request path

```text
Browser → Next.js dashboard → Fastify API → PostgreSQL
                                  │
                                  └→ Redis queue → Worker → public target API
```

The API rejects loopback, private, link-local, and cloud-metadata targets. HTTPS is required by default; public HTTP is an explicit environment-level development/staging exception and never permits private-network targets.

## Technical choices

| Area | Choice | Reason |
| --- | --- | --- |
| Primary language | TypeScript | One type-safe language across web, API, worker, CLI, and shared contracts. |
| Web app | Next.js + React | Productive dashboard development, routing, server rendering, and mature ecosystem. |
| HTTP API | Fastify | Fast, schema-oriented Node.js API with low operational overhead. |
| Database | PostgreSQL | Reliable relational data, JSONB for specification documents, and strong indexing. |
| Queue / scheduler | Redis + BullMQ | Durable asynchronous work, retries, delayed jobs, and worker separation. |
| ORM / migrations | Prisma | Type-safe data access and repeatable schema migrations. |
| Validation | Zod + OpenAPI parser | Runtime validation at the boundary and predictable OpenAPI handling. |
| Observability | OpenTelemetry + Sentry | Portable traces/metrics plus actionable error monitoring. |

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

## Core domains

| Domain | Responsibilities |
| --- | --- |
| Identity | Users, sessions, organizations, invitations, roles, and audit events. |
| Projects | Project settings, environments, API ownership, retention, and quotas. |
| Specifications | Raw OpenAPI documents, validation, parsed endpoint metadata, versions, and comparisons. |
| Collections | Requests, variables, assertions, environments, and secrets references. |
| Executions | Queued runs, per-request results, retries, durations, and failure artifacts. |
| Automation | Schedules, alert policies, notifications, and delivery attempts. |

## Data model

```text
Organization 1---* Membership *---1 User
Organization 1---* Project
Project      1---* Environment
Project      1---* Specification 1---* SpecificationVersion
Project      1---* Collection 1---* TestRequest 1---* Assertion
Collection   1---* Schedule
ExecutionRun 1---* RequestResult 1---* AssertionResult
Project      1---* AlertRule 1---* NotificationDelivery
Organization 1---* AuditEvent
```

Important storage rules:

- Specification versions are immutable; each stores the original source and normalized document.
- Secrets are encrypted before persistence and never returned in plaintext after creation.
- Request and response bodies have configurable size and retention limits; sensitive headers and JSON paths are redacted before persistence.
- Execution data belongs to a project and is always queried through organization-scoped authorization.

## Target execution flow

1. A user, schedule, or CLI request asks the API to execute a collection.
2. The API authorizes access, writes an `ExecutionRun` in `queued` state, and enqueues only its ID.
3. The worker loads the run, resolves encrypted environment secrets, and executes requests with strict limits.
4. The test-runner evaluates assertions and stores redacted results incrementally.
5. The worker marks the run terminal, emits metrics, and evaluates matching alert rules.
6. The UI polls or receives a server-sent event update and renders the result.

## Breaking-change analysis

The diff engine normalizes two OpenAPI documents into a canonical endpoint and schema graph. It flags changes such as removed operations, removed response codes, newly required fields, narrowed enum values, incompatible type changes, removed parameters, and stricter validation constraints. Each finding has a severity, a stable identifier, a location, and a human explanation.

## Security boundaries

- Authenticate every API and CLI request; enforce organization/project role checks server-side.
- Use short-lived signed worker jobs, idempotency keys, and explicit request ownership.
- Block requests to loopback, link-local, private-network, and cloud metadata ranges by default to limit SSRF.
- Restrict redirects, DNS rebinding, response size, concurrency, request method, and execution duration.
- Encrypt secrets with a managed key; redact `Authorization`, cookies, API keys, and configurable values in logs/results.
- Rate-limit public endpoints, hash tokens, maintain audit trails, and validate all payloads.

## Reliability and operations

- API instances are stateless and scale horizontally; workers scale independently by queue concurrency.
- PostgreSQL is the system of record; Redis is disposable queue/cache infrastructure with monitored persistence.
- Jobs use exponential retry for transient failures, dead-letter handling for exhausted attempts, and idempotent result writes.
- Health endpoints cover API, database, Redis, and worker heartbeat. Alerts cover error rate, queue latency, failed jobs, and database capacity.
- Back up PostgreSQL daily with point-in-time recovery; test restoration before production launch.

## Deployment

Use separate containers for web, API, and worker. Deploy preview environments for pull requests, then promote immutable images to staging and production through GitHub Actions. Managed PostgreSQL, managed Redis, encrypted object storage, and a secret manager are required in production.
