import assert from "node:assert/strict";
import test from "node:test";
import { proxyXVideo } from "../server/x-video.mjs";

const VIDEO_URL = "https://video.twimg.com/ext_tw_video/123/pu/vid/720x720/clip.mp4";
const VIDEO_BYTES = new Uint8Array([0, 1, 2, 3]);

function videoRequest(source, options) {
  const url = new URL("https://site.test/api/x-video");
  if (source !== undefined) url.searchParams.set("url", source);
  return new Request(url, options);
}

test("forwards a single byte range and streams the MP4 partial response", async () => {
  let requestedUrl;
  let fetchOptions;
  const response = await proxyXVideo(videoRequest(VIDEO_URL, {
    headers: { Range: "bytes=0-3" },
  }), async (url, options) => {
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
  });

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
      const response = await proxyXVideo(videoRequest(VIDEO_URL, {
        headers: { Range: range },
      }), () => {
        throw new Error("Rejected range reached upstream fetch");
      });
      assert.equal(response.status, 416);
      assert.equal(response.headers.get("content-range"), "bytes */*");
      assert.equal(response.headers.get("accept-ranges"), "bytes");
      assert.equal(response.headers.get("cache-control"), "no-store");
    });
  }
});
