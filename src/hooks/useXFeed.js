import { useEffect, useRef, useState } from "react";
import { readFeedCache, writeFeedCache, fetchFeed } from "../feed-cache.js";
import { SNAPSHOT } from "../constants/site.js";
import { isOwnPost, isOriginalPost } from "../utils/posts.js";
import { takeEarlyFeed } from "./useSiteRoute.js";

function initialFeedCache() {
  try { return readFeedCache(window.localStorage); } catch { return null; }
}

export function useXFeed() {
  const [cachedFeed] = useState(initialFeedCache);
  const cachedPin = cachedFeed && ["ok", "stale"].includes(cachedFeed.feed.pinnedStatus) && isOwnPost(cachedFeed.feed.pinnedPost) ? cachedFeed.feed.pinnedPost : null;
  const [posts, setPosts] = useState(() => cachedFeed ? cachedFeed.feed.posts.filter((post) => isOriginalPost(post) && post.id !== cachedPin?.id) : [SNAPSHOT]);
  const [feedSource, setFeedSource] = useState(cachedFeed ? "stale" : "snapshot");
  const [feedLoading, setFeedLoading] = useState(!cachedFeed);
  const [feedUpdatedAt, setFeedUpdatedAt] = useState(cachedFeed?.savedAt ?? null);
  const [feedRefreshToken, setFeedRefreshToken] = useState(0);
  const [retryDisabled, setRetryDisabled] = useState(false);
  const [pinnedPost, setPinnedPost] = useState(cachedPin);
  const [pinState, setPinState] = useState(cachedPin ? "stale" : cachedFeed?.feed.pinnedStatus === "none" ? "none" : "loading");
  const pinnedPostRef = useRef(cachedPin);
  const [postIndex, setPostIndex] = useState(0);
  const retryTimerRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    async function refreshFeed() {
      try {
        const request = takeEarlyFeed() ?? fetchFeed();
        const feed = await request;
        if (!mounted) return;
        const hasPinStatus = ["ok", "stale", "none", "unavailable"].includes(feed.pinnedStatus);
        const nextPinned = isOwnPost(feed.pinnedPost) && (!hasPinStatus || ["ok", "stale"].includes(feed.pinnedStatus)) ? feed.pinnedPost : null;
        if (hasPinStatus) {
          if (feed.pinnedStatus === "none") {
            pinnedPostRef.current = null;
            setPinnedPost(null); setPinState("none");
          } else if (feed.pinnedStatus === "unavailable") {
            setPinState(pinnedPostRef.current ? "stale" : "unavailable");
          } else {
            pinnedPostRef.current = nextPinned;
            setPinnedPost(nextPinned);
            setPinState(nextPinned ? (feed.pinnedStatus === "stale" ? "stale" : "live") : "unavailable");
          }
        } else if (feed.status === "ok" || feed.status === "stale") {
          pinnedPostRef.current = nextPinned;
          setPinnedPost(nextPinned);
          setPinState(nextPinned ? (feed.status === "stale" ? "stale" : "live") : (feed.status === "stale" ? "unavailable" : "none"));
        } else {
          setPinState(pinnedPostRef.current ? "stale" : "unavailable");
        }
        const originals = Array.isArray(feed.posts) ? feed.posts.filter((post) => isOriginalPost(post) && post.id !== pinnedPostRef.current?.id) : [];
        if (feed.status === "ok" || feed.status === "stale") {
          if (feed.status === "ok") {
            const savedAt = Date.now();
            try { writeFeedCache(window.localStorage, { ...feed, posts: originals }, savedAt); } catch { /* Storage is optional. */ }
            setFeedUpdatedAt(savedAt);
          }
          setPosts(originals); setFeedSource(feed.status === "stale" ? "stale" : "live");
          setPostIndex((index) => Math.min(index, Math.max(0, originals.length - 1)));
        } else {
          setFeedSource((current) => current === "live" ? "stale" : current);
        }
        setFeedLoading(false);
      } catch {
        if (mounted) {
          setFeedSource((current) => current === "live" ? "stale" : current);
          setPinState(pinnedPostRef.current ? "stale" : "unavailable");
          setFeedLoading(false);
        }
      }
    }
    refreshFeed();
    const interval = window.setInterval(refreshFeed, 15 * 60 * 1000);
    const onVisible = () => { if (!document.hidden) refreshFeed(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { mounted = false; window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [feedRefreshToken]);

  function retryFeed() {
    if (retryDisabled) return;
    setRetryDisabled(true);
    setFeedLoading(true);
    setFeedRefreshToken((value) => value + 1);
    retryTimerRef.current = window.setTimeout(() => setRetryDisabled(false), 30_000);
  }

  useEffect(() => () => window.clearTimeout(retryTimerRef.current), []);

  return { posts, feedSource, feedLoading, feedUpdatedAt, retryDisabled, pinnedPost, pinState, postIndex, setPostIndex, retryFeed };
}
