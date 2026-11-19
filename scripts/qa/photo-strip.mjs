// Run against the local dev server: node scripts/qa/photo-strip.mjs
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
const origin = process.env.QA_PHOTO_ORIGIN || "http://127.0.0.1:5173";
const output = process.env.QA_PHOTO_OUTPUT || "qa/x-photo-strip";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.QA_BROWSER || "chrome" });
try {
  for (const width of [1440, 600, 390]) {
    const page = await browser.newPage({
      viewport: { width, height: 1000 },
      isMobile: width === 390,
      hasTouch: width === 390,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => sessionStorage.setItem("nest-posts-age-confirmed", "18+"));
    const fixture = JSON.parse(readFileSync("scripts/qa/fixtures/feed.json"));
    let feed = fixture;
    const requested = new Set();
    await page.route("**/api/x-posts", (r) =>
      r.fulfill({ contentType: "application/json", body: JSON.stringify(feed) }),
    );
    await page.route("**/api/x-profile", (r) =>
      r.fulfill({ contentType: "application/json", body: readFileSync("scripts/qa/fixtures/profile.json") }),
    );
    await page.route("**/api/x-media?**", (r) => {
      const url = new URL(r.request().url()).searchParams.get("url");
      if (url.includes("Twenty")) requested.add(url);
      return r.fulfill({
        contentType: "image/jpeg",
        body: readFileSync(url.includes("Twenty1.") ? "public/assets/og-cover.jpg" : "public/assets/post-seaside.webp"),
      });
    });
    for (const count of [1, 4, 20]) {
      requested.clear();
      feed = structuredClone(fixture);
      feed.pinnedPost.media = Array.from({ length: count }, (_, i) => ({
        type: "photo",
        url: `https://pbs.twimg.com/media/Twenty${i + 1}.jpg`,
        width: 900,
        height: 1600,
        alt: `Test photo ${i + 1}`,
      }));
      await page.goto(origin + "/posts");
      const card = page.locator(".post-card").first();
      const track = card.locator(".post-photo-track");
      await track.waitFor();
      await track.scrollIntoViewIfNeeded();
      assert.equal(await track.locator(".post-photo-tile").count(), count);
      assert.equal(await card.locator(".photo-slider,.post-photo-grid,.glass-media-backdrop").count(), 0);
      assert.equal(await card.locator(".post-media").evaluate((el) => getComputedStyle(el).boxShadow), "none");
      if (count === 1) {
        assert.equal(await card.locator(".post-photo-arrow").count(), 0);
        continue;
      }
      const first = track.locator(".post-media-open").first();
      if (width !== 390) {
        await card.locator(".post-photo-next").waitFor();
        const before = await track.evaluate((el) => el.scrollLeft);
        const motion = track.evaluate(async (el) => {
          const values = [];
          for (let frame = 0; frame < 45; frame++) {
            values.push(Math.round(el.scrollLeft));
            await new Promise(requestAnimationFrame);
          }
          return values;
        });
        await card.locator(".post-photo-next").click();
        await page.waitForFunction(() => document.querySelector(".post-photo-track").scrollLeft > 1);
        const inMotion = await track.evaluate((el) => el.scrollLeft);
        const positions = await motion;
        assert.ok(new Set(positions).size > 3, "arrow navigation must animate through intermediate positions");
        await page.waitForTimeout(650);
        assert.ok((await track.evaluate((el) => el.scrollLeft)) > before, "arrow physically scrolls photos");
        assert.ok(inMotion > 0, "smooth movement begins after arrow click");
        assert.ok(await card.locator(".post-photo-previous").isVisible());
      } else {
        assert.equal(await card.locator(".post-photo-arrow:visible").count(), 0, "touch devices have no photo arrows");
      }
      await first.focus();
      await page.keyboard.press("Home");
      await page.waitForTimeout(500);
      if (count === 20) assert.ok(requested.size < 10, `bounded adjacent loading: ${requested.size}/20`);
      await page.keyboard.press("End");
      await page.waitForFunction(() => {
        const t = document.querySelector(".post-photo-track");
        return t.scrollWidth - t.clientWidth - t.scrollLeft < 2;
      });
      await card.locator(".post-photo-next").waitFor({ state: "hidden" });
      assert.ok(await card.locator(".post-photo-next").isHidden());
      const last = track.locator(".post-media-open").last();
      await last.click();
      assert.equal(await page.locator(".media-lightbox-count").textContent(), `${count} / ${count}`);
      if (width === 390)
        assert.equal(await page.locator(".media-lightbox-prev:visible,.media-lightbox-next:visible").count(), 0);
      assert.ok(
        (await page.locator(".media-lightbox-slide[aria-hidden=false] img").getAttribute("src")).includes(
          `Twenty${count}.jpg`,
        ),
      );
      await page.keyboard.press("Escape");
      assert.ok(await last.evaluate((el) => el === document.activeElement));
      await first.focus();
      await page.keyboard.press("Home");
      await page.waitForTimeout(500);
      await track.scrollIntoViewIfNeeded();
      const rect = await track.boundingBox();
      const y = rect.y + rect.height / 2;
      await page.mouse.move(rect.x + rect.width * 0.8, y);
      await page.mouse.down();
      await page.mouse.move(rect.x + rect.width * 0.1, y, { steps: 20 });
      await page.mouse.up();
      await page.waitForTimeout(600);
      assert.ok((await track.evaluate((el) => el.scrollLeft)) > 1, "mouse drag scrolls the strip");
      assert.equal(await page.locator(".media-lightbox").count(), 0, "drag does not enlarge a photo");
      // Native horizontal wheel gestures and touch gestures share the scrollable strip.
      await page.mouse.move(rect.x + rect.width / 2, y);
      await page.mouse.wheel(180, 0);
      await page.waitForTimeout(500);
      if (width === 390) {
        await first.focus();
        await page.keyboard.press("Home");
        await page.waitForTimeout(500);
        await track.scrollIntoViewIfNeeded();
        const touchRect = await track.boundingBox();
        const touchY = touchRect.y + touchRect.height * 0.3;
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: touchRect.x + touchRect.width * 0.85, y: touchY }],
        });
        for (let i = 1; i <= 12; i++) {
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: touchRect.x + touchRect.width * (0.85 - (0.7 * i) / 12), y: touchY }],
          });
          await page.waitForTimeout(20);
        }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await page.waitForTimeout(650);
        assert.ok((await track.evaluate((el) => el.scrollLeft)) > 1, "trusted native touch swipes scroll the strip");
        assert.equal(await page.locator(".media-lightbox").count(), 0);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no page overflow");
      assert.deepEqual(errors, []);
      await card.screenshot({ path: `${output}/fixture-${count}-${width}.png` });
      console.log(
        `PASS ${width}px ${count} photos: complete strip, arrows, bounded loading, keyboard boundaries, correct enlargement/focus, drag/wheel${width === 390 ? "/touch" : ""}, no glass/slider/overflow`,
      );
    }
    await page.close();
  }
} finally {
  await browser.close();
}
