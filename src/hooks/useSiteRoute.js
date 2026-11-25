import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { JSON_REQUEST_TIMEOUT_MS } from "../../shared/request-budgets.mjs";
import { canPrefetch } from "../utils/network.js";
import { pagePaths, resolvePage, siteNavigation } from "../routes/site-route.js";
import { scenePreloads } from "../routes/scene-assets.js";
import { hasAgeConfirmation } from "../utils/age-confirmation.js";
import { syncSiteMetadata } from "../routes/site-metadata.js";

export { pagePaths };

function currentPage() {
  return resolvePage(window.location.pathname);
}

// "/posts/" and "/posts" are the same page; keep history free of no-op entries.
function normalizedPath(pathname) {
  return pathname.replace(/\/+$/, "") || "/";
}

let entrySequence = 0;
function newEntryKey() {
  return Date.now() + "-" + ++entrySequence;
}

function currentEntryKey() {
  const state = window.history.state;
  if (state?.nestEntry) return state.nestEntry;
  const nestEntry = newEntryKey();
  window.history.replaceState({ ...state, nestEntry }, "");
  return nestEntry;
}

function restoreScroll(top) {
  const scroll = () => window.scrollTo({ top, behavior: "instant" });
  const canReach = () => top <= document.documentElement.scrollHeight - window.innerHeight;
  if (top === 0 || canReach() || typeof ResizeObserver === "undefined") {
    scroll();
    return undefined;
  }

  // A lazy panel or a cached feed may initially be shorter than its last view.
  window.scrollTo({ top: 0, behavior: "instant" });
  const input = new AbortController();
  const observer = new ResizeObserver(() => {
    if (!canReach()) return;
    scroll();
    stop();
  });
  const timeout = window.setTimeout(() => {
    scroll();
    stop();
  }, JSON_REQUEST_TIMEOUT_MS);
  function stop() {
    input.abort();
    observer.disconnect();
    window.clearTimeout(timeout);
  }
  observer.observe(document.getElementById("root") ?? document.body);
  for (const event of ["wheel", "pointerdown", "touchstart", "keydown"]) {
    window.addEventListener(event, stop, { passive: true, signal: input.signal });
  }
  return stop;
}

const warmedScenes = new Set();

function activeSceneHref(page) {
  const scenes = scenePreloads(page);
  return (scenes.find((scene) => !scene.media || window.matchMedia(scene.media).matches) ?? scenes.at(-1))?.href;
}

function warmSceneImage(page) {
  if (typeof Image === "undefined" || !canPrefetch()) return;
  const href = activeSceneHref(page);
  if (!href || warmedScenes.has(href)) return;
  warmedScenes.add(href);
  const image = new Image();
  image.src = href;
  image.decode?.().catch(() => {});
}

export function warmSiblingScenes(activePage) {
  if (!canPrefetch()) return;
  for (const candidate of Object.keys(pagePaths)) {
    if (candidate !== activePage) warmSceneImage(candidate);
  }
}

function preloadScene(page) {
  const href = activeSceneHref(page);
  if (!href) return;
  // The DOM is the record of what is already preloaded, including the server-rendered link.
  if (
    [...document.querySelectorAll('link[rel="preload"][as="image"]')].some((link) => link.getAttribute("href") === href)
  )
    return;
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.type = "image/webp";
  link.dataset.scenePreload = "";
  link.href = href;
  link.fetchPriority = "high";
  document.head.append(link);
}

function activateScene(page) {
  const allowed = new Set(scenePreloads(page).map(({ href }) => href));
  for (const link of document.querySelectorAll("link[data-scene-preload]")) {
    if (!allowed.has(link.getAttribute("href"))) link.remove();
  }
  preloadScene(page);
}

if (typeof window !== "undefined") activateScene(currentPage());

// A confirmed direct /posts visit starts loading before React mounts. New visitors
// wait for age confirmation; fetchFeed coalesces any later request.
let earlyFeed =
  typeof window !== "undefined" && currentPage() === "posts" && hasAgeConfirmation()
    ? import("../feed-cache.js").then(({ fetchFeed }) => fetchFeed())
    : null;
earlyFeed?.catch(() => {});

export function takeEarlyFeed() {
  const request = earlyFeed;
  earlyFeed = null;
  return request;
}

function restoreHashTarget(hash) {
  if (!hash || hash === "#") return undefined;
  let id;
  try {
    id = decodeURIComponent(hash.slice(1));
  } catch {
    id = hash.slice(1);
  }
  if (!id) return undefined;
  const locate = () => {
    const target = document.getElementById(id);
    if (!target) return false;
    target.scrollIntoView({ block: "start", behavior: "instant" });
    target.focus({ preventScroll: true });
    return true;
  };
  if (locate() || typeof ResizeObserver === "undefined") return undefined;

  const input = new AbortController();
  const observer = new ResizeObserver(() => {
    if (locate()) stop();
  });
  const timeout = window.setTimeout(stop, JSON_REQUEST_TIMEOUT_MS);
  function stop() {
    input.abort();
    observer.disconnect();
    window.clearTimeout(timeout);
  }
  observer.observe(document.getElementById("root") ?? document.body);
  for (const event of ["wheel", "pointerdown", "touchstart", "keydown"]) {
    window.addEventListener(event, stop, { passive: true, signal: input.signal });
  }
  return stop;
}

export function useSiteRoute(onPrefetchPage = undefined) {
  const [route, setRoute] = useState(() => ({
    page: currentPage(),
    search: window.location.search,
    hash: "",
    scrollTop: null,
    reading: null,
  }));
  const { page } = route;
  const previousPage = useRef(page);
  const activeEntry = useRef(null);
  const positions = useRef(new Map());
  const reading = useRef(null);

  const savePosition = useCallback(() => {
    if (activeEntry.current) {
      positions.current.set(activeEntry.current, { top: window.scrollY, reading: reading.current });
    }
  }, []);
  const rememberReading = useCallback((selection) => {
    reading.current = selection;
  }, []);

  useEffect(() => syncSiteMetadata(page), [page]);

  useLayoutEffect(() => {
    if (route.hash) return restoreHashTarget(route.hash);
    return route.scrollTop === null ? undefined : restoreScroll(route.scrollTop);
  }, [route]);

  useEffect(() => {
    if (previousPage.current === page) return;
    previousPage.current = page;
    if (route.hash) return undefined;
    const frame = window.requestAnimationFrame(() =>
      document.getElementById("page-heading")?.focus({ preventScroll: true }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [page, route.hash]);

  useLayoutEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    activeEntry.current = currentEntryKey();
    function handleHistoryNavigation() {
      savePosition();
      activeEntry.current = currentEntryKey();
      const saved = positions.current.get(activeEntry.current);
      const nextPage = currentPage();
      const nextHash = window.location.hash;
      reading.current = saved?.reading ?? null;
      activateScene(nextPage);
      setRoute({
        page: nextPage,
        search: window.location.search,
        hash: nextHash,
        scrollTop: nextHash ? null : (saved?.top ?? 0),
        reading: reading.current,
      });
    }
    window.addEventListener("popstate", handleHistoryNavigation);
    return () => {
      window.history.scrollRestoration = previousRestoration;
      window.removeEventListener("popstate", handleHistoryNavigation);
    };
  }, [savePosition]);

  function prepareRoute(event) {
    const link = event.target.closest("a[href]");
    if (!link || !canPrefetch()) return;
    const destination = siteNavigation(link.href, window.location.href);
    if (!destination || destination.page === page) return;
    preloadScene(destination.page);
    warmSceneImage(destination.page);
    onPrefetchPage?.(destination.page);
  }

  function commitNavigation(destination) {
    if (!destination?.path) return;
    activateScene(destination.page);
    const nextSearch = destination.search ?? "";
    const nextHash = destination.hash ?? "";
    const nextUrl = `${destination.path}${nextSearch}${nextHash}`;
    const currentPath = window.location.pathname;
    const changed =
      normalizedPath(currentPath) !== destination.path ||
      window.location.search !== nextSearch ||
      window.location.hash !== nextHash;
    if (changed) {
      savePosition();
      activeEntry.current = newEntryKey();
      window.history.pushState({ page: destination.page, nestEntry: activeEntry.current }, "", nextUrl);
      reading.current = null;
      setRoute({
        page: destination.page,
        search: nextSearch,
        hash: nextHash,
        scrollTop: nextHash ? null : 0,
        reading: null,
      });
    } else if (currentPath !== destination.path) {
      window.history.replaceState({ ...window.history.state, page: destination.page }, "", nextUrl);
    }
  }

  function navigatePage(nextPage) {
    const path = pagePaths[nextPage];
    if (!path) return;
    commitNavigation({ page: nextPage, path });
  }

  function handleRouteClick(event) {
    const link = event.target.closest("a[href]");
    if (
      !link ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      (link.target && link.target !== "_self") ||
      link.hasAttribute("download")
    )
      return;
    const destination = siteNavigation(link.href, window.location.href);
    if (!destination) return;

    event.preventDefault();
    commitNavigation(destination);
  }

  return {
    page,
    routeSearch: route.search,
    handleRouteClick,
    prepareRoute,
    navigatePage,
    historyReading: route.reading,
    rememberReading,
  };
}
