import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { originalPhotoSource } from "../shared/media-sources.mjs";
import { authorizeFeed, signedMediaUrl, authorizedMediaRequest, parseMediaSource } from "../server/x-media-auth.mjs";
import { proxyXMedia } from "../server/x-media.mjs";
import { xMediaSrc } from "../src/media-urls.js";

const options = { secret: "webp-test-secret", now: Date.UTC(2026, 9, 17) };
const original = "https://pbs.twimg.com/media/FullSize?format=jpg&name=orig";
const request = (url) =>
  new Request(new URL(url, "https://site.test"), { headers: { "Sec-Fetch-Site": "same-origin" } });

test("static X photos explicitly select original size; avatars, video posters and animated GIFs stay unchanged", () => {
  assert.equal(originalPhotoSource("https://pbs.twimg.com/media/FullSize.jpg"), original);
  assert.equal(originalPhotoSource("https://pbs.twimg.com/media/FullSize?format=jpg&name=small"), original);
  for (const url of [
    "https://pbs.twimg.com/profile_images/1/avatar_normal.jpg",
    "https://pbs.twimg.com/ext_tw_video_thumb/1/poster.jpg",
    "https://pbs.twimg.com/media/Animation.gif",
    "https://not-allowed.test/media/Photo.jpg",
  ])
    assert.equal(originalPhotoSource(url), url);
});

test("existing and future pinned, daily and Article photos use signed full-size WebP with matching inline positions", async () => {
  const post = {
    id: "1",
    media: [{ type: "photo", url: "https://pbs.twimg.com/media/FullSize.jpg", width: 2559, height: 1599 }],
    blocks: [{ type: "photo", url: "https://pbs.twimg.com/media/FullSize.jpg" }],
  };
  const output = await authorizeFeed({ posts: [post], articles: [post], pinnedPost: post }, options);
  for (const item of [output.posts[0], output.articles[0], output.pinnedPost]) {
    assert.equal(item.media[0].url, original);
    assert.equal(item.blocks[0].url, original);
    assert.equal(new URL(item.media[0].proxyUrl, "https://site.test").searchParams.get("format"), "webp");
    assert.equal(xMediaSrc(original, false, item.media[0].proxyUrl), item.media[0].proxyUrl);
  }
});

test("the signature binds the WebP representation and cannot be changed to or from an original-byte link", async () => {
  const signed = await signedMediaUrl(original, "image", { ...options, format: "webp" });
  assert.equal(
    await authorizedMediaRequest(request(signed), parseMediaSource(original, "image"), "image", options),
    true,
  );
  assert.equal(
    await authorizedMediaRequest(
      request(signed.replace("&format=webp", "")),
      parseMediaSource(original, "image"),
      "image",
      options,
    ),
    false,
  );
  const plain = await signedMediaUrl(original, "image", options);
  assert.equal(
    await authorizedMediaRequest(
      request(plain + "&format=webp"),
      parseMediaSource(original, "image"),
      "image",
      options,
    ),
    false,
  );
});

test("WebP conversion preserves real image pixel dimensions and supports original-byte fallback", async () => {
  const jpeg = await sharp({ create: { width: 2559, height: 1599, channels: 3, background: "#78b9ef" } })
    .jpeg()
    .toBuffer();
  const signed = await signedMediaUrl(original, "image", { ...options, format: "webp" });
  const upstream = async () =>
    new Response(jpeg, { headers: { "Content-Type": "image/jpeg", "Content-Length": String(jpeg.length) } });
  const response = await proxyXMedia(request(signed), upstream, options);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/webp");
  const bytes = new Uint8Array(await response.arrayBuffer());
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.width, 2559);
  assert.equal(metadata.height, 1599);
  assert.ok(bytes.length < jpeg.length);
  const fallback = await proxyXMedia(request(signed), upstream, options, {
    webpEncoder: async () => {
      throw Error("encoder unavailable");
    },
  });
  assert.equal(fallback.headers.get("content-type"), "image/jpeg");
  assert.deepEqual(Buffer.from(await fallback.arrayBuffer()), jpeg);
});
