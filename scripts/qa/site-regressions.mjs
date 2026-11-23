// Built-app interaction checks. All API/media responses are local fixtures;
// the video fixture is an actual short MP4 recorded by the test browser.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { copy } from "../../src/constants/locales.js";

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
  post.repliesUrl = `/api/x-replies?post=${post.id}`;
  post.commentsUrl = `/api/post-comments?post=${post.id}`;
  post.quotedPost = {
    ...feed.posts[0],
    text: "Quoted original",
    media: [
      { type: "photo", url: "https://pbs.twimg.com/media/QuotedPhoto.jpg", width: 3072, height: 4096 },
      ...feed.posts[0].media,
    ],
  };
  const reply = {
    id: "2190000000000000005",
    text: "Reply from X",
    author: "Reader",
    username: "reader",
    created_at: post.created_at,
  };
  const comments = [];
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
      await context.route("**/api/x-replies?**", (route) =>
        route.fulfill({ json: { status: "ok", replies: [reply] } }),
      );
      await context.route("**/api/post-comments?**", (route) => {
        if (route.request().method() === "POST") {
          const { id, text } = route.request().postDataJSON();
          comments.unshift({ id, text, createdAt: post.created_at });
        }
        return route.fulfill({ json: { status: "ok", comments } });
      });
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
    await card.getByRole("button", { name: copy.zh.viewReplies }).click();
    await card.getByText("Reply from X").waitFor();
    await card.getByRole("button", { name: copy.zh.hideReplies }).click();
    await card.getByRole("button", { name: copy.zh.viewComments }).click();
    await card.getByText(copy.zh.commentsEmpty).waitFor();
    await card.getByRole("textbox", { name: copy.zh.commentText }).fill("这篇写得很有意思！");
    await card.getByRole("button", { name: copy.zh.commentSubmit }).click();
    await card.getByText(copy.zh.commentPublished).waitFor();
    await card.getByText("这篇写得很有意思！").waitFor();
    await card.getByRole("textbox", { name: copy.zh.commentText }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, "post-discussion-mobile.png") });

    const recipient = await desktop.newPage();
    await recipient.goto(shared);
    await recipient.getByRole("button", { name: copy.zh.ageGateConfirm }).click();
    const recipientCard = recipient.locator(`#post-${post.id}`);
    await recipientCard.getByRole("button", { name: copy.zh.sharePost, exact: true }).click();
    await recipientCard.getByRole("button", { name: copy.zh.linkCopied, exact: true }).waitFor();
    assert.equal(await recipient.locator("body").getAttribute("data-copied-url"), shared);
    await recipientCard.getByRole("button", { name: copy.zh.viewComments }).click();
    await recipientCard.getByText("这篇写得很有意思！").waitFor();
    await recipient.goto(`${origin}/posts?repost=${feed.reposts[0].repostId}`);
    const repost = recipient.locator(`#repost-${feed.reposts[0].repostId}`);
    await repost.waitFor();
    await recipient.waitForFunction((id) => document.activeElement.id === `repost-${id}`, feed.reposts[0].repostId);
    console.log("✓ embedded quote photo/video, post sharing, X replies and comments across two browser sessions");
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
        const reservedAreas = [...document.querySelectorAll(".hero-copy, .home-journal, .hero .sky-letter-link")]
          .filter((element) => element.getClientRects().length)
          .map((element) => element.getBoundingClientRect());
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
          visualBioFont: Number.parseFloat(getComputedStyle(bio).fontSize) * scale,
          collisions,
          width: document.documentElement.scrollWidth,
        };
      });
      assert.ok(geometry.width <= width, `home overflows horizontally at ${width}`);
      assert.deepEqual(geometry.collisions, [], `balloon crosses reading or navigation at ${width}x${height}`);
      if (!touch) {
        assert.ok(geometry.bottom <= height - 20, `home must fit one viewport at ${width}x${height}`);
        assert.ok(
          geometry.visualBioFont >= 13,
          `home body is too small: ${geometry.visualBioFont}px at ${width}x${height}`,
        );
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
  await mobileRouteScenes(video);
  await postDiscussion(video);
  await interactions(video);
  await multipleAttachments(video);
  await routeAndAccessibility(video);
  await lazyFailures();
  await homeLayouts();
} finally {
  await browser?.close();
  server.kill();
}
