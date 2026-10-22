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
  assert.match(key, /^x-photos\/original-q90-v1\/[a-f0-9]{64}\.image$/);
  for (const value of [
    source.replace("name=orig", "name=small"),
    source.replace("format=jpg", "format=gif"),
    "https://evil.test/media/x?format=jpg&name=orig",
  ])
    assert.equal(await photoCachePath(value), null);
  assert.equal(createBlobPhotoCache({ env: {} }), null);
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
    [true, true],
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
        return true;
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
