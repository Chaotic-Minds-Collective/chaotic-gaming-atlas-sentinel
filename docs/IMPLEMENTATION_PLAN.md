# CG Sentinel — Implementation Plan

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
- Review existing chaotic-atlas-admin backend and backup tools

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
- Emits immutable metadata only; no polling, persistence, RCON, restart or notification behavior is implemented.

This is a pure classifier only. A verified adapter and isolated runtime test are still required before describing it as live server monitoring.

## Technical gates and risks

- No arbitrary shell passthrough or command injection.
- Auto-restart disabled by default and not implemented.
- ATLAS death/ship/structure callbacks are not confirmed in Core.
- Exact server build, loader, SDK, callbacks, threading model and operating system require isolated reproducible validation.

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
