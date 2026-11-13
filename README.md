# CMG Sentinel

Security, operational visibility and administrative coordination for every ATLAS grid.

This Chaotic Minds Gaming-specific module extends [Chaotic Gaming Core](https://github.com/Chaotic-Minds-Collective/chaotic-gaming-core) and the [ATLAS integration adapter](https://github.com/Chaotic-Minds-Collective/chaotic-gaming-atlas); it does not replace either foundation.

## Feature scope

- Extended RCON with allowlisted typed commands and audit
- Admin/mod capabilities scoped by grid/server
- Health, heartbeat, player counts and telemetry
- Crash detection and recovery coordination
- Death/kill, ship, structure, tribe and rate alerts
- Suspicious activity detection and Discord relay
- Config drift and backup status

## Current implementation

The first server-independent milestone is implemented in `src/index.js`:

- Classifies schema-v1 normalized ATLAS events into deterministic, metadata-only alerts.
- Includes initial rules for player deaths/kills, ship sinking, structure destruction and tame deaths.
- Qualifies alert IDs with cluster, grid, server, source event and rule identifiers.
- Rejects malformed or unsupported event envelopes.
- Does not copy event payloads into alerts or perform network, RCON, notification or game-state actions.

This is an event-classification foundation using the shared mock event vocabulary. It is not live telemetry, a native ATLAS callback integration, or a production alert delivery service.

## Development

Requires Node.js 22 or newer.

```sh
npm run check
npm test
```

GitHub Actions runs the same checks for relevant pushes and pull requests.

## Architecture and dependencies

- Core server registry, scoped RBAC, audit/outbox and plugin health
- ATLAS adapter: verified RCON/health/events
- Connect for alerts; Tribes for context
- Review existing chaotic-atlas-admin backend and backup tools

Core remains authoritative for shared identity, authorization and platform records. ATLAS-native calls pass through the shared adapter. This module owns its domain state and must not connect directly to PostgreSQL.

## Safety boundaries

- No arbitrary shell passthrough or command injection.
- Auto-restart is disabled and is not implemented.
- No production server, live Core endpoint, RCON endpoint or third-party Workshop content is accessed.
- Native ATLAS compatibility and feature-specific callbacks remain unverified; unsupported capabilities must remain disabled.
