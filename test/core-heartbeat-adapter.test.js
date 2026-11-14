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

function makeSample(server) {
  return createCoreServerHealthSample(server, scope, { now });
}

function classify(server, thresholds) {
  return classifyServerHealth(makeSample(server), { now, thresholds });
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
  const sample = makeSample(coreServer({ online: false }));
  assert.equal(sample.state, "stopped");
  assert.equal(classifyServerHealth(sample, { now }).status, "offline");
});

test("does not misread Core's stale-heartbeat projection as a fresh stop", () => {
  const sample = makeSample(coreServer({
    online: false,
    playerCount: null,
    lastHeartbeat: "2026-11-14T11:54:59.999Z"
  }));
  assert.equal(sample.state, "running");
  assert.equal(classifyServerHealth(sample, { now }).status, "offline");
});

test("matches Core's strict five-minute stale projection boundary", () => {\n  const atBoundary = makeSample(coreServer({\n    online: false,\n    lastHeartbeat: "2026-11-14T11:55:00.000Z"\n  }));\n  assert.equal(atBoundary.state, "stopped");\n\n  const afterBoundary = makeSample(coreServer({\n    online: false,\n    lastHeartbeat: "2026-11-14T11:54:59.999Z"\n  }));\n  assert.equal(afterBoundary.state, "running");\n});\n\ntest("keeps a missing heartbeat unknown", () => {
  const result = classify(coreServer({
    online: false,
    playerCount: null,
    lastHeartbeat: null
  }));
  assert.equal(result.status, "unknown");
  assert.equal(result.heartbeatAt, null);
});

test("preserves nullable player counts at the health classifier boundary", () => {
  const sample = makeSample(coreServer({ playerCount: null }));
  assert.equal(classifyServerHealth(sample, {
    now,
    thresholds: { warningAfterMs: 120_000, offlineAfterMs: 240_000 }
  }).playerCount, null);
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
  assert.throws(() => createCoreServerHealthSample(coreServer({
    lastHeartbeat: "2026-02-30T11:59:30.000Z"
  }), scope, { now }), /lastHeartbeat/);
  assert.throws(() => createCoreServerHealthSample(coreServer(), scope, { now: "later" }), /now/);
  assert.throws(() => createCoreServerHealthSample(coreServer({
    lastHeartbeat: "2026-11-14T12:00:01.000Z"
  }), scope, { now }), /later than now/);
});

test("does not mutate Core response or caller scope", () => {
  const server = coreServer();
  const originalServer = structuredClone(server);
  const originalScope = structuredClone(scope);
  makeSample(server);
  assert.deepEqual(server, originalServer);
  assert.deepEqual(scope, originalScope);
});

test("returns frozen sample and scope", () => {
  const sample = makeSample(coreServer());
  assert.ok(Object.isFrozen(sample));
  assert.ok(Object.isFrozen(sample.scope));
});
