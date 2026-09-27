import assert from "node:assert/strict";
import test from "node:test";
import { proxyXMedia } from "../server/x-media.mjs";

const IMAGE_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

function mediaRequest(source, options) {
  const url = new URL("https://site.test/api/x-media");
  if (source !== undefined) url.searchParams.set("url", source);
  return new Request(url, options);
}

function imageResponse() {
  return new Response(IMAGE_BYTES, {
    headers: { "Content-Type": "image/jpeg; charset=binary" },
  });
}

test("proxies images from each allowed X media host with the requested cache header", async (t) => {
  for (const source of [
    "https://pbs.twimg.com/xxx.jpg",
    "https://pbs.twimg.com/media/existing.jpg",
    "https://video.twimg.com/preview.jpg",
    "https://abs.twimg.com/banner.jpg",
  ]) {
    await t.test(source, async () => {
      let requestedUrl;
      let fetchOptions;
      const response = await proxyXMedia(mediaRequest(source), async (url, options) => {
        requestedUrl = url;
        fetchOptions = options;
        return imageResponse();
      });

      assert.equal(response.status, 200);
      assert.equal(requestedUrl, source);
      assert.equal(fetchOptions.redirect, "error");
      assert.equal(response.headers.get("content-type"), "image/jpeg");
      assert.equal(response.headers.get("cache-control"), "public, max-age=86400, stale-while-revalidate=604800");
      assert.equal(response.headers.get("vercel-cdn-cache-control"), "public, s-maxage=86400, stale-while-revalidate=604800");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()), IMAGE_BYTES);
    });
  }
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
  ]) {
    await t.test(source, async () => {
      const response = await proxyXMedia(mediaRequest(source), () => {
        throw new Error("Rejected URL reached upstream fetch");
      });
      assert.equal(response.status, 403);
    });
  }
});

test("keeps GET-only and image-only behavior", async () => {
  const postResponse = await proxyXMedia(mediaRequest("https://pbs.twimg.com/xxx.jpg", { method: "POST" }), () => {
    throw new Error("POST reached upstream fetch");
  });
  assert.equal(postResponse.status, 405);
  assert.equal(postResponse.headers.get("allow"), "GET");

  let fetchCalls = 0;
  const videoResponse = await proxyXMedia(mediaRequest("https://video.twimg.com/clip.mp4"), async () => {
    fetchCalls += 1;
    return new Response(new Uint8Array([0, 1]), { headers: { "Content-Type": "video/mp4" } });
  });
  assert.equal(fetchCalls, 1);
  assert.equal(videoResponse.status, 415);
});
