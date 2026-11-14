#!/usr/bin/env node
// Computed-style, layout and DOM snapshots for refactors that must not change the page.
//
//   npm run build
//   npm run qa:styles -- capture qa/styles/before
//   (change code, rebuild)
//   npm run qa:styles -- capture qa/styles/after
//   npm run qa:styles -- compare qa/styles/before qa/styles/after
//
// Every page runs against fixed API fixtures, a fixed clock and a seeded Math.random,
// so two captures of the same build are identical. Animations are paused at their
// start and transitions finished before reading styles. A local Chrome or Edge is
// used through playwright-core (QA_BROWSER=chrome|msedge); nothing is downloaded.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import pixelmatch from "pixelmatch";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptRoot = path.resolve(path.dirname(scriptPath), "../..");
const root = process.env.QA_ROOT ? path.resolve(process.env.QA_ROOT) : scriptRoot;
// An isolated source baseline uses this same collector and these same fixtures.
const fixtures = path.join(scriptRoot, "scripts/qa/fixtures");
const PORT = Number(process.env.QA_PORT || 4317);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const FIXED_TIME = new Date("2026-10-11T10:00:00+08:00");
const CONCURRENCY = Number(process.env.QA_CONCURRENCY || 4);

const viewports = {
  desktop: { viewport: { width: 1440, height: 900 } },
  laptop: { viewport: { width: 1024, height: 768 } },
  short: { viewport: { width: 1100, height: 580 } },
  tablet: { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  narrow: { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true },
};
const baseViewports = Object.keys(viewports);
viewports.landscape = { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true };
viewports["short-phone"] = { viewport: { width: 390, height: 320 }, isMobile: true, hasTouch: true };
const pages = { home: "/", posts: "/posts", contact: "/contact" };

function scenarios() {
  const list = [];
  const add = (scenario) => list.push({ lang: "zh", ...scenario });
  for (const vp of baseViewports) for (const page of Object.keys(pages)) add({ vp, page, shot: true });
  for (const vp of ["desktop", "phone"]) for (const lang of ["ja", "en"]) for (const page of Object.keys(pages)) add({ vp, page, lang });
  for (const vp of ["desktop", "phone"]) for (const page of Object.keys(pages)) add({ vp, page, effects: false });
  for (const page of Object.keys(pages)) add({ vp: "phone", page, reducedMotion: true });
  for (const vp of ["tablet", "phone"]) for (const page of Object.keys(pages)) add({ vp, page, action: "menu", shot: true });
  for (const vp of ["desktop", "phone"]) {
    add({ vp, page: "posts", action: "photo", shot: true });
    add({ vp, page: "posts", action: "video" });
    for (const feed of ["offline", "loading", "empty", "media-error"]) add({ vp, page: "posts", feed, shot: feed === "offline" });
  }
  add({ vp: "desktop", page: "posts", feed: "pin-unavailable" });
  add({ vp: "desktop", page: "contact", action: "copy" });
  add({ vp: "phone", page: "contact", action: "copy-fail" });
  for (const page of Object.keys(pages)) {
    add({ vp: "desktop", page, action: "hover" });
    add({ vp: "desktop", page, action: "focus" });
  }
  add({ vp: "landscape", page: "posts", action: "photo", shot: true });
  add({ vp: "short-phone", page: "home", action: "menu-contact", shot: true });
  for (const vp of ["desktop", "phone"]) add({ vp, page: "posts", action: "photo-keyboard", shot: true });
  for (const vp of baseViewports) add({ vp, page: "posts", ageGate: true, shot: true });
  for (const vp of ["desktop", "phone"]) for (const lang of ["ja", "en"]) add({ vp, page: "posts", lang, ageGate: true, shot: true });
  add({ vp: "phone", page: "posts", ageGate: true, forcedColors: true, shot: true });
  return list.map((scenario) => ({
    ...scenario,
    name: [scenario.page, scenario.vp, scenario.lang, scenario.effects === false && "effects-off",
      scenario.reducedMotion && "reduced", scenario.ageGate && "age-confirmation",
      scenario.forcedColors && "forced-colors", scenario.feed, scenario.action].filter(Boolean).join("-"),
  }));
}

// ---------------------------------------------------------------- in-page helpers

const pageHelpers = () => {
  const SKIP = new Set(["HEAD", "SCRIPT", "STYLE", "LINK", "META", "TITLE", "NOSCRIPT"]);
  // Read lazily: init scripts run before the document has a styled root element.
  let props;
  const values = new Map();
  const index = (value) => {
    if (!values.has(value)) values.set(value, values.size);
    return values.get(value);
  };
  const keyOf = (element) => {
    const parts = [];
    for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
      const position = node.parentElement ? [...node.parentElement.children].indexOf(node) : 0;
      parts.unshift(`${node.tagName.toLowerCase()}:${position}`);
    }
    return parts.join(">");
  };
  const styleOf = (element, pseudo) => {
    const style = getComputedStyle(element, pseudo);
    if (pseudo && ["none", "normal"].includes(style.content)) return null;
    return props.map((name) => index(style.getPropertyValue(name)));
  };
  // Fixed layers are measured against the viewport and everything else against the
  // document, so the scroll position at capture time does not matter.
  const record = (element, fixed) => {
    const rect = element.getBoundingClientRect();
    const offset = fixed ? [0, 0] : [scrollX, scrollY];
    return {
      k: keyOf(element),
      cls: typeof element.className === "string" ? element.className : element.getAttribute("class") ?? "",
      attrs: [...element.attributes].map(({ name, value }) => [name, value]),
      text: [...element.childNodes].filter((node) => node.nodeType === 3).map((node) => node.data).join("").trim(),
      rect: element.getClientRects().length === 0 ? [0, 0, 0, 0]
        : [rect.x + offset[0], rect.y + offset[1], rect.width, rect.height].map((value) => Math.round(value * 100) / 100),
      s: styleOf(element),
      before: styleOf(element, "::before"),
      after: styleOf(element, "::after"),
    };
  };
  const walk = (element, out, inFixed = false) => {
    props ??= [...getComputedStyle(document.documentElement)].filter((name) => !name.startsWith("--")).sort();
    if (SKIP.has(element.tagName)) return;
    const fixed = inFixed || getComputedStyle(element).position === "fixed";
    out.push(record(element, fixed));
    // SVG internals only inherit; the cursor sparkles are animated by script, not CSS.
    if (element.tagName.toLowerCase() === "svg" || element.classList.contains("cursor-trail")) return;
    for (const child of element.children) walk(child, out, fixed);
  };
  window.__qa = {
    capture(selector) {
      const start = selector ? document.querySelector(selector) : document.documentElement;
      const elements = [];
      if (start) walk(start, elements);
      return { props, values: [...values.keys()], elements };
    },
    captureElement(element) {
      const elements = [];
      let inFixed = false;
      for (let node = element.parentElement; node && !inFixed; node = node.parentElement) inFixed = getComputedStyle(node).position === "fixed";
      walk(element, elements, inFixed);
      return { props, values: [...values.keys()], elements };
    },
    keyOf,
  };
};

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    for (const animation of document.getAnimations()) {
      if (animation instanceof CSSTransition) animation.finish();
      else { animation.pause(); animation.currentTime = 0; }
    }
  });
}

async function finishAnimationsForScreenshot(page) {
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      const { iterations } = animation.effect?.getTiming?.() ?? {};
      if (iterations === Infinity) animation.currentTime = 0;
      else animation.finish();
    }
  });
}

// ---------------------------------------------------------------- one scenario

async function prepareContext(browser, scenario) {
  const context = await browser.newContext({
    ...viewports[scenario.vp],
    deviceScaleFactor: 1,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    reducedMotion: scenario.reducedMotion ? "reduce" : "no-preference",
    forcedColors: scenario.forcedColors ? "active" : "none",
  });
  const feed = readFileSync(path.join(fixtures, "feed.json"), "utf8");
  const profile = readFileSync(path.join(fixtures, "profile.json"), "utf8");
  const image = readFileSync(path.join(scriptRoot, "public/assets/og-cover.jpg"));
  const feedResponses = {
    offline: { status: 503, body: { status: "unavailable", posts: [] } },
    empty: { status: 200, body: { status: "ok", posts: [], pinnedPost: null, pinnedStatus: "none" } },
    "pin-unavailable": { status: 200, body: { ...JSON.parse(feed), pinnedPost: null, pinnedStatus: "unavailable" } },
  };
  await context.route(/\/api\/x-posts(?:\?|$)/, (route) => {
    // "loading" leaves the request pending; captures finish well before the 12 s client timeout.
    if (scenario.feed === "loading") return;
    const response = feedResponses[scenario.feed];
    return response
      ? route.fulfill({ status: response.status, contentType: "application/json", body: JSON.stringify(response.body) })
      : route.fulfill({ status: 200, contentType: "application/json", body: feed });
  });
  await context.route(/\/api\/x-profile(?:\?|$)/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: profile }));
  await context.route(/\/api\/x-media\?/, (route) => scenario.feed === "media-error"
    ? route.fulfill({ status: 404, body: "" })
    : route.fulfill({ status: 200, contentType: "image/jpeg", body: image }));
  await context.route(/\/api\/x-video\?/, (route) => route.fulfill({ status: 404, body: "" }));
  await context.route(/\.mp3(?:\?|$)/, (route) => route.abort());
  await context.addInitScript(({ lang, effects, copy, ageGate }) => {
    let seed = 20261011;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    try {
      localStorage.setItem("hello-nice-site-language", lang);
      localStorage.setItem("nest-effects", String(effects));
      // Existing reading scenarios compare the feed after age confirmation.
      if (!ageGate) sessionStorage.setItem("nest-posts-age-confirmed", "18+");
    } catch { /* Storage is optional. */ }
    if (copy) {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: () => copy === "ok" ? Promise.resolve() : Promise.reject(new Error("denied")) },
      });
    }
  }, { lang: scenario.lang, effects: scenario.effects !== false, ageGate: scenario.ageGate, copy: scenario.action === "copy" ? "ok" : scenario.action === "copy-fail" ? "fail" : null });
  return context;
}

async function load(page, scenario) {
  await page.clock.setFixedTime(FIXED_TIME);
  await page.addInitScript(pageHelpers);
  await page.goto(ORIGIN + pages[scenario.page], { waitUntil: "load" });
  if (scenario.ageGate) await page.waitForSelector(".posts-age-gate", { timeout: 15000 });
  else if (scenario.page === "posts") {
    await page.waitForSelector(scenario.feed === "loading" ? ".pinned-placeholder-loading" : ".post-reading .post-card, .feed-empty", { timeout: 15000 });
    // The timeline font stylesheet loads 3 seconds after load; it changes .post-text.
    await page.waitForFunction(() => [...document.fonts].some((font) => font.family.includes("ZCOOL")), null, { timeout: 15000 });
  }
  // Extras wait for the feed; use their stylesheet so readiness doesn't depend on controls.
  if (scenario.feed !== "loading" && !scenario.ageGate) await page.waitForSelector("link[rel='stylesheet'][href*='/FantasyExtras-']", { state: "attached", timeout: 15000 });
  // Bring lazy media into range once so every capture sees loaded images.
  await page.evaluate(async () => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
    await new Promise((resolve) => setTimeout(resolve, 150));
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.waitForFunction(() => !document.querySelector(".post-media-loading"), null, { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => Promise.all([...document.images].map((image) => image.complete ? null
    : new Promise((resolve) => { image.addEventListener("load", resolve, { once: true }); image.addEventListener("error", resolve, { once: true }); setTimeout(resolve, 3000); }))));
  await settle(page);
}

async function act(page, scenario) {
  if (scenario.action === "menu") await page.click(".menu-toggle");
  if (scenario.action === "menu-contact") {
    await page.click(".menu-toggle");
    const contact = page.locator(".site-nav a[href='/contact']");
    await contact.scrollIntoViewIfNeeded();
    const hit = await contact.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.height >= 44 && element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    });
    assert.ok(hit, "Contact must have a visible, clickable 44px menu target");
    await contact.click();
    await page.waitForURL(ORIGIN + "/contact");
    assert.equal(await page.locator(".menu-toggle").getAttribute("aria-expanded"), "false");
  }
  if (scenario.action === "photo" || scenario.action === "photo-keyboard") {
    await page.click(".post-media-open");
    await page.waitForSelector(".media-lightbox-slide[aria-hidden=false] img, .media-lightbox-content-photo > img");
    await page.evaluate(() => document.querySelector(".media-lightbox-slide[aria-hidden=false] img, .media-lightbox-content-photo > img").decode().catch(() => {}));
    const closeVisible = await page.locator(".media-lightbox-close").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth
        && element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    });
    assert.ok(closeVisible, "lightbox close button must be fully visible and clickable");
    if (scenario.action === "photo-keyboard") {
      const before = await page.locator(".media-lightbox-slide[aria-hidden=false] img, .media-lightbox-content-photo > img").getAttribute("src");
      await page.locator(".media-lightbox-close").focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction((src) => document.querySelector(".media-lightbox-slide[aria-hidden=false] img, .media-lightbox-content-photo > img")?.getAttribute("src") !== src, before);
      assert.ok(await page.locator(".media-lightbox-close").evaluate((element) => element === document.activeElement),
        "photo switch must preserve keyboard focus");
      await page.keyboard.press("Escape");
      await page.waitForSelector(".media-lightbox", { state: "detached" });
      assert.ok(await page.locator(".post-media-open").first().evaluate((element) => element === document.activeElement),
        "closing must return focus to the opener");
    }
  }
  if (scenario.action === "video") {
    await page.click(".post-index-button:nth-child(2)");
    await page.click(".post-video-open");
    await page.waitForSelector(".media-lightbox video, .media-lightbox-unavailable");
  }
  if (scenario.action === "copy" || scenario.action === "copy-fail") {
    await page.click(".contact-tile.wechat");
    await page.waitForSelector(scenario.action === "copy" ? ".contact-tile.is-copied" : ".contact-copy-fallback");
  }
  await page.waitForTimeout(80);
  // Clicks scroll their target into view; captures and screenshots start from the top.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await settle(page);
}

async function captureHover(page) {
  const targets = await page.evaluate(() => [...document.querySelectorAll("a[href], button, select, input, .contact-tile, .post-index-button")]
    .filter((element) => !element.closest(".nest-atmosphere") && element.getClientRects().length > 0)
    .map((element) => window.__qa.keyOf(element)));
  const results = {};
  for (const key of targets) {
    const box = await page.evaluate((target) => {
      const element = [...document.querySelectorAll("*")].find((node) => window.__qa.keyOf(node) === target);
      if (!element) return null;
      element.scrollIntoView({ block: "center", behavior: "instant" });
      const rect = element.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }, key);
    if (!box) continue;
    await page.mouse.move(box.x, box.y);
    await page.waitForTimeout(30);
    await settle(page);
    results[key] = await page.evaluate((target) => {
      const element = [...document.querySelectorAll("*")].find((node) => window.__qa.keyOf(node) === target);
      return window.__qa.captureElement(element);
    }, key);
    await page.mouse.move(1, 1);
  }
  return results;
}

async function captureFocus(page) {
  const results = {};
  const seen = new Set();
  for (let step = 0; step < 80; step++) {
    await page.keyboard.press("Tab");
    await settle(page);
    const snapshot = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body) return null;
      return { key: window.__qa.keyOf(element), data: window.__qa.captureElement(element) };
    });
    if (!snapshot || seen.has(snapshot.key)) break;
    seen.add(snapshot.key);
    results[`${step}:${snapshot.key}`] = snapshot.data;
  }
  return results;
}

async function runScenario(browser, scenario, outDir) {
  const context = await prepareContext(browser, scenario);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const url = message.location().url;
    const text = message.text();
    // Only suppress the exact network failures deliberately supplied by fixtures.
    // Runtime errors from the app remain failures, even in the recovery scenarios.
    const networkFailure = text.startsWith("Failed to load resource:");
    const expected = networkFailure && (
      /\.mp3(?:\?|$)/.test(url) ||
      (text.includes("status of 404") && /\/api\/x-video\?/.test(url)) ||
      (scenario.feed === "offline" && text.includes("status of 503") && /\/api\/x-posts(?:\?|$)/.test(url)) ||
      (scenario.feed === "media-error" && text.includes("status of 404") && /\/api\/x-media\?/.test(url))
    );
    if (!expected) errors.push(`console: ${text} (${url})`);
  });
  try {
    await load(page, scenario);
    let captures;
    if (scenario.action === "hover") captures = await captureHover(page);
    else if (scenario.action === "focus") captures = await captureFocus(page);
    else {
      await act(page, scenario);
      captures = { page: await page.evaluate(() => window.__qa.capture()) };
    }
    writeFileSync(path.join(outDir, `${scenario.name}.json.gz`), gzipSync(JSON.stringify({ scenario, errors, captures })));
    if (scenario.shot) {
      await finishAnimationsForScreenshot(page);
      // The atmosphere spans the viewport: masking its box would hide the whole page.
      // Hide particles and cursor sparkles, leaving the scene and controls visible.
      await page.screenshot({ path: path.join(outDir, `${scenario.name}.png`), fullPage: true, style: ".nest-atmosphere { visibility: hidden !important; }" });
    }
    return { name: scenario.name, errors };
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------- capture / compare

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(ORIGIN + "/");
      if (response.ok) return;
    } catch { /* Not listening yet. */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Preview server did not start on ${ORIGIN}`);
}

function hashInputs(base, inputs) {
  const hash = createHash("sha256");
  function add(relative) {
    const absolute = path.join(base, relative);
    if (!existsSync(absolute)) return;
    const entries = readdirSafe(absolute);
    if (entries) {
      for (const entry of entries.sort()) add(path.join(relative, entry));
    } else {
      hash.update(relative.replaceAll("\\", "/") + "\0");
      hash.update(readFileSync(absolute));
    }
  }
  for (const input of inputs) add(input);
  return hash.digest("hex");
}

function readdirSafe(absolute) {
  try { return readdirSync(absolute); } catch (error) {
    if (error.code === "ENOTDIR") return null;
    throw error;
  }
}

function provenance(browser) {
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  return {
    sourceRevision: process.env.QA_SOURCE_REVISION || git("rev-parse", "HEAD"),
    sourceState: process.env.QA_SOURCE_STATE || git("status", "--short"),
    sourceHash: hashInputs(root, ["src", "shared", "server", "api", "worker", "build", "public", "index.html", "vite.config.mjs", "package.json", "package-lock.json", ".openai"]),
    buildHash: hashInputs(root, ["dist/client"]),
    collectorHash: createHash("sha256").update(readFileSync(scriptPath)).digest("hex"),
    fixtureHash: hashInputs(fixtures, readdirSync(fixtures).sort()),
    imageFixtureHash: createHash("sha256").update(readFileSync(path.join(scriptRoot, "public/assets/og-cover.jpg"))).digest("hex"),
    browser: browser.version(),
    channel: process.env.QA_BROWSER || "chrome",
    fixedTime: FIXED_TIME.toISOString(),
    locale: "zh-CN", timezoneId: "Asia/Shanghai", deviceScaleFactor: 1,
  };
}

async function capture(outDir) {
  if (!existsSync(path.join(root, "dist/client/index.html"))) throw new Error("Run `npm run build` first.");
  mkdirSync(outDir, { recursive: true });
  const server = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "preview", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { cwd: root, stdio: "ignore", env: { ...process.env, X_BEARER_TOKEN: "", X_MEDIA_SIGNING_SECRET: "" } });
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({ channel: process.env.QA_BROWSER || "chrome", args: ["--autoplay-policy=user-gesture-required"] });
    const queue = scenarios().filter((scenario) => !process.env.QA_SCENARIO_PATTERN || new RegExp(process.env.QA_SCENARIO_PATTERN).test(scenario.name));
    const results = [];
    const worker = async () => {
      for (let scenario = queue.shift(); scenario; scenario = queue.shift()) {
        const result = await runScenario(browser, scenario, outDir);
        results.push(result);
        process.stdout.write(`  ${result.errors.length ? "!" : "✓"} ${result.name}\n`);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify({ capturedAt: new Date().toISOString(), ...provenance(browser), scenarios: results.map((result) => result.name).sort() }, null, 2));
    const failing = results.filter((result) => result.errors.length);
    for (const result of failing) console.log(`\n${result.name}:\n  ${result.errors.join("\n  ")}`);
    console.log(`\nCaptured ${results.length} scenarios into ${path.relative(root, outDir)}${failing.length ? ` (${failing.length} with page errors)` : ""}.`);
    if (failing.length) process.exitCode = 1;
  } finally {
    await browser?.close();
    server.kill();
  }
}

function expand(data) {
  const map = new Map();
  for (const element of data.elements) {
    const style = (indices) => indices && Object.fromEntries(indices.map((value, position) => [data.props[position], data.values[value]]));
    map.set(element.k, { ...element, s: style(element.s), before: style(element.before), after: style(element.after) });
  }
  return map;
}

function diffCapture(label, before, after, report) {
  const a = expand(before);
  const b = expand(after);
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    const left = a.get(key);
    const right = b.get(key);
    const where = `${label} ${key.split(">").slice(-3).join(">")} .${(left ?? right).cls.split(/\s+/).filter(Boolean).join(".")}`;
    if (!left || !right) { report.push(`${where}: element ${left ? "removed" : "added"}`); continue; }
    if (JSON.stringify(left.attrs) !== JSON.stringify(right.attrs)) report.push(`${where}: attributes ${JSON.stringify(left.attrs)} -> ${JSON.stringify(right.attrs)}`);
    if (left.text !== right.text) report.push(`${where}: text ${JSON.stringify(left.text)} -> ${JSON.stringify(right.text)}`);
    if (left.rect.join() !== right.rect.join()) report.push(`${where}: rect ${left.rect.join(",")} -> ${right.rect.join(",")}`);
    for (const part of ["s", "before", "after"]) {
      const x = left[part];
      const y = right[part];
      if (!x && !y) continue;
      if (!x || !y) { report.push(`${where}${part === "s" ? "" : "::" + part}: pseudo ${x ? "removed" : "added"}`); continue; }
      for (const name of new Set([...Object.keys(x), ...Object.keys(y)])) {
        if (x[name] !== y[name]) report.push(`${where}${part === "s" ? "" : "::" + part}: ${name} ${JSON.stringify(x[name])} -> ${JSON.stringify(y[name])}`);
      }
    }
  }
}

function compare(beforeDir, afterDir) {
  const beforeManifest = JSON.parse(readFileSync(path.join(beforeDir, "manifest.json"), "utf8"));
  const afterManifest = JSON.parse(readFileSync(path.join(afterDir, "manifest.json"), "utf8"));
  for (const field of ["collectorHash", "fixtureHash", "imageFixtureHash", "browser", "channel", "fixedTime", "locale", "timezoneId", "deviceScaleFactor"]) {
    assert.ok(beforeManifest[field] !== undefined, `baseline is missing ${field}; recapture with provenance`);
    assert.deepEqual(afterManifest[field], beforeManifest[field], `capture conditions differ: ${field}`);
  }
  const names = readdirSync(beforeDir).filter((name) => name.endsWith(".json.gz"));
  const afterNames = new Set(readdirSync(afterDir).filter((name) => name.endsWith(".json.gz")));
  const report = [];
  let pixelReport = [];
  for (const name of names) {
    if (!afterNames.has(name)) { report.push(`${name}: missing in ${afterDir}`); continue; }
    const before = JSON.parse(gunzipSync(readFileSync(path.join(beforeDir, name))));
    const after = JSON.parse(gunzipSync(readFileSync(path.join(afterDir, name))));
    const label = name.replace(/\.json\.gz$/, "");
    const newErrors = after.errors.filter((error) => !before.errors.includes(error));
    for (const error of newErrors) report.push(`${label}: new ${error}`);
    for (const key of new Set([...Object.keys(before.captures), ...Object.keys(after.captures)])) {
      if (!before.captures[key] || !after.captures[key]) { report.push(`${label} [${key}]: capture ${before.captures[key] ? "missing" : "added"}`); continue; }
      diffCapture(`${label} [${key.split(">").slice(-2).join(">")}]`, before.captures[key], after.captures[key], report);
    }
    const png = name.replace(/\.json\.gz$/, ".png");
    if (existsSync(path.join(beforeDir, png)) && existsSync(path.join(afterDir, png))) {
      const x = PNG.sync.read(readFileSync(path.join(beforeDir, png)));
      const y = PNG.sync.read(readFileSync(path.join(afterDir, png)));
      if (x.width !== y.width || x.height !== y.height) pixelReport.push(`${png}: size ${x.width}x${x.height} -> ${y.width}x${y.height}`);
      else {
        const diff = new PNG({ width: x.width, height: x.height });
        const changed = pixelmatch(x.data, y.data, diff.data, x.width, x.height, { threshold: 0.1 });
        if (changed) {
          pixelReport.push(`${png}: ${changed} pixels differ`);
          writeFileSync(path.join(afterDir, png.replace(/\.png$/, ".diff.png")), PNG.sync.write(diff));
        }
      }
    }
  }
  for (const name of afterNames) if (!names.includes(name)) report.push(`${name}: added in ${afterDir}`);
  console.log(`Compared ${names.length} scenarios.`);
  if (report.length) {
    console.log(`\n${report.length} style/DOM differences:`);
    for (const line of report.slice(0, Number(process.env.QA_MAX_LINES || 400))) console.log("  " + line);
    if (report.length > Number(process.env.QA_MAX_LINES || 400)) console.log(`  … ${report.length - Number(process.env.QA_MAX_LINES || 400)} more`);
  }
  if (pixelReport.length) {
    console.log(`\n${pixelReport.length} screenshots differ:`);
    for (const line of pixelReport) console.log("  " + line);
  }
  if (!report.length && !pixelReport.length) console.log("No differences: computed styles, layout, DOM and screenshots match.");
  writeFileSync(path.join(afterDir, "comparison.json"), JSON.stringify({
    before: beforeManifest, after: afterManifest, comparedScenarios: names.length,
    styleDifferences: report, screenshotDifferences: pixelReport,
  }, null, 2));
  process.exitCode = report.length || pixelReport.length ? 1 : 0;
}

const [command, ...args] = process.argv.slice(2);
if (command === "capture" && args[0]) await capture(path.resolve(root, args[0]));
else if (command === "compare" && args[1]) compare(path.resolve(root, args[0]), path.resolve(root, args[1]));
else {
  console.error("Usage: style-snapshot.mjs capture <dir> | compare <before-dir> <after-dir>");
  process.exitCode = 2;
}
