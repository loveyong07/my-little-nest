import test from "node:test";
import assert from "node:assert/strict";
import { readFeedCache, writeFeedCache, canPrefetch, fetchFeed, getFeedSnapshot } from "../src/feed-cache.js";

function storage() {
  let value = null;
  return {
    getItem: () => value,
    setItem: (_, next) => {
      value = next;
    },
  };
}

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
