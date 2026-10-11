import assert from "node:assert/strict";
import test from "node:test";
import { proxyXMedia } from "../server/x-media.mjs";
import { signedMediaUrl } from "../server/x-media-auth.mjs";
import { LEGACY_IMAGE_URLS } from "../server/x-media-legacy.mjs";

const IMAGE_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const AUTH = { secret: "image-proxy-test-secret", now: Date.UTC(2026, 8, 30, 12) };
const LEGACY_IMAGE_URL = LEGACY_IMAGE_URLS[0];

function mediaRequest(source, options) {
  const url = new URL("https://site.test/api/x-media");
  if (source !== undefined) url.searchParams.set("url", source);
  return new Request(url, options);
}

function imageResponse() {
  return new Response(IMAGE_BYTES, {
    headers: {
      "Content-Type": "image/jpeg; charset=binary",
      "Content-Length": String(IMAGE_BYTES.byteLength),
    },
  });
}

test("proxies authorized X image paths with the requested cache headers and original bytes", async (t) => {
  for (const source of [
    "https://pbs.twimg.com/media/existing.jpg",
    "https://pbs.twimg.com/media/existing?format=jpg&name=orig",
    "https://pbs.twimg.com/profile_images/123/avatar_normal.jpg",
    "https://pbs.twimg.com/ext_tw_video_thumb/123/pu/img/poster.jpg",
  ]) {
    await t.test(source, async () => {
      let requestedUrl;
      let fetchOptions;
      const signedUrl = await signedMediaUrl(source, "image", AUTH);
      const response = await proxyXMedia(
        new Request(new URL(signedUrl, "https://site.test")),
        async (url, options) => {
          requestedUrl = url;
          fetchOptions = options;
          return imageResponse();
        },
        AUTH,
      );

      assert.equal(response.status, 200);
      assert.equal(requestedUrl, source);
      assert.equal(fetchOptions.redirect, "error");
      assert.equal(response.headers.get("content-type"), "image/jpeg");
      const remaining = Number(new URL(signedUrl, "https://site.test").searchParams.get("expires")) - AUTH.now / 1000;
      for (const [header, freshDirective] of [
        ["cache-control", "max-age"],
        ["vercel-cdn-cache-control", "s-maxage"],
      ]) {
        const policy = response.headers.get(header);
        const fresh = Number(policy.match(new RegExp(`${freshDirective}=(\\d+)`))[1]);
        const stale = Number(policy.match(/stale-while-revalidate=(\d+)/)[1]);
        assert.ok(policy.startsWith("public, "));
        assert.equal(fresh, 86400);
        assert.ok(fresh + stale < remaining, "cached images must expire before their authorization");
      }
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()), IMAGE_BYTES);
    });
  }
});

test("streams known-length images before the upstream body finishes", async () => {
  let upstreamController;
  const upstreamBody = new ReadableStream({
    start(controller) {
      upstreamController = controller;
      controller.enqueue(IMAGE_BYTES);
    },
  });
  const pendingResponse = proxyXMedia(
    mediaRequest(LEGACY_IMAGE_URL),
    async () =>
      new Response(upstreamBody, {
        headers: {
          "Content-Type": "image/jpeg",
          "Content-Length": "4",
        },
      }),
  );
  let timeoutId;
  const result = await Promise.race([
    pendingResponse,
    new Promise((resolve) => {
      timeoutId = setTimeout(() => resolve(null), 100);
    }),
  ]);
  clearTimeout(timeoutId);
  upstreamController.close();

  assert.ok(result instanceof Response, "proxy should return response headers without waiting for the full image");
  assert.equal(result.status, 200);
  const reader = result.body.getReader();
  const firstChunk = await reader.read();
  assert.deepEqual(firstChunk.value, IMAGE_BYTES);
  await reader.cancel();
});

test("a visitor that disconnects aborts the upstream image request", async () => {
  const clientAbort = new AbortController();
  let upstreamSignal = null;
  let upstreamController = null;
  const pending = proxyXMedia(
    new Request(mediaRequest(LEGACY_IMAGE_URL).url, { signal: clientAbort.signal }),
    async (url, options) => {
      upstreamSignal = options.signal;
      options.signal.addEventListener("abort", () =>
        upstreamController.error(new DOMException("Aborted", "AbortError")),
      );
      return new Response(
        new ReadableStream({
          start(controller) {
            upstreamController = controller;
          },
        }),
        { headers: { "Content-Type": "image/jpeg" } },
      );
    },
  );
  // Let the upstream fetch and the buffered read start before the visitor leaves.
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(upstreamSignal.aborted, false);
  clientAbort.abort();
  const response = await pending;
  assert.equal(upstreamSignal.aborted, true, "the upstream image request must not outlive the visitor");
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("rejects missing and malformed URL parameters without fetching", async (t) => {
  for (const [source, label] of [
    [undefined, "missing"],
    ["not a URL", "malformed"],
  ]) {
    await t.test(label, async () => {
      const response = await proxyXMedia(mediaRequest(source), () => {
        throw new Error("Rejected URL reached upstream fetch");
      });
      assert.equal(response.status, 400);
    });
  }
});

test("rejects non-HTTPS URLs and hosts outside the exact whitelist without fetching", async (t) => {
  for (const source of [
    "http://pbs.twimg.com/xxx.jpg",
    "https://example.com/xxx.jpg",
    "https://pbs.twimg.com.evil.test/xxx.jpg",
    "https://pbs.twimg.com@evil.test/xxx.jpg",
    "https://abs.twimg.com/banner.jpg",
    "https://video.twimg.com/preview.jpg",
  ]) {
    await t.test(source, async () => {
      const response = await proxyXMedia(mediaRequest(source), () => {
        throw new Error("Rejected URL reached upstream fetch");
      });
      assert.equal(response.status, 403);
    });
  }
});

test("keeps GET-only and image-only behavior for authorized resources", async () => {
  const postResponse = await proxyXMedia(mediaRequest("https://pbs.twimg.com/xxx.jpg", { method: "POST" }), () => {
    throw new Error("POST reached upstream fetch");
  });
  assert.equal(postResponse.status, 405);
  assert.equal(postResponse.headers.get("allow"), "GET");

  let fetchCalls = 0;
  const videoResponse = await proxyXMedia(mediaRequest(LEGACY_IMAGE_URL), async () => {
    fetchCalls += 1;
    return new Response(new Uint8Array([0, 1]), { headers: { "Content-Type": "video/mp4" } });
  });
  assert.equal(fetchCalls, 1);
  assert.equal(videoResponse.status, 415);
});

test("rejects unsigned images from another X account without requesting upstream", async () => {
  let fetchCalls = 0;
  const response = await proxyXMedia(
    mediaRequest("https://pbs.twimg.com/media/another-account.jpg"),
    async () => {
      fetchCalls += 1;
      return imageResponse();
    },
    AUTH,
  );
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(fetchCalls, 0);
});

test("keeps already-published unsigned images accessible with bounded retry parameters", async () => {
  const requestUrl = new URL(mediaRequest(LEGACY_IMAGE_URL).url);
  requestUrl.searchParams.set("retry", "1");
  requestUrl.searchParams.set("lightboxRetry", "2");
  const response = await proxyXMedia(new Request(requestUrl), async () => imageResponse(), AUTH);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=86400, stale-while-revalidate=604800");
  assert.equal(
    response.headers.get("vercel-cdn-cache-control"),
    "public, s-maxage=86400, stale-while-revalidate=604800",
  );
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), IMAGE_BYTES);
});

test("rejects cross-site image hotlinking even with a valid signed URL", async () => {
  const signedUrl = await signedMediaUrl("https://pbs.twimg.com/media/site-image.jpg", "image", AUTH);
  const response = await proxyXMedia(
    new Request(new URL(signedUrl, "https://site.test"), {
      headers: { "Sec-Fetch-Site": "cross-site" },
    }),
    () => {
      throw new Error("Cross-site image reached upstream");
    },
    AUTH,
  );
  assert.equal(response.status, 403);
});

test("rejects tampered signatures and ambiguous image queries without upstream traffic", async (t) => {
  const signedUrl = new URL(
    await signedMediaUrl("https://pbs.twimg.com/media/site-image.jpg", "image", AUTH),
    "https://site.test",
  );
  for (const [name, mutate, status] of [
    ["signature", (url) => url.searchParams.set("signature", "0".repeat(64)), 403],
    ["different source", (url) => url.searchParams.set("url", "https://pbs.twimg.com/media/other-account.jpg"), 403],
    ["unknown parameter", (url) => url.searchParams.set("extra", "1"), 400],
    ["duplicate source", (url) => url.searchParams.append("url", url.searchParams.get("url")), 400],
  ]) {
    await t.test(name, async () => {
      const url = new URL(signedUrl);
      mutate(url);
      const response = await proxyXMedia(
        new Request(url),
        () => {
          throw new Error("Invalid request reached upstream");
        },
        AUTH,
      );
      assert.equal(response.status, status);
      assert.equal(response.headers.get("cache-control"), "no-store");
    });
  }
  const expires = Number(signedUrl.searchParams.get("expires"));
  const expired = await proxyXMedia(
    new Request(signedUrl),
    () => {
      throw new Error("Expired request reached upstream");
    },
    {
      ...AUTH,
      now: expires * 1000,
    },
  );
  assert.equal(expired.status, 403);
});

test("signed image caching shrinks as authorization approaches expiry", async () => {
  const signedUrl = new URL(
    await signedMediaUrl("https://pbs.twimg.com/media/site-image.jpg", "image", AUTH),
    "https://site.test",
  );
  const expires = Number(signedUrl.searchParams.get("expires"));
  const response = await proxyXMedia(new Request(signedUrl), async () => imageResponse(), {
    ...AUTH,
    now: (expires - 30) * 1000,
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=29, stale-while-revalidate=0");
  assert.equal(response.headers.get("vercel-cdn-cache-control"), "public, s-maxage=29, stale-while-revalidate=0");
  await response.arrayBuffer();
});
