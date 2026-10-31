import { retainedPostIndex } from "./feed-reading.js";
import { isOwnPost } from "./posts.js";

function validReposts(feed) {
  return Array.isArray(feed?.reposts)
    ? feed.reposts.filter(
        (post) =>
          isOwnPost(post) && /^\d+$/.test(post.repostId ?? "") && /^[A-Za-z0-9_]{1,15}$/.test(post.username ?? ""),
      )
    : [];
}

export function initialRepostReading(feed) {
  const reposts = ["ok", "stale"].includes(feed?.repostsStatus) ? validReposts(feed) : [];
  return {
    reposts,
    index: 0,
    hasSelectedRepost: false,
    state: feed?.repostsStatus === "none" ? "none" : reposts.length ? "stale" : "loading",
  };
}

export function refreshedRepostReading(current, feed) {
  const status = feed?.repostsStatus;
  const reposts = validReposts(feed);
  if (status === "none" || (status === "ok" && Array.isArray(feed?.reposts) && feed.reposts.length === 0)) {
    return { ...current, reposts: [], index: 0, state: "none" };
  }
  if (["ok", "stale"].includes(status) && reposts.length) {
    return {
      ...current,
      reposts,
      index: current.hasSelectedRepost ? retainedPostIndex(current.reposts, current.index, reposts) : 0,
      state: status === "ok" ? "live" : "stale",
    };
  }
  return { ...current, state: current.reposts.length ? "stale" : "unavailable" };
}

export function cacheRepostData(feed) {
  if (!feed || (!Object.hasOwn(feed, "reposts") && !Object.hasOwn(feed, "repostsStatus"))) return feed;
  if (feed.repostsStatus === "none") return { ...feed, reposts: [] };
  if (feed.repostsStatus === "ok" && Array.isArray(feed.reposts)) return feed;
  return { ...feed, reposts: [], repostsStatus: "unavailable" };
}
