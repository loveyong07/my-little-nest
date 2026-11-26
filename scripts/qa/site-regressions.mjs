// Built-app interaction checks. All API/media responses are local fixtures;
// the video fixture is an actual short MP4 recorded by the test browser.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { copy } from "../../src/constants/locales.js";
import { ANONYMOUS_MESSAGE_ENDPOINT, ANONYMOUS_MESSAGE_ID } from "../../shared/anonymous-message.mjs";

const origin = "http://127.0.0.1:4338";
const output = process.env.QA_REGRESSION_OUTPUT || "qa/site-regressions";
const fixture = JSON.parse(readFileSync("scripts/qa/fixtures/feed.json", "utf8"));
const profile = readFileSync("scripts/qa/fixtures/profile.json");
const image = readFileSync("public/assets/og-cover.jpg");
mkdirSync(output, { recursive: true });
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4338", "--strictPort"],
  { stdio: "ignore", windowsHide: true },
);
let browser;

async function recordVideo() {
  const page = await browser.newPage();
  try {
    const bytes = await page.evaluate(async () => {
      const mimeType = "video/mp4;codecs=avc1.42001E";
      if (!MediaRecorder.isTypeSupported(mimeType)) throw new Error("These checks require Chrome's MP4 encoder.");
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 180;
      const context = canvas.getContext("2d");
      const stream = canvas.captureStream(12);
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 80000 });
      const chunks = [];
      recorder.ondataavailable = (event) => chunks.push(event.data);
      const stopped = new Promise((resolve, reject) => {
        recorder.onstop = resolve;
        recorder.onerror = reject;
      });
      let frame = 0;
      const draw = () => {
        context.fillStyle = frame++ % 2 ? "#b6d9ee" : "#e8f4fc";
        context.fillRect(0, 0, 320, 180);
        context.fillStyle = "#294c68";
        context.fillRect(frame % 240, 70, 70, 40);
      };
      draw();
      const timer = setInterval(draw, 80);
      recorder.start();
      await new Promise((resolve) => setTimeout(resolve, 6000));
      recorder.stop();
      await stopped;
      clearInterval(timer);
      stream.getTracks().forEach((track) => track.stop());
      return Array.from(new Uint8Array(await new Blob(chunks, { type: mimeType }).arrayBuffer()));
    });
    return Buffer.from(bytes);
  } finally {
    await page.close();
  }
}

function feedData() {
  const original = fixture.posts[0];
  const video = {
    ...original,
    id: "2190000000000000001",
    text: "Video continuity check",
    created_at: "2026-11-06T00:31:00.000Z",
    permalink: "https://x.com/loveyong07/status/2190000000000000001",
    media: [{ type: "video", url: "https://video.twimg.com/ext_tw_video/1/pu/vid/check.mp4", width: 320, height: 180 }],
  };
  const photo = {
    ...original,
    id: "2190000000000000002",
    text: "Hongkong date search",
    created_at: "2026-11-05T18:31:00.000Z",
    permalink: "https://x.com/loveyong07/status/2190000000000000002",
    media: [1, 2, 3].map((number) => ({
      type: "photo",
      url: `https://pbs.twimg.com/media/QaDaily${number}.jpg`,
      width: 1200,
      height: 630,
    })),
  };
  return {
    ...fixture,
    posts: [video, photo],
    repostsStatus: "ok",
    reposts: [
      {
        ...photo,
        id: "2190000000000000003",
        repostId: "2190000000000000004",
        permalink: "https://x.com/writer/status/2190000000000000003",
        username: "writer",
        author: "Writer",
        repostedAt: "2026-11-07T00:10:00.000Z",
      },
    ],
  };
}

async function setup(context, feed, video, gate = Promise.resolve(), confirmAge = true) {
  await context.route("**/api/x-posts", async (route) => {
    await gate;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(feed) });
  });
  await context.route("**/api/x-profile", (route) => route.fulfill({ contentType: "application/json", body: profile }));
  await context.route("**/api/x-media?**", (route) => route.fulfill({ contentType: "image/jpeg", body: image }));
  await context.route("**/api/x-video?**", (route) => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range || "");
    if (!range) return route.fulfill({ contentType: "video/mp4", headers: { "accept-ranges": "bytes" }, body: video });
    const start = Number(range[1]);
    const end = Math.min(Number(range[2] || video.length - 1), video.length - 1);
    return route.fulfill({
      status: 206,
      contentType: "video/mp4",
      headers: { "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${video.length}` },
      body: video.subarray(start, end + 1),
    });
  });
  if (confirmAge) await context.addInitScript(() => sessionStorage.setItem("nest-posts-age-confirmed", "18+"));
}

async function postDiscussion(video) {
  const feed = feedData();
  const post = feed.posts[1];
  post.media = [];
  post.quotedPost = {
    ...feed.posts[0],
    text: "Quoted original",
    media: [
      { type: "photo", url: "https://pbs.twimg.com/media/QuotedPhoto.jpg", width: 3072, height: 4096 },
      ...feed.posts[0].media,
    ],
  };
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: "zh-CN",
    reducedMotion: "reduce",
  });
  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    locale: "zh-CN",
    reducedMotion: "reduce",
  });
  try {
    for (const context of [mobile, desktop]) {
      await setup(context, feed, video, Promise.resolve(), false);
    }
    await mobile.addInitScript(() => {
      Object.defineProperty(navigator, "share", {
        value: async (data) => {
          document.body.dataset.sharedUrl = data.url;
        },
      });
    });
    await desktop.addInitScript(() => {
      Object.defineProperty(navigator, "share", { value: undefined });
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (url) => {
            document.body.dataset.copiedUrl = url;
          },
        },
      });
    });
    const page = await mobile.newPage();
    await page.goto(`${origin}/posts?post=${post.id}`);
    await page.getByRole("button", { name: copy.zh.ageGateConfirm }).waitFor();
    assert.equal(await page.locator(".post-card").count(), 0);
    await page.getByRole("button", { name: copy.zh.ageGateConfirm }).click();
    const card = page.locator(`#post-${post.id}`);
    const quote = card.locator(".post-quote");
    await quote.getByText("Quoted original", { exact: true }).waitFor();
    await page.waitForFunction((id) => document.activeElement.id === `post-${id}`, post.id);
    assert.equal(await quote.locator("time").getAttribute("datetime"), post.quotedPost.created_at);
    assert.equal(
      await quote.getByRole("link", { name: copy.zh.quotedPostLink }).getAttribute("href"),
      post.quotedPost.permalink,
    );
    await quote.locator("video").waitFor();
    const quotedPhoto = quote.locator(".post-media-open");
    await quotedPhoto.click();
    await page.locator(".media-lightbox img").first().waitFor();
    await page.keyboard.press("Escape");
    await page.locator(".media-lightbox").waitFor({ state: "hidden" });
    await quote.screenshot({ path: path.join(output, "quoted-post-mobile.png") });
    await card.getByRole("button", { name: copy.zh.sharePost, exact: true }).click();
    const shared = await page.locator("body").getAttribute("data-shared-url");
    assert.equal(shared, `${origin}/posts?post=${post.id}`);

    const recipient = await desktop.newPage();
    await recipient.goto(shared);
    await recipient.getByRole("button", { name: copy.zh.ageGateConfirm }).click();
    const recipientCard = recipient.locator(`#post-${post.id}`);
    await recipientCard.getByRole("button", { name: copy.zh.sharePost, exact: true }).click();
    await recipientCard.getByRole("button", { name: copy.zh.linkCopied, exact: true }).waitFor();
    assert.equal(await recipient.locator("body").getAttribute("data-copied-url"), shared);
    await recipient.goto(`${origin}/posts?repost=${feed.reposts[0].repostId}`);
    const repost = recipient.locator(`#repost-${feed.reposts[0].repostId}`);
    await repost.waitFor();
    await recipient.waitForFunction((id) => document.activeElement.id === `repost-${id}`, feed.reposts[0].repostId);
    console.log("✓ embedded quote photo/video and post sharing across two browser sessions");
  } finally {
    await mobile.close();
    await desktop.close();
  }
}

async function mobileRouteScenes(video) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  try {
    await setup(context, feedData(), video);
    const page = await context.newPage();
    for (const route of ["posts", "contact"]) {
      await page.goto(`${origin}/${route}`);
      const scene = page.locator(".site-route");
      await scene.locator(".route-floating-elements").waitFor({ state: "attached" });
      await page.waitForFunction(() => document.documentElement.scrollHeight > window.innerHeight);
      const sizes = () =>
        scene.evaluate((element) => {
          const viewport = document.createElement("div");
          viewport.style.cssText = "position:fixed;height:100lvh;visibility:hidden";
          element.append(viewport);
          const largeHeight = viewport.getBoundingClientRect().height;
          viewport.remove();
          const background = getComputedStyle(element, "::before");
          const foreground = getComputedStyle(element.querySelector(".route-floating-elements"));
          return {
            largeHeight,
            heightUnit: getComputedStyle(element).getPropertyValue("--route-scene-height").trim(),
            background: background.height,
            foreground: foreground.height,
          };
        });
      const before = await sizes();
      assert.equal(before.heightUnit, "100lvh", route);
      assert.equal(before.background, `${before.largeHeight + 32}px`, route);
      assert.equal(before.foreground, `${before.largeHeight}px`, route);
      await page.evaluate(() => window.scrollTo({ top: 400, behavior: "instant" }));
      await page.waitForFunction(() => window.scrollY > 0);
      assert.deepEqual(await sizes(), before, route);
    }
    console.log("✓ mobile Posts and Contact scene layers keep their large viewport sizing while scrolling");
  } finally {
    await context.close();
  }
}

async function interactions(video) {
  const feed = feedData();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    reducedMotion: "reduce",
  });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await setup(context, feed, video, gate);
  await context.addInitScript(
    (cached) =>
      localStorage.setItem(
        "little-nest-feed-v9",
        JSON.stringify({ savedAt: Date.now() - 16 * 60 * 1000, feed: cached }),
      ),
    feed,
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(`${origin}/posts`);
    await page.locator(".feed-status-copy span").waitFor();
    assert.equal(await page.locator(".feed-status-copy span").textContent(), copy.zh.feedRefreshing);
    assert.equal(await page.locator(".feed-status-actions").count(), 0);
    release();
    await page.waitForFunction(() => !document.querySelector(".feed-status"));
    console.log("PASS cached feed shows a pending refresh, not an error");

    const player = page.locator("#latest-posts .post-reading video");
    assert.equal(await player.evaluate((element) => element.readyState), 0);
    await page.locator("#latest-posts .post-reading .post-video-open").click();
    await page.waitForFunction(() => document.querySelector(".media-lightbox video")?.readyState >= 2);
    await page.locator(".media-lightbox video").evaluate((element) => {
      element.pause();
      element.currentTime = 1;
    });
    await page.getByRole("button", { name: copy.zh.closePreview, exact: true }).click();
    await page.waitForFunction(() => {
      const element = document.querySelector("#latest-posts .post-reading video");
      return element?.readyState >= 2 && Math.abs(element.currentTime - 1) < 0.3 && element.paused;
    });
    console.log("PASS enlargement also restores a previously unloaded inline player");
    await player.evaluate(async (element) => {
      element.muted = true;
      await element.play();
    });
    await page.waitForFunction(() => document.querySelector("#latest-posts .post-reading video")?.readyState === 4);
    await player.evaluate((element) => {
      element.currentTime = 2;
    });
    await page.locator("#latest-posts .post-reading .post-video-open").click();
    await page.waitForFunction(() => {
      const element = document.querySelector(".media-lightbox video");
      return element?.readyState >= 2 && element.currentTime >= 1.9 && !element.paused;
    });
    const expanded = page.locator(".media-lightbox video");
    await expanded.evaluate((element) => {
      element.pause();
      element.currentTime = 3;
    });
    await page.getByRole("button", { name: copy.zh.closePreview, exact: true }).click();
    assert.ok(Math.abs((await player.evaluate((element) => element.currentTime)) - 3) < 0.3);
    assert.equal(await player.evaluate((element) => element.paused), true);
    assert.equal(
      await page
        .locator("#latest-posts .post-reading .post-video-open")
        .evaluate((element) => element === document.activeElement),
      true,
    );
    console.log("PASS real MP4 progress and play/pause state survive enlargement and close");

    await page.locator(".reading-library-trigger").click();
    const search = page.getByRole("searchbox");
    await search.fill("2026/11/06");
    const displayed = await page.locator(".library-result").allTextContents();
    assert.ok(displayed.length >= 2);
    await search.fill("2026-11-06");
    assert.deepEqual(await page.locator(".library-result").allTextContents(), displayed);
    await search.fill("2026/11/07");
    assert.match((await page.locator(".library-result").allTextContents()).join(), /2026\/11\/07/);
    await search.fill("Hongkong");
    await page.locator(".library-result").filter({ hasText: "日常动态" }).click();
    assert.match(await page.locator("#latest-posts .post-reading .post-text").textContent(), /Hongkong/);
    console.log("PASS displayed dates, ISO dates, local-day rollover, repost dates and result navigation");

    const photo = page.locator("#latest-posts .post-reading .post-media-open").nth(1);
    await photo.click();
    assert.equal((await page.locator(".media-lightbox-count").textContent()).trim(), "2 / 3");
    await page.keyboard.press("Escape");
    assert.equal(await photo.evaluate((element) => element === document.activeElement), true);
    await page.setViewportSize({ width: 390, height: 844 });
    // Resizing and lazy-loading the cover can move the paragraph after the first
    // scroll. Decode the cover and settle fonts before locating the reading text.
    const cover = page.locator(".x-article-card .article-photo img").first();
    await cover.scrollIntoViewIfNeeded();
    await cover.evaluate((image) => image.decode());
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.locator(".x-article-card .article-text p").first().scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const paragraph = document.querySelector(".x-article-card .article-text p");
      const rect = paragraph?.getBoundingClientRect();
      return rect && rect.top >= 0 && rect.bottom <= innerHeight;
    });
    await page.locator(".reading-directory-return").waitFor({ state: "visible" });
    await page.screenshot({ path: path.join(output, "mobile-reading.png") });
    await page.locator(".reading-directory-return").click();
    assert.ok(await page.locator(".posts-quick-nav").evaluate((element) => element.getBoundingClientRect().top >= -1));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    console.log("PASS photo selection/focus and mobile return to contents without overflow");

    await page.locator(".site-header .brand").click();
    await page.getByRole("button", { name: copy.zh.openMenu, exact: true }).click();
    await page.locator("#site-navigation").getByRole("link", { name: copy.zh.nav[2], exact: true }).click();
    await page.waitForURL(`${origin}/contact`);
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), "https://loveyong07.top/contact");
    assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "index, follow");
    assert.ok((await page.locator('meta[name="description"]').getAttribute("content")).startsWith("联系初咏"));
    assert.deepEqual(errors, []);
    console.log("PASS mobile Contact navigation and client-side route metadata");
  } catch (error) {
    await page.screenshot({ path: path.join(output, "interaction-failure.png"), fullPage: true }).catch(() => {});
    const layout = await page
      .evaluate(() => ({
        scrollY,
        viewport: { width: innerWidth, height: innerHeight },
        paragraph: document.querySelector(".x-article-card .article-text p")?.getBoundingClientRect().toJSON(),
        fonts: document.fonts.status,
        images: [...document.querySelectorAll(".x-article-card img")].map((image) => ({
          complete: image.complete,
          width: image.naturalWidth,
          height: image.naturalHeight,
          rect: image.getBoundingClientRect().toJSON(),
        })),
      }))
      .catch(() => null);
    writeFileSync(
      path.join(output, "interaction-failure.json"),
      JSON.stringify({ error: String(error), layout }, null, 2),
    );
    throw error;
  } finally {
    release();
    await context.close();
  }
}

async function dailyPostViews(video) {
  const feed = feedData();
  feed.posts = Array.from({ length: 30 }, (_, index) => {
    const id = String(2190000010 + index);
    return {
      ...feed.posts[1],
      id,
      text: `Daily timeline sample ${index + 1}`,
      created_at: index < 24 ? "2026-11-12T10:00:00.000Z" : "2026-10-12T10:00:00.000Z",
      permalink: `https://x.com/loveyong07/status/${id}`,
      media: index === 0 ? feed.posts[1].media : [],
    };
  });
  for (const width of [1440, 390]) {
    const phone = width === 390;
    const context = await browser.newContext({
      viewport: { width, height: phone ? 844 : 900 },
      isMobile: phone,
      hasTouch: phone,
      reducedMotion: "reduce",
    });
    try {
      await setup(context, feed, video);
      const page = await context.newPage();
      await page.goto(origin + "/posts");
      const daily = page.locator("#latest-posts");
      const cards = daily.locator(".post-reading .post-card");
      const controls = daily.locator(".post-view-switch button");
      async function activate(control) {
        await control.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
        if (phone) await control.tap();
        else await control.click();
      }
      await daily.locator(".post-index-button").nth(29).waitFor();
      assert.equal(await cards.count(), 1);
      assert.equal(await controls.first().getAttribute("aria-pressed"), "true");
      await controls.last().click();
      assert.equal(await cards.count(), 8);
      assert.equal(await daily.locator(".post-index, .post-controls").count(), 0);
      assert.ok((await controls.last().boundingBox()).height >= 44);
      const moreBounds = await daily.locator(".post-stream-more").boundingBox();
      assert.ok(moreBounds.x >= 0 && moreBounds.x + moreBounds.width <= width);
      const inViewportWidth = await cards.evaluateAll((items) =>
        items.every((item) => {
          const bounds = item.getBoundingClientRect();
          return bounds.left >= 0 && bounds.right <= window.innerWidth;
        }),
      );
      assert.ok(inViewportWidth, "timeline cards must stay inside the viewport");
      const photoTrack = cards.first().locator(".post-photo-track");
      assert.ok(await photoTrack.evaluate((track) => track.scrollWidth > track.clientWidth));
      await activate(daily.locator(".post-stream-more"));
      await page.waitForFunction(() => document.activeElement?.id === "post-2190000018");
      assert.equal(await cards.count(), 16);

      await daily.locator(".post-month-picker select").selectOption("2026-10");
      await page.waitForFunction(() => document.activeElement?.id === "post-2190000034");
      assert.equal(await cards.count(), 25);
      await activate(page.locator(".reading-library-trigger"));
      await page.locator(".library-search input").fill("Daily timeline sample 28");
      await page.locator(".library-result").click();
      await page.waitForFunction(() => document.activeElement?.id === "post-2190000037");
      assert.equal(await cards.count(), 28);
      await page.keyboard.press("ArrowRight");

      const before = await page.evaluate(() => window.scrollY);
      await page.locator('.site-nav a[data-page="contact"]').evaluate((link) => link.click());
      await page.waitForURL(origin + "/contact");
      await page.goBack();
      await page.waitForFunction(
        (top) =>
          Math.abs(window.scrollY - top) <= 2 && document.querySelectorAll(".post-stream .post-card").length === 28,
        before,
      );
      assert.equal(await controls.last().getAttribute("aria-pressed"), "true");
      await activate(controls.first());
      assert.equal(await cards.first().getAttribute("id"), "post-2190000037");
      await controls.last().click();
      await page.waitForFunction(() => document.activeElement?.id === "post-2190000037");
      await activate(daily.locator(".post-stream-more"));
      await page.waitForFunction(() => document.activeElement?.id === "post-2190000038");
      assert.equal(await cards.count(), 30);
      assert.equal(await daily.locator(".post-stream-more").count(), 0);
      await daily.locator(".posts-daily-heading").evaluate((heading) => heading.scrollIntoView());
      await page.screenshot({ path: path.join(output, `daily-stream-${width}.png`) });

      await page.goto(origin + "/posts?post=2190000037");
      await page.waitForFunction(() => document.activeElement?.id === "post-2190000037");
      assert.equal(await controls.first().getAttribute("aria-pressed"), "true");
      console.log(`PASS ${width}px daily views, batch sizing, month/search jumps, history, and direct post links`);
    } finally {
      await context.close();
    }
  }
}

async function multipleAttachments(video) {
  for (const width of [1440, 390]) {
    const feed = feedData();
    feed.posts[0].media = [1, 2, 3].map((number) => ({
      type: "video",
      url:
        number === 3
          ? "https://video.twimg.com/tweet_video/QaGif.mp4"
          : `https://video.twimg.com/ext_tw_video/${number}/pu/vid/check.mp4`,
      ...(number === 3 ? { animated: true } : {}),
      width: 320,
      height: 180,
    }));
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      isMobile: width < 700,
      hasTouch: width < 700,
      reducedMotion: "reduce",
    });
    await setup(context, feed, video);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(`${origin}/posts`);
      const players = page.locator("#latest-posts .post-reading video");
      await players.nth(2).waitFor();
      assert.equal(await players.count(), 3, "all videos and GIFs must render");
      assert.deepEqual(
        await players
          .nth(2)
          .evaluate((element) => ({ loop: element.loop, muted: element.muted, autoplay: element.autoplay })),
        { loop: true, muted: true, autoplay: false },
      );
      await players.nth(1).evaluate(async (element) => {
        element.muted = true;
        await element.play();
      });
      await page.waitForFunction(
        () => document.querySelectorAll("#latest-posts .post-reading video")[1]?.currentTime > 0.1,
      );
      await players.nth(1).evaluate((element) => {
        element.pause();
        element.currentTime = 1.75;
        element.volume = 0.35;
        element.playbackRate = 1.5;
      });
      await page.locator("#latest-posts .post-video-open").nth(1).click();
      await page.waitForFunction(() => {
        const element = document.querySelector(".media-lightbox video");
        return element?.readyState >= 2 && Math.abs(element.currentTime - 1.75) < 0.25;
      });
      assert.equal(
        new URL(await page.locator(".media-lightbox source").getAttribute("src"), origin).searchParams.get("url"),
        feed.posts[0].media[1].url,
      );
      await page.locator(".media-lightbox video").evaluate((element) => {
        element.pause();
        element.currentTime = 2.25;
      });
      await page.locator(".media-lightbox-close").click();
      await page.waitForFunction(() => {
        const element = document.querySelectorAll("#latest-posts .post-reading video")[1];
        return Math.abs(element.currentTime - 2.25) < 0.25 && element.paused;
      });
      assert.deepEqual(
        await players
          .nth(1)
          .evaluate((element) => ({ volume: element.volume, muted: element.muted, rate: element.playbackRate })),
        { volume: 0.35, muted: true, rate: 1.5 },
      );
      assert.equal(
        await players.first().evaluate((element) => element.currentTime),
        0,
        "second player cannot change the first",
      );
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.waitForFunction(
        () => document.querySelectorAll("#latest-posts .post-reading video")[2]?.currentTime > 0.1,
      );
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForFunction(() => document.querySelectorAll("#latest-posts .post-reading video")[2]?.paused);
      assert.deepEqual(errors, []);
      await page
        .locator("#latest-posts .post-reading .post-card")
        .screenshot({ path: path.join(output, `multiple-videos-${width}.png`) });
      console.log(
        `PASS ${width}px: all videos/GIFs render, second-video playback/preview stays independent, GIF autoplay follows reduced motion`,
      );
    } catch (error) {
      await page
        .screenshot({ path: path.join(output, `multiple-videos-failure-${width}.png`), fullPage: true })
        .catch(() => {});
      throw error;
    } finally {
      await context.close();
    }
  }
}

async function routeAndAccessibility(video) {
  const context = await browser.newContext({
    viewport: { width: 320, height: 740 },
    isMobile: true,
    hasTouch: true,
    locale: "zh-CN",
    reducedMotion: "no-preference",
  });
  const feed = feedData();
  feed.posts.push(fixture.posts.at(-1));
  await setup(context, feed, video);
  const page = await context.newPage();
  try {
    await page.goto(origin);
    for (const size of [
      { width: 320, height: 740 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(size);
      const targets = await page
        .locator(".language-picker button, .hero-sender .profile a")
        .evaluateAll((elements) =>
          elements.map((element) => ({ width: element.offsetWidth, height: element.offsetHeight })),
        );
      assert.equal(targets.length, 4);
      assert.ok(targets.every(({ width, height }) => width >= 44 && height >= 44));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await page.goto(origin + "/posts");
    await page.locator(".reading-library-trigger").waitFor();
    await page.locator(".feed-status").waitFor({ state: "hidden" });
    await page.locator("#page-heading").press("Tab");
    const directory = page.locator(".reading-directory-disclosure");
    const summary = directory.locator("summary");
    assert.equal(await summary.evaluate((element) => element === document.activeElement), true);
    await page.keyboard.press("Enter");
    await directory.locator(".quick-nav-articles").waitFor({ state: "visible" });
    await directory.locator(".reading-text-toggle").waitFor({ state: "visible" });
    await summary.press("Enter");
    await directory.locator(".quick-nav-articles").waitFor({ state: "hidden" });
    await page.keyboard.press("Tab");
    assert.equal(
      await page.locator(".reading-library-trigger").evaluate((element) => element === document.activeElement),
      true,
    );

    const selection = page.locator("#latest-posts .post-index-button").filter({ hasText: "Hongkong" });
    await selection.click();
    const article = page.locator("#latest-posts .post-reading .post-text");
    assert.match(await article.textContent(), /Hongkong/);
    await page.evaluate(async () => {
      await document.fonts.ready;
      window.scrollTo({ top: 800, behavior: "instant" });
    });
    const previousScroll = await page.evaluate(() => scrollY);
    assert.ok(previousScroll >= 750);
    // Dispatch the route click without scrolling the header into view first.
    await page.locator('#site-navigation [data-page="contact"]').dispatchEvent("click", { button: 0 });
    await page.waitForURL(origin + "/contact");
    assert.equal(await page.evaluate(() => scrollY), 0);
    await page.goBack();
    await article.waitFor();
    assert.match(await article.textContent(), /Hongkong/);
    await page.waitForFunction((previous) => Math.abs(scrollY - previous) <= 2, previousScroll);
    await page.goForward();
    await page.locator(".contacts-section").waitFor();
    assert.equal(await page.evaluate(() => scrollY), 0);
    await page.goBack();
    await page.setViewportSize({ width: 844, height: 390 });
    assert.ok((await page.locator(".post-month-picker select").boundingBox()).height >= 44);
    console.log("PASS history restores the post and scroll position, phone Tab order and 44px touch targets");
  } finally {
    await context.close();
  }
}

async function lazyFailures() {
  const context = await browser.newContext({ locale: "zh-CN" });
  await setup(context, feedData(), Buffer.alloc(0));
  const page = await context.newPage();
  try {
    const decoration = /\/assets\/FantasyExtras-[^/]+\.js$/;
    await context.route(decoration, (route) => route.abort());
    const rejected = page.waitForEvent("requestfailed", (request) => decoration.test(request.url()));
    await page.goto(origin);
    await rejected;
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.locator("#page-heading").isVisible(), true);
    assert.equal(await page.locator(".nest-atmosphere").count(), 0);
    await context.unroute(decoration);

    for (const [routeName, chunk, content] of [
      ["/posts", /\/assets\/PostsPage-[^/]+\.js$/, ".posts-flow"],
      ["/contact", /\/assets\/ContactPage-[^/]+\.js$/, ".contacts-section"],
    ]) {
      await context.route(chunk, (route) => route.abort());
      await page.goto(origin + routeName);
      await page.getByRole("alert").filter({ hasText: copy.zh.routeLoadError }).waitFor();
      assert.equal(await page.locator(".site-header .brand").isVisible(), true);
      await context.unroute(chunk);
      await page.getByRole("button", { name: copy.zh.routeReload, exact: true }).click();
      await page.locator(content).waitFor();
    }
    console.log("PASS each lazy region survives a failed chunk and route content can reload");
  } finally {
    await context.close();
  }
}

async function homeLayouts() {
  const sizes = [
    [1440, 900, false],
    [1280, 720, false],
    [1024, 768, false],
    [1100, 580, false],
    [820, 1180, true],
    [390, 844, true],
    [360, 740, true],
  ];
  for (const [width, height, touch, language] of sizes.flatMap((size) =>
    ["zh", "ja", "en"].map((language) => [...size, language]),
  )) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: touch,
      hasTouch: touch,
      locale: "zh-CN",
      reducedMotion: "no-preference",
    });
    await setup(context, feedData(), Buffer.alloc(0));
    await context.addInitScript((language) => localStorage.setItem("hello-nice-site-language", language), language);
    const page = await context.newPage();
    try {
      await page.goto(origin);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(
        () =>
          Boolean(document.querySelector(".hero")) &&
          (!!document.querySelector(".hero").style.getPropertyValue("--home-fit") ||
            matchMedia("(max-width: 900px), (pointer: coarse)").matches),
      );
      const geometry = await page.evaluate(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const intro = document.querySelector(".hero-intro-stack");
        const bounds = intro.getBoundingClientRect();
        const scale = bounds.width / intro.offsetWidth;
        const bio = document.querySelector(".hero-sender-note .bio");
        const sky = document.querySelector(".starrygal-sky");
        const balloon = document.querySelector(".starrygal-balloon");
        const header = document.querySelector(".site-header").getBoundingClientRect();
        const collisions = [];
        const reservedAreas = [
          ...document.querySelectorAll(
            ".hero-copy, .home-journal, .hero .sky-letter-link, .home-source-link, .site-tip-trigger",
          ),
        ]
          .filter((element) => element.getClientRects().length)
          .map((element) => element.getBoundingClientRect());
        const sourceLink = document.querySelector(".home-source-link");
        const sourceRect = sourceLink?.getBoundingClientRect() ?? null;
        const tipButton = document.querySelector(".site-tip-trigger");
        const tipRect = tipButton?.getBoundingClientRect() ?? null;
        const animation = document.querySelector(".starrygal-flight").getAnimations()[0];
        if (sky.dataset.ready === "true") {
          for (const fraction of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]) {
            if (animation) {
              animation.pause();
              animation.currentTime = 176000 * fraction;
            }
            await new Promise((resolve) => requestAnimationFrame(resolve));
            const box = balloon.getBoundingClientRect();
            const intersects = (other) =>
              box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top;
            if (intersects(header) || reservedAreas.some(intersects)) collisions.push(fraction);
          }
          if (animation) animation.currentTime = 0;
        }
        return {
          bottom: bounds.bottom,
          right: bounds.right,
          source: sourceLink
            ? {
                href: sourceLink.getAttribute("href"),
                target: sourceLink.getAttribute("target"),
                rel: sourceLink.getAttribute("rel"),
                text: sourceLink.textContent.trim(),
                left: sourceRect.left,
                top: sourceRect.top,
                right: sourceRect.right,
                bottom: sourceRect.bottom,
                height: sourceRect.height,
              }
            : null,
          tip: tipButton
            ? {
                left: tipRect.left,
                top: tipRect.top,
                right: tipRect.right,
                bottom: tipRect.bottom,
                height: tipRect.height,
                text: tipButton.textContent.trim(),
              }
            : null,
          visualBioFont: Number.parseFloat(getComputedStyle(bio).fontSize) * scale,
          collisions,
          width: document.documentElement.scrollWidth,
        };
      });
      assert.ok(geometry.width <= width, `home overflows horizontally at ${width}`);
      assert.deepEqual(geometry.collisions, [], `balloon crosses reading or navigation at ${width}x${height}`);
      assert.equal(geometry.source?.href, "https://github.com/loveyong07/my-little-nest");
      assert.equal(geometry.source?.target, "_blank");
      assert.equal(geometry.source?.rel, "noopener noreferrer");
      assert.equal(geometry.source?.text, copy[language].siteSource);
      assert.ok(geometry.source.right <= width, `source link stays within viewport at ${width}x${height}`);
      assert.equal(geometry.tip?.text, copy[language].tipLabel);
      assert.ok(geometry.tip.left >= 0 && geometry.tip.right <= width, `tip button fits horizontally at ${width}`);
      if (!touch) {
        assert.ok(geometry.bottom <= height - 20, `home must fit one viewport at ${width}x${height}`);
        assert.ok(geometry.source.bottom <= height, `source link fits desktop viewport at ${width}x${height}`);
        assert.ok(geometry.tip.bottom <= height, `tip button fits desktop viewport at ${width}x${height}`);
        assert.ok(
          geometry.source.top >= geometry.bottom || geometry.source.left >= geometry.right,
          `source link clears home cards at ${width}x${height}`,
        );
        assert.ok(
          geometry.tip.top >= geometry.bottom || geometry.tip.right <= geometry.left,
          `tip button clears home cards at ${width}x${height}`,
        );
        assert.ok(
          geometry.visualBioFont >= 13,
          `home body is too small: ${geometry.visualBioFont}px at ${width}x${height}`,
        );
      } else {
        assert.ok(geometry.source.height >= 44, `source link tap target >= 44px at ${width}x${height}`);
        assert.ok(geometry.tip.height >= 44, `tip button tap target >= 44px at ${width}x${height}`);
      }
      await page.screenshot({ path: path.join(output, `home-${width}x${height}-${language}.png`) });
      console.log(
        `PASS home ${width}x${height} ${language}: ${geometry.visualBioFont.toFixed(1)}px body, no balloon collisions, fitted layout`,
      );
    } finally {
      await context.close();
    }
  }
}

async function desktopNavStability(video) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
    reducedMotion: "reduce",
  });
  try {
    await setup(context, feedData(), video);
    const page = await context.newPage();
    await page.goto(`${origin}/`);
    await page.locator(".hero-copy").waitFor();
    await page.evaluate(() => document.fonts.ready);
    const initial = await page.evaluate(() => {
      const nav = document.querySelector(".site-nav");
      window.__stableNav = nav;
      const rect = nav.getBoundingClientRect();
      return {
        gutter: getComputedStyle(document.documentElement).scrollbarGutter,
        rect: [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(value * 100) / 100),
      };
    });
    assert.equal(initial.gutter, "stable");
    for (const [pageId, readySelector] of [
      ["posts", "#latest-posts .post-card"],
      ["contact", ".contacts-section"],
      ["home", ".hero-copy"],
    ]) {
      await page.locator(`.site-nav a[data-page="${pageId}"]`).click();
      await page.locator(readySelector).first().waitFor();
      const next = await page.evaluate(() => {
        const nav = document.querySelector(".site-nav");
        const rect = nav.getBoundingClientRect();
        return {
          sameElement: nav === window.__stableNav,
          rect: [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(value * 100) / 100),
        };
      });
      assert.equal(next.sameElement, true, `navigation element remounted on ${pageId}`);
      assert.deepEqual(next.rect, initial.rect, `navigation shifted on ${pageId}`);
    }
    console.log("PASS desktop navigation stays mounted without shifting across Home, Posts and Contact");
  } finally {
    await context.close();
  }
}

async function legalPages(video) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: "zh-CN",
  });
  try {
    await setup(context, feedData(), video);
    const page = await context.newPage();
    for (const [route, contentSelector] of [
      ["/", ".hero"],
      ["/posts", ".posts-flow"],
      ["/contact", ".contact-desk"],
    ]) {
      await page.goto(origin + route);
      const footer = page.locator(".site-legal-links");
      await footer.waitFor({ state: "visible" });
      assert.equal(await footer.getByRole("link", { name: "隐私政策" }).getAttribute("href"), "/privacy");
      assert.equal(await footer.getByRole("link", { name: "服务条款" }).getAttribute("href"), "/terms");
      assert.equal(await page.locator(".home-source-link").count(), route === "/" ? 1 : 0);
      await page.locator(contentSelector).waitFor({ state: "attached" });
      if (route === "/posts") await page.locator(".post-reading .post-card").first().waitFor();
      const footerBounds = await footer.boundingBox();
      const contentBounds = await page.locator(route === "/" ? ".hero" : "main.route-panel").boundingBox();
      assert.ok(footerBounds.y >= contentBounds.y + contentBounds.height, `legal links clear ${route} content`);
      assert.ok(footerBounds.x + footerBounds.width > 355, "legal links align to the right");
    }
    await page.getByRole("button", { name: "日本語", exact: true }).click();
    const privacy = page.locator(".site-legal-links").getByRole("link", { name: "プライバシーポリシー" });
    await privacy.click();
    await page.getByRole("heading", { name: "プライバシーポリシー", level: 1 }).waitFor();
    assert.equal(new URL(page.url()).hash, "#ja");
    assert.equal(await page.getByRole("link", { name: "ホームに戻る" }).getAttribute("href"), "/");
    await page.getByRole("link", { name: "EN", exact: true }).click();
    await page.getByRole("heading", { name: "Privacy Policy", level: 1 }).waitFor();
    await page.getByRole("button", { name: "Open menu", exact: true }).click();
    await page.getByRole("link", { name: "Terms of Service", exact: true }).click();
    await page.getByRole("heading", { name: "Terms of Service", level: 1 }).waitFor();
    await page.locator(".legal-nav").waitFor({ state: "hidden" });
    assert.equal(await page.getByRole("link", { name: "Back to home" }).getAttribute("href"), "/");
    await page.getByRole("link", { name: "中文", exact: true }).click();
    await page.getByRole("heading", { name: "服务条款", level: 1 }).waitFor();
    await page.getByRole("link", { name: "返回首页" }).click();
    await page.waitForURL(origin + "/");

    for (const viewport of [
      { width: 390, height: 844, portrait: true },
      { width: 1440, height: 900, portrait: false },
    ]) {
      const { portrait, ...size } = viewport;
      await page.setViewportSize(size);
      for (const [route, artwork] of [
        ["/privacy", "privacy-kite"],
        ["/terms", "terms-autumn-v2"],
      ]) {
        await page.goto(origin + route);
        const scene = page.locator(".legal-scene");
        const source = await scene.locator("img").evaluate(async (image) => {
          await image.decode();
          return new URL(image.currentSrc).pathname;
        });
        assert.equal(source, `/assets/${artwork}${portrait ? "-portrait" : ""}.webp`);
        await page.screenshot({
          path: path.join(output, `${route.slice(1)}-glass-${portrait ? "mobile" : "desktop"}.png`),
          animations: "disabled",
        });
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        assert.deepEqual(await scene.boundingBox(), { x: 0, y: 0, ...size });
        const copy = page.locator(".legal-copy:visible");
        assert.match(await copy.evaluate((element) => getComputedStyle(element).backdropFilter), /blur\(/);
        const reading = await copy.boundingBox();
        const back = await page.getByRole("link", { name: "返回首页" }).boundingBox();
        assert.ok(Math.abs(reading.x + reading.width / 2 - size.width / 2) <= 1, "legal card is centered");
        assert.ok(back.y >= reading.y + reading.height, "return link sits below the legal card");
        assert.ok(Math.abs(back.x + back.width - reading.x - reading.width) <= 1, "return link aligns to the right");
        assert.ok(back.height >= 60, "return link has a larger tap target");
        assert.equal((await page.locator(".brand-script").innerText()).trim(), "Nest");
        assert.deepEqual(await page.locator(".language-picker a").allTextContents(), ["中文", "日本語", "EN"]);
        const nav = page.locator(".legal-nav");
        if (portrait) {
          assert.equal(await nav.isVisible(), false);
          await page.evaluate(() => window.scrollTo(0, 0));
          const menu = page.getByRole("button", { name: "打开菜单" });
          const buttonBounds = await menu.boundingBox();
          assert.ok(buttonBounds.width >= 44 && buttonBounds.height >= 44);
          const languageBounds = await page.locator(".legal-language").boundingBox();
          assert.ok(
            buttonBounds.x >= languageBounds.x + languageBounds.width,
            "menu sits right of the language picker",
          );
          await menu.press("Enter");
          const activeLink = nav.locator("a[aria-current]:visible");
          assert.equal(await activeLink.getAttribute("href"), route);
          assert.ok((await activeLink.boundingBox()).height >= 44);
          await page.keyboard.press("Escape");
          assert.equal(await nav.isVisible(), false);
          assert.equal(await menu.evaluate((button) => document.activeElement === button), true);
        } else {
          const navBounds = await nav.boundingBox();
          assert.ok(
            Math.abs(navBounds.x + navBounds.width / 2 - size.width / 2) <= 1,
            "legal pages switch in the center on desktop",
          );
          assert.equal(await nav.locator("a[aria-current]:visible").getAttribute("href"), route);
        }
        assert.equal(
          await copy.locator(".legal-updated").evaluate((element) => getComputedStyle(element).textAlign),
          "right",
        );
      }
    }
    await page.setViewportSize({ width: 360, height: 320 });
    await page.goto(origin + "/privacy#ja");
    const menu = page.getByRole("button", { name: "メニューを開く" });
    await menu.tap();
    await page.getByRole("link", { name: "利用規約", exact: true }).tap();
    await page.waitForURL(origin + "/terms#ja");
    await page.getByRole("heading", { name: "利用規約", level: 1 }).waitFor();
    assert.equal(await menu.getAttribute("aria-expanded"), "false");
    await page.goBack();
    await page.getByRole("heading", { name: "プライバシーポリシー", level: 1 }).waitFor();
    console.log("PASS mobile legal menu, localized links, keyboard focus, full-screen art, and the return link");
  } finally {
    await context.close();
  }
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
    reducedMotion: "reduce",
  });
  try {
    const page = await desktopContext.newPage();
    await page.goto(origin + "/privacy");
    await page.locator(".legal-nav[data-swipe-ready]").waitFor();
    await page.evaluate(() => document.fonts.ready);
    const initial = await page.evaluate(() => {
      const nav = document.querySelector(".legal-nav");
      window.__stableLegalNav = nav;
      const rect = nav.getBoundingClientRect();
      return {
        gutter: getComputedStyle(document.documentElement).scrollbarGutter,
        rect: [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(value * 100) / 100),
      };
    });
    assert.equal(initial.gutter, "stable");
    await page.locator(".legal-nav").getByRole("link", { name: "服务条款" }).click();
    await page.waitForURL(origin + "/terms");
    await page.getByRole("heading", { name: "服务条款", level: 1 }).waitFor();
    const afterTerms = await page.evaluate(() => {
      const nav = document.querySelector(".legal-nav");
      const rect = nav.getBoundingClientRect();
      return {
        sameElement: nav === window.__stableLegalNav,
        rect: [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(value * 100) / 100),
        scenes: document.querySelectorAll(".legal-scene").length,
      };
    });
    assert.equal(afterTerms.sameElement, true, "legal navigation stays mounted without full reload");
    assert.deepEqual(afterTerms.rect, initial.rect, "legal navigation does not shift horizontally");
    assert.equal(afterTerms.scenes, 1);
    await page.goBack();
    await page.waitForURL(origin + "/privacy");
    await page.getByRole("heading", { name: "隐私政策", level: 1 }).waitFor();
    assert.equal(await page.evaluate(() => document.querySelector(".legal-nav") === window.__stableLegalNav), true);
    console.log("PASS desktop legal navigation switches in place without shifting or remounting");
  } finally {
    await desktopContext.close();
  }
  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    const page = await staticContext.newPage();
    await page.goto(origin + "/privacy#en");
    await page.locator(".legal-nav").getByRole("link", { name: "Terms of Service" }).click();
    await page.waitForURL(origin + "/terms#en");
    assert.equal(await page.locator(".legal-copy:visible time").innerText(), "November 23, 2026");
  } finally {
    await staticContext.close();
  }
}

async function contactDesk(video) {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1160 },
      isMobile: mobile,
      hasTouch: mobile,
      locale: "zh-CN",
      reducedMotion: "reduce",
    });
    try {
      await setup(context, feedData(), video);
      await context.addInitScript(() => {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: async (value) => {
              window.__copiedContactLink = value;
            },
          },
        });
      });
      const attempts = [];
      await context.route("**" + ANONYMOUS_MESSAGE_ENDPOINT, (route) => {
        attempts.push(route.request().postDataJSON());
        if (attempts.length === 1) return route.fulfill({ status: 429, body: "Too many requests" });
        return route.fulfill({ status: 202, json: { status: "accepted" } });
      });
      const page = await context.newPage();
      await page.goto(origin + "/contact#" + ANONYMOUS_MESSAGE_ID);
      const card = page.getByRole("region", { name: "匿名留言" });
      await page.waitForFunction((id) => {
        const card = document.getElementById(id);
        if (!card || document.activeElement !== card) return false;
        const { top, bottom } = card.getBoundingClientRect();
        return top >= 0 && bottom <= window.innerHeight;
      }, ANONYMOUS_MESSAGE_ID);
      const body = card.getByRole("textbox", { name: "留言正文" });
      const send = card.getByRole("button", { name: "发送留言" });
      const share = page.getByRole("region", { name: "分享小窝" });
      assert.equal(await send.isDisabled(), true);
      assert.equal(await body.getAttribute("maxlength"), "800");
      assert.equal(await body.getAttribute("placeholder"), "小杂鱼想要说什么？");
      if (!mobile) {
        const spacing = await card.evaluate((element) => {
          const channels = document.getElementById("contact-methods");
          const share = document.querySelector(".contact-share").getBoundingClientRect();
          const channelsBottom = channels.getBoundingClientRect().bottom;
          return {
            bottomGap: Math.abs(element.getBoundingClientRect().bottom - share.bottom),
            betweenCards: share.top - channelsBottom,
            belowTiles:
              channelsBottom - channels.querySelector(".contact-tile:last-child").getBoundingClientRect().bottom,
          };
        });
        assert.ok(spacing.bottomGap <= 1, "the anonymous message and share cards align along their bottom edges");
        assert.ok(spacing.betweenCards >= 8 && spacing.betweenCards <= 24, "the share and social cards are separate");
        assert.ok(spacing.belowTiles <= 24, "the social card ends just below the last row of channels");
      }
      assert.equal(attempts.length, 0, "opening a deep link should not submit a message");
      await card.evaluate((element) => element.blur());
      if (!mobile) await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.screenshot({
        path: path.join(output, mobile ? "anonymous-message-mobile.png" : "anonymous-message-desktop.png"),
      });

      await body.fill(" 你好，初咏！ ");
      await send.click();
      await card.getByText("发送太频繁了，请稍后再试。").waitFor();
      assert.equal(await body.inputValue(), " 你好，初咏！ ");
      await send.click();
      await card.getByText("留言已发送。谢谢你写给我！").waitFor();
      assert.equal(await body.inputValue(), "");
      assert.equal(await send.isDisabled(), true);
      assert.deepEqual(attempts, [
        { message: "你好，初咏！", id: attempts[0].id },
        { message: "你好，初咏！", id: attempts[0].id },
      ]);
      for (const [label, url] of [
        ["复制主页链接", "https://loveyong07.top/"],
        ["复制匿名留言链接", "https://loveyong07.top/contact#anonymous-message"],
      ]) {
        const button = share.getByRole("button", { name: label });
        await button.click();
        await button.getByText("链接已复制").waitFor();
        assert.equal(await page.evaluate(() => window.__copiedContactLink), url);
      }
      await page.evaluate(() => {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: async () => {
              throw new Error("clipboard unavailable");
            },
          },
        });
      });
      await share.getByRole("button", { name: "复制匿名留言链接" }).click();
      const manualCopy = share.getByRole("textbox", { name: "复制匿名留言链接" });
      assert.equal(await manualCopy.inputValue(), "https://loveyong07.top/contact#anonymous-message");
      assert.equal(await manualCopy.evaluate((field) => document.activeElement === field), true);
    } finally {
      await context.close();
    }
  }
  console.log("PASS desktop and mobile Contact layout, anonymous message retry, share links and clipboard fallback");
}

async function routeHeadings(video) {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 360, height: 740 } : { width: 1280, height: 900 },
      isMobile: mobile,
      hasTouch: mobile,
      locale: "zh-CN",
      reducedMotion: "reduce",
    });
    try {
      await setup(context, feedData(), video);
      const page = await context.newPage();
      await page.goto(origin + "/contact");
      const breadcrumb = page.locator(".route-breadcrumb");
      for (const [route, active, caption] of [
        ["contact", "联系", "写封信，或留几句想说的话。"],
        ["posts", "动态", "把日常写成片段，把想说的留在这里。"],
      ]) {
        await page.waitForURL(origin + "/" + route);
        await page.getByText(caption, { exact: true }).waitFor();
        assert.equal(await breadcrumb.isVisible(), !mobile);
        if (!mobile) {
          assert.deepEqual(await breadcrumb.locator(":scope > *").allTextContents(), [
            "首页",
            "/",
            "动态",
            "/",
            "联系",
          ]);
          assert.equal(await breadcrumb.locator('[aria-current="page"]').textContent(), active);
          assert.equal(await breadcrumb.getByRole("link", { name: "首页" }).getAttribute("href"), "/");
        }
        const fits = await page.evaluate(
          (leading) => {
            const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
            return (
              rect(leading).top >= rect(".site-header").bottom &&
              rect(".route-page-intro").bottom < rect(".route-panel").top
            );
          },
          mobile ? ".route-page-kicker" : ".route-breadcrumb",
        );
        assert.ok(fits, "the route heading clears the site header and the content panel");
        if (route === "posts") {
          await page.locator(".reading-library-trigger").waitFor({ state: "attached" });
          assert.equal(
            await page.locator(".site-header .brand").evaluate((brand) => getComputedStyle(brand).textDecorationLine),
            "none",
          );
        }
        await page.screenshot({
          path: path.join(output, `${route}-heading-${mobile ? "mobile" : "desktop"}.png`),
          clip: { x: 0, y: 0, width: mobile ? 360 : 680, height: mobile ? 310 : 400 },
        });
        if (mobile) await page.getByRole("button", { name: "打开菜单" }).click();
        const navigation = mobile ? page.getByRole("navigation", { name: "主导航" }) : breadcrumb;
        const otherPage = navigation.getByRole("link", { name: route === "contact" ? "动态" : "联系" });
        assert.equal(await otherPage.getAttribute("href"), route === "contact" ? "/posts" : "/contact");
        await otherPage.click();
      }
      await page.waitForURL(origin + "/contact");
    } finally {
      await context.close();
    }
  }
  console.log("PASS route headings, desktop breadcrumbs, mobile menu navigation and the unadorned Nest link");
}

async function tipModalCheck(video) {
  for (const mobile of [false, true]) {
    const width = mobile ? 390 : 1280;
    const height = mobile ? 844 : 800;
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: mobile,
      hasTouch: mobile,
      locale: "zh-CN",
      reducedMotion: "reduce",
    });
    try {
      await setup(context, feedData(), video);
      const page = await context.newPage();
      for (const route of ["/", "/posts", "/contact", "/privacy", "/terms"]) {
        await page.goto(origin + route);
        const trigger = page.locator(".site-tip-trigger");
        await trigger.waitFor({ state: "visible" });
        assert.equal((await trigger.innerText()).trim(), "投喂");
        const box = await trigger.boundingBox();
        assert.ok(box.x < width / 2, `tip button sits on the left side on ${route} (${width})`);
        if (mobile) assert.ok(box.height >= 44, `mobile tip button tap target >= 44px on ${route}`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

        await trigger.click();
        const dialog = page.locator('.tip-modal-panel[role="dialog"]');
        await dialog.waitFor({ state: "visible" });
        assert.equal(
          (await dialog.locator("#tip-modal-title").textContent()).trim(),
          "如果能投喂Yong，Yong会给Yuki买糖果",
        );

        const yukiBtn = dialog.locator(".tip-yuki-button");
        await yukiBtn.waitFor({ state: "visible" });
        const yukiThumbOk = await yukiBtn.locator("img").evaluate((img) => img.complete && img.naturalWidth > 0);
        assert.equal(yukiThumbOk, true, `Yuki thumbnail loads on ${route}`);
        if (mobile) assert.ok((await yukiBtn.boundingBox()).height >= 44);

        const cards = dialog.locator(".tip-qr-card");
        assert.equal(await cards.count(), 4);
        assert.deepEqual(await cards.locator(".tip-qr-label").allTextContents(), [
          "WeChat Pay",
          "Alipay",
          "BNB USDT",
          "BNB USDC",
        ]);
        const cardBoxes = await cards.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().left));
        if (!mobile) {
          assert.ok(cardBoxes[0] < cardBoxes[1] && cardBoxes[1] < cardBoxes[2] && cardBoxes[2] < cardBoxes[3]);
        }
        const imagesOk = await dialog
          .locator(".tip-qr-frame img")
          .evaluateAll((imgs) => imgs.every((img) => img.complete && img.naturalWidth > 0));
        assert.equal(imagesOk, true, `all 4 QR codes decode cleanly on ${route}`);
        assert.ok(
          (await cards.nth(2).locator(".tip-wallet-copy").textContent()).includes(
            "0xec3b3026faa3091baa812ae2793ee2c3a955959a",
          ),
        );
        assert.ok(
          (await cards.nth(3).locator(".tip-wallet-copy").textContent()).includes(
            "0xec3b3026faa3091baa812ae2793ee2c3a955959a",
          ),
        );

        await yukiBtn.click();
        const yukiLightbox = page.locator(".tip-yuki-lightbox");
        await yukiLightbox.waitFor({ state: "visible" });
        const yukiFullImg = yukiLightbox.locator(".tip-yuki-lightbox-image");
        const yukiFullMetrics = await yukiFullImg.evaluate((img) => {
          const r = img.getBoundingClientRect();
          return {
            loaded: img.complete && img.naturalWidth > 0,
            width: r.width,
            height: r.height,
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
          };
        });
        assert.equal(yukiFullMetrics.loaded, true);
        assert.ok(yukiFullMetrics.width > 120 && yukiFullMetrics.height > 120);
        assert.ok(yukiFullMetrics.left >= 0 && yukiFullMetrics.right <= width);
        assert.ok(yukiFullMetrics.top >= 0 && yukiFullMetrics.bottom <= height);
        const yukiCloseBox = await yukiLightbox.locator(".tip-yuki-lightbox-close").boundingBox();
        assert.ok(yukiCloseBox.y >= yukiFullMetrics.bottom && yukiCloseBox.y + yukiCloseBox.height <= height);

        if (mobile) await yukiLightbox.locator(".tip-yuki-lightbox-close").click();
        else await page.keyboard.press("Escape");
        await yukiLightbox.waitFor({ state: "hidden" });
        assert.equal(await dialog.isVisible(), true);
        assert.equal(await yukiBtn.evaluate((el) => document.activeElement === el), true);

        if (mobile) await dialog.locator(".tip-modal-close").click();
        else await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        assert.equal(await trigger.evaluate((el) => document.activeElement === el), true);
      }
      console.log(`PASS ${width}px tip button, 4-QR modal, and adaptive Yuki lightbox across all 5 pages`);
    } finally {
      await context.close();
    }
  }
}

try {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (
      await fetch(origin)
        .then((response) => response.ok)
        .catch(() => false)
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ channel: process.env.QA_BROWSER || "chrome" });
  const video = await recordVideo();
  await routeHeadings(video);
  await contactDesk(video);
  await legalPages(video);
  await tipModalCheck(video);
  await desktopNavStability(video);
  await mobileRouteScenes(video);
  await postDiscussion(video);
  await interactions(video);
  await dailyPostViews(video);
  await multipleAttachments(video);
  await routeAndAccessibility(video);
  await lazyFailures();
  await homeLayouts();
} finally {
  await browser?.close();
  server.kill();
}
