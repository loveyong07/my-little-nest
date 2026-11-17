import assert from "node:assert/strict";
import { after, test } from "node:test";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { DESKTOP_FIT_QUERY } from "../src/constants/media-queries.js";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
};
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
  { PostCard },
  { default: ContactPage },
  { default: PostsPage },
  { copy },
  { SNAPSHOT },
  { pagePaths },
  { postMonths },
  { useFantasyPreferences },
  { useMediaRequest },
  { useXFeed },
] = await Promise.all([
  server.ssrLoadModule("/src/components/Header.jsx"),
  server.ssrLoadModule("/src/components/MediaLightbox.jsx"),
  server.ssrLoadModule("/src/components/PostCard.jsx"),
  server.ssrLoadModule("/src/pages/ContactPage.jsx"),
  server.ssrLoadModule("/src/pages/PostsPage.jsx"),
  server.ssrLoadModule("/src/constants/locales.js"),
  server.ssrLoadModule("/src/constants/site.js"),
  server.ssrLoadModule("/src/routes/site-route.js"),
  server.ssrLoadModule("/src/utils/posts.js"),
  server.ssrLoadModule("/src/hooks/useFantasyPreferences.js"),
  server.ssrLoadModule("/src/hooks/useMediaRequest.js"),
  server.ssrLoadModule("/src/hooks/useXFeed.js"),
]);

function resetDom() {
  document.body.replaceChildren();
  document.body.style.overflow = "";
  document.documentElement.classList.remove("motion-off");
  window.localStorage.clear();
  window.sessionStorage.clear();
}

function mockResponsiveLayout(context, wide) {
  const original = window.matchMedia;
  context.mock.method(window, "matchMedia", (media) => ({
    ...original(media),
    matches: media === DESKTOP_FIT_QUERY ? wide : original(media).matches,
  }));
}

async function mount(element) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await React.act(async () => root.render(element));
  return {
    container,
    async render(nextElement) {
      await React.act(async () => root.render(nextElement));
    },
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

test("all PostCards render normal and Markdown URLs as safe clickable anchors in their original paragraphs", async () => {
  resetDom();
  const view = await mount(
    React.createElement(PostCard, {
      post: {
        ...SNAPSHOT,
        text: "网址 https://example.com/a。\n\n[原文](https://example.org/b) 和 www.example.net。 [危险](javascript:alert(1))",
      },
      feedSource: "live",
      language: "zh",
      t: copy.zh,
      profile: { name: "初咏", username: "loveyong07" },
    }),
  );
  try {
    const links = [...view.container.querySelectorAll(".post-text a")];
    assert.deepEqual(
      links.map((a) => a.href),
      ["https://example.com/a", "https://example.org/b", "https://www.example.net/"],
    );
    assert.ok(links.every((a) => a.target === "_blank" && a.rel === "noopener noreferrer"));
    assert.equal(view.container.querySelectorAll(".post-text p").length, 2);
    assert.ok(view.container.querySelector(".post-text").textContent.includes("[危险](javascript:alert(1))"));
  } finally {
    await view.unmount();
  }
});

function mockBrowserTranslation(context, { target = "zh-TW", translate = (text) => `訳: ${text}` } = {}) {
  const calls = { detectors: 0, translators: [], texts: [], signals: [] };
  const overrides = [
    [window.navigator, "languages", [target]],
    [
      window,
      "LanguageDetector",
      {
        async create() {
          calls.detectors++;
          return {
            async detect() {
              return [{ detectedLanguage: "ja", confidence: 0.99 }];
            },
            destroy() {},
          };
        },
      },
    ],
    [
      window,
      "Translator",
      {
        async create(options) {
          calls.translators.push(options);
          return {
            async translate(text, { signal }) {
              calls.texts.push(text);
              calls.signals.push(signal);
              return translate(text);
            },
            destroy() {},
          };
        },
      },
    ],
  ];
  for (const [object, key, value] of overrides) {
    const original = Object.getOwnPropertyDescriptor(object, key);
    Object.defineProperty(object, key, { configurable: true, value });
    context.after(() => {
      if (original) Object.defineProperty(object, key, original);
      else delete object[key];
    });
  }
  return calls;
}

test("pinned, original and repost cards translate only on click, follow the system language and toggle without another model call", async (context) => {
  const calls = mockBrowserTranslation(context);
  for (const [index, variant] of ["pinned", "original", "repost"].entries()) {
    resetDom();
    const props = {
      post: {
        ...SNAPSHOT,
        id: `translation-${variant}`,
        text: `こんにちは、${variant}のテストです。 [リンク](https://example.test/${variant}) ありがとう。 #ゆずソフト #Hello_World`,
        ...(variant === "repost" ? { repostId: "test-repost" } : {}),
      },
      feedSource: "live",
      language: "en",
      t: copy.en,
      profile: { name: "初咏", username: "loveyong07" },
    };
    const view = await mount(React.createElement(PostCard, props));
    try {
      const original = view.container.querySelector(".post-text p").textContent;
      const button = view.container.querySelector(".content-translation-button");
      assert.equal(button.textContent, copy.en.translationTranslate);
      assert.equal(calls.detectors, index, "rendering must not start native downloads");
      await React.act(async () => button.click());
      assert.equal(button.textContent, copy.en.translationShowOriginal);
      assert.equal(button.getAttribute("aria-pressed"), "true");
      assert.equal(view.container.querySelector(".post-text p").lang, "zh-Hant");
      assert.equal(calls.translators.at(-1).targetLanguage, "zh-Hant");
      assert.equal(calls.translators.at(-1).sourceLanguage, "ja");
      assert.equal(view.container.querySelector(".post-text p a").href, `https://example.test/${variant}`);
      assert.ok(calls.texts.every((text) => !text.includes("https://") && !text.includes("[リンク]")));
      const translated = view.container.querySelector(".post-text p").textContent;
      assert.notEqual(translated, original);
      assert.ok(translated.endsWith("#ゆずソフト #Hello_World"));
      assert.ok(calls.texts.every((text) => !text.includes("#")));
      await React.act(async () => button.click());
      assert.equal(view.container.querySelector(".post-text p").textContent, original);
      await React.act(async () => button.click());
      assert.equal(view.container.querySelector(".post-text p").textContent, translated);
      assert.equal(calls.detectors, index + 1);
      assert.equal(calls.translators.length, index + 1);
      await view.render(React.createElement(PostCard, { ...props, language: "ja", t: copy.ja }));
      assert.equal(
        view.container.querySelector(".post-text p").lang,
        "zh-Hant",
        "UI language does not change the translation target",
      );
      assert.equal(button.textContent, copy.ja.translationShowOriginal);
    } finally {
      await view.unmount();
    }
  }
});

test("translated Article titles and paragraphs preserve photo positions, links and the exact original on toggle", async (context) => {
  resetDom();
  const calls = mockBrowserTranslation(context, { target: "en-GB" });
  const { XArticlesSection } = await server.ssrLoadModule("/src/components/XArticlesSection.jsx");
  const article = {
    id: "translation-article",
    title: "日本語の記事の題名 #テスト記事",
    text: "最初の段落。\n\n最後の段落。",
    permalink: "https://x.com/loveyong07/status/123",
    author: "初咏",
    created_at: "2026-10-01T00:00:00Z",
    media: [{ type: "photo", url: "https://pbs.twimg.com/media/article-translation.jpg" }],
    blocks: [
      { type: "text", text: "最初の段落。 #ゆずソフト [名前付きリンク](https://example.test/article)" },
      { type: "photo", url: "https://pbs.twimg.com/media/article-translation.jpg" },
      { type: "divider" },
      { type: "text", text: "最後の段落。" },
    ],
  };
  const view = await mount(
    React.createElement(XArticlesSection, {
      articles: [article],
      articleIndex: 0,
      setArticleIndex() {},
      articleState: "ok",
      language: "zh",
      t: copy.zh,
      profile: { name: "初咏", username: "loveyong07" },
    }),
  );
  try {
    const order = () =>
      [...view.container.querySelector(".article-text").children].map(
        (element) => `${element.tagName}:${element.className}`,
      );
    const originalOrder = order();
    const originalBody = view.container.querySelector(".article-text").textContent;
    const photo = view.container.querySelector(".article-text .article-photo");
    const button = view.container.querySelector(".content-translation-button");
    await React.act(async () => button.click());
    assert.equal(view.container.querySelector("#x-article-title").textContent, `訳: ${article.title}`);
    assert.equal(view.container.querySelector("#x-article-title").lang, "en");
    assert.ok(calls.texts.some((text) => text.includes("日本語の記事の題名")));
    assert.ok(calls.texts.every((text) => !text.includes("#")));
    assert.ok(view.container.querySelector(".article-text").textContent.includes("#ゆずソフト"));
    assert.deepEqual(order(), originalOrder);
    assert.equal(view.container.querySelector(".article-text .article-photo"), photo);
    assert.equal(view.container.querySelector(".article-text a").href, "https://example.test/article");
    assert.equal(view.container.querySelector(".article-text a").textContent, "名前付きリンク");
    await React.act(async () => button.click());
    assert.equal(view.container.querySelector("#x-article-title").textContent, article.title);
    assert.equal(view.container.querySelector(".article-text").textContent, originalBody);
    assert.deepEqual(order(), originalOrder);
  } finally {
    await view.unmount();
  }
});

test("unsupported browsers keep the original readable and give an actionable translation hint", async (context) => {
  resetDom();
  mockBrowserTranslation(context);
  Object.defineProperty(window, "Translator", { configurable: true, value: undefined });
  const view = await mount(
    React.createElement(PostCard, {
      post: { ...SNAPSHOT, text: "サポートのない環境でも原文を読めます。" },
      feedSource: "live",
      language: "zh",
      t: copy.zh,
      profile: { name: "初咏", username: "loveyong07" },
    }),
  );
  try {
    const original = view.container.querySelector(".post-text p").textContent;
    await React.act(async () => view.container.querySelector(".content-translation-button").click());
    assert.equal(view.container.querySelector(".post-text p").textContent, original);
    assert.equal(
      view.container.querySelector(".content-translation-status").textContent,
      copy.zh.translationErrors.unsupported,
    );
    assert.equal(view.container.querySelector(".content-translation-button").disabled, false);
  } finally {
    await view.unmount();
  }
});

test("changing a reading item or system language cancels stale translations and ignores late native output", async (context) => {
  resetDom();
  let finish;
  const calls = mockBrowserTranslation(context, {
    target: "en-US",
    translate: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const props = {
    post: { ...SNAPSHOT, text: "遅れて届く翻訳のテスト。" },
    feedSource: "live",
    language: "zh",
    t: copy.zh,
    profile: { name: "初咏", username: "loveyong07" },
  };
  const view = await mount(React.createElement(PostCard, props));
  try {
    await React.act(async () => view.container.querySelector(".content-translation-button").click());
    assert.equal(view.container.querySelector(".content-translation-button").disabled, true);
    assert.ok(view.container.querySelector(".content-translation-cancel"));
    await view.render(
      React.createElement(PostCard, { ...props, post: { ...props.post, text: "新しく選んだ投稿です。" } }),
    );
    assert.equal(calls.signals[0].aborted, true);
    await React.act(async () => finish("This is stale output."));
    assert.equal(view.container.querySelector(".post-text p").textContent, "新しく選んだ投稿です。");
    assert.equal(view.container.querySelector(".content-translation-button").disabled, false);
    Object.defineProperty(window.navigator, "languages", { configurable: true, value: ["fr-FR"] });
    await React.act(async () => window.dispatchEvent(new window.Event("languagechange")));
    assert.equal(view.container.querySelector(".content-translation-button").textContent, copy.zh.translationTranslate);
    await React.act(async () => view.container.querySelector(".content-translation-button").click());
    assert.equal(calls.translators.at(-1).targetLanguage, "fr");
    await React.act(async () => view.container.querySelector(".content-translation-cancel").click());
    assert.equal(calls.signals.at(-1).aborted, true);
    await React.act(async () => finish("Late French output."));
    assert.equal(view.container.querySelector(".post-text p").textContent, "新しく選んだ投稿です。");
  } finally {
    await view.unmount();
  }
});

test("a stalled native language-pack download times out and cannot overwrite the original later", async (context) => {
  resetDom();
  let finish;
  let timeout;
  const setTimeout = window.setTimeout.bind(window);
  context.mock.method(window, "setTimeout", (callback, delay, ...args) => {
    if (delay === 120_000) {
      timeout = callback;
      return 0;
    }
    return setTimeout(callback, delay, ...args);
  });
  const calls = mockBrowserTranslation(context, {
    target: "en",
    translate: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const view = await mount(
    React.createElement(PostCard, {
      post: { ...SNAPSHOT, text: "時間がかかりすぎる翻訳のテスト。" },
      feedSource: "live",
      language: "zh",
      t: copy.zh,
      profile: { name: "初咏", username: "loveyong07" },
    }),
  );
  try {
    await React.act(async () => view.container.querySelector(".content-translation-button").click());
    await React.act(async () => timeout());
    assert.equal(calls.signals[0].aborted, true);
    assert.equal(
      view.container.querySelector(".content-translation-status").textContent,
      copy.zh.translationErrors.timedOut,
    );
    assert.equal(view.container.querySelector(".content-translation-button").disabled, false);
    await React.act(async () => finish("A translation that arrived too late."));
    assert.equal(view.container.querySelector(".post-text p").textContent, "時間がかかりすぎる翻訳のテスト。");
  } finally {
    await view.unmount();
  }
});

test("journal translations have matching keys and nonempty, aligned phrase arrays", async () => {
  const { fantasyCopy } = await server.ssrLoadModule("/src/constants/fantasy.js");
  assert.deepEqual(Object.keys(fantasyCopy).sort(), ["en", "ja", "zh"]);
  for (const [language, phrases] of Object.entries(fantasyCopy)) {
    assert.deepEqual(Object.keys(phrases).sort(), Object.keys(fantasyCopy.zh).sort(), language);
    for (const key of ["notices", "quotes"]) {
      assert.ok(Array.isArray(phrases[key]) && phrases[key].length > 0, `${language}.${key}`);
      assert.equal(phrases[key].length, fantasyCopy.zh[key].length, `${language}.${key}`);
      assert.ok(Array.from(phrases[key]).every((item) => typeof item === "string" && item.trim().length > 0));
    }
  }
});

for (const hasCover of [false, true]) {
  test(`Article photo occurrences retain independent lightbox indices (cover=${hasCover})`, async () => {
    resetDom();
    const { XArticlesSection } = await server.ssrLoadModule("/src/components/XArticlesSection.jsx");
    const media = ["A", "B"].map((id) => ({ type: "photo", url: `https://pbs.twimg.com/media/${id}.jpg` }));
    const view = await mount(
      React.createElement(XArticlesSection, {
        articles: [
          {
            id: "20",
            coverUrl: hasCover ? media[0].url : null,
            media,
            blocks: [
              { type: "text", text: "Before" },
              ...[media[0], media[1], media[0]].flatMap((photo) => [
                { type: "photo", url: photo.url },
                { type: "text", text: "After" },
              ]),
            ],
          },
        ],
        articleIndex: 0,
        articleState: "ok",
        language: "zh",
        t: copy.zh,
        profile: {},
      }),
    );
    const buttons = [...view.container.querySelectorAll(".article-photo-open")];
    assert.equal(buttons.length, hasCover ? 4 : 3);
    assert.equal(view.container.querySelectorAll(".article-text .article-photo").length, 3);
    const expected = hasCover ? ["A", "A", "B", "A"] : ["A", "B", "A"];
    for (const [index, button] of buttons.entries()) {
      assert.equal(button.querySelector("img").alt, copy.zh.postPhotoAlt(index + 1));
      await React.act(async () => button.click());
      const lightbox = document.querySelector(".media-lightbox");
      assert.equal(
        lightbox.querySelector('.media-lightbox-slide[aria-hidden="false"] img').alt,
        copy.zh.postPhotoAlt(index + 1),
      );
      await selectPreviewPhoto((index + 1) % expected.length);
      assert.ok(
        decodeURIComponent(document.querySelector('.media-lightbox-slide[aria-hidden="false"] img').src).includes(
          `/media/${expected[(index + 1) % expected.length]}.jpg`,
        ),
      );
      await React.act(async () =>
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
      );
    }
    await view.unmount();
  });
}

test("an unpositioned body image is never promoted to a cover, including legacy data", async () => {
  resetDom();
  const { XArticlesSection } = await server.ssrLoadModule("/src/components/XArticlesSection.jsx");
  for (const coverUrl of [null, undefined]) {
    const view = await mount(
      React.createElement(XArticlesSection, {
        articles: [
          {
            id: "20",
            text: "Body",
            coverUrl,
            media: [{ type: "photo", url: "https://pbs.twimg.com/media/Inline.jpg" }],
          },
        ],
        articleIndex: 0,
        articleState: "ok",
        language: "zh",
        t: copy.zh,
        profile: {},
      }),
    );
    assert.equal(view.container.querySelectorAll(".article-photo").length, 0);
    assert.ok(view.container.querySelector(".article-layout-unavailable"));
    await view.unmount();
  }
});

test("an open Article lightbox remains valid when a refresh shrinks its photo list", async () => {
  resetDom();
  const { ArticlePhoto } = await server.ssrLoadModule("/src/components/ArticlePhoto.jsx");
  const photos = ["A", "B", "C", "D"].map((id) => ({ type: "photo", url: `https://pbs.twimg.com/media/${id}.jpg` }));
  const view = await mount(React.createElement(ArticlePhoto, { photos, number: 1, t: copy.zh }));
  await React.act(async () => view.container.querySelector(".article-photo-open").click());
  await selectPreviewPhoto(3);
  assert.ok(
    decodeURIComponent(document.querySelector('.media-lightbox-slide[aria-hidden="false"] img').src).includes("/D.jpg"),
  );
  await view.render(React.createElement(ArticlePhoto, { photos: photos.slice(0, 3), number: 1, t: copy.zh }));
  assert.ok(
    decodeURIComponent(document.querySelector('.media-lightbox-slide[aria-hidden="false"] img').src).includes("/C.jpg"),
  );
  await selectPreviewPhoto(0);
  assert.ok(
    decodeURIComponent(document.querySelector('.media-lightbox-slide[aria-hidden="false"] img').src).includes("/A.jpg"),
  );
  await view.unmount();
});

test("Articles retain all six images, clickable named links and an independent failed-image retry", async () => {
  resetDom();
  const { XArticlesSection } = await server.ssrLoadModule("/src/components/XArticlesSection.jsx");
  const media = Array.from({ length: 6 }, (_, index) => ({
    type: "photo",
    url: `https://pbs.twimg.com/media/Article${index}.jpg`,
  }));
  const view = await mount(
    React.createElement(XArticlesSection, {
      articles: [
        {
          id: "20",
          title: "关于我",
          coverUrl: media[0].url,
          text: "TouchGal - 一站式Galgame文化社区! 和 Muse.ai",
          media,
          blocks: [
            { type: "text", text: "TouchGal - 一站式Galgame文化社区! 和 Muse.ai" },
            ...media.slice(1).flatMap((photo, index) => [
              { type: "photo", url: photo.url },
              { type: "text", text: `配图后段落 ${index + 1}` },
            ]),
          ],
        },
      ],
      articleIndex: 0,
      articleState: "ok",
      language: "zh",
      t: copy.zh,
      profile: { name: "初咏", username: "loveyong07" },
    }),
  );
  assert.equal(view.container.querySelectorAll(".article-cover").length, 6);
  assert.deepEqual(
    [...view.container.querySelector(".article-text").children].map((node) =>
      node.classList.contains("article-photo") ? "photo" : node.tagName,
    ),
    ["P", "photo", "P", "photo", "P", "photo", "P", "photo", "P", "photo", "P"],
  );
  const anchors = [...view.container.querySelectorAll(".article-text a")];
  assert.deepEqual(
    anchors.map((a) => a.href),
    ["https://www.touchgal.ink/", "https://muse.ai/"],
  );
  assert.ok(anchors.every((a) => a.target === "_blank" && a.rel.includes("noopener")));
  await React.act(async () => view.container.querySelectorAll(".article-cover")[1].dispatchEvent(new Event("error")));
  assert.equal(view.container.querySelectorAll(".article-cover").length, 5);
  assert.equal(view.container.querySelectorAll(".article-photo").length, 6);
  await React.act(async () => view.container.querySelector(".article-photo .post-media-unavailable button").click());
  assert.equal(view.container.querySelectorAll(".article-cover").length, 6);
  assert.match(view.container.querySelectorAll(".article-cover")[1].src, /retry=1/);
  await view.unmount();
});

test("an Article without verified image positions never collects its body photos at the end", async () => {
  resetDom();
  const { XArticlesSection } = await server.ssrLoadModule("/src/components/XArticlesSection.jsx");
  const view = await mount(
    React.createElement(XArticlesSection, {
      articles: [
        {
          id: "20",
          text: "Body",
          coverUrl: "https://pbs.twimg.com/media/Cover.jpg",
          media: [
            { type: "photo", url: "https://pbs.twimg.com/media/Cover.jpg" },
            { type: "photo", url: "https://pbs.twimg.com/media/Inline.jpg" },
          ],
        },
      ],
      articleIndex: 0,
      articleState: "ok",
      language: "zh",
      t: copy.zh,
      profile: {},
    }),
  );
  assert.equal(view.container.querySelectorAll(".article-photo").length, 1);
  assert.equal(
    view.container.querySelector(".article-layout-unavailable").textContent,
    copy.zh.articleLayoutUnavailable,
  );
  await React.act(async () => view.container.querySelector(".article-photo-open").click());
  await selectPreviewPhoto(1);
  assert.ok(
    decodeURIComponent(document.querySelector('.media-lightbox-slide[aria-hidden="false"] img').src).includes(
      "/Inline.jpg",
    ),
  );
  await view.unmount();
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

test("route changes close the mobile menu and do not reopen it on browser return", async () => {
  resetDom();
  const header = (page) => React.createElement(Header, { page, t: copy.zh, language: "zh", changeLanguage() {} });
  const view = await mount(header("home"));
  await React.act(async () => view.container.querySelector(".menu-toggle").click());
  assert.equal(view.container.querySelector(".menu-toggle").getAttribute("aria-expanded"), "true");

  for (const page of ["posts", "home"]) {
    await view.render(header(page));
    assert.equal(view.container.querySelector(".menu-toggle").getAttribute("aria-expanded"), "false");
    assert.equal(view.container.querySelector(".site-nav.is-open"), null);
  }
  await view.unmount();
});

function switchGeometry(control, selector, width = 60) {
  Object.defineProperty(control, "clientWidth", { configurable: true, value: width * 3 + 12 });
  for (const [index, item] of [...control.querySelectorAll(selector)].entries()) {
    for (const [property, value] of Object.entries({
      offsetLeft: 6 + index * width,
      offsetTop: 6,
      offsetWidth: width - 4,
      offsetHeight: 44,
    })) {
      Object.defineProperty(item, property, { configurable: true, value });
    }
  }
}

function switchPointer(target, type, x, y = 20, extra = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y, ...extra });
  Object.defineProperty(event, "pointerId", { value: 7 });
  Object.defineProperty(event, "pointerType", { value: extra.pointerType ?? "mouse" });
  target.dispatchEvent(event);
  return event;
}

const settleSwitch = () => React.act(async () => new Promise((resolve) => setTimeout(resolve, 180)));

test("a swipe can begin on any navigation item, commits once on release, and suppresses its trailing click", async () => {
  resetDom();
  const pages = [];
  const view = await mount(
    React.createElement(Header, {
      page: "home",
      t: copy.zh,
      language: "zh",
      changeLanguage() {},
      onNavigate: (page) => pages.push(page),
    }),
  );
  const nav = view.container.querySelector(".site-nav");
  const links = nav.querySelectorAll("a");
  switchGeometry(nav, "a", 120);
  switchPointer(links[2], "pointerdown", 285);
  const moving = switchPointer(window, "pointermove", 360);
  assert.equal(moving.defaultPrevented, true);
  assert.equal(nav.dataset.swiping, "true");
  assert.deepEqual(pages, []);
  assert.ok(parseFloat(nav.style.getPropertyValue("--switch-x")) > 6);
  switchPointer(window, "pointerup", 360);
  const trailingClick = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 });
  links[2].dispatchEvent(trailingClick);
  assert.equal(trailingClick.defaultPrevented, true);
  await settleSwitch();
  assert.deepEqual(pages, ["posts"]);
  await view.unmount();
});

test("language swipes work in both directions and can cross two options", async () => {
  for (const [language, delta, expected, width] of [
    ["zh", 52, "ja", 60],
    ["en", -52, "ja", 60],
    ["zh", 140, "en", 60],
    ["zh", 47, "ja", 44],
  ]) {
    resetDom();
    const chosen = [];
    const view = await mount(
      React.createElement(Header, {
        page: "home",
        t: copy[language],
        language,
        changeLanguage: (value) => chosen.push(value),
      }),
    );
    const picker = view.container.querySelector(".language-picker");
    switchGeometry(picker, "button", width);
    switchPointer(picker, "pointerdown", 80, 20, { pointerType: "touch" });
    switchPointer(window, "pointermove", 80 + delta);
    switchPointer(window, "pointerup", 80 + delta);
    await settleSwitch();
    assert.deepEqual(chosen, [expected]);
    await view.unmount();
  }
});

test("small movements retain click behavior while vertical scrolling and canceled gestures do not switch", async () => {
  resetDom();
  const chosen = [];
  const view = await mount(
    React.createElement(Header, {
      page: "home",
      t: copy.zh,
      language: "zh",
      changeLanguage: (value) => chosen.push(value),
    }),
  );
  const picker = view.container.querySelector(".language-picker");
  switchGeometry(picker, "button");
  switchPointer(picker, "pointerdown", 30);
  assert.equal(switchPointer(window, "pointermove", 33).defaultPrevented, false);
  switchPointer(window, "pointerup", 33);
  await React.act(async () => picker.querySelector("button").click());
  assert.deepEqual(chosen, ["zh"]);
  for (const canceled of [false, true]) {
    switchPointer(picker, "pointerdown", 30);
    if (canceled) {
      switchPointer(window, "pointermove", 90);
      switchPointer(window, "pointercancel", 90);
    } else {
      assert.equal(switchPointer(window, "pointermove", 32, 85).defaultPrevented, false);
      switchPointer(window, "pointerup", 32, 85);
    }
    await settleSwitch();
    assert.equal(picker.dataset.swiping, undefined);
    assert.deepEqual(chosen, ["zh"]);
  }
  await view.unmount();
});

test("swiping past an end rebounds without wrapping and a new modified click remains available", async () => {
  resetDom();
  const chosen = [];
  const view = await mount(
    React.createElement(Header, {
      page: "home",
      t: copy.zh,
      language: "zh",
      changeLanguage: (value) => chosen.push(value),
    }),
  );
  const picker = view.container.querySelector(".language-picker");
  switchGeometry(picker, "button");
  switchPointer(picker, "pointerdown", 100);
  switchPointer(window, "pointermove", 20);
  switchPointer(window, "pointerup", 20);
  await settleSwitch();
  assert.deepEqual(chosen, []);
  switchPointer(picker, "pointerdown", 100, 20, { ctrlKey: true });
  const click = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1, ctrlKey: true });
  await React.act(async () => picker.querySelector("button").dispatchEvent(click));
  assert.equal(click.defaultPrevented, false);
  assert.deepEqual(chosen, ["zh"]);
  await view.unmount();
});

test("Escape and keyboard activation cancel a pending swipe before it can override another choice", async () => {
  for (const keyboardClick of [false, true]) {
    resetDom();
    const chosen = [];
    const view = await mount(
      React.createElement(Header, {
        page: "home",
        t: copy.zh,
        language: "zh",
        changeLanguage: (value) => chosen.push(value),
      }),
    );
    const picker = view.container.querySelector(".language-picker");
    switchGeometry(picker, "button");
    switchPointer(picker, "pointerdown", 30);
    switchPointer(window, "pointermove", 80);
    switchPointer(window, "pointerup", 80);
    if (keyboardClick) await React.act(async () => picker.querySelectorAll("button")[2].click());
    else window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await settleSwitch();
    assert.deepEqual(chosen, keyboardClick ? ["en"] : []);
    await view.unmount();
  }
});

test("horizontal trackpad gestures switch once and preserve ordinary page scrolling", async () => {
  resetDom();
  const chosen = [];
  function Harness() {
    const [language, setLanguage] = React.useState("zh");
    return React.createElement(Header, {
      page: "home",
      t: copy[language],
      language,
      changeLanguage: (value) => {
        chosen.push(value);
        setLanguage(value);
      },
    });
  }
  const view = await mount(React.createElement(Harness));
  const picker = view.container.querySelector(".language-picker");
  switchGeometry(picker, "button");
  const vertical = new window.WheelEvent("wheel", { deltaY: 80, bubbles: true, cancelable: true });
  picker.dispatchEvent(vertical);
  assert.equal(vertical.defaultPrevented, false);
  const horizontal = new window.WheelEvent("wheel", { deltaX: 40, bubbles: true, cancelable: true });
  picker.dispatchEvent(horizontal);
  assert.equal(horizontal.defaultPrevented, true);
  await React.act(async () => new Promise((resolve) => setTimeout(resolve, 300)));
  assert.deepEqual(chosen, ["ja"]);
  picker.dispatchEvent(new window.WheelEvent("wheel", { deltaX: 10, bubbles: true, cancelable: true }));
  await settleSwitch();
  assert.deepEqual(chosen, ["ja"]);
  await view.unmount();
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

test("decorative effects ignore the retired switch and follow the system motion preference", async () => {
  resetDom();
  systemReducedMotion = false;
  window.localStorage.setItem("nest-effects", "false");
  function Harness() {
    const preference = useFantasyPreferences();
    return React.createElement("section", { className: preference.motion ? "motion-on" : "motion-off" });
  }
  const { container, unmount } = await mount(React.createElement(Harness));
  assert.equal(container.firstElementChild.className, "motion-on");
  assert.equal(document.documentElement.classList.contains("motion-off"), false);

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

test("lightbox photo retries reset on navigation while keyboard focus stays in place", async () => {
  resetDom();
  const returnFocusRef = { current: null };
  const sources = ["/api/x-media?url=first", "/api/x-media?url=second"];
  function Harness() {
    const [index, setIndex] = React.useState(0);
    return React.createElement(MediaLightbox, {
      kind: "photo",
      photo: { src: sources[index], number: index + 1 },
      photoAlt: "Example",
      photoCount: 2,
      // Callback identity changes on render; it must not reset dialog focus.
      onPhotoChange: (value) => setIndex(value),
      t: copy.en,
      onClose() {},
      returnFocusRef,
    });
  }
  const view = await mount(React.createElement(Harness));
  await React.act(async () =>
    document.querySelector('.media-lightbox-slide[aria-hidden="false"] img').dispatchEvent(new Event("error")),
  );
  assert.ok(document.querySelector(".media-lightbox-unavailable"));
  await React.act(async () => document.querySelector(".media-lightbox-unavailable button").click());
  assert.equal(
    document.querySelector('.media-lightbox-slide[aria-hidden="false"] img').getAttribute("src"),
    `${sources[0]}&lightboxRetry=1`,
  );

  const next = document.querySelector(".media-lightbox-next");
  next.focus();
  await selectPreviewPhoto(1);
  assert.equal(
    document.querySelector('.media-lightbox-slide[aria-hidden="false"] img').getAttribute("src"),
    sources[1],
  );
  assert.equal(document.activeElement, next);
  assert.equal(document.body.style.overflow, "hidden");
  await selectPreviewPhoto(0);
  assert.equal(
    document.querySelector('.media-lightbox-slide[aria-hidden="false"] img').getAttribute("src"),
    sources[0],
  );
  assert.equal(document.activeElement, next);
  await view.unmount();
  assert.equal(document.body.style.overflow, "");
});

test("post cards render X entities once as plain text for live and cached posts in every locale", async () => {
  resetDom();
  const raw = "可爱&gt;_&lt; 😊\n\n&amp;lt; &amp; &lt;img src=x onerror=alert(1)&gt;";
  const post = { ...SNAPSHOT, text: raw, media: [] };
  for (const language of ["zh", "ja", "en"]) {
    for (const feedSource of ["live", "stale", "snapshot"]) {
      const view = await mount(
        React.createElement(PostCard, {
          post,
          feedSource,
          language,
          t: copy[language],
          profile: { username: "loveyong07" },
        }),
      );
      const paragraphs = view.container.querySelectorAll(".post-text p");
      assert.equal(paragraphs[0].textContent, "可爱>_< 😊");
      assert.equal(paragraphs[1].textContent, "&lt; & <img src=x onerror=alert(1)>");
      assert.equal(view.container.querySelector(".post-text img"), null);
      assert.equal(post.text, raw, "rendering must not mutate cached or API text");
      await view.unmount();
    }
  }
});

test("post photo failures and retries stay separate from a failed video", async () => {
  resetDom();
  const photos = ["One", "Two"].map((name) => ({ type: "photo", url: `https://pbs.twimg.com/media/Test${name}.jpg` }));
  const view = await mount(
    React.createElement(PostCard, {
      post: {
        ...SNAPSHOT,
        text: "Media test",
        media: [
          ...photos,
          { type: "video", url: "https://video.twimg.com/amplify_video/123/vid/avc1/1280x720/test.mp4" },
        ],
      },
      feedSource: "live",
      language: "en",
      t: copy.en,
      profile: { username: "loveyong07", name: "Example" },
    }),
  );
  await React.act(async () => view.container.querySelector("video").dispatchEvent(new Event("error")));
  await React.act(async () => view.container.querySelector(".post-media img").dispatchEvent(new Event("error")));
  assert.ok(view.container.querySelector(".post-media .post-media-unavailable"));
  await React.act(async () => view.container.querySelector(".post-media-unavailable button").click());
  let image = view.container.querySelector(".post-photo-tile img");
  assert.equal(new URL(image.src).searchParams.get("retry"), "1");
  assert.equal(document.activeElement, view.container.querySelector(".post-media-open"));
  await React.act(async () => image.dispatchEvent(new Event("error")));
  assert.equal(document.activeElement, view.container.querySelector(".post-media-unavailable button"));

  image = view.container.querySelectorAll(".post-photo-tile")[1].querySelector("img");
  assert.equal(new URL(image.src).searchParams.get("url"), photos[1].url);
  assert.equal(new URL(image.src).searchParams.has("retry"), false);
  assert.ok(view.container.querySelector(".post-video .post-media-unavailable"), "photo retry keeps video error");
  assert.ok(view.container.querySelector(".post-photo-tile .post-media-unavailable"));
  await React.act(async () => view.container.querySelector(".post-photo-tile .post-media-unavailable button").click());
  image = view.container.querySelector(".post-photo-tile img");
  assert.equal(new URL(image.src).searchParams.get("url"), photos[0].url);
  assert.equal(new URL(image.src).searchParams.get("retry"), "2");

  await React.act(async () => view.container.querySelector(".post-video .post-media-unavailable button").click());
  assert.equal(new URL(view.container.querySelector("video source").src).searchParams.get("retry"), "1");
  assert.equal(document.activeElement, view.container.querySelector("video"));
  await view.unmount();
});

test("every video and GIF has independent retries and opens its own preview in all languages", async (context) => {
  context.mock.method(window.HTMLMediaElement.prototype, "pause", () => {});
  context.mock.method(window.HTMLMediaElement.prototype, "load", () => {});
  const previousReducedMotion = systemReducedMotion;
  systemReducedMotion = true;
  try {
    for (const language of ["zh", "ja", "en"]) {
      resetDom();
      const media = [1, 2, 3].map((number) => ({
        type: "video",
        url: `https://video.twimg.com/ext_tw_video/${number}/pu/vid/movie.mp4`,
        ...(number === 3 ? { animated: true } : {}),
      }));
      const view = await mount(
        React.createElement(PostCard, {
          post: { ...SNAPSHOT, media },
          feedSource: "live",
          language,
          t: copy[language],
          profile: { username: "loveyong07" },
        }),
      );
      const frames = view.container.querySelectorAll(".post-video");
      assert.equal(frames.length, 3);
      assert.equal(frames[2].querySelector("video").loop, true);
      assert.equal(frames[2].querySelector("video").muted, true);
      assert.equal(frames[2].querySelector("video").autoplay, false, "reduced motion prevents GIF autoplay");
      const firstSource = frames[0].querySelector("source").src;
      await React.act(async () => frames[1].querySelector("video").dispatchEvent(new Event("error")));
      assert.equal(frames[0].querySelector("source").src, firstSource);
      assert.ok(frames[2].querySelector("video"));
      await React.act(async () => frames[1].querySelector(".post-media-unavailable button").click());
      assert.equal(new URL(frames[1].querySelector("source").src).searchParams.get("retry"), "1");
      assert.equal(new URL(firstSource).searchParams.has("retry"), false);
      await React.act(async () => frames[1].querySelector(".post-video-open").click());
      const previewSource = new URL(document.querySelector(".media-lightbox source").src);
      assert.equal(previewSource.searchParams.get("url"), media[1].url);
      assert.equal(previewSource.searchParams.get("retry"), "1");
      await React.act(async () => document.querySelector(".media-lightbox-close").click());
      assert.equal(document.activeElement, frames[1].querySelector(".post-video-open"));
      assert.equal(frames[0].querySelector("source").src, firstSource);
      await view.unmount();
    }
  } finally {
    systemReducedMotion = previousReducedMotion;
  }
});

test("late media events cannot change a newer source or retry attempt", async () => {
  resetDom();
  let request;
  function Harness({ source }) {
    request = useMediaRequest(source);
    return null;
  }
  const view = await mount(React.createElement(Harness, { source: "/api/x-media?url=first" }));
  const first = request;
  await view.render(React.createElement(Harness, { source: "/api/x-media?url=second" }));
  await React.act(async () => first.onError());
  assert.equal(request.unavailable, false);
  await React.act(async () => request.onError());
  const failed = request;
  await React.act(async () => request.retry());
  await React.act(async () => failed.onError());
  assert.equal(request.unavailable, false);
  assert.equal(request.retryCount, 1);
  await React.act(async () => request.onLoad());
  assert.equal(request.loaded, true);
  await view.unmount();
});

test("post photo strips retain all twenty photos and enlarge the exact clicked photo", async () => {
  resetDom();
  const media = Array.from({ length: 20 }, (_, index) => ({
    type: "photo",
    url: `https://pbs.twimg.com/media/Twenty${index + 1}.jpg`,
    width: 900,
    height: 1600,
  }));
  const view = await mount(
    React.createElement(PostCard, {
      post: { ...SNAPSHOT, media },
      feedSource: "live",
      language: "en",
      t: copy.en,
      profile: { username: "loveyong07" },
    }),
  );
  const buttons = view.container.querySelectorAll(".post-media-open");
  assert.equal(buttons.length, 20);
  assert.equal(
    view.container.querySelectorAll(".post-photo-tile img").length,
    2,
    "do not request all twenty thumbnails before the strip is measured or browsed",
  );
  assert.equal(view.container.querySelector(".post-photo-grid, .photo-slider, .glass-media-backdrop"), null);
  await React.act(async () => buttons[19].click());
  assert.equal(document.querySelector(".media-lightbox-count").textContent, "20 / 20");
  assert.equal(
    new URL(document.querySelector('.media-lightbox-slide[aria-hidden="false"] img').src).searchParams.get("url"),
    media[19].url,
  );
  assert.equal(
    document.querySelectorAll(".media-lightbox-slide img").length,
    2,
    "only the selected end photo and its neighbor should load in the enlarged preview",
  );
  await React.act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  assert.equal(document.activeElement, buttons[19]);
  await view.unmount();
});

test("single-photo navigation preserves its loaded image and usable preview", async () => {
  resetDom();
  const view = await mount(
    React.createElement(PostCard, {
      post: { ...SNAPSHOT, media: [{ type: "photo", url: "https://pbs.twimg.com/media/Single.jpg" }] },
      feedSource: "live",
      language: "en",
      t: copy.en,
      profile: { username: "loveyong07" },
    }),
  );
  await React.act(async () => view.container.querySelector(".post-media img").dispatchEvent(new Event("load")));
  const image = view.container.querySelector(".post-media img");
  assert.equal(view.container.querySelector(".photo-slider"), null);
  assert.equal(view.container.querySelector(".glass-media-backdrop"), null);
  assert.equal(view.container.querySelector(".post-media-loading"), null);
  assert.equal(view.container.querySelector(".post-media img"), image);
  await React.act(async () => view.container.querySelector(".post-media-open").click());
  assert.ok(document.querySelector('[role="dialog"]'));
  await view.unmount();
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

test("late clipboard results cannot overwrite the latest account's success or failure", async () => {
  for (const latestFails of [false, true]) {
    resetDom();
    const pending = [];
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText: (value) => new Promise((resolve, reject) => pending.push({ value, resolve, reject })) },
    });
    const view = await mount(React.createElement(ContactPage, { t: copy.zh, profile: { username: "loveyong07" } }));
    await React.act(async () => view.container.querySelector(".contact-tile.wechat").click());
    await React.act(async () => view.container.querySelector(".contact-tile.qq").click());
    await React.act(async () => {
      if (latestFails) pending[1].reject(new Error("clipboard unavailable"));
      else pending[1].resolve();
    });
    await React.act(async () => {
      if (latestFails) pending[0].resolve();
      else pending[0].reject(new Error("late failure"));
    });
    if (latestFails) {
      const fallback = view.container.querySelector(".contact-copy-fallback input");
      assert.equal(fallback.value, pending[1].value);
      assert.equal(document.activeElement, fallback);
      assert.equal(view.container.querySelector(".is-copied"), null);
    } else {
      assert.ok(view.container.querySelector(".contact-tile.qq.is-copied"));
      assert.equal(view.container.querySelector(".contact-copy-fallback"), null);
    }
    await view.unmount();
  }
});

test("email has one draft-aware mailto link and localized copying with a selectable failure fallback", async () => {
  for (const language of ["zh", "ja", "en"]) {
    for (const fails of [false, true]) {
      resetDom();
      let copied;
      Object.defineProperty(window.navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value) => {
            if (fails) throw new Error("clipboard unavailable");
            copied = value;
          },
        },
      });
      const view = await mount(
        React.createElement(ContactPage, { t: copy[language], profile: { username: "loveyong07" } }),
      );
      const link = view.container.querySelector('.email-row a[href^="mailto:"]');
      assert.equal(view.container.querySelectorAll('.email-row a[href^="mailto:"]').length, 1);
      const target = new URL(link.getAttribute("href"));
      const address = target.pathname;
      assert.equal(target.searchParams.get("subject"), copy[language].letterSubjects[0]);
      assert.equal(target.searchParams.get("body"), "");
      assert.equal(view.container.querySelector(".email-address span").textContent, address);
      const button = view.container.querySelector(".email-option button");
      assert.equal(button.getAttribute("aria-label"), `${copy[language].copyEmail}: ${address}`);
      await React.act(async () => button.click());
      if (fails) {
        const fallback = view.container.querySelector(".contact-copy-fallback input");
        assert.equal(fallback.value, address);
        assert.equal(document.activeElement, fallback);
        assert.equal(fallback.selectionEnd, address.length);
      } else {
        assert.equal(copied, address);
        assert.equal(button.querySelector('[role="status"]').textContent, copy[language].copied);
      }
      await view.unmount();
    }
  }
});

test("Posts requires age confirmation in every language and offers a home exit without loading the feed", async (context) => {
  resetDom();
  let requests = 0;
  context.mock.method(globalThis, "fetch", async () => {
    requests++;
    return { ok: false, status: 503 };
  });
  for (const language of ["zh", "ja", "en"]) {
    const view = await mount(
      React.createElement(PostsPage, {
        language,
        t: copy[language],
        profile: { username: "loveyong07" },
        onFeedReady() {},
      }),
    );
    assert.equal(view.container.querySelector("#posts-age-heading")?.textContent, copy[language].ageGateHeading);
    assert.equal(view.container.querySelector(".posts-age-exit")?.getAttribute("href"), pagePaths.home);
    assert.equal(view.container.querySelector(".post-card, .posts-section"), null);
    assert.equal(window.sessionStorage.getItem("nest-posts-age-confirmed"), null);
    await view.unmount();
  }
  assert.equal(requests, 0);
});

test("Age confirmation reveals Posts and persists on return only while the session remains confirmed", async (context) => {
  resetDom();
  // Keep this fixture out of the following feed tests' real-time cache window.
  const now = Date.now() + 60 * 60_000;
  context.mock.method(Date, "now", () => now);
  let requests = 0;
  context.mock.method(globalThis, "fetch", async () => {
    requests++;
    return {
      ok: true,
      json: async () => ({
        status: "ok",
        posts: [],
        pinnedStatus: "none",
        repostsStatus: "none",
        articlesStatus: "none",
      }),
    };
  });
  const element = () =>
    React.createElement(PostsPage, {
      language: "zh",
      t: copy.zh,
      profile: { username: "loveyong07" },
      onFeedReady() {},
    });
  let view = await mount(element());
  assert.equal(requests, 0);
  await React.act(async () => view.container.querySelector(".posts-age-confirm").click());
  assert.equal(window.sessionStorage.getItem("nest-posts-age-confirmed"), "18+");
  assert.equal(requests, 1);
  assert.ok(view.container.querySelector(".posts-section"));
  assert.equal(view.container.querySelector(".posts-age-gate"), null);
  await view.unmount();

  view = await mount(element());
  assert.ok(view.container.querySelector(".posts-section"));
  await view.unmount();
  window.sessionStorage.clear();
  view = await mount(element());
  assert.ok(view.container.querySelector(".posts-age-gate"));
  assert.equal(view.container.querySelector(".posts-section"), null);
  assert.equal(requests, 1);
  await view.unmount();
});

test("Blocked session storage still requires confirmation and allows an explicitly confirmed visit", async (context) => {
  resetDom();
  const now = Date.now() + 120 * 60_000;
  context.mock.method(Date, "now", () => now);
  context.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({
      status: "ok",
      posts: [],
      pinnedStatus: "none",
      repostsStatus: "none",
      articlesStatus: "none",
    }),
  }));
  const storageDescriptor = Object.getOwnPropertyDescriptor(window, "sessionStorage");
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    get() {
      throw new Error("Storage blocked");
    },
  });
  const element = () =>
    React.createElement(PostsPage, {
      language: "en",
      t: copy.en,
      profile: { username: "loveyong07" },
      onFeedReady() {},
    });
  let view;
  try {
    view = await mount(element());
    assert.ok(view.container.querySelector(".posts-age-gate"));
    await React.act(async () => view.container.querySelector(".posts-age-confirm").click());
    assert.ok(view.container.querySelector(".posts-section"));
    assert.equal(view.container.querySelector(".feed-empty a")?.getAttribute("href"), "https://x.com/loveyong07");
    await view.unmount();
    view = await mount(element());
    assert.ok(view.container.querySelector(".posts-age-gate"));
  } finally {
    await view?.unmount();
    Object.defineProperty(window, "sessionStorage", storageDescriptor);
  }
});

test("Posts page keeps the dated snapshot visible and offers recovery after a feed failure", async () => {
  resetDom();
  window.sessionStorage.setItem("nest-posts-age-confirmed", "18+");
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

test("Posts opens on the latest feed post and preserves only an explicitly selected reading position", async (context) => {
  resetDom();
  window.sessionStorage.setItem("nest-posts-age-confirmed", "18+");
  // Let the preceding outage's shared request cooldown expire.
  let now = Date.now() + 31_000;
  context.mock.method(Date, "now", () => now);
  let respond;
  context.mock.method(globalThis, "fetch", () => new Promise((resolveResponse) => (respond = resolveResponse)));
  const post = (id, text) => ({
    ...SNAPSHOT,
    id,
    text,
    created_at: "2026-10-11T10:00:00.000Z",
    permalink: `https://x.com/loveyong07/status/${id}`,
  });
  const first = post("2109234459266707736", "The latest post on first entry");
  const second = post("2109234459266707737", "A newer post after refresh");
  const third = post("2109234459266707738", "The latest post on return");
  const fourth = post("2109234459266707739", "Newer than the cached latest post");
  const element = () =>
    React.createElement(PostsPage, {
      language: "en",
      t: copy.en,
      profile: { username: "loveyong07" },
      onFeedReady() {},
    });
  const deliver = async (posts) => {
    assert.equal(typeof respond, "function");
    const complete = respond;
    respond = null;
    await React.act(async () =>
      complete({
        ok: true,
        json: async () => ({
          status: "ok",
          pinnedStatus: "none",
          repostsStatus: "none",
          articlesStatus: "none",
          posts,
        }),
      }),
    );
  };
  const refresh = async (posts) => {
    now += 16 * 60_000;
    await React.act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await deliver(posts);
  };
  let view = await mount(element());
  const shownText = () => view.container.querySelector(".post-reading .post-text")?.textContent;
  try {
    assert.ok(shownText().includes("但愿人长久"));
    // The real fallback post remains in the timeline, reproducing the original bug.
    await deliver([first, SNAPSHOT]);
    assert.equal(shownText(), first.text);

    await refresh([second, first, SNAPSHOT]);
    assert.equal(shownText(), second.text);

    await React.act(async () => view.container.querySelectorAll(".post-index-button")[2].click());
    assert.ok(shownText().includes("但愿人长久"));
    await refresh([third, second, first, SNAPSHOT]);
    assert.ok(shownText().includes("但愿人长久"));
    assert.match(
      view.container.querySelector('[aria-current="true"] .post-index-excerpt')?.textContent ?? "",
      /但愿人长久/,
    );

    await view.unmount();
    view = await mount(element());
    assert.equal(shownText(), third.text);

    await view.unmount();
    now += 16 * 60_000;
    view = await mount(element());
    assert.equal(shownText(), third.text);
    assert.equal(view.container.querySelector(".feed-status-copy span")?.textContent, copy.en.feedRefreshing);
    assert.equal(
      view.container.querySelector(".feed-status-actions"),
      null,
      "a pending cache refresh is not a failure",
    );
    await deliver([fourth, third, second, first, SNAPSHOT]);
    assert.equal(shownText(), fourth.text);
  } finally {
    await view.unmount();
  }
});

test("originals, reposts and Articles navigate independently and retain their identities through reordered refreshes", async (context) => {
  resetDom();
  let now = Date.now() + 3 * 24 * 60 * 60_000;
  context.mock.method(Date, "now", () => now);
  let requests = 0;
  let respond;
  let rejectRequest;
  context.mock.method(globalThis, "fetch", () => {
    requests++;
    return new Promise((resolveResponse, rejectResponse) => {
      respond = resolveResponse;
      rejectRequest = rejectResponse;
    });
  });
  const post = (id) => ({ ...SNAPSHOT, id, text: `Post ${id}`, permalink: `https://x.com/loveyong07/status/${id}` });
  const article = (id) => ({ id, title: `Article ${id}`, text: `Article body ${id}` });
  const repost = (id) => ({ ...post(id), username: "writer", repostId: `${id}0` });
  let shared = [repost("30"), repost("31")];
  let reading;
  function Harness() {
    reading = useXFeed();
    return null;
  }
  const view = await mount(React.createElement(Harness));
  const deliver = async (articles, posts, articlesStatus = "ok") => {
    const complete = respond;
    respond = null;
    assert.equal(typeof complete, "function");
    await React.act(async () =>
      complete({
        ok: true,
        json: async () => ({
          status: "ok",
          pinnedStatus: "none",
          posts,
          articles,
          articlesStatus,
          reposts: shared,
          repostsStatus: shared.length ? "ok" : "none",
        }),
      }),
    );
  };
  const refresh = async (articles, posts, articlesStatus = "ok") => {
    now += 16 * 60_000;
    await React.act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await deliver(articles, posts, articlesStatus);
  };
  try {
    assert.equal(reading.articleState, "loading");
    await deliver([article("10"), article("11")], [post("20"), post("21")]);
    assert.equal(requests, 1, "one shared API response supplies both collections");
    assert.equal(reading.articleState, "live");
    assert.equal(reading.repostState, "live");
    await React.act(async () => reading.setRepostIndex(1));
    assert.equal(reading.postIndex, 0);
    assert.equal(reading.articleIndex, 0);
    await React.act(async () => reading.setPostIndex(1));
    assert.equal(reading.postIndex, 1);
    assert.equal(reading.articleIndex, 0);
    await React.act(async () => reading.setArticleIndex((index) => index + 1));
    assert.equal(reading.postIndex, 1);
    assert.equal(reading.articleIndex, 1);

    shared = [repost("32"), repost("30"), repost("31")];
    await refresh([article("12"), article("11"), article("10")], [post("22"), post("20"), post("21")]);
    assert.equal(reading.reposts[reading.repostIndex].id, "31");
    assert.equal(reading.posts[reading.postIndex].id, "21");
    assert.equal(reading.articles[reading.articleIndex].id, "11");
    await React.act(async () => reading.setPostIndex(0));
    assert.equal(reading.articles[reading.articleIndex].id, "11");
    await React.act(async () => reading.setArticleIndex(2));
    assert.equal(reading.posts[reading.postIndex].id, "22");

    await refresh([], [post("23"), post("22"), post("21")], "unavailable");
    assert.equal(reading.articleState, "stale");
    assert.equal(reading.articles[reading.articleIndex].id, "10");
    assert.equal(reading.posts[reading.postIndex].id, "22");
    now += 16 * 60_000;
    await React.act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await React.act(async () => rejectRequest(new Error("Network unavailable")));
    assert.equal(reading.articleState, "stale");
    assert.equal(reading.articles[reading.articleIndex].id, "10");
    assert.equal(reading.repostState, "stale");
    assert.equal(reading.reposts[reading.repostIndex].id, "31");
    shared = [];
    await refresh([], [post("24")], "none");
    assert.equal(reading.repostState, "none");
    assert.deepEqual(reading.reposts, []);
    assert.equal(reading.articleState, "none");
    assert.deepEqual(reading.articles, []);
    assert.equal(reading.articleIndex, 0);
    now += 16 * 60_000;
    await React.act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await React.act(async () => rejectRequest(new Error("Network unavailable")));
    assert.equal(reading.articleState, "unavailable");
    assert.equal(reading.articleLoading, false);
    assert.equal(requests, 6);
  } finally {
    await view.unmount();
  }
});

for (const wide of [true, false]) {
  test(`responsive post shortcuts preserve video and control keys (wide=${wide})`, async (context) => {
    resetDom();
    mockResponsiveLayout(context, wide);
    window.sessionStorage.setItem("nest-posts-age-confirmed", "18+");
    const time = Date.now() + (wide ? 6 : 7) * 24 * 60 * 60_000;
    context.mock.method(Date, "now", () => time);
    const posts = [
      {
        ...SNAPSHOT,
        text: "Video post",
        media: [{ type: "video", url: "https://video.twimg.com/ext_tw_video/1/pu/vid/movie.mp4" }],
      },
      { ...SNAPSHOT, id: "9002", text: "Second post", permalink: "https://x.com/loveyong07/status/9002" },
    ];
    context.mock.method(globalThis, "fetch", async () => ({
      ok: true,
      json: async () => ({
        status: "ok",
        pinnedStatus: "none",
        repostsStatus: "none",
        articlesStatus: "none",
        posts,
      }),
    }));
    const view = await mount(
      React.createElement(PostsPage, {
        language: "zh",
        t: copy.zh,
        profile: { username: "loveyong07" },
        onFeedReady() {},
      }),
    );
    try {
      const reading = view.container.querySelector(".post-reading");
      const originalVideo = reading.querySelector("video");
      assert.ok(originalVideo);
      for (const target of [
        originalVideo,
        reading.querySelector("a"),
        view.container.querySelector(".post-controls button"),
      ]) {
        const event = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
        await React.act(async () => target.dispatchEvent(event));
        assert.equal(event.defaultPrevented, false, "controls retain their native arrow-key behavior");
        assert.equal(reading.querySelector("video"), originalVideo);
        assert.equal(reading.querySelector(".post-text").textContent, "Video post");
      }
      const handled = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
      handled.preventDefault();
      await React.act(async () => document.body.dispatchEvent(handled));
      assert.equal(reading.querySelector("video"), originalVideo);
      const pageArrow = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
      await React.act(async () => document.body.dispatchEvent(pageArrow));
      assert.equal(pageArrow.defaultPrevented, wide);
      assert.equal(reading.querySelector(".post-text").textContent, wide ? "Second post" : "Video post");
    } finally {
      await view.unmount();
    }
  });
}

test("post and Article link copying provides a selected manual fallback and recovers in every locale", async (context) => {
  resetDom();
  mockResponsiveLayout(context, true);
  const { XArticlesSection } = await server.ssrLoadModule("/src/components/XArticlesSection.jsx");
  const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  let denied = true;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async () => {
        if (denied) throw new Error("Clipboard permission denied");
      },
    },
  });
  try {
    for (const language of ["zh", "ja", "en"]) {
      for (const article of [false, true]) {
        const item = { ...SNAPSHOT, text: "A note", title: "A note", media: [] };
        const props = { language, t: copy[language], profile: { username: "loveyong07" } };
        const view = await mount(
          article
            ? React.createElement(XArticlesSection, {
                ...props,
                articles: [item],
                articleIndex: 0,
                articleState: "live",
              })
            : React.createElement(PostCard, { ...props, post: item, feedSource: "live" }),
        );
        try {
          denied = true;
          await React.act(async () => view.container.querySelector(".post-copy-link").click());
          const fallback = view.container.querySelector(".contact-copy-fallback");
          assert.ok(fallback.textContent.includes(copy[language].copyLinkFailed));
          const input = fallback.querySelector("input");
          assert.equal(input.value, item.permalink);
          assert.equal(document.activeElement, input);
          assert.equal(input.selectionStart, 0);
          assert.equal(input.selectionEnd, item.permalink.length);
          denied = false;
          await React.act(async () => view.container.querySelector(".post-copy-link").click());
          assert.equal(view.container.querySelector(".contact-copy-fallback"), null);
          assert.equal(view.container.querySelector(".post-copy-link").textContent, copy[language].linkCopied);
        } finally {
          await view.unmount();
        }
      }
    }
  } finally {
    if (descriptor) Object.defineProperty(navigator, "clipboard", descriptor);
    else delete navigator.clipboard;
  }
});

test("Articles render equal labels with distinct destinations without linking a third plain occurrence", async () => {
  resetDom();
  const { XArticlesSection } = await server.ssrLoadModule("/src/components/XArticlesSection.jsx");
  const text = "Read more and Read more; Read more";
  const view = await mount(
    React.createElement(XArticlesSection, {
      articles: [
        {
          id: "9003",
          text,
          links: [{ text: "Read more", url: "https://example.com/global" }],
          blocks: [
            {
              type: "text",
              text,
              links: [
                { text: "Read more", url: "https://example.com/first", offset: 0, length: 9 },
                { text: "Read more", url: "https://example.com/second", offset: 14, length: 9 },
              ],
            },
          ],
        },
      ],
      articleIndex: 0,
      articleState: "live",
      language: "zh",
      t: copy.zh,
      profile: {},
    }),
  );
  try {
    assert.deepEqual(
      [...view.container.querySelectorAll(".article-text a")].map((link) => link.href),
      ["https://example.com/first", "https://example.com/second"],
    );
    assert.equal(view.container.querySelector(".article-text").textContent, text);
  } finally {
    await view.unmount();
  }
});

test("Posts quick navigation pills reflect live section counts and smooth-scroll to target sections", async (context) => {
  resetDom();
  window.sessionStorage.setItem("nest-posts-age-confirmed", "18+");
  const now = Date.now() + 5 * 24 * 60 * 60_000;
  context.mock.method(Date, "now", () => now);
  context.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({
      status: "ok",
      pinnedPost: { ...SNAPSHOT, id: "pin-1" },
      pinnedStatus: "ok",
      posts: [SNAPSHOT],
      articles: [{ id: "art-1", title: "Article", text: "Body" }],
      articlesStatus: "ok",
    }),
  }));
  const view = await mount(
    React.createElement(PostsPage, {
      language: "zh",
      t: copy.zh,
      profile: { username: "loveyong07" },
      onFeedReady() {},
    }),
  );
  try {
    await React.act(async () => new Promise((resolvePromise) => setTimeout(resolvePromise, 0)));
    const quickNav = view.container.querySelector(".posts-quick-nav");
    assert.ok(quickNav);
    assert.equal(quickNav.getAttribute("aria-label"), copy.zh.postsQuickNavLabel);
    const pills = [...quickNav.querySelectorAll(".quick-nav-pill")];
    assert.equal(pills.length, 4);
    assert.equal(view.container.querySelector(".reading-invitation"), null);
    assert.equal(quickNav.querySelector(".quick-nav-message"), null);
    let scrolled = false;
    const articlesSection = view.container.querySelector("#x-articles");
    assert.ok(articlesSection);
    articlesSection.scrollIntoView = () => {
      scrolled = true;
    };
    await React.act(async () => pills.at(-1).click());
    assert.equal(scrolled, true);
  } finally {
    await view.unmount();
  }
});

async function selectPreviewPhoto(value) {
  await React.act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" })));
  for (let index = 0; index < value; index++) {
    await React.act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" })));
  }
}
