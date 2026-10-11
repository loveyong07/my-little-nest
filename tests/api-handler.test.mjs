import assert from "node:assert/strict";
import test from "node:test";
import { JSON_CDN_CACHE_CONTROL, JSON_CDN_CACHE_CONTROL_RETRY, createApiHandler } from "../server/api-handler.mjs";
import { signingSecret } from "../server/x-media-auth.mjs";

const request = (path, init) => new Request(`https://example.test${path}`, init);

test("paths outside the four API routes are left to the runtime", async () => {
  const handleApi = createApiHandler({});
  for (const path of ["/", "/posts", "/api/missing", "/api/x-posts/extra"]) {
    assert.equal(await handleApi(request(path)), null, path);
  }
});

test("feed routes answer without a credential and keep browsers from caching", async () => {
  const handleApi = createApiHandler({});
  const posts = await handleApi(request("/api/x-posts"));
  assert.equal(posts.status, 200);
  assert.deepEqual(await posts.json(), { status: "unavailable", posts: [] });
  assert.equal(posts.headers.get("cache-control"), "no-store");
  assert.equal(
    posts.headers.get("vercel-cdn-cache-control"),
    JSON_CDN_CACHE_CONTROL_RETRY,
    "unavailable is retried soon",
  );
  assert.match(posts.headers.get("content-type"), /^application\/json/);

  const profile = await handleApi(request("/api/x-profile"));
  assert.deepEqual(await profile.json(), { status: "unavailable" });
});

test("feed routes accept only GET", async () => {
  const handleApi = createApiHandler({});
  for (const [path, body] of [
    ["/api/x-posts", { status: "method_not_allowed", posts: [] }],
    ["/api/x-profile", { status: "method_not_allowed" }],
  ]) {
    const response = await handleApi(request(path, { method: "POST" }));
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET");
    assert.deepEqual(await response.json(), body);
  }
});

test("media routes reach the signed proxies", async () => {
  let upstream = 0;
  const handleApi = createApiHandler(
    { X_MEDIA_SIGNING_SECRET: "test-secret" },
    {
      fetchImpl: async () => {
        upstream += 1;
        return new Response("never");
      },
    },
  );
  const image = await handleApi(request("/api/x-media?url=" + encodeURIComponent("https://pbs.twimg.com/media/a.jpg")));
  const video = await handleApi(request("/api/x-video?url=" + encodeURIComponent("https://example.com/v.mp4")));
  assert.equal(image.status, 403, "unsigned, non-legacy image");
  assert.equal(video.status, 400, "video from another host");
  assert.equal(upstream, 0);
});

test("a dedicated signing secret wins over the X credential", () => {
  assert.equal(signingSecret({ X_MEDIA_SIGNING_SECRET: "signing", X_BEARER_TOKEN: "token" }), "signing");
  assert.equal(signingSecret({ X_BEARER_TOKEN: "token" }), "token");
  assert.equal(signingSecret({}), "");
});

test("the X credential stays on the server", async () => {
  const handleApi = createApiHandler(
    { X_BEARER_TOKEN: "private-test-token" },
    {
      fetchImpl: async (url, options) => {
        assert.equal(options.headers.Authorization, "Bearer private-test-token");
        const body = new URL(url).pathname.endsWith("/users/2061726102180311040")
          ? { data: { id: "2061726102180311040", username: "loveyong07", name: "初咏" } }
          : {
              data: [
                { id: "456", text: "Original", author_id: "2061726102180311040", created_at: "2026-09-26T00:00:00Z" },
              ],
            };
        return new Response(JSON.stringify(body), { status: 200 });
      },
    },
  );
  const response = await handleApi(request("/api/x-posts"));
  assert.equal(
    response.headers.get("vercel-cdn-cache-control"),
    JSON_CDN_CACHE_CONTROL,
    "a live feed is shared longer",
  );
  const text = await response.text();
  assert.ok(!text.includes("private-test-token"));
  assert.deepEqual(
    JSON.parse(text).posts.map((post) => post.id),
    ["456"],
  );
});

for (const [status, pinnedStatus, complete] of [
  ["ok", "ok", true],
  ["ok", "none", true],
  ["ok", "unavailable", false],
  ["ok", "stale", false],
  ["stale", "ok", false],
  ["unavailable", "none", false],
  ["ok", undefined, false],
  ["ok", "unexpected", false],
  ["ok", null, false],
]) {
  test(`posts response headers: ${status}/${String(pinnedStatus)}`, async () => {
    const body = { status, posts: [], ...(pinnedStatus === undefined ? {} : { pinnedStatus }) };
    const handleApi = createApiHandler({}, { serviceFactory: () => async () => body });
    const result = await handleApi(request("/api/x-posts"));
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal(
      result.headers.get("vercel-cdn-cache-control"),
      complete ? "public, s-maxage=300, stale-while-revalidate=600" : "public, s-maxage=60",
    );
    assert.deepEqual(await result.json(), body);
  });
}

for (const status of ["ok", "stale", "unavailable", "unexpected"]) {
  test(`profile response headers remain independent of pin state: ${status}`, async () => {
    const body = { status };
    const service = Object.assign(async () => ({}), { getProfile: async () => body });
    const handleApi = createApiHandler({}, { serviceFactory: () => service });
    const result = await handleApi(request("/api/x-profile"));
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal(
      result.headers.get("vercel-cdn-cache-control"),
      status === "ok" ? "public, s-maxage=300, stale-while-revalidate=600" : "public, s-maxage=60",
    );
    assert.deepEqual(await result.json(), body);
  });
}

test("unexpected service exceptions use the retry response headers on both routes", async () => {
  const fail = async () => {
    throw new Error("upstream failed");
  };
  const handleApi = createApiHandler({}, { serviceFactory: () => Object.assign(fail, { getProfile: fail }) });
  for (const path of ["/api/x-posts", "/api/x-profile"]) {
    const result = await handleApi(request(path));
    assert.equal(result.status, 503);
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal(result.headers.get("vercel-cdn-cache-control"), "public, s-maxage=60");
    assert.equal((await result.json()).status, "unavailable");
  }
});
