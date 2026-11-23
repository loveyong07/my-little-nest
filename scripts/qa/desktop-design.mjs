// Run after npm run build. Fixed data keeps desktop layout and interaction checks reproducible.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const origin = "http://127.0.0.1:4339";
const output = process.env.QA_DESKTOP_OUTPUT || "qa/desktop-upgrade-20261021/interactions";
const feed = JSON.parse(readFileSync("scripts/qa/fixtures/feed.json", "utf8"));
feed.articles.push({
  ...feed.articles[0],
  id: "qa-second-article",
  title: "A second independent article",
  created_at: "2026-10-09T10:00:00Z",
});
const profile = readFileSync("scripts/qa/fixtures/profile.json");
const image = readFileSync("public/assets/og-cover.jpg");
const results = [];
const failures = [];
const interactionsOnly = process.env.QA_DESKTOP_INTERACTIONS_ONLY === "1";
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4339", "--strictPort"],
  { stdio: "ignore" },
);
let browser;

async function contextFor(width, height, language = "zh", mobile = false) {
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: "reduce",
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  });
  await context.addInitScript((language) => {
    localStorage.setItem("hello-nice-site-language", language);
    sessionStorage.setItem("nest-posts-age-confirmed", "18+");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value) => {
          window.__copiedText = value;
        },
      },
    });
  }, language);
  await context.route("**/api/x-posts", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(feed) }),
  );
  await context.route("**/api/x-profile", (route) => route.fulfill({ contentType: "application/json", body: profile }));
  await context.route("**/api/x-media?**", (route) => route.fulfill({ contentType: "image/jpeg", body: image }));
  await context.route("**/api/x-video?**", (route) =>
    route.fulfill({ status: 404, body: "Fixture has no playable video" }),
  );
  return context;
}

async function load(page, route) {
  await page.goto(origin + route, { waitUntil: "load" });
  await page
    .locator(route === "/" ? ".home-journal" : route === "/posts" ? ".post-reading .post-card" : ".contact-grid")
    .waitFor();
  await page.locator("link[rel='stylesheet'][href*='/FantasyExtras-']").waitFor({ state: "attached" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const animation of document.getAnimations()) {
      if (animation.effect?.getTiming().iterations !== Infinity) animation.finish();
    }
  });
}

async function verifyLayout(page, label, route, desktop) {
  const layout = await page.evaluate(() => {
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    const controls = [
      ...document.querySelectorAll(
        ".site-header a, .site-header button, .contact-tile, .email-option a, .email-option button, .hero-actions a, .journal-tabs button",
      ),
    ].filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
    const occluded = controls
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const x = r.x + r.width / 2;
        const y = r.y + r.height / 2;
        if (y < 0 || y >= innerHeight || x < 0 || x >= innerWidth) return false;
        return !el.contains(document.elementFromPoint(x, y));
      })
      .map((el) => el.textContent.trim());
    return {
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      main: rect(document.querySelector(".hero-copy, .route-panel")),
      journal: document.querySelector(".home-journal") && rect(document.querySelector(".home-journal")),
      nav: rect(document.querySelector(".site-nav")),
      occluded,
      desktopTabs: !!document.querySelector(".journal-tabs"),
    };
  });
  assert.ok(layout.scrollWidth <= layout.width + 1, `${label}: horizontal overflow`);
  assert.ok(layout.main.x >= -1 && layout.main.right <= layout.width + 1, `${label}: main panel outside viewport`);
  // A control near the viewport edge must become reachable when scrolled into the reading area.
  if (!desktop && layout.occluded.length) {
    layout.initialOccluded = layout.occluded;
    layout.occluded = await page.evaluate((labels) => {
      const blocked = [];
      for (const label of labels) {
        const element = [...document.querySelectorAll("a, button")].find(
          (el) => el.textContent.trim() === label && el.getClientRects().length,
        );
        element.scrollIntoView({ block: "center", behavior: "instant" });
        const r = element.getBoundingClientRect();
        if (!element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))) blocked.push(label);
      }
      window.scrollTo({ top: 0, behavior: "instant" });
      return blocked;
    }, layout.occluded);
  }
  assert.deepEqual(layout.occluded, [], `${label}: controls covered by another element`);
  if (route === "/" && desktop) {
    assert.ok(layout.journal.bottom <= page.viewportSize().height - 16, `${label}: journal clipped`);
    assert.equal(layout.desktopTabs, true);
  }
  if (!desktop) assert.equal(layout.desktopTabs, route === "/");
  results.push({ label, ...layout });
}

async function check(name, callback) {
  try {
    await callback();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, error: error.stack });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

try {
  mkdirSync(output, { recursive: true });
  for (let attempt = 0; attempt < 50; attempt++) {
    if (
      await fetch(origin)
        .then((r) => r.ok)
        .catch(() => false)
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({
    channel: process.env.QA_BROWSER || "chrome",
    args: ["--autoplay-policy=user-gesture-required"],
  });

  for (const [width, height, mobile] of interactionsOnly
    ? []
    : [
        [1920, 1080],
        [1440, 900],
        [1366, 768],
        [1280, 800],
        [1024, 768],
        [901, 800],
        [900, 900],
        [820, 1180, true],
        [390, 844, true],
        [360, 740, true],
        [320, 740, true],
        [844, 390, true],
        [1024, 768, true],
      ]) {
    await check(`layout ${width}×${height}`, async () => {
      const context = await contextFor(width, height, "zh", mobile);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        for (const route of ["/", "/posts", "/contact"]) {
          await load(page, route);
          await verifyLayout(page, `${width}×${height}${route}`, route, width >= 901 && !mobile);
          if ([1440, 1280].includes(width)) {
            const name = route === "/" ? "home" : route.slice(1);
            await page.screenshot({ path: path.join(output, `${name}-${width}.png`) });
            if (name === "contact" && width === 1440)
              await page.screenshot({ path: path.join(output, "contact-full.png"), fullPage: true });
          }
        }
        assert.deepEqual(errors, []);
      } finally {
        await context.close();
      }
    });
  }

  for (const language of interactionsOnly ? [] : ["ja", "en"]) {
    await check(`desktop locale ${language}`, async () => {
      const context = await contextFor(1280, 800, language);
      const page = await context.newPage();
      try {
        for (const route of ["/", "/posts", "/contact"]) {
          await load(page, route);
          await verifyLayout(page, `1280-${language}${route}`, route, true);
        }
      } finally {
        await context.close();
      }
    });
  }

  await check("journal tabs, keyboard navigation, quote shuffle, resize preservation", async () => {
    const context = await contextFor(1440, 900);
    const page = await context.newPage();
    try {
      await load(page, "/");
      const quoteTab = page.locator("#journal-tab-quote");
      await quoteTab.click();
      assert.equal(await quoteTab.getAttribute("aria-selected"), "true");
      assert.equal(await page.locator("#journal-panel-about").isVisible(), false);
      const before = await page.locator(".journal-quote p").textContent();
      await page.locator(".journal-copy").click();
      assert.equal(await page.evaluate(() => window.__copiedText), before);
      await page.locator(".journal-shuffle").click();
      assert.notEqual(await page.locator(".journal-quote p").textContent(), before);
      await quoteTab.focus();
      await page.keyboard.press("ArrowLeft");
      assert.equal(await page.locator("#journal-tab-about").getAttribute("aria-selected"), "true");
      assert.equal(await page.locator("#journal-tab-about").evaluate((el) => el === document.activeElement), true);
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.locator(".journal-tabs").isVisible(), true);
      assert.equal(await page.locator(".journal-notice").isVisible(), true);
      assert.equal(await page.locator(".journal-quote").isVisible(), false);
      await quoteTab.click();
      assert.equal(await page.locator(".journal-quote").isVisible(), true);
    } finally {
      await context.close();
    }
  });

  await check("contact filters, clipboard success/failure, mobile retains selected filter", async () => {
    const context = await contextFor(1440, 900);
    const page = await context.newPage();
    try {
      await load(page, "/contact");
      const filters = page.locator(".contact-filters button");
      await filters.nth(1).click();
      assert.equal(await page.locator(".contact-tile").count(), 3);
      assert.equal(await page.locator(".contact-tile[href]").count(), 3);
      await filters.nth(2).click();
      assert.equal(await page.locator("button.contact-tile").count(), 4);
      await page.locator(".contact-tile.wechat").click();
      assert.equal(await page.evaluate(() => window.__copiedText), "loveyong07");
      assert.equal(
        await page.locator(".contact-tile.wechat").evaluate((el) => el.classList.contains("is-copied")),
        true,
      );
      await page.locator(".email-option button").click();
      assert.equal(await page.evaluate(() => window.__copiedText), "loveyong2007@gmail.com");
      await page.evaluate(() =>
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: async () => {
              throw new Error("Clipboard denied");
            },
          },
        }),
      );
      await page.locator(".contact-tile.qq").click();
      assert.equal(await page.locator(".contact-copy-fallback input").inputValue(), "3437702786");
      assert.equal(
        await page.locator(".contact-copy-fallback input").evaluate((el) => el === document.activeElement),
        true,
      );
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.locator(".contact-filters").isVisible(), true);
      assert.equal(await page.locator(".contact-tile").count(), 4);
      await filters.nth(0).click();
      assert.equal(await page.locator(".contact-tile").count(), 7);
      assert.equal(await page.locator(".mail-compose-link").isVisible(), true);
      await page.getByRole("button", { name: "打开菜单", exact: true }).click();
      const contact = page.locator(".site-nav a[data-page=contact]");
      assert.equal(await contact.isVisible(), true);
      await contact.click();
      assert.equal(await page.locator(".menu-toggle").getAttribute("aria-expanded"), "false");
    } finally {
      await context.close();
    }
  });

  await check("sticky directory, current section, font size, independent selections, previews", async () => {
    const context = await contextFor(1440, 900);
    const page = await context.newPage();
    try {
      await load(page, "/posts");
      const nav = page.locator(".posts-quick-nav");
      const large = page.locator(".reading-text-toggle");
      const before = await page
        .locator(".post-reading .post-text")
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      await large.click();
      assert.equal(await large.getAttribute("aria-pressed"), "true");
      assert.ok(
        (await page.locator(".post-reading .post-text").evaluate((el) => parseFloat(getComputedStyle(el).fontSize))) >
          before,
      );
      await page.locator(".quick-nav-articles").click();
      await page.waitForFunction(
        () => document.querySelector(".quick-nav-articles").getAttribute("aria-current") === "location",
      );
      const sticky = await nav.boundingBox();
      assert.ok(sticky.y >= 20 && sticky.y <= 28, "directory stays at the viewport edge");
      await page.locator(".article-timeline-button").nth(1).click();
      const article = await page.locator("#x-article-title").textContent();
      await page.locator(".quick-nav-daily").click();
      await page.locator(".post-index-button:not(.article-timeline-button)").nth(1).click();
      assert.equal(
        await page.locator("#x-article-title").textContent(),
        article,
        "post selection must preserve the article",
      );
      await page.locator(".quick-nav-pin").click();
      await page.locator(".posts-group").first().locator(".post-media-open").first().click();
      await page.locator(".media-lightbox").waitFor();
      await page.keyboard.press("Escape");
      assert.equal(await page.locator(".media-lightbox").count(), 0);
      assert.equal(await page.locator(".quick-nav-message, .reading-invitation").count(), 0);
      await page.locator(".quick-nav-articles").click();
      await page.waitForFunction(
        () => document.querySelector(".quick-nav-articles").getAttribute("aria-current") === "location",
      );
      assert.equal(await page.locator("#x-articles h2").evaluate((el) => el === document.activeElement), true);
      await page.emulateMedia({ reducedMotion: "reduce" });
      assert.equal(
        await page
          .locator(".post-card")
          .first()
          .evaluate((el) => getComputedStyle(el).animationName),
        "none",
      );
    } finally {
      await context.close();
    }
  });
  await check("story drawer search, filters, keyboard focus, independent reader selection", async () => {
    const context = await contextFor(1440, 900);
    const page = await context.newPage();
    try {
      await load(page, "/posts");
      const trigger = page.locator(".reading-library-trigger");
      const search = page.locator(".library-search input");
      await trigger.click();
      assert.equal(await page.locator(".reading-library").evaluate((el) => el.matches(":modal")), true);
      assert.equal(await search.evaluate((el) => el === document.activeElement), true);
      await search.fill("no-match-unique-9462");
      assert.equal(await page.locator(".library-result").count(), 0);
      assert.equal(await page.locator(".library-empty").isVisible(), true);
      await page.locator(".library-empty button").click();
      assert.equal(await page.locator(".library-result").count(), feed.posts.length + feed.articles.length + 1);
      await page.locator(".library-filters button").nth(3).click();
      assert.equal(await page.locator(".library-result").count(), 2);
      await search.fill("ＳＥＣＯＮＤ");
      assert.equal(await page.locator(".library-result").count(), 1, "full-width and case-insensitive search");
      const postBefore = await page.locator(".post-reading .post-text").textContent();
      await page.locator(".library-result").click();
      await page.waitForFunction(() => !document.querySelector(".reading-library").open);
      assert.equal(await page.locator("#x-article-title").textContent(), "A second independent article");
      assert.equal(await page.locator(".post-reading .post-text").textContent(), postBefore);
      await trigger.click();
      await search.fill("");
      await page.locator(".library-filters button").nth(1).click();
      assert.equal(await page.locator(".library-result").count(), feed.posts.length + 1);
      await page.keyboard.press("Escape");
      assert.equal(await page.locator(".reading-library").isVisible(), false);
      assert.equal(await trigger.evaluate((el) => el === document.activeElement), true);
      await trigger.click();
      for (let index = 0; index < 14; index++) {
        await page.keyboard.press("Tab");
        assert.equal(
          await page.locator(".reading-library").evaluate((el) => el.contains(document.activeElement)),
          true,
        );
      }
      await page.screenshot({ path: path.join(output, "story-drawer.png") });
      await page.keyboard.press("Escape");
      assert.equal(await page.locator(".reading-focus-toggle").count(), 0);
      const largeText = page.locator(".reading-text-toggle");
      await largeText.click();
      assert.equal(await largeText.getAttribute("aria-pressed"), "true");
      await largeText.click();
      assert.equal(await largeText.getAttribute("aria-pressed"), "false");
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await trigger.isVisible(), true);
      await trigger.click();
      assert.equal(await page.locator(".reading-library").evaluate((el) => el.matches(":modal")), true);
      await page.locator(".library-close").click();
      assert.equal(await trigger.evaluate((el) => el === document.activeElement), true);
    } finally {
      await context.close();
    }
  });

  await check("letter topic and draft produce a correctly encoded email across viewport changes", async () => {
    const context = await contextFor(1440, 900);
    const page = await context.newPage();
    try {
      await load(page, "/contact");
      await page.locator(".letter-topics button").nth(1).click();
      assert.equal(await page.locator(".letter-topics button").nth(1).getAttribute("aria-pressed"), "true");
      await page.locator(".letter-draft summary").click();
      const draft = "你好，初咏。\n关于你的文字：A & B + 100%？";
      await page.locator("#letter-draft-body").fill(draft);
      const target = new URL(await page.locator(".mail-compose-link").getAttribute("href"));
      assert.equal(target.protocol, "mailto:");
      assert.equal(target.pathname, "loveyong2007@gmail.com");
      assert.equal(target.searchParams.get("subject"), "读完你的文字，想和你聊聊");
      assert.equal(target.searchParams.get("body"), draft);
      await page.screenshot({ path: path.join(output, "letter-draft.png"), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.locator(".letter-composer").isVisible(), true);
      assert.equal(await page.locator("#letter-draft-body").inputValue(), draft);
      assert.equal(
        new URL(await page.locator(".mail-compose-link").getAttribute("href")).searchParams.get("body"),
        draft,
      );
      assert.equal(await page.locator(".contact-tile").count(), 7);
      assert.equal(await page.locator('.email-option a[href^="mailto:"]').count(), 1);
      assert.equal(await page.locator(".email-address span").textContent(), "loveyong2007@gmail.com");
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForFunction(() => !!document.querySelector(".letter-composer"));
      assert.equal(await page.locator("#letter-draft-body").inputValue(), draft);
    } finally {
      await context.close();
    }
  });
  for (const language of ["zh", "ja", "en"]) {
    for (const width of [320, 390, 430]) {
      await check(`touch reading and correspondence ${width}-${language}`, async () => {
        const context = await contextFor(width, 844, language, true);
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        try {
          await load(page, "/");
          await verifyLayout(page, `${width}-${language}/`, "/", false);
          await page.locator(".journal-notice-shuffle").click();
          await page.locator("#journal-tab-quote").click();
          await page.locator(".journal-copy").click();
          assert.equal(
            await page.evaluate(() => window.__copiedText),
            await page.locator(".journal-quote p").textContent(),
          );
          await page.locator(".journal-shuffle").click();
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
          await page.screenshot({ path: path.join(output, `home-mobile-${width}-${language}.png`), fullPage: true });

          await load(page, "/posts");
          await verifyLayout(page, `${width}-${language}/posts`, "/posts", false);
          const fontSize = () =>
            page.locator(".post-reading .post-text").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
          const originalSize = await fontSize();
          await page.locator(".reading-text-toggle").click();
          assert.ok((await fontSize()) > originalSize);
          await page.locator(".quick-nav-articles").click();
          await page.waitForFunction(
            () => document.querySelector(".quick-nav-articles").getAttribute("aria-current") === "location",
          );
          await page.locator(".reading-library-trigger").click();
          await page.locator(".library-filters button").nth(3).click();
          await page.locator(".library-search input").fill("second");
          assert.equal(await page.locator(".library-result").count(), 1);
          await page.screenshot({ path: path.join(output, `drawer-mobile-${width}-${language}.png`) });
          const dailyText = await page.locator(".post-reading .post-text").textContent();
          await page.locator(".library-result").click();
          assert.equal(await page.locator("#x-article-title").textContent(), "A second independent article");
          assert.equal(await page.locator(".post-reading .post-text").textContent(), dailyText);
          assert.equal(await page.locator(".reading-library").isVisible(), false);
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
          await page.screenshot({ path: path.join(output, `posts-mobile-${width}-${language}.png`) });

          await load(page, "/contact");
          await verifyLayout(page, `${width}-${language}/contact`, "/contact", false);
          await page.locator(".contact-filters button").nth(2).click();
          assert.equal(await page.locator("button.contact-tile").count(), 4);
          await page.locator(".contact-filters button").nth(0).click();
          await page.locator(".letter-guide-action").nth(2).click();
          assert.equal(await page.locator("#letter-draft-body").evaluate((el) => el === document.activeElement), true);
          await page.locator(".letter-prompt-chip").first().click();
          assert.ok((await page.locator("#letter-draft-body").inputValue()).length > 0);
          await page.locator(".letter-draft-clear").click();
          assert.equal(await page.locator("#letter-draft-body").inputValue(), "");
          const draft = `你好，${language}。\nA & B + 100%？`;
          await page.locator("#letter-draft-body").fill(draft);
          assert.equal(
            new URL(await page.locator(".mail-compose-link").getAttribute("href")).searchParams.get("body"),
            draft,
          );
          await page.locator(".email-row").scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(output, `letter-mobile-${width}-${language}.png`), fullPage: true });
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
          assert.equal(overflow, false, "expanded draft must fit the screen");
          const smallControls = await page.evaluate(() =>
            [
              ...document.querySelectorAll(
                ".journal-tabs button, .posts-quick-nav button, .reading-library[open] button, .contact-filters button, .letter-composer button, .letter-draft summary, .mail-compose-link, .letter-guide-action",
              ),
            ]
              .filter((el) => el.getClientRects().length && el.getBoundingClientRect().height < 44)
              .map((el) => el.textContent.trim()),
          );
          assert.deepEqual(smallControls, [], "new mobile controls have 44px tap targets");
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });
    }
  }
} finally {
  await browser?.close();
  server.kill();
  writeFileSync(
    path.join(output, "results.json"),
    JSON.stringify(
      {
        browser: browser?.version(),
        layouts: results,
        failures,
        verification: "Local Chrome with fixed API/media fixtures. Real X video/audio playback is outside this test.",
      },
      null,
      2,
    ),
  );
}
assert.equal(failures.length, 0, JSON.stringify(failures, null, 2));
console.log(`Verified ${results.length} route/viewport/language layouts and desktop/mobile interactions.`);
