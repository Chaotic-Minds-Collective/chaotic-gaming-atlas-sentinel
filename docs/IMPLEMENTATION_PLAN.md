# CMG Sentinel — Implementation Plan

## Purpose

Security, operational visibility and administrative coordination for every ATLAS grid.

## Feature scope

- Extended RCON with allowlisted typed commands and audit
- Admin/mod capabilities scoped by grid/server
- Health, heartbeat, player counts and telemetry
- Crash detection and recovery coordination
- Death/kill, ship, structure, tribe and rate alerts
- Suspicious activity detection and Discord relay
- Config drift and backup status

## Dependencies

- Core server registry, scoped RBAC, audit/outbox and plugin health
- ATLAS adapter: verified RCON/health/events
- Connect for alerts; Tribes for context
- Review existing [CMG ATLAS Admin Plugin](https://github.com/Chaotic-Minds-Collective/cmg-atlas-admin-plugin) backend and backup tools

## Data ownership

Core owns identities, scopes and durable events. Sentinel owns RCON policies, alerts, thresholds, incidents, health samples, restart policy and acknowledgements. Redact secrets.

## Milestones

1. Review admin/backup tools for reusable tested components.
2. Define allowlisted commands; begin read-only RCON only after its protocol and target server are verified.
3. Implement health/crash detection without auto-restart.
4. Add scoped admin/mod bridge and audited commands.
5. Add event alerts after native hooks are verified.
6. Consider restart automation only after recovery tests and explicit operational approval.

### Implemented server-independent foundation

- Schema-v1 event validation and classification for player deaths/kills, ship sinking, structure destruction and tame deaths.
- Deterministic alert IDs include cluster, grid, server, source event and rule identifiers.
- Alert records contain event metadata only; raw payloads and player details are not copied.
- Node.js syntax checks and unit tests run in GitHub Actions.

This milestone consumes the shared mock event contract. It does not establish that native ATLAS callbacks exist or that live events are being received.

### Implemented server-independent health classification

- Classifies normalized schema-v1 samples as healthy, degraded, offline or unknown.
- Defaults to a 90-second warning threshold and a 5-minute offline threshold; both are configurable.
- Validates scoped identifiers, strict timezone-qualified timestamps, state and non-negative player counts.
- Preserves an unavailable player count as null.
- Emits immutable metadata only; no polling, persistence, RCON, restart or notification behavior is implemented.

### Implemented Core heartbeat contract adapter

- Maps the Core `GET /servers` response fields (`id`, `gameKey`, `online`, `playerCount`, `lastHeartbeat`) into Sentinel's schema-v1 health sample.
- Preserves Core's five-minute stale-heartbeat projection: a stale `online: false` row remains age-classifiable instead of being treated as a fresh stopped signal.
- Requires explicit cluster/grid/server scope because the current Core listing omits cluster ID and provider grid ID.
- Uses deterministic fake response fixtures and has no network client or production endpoint access.

This is contract-level integration only. A one-shot HTTPS client for the public Core `GET /servers` endpoint is now implemented with bounded timeout, strict origin validation, no redirects, no retries and explicit scope mapping. It has mocked-fetch tests only; no live endpoint was contacted. Native ATLAS callbacks, live server compatibility and player-count telemetry remain unverified.

### Implemented read-only Core poller\n\n- Added a one-shot HTTPS GET client for Core's public `/servers` listing.\n- Enforces HTTPS origin-only configuration, a bounded timeout, JSON response validation, a 1,000-record ceiling, no-store caching and disabled redirects.\n- Requires an explicit scope resolver because the public response does not expose stable cluster/grid IDs.\n- Filters non-ATLAS records and maps ATLAS rows through the existing tested heartbeat adapter.\n- Does not retry, persist, authenticate, notify, invoke RCON or modify game state.\n- Added mocked-fetch contract tests; no live Core endpoint was contacted.\n\n## Technical gates and risks

- No arbitrary shell passthrough or command injection.
- Auto-restart disabled by default and not implemented.
- ATLAS death/ship/structure callbacks are not confirmed in Core.
- Exact server build, plugin loader, SDK, callbacks, threading model and operating system require isolated reproducible validation.
- Core's current public server listing does not provide all required health scope identifiers; do not infer cluster IDs from names or fabricate grid IDs.

## Shared engineering requirements

- Use authenticated, least-privilege Core APIs; no direct database credentials in plugins.
- Preserve provider identifiers as strings; display names are not identifiers.
- Carry cluster, grid and server context on applicable records/events.
- Use stable event IDs, idempotency keys and correlation IDs.
- Keep network work off game-critical threads; use bounded timeouts, retries and circuit breakers.
- Keep secrets out of source control and separate credentials per server/integration.
- Add unit tests, fake-adapter contract tests and isolated runtime compatibility tests.
- Gate unsupported features behind explicit capabilities; fail closed for privileged actions.
- Do not deploy to production or change live server configuration during repository planning.


### Implemented read-only Core health monitor lifecycle

- Added an explicitly started coordinator around the one-shot Core poller.
- Performs one immediate poll and then schedules configurable polling (60 seconds by default; bounded from 1 second to 1 hour).
- Prevents overlapping requests and shares the in-flight poll between timer ticks and manual poll requests.
- Delivers samples only while running; results completing after stop are discarded.
- Reports poll and sample-handler errors through an optional callback; a failing error reporter cannot break the polling lifecycle.
- Uses injected timer and poll functions for deterministic tests; no real Core endpoint or ATLAS server was contacted.

This remains an opt-in library component. It is not automatically started, does not persist samples or send alerts, and does not perform RCON or recovery actions.
