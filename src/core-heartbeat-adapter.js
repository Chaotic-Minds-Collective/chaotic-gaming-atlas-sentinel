const DEFAULT_OFFLINE_AFTER_MS = 300_000;
const ISO_DATE_TIME = /^\\d{4}-\\d{2}-\\d{2}T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|[+-](?:[01]\\d|2[0-3]):[0-5]\\d)$/;

function requireNonEmpty(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function parseTimestamp(value, field) {
  if (typeof value !== "string" || !ISO_DATE_TIME.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${field} must be a valid ISO date-time with timezone`);
  }
  return Date.parse(value);
}

/**
 * Map one Core GET /servers record into Sentinel's normalized health contract.
 *
 * Core deliberately reports online=false and playerCount=null when its latest
 * heartbeat is older than five minutes. Preserve that distinction: a stale
 * heartbeat is classified by age, not misrepresented as a fresh stopped signal.
 * Scope is supplied explicitly because Core's public server listing currently
 * returns clusterName, not clusterId or the provider gridId.
 */
export function createCoreServerHealthSample(server, scope, options = {}) {
  if (!server || typeof server !== "object" || Array.isArray(server)) {
    throw new TypeError("server must be an object");
  }
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) {
    throw new TypeError("scope must be an object");
  }
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("options must be an object");
  }

  const serverId = requireNonEmpty(server.id, "server.id");
  if (server.gameKey !== "atlas") {
    throw new TypeError("server.gameKey must be atlas");
  }
  if (typeof server.online !== "boolean") {
    throw new TypeError("server.online must be a boolean");
  }
  if (server.playerCount !== null &&
      (!Number.isSafeInteger(server.playerCount) || server.playerCount < 0)) {
    throw new TypeError("server.playerCount must be null or a non-negative safe integer");
  }

  const normalizedScope = Object.freeze({
    clusterId: requireNonEmpty(scope.clusterId, "scope.clusterId"),
    gridId: requireNonEmpty(scope.gridId, "scope.gridId"),
    serverId: requireNonEmpty(scope.serverId, "scope.serverId")
  });
  if (normalizedScope.serverId !== serverId) {
    throw new TypeError("scope.serverId must match server.id");
  }

  const now = options.now;
  const evaluatedAt = parseTimestamp(now, "now");
  const offlineAfterMs = options.offlineAfterMs ?? DEFAULT_OFFLINE_AFTER_MS;
  if (!Number.isSafeInteger(offlineAfterMs) || offlineAfterMs < 1) {
    throw new TypeError("offlineAfterMs must be a positive safe integer");
  }

  const heartbeatAt = server.lastHeartbeat === null || server.lastHeartbeat === undefined
    ? null
    : server.lastHeartbeat;
  const heartbeatTime = heartbeatAt === null
    ? null
    : parseTimestamp(heartbeatAt, "server.lastHeartbeat");

  if (heartbeatTime !== null && heartbeatTime > evaluatedAt) {
    throw new TypeError("server.lastHeartbeat cannot be later than now");
  }

  const heartbeatAgeMs = heartbeatTime === null ? null : evaluatedAt - heartbeatTime;
  const state = heartbeatTime === null
    ? "unknown"
    : server.online || heartbeatAgeMs >= offlineAfterMs
      ? "running"
      : "stopped";

  return Object.freeze({
    schemaVersion: 1,
    sampledAt: heartbeatAt ?? now,
    heartbeatAt,
    state,
    playerCount: server.playerCount,
    scope: normalizedScope
  });
}

export const SENTINEL_CORE_HEARTBEAT_DEFAULTS = Object.freeze({
  offlineAfterMs: DEFAULT_OFFLINE_AFTER_MS
});
