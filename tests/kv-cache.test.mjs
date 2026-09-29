import assert from "node:assert/strict";
import test from "node:test";
import { createKvCache } from "../server/kv-cache.mjs";
import { createXFeedService } from "../server/x-feed-plugin.mjs";

test("KV cache adapter handles get, set, lock, and unlock with mock client", async () => {
  const store = new Map();
  const mockClient = {
    async get(key) {
      return store.get(key) ?? null;
    },
    async set(key, value, options) {
      if (options?.nx && store.has(key)) return null;
      store.set(key, value);
      return "OK";
    },
    async del(key) {
      store.delete(key);
      return 1;
    },
  };

  const kv = createKvCache({ client: mockClient });
  assert.equal(kv.isAvailable(), true);

  // Set and get
  await kv.set("test-key", { hello: "world" }, { ex: 60 });
  const val = await kv.get("test-key");
  assert.deepEqual(val, { hello: "world" });

  // Mutex lock
  assert.equal(await kv.acquireLock("lock-1", 60), true);
  // Second attempt fails
  assert.equal(await kv.acquireLock("lock-1", 60), false);
  // Release lock
  await kv.releaseLock("lock-1");
  // Third attempt succeeds
  assert.equal(await kv.acquireLock("lock-1", 60), true);
});

test("createXFeedService serves fresh data from KV without requesting X API", async () => {
  let time = 1000;
  let requestedX = false;
  const mockKv = {
    store: new Map([
      [
        "cache:x-posts:loveyong07",
        JSON.stringify({
          result: {
            status: "ok",
            posts: [{ id: "100", text: "Cached in KV", created_at: "2026-09-28T00:00:00Z" }],
            pinnedPost: null,
            pinnedStatus: "none",
          },
          cachedAt: 1000,
        }),
      ],
    ]),
    async get(key) {
      const v = this.store.get(key);
      return v ? JSON.parse(v) : null;
    },
    async set(key, val) {
      this.store.set(key, typeof val === "string" ? val : JSON.stringify(val));
      return "OK";
    },
    async acquireLock() {
      return true;
    },
    async releaseLock() {},
    isAvailable() {
      return true;
    },
  };

  const feed = createXFeedService({
    token: "test-token",
    now: () => time,
    kv: mockKv,
    fetchImpl: async () => {
      requestedX = true;
      throw new Error("Should not be called");
    },
  });

  const res = await feed();
  assert.equal(requestedX, false);
  assert.equal(res.status, "ok");
  assert.equal(res.posts[0].id, "100");
});

test("createXFeedService returns stale cache when distributed lock is held by another instance", async () => {
  let time = 1000;
  let requestedX = false;
  const mockKv = {
    store: new Map([
      [
        "cache:x-posts:loveyong07",
        JSON.stringify({
          result: {
            status: "ok",
            posts: [{ id: "101", text: "Stale in KV", created_at: "2026-09-28T00:00:00Z" }],
            pinnedPost: null,
            pinnedStatus: "none",
          },
          cachedAt: 100, // expired (older than 15 mins)
        }),
      ],
    ]),
    async get(key) {
      const v = this.store.get(key);
      return v ? JSON.parse(v) : null;
    },
    async set(key, val) {
      this.store.set(key, typeof val === "string" ? val : JSON.stringify(val));
      return "OK";
    },
    async acquireLock() {
      return false; // lock held by another instance
    },
    async releaseLock() {},
    isAvailable() {
      return true;
    },
  };

  const feed = createXFeedService({
    token: "test-token",
    now: () => time,
    kv: mockKv,
    fetchImpl: async () => {
      requestedX = true;
      throw new Error("Should not be called when locked");
    },
  });

  // Time is 16 mins later
  time = 100 + 16 * 60 * 1000;
  const res = await feed();
  assert.equal(requestedX, false);
  assert.equal(res.status, "stale");
  assert.equal(res.posts[0].id, "101");
});
