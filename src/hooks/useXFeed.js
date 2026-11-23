import { useCallback, useEffect, useRef, useState } from "react";
import { getFeedSnapshot, getFeedRetryAfter, fetchFeed } from "../feed-cache.js";
import { REQUEST_RETRY_MS, startVisibleRefresh } from "../request-cache.js";
import { SNAPSHOT } from "../constants/site.js";
import { isOwnPost, isOriginalPost } from "../utils/posts.js";
import { restoreReadingIndex, retainedPostIndex } from "../utils/feed-reading.js";
import { initialArticleReading, refreshedArticleReading } from "../utils/article-reading.js";
import { initialRepostReading, refreshedRepostReading } from "../utils/repost-reading.js";
import { takeEarlyFeed } from "./useSiteRoute.js";

export function useXFeed(historyReading = null, sharedPost = null) {
  const preferredPostId = historyReading?.postId ?? (sharedPost?.type === "post" ? sharedPost.id : null);
  const preferredRepostId = historyReading?.repostId ?? (sharedPost?.type === "repost" ? sharedPost.id : null);
  const [cachedFeed] = useState(getFeedSnapshot);
  const cachedPin =
    cachedFeed && ["ok", "stale"].includes(cachedFeed.feed.pinnedStatus) && isOwnPost(cachedFeed.feed.pinnedPost)
      ? cachedFeed.feed.pinnedPost
      : null;
  // Posts and the reading index move together: one state keeps them consistent for
  // a background refresh that reads the committed values between renders.
  const [reading, setReading] = useState(() => {
    const posts = cachedFeed
      ? cachedFeed.feed.posts.filter((post) => isOriginalPost(post) && post.id !== cachedPin?.id)
      : [SNAPSHOT];
    const index = restoreReadingIndex(posts, preferredPostId);
    return { posts, index: Math.max(0, index), hasSelectedPost: index >= 0 };
  });
  const { posts, index: postIndex } = reading;
  const [articleReading, setArticleReading] = useState(() => {
    const initial = initialArticleReading(cachedFeed?.feed);
    const index = restoreReadingIndex(initial.articles, historyReading?.articleId);
    return { ...initial, index: Math.max(0, index), hasSelectedArticle: index >= 0 };
  });
  const { articles, index: articleIndex, state: articleState } = articleReading;
  const [repostReading, setRepostReading] = useState(() => {
    const initial = initialRepostReading(cachedFeed?.feed);
    const index = restoreReadingIndex(initial.reposts, preferredRepostId, "repostId");
    return { ...initial, index: Math.max(0, index), hasSelectedRepost: index >= 0 };
  });
  const { reposts, index: repostIndex, state: repostState } = repostReading;
  const [feedSource, setFeedSource] = useState(cachedFeed ? "stale" : "snapshot");
  // A cached first paint still has a refresh in flight. Do not describe that
  // request as a failure before it has actually finished.
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedUpdatedAt, setFeedUpdatedAt] = useState(cachedFeed?.feed.syncedAt ?? cachedFeed?.savedAt ?? null);
  const [previewIssue, setPreviewIssue] = useState(null);
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

  const setRepostIndex = useCallback((value) => {
    setRepostReading((current) => ({
      ...current,
      index: typeof value === "function" ? value(current.index) : value,
      hasSelectedRepost: true,
    }));
  }, []);

  function alignRetryCooldown() {
    const delay = getFeedRetryAfter();
    window.clearTimeout(retryTimerRef.current);
    if (!delay) {
      setRetryDisabled(false);
      return;
    }
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
        setPreviewIssue(feed.previewIssue ?? null);
        setArticleReading((current) => refreshedArticleReading(current, feed));
        setRepostReading((current) => {
          const refreshed = refreshedRepostReading(current, feed);
          if (current.hasSelectedRepost) return refreshed;
          const index = restoreReadingIndex(refreshed.reposts, preferredRepostId, "repostId");
          return index < 0 ? refreshed : { ...refreshed, index, hasSelectedRepost: true };
        });
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
          if (Number.isSafeInteger(feed.syncedAt)) {
            setFeedUpdatedAt(feed.syncedAt);
          } else if (feed.status === "ok") {
            setFeedUpdatedAt(getFeedSnapshot()?.savedAt ?? null);
          }
          setReading((current) => {
            const index = current.hasSelectedPost
              ? retainedPostIndex(current.posts, current.index, originals)
              : restoreReadingIndex(originals, preferredPostId);
            return {
              posts: originals,
              index: Math.max(0, index),
              hasSelectedPost: current.hasSelectedPost || index >= 0,
            };
          });
          setFeedSource(feed.status === "stale" ? "stale" : "live");
        } else {
          setFeedSource((current) => (current === "live" ? "stale" : current));
        }
        alignRetryCooldown();
        setFeedLoading(false);
      } catch (error) {
        if (mounted) {
          setPreviewIssue(typeof error?.previewIssue === "string" ? error.previewIssue : null);
          setFeedSource((current) => (current === "live" ? "stale" : current));
          setPinState(pinnedPostRef.current ? "stale" : "unavailable");
          setArticleReading((current) => refreshedArticleReading(current, null));
          setRepostReading((current) => refreshedRepostReading(current, null));
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
  }, [feedRefreshToken, preferredPostId, preferredRepostId]);

  function retryFeed() {
    if (retryDisabled) return;
    window.clearTimeout(retryTimerRef.current);
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
    previewIssue,
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
    reposts,
    repostIndex,
    setRepostIndex,
    repostState,
    selectedPostId: reading.hasSelectedPost ? posts[postIndex]?.id : null,
    selectedArticleId: articleReading.hasSelectedArticle ? articles[articleIndex]?.id : null,
    selectedRepostId: repostReading.hasSelectedRepost ? reposts[repostIndex]?.repostId : null,
    retryFeed,
  };
}
