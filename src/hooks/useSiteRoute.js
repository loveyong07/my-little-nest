import { useEffect, useRef, useState } from "react";
import { canPrefetch } from "../utils/network.js";
import { pagePaths, resolvePage, siteNavigation } from "../routes/site-route.js";
import { scenePreloads } from "../routes/scene-assets.js";

export { pagePaths };

const preloadedScenes = new Set();

function currentPage() {
  return resolvePage(window.location.pathname);
}

function preloadScene(page) {
  const scenes = scenePreloads(page);
  const { href } = scenes.find((scene) => !scene.media || window.matchMedia(scene.media).matches) ?? scenes.at(-1);
  if (preloadedScenes.has(href)) return;
  preloadedScenes.add(href);
  if ([...document.querySelectorAll('link[rel="preload"][as="image"]')].some((link) => link.getAttribute("href") === href)) return;
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

// A direct /posts visit starts loading before React mounts. fetchFeed coalesces
// any later request until this one settles.
let earlyFeed = typeof window !== "undefined" && currentPage() === "posts"
  ? import("../feed-cache.js").then(({ fetchFeed }) => fetchFeed()) : null;
earlyFeed?.catch(() => {});

export function takeEarlyFeed() {
  const request = earlyFeed;
  earlyFeed = null;
  return request;
}

export function useSiteRoute() {
  const [page, setPage] = useState(currentPage);
  const previousPage = useRef(page);

  useEffect(() => {
    if (previousPage.current === page) return;
    previousPage.current = page;
    const frame = window.requestAnimationFrame(() => document.getElementById("page-heading")?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [page]);

  useEffect(() => {
    function handleHistoryNavigation() {
      const nextPage = currentPage();
      activateScene(nextPage);
      setPage(nextPage);
      window.scrollTo(0, 0);
    }
    window.addEventListener("popstate", handleHistoryNavigation);
    return () => window.removeEventListener("popstate", handleHistoryNavigation);
  }, []);

  function preparePosts(event) {
    const link = event.target.closest("a[href]");
    if (!link || !canPrefetch()) return;
    const target = new URL(link.href, window.location.href);
    if (target.origin === window.location.origin && target.pathname === pagePaths.posts) preloadScene("posts");
  }

  function handleRouteClick(event) {
    const link = event.target.closest("a[href]");
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
      || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
    const destination = siteNavigation(link.href, window.location.href);
    if (!destination) return;

    event.preventDefault();
    activateScene(destination.page);
    if (window.location.pathname !== destination.path) {
      window.history.pushState({ page: destination.page }, "", destination.path);
    }
    setPage(destination.page);
    if (destination.page !== page) window.scrollTo(0, 0);
  }

  return { page, handleRouteClick, preparePosts };
}
