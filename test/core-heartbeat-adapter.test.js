import test from "node:test";
import assert from "node:assert/strict";
import { createCoreServerHealthSample } from "../src/core-heartbeat-adapter.js";
import { classifyServerHealth } from "../src/health.js";

const now = "2026-11-14T12:00:00.000Z";
const scope = {
  clusterId: "cluster-uuid",
  gridId: "atlas-grid-1",
  serverId: "server-uuid"
};

function coreServer(overrides = {}) {
  return {
    id: scope.serverId,
    gameKey: "atlas",
    online: true,
    playerCount: 8,
    lastHeartbeat: "2026-11-14T11:59:30.000Z",
    ...overrides
  };
}

function classify(server, options = {}) {
  const sample = createCoreServerHealthSample(server, scope, { now, ...options });
  return classifyServerHealth(sample, { now });
}

test("maps a fresh Core ATLAS heartbeat to a healthy Sentinel sample", () => {
  const result = classify(coreServer());
  assert.equal(result.status, "healthy");
  assert.equal(result.playerCount, 8);
  assert.equal(result.heartbeatAgeMs, 30_000);
  assert.deepEqual(result.scope, scope);
});

test("preserves an unavailable player count instead of inventing zero", () => {
  const result = classify(coreServer({ playerCount: null }));
  assert.equal(result.status, "healthy");
  assert.equal(result.playerCount, null);
});

test("maps a fresh explicit offline heartbeat to offline", () => {
  assert.equal(classify(coreServer({ online: false })).status, "offline");
});

test("maps Core's stale-heartbeat online=false projection by heartbeat age", () => {
  const stale = coreServer({
    online: false,
    playerCount: null,
    lastHeartbeat: "2026-11-14T11:54:59.999Z"
  });
  assert.equal(classify(stale).status, "offline");
});

test("keeps a missing heartbeat unknown", () => {
  const result = classify(coreServer({
    online: false,
    playerCount: null,
    lastHeartbeat: null
  }));
  assert.equal(result.status, "unknown");
  assert.equal(result.heartbeatAt, null);
});

test("honors an explicit offline threshold for stale-heartbeat projection", () => {
  const stale = coreServer({
    online: false,
    lastHeartbeat: "2026-11-14T11:59:00.000Z"
  });
  assert.equal(classify(stale, { offlineAfterMs: 120_000 }).status, "offline");
  assert.equal(classify(stale, { offlineAfterMs: 300_000 }).status, "offline");
});

test("rejects mismatched server scope and unsupported game records", () => {
  assert.throws(() => createCoreServerHealthSample(coreServer(), {
    ...scope, serverId: "another-server"
  }, { now }), /scope.serverId/);
  assert.throws(() => createCoreServerHealthSample(
    coreServer({ gameKey: "7dtd" }), scope, { now }
  ), /gameKey/);
});

test("rejects malformed Core records and timestamps", () => {
  assert.throws(() => createCoreServerHealthSample(null, scope, { now }), /server/);
  assert.throws(() => createCoreServerHealthSample(coreServer({ online: "true" }), scope, { now }), /online/);
  assert.throws(() => createCoreServerHealthSample(coreServer({ playerCount: -1 }), scope, { now }), /playerCount/);
  assert.throws(() => createCoreServerHealthSample(coreServer({ lastHeartbeat: "yesterday" }), scope, { now }), /lastHeartbeat/);
  assert.throws(() => createCoreServerHealthSample(coreServer(), scope, { now: "later" }), /now/);
  assert.throws(() => createCoreServerHealthSample(coreServer({
    lastHeartbeat: "2026-11-14T12:00:01.000Z"
  }), scope, { now }), /later than now/);
});

test("does not mutate Core response or caller scope", () => {
  const server = coreServer();
  const originalServer = structuredClone(server);
  const originalScope = structuredClone(scope);
  createCoreServerHealthSample(server, scope, { now });
  assert.deepEqual(server, originalServer);
  assert.deepEqual(scope, originalScope);
});

test("returns frozen sample and scope", () => {
  const sample = createCoreServerHealthSample(coreServer(), scope, { now });
  assert.ok(Object.isFrozen(sample));
  assert.ok(Object.isFrozen(sample.scope));
});
