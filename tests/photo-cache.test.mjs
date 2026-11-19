import assert from "node:assert/strict";
import test from "node:test";
import { createBlobPhotoCache, photoCachePath, MAX_PHOTO_BYTES } from "../server/photo-cache.mjs";
import { collectPhotoLinks, warmPhotoCache } from "../server/photo-cache-warm.mjs";
import { signedMediaUrl } from "../server/x-media-auth.mjs";
import { proxyXMedia } from "../server/x-media.mjs";

const source = "https://pbs.twimg.com/media/Persistent?format=jpg&name=orig";
const auth = { secret: "photo-test-secret", now: Date.UTC(2026, 9, 22) };
const env = { BLOB_READ_WRITE_TOKEN: "test-server-only-token" };
const image = new Uint8Array([1, 2, 3]);
const request = (path) =>
  new Request(new URL(path, "https://site.test"), {
    headers: { "Sec-Fetch-Site": "same-origin" },
  });
const upstream = () => new Response(image, { headers: { "Content-Type": "image/jpeg" } });
const cachedBlob = (body = image, extra = {}) => ({
  statusCode: 200,
  stream: new Response(body).body,
  blob: { size: image.byteLength, contentType: "image/webp", ...extra },
});

test("persistent hits avoid X and encoding but still enforce signatures, context and expiry", async () => {
  const path = await signedMediaUrl(source, "image", { ...auth, format: "webp" });
  let reads = 0;
  const options = {
    photoCache: {
      read: async () => {
        reads++;
        return { image, contentType: "image/webp" };
      },
    },
  };
  const unexpected = () => {
    throw new Error("upstream must not run");
  };
  const response = await proxyXMedia(request(path), unexpected, auth, { ...options, webpEncoder: unexpected });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-nest-photo-cache"), "hit");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), image);
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.ok(response.headers.get("cache-control").includes("max-age=86400"));
  const invalid = request(path.replace(/signature=./, "signature=z"));
  assert.equal((await proxyXMedia(invalid, unexpected, auth, options)).status, 403);
  const external = new Request(new URL(path, "https://site.test"), { headers: { "Sec-Fetch-Site": "cross-site" } });
  assert.equal((await proxyXMedia(external, unexpected, auth, options)).status, 403);
  assert.equal(
    (await proxyXMedia(request(path), unexpected, { ...auth, now: auth.now + 9 * 86400000 }, options)).status,
    403,
  );
  assert.equal(reads, 1);
});

test("storage failures preserve original-byte fallback and background writes do not delay delivery", async () => {
  const path = await signedMediaUrl(source, "image", { ...auth, format: "webp" });
  const tasks = [];
  let release;
  let written;
  const response = await proxyXMedia(request(path), upstream, auth, {
    webpEncoder: async () => null,
    photoCache: {
      read: async () => {
        throw new Error("quota unavailable");
      },
      write: async (...args) => {
        written = args;
        await new Promise((resolve) => {
          release = resolve;
        });
      },
    },
    defer: (task) => tasks.push(task),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/jpeg");
  assert.equal(response.headers.get("x-nest-photo-cache"), "miss");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), image);
  assert.equal(written[0], source);
  assert.equal(written[2], "image/jpeg");
  release();
  await Promise.all(tasks);
});

test("a temporary encode failure neither persists nor caches its original response", async () => {
  const path = await signedMediaUrl(source, "image", { ...auth, format: "webp" });
  const deferred = [];
  let cached = null;
  let attempts = 0;
  const options = {
    photoCache: {
      read: async () => cached,
      write: async (_source, bytes, contentType) => {
        cached = { image: bytes, contentType };
        return "written";
      },
    },
    defer: (task) => deferred.push(task),
    webpEncoder: async () => {
      if (++attempts === 1) throw new Error("Temporary fixture error");
      return image;
    },
  };
  const fallback = await proxyXMedia(request(path), upstream, auth, options);
  assert.deepEqual(new Uint8Array(await fallback.arrayBuffer()), image);
  assert.equal(fallback.headers.get("content-type"), "image/jpeg");
  assert.equal(fallback.headers.get("cache-control"), "no-store");
  assert.equal(fallback.headers.get("vercel-cdn-cache-control"), "no-store");
  assert.equal(deferred.length, 0);
  const converted = await proxyXMedia(request(path), upstream, auth, options);
  await Promise.all(deferred);
  assert.equal(converted.headers.get("content-type"), "image/webp");
  assert.equal(cached.contentType, "image/webp");
  assert.equal(attempts, 2);
});

test("large Blob hits, WebPs and fallback originals send complete bodies in multiple chunks", async () => {
  const path = await signedMediaUrl(source, "image", { ...auth, format: "webp" });
  const large = new Uint8Array(5 * 1024 * 1024).map((_, index) => (index + Math.floor(index / 65536)) % 251);
  for (const [contentType, read, encode] of [
    ["image/webp", async () => ({ image: large, contentType: "image/webp" }), async () => assert.fail("Blob hit")],
    ["image/webp", async () => null, async () => large],
    ["image/jpeg", async () => null, async () => null],
  ]) {
    const response = await proxyXMedia(
      request(path),
      async () => new Response(large, { headers: { "Content-Type": "image/jpeg" } }),
      auth,
      { photoCache: { read }, webpEncoder: encode },
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), contentType);
    const chunks = [];
    for await (const chunk of response.body) chunks.push(chunk);
    assert.ok(chunks.length > 1);
    assert.deepEqual(Buffer.concat(chunks), Buffer.from(large));
  }
});

test("avatar and poster requests retain their existing streaming path", async () => {
  for (const url of [
    "https://pbs.twimg.com/profile_images/1/avatar.jpg",
    "https://pbs.twimg.com/ext_tw_video_thumb/1/poster.jpg",
  ]) {
    const path = await signedMediaUrl(url, "image", auth);
    const response = await proxyXMedia(request(path), upstream, auth, {
      photoCache: {
        read: () => {
          throw new Error("must not read photo cache");
        },
      },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-nest-photo-cache"), null);
    await response.arrayBuffer();
  }
});

test("an upstream WebP is also persisted without re-encoding its original bytes", async () => {
  const path = await signedMediaUrl(source, "image", { ...auth, format: "webp" });
  let stored;
  const tasks = [];
  const response = await proxyXMedia(
    request(path),
    () =>
      new Response(image, {
        headers: { "Content-Type": "image/webp", "Content-Length": "3" },
      }),
    auth,
    {
      webpEncoder: () => {
        throw new Error("must not encode existing WebP");
      },
      photoCache: {
        read: async () => null,
        write: async (_source, bytes) => {
          stored = bytes;
        },
      },
      defer: (task) => tasks.push(task),
    },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), image);
  await Promise.all(tasks);
  assert.deepEqual(stored, image);
});

test("cache keys are deterministic and exclude avatars, small variants and animation", async () => {
  const key = await photoCachePath(source);
  assert.equal(key, await photoCachePath(source));
  assert.match(key, /^x-photos\/original-q90-v2\/[a-f0-9]{64}\.image$/);
  for (const value of [
    source.replace("name=orig", "name=small"),
    source.replace("format=jpg", "format=gif"),
    "https://evil.test/media/x?format=jpg&name=orig",
  ])
    assert.equal(await photoCachePath(value), null);
  assert.equal(createBlobPhotoCache({ env: {} }), null);
});

test("legacy WebPs stay readable while legacy original bytes can be encoded again", async () => {
  let contentType = "image/webp";
  const key = await photoCachePath(source);
  const legacy = key.replace("q90-v2", "q90-v1");
  const cache = createBlobPhotoCache({
    env,
    sdk: {
      get: async (pathname) => (pathname === legacy ? cachedBlob(image, { contentType }) : null),
    },
  });
  assert.deepEqual(await cache.read(source), { image, contentType: "image/webp" });
  contentType = "image/jpeg";
  assert.equal(await cache.read(source), null);
});

test("private reads validate type and size; stalled body reads are cancelled", async () => {
  let options;
  const cache = createBlobPhotoCache({
    env,
    sdk: {
      get: async (_key, input) => {
        options = input;
        return cachedBlob();
      },
    },
  });
  assert.deepEqual(await cache.read(source), { image, contentType: "image/webp" });
  assert.equal(options.access, "private");
  assert.equal(options.token, env.BLOB_READ_WRITE_TOKEN);
  for (const extra of [{ contentType: "text/html" }, { size: MAX_PHOTO_BYTES + 1 }, { size: 4 }]) {
    const bad = createBlobPhotoCache({ env, sdk: { get: async () => cachedBlob(image, extra) } });
    assert.equal(await bad.read(source), null);
  }
  let cancelled = false;
  const stalled = createBlobPhotoCache({
    env,
    readTimeoutMs: 10,
    sdk: {
      get: async () => ({
        ...cachedBlob(),
        stream: new ReadableStream({
          cancel: () => {
            cancelled = true;
          },
        }),
      }),
    },
  });
  // Keep the test alive while AbortSignal.timeout's unref'ed timer runs.
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    assert.equal(await stalled.read(source), null);
  } finally {
    clearTimeout(keepAlive);
  }
  assert.equal(cancelled, true);
});

test("writes stop at the storage budget, deduplicate concurrency and contain outages", async () => {
  let puts = 0;
  let putOptions;
  const sdk = {
    list: async () => ({ blobs: [{ size: 3 }], hasMore: false }),
    put: async (_key, _bytes, options) => {
      puts++;
      putOptions = options;
    },
  };
  const full = createBlobPhotoCache({ env, sdk, maxBytes: 5 });
  assert.equal(await full.write(source, image, "image/webp"), false);
  assert.equal(puts, 0);
  const cache = createBlobPhotoCache({ env, sdk, maxBytes: 20 });
  assert.deepEqual(
    await Promise.all([cache.write(source, image, "image/webp"), cache.write(source, image, "image/webp")]),
    ["written", "written"],
  );
  assert.equal(puts, 1);
  assert.equal(putOptions.access, "private");
  assert.equal(putOptions.addRandomSuffix, false);
  assert.equal(putOptions.allowOverwrite, false);
  const failed = createBlobPhotoCache({
    env,
    sdk: {
      list: async () => {
        throw new Error("offline");
      },
    },
  });
  assert.equal(await failed.write(source, image, "image/webp"), false);
  assert.equal(await failed.read(source), null);
  const readOnly = createBlobPhotoCache({
    env,
    sdk: {
      get: async () => cachedBlob(),
      list: async () => {
        throw new Error("write quota exhausted");
      },
    },
  });
  assert.equal(await readOnly.write(source, image, "image/webp"), false);
  assert.deepEqual(await readOnly.read(source), { image, contentType: "image/webp" });
});

test("a concurrent create satisfies the same key and leaves later Blob writes available", async () => {
  const first = await photoCachePath(source);
  const next = source.replace("Persistent", "Another");
  const cache = createBlobPhotoCache({
    env,
    sdk: {
      list: async () => ({ blobs: [], hasMore: false }),
      put: async (pathname) => {
        if (pathname === first) throw new Error("Fixture: concurrently created");
      },
      head: async (pathname) => {
        assert.equal(pathname, first);
        return { pathname, contentType: "image/webp", size: image.length };
      },
    },
  });
  assert.equal(await cache.write(source, image, "image/webp"), "exists");
  assert.equal(await cache.write(next, image, "image/webp"), "written");
});

test("prewarming deduplicates Article repetitions and skips avatars and already cached photos", async () => {
  const first = await signedMediaUrl(source, "image", { ...auth, format: "webp" });
  const nextSource = source.replace("Persistent?", "Next?");
  const second = await signedMediaUrl(nextSource, "image", { ...auth, format: "webp" });
  const avatar = await signedMediaUrl("https://pbs.twimg.com/profile_images/1/avatar.jpg", "image", auth);
  const feed = {
    status: "ok",
    posts: [{ media: [{ proxyUrl: first }, { proxyUrl: second }] }],
    articles: [{ blocks: [{ proxyUrl: first }] }],
    avatar,
  };
  assert.equal(collectPhotoLinks(feed).length, 2);
  let fetched = 0;
  let written = 0;
  const result = await warmPhotoCache({
    origin: "https://site.test",
    cache: {
      read: async (url) => (url === source ? { image } : null),
      write: async () => {
        written++;
        return "written";
      },
    },
    fetchImpl: async (url) => {
      if (url.pathname === "/api/x-posts") return Response.json(feed);
      fetched++;
      assert.equal(url.searchParams.get("url"), nextSource);
      return new Response(image, { headers: { "Content-Type": "image/webp" } });
    },
  });
  assert.deepEqual(result, { total: 2, cached: 1, uploaded: 1, failed: 0, bytes: 3 });
  assert.equal(fetched, 1);
  assert.equal(written, 1);
});

test("prewarming counts a concurrently written object and skips temporary fallback bytes", async () => {
  const fallbackSource = source.replace("Persistent", "TryAgain");
  const signed = await Promise.all(
    [source, fallbackSource].map((url) => signedMediaUrl(url, "image", { ...auth, format: "webp" })),
  );
  const result = await warmPhotoCache({
    origin: "https://site.test",
    cache: {
      read: async () => null,
      write: async (url) => {
        assert.equal(url, source);
        return "exists";
      },
    },
    fetchImpl: async (url) => {
      if (url.pathname === "/api/x-posts") return Response.json({ status: "ok", posts: signed });
      return new Response(image, {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": url.searchParams.get("url") === fallbackSource ? "no-store" : "public",
        },
      });
    },
  });
  assert.deepEqual(result, { total: 2, cached: 1, uploaded: 0, failed: 1, bytes: 0 });
});

test("records function-level Blob cache outcomes, reasons and media proxy timings", async () => {
  const path = await signedMediaUrl(source, "image", { ...auth, format: "webp" });
  const events = [];
  let hasBlob = false;
  const photoCache = createBlobPhotoCache({
    env,
    maxBytes: 10,
    onEvent: (event) => events.push(event),
    sdk: {
      get: async () => (hasBlob ? cachedBlob() : null),
      list: async () => ({ blobs: [{ size: 9 }], hasMore: false }),
      put: async () => {
        throw new Error("should not write over budget");
      },
    },
  });

  const tasks = [];
  const missResponse = await proxyXMedia(request(path), upstream, auth, {
    photoCache,
    webpEncoder: async (bytes) => bytes,
    defer: (task) => tasks.push(task),
    onEvent: (event) => events.push(event),
  });
  await Promise.all(tasks);
  assert.equal(missResponse.headers.get("x-nest-photo-cache"), "miss");
  assert.ok(
    events.some(
      (e) =>
        e.type === "x_photo_cache" && e.layer === "function_blob" && e.outcome === "miss" && e.reason === "not_found",
    ),
  );
  assert.ok(
    events.some(
      (e) =>
        e.type === "x_photo_cache" &&
        e.operation === "write" &&
        e.outcome === "skipped" &&
        e.reason === "budget_exceeded",
    ),
  );
  assert.ok(events.some((e) => e.type === "x_media_proxy" && e.cache === "blob_miss" && e.outcome === "ok"));

  events.length = 0;
  hasBlob = true;
  const hitResponse = await proxyXMedia(request(path), upstream, auth, {
    photoCache,
    onEvent: (event) => events.push(event),
  });
  assert.equal(hitResponse.headers.get("x-nest-photo-cache"), "hit");
  assert.ok(events.some((e) => e.type === "x_photo_cache" && e.layer === "function_blob" && e.outcome === "hit"));
  assert.ok(events.some((e) => e.type === "x_media_proxy" && e.cache === "blob_hit" && e.outcome === "ok"));
});

test("evicts oldest photo blobs when budget is exceeded and skips v1 lookup when no legacy blobs exist", async () => {
  const deleted = [];
  const reads = [];
  const sdk = {
    list: async () => ({
      blobs: [
        {
          pathname: "x-photos/original-q90-v2/oldest.image",
          url: "https://blob.test/oldest.image",
          size: 4,
          uploadedAt: "2026-09-01T00:00:00Z",
        },
        {
          pathname: "x-photos/original-q90-v2/newer.image",
          url: "https://blob.test/newer.image",
          size: 4,
          uploadedAt: "2026-10-01T00:00:00Z",
        },
      ],
      hasMore: false,
    }),
    del: async (urls) => {
      deleted.push(...urls);
    },
    put: async () => {},
    get: async (pathname) => {
      reads.push(pathname);
      return null;
    },
  };
  const cache = createBlobPhotoCache({ env, sdk, maxBytes: 10 });
  assert.equal(await cache.write(source, image, "image/webp"), "written");
  assert.deepEqual(deleted, ["https://blob.test/oldest.image"]);
  // Inventory saw zero v1 blobs, so subsequent misses only read v2 once.
  assert.equal(await cache.read(source), null);
  assert.equal(reads.length, 1);
  assert.ok(reads[0].startsWith("x-photos/original-q90-v2/"));
});

test("a write that cannot fit leaves eviction candidates available for a smaller write", async () => {
  const deleted = [];
  const cache = createBlobPhotoCache({
    env,
    maxBytes: 10,
    sdk: {
      list: async () => ({
        blobs: [
          { size: 9, pathname: "unrelated" },
          {
            size: 1,
            pathname: "x-photos/original-q90-v2/old.image",
            url: "https://blob.test/old.image",
            uploadedAt: "2026-09-01T00:00:00Z",
          },
        ],
        hasMore: false,
      }),
      del: async (urls) => deleted.push(...urls),
      put: async () => {},
    },
  });
  assert.equal(await cache.write(source, image, "image/webp"), false);
  assert.deepEqual(deleted, []);
  assert.equal(await cache.write(source, image.subarray(0, 1), "image/webp"), "written");
  assert.deepEqual(deleted, ["https://blob.test/old.image"]);
});
