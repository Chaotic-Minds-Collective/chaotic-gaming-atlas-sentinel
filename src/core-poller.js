import { createCoreServerHealthSample } from "./core-heartbeat-adapter.js";

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_SERVER_RECORDS = 1_000;

function validateBaseUrl(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError("baseUrl must be a non-empty HTTPS origin");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("baseUrl must be a valid HTTPS origin");
  }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new TypeError("baseUrl must be an HTTPS origin without credentials, path, query, or fragment");
  }
  url.pathname = "/servers";
  return url;
}

function validateTimeout(timeoutMs) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new TypeError(`timeoutMs must be an integer between 100 and ${MAX_TIMEOUT_MS}`);
  }
  return timeoutMs;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Fetch Core's public production server listing and normalize ATLAS records.
 *
 * Scope resolution is deliberately caller-supplied: Core's public listing
 * exposes a cluster name but not the stable cluster ID or provider grid ID.
 * This adapter performs one read-only request and never retries or mutates.
 */
export async function fetchCoreAtlasHealthSamples(options) {
  if (!isRecord(options)) {
    throw new TypeError("options must be an object");
  }
  const endpoint = validateBaseUrl(options.baseUrl);
  const timeoutMs = validateTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (typeof options.resolveScope !== "function") {
    throw new TypeError("resolveScope must be a function that returns explicit cluster/grid/server IDs");
  }
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function");
  }
  const now = options.now ?? new Date().toISOString();
  if (typeof now !== "string" || Number.isNaN(Date.parse(now))) {
    throw new TypeError("now must be a valid ISO date-time");
  }

  const response = await fetchImpl(endpoint, {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response || typeof response !== "object" ||
      typeof response.ok !== "boolean") {
    throw new TypeError("Core response must be a Fetch API Response");
  }
  if (!response.ok) {
    throw new Error(`Core server listing request failed with HTTP ${response.status}`);
  }
  const contentType = response.headers?.get?.("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new TypeError("Core server listing must return application/json");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new TypeError("Core server listing returned invalid JSON");
  }
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new TypeError("Core server listing must contain a data array");
  }
  if (payload.data.length > MAX_SERVER_RECORDS) {
    throw new RangeError(`Core server listing must contain at most ${MAX_SERVER_RECORDS} records`);
  }

  const samples = [];
  for (const [index, server] of payload.data.entries()) {
    if (!isRecord(server)) {
      throw new TypeError(`Core server listing data[${index}] must be an object`);
    }
    if (server.gameKey !== "atlas") continue;

    const scope = options.resolveScope(server);
    samples.push(createCoreServerHealthSample(server, scope, { now }));
  }
  return Object.freeze(samples);
}

export const SENTINEL_CORE_POLL_DEFAULTS = Object.freeze({
  timeoutMs: DEFAULT_TIMEOUT_MS,
  maxTimeoutMs: MAX_TIMEOUT_MS,
  maxServerRecords: MAX_SERVER_RECORDS
});
