const CORE_STALE_HEARTBEAT_AFTER_MS = 300_000;
const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(\.\d+)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function requireNonEmpty(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function parseTimestamp(value, field) {
  if (typeof value !== "string") {
    throw new TypeError(`${field} must be a valid ISO date-time with timezone`);
  }
  const match = ISO_DATE_TIME.exec(value);
  if (!match) {
    throw new TypeError(`${field} must be a valid ISO date-time with timezone`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const daysInMonth = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31
  ];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    throw new TypeError(`${field} must be a valid ISO date-time with timezone`);
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`${field} must be a valid ISO date-time with timezone`);
  }
  return parsed;
}

/**
 * Map one Core GET /servers record into Sentinel's normalized health contract.
 *
 * Core reports online=false and playerCount=null when its latest heartbeat is
 * older than five minutes. A stale record is therefore not the same as a fresh
 * stopped signal: retain its heartbeat timestamp and let Sentinel classify age.
 * Scope is explicit because Core's current listing returns clusterName, not
 * clusterId or the provider gridId.
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
  const staleProjection = heartbeatAgeMs !== null &&
    heartbeatAgeMs > CORE_STALE_HEARTBEAT_AFTER_MS;
  const state = heartbeatTime === null
    ? "unknown"
    : server.online || staleProjection
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
  staleProjectionAfterMs: CORE_STALE_HEARTBEAT_AFTER_MS
});
