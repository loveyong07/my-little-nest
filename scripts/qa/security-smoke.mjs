// Real-browser checks against the shared handlers and a local fake upstream.
// No production traffic, credentials, or persistent browser profile are needed.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import { createApiHandler } from "../../server/api-handler.mjs";
import { createNodeApiMiddleware } from "../../server/vite-api-plugin.mjs";
import { signedMediaUrl } from "../../server/x-media-auth.mjs";

const secret = "local-browser-security-smoke";
const imageSource = "https://pbs.twimg.com/media/security-smoke.png";
const videoSource = "https://video.twimg.com/ext_tw_video/123/security-smoke.mp4";
const png = new PNG({ width: 1, height: 1 });
png.data.fill(255);
const bytes = PNG.sync.write(png);
const imagePath = await signedMediaUrl(imageSource, "image", { secret });
const videoPath = await signedMediaUrl(videoSource, "video", { secret });
const seen = [];
let upstream = 0;
const handler = createApiHandler({ X_MEDIA_SIGNING_SECRET: secret }, {
  fetchImpl: async (url, options) => {
    upstream++;
    if (url === imageSource) return new Response(bytes, { headers: { "Content-Type": "image/png" } });
    assert.equal(url, videoSource);
    assert.equal(options.headers.get("range"), "bytes=0-3");
    return new Response(new Uint8Array([0, 1, 2, 3]), {
      status: 206,
      headers: { "Content-Type": "video/mp4", "Content-Range": "bytes 0-3/8", "Content-Length": "4" },
    });
  },
});
const middleware = createNodeApiMiddleware(async (request) => {
  const response = await handler(request);
  seen.push({ site: request.headers.get("sec-fetch-site"), status: response?.status, vary: response?.headers.get("vary") });
  return response;
});
const server = createServer((request, response) => middleware(request, response, () => {
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end("<!doctype html><title>Media security smoke test</title><body>Local media policy test</body>");
}));
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const report = { browser: null, checks: [], evidence: "Local browser and fixture upstream; not live CDN or MP4 playback" };
let browser;
try {
  browser = await chromium.launch({ channel: process.env.QA_BROWSER || "msedge", headless: true });
  report.browser = browser.version();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(origin);
  async function loadImage(url) {
    return page.evaluate((src) => new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ loaded: true, width: image.naturalWidth });
      image.onerror = () => resolve({ loaded: false });
      image.src = src;
      document.body.append(image);
    }), url);
  }
  assert.deepEqual(await loadImage(origin + imagePath), { loaded: true, width: 1 });
  const afterWarm = upstream;
  assert.deepEqual(await loadImage(origin + imagePath), { loaded: true, width: 1 });
  assert.equal(upstream, afterWarm, "the browser should reuse its warm same-origin image cache");
  report.checks.push("same-origin PNG decodes and the second load uses browser cache");

  const range = await page.evaluate(async (url) => {
    const response = await fetch(url, { headers: { Range: "bytes=0-3" } });
    return { status: response.status, range: response.headers.get("content-range"), bytes: [...new Uint8Array(await response.arrayBuffer())] };
  }, origin + videoPath);
  assert.deepEqual(range, { status: 206, range: "bytes 0-3/8", bytes: [0, 1, 2, 3] });
  report.checks.push("same-origin video Range fetch preserves 206, Content-Range and bytes");

  // localhost and 127.0.0.1 are distinct sites but both remain loopback contexts,
  // so Local Network Access restrictions do not mask our server's 403 behavior.
  await page.goto(origin.replace("127.0.0.1", "localhost"));
  const beforeForeign = upstream;
  assert.deepEqual(await loadImage(origin + imagePath), { loaded: false });
  assert.equal(upstream, beforeForeign);
  assert.ok(seen.some(({ site, status }) => site === "cross-site" && status === 403));
  report.checks.push("foreign image embedding fails after warming the same URL; no upstream request");

  const direct = await context.newPage();
  const directResponse = await direct.goto(origin + imagePath);
  assert.equal(directResponse.status(), 200);
  report.checks.push("direct navigation to a signed image still succeeds");
  assert.ok(seen.some(({ site, vary }) => site === "same-origin" && vary === "Sec-Fetch-Site"));
  assert.ok(seen.some(({ site, status }) => site === "none" && status === 200));
  report.requests = seen;
  const out = path.resolve("qa/security-2026-10-13");
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "browser.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
