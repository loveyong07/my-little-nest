import assert from "node:assert/strict";
import test from "node:test";
import { createBlobVideoCache } from "../server/video-cache.mjs";
import { signedMediaUrl } from "../server/x-media-auth.mjs";
import { proxyXVideo } from "../server/x-video.mjs";

const source = "https://video.twimg.com/tweet_video/animated.mp4";
const bytes = Uint8Array.of(0, 1, 2, 3, 4, 5);
const auth = { secret: "video-cache-test-secret", now: Date.UTC(2026, 10, 23) };
const env = { BLOB_READ_WRITE_TOKEN: "test-blob-token" };
const videoHeaders = { "Content-Type": "video/mp4" };

function mp4(body, headers = {}, status = 200) {
  return new Response(body, {
    status,
    headers: { ...videoHeaders, "Content-Length": String(body.length), ...headers },
  });
}

test("a signed GIF MP4 is streamed cold and reused from private Blob on subsequent ranges", async () => {
  const deferred = [];
  const stored = new Map();
  let sourceRequests = 0;
  const videoCache = createBlobVideoCache({
    env,
    sdk: {
      async list() {
        return { blobs: [] };
      },
      async put(pathname, body, options) {
        assert.match(pathname, /^x-videos\/mp4-v1\/[a-f0-9]{64}\.mp4$/);
        assert.equal(options.access, "private");
        assert.equal(options.allowOverwrite, false);
        assert.equal(options.addRandomSuffix, false);
        assert.deepEqual(body, bytes);
        stored.set(pathname, body);
      },
      async get(pathname, options) {
        if (!stored.has(pathname)) return null;
        assert.equal(options.access, "private");
        if (options.headers) assert.equal(options.headers.Range, "bytes=-2");
        const video = stored.get(pathname);
        const response = options.headers
          ? mp4(video.slice(-2), { ETag: '"blob"', "Content-Range": "bytes 4-5/6" }, 206)
          : mp4(video, { ETag: '"blob"' });
        return {
          statusCode: 200,
          stream: response.body,
          headers: response.headers,
          blob: { contentType: "video/mp4" },
        };
      },
    },
  });
  async function fetchSource(url, options) {
    sourceRequests++;
    assert.equal(url, source);
    assert.equal(options.redirect, "error");
    const range = new Headers(options.headers).get("range");
    if (!range) return mp4(bytes);
    assert.equal(range, "bytes=0-1");
    return mp4(bytes.slice(0, 2), { "Content-Range": "bytes 0-1/6" }, 206);
  }
  async function read(range, signing, ifRange) {
    const url = new URL(await signedMediaUrl(source, "video", signing), "https://nest.test");
    const headers = { Range: range, "Sec-Fetch-Site": "same-origin", ...(ifRange ? { "If-Range": ifRange } : {}) };
    const request = new Request(url, { headers });
    return proxyXVideo(request, fetchSource, signing, { videoCache, defer: (task) => deferred.push(task) });
  }

  const miss = await read("bytes=0-1", auth);
  assert.equal(miss.status, 206);
  assert.equal(miss.headers.get("x-nest-video-cache"), "miss");
  assert.deepEqual(await miss.bytes(), bytes.slice(0, 2));
  assert.equal(deferred.length, 1);
  await deferred[0];
  assert.equal(stored.size, 1);
  assert.equal(sourceRequests, 2);

  const nextDay = { ...auth, now: auth.now + 86_400_000 };
  const hit = await read("bytes=-2", nextDay);
  assert.equal(hit.status, 206);
  assert.equal(hit.headers.get("x-nest-video-cache"), "hit");
  assert.equal(hit.headers.get("content-range"), "bytes 4-5/6");
  assert.equal(hit.headers.get("content-length"), "2");
  assert.deepEqual(await hit.bytes(), bytes.slice(-2));

  const matchingRange = await read("bytes=-2", nextDay, '"blob"');
  assert.equal(matchingRange.status, 206);
  assert.deepEqual(await matchingRange.bytes(), bytes.slice(-2));
  const full = await read("bytes=-2", nextDay, '"previous"');
  assert.equal(full.status, 200);
  assert.equal(full.headers.get("content-range"), null);
  assert.deepEqual(await full.bytes(), bytes);
  assert.equal(sourceRequests, 2);
  assert.equal(deferred.length, 1);
});

test("cache admission skips large videos and respects the total store and video budgets", async () => {
  for (const blob of [
    { pathname: "other", size: 750_000_000 },
    { pathname: "x-videos/mp4-v1/existing.mp4", size: 500_000_000 },
  ]) {
    const videoCache = createBlobVideoCache({
      env,
      sdk: {
        list: async () => ({ blobs: [blob] }),
      },
    });
    let downloads = 0;
    const download = async () => {
      downloads++;
      return mp4(bytes);
    };
    assert.equal(videoCache.warm(source, 100_000_001, download), null);
    await videoCache.warm(source, bytes.length, download);
    assert.equal(downloads, 0);
  }
});

test("a truncated download is never written and its slot is released for a retry", async () => {
  let uploads = 0;
  const videoCache = createBlobVideoCache({
    env,
    sdk: {
      list: async () => ({ blobs: [] }),
      put: async () => {
        uploads++;
      },
    },
  });
  const pending = videoCache.warm(source, bytes.length, async () =>
    mp4(bytes.slice(0, 2), { "Content-Length": String(bytes.length) }),
  );
  assert.equal(
    videoCache.warm(source, bytes.length, async () => mp4(bytes)),
    null,
  );
  await pending;
  assert.equal(uploads, 0);
  await videoCache.warm(source, bytes.length, async () => mp4(bytes));
  assert.equal(uploads, 1);
});

test("an unavailable Blob lookup falls back to X without scheduling a second download", async () => {
  const videoCache = createBlobVideoCache({
    env,
    sdk: {
      async get() {
        throw new Error("storage unavailable");
      },
    },
  });
  const url = new URL(await signedMediaUrl(source, "video", auth), "https://nest.test");
  const response = await proxyXVideo(new Request(url), async () => mp4(bytes), auth, {
    videoCache,
    defer: () => assert.fail("storage failure should not warm"),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.bytes(), bytes);
});
