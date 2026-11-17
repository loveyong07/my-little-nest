import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createXFeedService } from "../server/x-feed-service.mjs";
import { createApiHandler } from "../server/api-handler.mjs";
import { createSharedRequest, REQUEST_TIMEOUT_MS } from "../src/request-cache.js";
import { FEED_REFRESH_TIMEOUT_MS, FEED_ABORT_GRACE_MS, JSON_REQUEST_TIMEOUT_MS } from "../shared/request-budgets.mjs";

const account = { id: "2061726102180311040", username: "loveyong07" };
const post = (id) => ({ id, text: "Original", author_id: account.id, created_at: "2026-11-17T00:00:00Z" });
const event = { ...post("110"), referenced_tweets: [{ type: "retweeted", id: "90" }] };
const writer = { id: "42", username: "writer", name: "Writer" };
const detail = { ...post("90"), author_id: writer.id };
const flush = () => new Promise((resolve) => setImmediate(resolve));

function abortableDelay(delay, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, delay);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

test("a successful 13.5-second cold feed reaches the real client instead of timing out at 12 seconds", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const api = createApiHandler(
    { X_BEARER_TOKEN: "fixture-only" },
    {
      articleFetchImpl: null,
      fetchImpl: async (input, { signal }) => {
        calls++;
        await abortableDelay(4500, signal);
        const path = new URL(input).pathname;
        if (path === `/2/users/${account.id}`) return Response.json({ data: account });
        if (path === "/2/tweets") return Response.json({ data: [detail], includes: { users: [writer] } });
        return Response.json({ data: [post("100"), event] });
      },
    },
  );
  const client = createSharedRequest({
    url: "/api/x-posts",
    isSuccess: (feed) => feed.status === "ok",
    fetchImpl: (_url, options) => api(new Request("https://nest.test/api/x-posts", { signal: options.signal })),
  });
  let settled = false;
  const pending = client.load();
  void pending.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await flush();
  for (const step of [4500, 4500, 3000]) {
    context.mock.timers.tick(step);
    await flush();
  }
  assert.equal(settled, false, "a healthy serial refresh must still be pending at 12 seconds");
  context.mock.timers.tick(1500);
  const feed = await pending;
  assert.equal(feed.status, "ok");
  assert.equal(feed.repostsStatus, "ok");
  assert.equal(feed.reposts[0].id, "90");
  assert.equal(calls, 3);
});

test("the shared refresh budget aborts pagination and preserves the stale snapshot", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let time = 0,
    slow = false,
    aborted = false,
    pages = 0;
  const service = createXFeedService({
    token: "fixture-only",
    now: () => time,
    refreshTimeoutMs: 100,
    articleFetchImpl: null,
    fetchImpl: async (input, { signal }) => {
      if (new URL(input).pathname === `/2/users/${account.id}`) return Response.json({ data: account });
      if (!slow) return Response.json({ data: [post("100")], meta: { newest_id: "100" } });
      pages++;
      signal.addEventListener(
        "abort",
        () => {
          aborted = true;
        },
        { once: true },
      );
      await abortableDelay(40, signal);
      return Response.json({ data: [], meta: { next_token: `page-${pages}` } });
    },
  });
  await service();
  slow = true;
  time = 15 * 60 * 1000;
  const pending = service();
  await flush();
  for (const step of [40, 40, 20]) {
    context.mock.timers.tick(step);
    await flush();
  }
  const feed = await pending;
  assert.equal(aborted, true);
  assert.equal(feed.status, "stale");
  assert.deepEqual(
    feed.posts.map((item) => item.id),
    ["100"],
  );
  assert.equal(pages, 3);
});

test("timing out optional repost details keeps usable original posts and a recoverable section status", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const service = createXFeedService({
    token: "fixture-only",
    refreshTimeoutMs: 100,
    articleFetchImpl: null,
    fetchImpl: async (input, { signal }) => {
      const path = new URL(input).pathname;
      if (path === `/2/users/${account.id}`) return Response.json({ data: account });
      if (path === "/2/tweets") {
        await abortableDelay(500, signal);
        return Response.json({ data: [detail] });
      }
      return Response.json({ data: [post("100"), event] });
    },
  });
  const pending = service();
  await flush();
  context.mock.timers.tick(100);
  const feed = await pending;
  assert.equal(feed.status, "ok");
  assert.deepEqual(
    feed.posts.map((item) => item.id),
    ["100"],
  );
  assert.equal(feed.repostsStatus, "unavailable");
});

test("a transport ignoring cancellation cannot outlive the hard feed response budget", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const service = createXFeedService({
    token: "fixture-only",
    refreshTimeoutMs: 100,
    fetchImpl: () => new Promise(() => {}),
  });
  const pending = service();
  await flush();
  context.mock.timers.tick(100 + FEED_ABORT_GRACE_MS);
  assert.equal((await pending).status, "unavailable");
});

test("a hard pin-only retry deadline still returns the available timeline and retains recovery backoff", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let time = 0,
    mode = "ok",
    timelineCalls = 0;
  const service = createXFeedService({
    token: "fixture-only",
    now: () => time,
    refreshTimeoutMs: 100,
    articleFetchImpl: null,
    fetchImpl: async (input) => {
      const path = new URL(input).pathname;
      if (path === `/2/users/${account.id}`) return Response.json({ data: { ...account, pinned_tweet_id: "99" } });
      if (path === "/2/tweets/99") {
        if (mode === "hang") return new Promise(() => {});
        return mode === "ok" ? Response.json({ data: post("99") }) : new Response("unavailable", { status: 503 });
      }
      timelineCalls++;
      return Response.json({ data: [post("100")], meta: { newest_id: "100" } });
    },
  });
  assert.equal((await service()).pinnedStatus, "ok");
  time = 15 * 60 * 1000;
  mode = "fail";
  assert.equal((await service()).pinnedStatus, "stale");
  const before = timelineCalls;
  time += 60_001;
  mode = "hang";
  const pending = service();
  void pending.catch(() => {});
  await flush();
  context.mock.timers.tick(100 + FEED_ABORT_GRACE_MS);
  const feed = await pending;
  assert.equal(feed.status, "ok");
  assert.equal(feed.pinnedStatus, "stale");
  assert.equal(feed.pinnedPost.id, "99");
  assert.deepEqual(
    feed.posts.map((item) => item.id),
    ["100"],
  );
  assert.equal(timelineCalls, before);
  assert.deepEqual(await service(), feed, "the failed pin keeps the recovery backoff");
});

test("client, server and deployed function deadlines leave room for signing and transport", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url)));
  assert.equal(REQUEST_TIMEOUT_MS, JSON_REQUEST_TIMEOUT_MS);
  assert.ok(FEED_REFRESH_TIMEOUT_MS + FEED_ABORT_GRACE_MS < JSON_REQUEST_TIMEOUT_MS);
  assert.ok(JSON_REQUEST_TIMEOUT_MS < config.functions["api/x-posts.js"].maxDuration * 1000);
});
