// Verify a freshly captured real feed against the rendered original Article order.
// node --use-env-proxy scripts/qa/article-order.mjs qa/article-order/live-feed.json
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const feed = JSON.parse(readFileSync(process.argv[2] ?? "qa/article-order/live-feed.json"));
const article = feed.articles[0];
assert.ok(article.blocks?.length, "capture the live enriched Article feed first");
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4329", "--strictPort"], { stdio: "ignore" });
const origin = "http://127.0.0.1:4329";
let browser;
try {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await fetch(origin).then((response) => response.ok).catch(() => false)) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ channel: "chrome" });
  mkdirSync("qa/article-order", { recursive: true });
  for (const width of [1100, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    await context.addInitScript(() => sessionStorage.setItem("nest-posts-age-confirmed", "18+"));
    await context.route("**/api/x-posts", (route) => route.fulfill({ json: feed }));
    await context.route("**/api/x-profile", (route) => route.fulfill({ json: { status: "unavailable" } }));
    await context.route("**/api/x-media?**", async (route) => {
      const url = new URL(route.request().url());
      const response = await fetch(`https://loveyong07.top${url.pathname}${url.search}`, { headers: { "Sec-Fetch-Site": "same-origin", Referer: "https://loveyong07.top/posts" } });
      await route.fulfill({ status: response.status, contentType: response.headers.get("content-type"), body: Buffer.from(await response.arrayBuffer()) });
    });
    const page = await context.newPage();
    await page.goto(`${origin}/posts`);
    await page.locator(".article-cover").first().waitFor();
    const rendered = await page.locator(".article-text").evaluate((element) => [...element.children].map((child) => child.matches(".article-photo")
      ? { type: "photo", url: new URL(child.querySelector("img").src).searchParams.get("url") }
      : child.tagName === "HR" ? { type: "divider" } : { type: "text", text: child.textContent }));
    assert.deepEqual(rendered, article.blocks.map(({ type, text, url }) => type === "text" ? { type, text } : type === "photo" ? { type, url } : { type }));
    for (const photo of await page.locator(".article-photo").all()) {
      await photo.scrollIntoViewIfNeeded();
      await photo.locator("img").evaluate((image) => image.decode());
    }
    assert.equal(await page.locator(".article-cover").count(), 6);
    await page.locator(".x-article-card").screenshot({ path: `qa/article-order/live-article-${width}.png` });
    console.log(`PASS ${width}px: all ${article.blocks.length} original blocks in exact order; six real photos decoded`);
    await context.close();
  }
} finally {
  await browser?.close();
  server.kill();
}
