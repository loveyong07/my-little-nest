import assert from "node:assert/strict";
import test from "node:test";
import { collectVideoSources, createDriveVideoArchive } from "../server/drive-video-archive.mjs";
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
