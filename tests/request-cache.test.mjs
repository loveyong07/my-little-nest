import test from "node:test";
import assert from "node:assert/strict";
import { createSharedRequest, startVisibleRefresh, REQUEST_TIMEOUT_MS, REQUEST_RETRY_MS, REQUEST_FRESH_MS } from "../src/request-cache.js";

function fakeClock(start = 1000) {
  let time = start;
  let nextId = 0;
  const timers = new Map();
  return {
    now: () => time,
    setTimer: (callback, delay) => { const id = ++nextId; timers.set(id, { callback, at: time + delay }); return id; },
    clearTimer: (id) => timers.delete(id),
    advance: (delay) => {
      time += delay;
      for (const [id, timer] of [...timers]) if (timer.at <= time) { timers.delete(id); timer.callback(); }
    },
  };
}

const response = (value) => ({ ok: true, json: async () => value });
const isSuccess = (value) => value?.status === "ok";
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test("concurrent consumers share one request; fresh reads preserve the success timestamp", async () => {
  const clock = fakeClock();
  let finish;
  let calls = 0;
  let saves = 0;
  const resource = createSharedRequest({ url: "/api/example", isSuccess, ...clock,
    fetchImpl: async () => { calls++; return new Promise((resolve) => { finish = resolve; }); },
    onSuccess: () => { saves++; },
  });
  const first = resource.load();
  assert.equal(resource.load({ force: true }), first);
  await flush();
  finish(response({ status: "ok", posts: [1] }));
  await first;
  const savedAt = resource.getSnapshot().savedAt;
  clock.advance(REQUEST_FRESH_MS - 1);
  assert.deepEqual(await resource.load(), { status: "ok", posts: [1] });
  assert.equal(resource.getSnapshot().savedAt, savedAt);
  assert.equal(calls, 1);
  assert.equal(saves, 1);
  const refresh = resource.load();
  // Freshness must expire from the original success, not the most recent read.
  clock.advance(1);
  await refresh;
  const expired = resource.load();
  await flush();
  finish(response({ status: "ok", posts: [2] }));
  await expired;
  assert.equal(calls, 2);
  assert.equal(saves, 2);
});

test("the waiting deadline includes a stalled response body and ignores late success", async () => {
  const clock = fakeClock();
  let finishBody;
  let signal;
  const resource = createSharedRequest({ url: "/api/example", isSuccess, ...clock,
    fetchImpl: async (_, options) => {
      signal = options.signal;
      return { ok: true, json: () => new Promise((resolve) => { finishBody = resolve; }) };
    },
  });
  const pending = resource.load();
  await flush();
  clock.advance(REQUEST_TIMEOUT_MS);
  await assert.rejects(pending, { name: "TimeoutError" });
  assert.equal(signal.aborted, true);
  assert.equal(resource.getRetryAfter(), REQUEST_RETRY_MS);
  clock.advance(1000);
  assert.equal(resource.getRetryAfter(), REQUEST_RETRY_MS - 1000);
  finishBody({ status: "ok" });
  await flush();
  assert.equal(resource.getSnapshot(), null);
});

test("failure cooldown suppresses foreground and manual request storms, then permits recovery", async () => {
  const clock = fakeClock();
  let calls = 0;
  const resource = createSharedRequest({ url: "/api/example", isSuccess, ...clock,
    fetchImpl: async () => { calls++; return calls === 1 ? { ok: false } : response({ status: "ok" }); },
  });
  await assert.rejects(resource.load());
  await assert.rejects(resource.load());
  await assert.rejects(resource.load({ force: true }));
  assert.equal(calls, 1);
  clock.advance(REQUEST_RETRY_MS);
  assert.deepEqual(await resource.load(), { status: "ok" });
  assert.equal(calls, 2);
});

test("unavailable responses do not renew a successful snapshot; force skips only freshness", async () => {
  const clock = fakeClock();
  let calls = 0;
  const resource = createSharedRequest({ url: "/api/example", isSuccess, ...clock,
    fetchImpl: async () => { calls++; return response(calls === 1 ? { status: "unavailable" } : { status: "ok", version: 2 }); },
  });
  resource.prime({ status: "ok", version: 1 }, 500);
  assert.equal((await resource.load()).version, 1);
  assert.equal(calls, 0);
  assert.equal((await resource.load({ force: true })).status, "unavailable");
  assert.equal(resource.getSnapshot().savedAt, 500);
  assert.equal((await resource.load({ force: true })).status, "unavailable");
  assert.equal(calls, 1);
  clock.advance(REQUEST_RETRY_MS);
  assert.equal((await resource.load()).version, 2);
  assert.equal(calls, 2);
});

test("expired or future snapshots cannot seed freshness", () => {
  const clock = fakeClock(100_000_000);
  const resource = createSharedRequest({ url: "/api/example", isSuccess, ...clock });
  resource.prime({ status: "ok" }, clock.now() + 1);
  assert.equal(resource.getSnapshot(), null);
  resource.prime({ status: "ok" }, clock.now() - 86_400_001);
  assert.equal(resource.getSnapshot(), null);
  resource.prime({ status: "ok", version: 2 }, clock.now());
  resource.prime({ status: "ok", version: 1 }, clock.now() - 1);
  assert.equal(resource.getSnapshot().value.version, 2);
});

test("hidden pages pause refresh checks and leaving a consumer does not abort shared work", async () => {
  const clock = fakeClock();
  let finish;
  let signal;
  const resource = createSharedRequest({ url: "/api/example", isSuccess, ...clock,
    fetchImpl: async (_, options) => { signal = options.signal; return new Promise((resolve) => { finish = resolve; }); },
  });
  const listeners = new Set();
  const documentImpl = { hidden: true, addEventListener: (_, callback) => listeners.add(callback), removeEventListener: (_, callback) => listeners.delete(callback) };
  let tick;
  let cleared = false;
  const windowImpl = { setInterval: (callback) => { tick = callback; return 1; }, clearInterval: () => { cleared = true; } };
  let refreshes = 0;
  const stop = startVisibleRefresh(() => { refreshes++; return resource.load(); }, { windowImpl, documentImpl });
  tick();
  assert.equal(refreshes, 0);
  documentImpl.hidden = false;
  for (const callback of listeners) callback();
  const pending = resource.load();
  await flush();
  stop();
  assert.equal(cleared, true);
  assert.equal(listeners.size, 0);
  assert.equal(signal.aborted, false);
  finish(response({ status: "ok" }));
  await pending;
  assert.equal(resource.getSnapshot().value.status, "ok");
});
