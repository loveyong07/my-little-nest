import assert from "node:assert/strict";
import { after, test } from "node:test";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let systemReducedMotion = false;
const mediaListeners = new Set();
window.matchMedia = globalThis.matchMedia = (media) => ({
  media,
  get matches() {
    return media === "(prefers-reduced-motion: reduce)" && systemReducedMotion;
  },
  addEventListener(type, listener) {
    if (type === "change" && media === "(prefers-reduced-motion: reduce)") mediaListeners.add(listener);
  },
  removeEventListener(type, listener) {
    if (type === "change") mediaListeners.delete(listener);
  },
});

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { createServer } = await import("vite");
const server = await createServer({
  configFile: resolve(process.cwd(), "vite.config.mjs"),
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});
const [
  { Header },
  { MediaLightbox },
  { default: ContactPage },
  { default: PostsPage },
  { copy },
  { SNAPSHOT },
  { pagePaths },
  { postMonths },
  { useFantasyPreferences },
] = await Promise.all([
  server.ssrLoadModule("/src/components/Header.jsx"),
  server.ssrLoadModule("/src/components/MediaLightbox.jsx"),
  server.ssrLoadModule("/src/pages/ContactPage.jsx"),
  server.ssrLoadModule("/src/pages/PostsPage.jsx"),
  server.ssrLoadModule("/src/constants/locales.js"),
  server.ssrLoadModule("/src/constants/site.js"),
  server.ssrLoadModule("/src/routes/site-route.js"),
  server.ssrLoadModule("/src/utils/posts.js"),
  server.ssrLoadModule("/src/hooks/useFantasyPreferences.js"),
]);

function resetDom() {
  document.body.replaceChildren();
  document.body.style.overflow = "";
  document.documentElement.classList.remove("motion-off");
  window.localStorage.clear();
}

async function mount(element) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await React.act(async () => root.render(element));
  return {
    container,
    async unmount() {
      await React.act(async () => root.unmount());
      container.remove();
    },
  };
}

after(async () => {
  await server.close();
  dom.window.close();
});

test("mobile navigation opens and Escape closes it with focus returned", async () => {
  resetDom();
  const { container, unmount } = await mount(
    React.createElement(Header, {
      page: "home",
      t: copy.zh,
      language: "zh",
      changeLanguage() {},
    }),
  );
  const toggle = container.querySelector(".menu-toggle");
  const nav = container.querySelector(".site-nav");
  assert.deepEqual(
    [...nav.querySelectorAll("a")].map((link) => [link.dataset.page, link.getAttribute("href")]),
    [
      ["home", pagePaths.home],
      ["posts", pagePaths.posts],
      ["contact", pagePaths.contact],
    ],
  );

  await React.act(async () => toggle.click());
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.ok(nav.classList.contains("is-open"));

  await React.act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(document.activeElement, toggle);
  await unmount();
});

test("navigation copy has matching keys and three items in every language", () => {
  const languages = [copy.zh, copy.ja, copy.en];
  const keys = Object.keys(copy.zh).sort();
  for (const locale of languages) {
    assert.deepEqual(Object.keys(locale).sort(), keys);
    assert.equal(locale.nav.length, 3);
  }
});

test("date index labels use the selected language in all three locales", () => {
  const post = { created_at: SNAPSHOT.created_at };
  const labels = ["zh", "ja", "en"].map((language) => postMonths([post], language)[0]?.label);
  const expected = ["zh-CN", "ja-JP", "en-US"].map((locale) =>
    new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(new Date(post.created_at)),
  );
  assert.deepEqual(labels, expected);
  for (const locale of [copy.zh, copy.ja, copy.en]) assert.ok(locale.postsIndexLabel);
});

test("site motion switch and system reduce preference resolve all motion combinations", async () => {
  resetDom();
  systemReducedMotion = false;
  window.localStorage.setItem("nest-effects", "true");
  function Harness() {
    const preference = useFantasyPreferences();
    return React.createElement(
      "section",
      { className: preference.motion ? "motion-on" : "motion-off" },
      React.createElement(
        "button",
        { type: "button", "aria-pressed": preference.effects, onClick: () => preference.setEffects((value) => !value) },
        "Effects",
      ),
    );
  }
  const { container, unmount } = await mount(React.createElement(Harness));
  const toggle = container.querySelector("button");
  assert.equal(container.firstElementChild.className, "motion-on");
  assert.equal(document.documentElement.classList.contains("motion-off"), false);

  await React.act(async () => toggle.click());
  assert.equal(container.firstElementChild.className, "motion-off");
  assert.equal(document.documentElement.classList.contains("motion-off"), true);
  await React.act(async () => toggle.click());
  assert.equal(container.firstElementChild.className, "motion-on");

  await React.act(async () => {
    systemReducedMotion = true;
    for (const listener of mediaListeners) listener({ matches: true });
  });
  assert.equal(container.firstElementChild.className, "motion-off");
  assert.equal(document.documentElement.classList.contains("motion-off"), true);

  await React.act(async () => {
    systemReducedMotion = false;
    for (const listener of mediaListeners) listener({ matches: false });
  });
  assert.equal(container.firstElementChild.className, "motion-on");
  assert.equal(document.documentElement.classList.contains("motion-off"), false);
  await unmount();
});

test("lightbox Escape closes the dialog and restores body scroll and launcher focus", async () => {
  resetDom();
  const returnFocusRef = { current: null };
  function Harness() {
    const [open, setOpen] = React.useState(true);
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "button",
        {
          ref: (node) => {
            returnFocusRef.current = node;
          },
        },
        "Open preview",
      ),
      open &&
        React.createElement(MediaLightbox, {
          kind: "photo",
          photo: { src: "/assets/example.webp", alt: "Example", number: 1 },
          photoAlt: "Example",
          photoCount: 1,
          onPhotoChange() {},
          t: copy.en,
          onClose: () => setOpen(false),
          returnFocusRef,
        }),
    );
  }

  const { container, unmount } = await mount(React.createElement(Harness));
  assert.ok(document.querySelector('[role="dialog"]'));
  assert.equal(document.body.style.overflow, "hidden");

  await React.act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(document.body.style.overflow, "");
  assert.equal(document.activeElement, container.querySelector("button"));
  await unmount();
});

test("contact copy action reports success and exposes a manual fallback on failure", async () => {
  resetDom();
  const copied = [];
  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (value) => {
        copied.push(value);
      },
    },
  });
  let view = await mount(
    React.createElement(ContactPage, {
      language: "zh",
      t: copy.zh,
      profile: { username: "loveyong07" },
    }),
  );
  let wechat = view.container.querySelector(".contact-tile.wechat");
  await React.act(async () => {
    wechat.click();
    await Promise.resolve();
  });
  assert.deepEqual(copied, ["loveyong07"]);
  assert.match(wechat.textContent, /已复制/);
  await view.unmount();

  resetDom();
  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async () => {
        throw new Error("clipboard unavailable");
      },
    },
  });
  view = await mount(
    React.createElement(ContactPage, {
      language: "zh",
      t: copy.zh,
      profile: { username: "loveyong07" },
    }),
  );
  wechat = view.container.querySelector(".contact-tile.wechat");
  await React.act(async () => {
    wechat.click();
    await Promise.resolve();
  });
  assert.equal(view.container.querySelector(".contact-copy-fallback input")?.value, "loveyong07");
  assert.ok(view.container.querySelector('.contact-copy-fallback[role="status"]'));
  await view.unmount();
});

test("Posts page keeps the dated snapshot visible and offers recovery after a feed failure", async () => {
  resetDom();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  const ready = [];
  const view = await mount(
    React.createElement(PostsPage, {
      language: "en",
      t: copy.en,
      profile: { username: "loveyong07" },
      onFeedReady: (value) => ready.push(value),
    }),
  );

  for (let attempt = 0; attempt < 10 && view.container.querySelector(".feed-status.is-loading"); attempt++) {
    await React.act(async () => new Promise((resolvePromise) => setTimeout(resolvePromise, 0)));
  }
  const status = view.container.querySelector(".feed-status");
  assert.match(status?.textContent ?? "", /Recent posts are unavailable/);
  assert.ok(view.container.textContent.includes(copy.en.feedSnapshot(SNAPSHOT.created_at)));
  assert.ok(view.container.querySelector(".feed-status-actions button"));
  assert.deepEqual(ready, [true]);

  await view.unmount();
  globalThis.fetch = originalFetch;
});
