import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchCoreAtlasHealthSamples,
  SENTINEL_CORE_POLL_DEFAULTS
} from "../src/core-poller.js";

const now = "2026-11-14T12:00:00.000Z";
const server = {
  id: "atlas-server-1",
  gameKey: "atlas",
  online: true,
  playerCount: 12,
  lastHeartbeat: "2026-11-14T11:59:30.000Z"
};
const scope = {
  clusterId: "cluster-1",
  gridId: "grid-1",
  serverId: server.id
};

function response(data, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    headers: {
      get(name) {
        return name.toLowerCase() === "content-type"
          ? options.contentType ?? "application/json; charset=utf-8"
          : null;
      }
    },
    async json() {
      if (options.invalidJson) throw new SyntaxError("invalid");
      return data;
    }
  };
}

function poll(overrides = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return response({
      data: [
        server,
        {
          id: "other-game",
          gameKey: "7dtd",
          online: true,
          playerCount: 3,
          lastHeartbeat: now
        }
      ]
    });
  };
  return fetchCoreAtlasHealthSamples({
    baseUrl: "https://core.example",
    now,
    resolveScope: () => scope,
    fetchImpl,
    ...overrides
  }).then((samples) => ({ samples, calls }));
}

test("fetches Core's public server listing once and returns only normalized ATLAS samples", async () => {
  const { samples, calls } = await poll();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://core.example/servers");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(calls[0].init.headers.accept, "application/json");
  assert.equal(samples.length, 1);
  assert.equal(samples[0].scope.serverId, server.id);
  assert.equal(samples[0].state, "running");
  assert.equal(samples[0].playerCount, 12);
  assert.ok(Object.isFrozen(samples));
  assert.ok(Object.isFrozen(samples[0]));
});

test("requires explicit scope mapping for every ATLAS record", async () => {
  await assert.rejects(
    fetchCoreAtlasHealthSamples({
      baseUrl: "https://core.example",
      now,
      fetchImpl: async () => response({ data: [server] })
    }),
    /resolveScope/
  );
});

test("rejects insecure or ambiguous Core origins", async () => {
  for (const baseUrl of [
    "http://core.example",
    "https://user:pass@core.example",
    "https://core.example/path",
    "https://core.example?token=secret",
    "not a URL"
  ]) {
    await assert.rejects(
      fetchCoreAtlasHealthSamples({
        baseUrl,
        now,
        resolveScope: () => scope,
        fetchImpl: async () => response({ data: [server] })
      }),
      /baseUrl/
    );
  }
});

test("validates timeout bounds before making a request", async () => {
  let called = false;
  await assert.rejects(
    fetchCoreAtlasHealthSamples({
      baseUrl: "https://core.example",
      timeoutMs: 30_001,
      now,
      resolveScope: () => scope,
      fetchImpl: async () => {
        called = true;
        return response({ data: [] });
      }
    }),
    /timeoutMs/
  );
  assert.equal(called, false);
  assert.equal(SENTINEL_CORE_POLL_DEFAULTS.timeoutMs, 5_000);
});

test("rejects non-success HTTP responses without parsing their bodies", async () => {
  let parsed = false;
  await assert.rejects(
    fetchCoreAtlasHealthSamples({
      baseUrl: "https://core.example",
      now,
      resolveScope: () => scope,
      fetchImpl: async () => ({
        ok: false,
        status: 503,
        headers: { get: () => "application/json" },
        async json() {
          parsed = true;
          return {};
        }
      })
    }),
    /HTTP 503/
  );
  assert.equal(parsed, false);
});

test("rejects unexpected content types and invalid JSON", async () => {
  const options = {
    baseUrl: "https://core.example",
    now,
    resolveScope: () => scope
  };
  await assert.rejects(
    fetchCoreAtlasHealthSamples({
      ...options,
      fetchImpl: async () => response({ data: [] }, { contentType: "text/html" })
    }),
    /application\/json/
  );
  await assert.rejects(
    fetchCoreAtlasHealthSamples({
      ...options,
      fetchImpl: async () => response({}, { invalidJson: true })
    }),
    /invalid JSON/
  );
});

test("rejects malformed payloads and oversized server listings", async () => {
  const options = {
    baseUrl: "https://core.example",
    now,
    resolveScope: () => scope
  };
  await assert.rejects(
    fetchCoreAtlasHealthSamples({
      ...options,
      fetchImpl: async () => response({ results: [] })
    }),
    /data array/
  );
  await assert.rejects(
    fetchCoreAtlasHealthSamples({
      ...options,
      fetchImpl: async () => response({ data: Array(1_001).fill(server) })
    }),
    /at most 1000/
  );
  await assert.rejects(
    fetchCoreAtlasHealthSamples({
      ...options,
      fetchImpl: async () => response({ data: [null] })
    }),
    /data\[0\]/
  );
});

test("rejects incomplete scope mappings and malformed ATLAS server records", async () => {
  await assert.rejects(
    fetchCoreAtlasHealthSamples({
      baseUrl: "https://core.example",
      now,
      resolveScope: () => ({ ...scope, gridId: "" }),
      fetchImpl: async () => response({ data: [server] })
    }),
    /scope.gridId/
  );
  await assert.rejects(
    fetchCoreAtlasHealthSamples({
      baseUrl: "https://core.example",
      now,
      resolveScope: () => scope,
      fetchImpl: async () => response({
        data: [{ ...server, playerCount: -1 }]
      })
    }),
    /playerCount/
  );
});

test("does not call the scope resolver for non-ATLAS servers", async () => {
  let scopeCalls = 0;
  const samples = await fetchCoreAtlasHealthSamples({
    baseUrl: "https://core.example",
    now,
    resolveScope: () => {
      scopeCalls += 1;
      return scope;
    },
    fetchImpl: async () => response({
      data: [{
        id: "other-game",
        gameKey: "7dtd"
      }]
    })
  });
  assert.equal(scopeCalls, 0);
  assert.deepEqual(samples, []);
});

test("propagates fetch failures without retrying", async () => {
  let calls = 0;
  await assert.rejects(
    fetchCoreAtlasHealthSamples({
      baseUrl: "https://core.example",
      now,
      resolveScope: () => scope,
      fetchImpl: async () => {
        calls += 1;
        throw new Error("network unavailable");
      }
    }),
    /network unavailable/
  );
  assert.equal(calls, 1);
});
