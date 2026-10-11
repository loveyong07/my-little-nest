import assert from "node:assert/strict";
import test from "node:test";
import worker from "../worker/index.js";

test("serves the X feed API without a credential or asset fallback", async () => {
  let assetCalls = 0;
  const env = {
    ASSETS: { fetch: async () => { assetCalls += 1; return new Response("asset"); } },
  };
  const response = await worker.fetch(new Request("https://example.test/api/x-posts"), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "unavailable", posts: [] });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(assetCalls, 0);

  const rejected = await worker.fetch(new Request("https://example.test/api/x-posts", { method: "POST" }), env);
  assert.equal(rejected.status, 405);
  assert.equal(rejected.headers.get("allow"), "GET");
});

test("serves the profile API without a credential or asset fallback", async () => {
  const env = { ASSETS: { fetch: () => { throw new Error("Should not request assets"); } } };
  const response = await worker.fetch(new Request("https://example.test/api/x-profile"), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "unavailable" });
});

test("serves original posts from the Worker without exposing its token", async () => {
  const priorFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, "Bearer private-test-token");
    const body = new URL(url).pathname.endsWith("/users/2061726102180311040")
      ? { data: { id: "2061726102180311040", username: "loveyong07", name: "初咏" } }
      : { data: [{ id: "456", text: "Original post", author_id: "2061726102180311040", created_at: "2026-09-26T00:00:00Z" }] };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  try {
    const response = await worker.fetch(new Request("https://example.test/api/x-posts"), {
      X_BEARER_TOKEN: "private-test-token",
      ASSETS: { fetch: () => { throw new Error("Should not request assets"); } },
    });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(!text.includes("private-test-token"));
    const feed = JSON.parse(text);
    assert.equal(feed.status, "ok");
    assert.deepEqual(feed.posts.map((post) => post.id), ["456"]);
  } finally {
    globalThis.fetch = priorFetch;
  }
});

test("serves existing static assets without a fallback", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://example.test/assets/app.js"), {
    ASSETS: {
      fetch: async (request) => {
        calls.push(new URL(request.url).pathname);
        return new Response("asset", { status: 200 });
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/assets/app.js"]);
});

test("falls back to index.html for an unknown app route", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.test/flow/step-two?source=share", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          calls.push(url.pathname + url.search);
          return new Response(url.pathname === "/index.html" ? "app" : "missing", {
            status: url.pathname === "/index.html" ? 200 : 404,
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/flow/step-two?source=share", "/index.html"]);
});

test("does not turn missing API or write requests into the app shell", async () => {
  for (const request of [
    new Request("https://example.test/api/missing", { headers: { accept: "application/json" } }),
    new Request("https://example.test/flow", { method: "POST", headers: { accept: "text/html" } }),
  ]) {
    let calls = 0;
    const response = await worker.fetch(request, {
      ASSETS: {
        fetch: async () => {
          calls += 1;
          return new Response("missing", { status: 404 });
        },
      },
    });

    assert.equal(response.status, 404);
    assert.equal(calls, 1);
  }
});

// The Sites packaging file assertions live in tests/build/artifacts.test.mjs,
// which runs after `npm run build` as part of `npm run check`.
