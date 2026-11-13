import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateSentinelEvent,
  SENTINEL_DEFAULT_RULES,
  SENTINEL_SUPPORTED_EVENT_TYPES
} from "../src/index.js";

const scope = Object.freeze({
  clusterId: "11111111-1111-4111-8111-111111111111",
  gridId: "A1",
  serverId: "22222222-2222-4222-8222-222222222222"
});

function makeEvent(eventType, overrides = {}) {
  return {
    schemaVersion: 1,
    eventId: "event-0001",
    eventType,
    occurredAt: "2026-11-13T17:00:00.000Z",
    scope,
    correlationId: "correlation-1",
    payload: { player: { platformId: "provider-player-1", name: "PrivateName" } },
    ...overrides
  };
}

test("exports the mock contract event vocabulary and deterministic default rules", () => {
  assert.ok(SENTINEL_SUPPORTED_EVENT_TYPES.includes("server.state.changed"));
  assert.deepEqual(
    SENTINEL_DEFAULT_RULES.map((rule) => rule.eventType),
    ["player.died", "player.killed", "ship.sunk", "structure.destroyed", "tame.died"]
  );
});

test("creates a metadata-only player death alert", () => {
  const event = makeEvent("player.died");
  const [alert] = evaluateSentinelEvent(event);

  assert.equal(alert.ruleId, "player-death");
  assert.equal(alert.severity, "info");
  assert.equal(alert.eventId, event.eventId);
  assert.equal(alert.eventType, event.eventType);
  assert.deepEqual(alert.scope, scope);
  assert.equal("payload" in alert, false);
  assert.equal(JSON.stringify(alert).includes("PrivateName"), false);
  assert.ok(Object.isFrozen(alert));
  assert.ok(Object.isFrozen(alert.scope));
});

test("classifies every configured alert event", () => {
  for (const rule of SENTINEL_DEFAULT_RULES) {
    const [alert] = evaluateSentinelEvent(makeEvent(rule.eventType));
    assert.equal(alert.ruleId, rule.id);
    assert.equal(alert.severity, rule.severity);
    assert.equal(alert.summary, rule.summary);
  }
});

test("returns no alert for supported events without an alert rule", () => {
  assert.deepEqual(evaluateSentinelEvent(makeEvent("player.connected")), []);
  assert.deepEqual(evaluateSentinelEvent(makeEvent("tribe.member.joined")), []);
});

test("generates a deterministic, scope-qualified alert ID", () => {
  const event = makeEvent("ship.sunk");
  const first = evaluateSentinelEvent(event)[0];
  const second = evaluateSentinelEvent(event)[0];

  assert.equal(first.alertId, second.alertId);
  assert.equal(
    first.alertId,
    `${scope.clusterId}:${scope.gridId}:${scope.serverId}:event-0001:ship-sunk`
  );
});

test("keeps identical source event IDs isolated across servers", () => {
  const first = evaluateSentinelEvent(makeEvent("ship.sunk"))[0];
  const second = evaluateSentinelEvent(makeEvent("ship.sunk", {
    scope: { ...scope, serverId: "33333333-3333-4333-8333-333333333333" }
  }))[0];

  assert.notEqual(first.alertId, second.alertId);
});

test("rejects malformed or unsupported event envelopes", () => {
  assert.throws(() => evaluateSentinelEvent(null), /event must be an object/);
  assert.throws(() => evaluateSentinelEvent(makeEvent("player.died", { schemaVersion: 2 })), /schemaVersion/);
  assert.throws(() => evaluateSentinelEvent(makeEvent("unknown.event")), /unsupported eventType/);
  assert.throws(() => evaluateSentinelEvent(makeEvent("player.died", { eventId: " " })), /eventId/);
  assert.throws(() => evaluateSentinelEvent(makeEvent("player.died", { occurredAt: "yesterday" })), /ISO 8601/);
  assert.throws(() => evaluateSentinelEvent(makeEvent("player.died", { occurredAt: "2026-02-31T00:00:00Z" })), /ISO 8601/);
  assert.throws(() => evaluateSentinelEvent(makeEvent("player.died", { occurredAt: "2025-02-29T00:00:00Z" })), /ISO 8601/);
  assert.doesNotThrow(() => evaluateSentinelEvent(makeEvent("player.died", { occurredAt: "2024-02-29T00:00:00Z" })));
  assert.throws(() => evaluateSentinelEvent(makeEvent("player.died", { scope: { ...scope, serverId: "" } })), /scope.serverId/);
  assert.throws(() => evaluateSentinelEvent(makeEvent("player.died", { payload: [] })), /payload/);
});

test("does not mutate the source event", () => {
  const event = makeEvent("structure.destroyed");
  const before = structuredClone(event);

  evaluateSentinelEvent(event);

  assert.deepEqual(event, before);
});
