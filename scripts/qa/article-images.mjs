// Run after npm run build. Verifies all Article photos, retries and enlargement.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const origin = "http://127.0.0.1:4328";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4328", "--strictPort"], { stdio: "ignore" });
let browser;
try {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await fetch(origin).then((r) => r.ok).catch(() => false)) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ channel: "chrome" });
  const feed = readFileSync("scripts/qa/fixtures/feed.json");
  const profile = readFileSync("scripts/qa/fixtures/profile.json");
  const image = readFileSync("public/assets/og-cover.jpg");
  mkdirSync("qa/article-images", { recursive: true });
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    await context.addInitScript(() => sessionStorage.setItem("nest-posts-age-confirmed", "18+"));
    await context.route("**/api/x-posts", (route) => route.fulfill({ contentType: "application/json", body: feed }));
    await context.route("**/api/x-profile", (route) => route.fulfill({ contentType: "application/json", body: profile }));
    await context.route("**/api/x-media?**", (route) => {
      const url = new URL(route.request().url());
      return url.searchParams.get("url").includes("QaArticle2") && !url.searchParams.has("retry")
        ? route.fulfill({ status: 503, body: "Unavailable" })
        : route.fulfill({ contentType: "image/jpeg", body: image });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/posts`);
    const photos = page.locator(".x-article-card .article-photo");
    await photos.first().waitFor();
    for (const [label, destination] of [["TouchGal - 一站式Galgame文化社区!", "https://www.touchgal.ink/"], ["Muse.ai", "https://muse.ai/"]]) {
      await context.route(destination, (route) => route.fulfill({ contentType: "text/html", body: "<title>Link destination verified</title>" }));
      const link = page.locator(".article-text").getByRole("link", { name: label, exact: true });
      assert.equal(await link.getAttribute("href"), destination);
      assert.ok(await link.evaluate((a) => getComputedStyle(a).textDecorationLine.includes("underline")));
      const opened = page.waitForEvent("popup");
      await link.click();
      const popup = await opened;
      await popup.waitForLoadState();
      assert.equal(popup.url(), destination);
      await popup.close();
    }
    assert.equal(await photos.count(), 6, "all six photos must render without the post-card four-photo limit");
    assert.ok(await photos.nth(1).evaluate((photo) => photo.previousElementSibling.tagName === "P" && photo.nextElementSibling.textContent.includes("第 1 张正文配图后的段落")), "body photos must remain between their original text blocks");
    for (const photo of await photos.all()) await photo.scrollIntoViewIfNeeded();
    const retry = photos.nth(1).getByRole("button");
    await retry.click();
    await page.waitForFunction(() => [...document.querySelectorAll(".article-cover")].length === 6 && [...document.querySelectorAll(".article-cover")].every((img) => img.complete && img.naturalWidth > 0));
    assert.match(await photos.nth(1).locator("img").getAttribute("src"), /retry=1/);
    await photos.nth(5).locator("button").click();
    await page.locator(".media-lightbox img").waitFor();
    assert.match(await page.locator(".media-lightbox img").getAttribute("src"), /QaArticle6/);
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => document.querySelector(".media-lightbox img").src.includes("QaArticle1"));
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".media-lightbox").count(), 0);
    assert.ok(await photos.nth(5).locator("button").evaluate((button) => button === document.activeElement));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no horizontal overflow");
    await page.locator(".x-article-card").screenshot({ path: `qa/article-images/article-${width}.png` });
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px: original text/photo order, six images, links/clicks/underlines, retry, lightbox navigation, focus return, no overflow`);
    await context.close();
  }
} finally {
  await browser?.close();
  server.kill();
}
