import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import { copy } from "../../src/constants/locales.js";
import { mailboxes } from "../../src/constants/site.js";

const output = process.env.QA_REPOSTS_OUTPUT || "qa/reposts";
mkdirSync(output, { recursive: true });
const feed = JSON.parse(readFileSync("scripts/qa/fixtures/feed.json", "utf8"));
const profile = readFileSync("scripts/qa/fixtures/profile.json", "utf8");
const image = readFileSync("public/assets/og-cover.jpg");
const reposts = ["91", "92"].map((id, index) => ({
  id,
  repostId: `${id}0`,
  text: `Shared original ${id}\n\n[Source reference](https://example.com/repost/${id}) and www.example.org`,
  created_at: "2026-10-01T08:00:00Z",
  repostedAt: `2026-10-${31 - index}T08:00:00Z`,
  author: `Source writer ${id}`,
  username: `writer_${id}`,
  avatar: `https://pbs.twimg.com/profile_images/${id}/avatar_normal.jpg`,
  permalink: `https://x.com/writer_${id}/status/${id}`,
  ...(index === 0
    ? { media: [{ type: "photo", url: "https://pbs.twimg.com/media/Shared.jpg", width: 1200, height: 630 }] }
    : {}),
}));
const origin = "http://127.0.0.1:4329";
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4329", "--strictPort"],
  { stdio: "ignore" },
);
let browser;
const reports = [];
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const animation of document.getAnimations()) {
      if (animation.effect?.getTiming().iterations !== Infinity) animation.finish();
      else {
        animation.pause();
        animation.currentTime = 0;
      }
    }
  });
}
try {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (
      await fetch(origin)
        .then((r) => r.ok)
        .catch(() => false)
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ channel: process.env.QA_BROWSER || "chrome" });
  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [1100, 580],
    [390, 844],
    [360, 740],
    [844, 390],
  ]) {
    for (const language of ["zh", "ja", "en"]) {
      const context = await browser.newContext({
        viewport: { width, height },
        isMobile: width < 901,
        hasTouch: width < 901,
        reducedMotion: "reduce",
      });
      await context.addInitScript((language) => {
        localStorage.setItem("hello-nice-site-language", language);
        sessionStorage.setItem("nest-posts-age-confirmed", "18+");
      }, language);
      let body = { ...feed, reposts, repostsStatus: "ok" };
      await context.route("**/api/x-posts", (route) =>
        route.fulfill({ contentType: "application/json", body: JSON.stringify(body) }),
      );
      await context.route("**/api/x-profile", (route) =>
        route.fulfill({ contentType: "application/json", body: profile }),
      );
      await context.route("**/api/x-media?**", (route) => route.fulfill({ contentType: "image/jpeg", body: image }));
      await context.route("**/api/x-video?**", (route) => route.fulfill({ status: 404 }));
      await context.route("https://example.com/**", (route) =>
        route.fulfill({ contentType: "text/html", body: "<title>Original link verified</title>" }),
      );
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(origin);
      await page.locator("#page-heading").waitFor();
      await settle(page);
      assert.equal(await page.locator("#page-heading").textContent(), "初咏");
      assert.equal(await page.locator(".sailing-cta").count(), 0, "retired Sailing CTA must stay removed");
      const homeLayout = await page.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        buttons: [...document.querySelectorAll(".hero-actions a")].map((a) => {
          const r = a.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }),
      }));
      assert.ok(homeLayout.scrollWidth <= width + 1, "homepage must not overflow horizontally");
      if (width > 900) assert.ok(homeLayout.scrollHeight <= height + 2, "desktop home must fit one viewport");
      if (language === "zh" && [1440, 390].includes(width))
        await page.screenshot({ path: `${output}/home-${width}.png` });
      await page.goto(`${origin}/posts`);
      const shared = page.locator("#x-reposts .post-card");
      await shared.waitFor();
      await settle(page);
      const structure = await page.evaluate(() => {
        const ids = [...document.querySelectorAll(".posts-group h2")].map((node) => node.id);
        const material = (element) => {
          const s = getComputedStyle(element);
          return [s.backgroundImage, s.borderRadius, s.boxShadow];
        };
        return {
          ids,
          original: material(document.querySelector("#latest-posts .post-card")),
          repost: material(document.querySelector("#x-reposts .post-card")),
          overflow: document.documentElement.scrollWidth - innerWidth,
        };
      });
      assert.ok(structure.ids.indexOf("daily-posts-heading") < structure.ids.indexOf("x-reposts-heading"));
      assert.ok(structure.ids.indexOf("x-reposts-heading") < structure.ids.indexOf("x-articles-heading"));
      assert.deepEqual(structure.repost, structure.original, "reposts must share the original card glass material");
      assert.ok(structure.overflow <= 1);
      assert.equal(await shared.locator(".post-author strong").textContent(), "Source writer 91");
      assert.equal(await shared.locator(".post-author span").textContent(), "@writer_91");
      const plainLinks = await page.evaluate(() =>
        [...document.querySelectorAll(".site-route-posts a[href]")]
          .filter(
            (a) =>
              !a.closest(".site-nav") &&
              a.getClientRects().length &&
              !getComputedStyle(a).textDecorationLine.includes("underline"),
          )
          .map((a) => ({ text: a.textContent, href: a.getAttribute("href") })),
      );
      assert.deepEqual(plainLinks, [], "every content link on Posts must be underlined");
      const sourceReference = shared.getByRole("link", { name: "Source reference", exact: true });
      const sourcePopup = page.waitForEvent("popup");
      await sourceReference.click();
      const sourceTab = await sourcePopup;
      await sourceTab.waitForLoadState();
      assert.equal(sourceTab.url(), "https://example.com/repost/91");
      await sourceTab.close();
      const originalText = await page.locator("#latest-posts .post-text").textContent();
      const articleTitle = await page.locator("#x-article-title").textContent();
      await page.getByRole("button", { name: copy[language].nextRepost, exact: true }).click();
      assert.equal(await shared.locator(".post-author span").textContent(), "@writer_92");
      assert.equal(await page.locator("#latest-posts .post-text").textContent(), originalText);
      assert.equal(await page.locator("#x-article-title").textContent(), articleTitle);
      await page.getByRole("button", { name: copy[language].prevRepost, exact: true }).click();
      await shared.locator(".post-media-open").click();
      await page.locator(".media-lightbox").waitFor();
      await page.locator(".media-lightbox-close").click();
      assert.equal(await page.locator(".media-lightbox").count(), 0);
      const originalLink = shared.locator("a[target='_blank']").last();
      assert.equal(await originalLink.getAttribute("href"), reposts[0].permalink);
      await page.locator(".reading-library-trigger").click();
      await page.locator(".library-filters button").nth(2).click();
      assert.equal(await page.locator(".library-result").count(), 2);
      await page.locator(".library-result").nth(1).click();
      assert.equal(await shared.locator(".post-author span").textContent(), "@writer_92");
      assert.equal(await page.locator("dialog[open]").count(), 0);
      if (language === "zh" && [1440, 390].includes(width)) {
        await page.locator("#x-reposts").scrollIntoViewIfNeeded();
        await settle(page);
        await page.screenshot({ path: `${output}/reposts-${width}.png` });
      }
      assert.deepEqual(errors, []);
      await page.goto(`${origin}/contact`);
      await page.locator(".mail-compose-link").waitFor();
      assert.ok(
        (await page.locator(".mail-compose-link").getAttribute("href")).startsWith(`mailto:${mailboxes[0].address}?`),
      );
      assert.ok((await page.locator(".email-address").textContent()).includes("loveyong2007@gmail.com"));
      assert.ok(!(await page.locator("body").textContent()).includes("fyh20071004@gmail.com"));
      reports.push({ width, height, language, homeLayout, status: "passed" });
      console.log(`Passed ${width}x${height} ${language}: home, glass, author, independent reader, photos, library`);
      await context.close();
    }
  }
  for (const state of ["none", "unavailable", "stale"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    await context.addInitScript(() => {
      sessionStorage.setItem("nest-posts-age-confirmed", "18+");
      localStorage.setItem("hello-nice-site-language", "zh");
    });
    await context.route("**/api/x-posts", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ...feed, reposts: state === "stale" ? reposts : [], repostsStatus: state }),
      }),
    );
    await context.route("**/api/x-profile", (route) =>
      route.fulfill({ contentType: "application/json", body: profile }),
    );
    await context.route("**/api/x-media?**", (route) => route.fulfill({ contentType: "image/jpeg", body: image }));
    const page = await context.newPage();
    await page.goto(`${origin}/posts`);
    await page.locator(".repost-status").waitFor();
    assert.ok(
      (await page.locator(".repost-status").textContent()).includes(
        copy.zh[state === "none" ? "repostsEmpty" : state === "stale" ? "repostsStale" : "repostsUnavailable"],
      ),
    );
    assert.equal(await page.locator("#x-reposts .post-card").count(), state === "stale" ? 1 : 0);
    reports.push({ state, status: "passed" });
    await context.close();
  }
  writeFileSync(`${output}/report.json`, JSON.stringify(reports, null, 2));
} finally {
  await browser?.close();
  server.kill();
}
