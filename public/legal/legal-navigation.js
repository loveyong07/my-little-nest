import { bindSwipeSwitch } from "/assets/swipe-switch.js";

const PAGES = ["privacy", "terms"];
const LANGUAGES = [
  { code: "zh", attr: "zh-CN", hash: "#zh" },
  { code: "ja", attr: "ja", hash: "#ja" },
  { code: "en", attr: "en", hash: "#en" },
];
const navigation = document.querySelector(".legal-nav");
const languagePicker = document.querySelector(".legal-language");
const hero = document.querySelector(".legal-hero");
const main = document.querySelector(".legal-document");

const pageCache = new Map();
const pendingLoads = new Map();
const scrollPositions = new Map();
const navWheelLock = { current: 0 };
const languageWheelLock = { current: 0 };

let entrySequence = 0;
let navigationId = 0;
let outgoingCleanupTimer;
let navSwipe;
let languageSwipe;
let currentPage = pageFromPath(location.pathname);
let currentLanguage = languageFromHash(location.hash);
let activeEntry = ensureEntryKey();

function pageFromPath(pathname) {
  return /^\/terms(?:\/|$)|\/terms\.html$/.test(pathname) ? "terms" : "privacy";
}

function languageFromHash(hash) {
  if (hash === "#ja") return "ja";
  if (hash === "#en") return "en";
  return "zh";
}

function languageMeta(code) {
  return LANGUAGES.find((item) => item.code === code) ?? LANGUAGES[0];
}

function pageUrl(page, langCode) {
  return langCode === "zh" ? `/${page}` : `/${page}#${langCode}`;
}

function newEntryKey() {
  return `${Date.now()}-${++entrySequence}`;
}

function ensureEntryKey() {
  const state = history.state;
  if (state?.legalEntry) return state.legalEntry;
  const legalEntry = newEntryKey();
  history.replaceState({ ...state, legalEntry, legalPage: currentPage }, "");
  return legalEntry;
}

function saveScrollPosition() {
  if (activeEntry) scrollPositions.set(activeEntry, window.scrollY);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function canPrefetch() {
  return !navigator.connection?.saveData;
}

function extractPage(doc) {
  const heroNode = doc.querySelector(".legal-hero");
  const sceneNode = doc.querySelector(".legal-scene");
  const articles = [...doc.querySelectorAll(".legal-copy")];
  if (!heroNode || !sceneNode || articles.length === 0) return null;
  return {
    title: doc.title,
    description: doc.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
    canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "",
    heroNodes: [...heroNode.children].map((node) => node.cloneNode(true)),
    sceneTemplate: sceneNode.cloneNode(true),
    articles: articles.map((node) => node.cloneNode(true)),
  };
}

function preloadSceneImage(picture) {
  if (!canPrefetch() || !picture) return;
  const portrait = window.matchMedia("(orientation: portrait)").matches;
  const source = portrait ? picture.querySelector('source[media="(orientation: portrait)"]') : null;
  const image = picture.querySelector("img");
  if (!image) return;
  const href = source?.getAttribute("srcset") || image.getAttribute("src");
  if (
    href &&
    ![...document.querySelectorAll('link[rel="preload"][as="image"]')].some((link) => link.getAttribute("href") === href)
  ) {
    const preload = document.createElement("link");
    preload.rel = "preload";
    preload.as = "image";
    preload.type = "image/webp";
    preload.href = href;
    document.head.append(preload);
  }
  const warm = new Image();
  if (source?.getAttribute("srcset")) {
    warm.src = source.getAttribute("srcset");
  } else {
    if (image.getAttribute("sizes")) warm.sizes = image.getAttribute("sizes");
    if (image.getAttribute("srcset")) warm.srcset = image.getAttribute("srcset");
    warm.src = image.getAttribute("src");
  }
  warm.decode?.().catch(() => {});
}

function loadPage(page) {
  if (pageCache.has(page)) return Promise.resolve(pageCache.get(page));
  if (pendingLoads.has(page)) return pendingLoads.get(page);
  const request = fetch(`/${page}`, { headers: { Accept: "text/html" } })
    .then((response) => {
      if (!response.ok) throw new Error(`Failed to load /${page}: ${response.status}`);
      return response.text();
    })
    .then((html) => {
      const parsed = new DOMParser().parseFromString(html, "text/html");
      const snapshot = extractPage(parsed);
      if (!snapshot) throw new Error(`Invalid legal page structure for /${page}`);
      pageCache.set(page, snapshot);
      preloadSceneImage(snapshot.sceneTemplate);
      return snapshot;
    })
    .finally(() => {
      pendingLoads.delete(page);
    });
  pendingLoads.set(page, request);
  return request;
}

function prefetchSibling() {
  if (!canPrefetch()) return;
  const sibling = currentPage === "privacy" ? "terms" : "privacy";
  loadPage(sibling).catch(() => {});
}

function armAnimations(element) {
  if (!element || element.dataset.swipeAnimated) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      element.dataset.swipeAnimated = "true";
    });
  });
}

function syncNavAriaCurrent(page) {
  for (const link of navigation.querySelectorAll("a[data-legal-page]")) {
    if (link.dataset.legalPage === page) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

function connectNav({ suppressTransition = false } = {}) {
  navSwipe?.destroy();
  if (suppressTransition) delete navigation.dataset.swipeAnimated;
  const { attr } = languageMeta(currentLanguage);
  const itemSelector = `a[lang="${attr}"]`;
  const activeIndex = PAGES.indexOf(currentPage);
  navSwipe = bindSwipeSwitch({
    control: navigation,
    itemSelector,
    activeIndex,
    wheelLock: navWheelLock,
    onChange: (index) => {
      const target = PAGES[index];
      if (target) navigatePage(target);
    },
    onPosition: (position) => navigation.style.setProperty("--switch-position", String(position)),
  });
  armAnimations(navigation);
}

function syncLanguageDom(code) {
  const { attr } = languageMeta(code);
  document.documentElement.lang = attr;
  document.body.dataset.legalLang = code;
  if (!languagePicker) return;
  for (const link of languagePicker.querySelectorAll("a")) {
    if (link.getAttribute("href") === `#${code}`) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  }
}

function connectLanguage() {
  if (!languagePicker) return;
  if (!languagePicker.querySelector(".language-selection")) {
    const selection = document.createElement("span");
    selection.className = "language-selection";
    selection.setAttribute("aria-hidden", "true");
    languagePicker.prepend(selection);
  }
  languageSwipe?.destroy();
  const activeIndex = LANGUAGES.findIndex(({ code }) => code === currentLanguage);
  languageSwipe = bindSwipeSwitch({
    control: languagePicker,
    itemSelector: "a",
    activeIndex: Math.max(0, activeIndex),
    wheelLock: languageWheelLock,
    onChange: (index) => {
      const target = LANGUAGES[index];
      if (target) setLanguage(target.code);
    },
  });
  armAnimations(languagePicker);
}

function setLanguage(code, { updateUrl = true } = {}) {
  if (code === currentLanguage) return;
  currentLanguage = code;
  syncLanguageDom(code);
  if (updateUrl) {
    const nextHash = languageMeta(code).hash;
    if (location.hash !== nextHash) {
      history.replaceState(history.state, "", `${location.pathname}${nextHash}`);
    }
  }
  connectLanguage();
  connectNav({ suppressTransition: true });
}

function clearOutgoingScene() {
  clearTimeout(outgoingCleanupTimer);
  for (const element of document.querySelectorAll(".legal-scene-outgoing")) element.remove();
}

function applyPage(snapshot, { animate = true, scrollTop = 0 } = {}) {
  const shouldAnimate = animate && !prefersReducedMotion();

  if (snapshot.title) document.title = snapshot.title;
  const description = document.querySelector('meta[name="description"]');
  if (description && snapshot.description) description.setAttribute("content", snapshot.description);
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical && snapshot.canonical) canonical.setAttribute("href", snapshot.canonical);

  if (hero) {
    const nextHeroNodes = snapshot.heroNodes.map((node) => {
      const clone = document.importNode(node, true);
      if (shouldAnimate) clone.classList.add("is-entering");
      return clone;
    });
    hero.replaceChildren(...nextHeroNodes);
  }

  if (main) {
    clearOutgoingScene();
    const currentScene = main.querySelector(".legal-scene");
    const nextScene = document.importNode(snapshot.sceneTemplate, true);
    if (shouldAnimate && currentScene) {
      currentScene.classList.remove("legal-scene", "is-entering");
      currentScene.classList.add("legal-scene-outgoing");
      nextScene.classList.add("is-entering");
      currentScene.after(nextScene);
      const cleanup = () => {
        clearOutgoingScene();
        nextScene.classList.remove("is-entering");
      };
      nextScene.addEventListener("animationend", cleanup, { once: true });
      outgoingCleanupTimer = setTimeout(cleanup, 420);
    } else if (currentScene) {
      currentScene.replaceWith(nextScene);
    } else {
      main.prepend(nextScene);
    }

    const returnLink = main.querySelector(".legal-return");
    for (const article of main.querySelectorAll(".legal-copy")) article.remove();
    const fragment = document.createDocumentFragment();
    for (const article of snapshot.articles) {
      const clone = document.importNode(article, true);
      if (shouldAnimate) clone.classList.add("is-entering");
      fragment.append(clone);
    }
    if (returnLink) main.insertBefore(fragment, returnLink);
    else main.append(fragment);
  }

  window.scrollTo({ top: scrollTop, behavior: "instant" });
}

function navigatePage(targetPage, { push = true, scrollTop = 0 } = {}) {
  if (!PAGES.includes(targetPage)) return;
  if (targetPage === currentPage && push) return;
  const id = ++navigationId;
  const destination = pageUrl(targetPage, currentLanguage);

  if (push) {
    saveScrollPosition();
    activeEntry = newEntryKey();
    history.pushState({ legalEntry: activeEntry, legalPage: targetPage }, "", destination);
  }

  currentPage = targetPage;
  syncNavAriaCurrent(targetPage);
  connectNav();

  const cached = pageCache.get(targetPage);
  if (cached) {
    applyPage(cached, { animate: true, scrollTop });
    return;
  }

  loadPage(targetPage)
    .then((snapshot) => {
      if (id !== navigationId) return;
      applyPage(snapshot, { animate: true, scrollTop });
    })
    .catch(() => {
      if (id === navigationId) location.assign(destination);
    });
}

navigation.addEventListener("click", (event) => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest("a[data-legal-page]");
  if (!link) return;
  event.preventDefault();
  const targetPage = link.dataset.legalPage;
  if (targetPage && targetPage !== currentPage) navigatePage(targetPage);
});

for (const eventName of ["pointerover", "focusin", "touchstart"]) {
  navigation.addEventListener(eventName, prefetchSibling, { passive: true });
}

languagePicker?.addEventListener("click", (event) => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest("a[href^='#']");
  if (!link) return;
  event.preventDefault();
  setLanguage(languageFromHash(link.getAttribute("href")));
});

window.addEventListener("popstate", () => {
  saveScrollPosition();
  activeEntry = ensureEntryKey();
  const savedScroll = scrollPositions.get(activeEntry) ?? 0;
  const nextLanguage = languageFromHash(location.hash);
  const nextPage = pageFromPath(location.pathname);

  if (nextLanguage !== currentLanguage) {
    currentLanguage = nextLanguage;
    syncLanguageDom(nextLanguage);
    connectLanguage();
  }
  if (nextPage !== currentPage) {
    navigatePage(nextPage, { push: false, scrollTop: savedScroll });
  } else {
    connectNav({ suppressTransition: true });
    window.scrollTo({ top: savedScroll, behavior: "instant" });
  }
});

window.addEventListener("hashchange", () => {
  const nextLanguage = languageFromHash(location.hash);
  if (nextLanguage !== currentLanguage) {
    setLanguage(nextLanguage, { updateUrl: false });
  }
});

window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  currentPage = pageFromPath(location.pathname);
  currentLanguage = languageFromHash(location.hash);
  syncLanguageDom(currentLanguage);
  syncNavAriaCurrent(currentPage);
  connectLanguage();
  connectNav({ suppressTransition: true });
});

const initialSnapshot = extractPage(document);
if (initialSnapshot) pageCache.set(currentPage, initialSnapshot);

syncLanguageDom(currentLanguage);
syncNavAriaCurrent(currentPage);
connectLanguage();
connectNav();

if (document.readyState === "complete") {
  setTimeout(prefetchSibling, 300);
} else {
  window.addEventListener("load", () => setTimeout(prefetchSibling, 300), { once: true });
}
