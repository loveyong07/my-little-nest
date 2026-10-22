import { retainedPostIndex } from "./feed-reading.js";

/**
 * @typedef {"loading" | "live" | "stale" | "none" | "unavailable"} ArticleReadingState
 * @typedef {{
 *   articles: import("../../shared/contracts.mjs").ArticleItem[],
 *   index: number,
 *   hasSelectedArticle: boolean,
 *   state: ArticleReadingState,
 * }} ArticleReading
 */

/**
 * @param {import("../../shared/contracts.mjs").FeedResponse | null | undefined} [feed]
 * @returns {ArticleReading}
 */
export function initialArticleReading(feed) {
  const articles = Array.isArray(feed?.articles) ? feed.articles : [];
  return {
    articles: ["ok", "stale"].includes(feed?.articlesStatus) ? articles : [],
    index: 0,
    hasSelectedArticle: false,
    state:
      feed?.articlesStatus === "none"
        ? "none"
        : ["ok", "stale"].includes(feed?.articlesStatus) && articles.length
          ? "stale"
          : "loading",
  };
}

/**
 * @param {ArticleReading} current
 * @param {import("../../shared/contracts.mjs").FeedResponse | null | undefined} feed
 * @returns {ArticleReading}
 */
export function refreshedArticleReading(current, feed) {
  const status = feed?.articlesStatus;
  const articles = Array.isArray(feed?.articles) ? feed.articles : null;
  if (status === "none" || (status === "ok" && articles?.length === 0)) {
    return { ...current, articles: [], index: 0, state: "none" };
  }
  if (["ok", "stale"].includes(status) && articles?.length) {
    return {
      ...current,
      articles,
      index: current.hasSelectedArticle ? retainedPostIndex(current.articles, current.index, articles) : 0,
      state: status === "ok" ? "live" : "stale",
    };
  }
  // A missing field in an older response or an upstream failure cannot confirm
  // that the account has no Articles. Keep a readable selection when available.
  return { ...current, state: current.articles.length ? "stale" : "unavailable" };
}

/**
 * @param {import("../../shared/contracts.mjs").FeedResponse | null | undefined} feed
 * @returns {import("../../shared/contracts.mjs").FeedResponse | null | undefined}
 */
export function cacheArticleData(feed) {
  if (!feed || (!Object.hasOwn(feed, "articles") && !Object.hasOwn(feed, "articlesStatus"))) return feed;
  if (feed.articlesStatus === "none") return { ...feed, articles: [] };
  if (feed.articlesStatus === "ok" && Array.isArray(feed.articles)) return feed;
  // Timeline success must not give unverified Articles a new cache timestamp.
  return { ...feed, articles: [], articlesStatus: "unavailable" };
}
