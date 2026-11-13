const DEFAULT_THRESHOLDS = Object.freeze({
  warningAfterMs: 90_000,
  offlineAfterMs: 300_000
});
const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(\.\d+)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function nonEmpty(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function timestamp(value, field) {
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

function validateThresholds(thresholds = {}) {
  if (!thresholds || typeof thresholds !== "object" || Array.isArray(thresholds)) {
    throw new TypeError("thresholds must be an object");
  }
  const value = { ...DEFAULT_THRESHOLDS, ...thresholds };
  if (!Number.isSafeInteger(value.warningAfterMs) || value.warningAfterMs < 1) {
    throw new TypeError("warningAfterMs must be a positive safe integer");
  }
  if (!Number.isSafeInteger(value.offlineAfterMs) || value.offlineAfterMs <= value.warningAfterMs) {
    throw new TypeError("offlineAfterMs must be a safe integer greater than warningAfterMs");
  }
  return value;
}

function escapeIdPart(value) {
  return value.replaceAll("%", "%25").replaceAll(":", "%3A");
}

/**
 * Classify a normalized, read-only server health sample.
 *
 * This pure function does not poll servers, persist samples, issue RCON commands,
 * restart processes, or infer native ATLAS capabilities.
 */
export function classifyServerHealth(sample, options = {}) {
  if (!sample || typeof sample !== "object" || Array.isArray(sample)) {
    throw new TypeError("sample must be an object");
  }
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("options must be an object");
  }
  if (sample.schemaVersion !== 1) {
    throw new TypeError("schemaVersion must be 1");
  }

  const scope = Object.freeze({
    clusterId: nonEmpty(sample.scope?.clusterId, "scope.clusterId"),
    gridId: nonEmpty(sample.scope?.gridId, "scope.gridId"),
    serverId: nonEmpty(sample.scope?.serverId, "scope.serverId")
  });
  const sampledAt = timestamp(sample.sampledAt, "sampledAt");
  const evaluatedAt = options.now === undefined ? sampledAt : timestamp(options.now, "now");
  const thresholds = validateThresholds(options.thresholds);

  if (!["running", "stopped", "unknown"].includes(sample.state)) {
    throw new TypeError("state must be running, stopped, or unknown");
  }
  if (!Number.isSafeInteger(sample.playerCount) || sample.playerCount < 0) {
    throw new TypeError("playerCount must be a non-negative safe integer");
  }

  let heartbeatAt = null;
  let status = "unknown";
  let reason = "Server state is unknown.";

  if (sample.heartbeatAt !== null && sample.heartbeatAt !== undefined) {
    heartbeatAt = timestamp(sample.heartbeatAt, "heartbeatAt");
    if (heartbeatAt > evaluatedAt) {
      throw new TypeError("heartbeatAt cannot be later than now");
    }
  }

  if (sample.state === "stopped") {
    status = "offline";
    reason = "Server reports a stopped state.";
  } else if (sample.state === "running" && heartbeatAt !== null) {
    const heartbeatAgeMs = evaluatedAt - heartbeatAt;
    if (heartbeatAgeMs >= thresholds.offlineAfterMs) {
      status = "offline";
      reason = "Server heartbeat exceeded the offline threshold.";
    } else if (heartbeatAgeMs >= thresholds.warningAfterMs) {
      status = "degraded";
      reason = "Server heartbeat is delayed.";
    } else {
      status = "healthy";
      reason = "Server heartbeat is within the healthy threshold.";
    }
  } else if (sample.state === "running") {
    reason = "Server reports running but has no heartbeat timestamp.";
  }

  const idParts = [scope.clusterId, scope.gridId, scope.serverId, String(sampledAt)];
  const healthId = idParts.map(escapeIdPart).join(":");

  return Object.freeze({
    healthId,
    status,
    reason,
    sampledAt: new Date(sampledAt).toISOString(),
    evaluatedAt: new Date(evaluatedAt).toISOString(),
    heartbeatAt: heartbeatAt === null ? null : new Date(heartbeatAt).toISOString(),
    heartbeatAgeMs: heartbeatAt === null ? null : evaluatedAt - heartbeatAt,
    playerCount: sample.playerCount,
    scope
  });
}

export const SENTINEL_DEFAULT_HEALTH_THRESHOLDS = DEFAULT_THRESHOLDS;
