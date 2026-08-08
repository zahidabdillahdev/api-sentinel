# API Sentinel — Product and UI Design

## Current product surface

The live MVP is intentionally a single workspace page while the information architecture below is the target navigation model. It currently supports account creation, organization/project selection, OpenAPI import/reference/version comparison, collection editing, on-demand runs, assertion feedback, run history, and OpenAPI-generated smoke tests.

### Current first-value workflow

```text
Create organization/project
          ↓
Import OpenAPI 3.x JSON
          ↓
Open API reference
          ↓
Provide public base URL → generate eligible GET smoke tests
          ↓
Run collection → inspect assertion result and history
```

### Deliberate MVP constraints

- Smoke generation skips write methods and paths containing `{parameters}`.
- A collection supports custom headers/body plus write-only environment secrets; a richer request composer and managed-key rotation UX remain planned.
- History shows the ten most recent runs in the workspace; pagination and metrics belong to the next dashboard iteration.
- Collections support cron schedules with IANA timezones and explicit active/paused states.
- The UI uses English product labels today; localization should be planned rather than added piecemeal.

## Product principles

1. **Explain failures, not just statuses.** A red result must say what changed or what assertion failed, where, and what to do next.
2. **Keep the happy path fast.** Importing a specification and launching a first test should feel direct, not like configuring an enterprise suite.
3. **Treat API data as sensitive.** Make redaction, ownership, and visibility understandable in the interface.
4. **Progressive disclosure.** Beginners see sensible defaults; advanced options are available without crowding core workflows.
5. **Developer-native.** Respect familiar concepts: environments, collections, HTTP methods, JSON, diffs, exit codes, and CI.

## Target information architecture

```text
Organization switcher
└── Project
    ├── Overview
    ├── Specifications
    │   ├── API reference
    │   ├── Versions
    │   └── Changes
    ├── Test collections
    │   ├── Collection editor
    │   ├── Runs
    │   └── Schedules
    ├── Environments
    ├── Alerts
    ├── Members
    └── Project settings
```

## Primary workflows

### First value

1. User creates a project and names its API.
2. User uploads an OpenAPI file or enters a public/private URL.
3. The import screen validates it, shows errors inline, and presents a concise endpoint summary.
4. User lands on the API reference with a prompt to create a collection from an endpoint.
5. User supplies a base URL/environment and runs the generated request.
6. The result page shows pass/fail, duration, response details, and a next action.

### Review a breaking change

1. User opens **Specifications → Changes** and selects two versions.
2. Findings are grouped by severity: breaking, potentially breaking, and non-breaking.
3. Selecting a finding opens a side-by-side before/after view with endpoint and schema context.
4. The user can acknowledge a finding, link it to an issue, or export its CI-friendly report.

### Diagnose a failing scheduled test

1. An alert links directly to the failed execution run.
2. The run page highlights the first failure and shows the expected vs. actual value.
3. The user can inspect redacted request/response details, compare with a previous passing run, and rerun after a fix.

## Key screens

| Screen | Purpose | Essential content |
| --- | --- | --- |
| Overview | Health at a glance | Pass rate, recent failures, latest spec change, scheduled checks, quick actions. |
| Specification import | Controlled ingestion | Source selector, upload/URL input, validation progress, errors, preview, version note. |
| API reference | Discover and understand APIs | Endpoint navigation, method badges, auth requirements, parameters, schemas, examples. |
| Collection editor | Define repeatable checks | Request composer, variable picker, assertions, environment selector, run button. |
| Run detail | Resolve a result | Summary, timeline, per-request status, expected/actual diff, redacted payload tabs. |
| Change report | Assess compatibility | Version controls, severity filters, grouped findings, before/after comparison. |
| Alerts | Control notification noise | Rules, channels, threshold/schedule settings, delivery history. |

## Layout and interaction

- Use a persistent left project navigation on desktop and a compact drawer on small screens.
- Place the project name, environment, and primary action in a concise top bar.
- Use a two-pane layout for documentation and run inspection: navigation/list on the left, detail on the right.
- Preserve URL state for selected project, collection, run, version comparison, and filters so results are linkable.
- Autosave collection edits with a visible saved state; require confirmation only for destructive actions.
- Make long-running runs observable: queued, running, retrying, passed, failed, cancelled, and timed out are distinct states.

## Visual system

Use a quiet, high-contrast technical interface: neutral surfaces, one blue action color, and semantic status colors only where they convey meaning.

| Token | Intent |
| --- | --- |
| Blue | Primary action, selected navigation, active links. |
| Green | Passing result or healthy state. |
| Amber | Warning, retry, or potentially breaking change. |
| Red | Failure, breaking change, destructive action. |
| Gray | Supporting metadata and inactive controls. |

- Show HTTP methods as compact, consistent badges: `GET`, `POST`, `PUT`, `PATCH`, and `DELETE`.
- Use monospace only for code, URLs, JSON, headers, exit codes, and identifiers.
- Prefer labelled icons for unfamiliar actions; tooltips supplement, not replace, text.
- Support light and dark themes from the start through semantic design tokens.

## Accessibility and responsive requirements

- Meet WCAG 2.2 AA contrast, focus visibility, keyboard navigation, form labels, and error announcements.
- Do not communicate a result using color alone; pair it with icon and text such as “Failed”.
- Make code and JSON panes horizontally scrollable without breaking page layout.
- Ensure the core actions—import, inspect docs, start a run, read failures—work at 320 px width.
- Respect reduced-motion preferences and avoid auto-refresh behavior that disrupts keyboard focus.

## Empty and error states

- A new project guides the user to import its first specification; it never displays a blank analytics dashboard.
- Invalid OpenAPI imports identify the document location and suggest a fix without discarding the original input.
- No test runs shows a compact explanation and an action to create a collection.
- A network or service failure keeps the last successful result visible and offers a retry with an incident/reference ID.

## Design deliverables before implementation

1. Low-fidelity flows for import, collection creation, run inspection, and spec comparison.
2. Responsive high-fidelity screens for the seven key screens above.
3. A small component library: buttons, inputs, select, modal, table, status badge, alert, tabs, code block, and diff view.
4. Usability test with at least five developers, measuring time-to-first-import and ability to explain a failed test.
