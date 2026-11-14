/**
 * Lifecycle coordinator for Sentinel's read-only Core health poller.
 *
 * This module schedules bounded polling supplied by the caller. It prevents
 * overlapping requests, reports failures through an injected callback, and
 * stops scheduling immediately when stopped. It does not persist data, notify,
 * restart servers, invoke RCON, or contact ATLAS directly.
 */
const DEFAULT_INTERVAL_MS = 60_000;
const MIN_INTERVAL_MS = 1_000;
const MAX_INTERVAL_MS = 3_600_000;

function validateOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("options must be an object");
  }
  if (typeof options.poll !== "function") {
    throw new TypeError("poll must be a function");
  }
  if (typeof options.onSamples !== "function") {
    throw new TypeError("onSamples must be a function");
  }
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  if (!Number.isSafeInteger(intervalMs) ||
      intervalMs < MIN_INTERVAL_MS || intervalMs > MAX_INTERVAL_MS) {
    throw new TypeError(
      `intervalMs must be an integer between ${MIN_INTERVAL_MS} and ${MAX_INTERVAL_MS}`
    );
  }
  const setIntervalImpl = options.setIntervalImpl ?? globalThis.setInterval;
  const clearIntervalImpl = options.clearIntervalImpl ?? globalThis.clearInterval;
  if (typeof setIntervalImpl !== "function" || typeof clearIntervalImpl !== "function") {
    throw new TypeError("interval timer functions must be functions");
  }
  if (options.onError !== undefined && typeof options.onError !== "function") {
    throw new TypeError("onError must be a function when provided");
  }
  return {
    poll: options.poll,
    onSamples: options.onSamples,
    onError: options.onError,
    intervalMs,
    setIntervalImpl,
    clearIntervalImpl
  };
}

/**
 * Create a stopped monitor. Calling start() triggers one immediate poll and
 * then polls on the configured interval. Concurrent ticks share one in-flight
 * operation instead of issuing overlapping Core requests.
 */
export function createCoreHealthMonitor(options) {
  const config = validateOptions(options);
  let running = false;
  let timer = null;
  let inFlight = null;

  async function executePoll() {
    if (inFlight) return inFlight;
    const operation = (async () => {
      try {
        const samples = await config.poll();
        if (!Array.isArray(samples)) {
          throw new TypeError("poll must resolve to an array of health samples");
        }
        if (running) await config.onSamples(samples);
        return true;
      } catch (error) {
        if (running && config.onError) {
          try {
            await config.onError(error);
          } catch {
            // An error reporter must not terminate the polling lifecycle.
          }
        }
        return false;
      } finally {
        inFlight = null;
      }
    })();
    inFlight = operation;
    return operation;
  }

  function start() {
    if (running) return false;
    running = true;
    try {
      timer = config.setIntervalImpl(() => {
        if (running) void executePoll();
      }, config.intervalMs);
    } catch (error) {
      running = false;
      timer = null;
      throw error;
    }
    void executePoll();
    return true;
  }

  function stop() {
    if (!running) return false;
    running = false;
    if (timer !== null) {
      config.clearIntervalImpl(timer);
      timer = null;
    }
    return true;
  }

  function pollNow() {
    if (!running) {
      throw new Error("monitor must be running before pollNow can be used");
    }
    return executePoll();
  }

  return Object.freeze({
    start,
    stop,
    pollNow,
    get running() {
      return running;
    },
    get polling() {
      return inFlight !== null;
    }
  });
}

export const SENTINEL_CORE_MONITOR_DEFAULTS = Object.freeze({
  intervalMs: DEFAULT_INTERVAL_MS,
  minIntervalMs: MIN_INTERVAL_MS,
  maxIntervalMs: MAX_INTERVAL_MS
});
