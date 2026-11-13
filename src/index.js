const SUPPORTED_EVENT_TYPES = new Set([
  "player.connected",
  "player.disconnected",
  "player.died",
  "player.killed",
  "character.created",
  "character.transferred",
  "tribe.created",
  "tribe.member.joined",
  "tribe.member.left",
  "tribe.updated",
  "chat.global",
  "chat.tribe",
  "ship.sunk",
  "ship.retrieved",
  "structure.destroyed",
  "tame.created",
  "tame.died",
  "server.state.changed"
]);

const DEFAULT_RULES = Object.freeze([
  Object.freeze({
    id: "player-death",
    eventType: "player.died",
    severity: "info",
    summary: "A player death event was recorded."
  }),
  Object.freeze({
    id: "player-kill",
    eventType: "player.killed",
    severity: "warning",
    summary: "A player kill event was recorded."
  }),
  Object.freeze({
    id: "ship-sunk",
    eventType: "ship.sunk",
    severity: "warning",
    summary: "A ship sinking event was recorded."
  }),
  Object.freeze({
    id: "structure-destroyed",
    eventType: "structure.destroyed",
    severity: "warning",
    summary: "A structure destruction event was recorded."
  }),
  Object.freeze({
    id: "tame-death",
    eventType: "tame.died",
    severity: "info",
    summary: "A tamed-creature death event was recorded."
  })
]);

function requireNonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function validateEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new TypeError("event must be an object");
  }
  if (event.schemaVersion !== 1) {
    throw new TypeError("schemaVersion must be 1");
  }

  const eventId = requireNonEmptyString(event.eventId, "eventId");
  const eventType = requireNonEmptyString(event.eventType, "eventType");
  if (!SUPPORTED_EVENT_TYPES.has(eventType)) {
    throw new TypeError(`unsupported eventType: ${eventType}`);
  }

  const occurredAt = requireNonEmptyString(event.occurredAt, "occurredAt");
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(occurredAt) || !Number.isFinite(Date.parse(occurredAt))) {
    throw new TypeError("occurredAt must be an ISO 8601 date-time with timezone");
  }

  if (!event.scope || typeof event.scope !== "object" || Array.isArray(event.scope)) {
    throw new TypeError("scope must be an object");
  }

  const scope = Object.freeze({
    clusterId: requireNonEmptyString(event.scope.clusterId, "scope.clusterId"),
    gridId: requireNonEmptyString(event.scope.gridId, "scope.gridId"),
    serverId: requireNonEmptyString(event.scope.serverId, "scope.serverId")
  });

  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) {
    throw new TypeError("payload must be an object");
  }

  return Object.freeze({ eventId, eventType, occurredAt, scope });
}

/**
 * Classify one schema-v1 ATLAS event into zero or more read-only Sentinel alerts.
 *
 * The evaluator deliberately returns metadata only: it does not copy event payloads,
 * identify players, send notifications, issue RCON commands, or change game state.
 */
export function evaluateSentinelEvent(event) {
  const validated = validateEvent(event);
  const matchingRules = DEFAULT_RULES.filter((rule) => rule.eventType === validated.eventType);

  return Object.freeze(matchingRules.map((rule) => Object.freeze({
    alertId: [
      validated.scope.clusterId,
      validated.scope.gridId,
      validated.scope.serverId,
      validated.eventId,
      rule.id
    ].join(":"),
    ruleId: rule.id,
    severity: rule.severity,
    summary: rule.summary,
    eventId: validated.eventId,
    eventType: validated.eventType,
    occurredAt: validated.occurredAt,
    scope: validated.scope
  })));
}

export const SENTINEL_SUPPORTED_EVENT_TYPES = Object.freeze([...SUPPORTED_EVENT_TYPES]);
export const SENTINEL_DEFAULT_RULES = DEFAULT_RULES;
