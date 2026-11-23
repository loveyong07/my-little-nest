import assert from "node:assert/strict";
import test from "node:test";
import { collectVideoSources, createDriveVideoArchive, syncDriveVideos } from "../server/drive-video-archive.mjs";
import { videoCacheKey } from "../server/video-cache.mjs";
import { signedMediaUrl } from "../server/x-media-auth.mjs";
import { proxyXVideo } from "../server/x-video.mjs";

const source = "https://video.twimg.com/tweet_video/animated.mp4";
const bytes = Uint8Array.of(0, 1, 2, 3, 4, 5);
const id = "test-video-file";
const env = {
  BLOB_READ_WRITE_TOKEN: "test-blob-token",
  GOOGLE_DRIVE_CLIENT_ID: "test-client",
  GOOGLE_DRIVE_CLIENT_SECRET: "test-secret",
  GOOGLE_DRIVE_REFRESH_TOKEN: "test-refresh",
};

test("the schedule collects a shared video or GIF source once and ignores unapproved hosts", () => {
  const gif = { type: "video", url: source, animated: true };
  const feed = {
    pinnedPost: { media: [gif] },
    posts: [{ media: [{ url: "https://evil.test/tweet_video/extra.mp4" }], quotedPost: { media: [gif] } }],
    reposts: [{ media: [gif] }],
  };
  assert.deepEqual(collectVideoSources(feed), [source]);
});

test("retry after upload finalizes the same Drive file and later playback only reads that file", async () => {
  const objects = new Map();
  let failedIndex = false;
  let tokenRequests = 0;
  let sourceReads = 0;
  let uploads = 0;
  let file;
  let pending;
  const indexSdk = {
    async get(path, options) {
      assert.equal(options.access, "private");
      const record = objects.get(path);
      return record ? { statusCode: 200, stream: new Response(record).body, blob: { size: record.length } } : null;
    },
    async put(path, body, options) {
      assert.equal(options.access, "private");
      assert.equal(options.allowOverwrite, false);
      if (path.includes("/drive-index-v1/") && !failedIndex) {
        failedIndex = true;
        throw new Error("temporary index failure");
      }
      assert.ok(!objects.has(path));
      objects.set(path, body);
    },
    async list({ prefix }) {
      return { blobs: [...objects.keys()].filter((key) => key.startsWith(prefix)).map((pathname) => ({ pathname })) };
    },
  };
  async function fetchImpl(input, options) {
    const url = new URL(input);
    const headers = new Headers(options.headers);
    if (url.hostname === "oauth2.googleapis.com") {
      tokenRequests++;
      assert.equal(options.body.get("refresh_token"), env.GOOGLE_DRIVE_REFRESH_TOKEN);
      return Response.json({ access_token: "test-access", expires_in: 3600 });
    }
    if (url.href === source) {
      assert.equal(headers.get("authorization"), null);
      sourceReads++;
      return new Response(bytes, { headers: { "Content-Type": "video/mp4", "Content-Length": "6" } });
    }
    assert.equal(headers.get("authorization"), "Bearer test-access");
    if (url.pathname.endsWith("/generateIds")) return Response.json({ ids: [id] });
    if (options.method === "POST") {
      pending = JSON.parse(options.body);
      assert.equal(pending.id, id);
      assert.equal(headers.get("x-upload-content-length"), "6");
      return new Response(null, { headers: { Location: `${url.origin}${url.pathname}?upload_id=session` } });
    }
    if (options.method === "PUT") {
      uploads++;
      assert.deepEqual(await new Response(options.body).bytes(), bytes);
      file = { ...pending, size: "6", trashed: false };
      return Response.json(file);
    }
    if (!url.searchParams.has("alt")) return file ? Response.json(file) : new Response(null, { status: 404 });
    assert.equal(url.pathname, `/drive/v3/files/${id}`);
    const range = headers.get("range");
    const responseHeaders = { "Content-Type": "video/mp4", ETag: '"drive"' };
    return range
      ? new Response(bytes.slice(4), { status: 206, headers: { ...responseHeaders, "Content-Range": "bytes 4-5/6" } })
      : new Response(bytes, { headers: responseHeaders });
  }

  const archive = createDriveVideoArchive({ env, fetchImpl, indexSdk, legacy: null });
  const signal = new AbortController().signal;
  await assert.rejects(archive.archive(source, signal), /index failure/);
  assert.equal(await archive.archive(source, signal), "archived");
  assert.equal(await archive.archive(source, signal, await archive.archivedPaths(signal)), "stored");
  const auth = { secret: "test-media-signing", now: Date.UTC(2026, 10, 23) };
  const url = new URL(await signedMediaUrl(source, "video", auth), "https://nest.test");
  const req = new Request(url, { headers: { Range: "bytes=-2", "Sec-Fetch-Site": "same-origin" } });
  const response = await proxyXVideo(req, fetchImpl, auth, { videoCache: { read: archive.read, warm: () => null } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("x-nest-video-store"), "drive");
  assert.deepEqual(await response.bytes(), bytes.slice(4));
  assert.equal(uploads, 1);
  assert.equal(sourceReads, 1);
  assert.equal(tokenRequests, 1);
});

test("compressed Drive index records with unknown blob size still read, while oversized decoded records fail", async () => {
  const indexBody = JSON.stringify({ id, size: bytes.length });
  const oversized = JSON.stringify({ id, size: bytes.length, pad: "x".repeat(600) });
  let payload = indexBody;
  const archive = createDriveVideoArchive({
    env,
    indexSdk: {
      async get() {
        return { statusCode: 200, stream: new Response(payload).body, blob: { size: 0 } };
      },
      async list() {
        return { blobs: [] };
      },
      async put() {},
    },
    legacy: null,
    drive: {
      async download(fileId) {
        assert.equal(fileId, id);
        return new Response(bytes, { headers: { "Content-Type": "video/mp4" } });
      },
      async generateId() {
        return id;
      },
      async metadata() {
        return null;
      },
      async upload() {
        return null;
      },
    },
  });
  const ok = await archive.read(source, new Headers(), new AbortController().signal);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("x-nest-video-store"), "drive");
  assert.deepEqual(await ok.bytes(), bytes);

  payload = oversized;
  const freshArchive = createDriveVideoArchive({
    env,
    indexSdk: {
      async get() {
        return { statusCode: 200, stream: new Response(payload).body, blob: { size: 0 } };
      },
      async list() {
        return { blobs: [] };
      },
      async put() {},
    },
    legacy: null,
    drive: {
      async download() {
        assert.fail("oversized record must not trigger a Drive download");
      },
      async generateId() {
        return id;
      },
      async metadata() {
        return null;
      },
      async upload() {
        return null;
      },
    },
  });
  assert.equal(await freshArchive.read(source, new Headers(), new AbortController().signal), null);
});

test("syncDriveVideos bounds multi-item stalls, gives a lone large video the full deadline, and sanitizes errors", async () => {
  const storedUrl = "https://video.twimg.com/tweet_video/already.mp4";
  const slowUrl = "https://video.twimg.com/tweet_video/huge.mp4";
  const quickUrl = "https://video.twimg.com/tweet_video/small.mp4";
  const secretUrl = "https://video.twimg.com/tweet_video/broken.mp4";
  const storedPath = `x-videos/drive-index-v1/${await videoCacheKey(storedUrl)}.json`;
  const snapshotFor = (urls) => ({
    configured: true,
    async read() {
      return {
        snapshot: {
          checkpoint: {
            feed: {
              pinnedPost: null,
              posts: urls.map((url) => ({ media: [{ type: "video", url }] })),
              reposts: [],
              articles: [],
            },
          },
        },
      };
    },
  });

  // 1. Multi-item run: already-stored items are counted immediately, a slow item times out at
  // itemTimeoutMs without starving the next item, and raw secret strings are redacted from logs.
  const firstRun = await syncDriveVideos({
    source: snapshotFor([storedUrl, slowUrl, quickUrl, secretUrl]),
    totalTimeoutMs: 400,
    itemTimeoutMs: 35,
    drive: {
      async archivedPaths() {
        return new Set([storedPath]);
      },
      async archive(url, signal) {
        if (url === slowUrl) {
          await new Promise((resolve) => {
            if (signal.aborted) resolve();
            else signal.addEventListener("abort", resolve, { once: true });
          });
          throw signal.reason ?? new Error("aborted");
        }
        if (url === secretUrl) {
          throw new Error("Bearer super-secret-token should never appear");
        }
        return "archived";
      },
    },
  });
  assert.equal(firstRun.stored, 1);
  assert.equal(firstRun.archived, 1);
  assert.equal(firstRun.failed, 2);
  assert.equal(firstRun.remaining, 0);
  assert.deepEqual(firstRun.errors, ["item_timeout", "unknown_error"]);

  // 2. Next run with only the large video left: exceeds itemTimeoutMs (35ms) and succeeds within totalTimeoutMs (300ms).
  const secondRun = await syncDriveVideos({
    source: snapshotFor([storedUrl, slowUrl]),
    totalTimeoutMs: 300,
    itemTimeoutMs: 35,
    drive: {
      async archivedPaths() {
        return new Set([storedPath]);
      },
      async archive(url, signal) {
        assert.equal(url, slowUrl);
        await new Promise((resolve) => setTimeout(resolve, 70));
        assert.equal(signal.aborted, false, "lone remaining video must use the full deadline");
        return "archived";
      },
    },
  });
  assert.equal(secondRun.stored, 1);
  assert.equal(secondRun.archived, 1);
  assert.equal(secondRun.failed, 0);
  assert.equal(secondRun.remaining, 0);
  assert.equal(secondRun.errors, undefined);

  // 3. Known safe Drive errors pass through verbatim for diagnostics.
  const oauthFailure = await syncDriveVideos({
    source: snapshotFor([quickUrl]),
    totalTimeoutMs: 300,
    itemTimeoutMs: 50,
    drive: {
      async archivedPaths() {
        return new Set();
      },
      async archive() {
        throw new Error("Drive authorization failed (HTTP 400, invalid_grant)");
      },
    },
  });
  assert.deepEqual(oauthFailure.errors, ["Drive authorization failed (HTTP 400, invalid_grant)"]);
});
