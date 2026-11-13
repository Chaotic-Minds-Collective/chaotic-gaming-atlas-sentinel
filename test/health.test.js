import test from "node:test";
import assert from "node:assert/strict";
import { classifyServerHealth } from "../src/health.js";

const scope = {
  clusterId: "cluster-1",
  gridId: "A1",
  serverId: "server-1"
};

function sample(overrides = {}) {
  return {
    schemaVersion: 1,
    sampledAt: "2026-11-13T18:00:00.000Z",
    heartbeatAt: "2026-11-13T17:59:30.000Z",
    state: "running",
    playerCount: 12,
    scope,
    ...overrides
  };
}

test("classifies a recent running heartbeat as healthy", () => {
  const result = classifyServerHealth(sample());
  assert.equal(result.status, "healthy");
  assert.equal(result.heartbeatAgeMs, 30_000);
  assert.equal(result.playerCount, 12);
});

test("classifies delayed and expired heartbeats using configurable thresholds", () => {
  const delayed = classifyServerHealth(sample(), {
    now: "2026-11-13T18:02:00.000Z"
  });
  const offline = classifyServerHealth(sample(), {
    now: "2026-11-13T18:06:00.000Z"
  });
  assert.equal(delayed.status, "degraded");
  assert.equal(offline.status, "offline");
});

test("reports stopped servers as offline and unknown or missing heartbeats as unknown", () => {
  assert.equal(classifyServerHealth(sample({ state: "stopped" })).status, "offline");
  assert.equal(classifyServerHealth(sample({ state: "unknown" })).status, "unknown");
  assert.equal(classifyServerHealth(sample({ heartbeatAt: null })).status, "unknown");
});

test("qualifies health IDs by cluster, grid, server and sample time", () => {
  const first = classifyServerHealth(sample());
  const second = classifyServerHealth(sample({
    scope: { ...scope, serverId: "server-2" }
  }));
  assert.notEqual(first.healthId, second.healthId);
  assert.equal(first.healthId, classifyServerHealth(sample()).healthId);
});

test("escapes delimiters in health ID components", () => {
  const first = classifyServerHealth(sample({
    scope: { clusterId: "A:B", gridId: "C", serverId: "D" }
  }));
  const second = classifyServerHealth(sample({
    scope: { clusterId: "A", gridId: "B:C", serverId: "D" }
  }));
  assert.notEqual(first.healthId, second.healthId);
});

test("rejects malformed samples, timestamps, counters and thresholds", () => {
  assert.throws(() => classifyServerHealth(null), /sample must be an object/);
  assert.throws(() => classifyServerHealth(sample({ schemaVersion: 2 })), /schemaVersion/);
  assert.throws(() => classifyServerHealth(sample({ state: "restarting" })), /state/);
  assert.throws(() => classifyServerHealth(sample({ playerCount: -1 })), /playerCount/);
  assert.throws(() => classifyServerHealth(sample({ sampledAt: "later" })), /sampledAt/);
  assert.throws(() => classifyServerHealth(sample({ sampledAt: "2026-02-30T18:00:00Z" })), /sampledAt/);
  assert.throws(() => classifyServerHealth(sample(), null), /options/);
  assert.throws(() => classifyServerHealth(sample({ heartbeatAt: "later" })), /heartbeatAt/);
  assert.throws(() => classifyServerHealth(sample(), {
    now: "2026-11-13T18:00:00.000Z",
    thresholds: { warningAfterMs: 300_000, offlineAfterMs: 90_000 }
  }), /offlineAfterMs/);
  assert.throws(() => classifyServerHealth(sample(), {
    now: "2026-11-13T17:00:00.000Z"
  }), /cannot be later/);
});

test("does not mutate the source sample", () => {
  const input = sample();
  const before = structuredClone(input);
  classifyServerHealth(input);
  assert.deepEqual(input, before);
});

test("returns immutable metadata and no transport or control fields", () => {
  const result = classifyServerHealth(sample());
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.scope));
  assert.equal("payload" in result, false);
  assert.equal("command" in result, false);
  assert.equal("restart" in result, false);
});
