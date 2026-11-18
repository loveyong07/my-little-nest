import assert from "node:assert/strict";
import test from "node:test";
import { proxyXVideo } from "../server/x-video.mjs";
import { signedMediaUrl } from "../server/x-media-auth.mjs";
import { LEGACY_VIDEO_URLS } from "../server/x-media-legacy.mjs";

const VIDEO_URL = LEGACY_VIDEO_URLS[0];
const VIDEO_BYTES = new Uint8Array([0, 1, 2, 3]);
const AUTH = { secret: "video-proxy-test-secret", now: Date.UTC(2026, 8, 30, 12) };

function videoRequest(source, options) {
  const url = new URL("https://site.test/api/x-video");
  if (source !== undefined) url.searchParams.set("url", source);
  return new Request(url, options);
}

test("forwards a single byte range and streams the MP4 partial response", async () => {
  let requestedUrl;
  let fetchOptions;
  const response = await proxyXVideo(
    videoRequest(VIDEO_URL, {
      headers: { Range: "bytes=0-3" },
    }),
    async (url, options) => {
      requestedUrl = url;
      fetchOptions = options;
      return new Response(VIDEO_BYTES, {
        status: 206,
        headers: {
          "Content-Type": "video/mp4; charset=binary",
          "Content-Length": "4",
          "Content-Range": "bytes 0-3/8",
        },
      });
    },
  );

  assert.equal(requestedUrl, VIDEO_URL);
  assert.equal(fetchOptions.redirect, "error");
  assert.equal(fetchOptions.headers.get("accept"), "video/mp4");
  assert.equal(fetchOptions.headers.get("range"), "bytes=0-3");
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-range"), "bytes 0-3/8");
  assert.equal(response.headers.get("accept-ranges"), "bytes");
  assert.equal(response.headers.get("content-type"), "video/mp4");
  assert.equal(response.headers.get("content-length"), "4");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), VIDEO_BYTES);
});

test("rejects invalid video URLs before requesting upstream", async (t) => {
  for (const source of [
    undefined,
    "not a URL",
    "http://video.twimg.com/ext_tw_video/123/clip.mp4",
    "https://video.twimg.com.evil.test/ext_tw_video/123/clip.mp4",
    "https://video.twimg.com/other/clip.mp4",
  ]) {
    await t.test(source ?? "missing URL", async () => {
      const response = await proxyXVideo(videoRequest(source), () => {
        throw new Error("Rejected URL reached upstream fetch");
      });
      assert.equal(response.status, 400);
      assert.equal(response.headers.get("cache-control"), "no-store");
    });
  }
});

test("rejects invalid or multiple byte ranges before requesting upstream", async (t) => {
  for (const range of ["bytes=0-1,3-4", "bytes=10-3", "items=0-3", "bytes=9007199254740992-"]) {
    await t.test(range, async () => {
      const response = await proxyXVideo(
        videoRequest(VIDEO_URL, {
          headers: { Range: range },
        }),
        () => {
          throw new Error("Rejected range reached upstream fetch");
        },
      );
      assert.equal(response.status, 416);
      assert.equal(response.headers.get("content-range"), null);
      assert.equal(response.headers.get("accept-ranges"), "bytes");
      assert.equal(response.headers.get("cache-control"), "no-store");
    });
  }
});

test("upstream 416 responses only expose a known complete byte length", async () => {
  for (const [incoming, expected] of [
    ["bytes */512", "bytes */512"],
    ["bytes */*", null],
    [null, null],
  ]) {
    const response = await proxyXVideo(
      videoRequest(VIDEO_URL, { headers: { Range: "bytes=1024-" } }),
      async () => new Response(null, { status: 416, headers: incoming ? { "Content-Range": incoming } : {} }),
    );
    assert.equal(response.status, 416);
    assert.equal(response.headers.get("accept-ranges"), "bytes");
    assert.equal(response.headers.get("content-range"), expected);
  }
});

test("accepts signed video URLs while preserving seeking and conditional range requests", async () => {
  const source = "https://video.twimg.com/ext_tw_video/123/pu/vid/720x720/clip.mp4";
  const signedUrl = await signedMediaUrl(source, "video", AUTH);
  let fetchOptions;
  const response = await proxyXVideo(
    new Request(new URL(signedUrl, "https://site.test"), {
      headers: { Range: "bytes=4-", "If-Range": '"video-etag"' },
    }),
    async (url, options) => {
      assert.equal(url, source);
      fetchOptions = options;
      return new Response(VIDEO_BYTES, {
        status: 206,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": "4",
          "Content-Range": "bytes 4-7/8",
          ETag: '"video-etag"',
        },
      });
    },
    AUTH,
  );
  assert.equal(response.status, 206);
  assert.equal(fetchOptions.headers.get("range"), "bytes=4-");
  assert.equal(fetchOptions.headers.get("if-range"), '"video-etag"');
  assert.equal(response.headers.get("etag"), '"video-etag"');
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), VIDEO_BYTES);
});

test("rejects unsigned videos from another X account without requesting upstream", async () => {
  let fetchCalls = 0;
  const response = await proxyXVideo(
    videoRequest("https://video.twimg.com/ext_tw_video/987/pu/vid/clip.mp4"),
    async () => {
      fetchCalls += 1;
      return new Response(VIDEO_BYTES, { headers: { "Content-Type": "video/mp4" } });
    },
    AUTH,
  );
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(fetchCalls, 0);
});

test("rejects cross-site video hotlinking before requesting upstream", async () => {
  const response = await proxyXVideo(
    videoRequest(VIDEO_URL, {
      headers: { "Sec-Fetch-Site": "cross-site", Range: "bytes=0-3" },
    }),
    () => {
      throw new Error("Cross-site video reached upstream");
    },
    AUTH,
  );
  assert.equal(response.status, 403);
});

test("rejects tampered or expired video signatures and ambiguous queries before fetching", async (t) => {
  const signedUrl = new URL(
    await signedMediaUrl("https://video.twimg.com/ext_tw_video/123/pu/vid/site-video.mp4", "video", AUTH),
    "https://site.test",
  );
  for (const [name, mutate, status] of [
    ["signature", (url) => url.searchParams.set("signature", "0".repeat(64)), 403],
    [
      "source",
      (url) => url.searchParams.set("url", "https://video.twimg.com/ext_tw_video/456/pu/vid/other-video.mp4"),
      403,
    ],
    ["unknown parameter", (url) => url.searchParams.set("extra", "1"), 400],
    ["duplicate signature", (url) => url.searchParams.append("signature", url.searchParams.get("signature")), 400],
  ]) {
    await t.test(name, async () => {
      const url = new URL(signedUrl);
      mutate(url);
      const response = await proxyXVideo(
        new Request(url),
        () => {
          throw new Error("Invalid video request reached upstream");
        },
        AUTH,
      );
      assert.equal(response.status, status);
      assert.equal(response.headers.get("cache-control"), "no-store");
    });
  }
  const expires = Number(signedUrl.searchParams.get("expires"));
  const expired = await proxyXVideo(
    new Request(signedUrl),
    () => {
      throw new Error("Expired video request reached upstream");
    },
    {
      ...AUTH,
      now: expires * 1000,
    },
  );
  assert.equal(expired.status, 403);
});

test("signed video freshness is bounded by authorization expiry without changing the content", async () => {
  const signedUrl = new URL(
    await signedMediaUrl("https://video.twimg.com/ext_tw_video/123/pu/vid/site-video.mp4", "video", AUTH),
    "https://site.test",
  );
  const expires = Number(signedUrl.searchParams.get("expires"));
  const response = await proxyXVideo(
    new Request(signedUrl, { headers: { "Sec-Fetch-Site": "same-origin" } }),
    async () =>
      new Response(VIDEO_BYTES, {
        headers: { "Content-Type": "video/mp4" },
      }),
    { ...AUTH, now: (expires - 30) * 1000 },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=29, s-maxage=29");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), VIDEO_BYTES);
});

test("a visitor that disconnects aborts the upstream video download", async () => {
  const clientAbort = new AbortController();
  let upstreamSignal = null;
  let upstreamCancelled = false;
  const upstreamBody = new ReadableStream({
    pull() {},
    cancel() {
      upstreamCancelled = true;
    },
  });
  const response = await proxyXVideo(
    new Request(new URL(`/api/x-video?url=${encodeURIComponent(VIDEO_URL)}`, "https://site.test"), {
      signal: clientAbort.signal,
    }),
    async (url, options) => {
      upstreamSignal = options.signal;
      return new Response(upstreamBody, { headers: { "Content-Type": "video/mp4" } });
    },
    undefined,
    { stallTimeoutMs: 30_000 },
  );
  assert.equal(upstreamSignal.aborted, false);
  clientAbort.abort();
  assert.equal(upstreamSignal.aborted, true, "the upstream request must not outlive the visitor");
  await response.body.cancel();
  assert.equal(upstreamCancelled, true);
});

test("a stalled upstream stream is released while normal slow chunks keep playing", async () => {
  // A silent upstream while the visitor is waiting must be cut off.
  const stalledClient = new AbortController();
  let stalledUpstreamSignal = null;
  const stalled = await proxyXVideo(
    new Request(new URL(`/api/x-video?url=${encodeURIComponent(VIDEO_URL)}`, "https://site.test"), {
      signal: stalledClient.signal,
    }),
    async (url, options) => {
      stalledUpstreamSignal = options.signal;
      return new Response(new ReadableStream({ pull() {} }), { headers: { "Content-Type": "video/mp4" } });
    },
    undefined,
    { stallTimeoutMs: 60 },
  );
  const stalledReader = stalled.body.getReader();
  const pendingRead = stalledReader.read().catch(() => null);
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(stalledUpstreamSignal.aborted, true, "a stalled upstream must be aborted");
  await stalledReader.cancel().catch(() => {});
  await pendingRead;

  // Data that keeps arriving must not be cut off by a total time limit.
  const flowingClient = new AbortController();
  let flowingUpstreamSignal = null;
  let chunks = 0;
  const flowing = await proxyXVideo(
    new Request(new URL(`/api/x-video?url=${encodeURIComponent(VIDEO_URL)}`, "https://site.test"), {
      signal: flowingClient.signal,
    }),
    async (url, options) => {
      flowingUpstreamSignal = options.signal;
      return new Response(
        new ReadableStream({
          async pull(streamController) {
            await new Promise((resolve) => setTimeout(resolve, 25));
            if (options.signal.aborted) return;
            chunks += 1;
            streamController.enqueue(new Uint8Array([1]));
          },
        }),
        { headers: { "Content-Type": "video/mp4" } },
      );
    },
    undefined,
    { stallTimeoutMs: 400 },
  );
  const flowingReader = flowing.body.getReader();
  const drain = (async () => {
    while (true) {
      const { done } = await flowingReader.read();
      if (done) break;
    }
  })().catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.equal(flowingUpstreamSignal.aborted, false, "a slow but flowing stream must not be cut off");
  assert.ok(chunks >= 8, `Flowing stream should keep delivering chunks: ${chunks}`);
  flowingClient.abort();
  await flowingReader.cancel().catch(() => {});
  await drain;
});

test("a visitor that stops reading is not treated as a stalled upstream", async () => {
  let upstreamSignal = null;
  let upstreamCancelled = false;
  const response = await proxyXVideo(
    new Request(new URL(`/api/x-video?url=${encodeURIComponent(VIDEO_URL)}`, "https://site.test")),
    async (url, options) => {
      upstreamSignal = options.signal;
      return new Response(
        new ReadableStream({
          async pull(streamController) {
            await new Promise((resolve) => setTimeout(resolve, 20));
            if (!options.signal.aborted) streamController.enqueue(new Uint8Array([1]));
          },
          cancel() {
            upstreamCancelled = true;
          },
        }),
        { headers: { "Content-Type": "video/mp4" } },
      );
    },
    undefined,
    { stallTimeoutMs: 80 },
  );
  // Read one chunk, then leave the stream idle for longer than the idle limit.
  const reader = response.body.getReader();
  await reader.read();
  await new Promise((resolve) => setTimeout(resolve, 260));
  assert.equal(upstreamSignal.aborted, false, "a paused visitor must not abort the upstream download");
  await reader.cancel();
  assert.equal(upstreamCancelled, true, "cancelling the response must cancel the upstream reader");
});
