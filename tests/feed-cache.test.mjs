import test from "node:test";
import assert from "node:assert/strict";
import { readFeedCache, writeFeedCache, canPrefetch, fetchFeed, getFeedSnapshot } from "../src/feed-cache.js";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, next) => {
      values.set(key, next);
    },
  };
}

test("feeds cached before expanded X links were supported are refetched", () => {
  const store = storage();
  const feed = { status: "ok", posts: [], pinnedStatus: "none" };
  store.setItem("little-nest-feed-v1", JSON.stringify({ savedAt: 1000, feed }));
  store.setItem("little-nest-feed-v2", JSON.stringify({ savedAt: 1000, feed }));
  assert.equal(readFeedCache(store, 1001), null);
  writeFeedCache(store, feed, 1002);
  assert.deepEqual(readFeedCache(store, 1003), { savedAt: 1002, feed });
});

test("saved feed expires and failed refreshes cannot renew stale data", () => {
  const store = storage();
  const feed = { status: "ok", posts: [], pinnedStatus: "none" };
  writeFeedCache(store, feed, 1000);
  assert.deepEqual(readFeedCache(store, 2000), { savedAt: 1000, feed });
  writeFeedCache(store, { ...feed, status: "stale" }, 3000);
  assert.equal(readFeedCache(store, 4000).savedAt, 1000);
  assert.equal(readFeedCache(store, 1000 + 86400001), null);
  assert.equal(readFeedCache(store, 999), null);
});

test("corrupt or unavailable browser storage cannot break rendering", () => {
  assert.equal(readFeedCache({ getItem: () => "{broken" }), null);
  const blocked = {
    getItem() {
      throw Error();
    },
    setItem() {
      throw Error();
    },
  };
  assert.equal(readFeedCache(blocked), null);
  assert.doesNotThrow(() => writeFeedCache(blocked, { status: "ok", posts: [] }));
});

test("saving an empty fresh feed removes deleted posts and unpinned content", () => {
  const store = storage();
  writeFeedCache(store, { status: "ok", posts: [{ id: "123" }], pinnedPost: { id: "456" } }, 1000);
  writeFeedCache(store, { status: "ok", posts: [], pinnedPost: null, pinnedStatus: "none" }, 2000);
  assert.deepEqual(readFeedCache(store, 2001).feed.posts, []);
  assert.equal(readFeedCache(store, 2001).feed.pinnedPost, null);
});

test("a fresh timeline does not renew an unverified pinned post", () => {
  const store = storage();
  writeFeedCache(store, { status: "ok", posts: [], pinnedPost: { id: "456" }, pinnedStatus: "stale" }, 1000);
  assert.equal(readFeedCache(store, 1001).feed.pinnedPost, null);
  assert.equal(readFeedCache(store, 1001).feed.pinnedStatus, "unavailable");
});

test("speculative images are disabled on slow or metered connections", () => {
  assert.equal(canPrefetch({ saveData: true, effectiveType: "4g" }), false);
  for (const effectiveType of ["slow-2g", "2g", "3g"]) assert.equal(canPrefetch({ effectiveType }), false);
  assert.equal(canPrefetch({ effectiveType: "4g" }), true);
});

test("concurrent feed consumers share a request and fresh reads retain its success timestamp", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return { ok: true, json: async () => ({ status: "ok", posts: [], pinnedStatus: "none" }) };
  };
  try {
    const first = fetchFeed();
    assert.equal(fetchFeed(), first);
    await first;
    const savedAt = getFeedSnapshot().savedAt;
    assert.equal((await fetchFeed()).status, "ok");
    assert.equal(calls, 1);
    assert.equal(getFeedSnapshot().savedAt, savedAt);
  } finally {
    globalThis.fetch = original;
  }
});

for (const pinnedStatus of ["unavailable", "stale", undefined, "unexpected"]) {
  test(`real feed cache recovers a partial response (${String(pinnedStatus)}) without waiting 15 minutes`, async () => {
    const originalFetch = globalThis.fetch;
    const originalNow = Date.now;
    let time = 1000;
    let calls = 0;
    const partial = { status: "ok", posts: [], ...(pinnedStatus === undefined ? {} : { pinnedStatus }) };
    globalThis.fetch = async () => {
      calls++;
      return { ok: true, json: async () => (calls === 1 ? partial : { ...partial, pinnedStatus: "none" }) };
    };
    Date.now = () => time;
    try {
      const feed = await import(`../src/feed-cache.js?recovery=${String(pinnedStatus)}`);
      assert.deepEqual(await feed.fetchFeed(), partial);
      assert.deepEqual(feed.getFeedSnapshot().feed, partial);
      assert.equal(feed.getFeedRetryAfter(), 30_000);
      time += 29_999;
      await feed.fetchFeed({ force: true });
      assert.equal(calls, 1);
      time++;
      const recovered = await Promise.all(Array.from({ length: 8 }, () => feed.fetchFeed()));
      assert.ok(recovered.every((value) => value.pinnedStatus === "none"));
      assert.equal(calls, 2);
      time += 15 * 60 * 1000 - 1;
      await feed.fetchFeed();
      assert.equal(calls, 2);
    } finally {
      globalThis.fetch = originalFetch;
      Date.now = originalNow;
    }
  });
}
