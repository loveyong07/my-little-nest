import { useCallback, useEffect, useRef, useState } from "react";
import { getFeedSnapshot, getFeedRetryAfter, fetchFeed } from "../feed-cache.js";
import { REQUEST_RETRY_MS, startVisibleRefresh } from "../request-cache.js";
import { SNAPSHOT } from "../constants/site.js";
import { isOwnPost, isOriginalPost } from "../utils/posts.js";
import { retainedPostIndex } from "../utils/feed-reading.js";
import { initialArticleReading, refreshedArticleReading } from "../utils/article-reading.js";
import { takeEarlyFeed } from "./useSiteRoute.js";

export function useXFeed() {
  const [cachedFeed] = useState(getFeedSnapshot);
  const cachedPin =
    cachedFeed && ["ok", "stale"].includes(cachedFeed.feed.pinnedStatus) && isOwnPost(cachedFeed.feed.pinnedPost)
      ? cachedFeed.feed.pinnedPost
      : null;
  // Posts and the reading index move together: one state keeps them consistent for
  // a background refresh that reads the committed values between renders.
  const [reading, setReading] = useState(() => ({
    posts: cachedFeed
      ? cachedFeed.feed.posts.filter((post) => isOriginalPost(post) && post.id !== cachedPin?.id)
      : [SNAPSHOT],
    index: 0,
    hasSelectedPost: false,
  }));
  const { posts, index: postIndex } = reading;
  const [articleReading, setArticleReading] = useState(() => initialArticleReading(cachedFeed?.feed));
  const { articles, index: articleIndex, state: articleState } = articleReading;
  const [feedSource, setFeedSource] = useState(cachedFeed ? "stale" : "snapshot");
  const [feedLoading, setFeedLoading] = useState(!cachedFeed);
  const [feedUpdatedAt, setFeedUpdatedAt] = useState(cachedFeed?.savedAt ?? null);
  const [feedRefreshToken, setFeedRefreshToken] = useState(0);
  const [retryDisabled, setRetryDisabled] = useState(false);
  const [pinnedPost, setPinnedPost] = useState(cachedPin);
  const [pinState, setPinState] = useState(
    cachedPin ? "stale" : cachedFeed?.feed.pinnedStatus === "none" ? "none" : "loading",
  );
  const pinnedPostRef = useRef(cachedPin);
  const retryTimerRef = useRef(null);

  const setPostIndex = useCallback((value) => {
    setReading((current) => ({
      ...current,
      index: typeof value === "function" ? value(current.index) : value,
      hasSelectedPost: true,
    }));
  }, []);

  const setArticleIndex = useCallback((value) => {
    setArticleReading((current) => ({
      ...current,
      index: typeof value === "function" ? value(current.index) : value,
      hasSelectedArticle: true,
    }));
  }, []);

  function alignRetryCooldown() {
    const delay = getFeedRetryAfter();
    if (!delay) return;
    window.clearTimeout(retryTimerRef.current);
    setRetryDisabled(true);
    retryTimerRef.current = window.setTimeout(() => setRetryDisabled(false), delay);
  }

  useEffect(() => {
    let mounted = true;
    let firstRefresh = true;
    async function refreshFeed() {
      try {
        const force = firstRefresh && feedRefreshToken > 0;
        firstRefresh = false;
        const request = takeEarlyFeed() ?? fetchFeed({ force });
        const feed = await request;
        if (!mounted) return;
        setArticleReading((current) => refreshedArticleReading(current, feed));
        const hasPinStatus = ["ok", "stale", "none", "unavailable"].includes(feed.pinnedStatus);
        const nextPinned =
          isOwnPost(feed.pinnedPost) && (!hasPinStatus || ["ok", "stale"].includes(feed.pinnedStatus))
            ? feed.pinnedPost
            : null;
        if (hasPinStatus) {
          if (feed.pinnedStatus === "none") {
            pinnedPostRef.current = null;
            setPinnedPost(null);
            setPinState("none");
          } else if (feed.pinnedStatus === "unavailable") {
            setPinState(pinnedPostRef.current ? "stale" : "unavailable");
          } else {
            pinnedPostRef.current = nextPinned;
            setPinnedPost(nextPinned);
            setPinState(nextPinned ? (feed.pinnedStatus === "stale" ? "stale" : "live") : "unavailable");
          }
        } else if ((feed.status === "ok" || feed.status === "stale") && Array.isArray(feed.posts)) {
          pinnedPostRef.current = nextPinned;
          setPinnedPost(nextPinned);
          setPinState(
            nextPinned
              ? feed.status === "stale"
                ? "stale"
                : "live"
              : feed.status === "stale"
                ? "unavailable"
                : "none",
          );
        } else {
          setPinState(pinnedPostRef.current ? "stale" : "unavailable");
        }
        const originals = Array.isArray(feed.posts)
          ? feed.posts.filter((post) => isOriginalPost(post) && post.id !== pinnedPostRef.current?.id)
          : [];
        if ((feed.status === "ok" || feed.status === "stale") && Array.isArray(feed.posts)) {
          if (feed.status === "ok") {
            setFeedUpdatedAt(getFeedSnapshot()?.savedAt ?? null);
          }
          setReading((current) => ({
            ...current,
            posts: originals,
            // A default snapshot/cache selection follows the latest feed item.
            // Preserve identity only after the reader deliberately picks a post.
            index: current.hasSelectedPost ? retainedPostIndex(current.posts, current.index, originals) : 0,
          }));
          setFeedSource(feed.status === "stale" ? "stale" : "live");
        } else {
          setFeedSource((current) => (current === "live" ? "stale" : current));
        }
        alignRetryCooldown();
        setFeedLoading(false);
      } catch {
        if (mounted) {
          setFeedSource((current) => (current === "live" ? "stale" : current));
          setPinState(pinnedPostRef.current ? "stale" : "unavailable");
          setArticleReading((current) => refreshedArticleReading(current, null));
          alignRetryCooldown();
          setFeedLoading(false);
        }
      }
    }
    const stop = startVisibleRefresh(refreshFeed);
    return () => {
      mounted = false;
      stop();
    };
  }, [feedRefreshToken]);

  function retryFeed() {
    if (retryDisabled) return;
    setRetryDisabled(true);
    setFeedLoading(true);
    setFeedRefreshToken((value) => value + 1);
    retryTimerRef.current = window.setTimeout(() => setRetryDisabled(false), REQUEST_RETRY_MS);
  }

  useEffect(() => () => window.clearTimeout(retryTimerRef.current), []);

  return {
    posts,
    feedSource,
    feedLoading,
    feedUpdatedAt,
    retryDisabled,
    pinnedPost,
    pinState,
    postIndex,
    setPostIndex,
    articles,
    articleIndex,
    setArticleIndex,
    articleState,
    articleLoading: articleState === "loading" || feedLoading,
    retryFeed,
  };
}
