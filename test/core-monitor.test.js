import test from "node:test";
import assert from "node:assert/strict";
import {
  createCoreHealthMonitor,
  SENTINEL_CORE_MONITOR_DEFAULTS
} from "../src/core-monitor.js";

function harness(overrides = {}) {
  const calls = { polls: 0, samples: [], errors: [], cleared: [] };
  let tick;
  const monitor = createCoreHealthMonitor({
    intervalMs: 5_000,
    poll: async () => {
      calls.polls += 1;
      return [{ id: calls.polls }];
    },
    onSamples: async (samples) => {
      calls.samples.push(samples);
    },
    onError: async (error) => {
      calls.errors.push(error);
    },
    setIntervalImpl: (callback, intervalMs) => {
      calls.intervalMs = intervalMs;
      tick = callback;
      return "timer-1";
    },
    clearIntervalImpl: (handle) => calls.cleared.push(handle),
    ...overrides
  });
  return { monitor, calls, tick: () => tick() };
}

test("starts with an immediate poll and schedules the configured interval", async () => {
  const { monitor, calls } = harness();
  assert.equal(monitor.running, false);
  assert.equal(monitor.start(), true);
  assert.equal(monitor.running, true);
  assert.equal(calls.intervalMs, 5_000);
  assert.equal(await monitor.pollNow(), true);
  assert.equal(calls.polls, 1);
  assert.equal(calls.samples.length, 1);
  assert.deepEqual(calls.samples[0], [{ id: 1 }]);
  assert.equal(monitor.stop(), true);
});

test("start and stop are idempotent", async () => {
  const { monitor, calls } = harness();
  assert.equal(monitor.start(), true);
  assert.equal(monitor.start(), false);
  await monitor.pollNow();
  assert.equal(monitor.stop(), true);
  assert.equal(monitor.stop(), false);
  assert.deepEqual(calls.cleared, ["timer-1"]);
  assert.equal(monitor.running, false);
});

test("scheduled ticks do not overlap an in-flight poll", async () => {
  let resolvePoll;
  let polls = 0;
  const { monitor, tick } = harness({
    poll: () => {
      polls += 1;
      return new Promise((resolve) => {
        resolvePoll = resolve;
      });
    }
  });
  monitor.start();
  const first = monitor.pollNow();
  tick();
  tick();
  assert.equal(polls, 1);
  resolvePoll([]);
  assert.equal(await first, true);
  assert.equal(polls, 1);
  monitor.stop();
});

test("poll failures are reported and later ticks can recover", async () => {
  let attempt = 0;
  const { monitor, calls, tick } = harness({
    poll: async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("Core unavailable");
      return [];
    }
  });
  monitor.start();
  assert.equal(await monitor.pollNow(), false);
  assert.equal(calls.errors.length, 1);
  assert.match(calls.errors[0].message, /Core unavailable/);
  tick();
  await monitor.pollNow();
  assert.equal(calls.samples.length, 1);
  monitor.stop();
});

test("stopping prevents a late in-flight result from being delivered", async () => {
  let resolvePoll;
  const { monitor, calls } = harness({
    poll: () => new Promise((resolve) => {
      resolvePoll = resolve;
    })
  });
  monitor.start();
  const pending = monitor.pollNow();
  monitor.stop();
  resolvePoll([{ id: "late" }]);
  assert.equal(await pending, true);
  assert.equal(calls.samples.length, 0);
});

test("pollNow requires a running monitor", () => {
  const { monitor } = harness();
  assert.throws(() => monitor.pollNow(), /must be running/);
});

test("validates interval bounds and callback contracts", () => {
  assert.equal(SENTINEL_CORE_MONITOR_DEFAULTS.intervalMs, 60_000);
  for (const intervalMs of [0, 999, 3_600_001, 1.5]) {
    assert.throws(() => createCoreHealthMonitor({
      poll: async () => [],
      onSamples: () => {},
      intervalMs
    }), /intervalMs/);
  }
  assert.throws(() => createCoreHealthMonitor({
    poll: async () => []
  }), /onSamples/);
  assert.throws(() => createCoreHealthMonitor({
    poll: async () => [],
    onSamples: () => {},
    onError: true
  }), /onError/);
});

test("rejects a poll result that is not an array", async () => {
  const { monitor, calls } = harness({
    poll: async () => ({ data: [] })
  });
  monitor.start();
  assert.equal(await monitor.pollNow(), false);
  assert.match(calls.errors[0].message, /array/);
  monitor.stop();
});

test("an error callback failure does not break the monitor", async () => {
  let attempts = 0;
  const { monitor } = harness({
    poll: async () => {
      attempts += 1;
      throw new Error("poll failed");
    },
    onError: () => {
      throw new Error("reporter failed");
    }
  });
  monitor.start();
  assert.equal(await monitor.pollNow(), false);
  assert.equal(monitor.running, true);
  assert.equal(attempts, 1);
  monitor.stop();
});
