const KEY = "little-nest-feed-v1";
const MAX_AGE = 24 * 60 * 60 * 1000;

export function readFeedCache(storage, now = Date.now()) {
  try {
    const cached = JSON.parse(storage.getItem(KEY));
    if (!cached || !Number.isFinite(cached.savedAt) || now < cached.savedAt || now - cached.savedAt > MAX_AGE
      || cached.feed?.status !== "ok" || !Array.isArray(cached.feed.posts)) return null;
    return cached;
  } catch { return null; }
}

export function writeFeedCache(storage, feed, now = Date.now()) {
  // Never extend the lifetime of stale data after an upstream failure.
  if (feed?.status !== "ok" || !Array.isArray(feed.posts)) return;
  // A successful timeline must not keep renewing an old/unverified pin.
  const savedFeed = ["ok", "none"].includes(feed.pinnedStatus)
    ? feed : { ...feed, pinnedPost: null, pinnedStatus: "unavailable" };
  try { storage.setItem(KEY, JSON.stringify({ savedAt: now, feed: savedFeed })); } catch { /* Storage is optional. */ }
}

let pending;
export function fetchFeed() {
  if (!pending) {
    pending = fetch("/api/x-posts").then((response) => {
      if (!response.ok) throw new Error("Feed unavailable");
      return response.json();
    }).finally(() => { pending = null; });
  }
  return pending;
}

export function canPrefetch(connection = globalThis.navigator?.connection) {
  return !connection?.saveData && !["slow-2g", "2g", "3g"].includes(connection?.effectiveType);
}

const warmed = new Set();
export function prefetchImage(src) {
  if (!src || !canPrefetch() || document.hidden || warmed.has(src)) return;
  warmed.add(src);
  // Bound memory and speculative traffic during long browsing sessions.
  if (warmed.size > 40) warmed.delete(warmed.values().next().value);
  const image = new Image();
  image.fetchPriority = "low";
  image.onerror = () => warmed.delete(src);
  image.src = src;
}
