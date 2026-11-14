# CMG Sentinel

Security, operational visibility and administrative coordination for every ATLAS grid.

This Chaotic Minds Gaming (CMG) module extends [Chaotic Minds Gaming Core](https://github.com/Chaotic-Minds-Collective/cmg-atlas-core-plugin) and the [ATLAS integration adapter](https://github.com/Chaotic-Minds-Collective/cmg-atlas-plugin); it does not replace either foundation.

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

The second server-independent milestone adds `src/health.js`:

- Classifies normalized schema-v1 samples as healthy, degraded, offline or unknown.
- Uses configurable heartbeat warning/offline thresholds (90 seconds and 5 minutes by default).
- Carries cluster, grid and server scope into stable health sample IDs.
- Preserves a null player count as unavailable rather than inventing zero.

The Core contract milestone adds `src/core-heartbeat-adapter.js`:

- Maps the Core `GET /servers` response shape into Sentinel's normalized health sample.
- Distinguishes a fresh `online: false` observation from Core's five-minute stale-heartbeat projection.
- Requires explicit cluster, grid and server scope; Core's current public listing does not return cluster ID or provider grid ID.
- Uses a fake Core response in tests only; it performs no HTTP requests.

The read-only Core poller adds `src/core-poller.js`:\n\n- Performs one HTTPS GET to Core's public `/servers` endpoint with a bounded timeout, no-store caching and redirects disabled.\n- Requires an explicit caller-provided cluster/grid/server scope resolver; it does not infer stable IDs from display names.\n- Filters for ATLAS records, validates the response envelope and record count, and maps records through the tested heartbeat adapter.\n- Makes no retries, writes, authenticated requests, RCON calls or notifications.\n\nThese are read-only classifiers and contract adapters. The poller is a callable one-shot operation, not a scheduled monitor or production alert delivery service. A deployment still needs an approved Core origin, explicit scope mapping, secure runtime configuration and isolated connectivity validation.

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
- Review existing [CMG ATLAS Admin Plugin](https://github.com/Chaotic-Minds-Collective/cmg-atlas-admin-plugin) backend and backup tools

Core remains authoritative for shared identity, authorization and platform records. ATLAS-native calls pass through the shared adapter. This module owns its domain state and must not connect directly to PostgreSQL.

## Safety boundaries

- No arbitrary shell passthrough or command injection.
- Auto-restart is disabled and is not implemented.
- No production server, live Core endpoint, RCON endpoint or third-party Workshop content is accessed.
- Native ATLAS compatibility and feature-specific callbacks remain unverified; unsupported capabilities must remain disabled.
