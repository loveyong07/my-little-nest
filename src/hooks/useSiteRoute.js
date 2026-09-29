import { useEffect, useState } from "react";
import { canPrefetch } from "../utils/network.js";
import { pagePaths, resolvePage, siteNavigation } from "../routes/site-route.js";

export { pagePaths };

const ASSETS = "/assets";
const preloadedScenes = new Set();

function currentPage() {
  return resolvePage(window.location.pathname);
}

function preloadScene(page) {
  const file = page === "posts" ? "posts-winter-hero-q90.webp"
    : page === "contact" ? "contact-sky-letter-v2-clean-q90.webp"
      : window.matchMedia("(max-width: 700px)").matches ? "hero-sky-mobile-motion-q90.webp" : "hero-sky-alt-motion-q90.webp";
  if (preloadedScenes.has(file)) return;
  preloadedScenes.add(file);
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.type = "image/webp";
  link.href = `${ASSETS}/${file}`;
  link.fetchPriority = "high";
  document.head.append(link);
}

if (typeof window !== "undefined") preloadScene(currentPage());

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

  useEffect(() => {
    function handleHistoryNavigation() {
      const nextPage = currentPage();
      preloadScene(nextPage);
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
    preloadScene(destination.page);
    if (window.location.pathname !== destination.path) {
      window.history.pushState({ page: destination.page }, "", destination.path);
    }
    setPage(destination.page);
    if (destination.page !== page) window.scrollTo(0, 0);
  }

  return { page, handleRouteClick, preparePosts };
}
