import { canPrefetch } from "./utils/network.js";
import { createSharedRequest, SUCCESS_MAX_AGE_MS } from "./request-cache.js";
import { cacheArticleData } from "./utils/article-reading.js";
import { cacheRepostData } from "./utils/repost-reading.js";

export { canPrefetch };

// Refetch feeds saved before canonical repost media was resolved.
const KEY = "little-nest-feed-v8";
const MAX_AGE = SUCCESS_MAX_AGE_MS;

/**
 * @param {Pick<Storage, "getItem">} storage
 * @param {number} [now]
 * @returns {{ savedAt: number, feed: import("../shared/contracts.mjs").FeedResponse } | null}
 */
export function readFeedCache(storage, now = Date.now()) {
  try {
    const cached = JSON.parse(storage.getItem(KEY));
    if (
      !cached ||
      !Number.isFinite(cached.savedAt) ||
      now < cached.savedAt ||
      now - cached.savedAt > MAX_AGE ||
      cached.feed?.status !== "ok" ||
      !Array.isArray(cached.feed.posts)
    )
      return null;
    return { ...cached, feed: cacheRepostData(cacheArticleData(cached.feed)) };
  } catch {
    return null;
  }
}

/**
 * @param {Pick<Storage, "setItem">} storage
 * @param {import("../shared/contracts.mjs").FeedResponse} feed
 * @param {number} [now]
 */
export function writeFeedCache(storage, feed, now = Date.now()) {
  // Never extend the lifetime of stale data after an upstream failure.
  if (feed?.status !== "ok" || !Array.isArray(feed.posts)) return;
  // A successful timeline must not keep renewing an old/unverified pin.
  const savedFeed = cacheRepostData(
    cacheArticleData(
      ["ok", "none"].includes(feed.pinnedStatus) ? feed : { ...feed, pinnedPost: null, pinnedStatus: "unavailable" },
    ),
  );
  try {
    storage.setItem(KEY, JSON.stringify({ savedAt: now, feed: savedFeed }));
  } catch {
    /* Storage is optional. */
  }
}

const request = createSharedRequest({
  url: "/api/x-posts",
  isSuccess: (feed) => feed?.status === "ok" && Array.isArray(feed.posts),
  isFresh: (feed) =>
    ["ok", "none"].includes(feed?.pinnedStatus) &&
    (feed.repostsStatus === "none" || (feed.repostsStatus === "ok" && Array.isArray(feed.reposts))) &&
    (feed.articlesStatus === "none" || (feed.articlesStatus === "ok" && Array.isArray(feed.articles))),
  onSuccess: (feed, savedAt) => {
    if (typeof window !== "undefined") writeFeedCache(window.localStorage, feed, savedAt);
  },
});

/**
 * @returns {{ savedAt: number, feed: import("../shared/contracts.mjs").FeedResponse } | null}
 */
export function getFeedSnapshot() {
  if (!request.getSnapshot()) {
    try {
      const cached = readFeedCache(window.localStorage);
      if (cached) request.prime(cached.feed, cached.savedAt);
    } catch {
      /* Storage is optional. */
    }
  }
  const snapshot = request.getSnapshot();
  return snapshot ? { savedAt: snapshot.savedAt, feed: cacheRepostData(cacheArticleData(snapshot.value)) } : null;
}

/**
 * @param {{ force?: boolean }} [options]
 * @returns {Promise<import("../shared/contracts.mjs").FeedResponse>}
 */
export function fetchFeed(options) {
  getFeedSnapshot();
  return request.load(options);
}

export function getFeedRetryAfter() {
  return request.getRetryAfter();
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
