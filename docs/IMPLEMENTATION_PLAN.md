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
1. Review admin/backup tools for reusable tested components
2. Define allowlisted commands; begin read-only RCON
3. Implement health/crash detection without auto-restart
4. Add scoped admin/mod bridge and audited commands
5. Add event alerts after hooks verified
6. Consider restart automation only after recovery tests

## Technical gates and risks
- No arbitrary shell passthrough or command injection
- Auto-restart disabled by default
- ATLAS death/ship/structure callbacks not confirmed in Core

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

## Current readiness
Documentation and planning scaffold. Exact ATLAS server build, loader, SDK, callbacks and feature-specific capabilities require isolated reproducible validation.
