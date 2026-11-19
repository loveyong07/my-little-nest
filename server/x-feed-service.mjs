// Reads the account's profile, pinned post, originals, reposts and Articles from the X API, with an
// in-memory cache, incremental refreshes and a failure backoff. Shared by every runtime
// through server/api-handler.mjs.
import { mediaDimensions, parseMediaSource } from "../shared/media-sources.mjs";
import { normalizedArticleLinks } from "../shared/article-links.mjs";
import { ARTICLE_REVALIDATE_TTL_MS, enrichArticleDocuments } from "./x-article-document.mjs";
import { createTelemetryEmitter } from "./telemetry.mjs";
import { X_USER_ID as USER_ID, X_USERNAME as USERNAME } from "../shared/x-account.mjs";
import { FEED_REFRESH_TIMEOUT_MS, FEED_ABORT_GRACE_MS } from "../shared/request-budgets.mjs";

const X_API = "https://api.x.com/2";
const CACHE_TTL_MS = 15 * 60 * 1000;
const FULL_REFRESH_TTL_MS = 24 * 60 * 60 * 1000;
const USER_CACHE_TTL_MS = CACHE_TTL_MS;
const ERROR_RETRY_MS = 60 * 1000;
const MAX_RATE_LIMIT_RETRY_MS = 15 * 60 * 1000;
const PAGE_SIZE = 100;
const MAX_PAGES = 32;

const PERMANENT_X_ERROR_TYPES = new Set([
  "https://api.twitter.com/2/problems/resource-not-found",
  "https://api.x.com/2/problems/resource-not-found",
  "https://api.twitter.com/2/problems/not-authorized-for-resource",
  "https://api.x.com/2/problems/not-authorized-for-resource",
]);

function classifyXErrors(errors) {
  const permanentIds = new Set();
  let hasTransientError = false;
  for (const entry of Array.isArray(errors) ? errors : []) {
    const type = typeof entry?.type === "string" ? entry.type.trim() : "";
    const id = entry?.resource_id ?? entry?.value;
    if (PERMANENT_X_ERROR_TYPES.has(type) && /^\d+$/.test(String(id ?? ""))) {
      permanentIds.add(String(id));
    } else {
      hasTransientError = true;
    }
  }
  return { permanentIds, hasTransientError };
}

function parseRateLimitDelayMs(response, currentMs) {
  if (response.status !== 429) return undefined;
  const retryAfter = response.headers?.get?.("retry-after")?.trim();
  if (retryAfter) {
    if (/^\d+$/.test(retryAfter)) {
      return Math.min(MAX_RATE_LIMIT_RETRY_MS, Math.max(ERROR_RETRY_MS, Number(retryAfter) * 1000));
    }
    const parsedDate = Date.parse(retryAfter);
    if (Number.isFinite(parsedDate)) {
      return Math.min(MAX_RATE_LIMIT_RETRY_MS, Math.max(ERROR_RETRY_MS, parsedDate - currentMs));
    }
  }
  const reset = response.headers?.get?.("x-rate-limit-reset")?.trim();
  if (reset && /^\d+$/.test(reset)) {
    const resetMs = Number(reset) * 1000 - currentMs;
    if (resetMs > 0) return Math.min(MAX_RATE_LIMIT_RETRY_MS, Math.max(ERROR_RETRY_MS, resetMs));
  }
  return undefined;
}

function retryDelayMs(error) {
  return Number.isFinite(error?.retryAfterMs) ? error.retryAfterMs : ERROR_RETRY_MS;
}

function raceWithSignal(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

const unavailable = () => ({ status: "unavailable", posts: [] });
const isId = (value) => /^\d+$/.test(String(value ?? ""));

function safeAvatar(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "pbs.twimg.com" ? url.href : null;
  } catch {
    return null;
  }
}

// Post photos and video posters; avatars come only from the user lookup.
function safePhotoUrl(value) {
  const url = parseMediaSource(value, "image");
  return url && !url.pathname.startsWith("/profile_images/") ? url.href : null;
}

function safeVideoUrl(value) {
  return parseMediaSource(value, "video")?.href ?? null;
}

function isMediaLinkForPost(entity, postId, media, username) {
  if (!/^https:\/\/t\.co\/[A-Za-z0-9]+$/.test(entity?.url ?? "")) return false;
  try {
    const expanded = new URL(entity.expanded_url);
    if (
      expanded.protocol !== "https:" ||
      !["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(expanded.hostname)
    )
      return false;
    const parts = expanded.pathname.split("/").filter(Boolean);
    if (
      parts.length !== 5 ||
      parts[0].toLowerCase() !== username.toLowerCase() ||
      parts[1] !== "status" ||
      parts[2] !== postId ||
      !/^\d+$/.test(parts[4])
    )
      return false;
    const type = parts[3] === "photo" ? "photo" : parts[3] === "video" ? "video" : null;
    return type !== null && Number(parts[4]) <= media.filter((item) => (item.type ?? "photo") === type).length;
  } catch {
    return false;
  }
}

function normalizedPostText(text, post, media, username) {
  const entities = [
    ...(Array.isArray(post.entities?.urls) ? post.entities.urls : []),
    ...(Array.isArray(post.note_tweet?.entities?.urls) ? post.note_tweet.entities.urls : []),
    ...(Array.isArray(post.note_post?.entities?.urls) ? post.note_post.entities.urls : []),
  ];
  const replacements = new Map();
  for (const entity of entities) {
    if (!/^https:\/\/t\.co\/[A-Za-z0-9]+$/.test(entity?.url ?? "")) continue;
    if (isMediaLinkForPost(entity, post.id, media, username)) {
      replacements.set(entity.url, "");
      continue;
    }
    try {
      const expanded = new URL(entity.expanded_url);
      if (["https:", "http:"].includes(expanded.protocol) && !expanded.username && !expanded.password) {
        replacements.set(entity.url, entity.expanded_url);
      }
    } catch {
      // Keep the original short link when X supplies no valid destination.
    }
  }
  // Match each complete short link once; never replace prefixes or recursively
  // expand a destination. No requests to external destinations are necessary.
  const links = [];
  let delta = 0;
  const result = text.replace(/https:\/\/t\.co\/[A-Za-z0-9]+/g, (link, start) => {
    const replacement = replacements.get(link);
    if (replacement === undefined) return link;
    if (replacement) {
      links.push({ text: replacement, url: replacement, offset: start + delta, length: replacement.length });
    }
    delta += replacement.length - link.length;
    return replacement;
  });
  return { text: media.length ? result.trimEnd() : result, ...(links.length ? { links } : {}) };
}

async function getXJson(
  url,
  token,
  fetchImpl,
  { allowPartialErrors = false, signal = undefined, now = Date.now } = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const abortSignal = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal;
  try {
    abortSignal.throwIfAborted();
    const response = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      redirect: "error",
      signal: abortSignal,
    });
    if (!response.ok) {
      /** @type {Error & { status?: number, retryAfterMs?: number }} */
      const error = new Error(`X API returned ${response.status}`);
      error.status = response.status;
      error.retryAfterMs = parseRateLimitDelayMs(response, now());
      throw error;
    }
    const json = await response.json();
    abortSignal.throwIfAborted();
    if (!json || typeof json !== "object" || (!allowPartialErrors && json.errors?.length)) {
      throw new Error("Invalid X API response");
    }
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizedMedia(keys, mediaByKey) {
  const mediaItems = [];
  const usedKeys = new Set();
  for (const key of keys) {
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    const media = mediaByKey.get(key);
    const alt = typeof media?.alt_text === "string" ? media.alt_text.trim() : "";
    if (media?.type === "photo") {
      const url = safePhotoUrl(media.url);
      if (url) mediaItems.push({ type: "photo", url, alt, ...(mediaDimensions(media) ?? {}) });
    } else if (media?.type === "video" || media?.type === "animated_gif") {
      const variants = Array.isArray(media.variants) ? media.variants : [];
      const videoVariants = variants.filter(
        (variant) => variant?.content_type === "video/mp4" && safeVideoUrl(variant.url),
      );
      videoVariants.sort((left, right) => (Number(right.bit_rate) || 0) - (Number(left.bit_rate) || 0));
      const url = videoVariants[0] ? safeVideoUrl(videoVariants[0].url) : null;
      const poster = safePhotoUrl(media.preview_image_url);
      if (url)
        mediaItems.push({
          type: "video",
          ...(media.type === "animated_gif" ? { animated: true } : {}),
          url,
          ...(poster ? { poster } : {}),
          alt,
          ...(mediaDimensions(media) ?? {}),
        });
    }
  }
  return mediaItems;
}

function normalizedPost(post, user, mediaByKey, { allowReferences = false } = {}) {
  if (!isId(post?.id) || typeof post.text !== "string") return null;
  if (post.author_id && post.author_id !== user.id) return null;
  if (allowReferences && post.author_id !== user.id) return null;
  if (!allowReferences && (post.in_reply_to_user_id || post.referenced_tweets?.length || post.referenced_posts?.length))
    return null;
  const mediaItems = normalizedMedia(
    Array.isArray(post.attachments?.media_keys) ? post.attachments.media_keys : [],
    mediaByKey,
  );
  const content = normalizedPostText(
    post.note_tweet?.text || post.note_post?.text || post.text,
    post,
    mediaItems,
    user.username,
  );
  if (!content.text.trim() && mediaItems.length === 0) return null;
  return {
    id: post.id,
    ...content,
    created_at: post.created_at ?? null,
    author: user.name || USERNAME,
    avatar: safeAvatar(user.profile_image_url),
    permalink: `https://x.com/${user.username}/status/${post.id}`,
    ...(mediaItems.length ? { media: mediaItems } : {}),
  };
}

function normalizedRepost(event, author, postsById, usersById, mediaByKey) {
  if (event.author_id !== author.id || event.in_reply_to_user_id) return null;
  const reference = (event.referenced_tweets ?? event.referenced_posts ?? []).find((item) => item.type === "retweeted");
  if (!reference) return null;
  const original = postsById.get(reference.id);
  const user = original?.author_id === author.id ? author : usersById.get(original?.author_id);
  if (!user || user.protected || !/^[A-Za-z0-9_]{1,15}$/.test(user.username ?? "")) return null;
  const post = normalizedPost(original, user, mediaByKey, { allowReferences: true });
  if (!post || typeof original.created_at !== "string") return null;
  return { ...post, username: user.username, repostId: event.id, repostedAt: event.created_at };
}

// Article metadata comes from the requested article field, never from note_tweet:
// long ordinary posts and links that mention an Article remain ordinary posts.
function isArticlePost(post) {
  return (
    (post.article !== null && typeof post.article === "object" && !Array.isArray(post.article)) ||
    (typeof post.article_title === "string" && Boolean(post.article_title.trim()))
  );
}

function normalizedArticle(post, user, mediaByKey) {
  if (
    !isId(post?.id) ||
    post.author_id !== user.id ||
    post.in_reply_to_user_id ||
    post.referenced_tweets?.length ||
    post.referenced_posts?.length
  )
    return null;
  const article = post.article ?? {};
  const title =
    typeof article.title === "string"
      ? article.title.trim()
      : typeof post.article_title === "string"
        ? post.article_title.trim()
        : "";
  const fullText = typeof article.plain_text === "string" ? article.plain_text : "";
  const preview = typeof article.preview_text === "string" ? article.preview_text : "";
  const text = fullText || preview;
  const links = normalizedArticleLinks(article.entities);
  const cover = normalizedMedia(typeof article.cover_media === "string" ? [article.cover_media] : [], mediaByKey).find(
    (item) => item.type === "photo",
  );
  const media = normalizedMedia(
    [
      article.cover_media,
      ...(Array.isArray(article.media_entities) ? article.media_entities : []),
      ...(Array.isArray(post.attachments?.media_keys) ? post.attachments.media_keys : []),
    ].filter((key) => typeof key === "string"),
    mediaByKey,
  );
  // An unexpected/empty Article payload is not proof that the account has no Articles.
  if (!title && !text.trim() && !media.length) return null;
  return {
    id: post.id,
    title,
    text,
    contentKind: fullText ? "full" : "preview",
    coverUrl: cover?.url ?? null,
    ...(links.length ? { links } : {}),
    created_at: post.created_at ?? null,
    author: user.name || USERNAME,
    avatar: safeAvatar(user.profile_image_url),
    permalink: `https://x.com/${user.username}/status/${post.id}`,
    ...(media.length ? { media } : {}),
  };
}

function mergeArticles(current, previous = []) {
  const unique = new Map();
  for (const article of [...current, ...previous]) {
    if (!unique.has(article.id)) unique.set(article.id, article);
  }
  return [...unique.values()].sort((left, right) => {
    const byDate = (Date.parse(right.created_at) || 0) - (Date.parse(left.created_at) || 0);
    return byDate || right.id.length - left.id.length || right.id.localeCompare(left.id);
  });
}

export function createXFeedService({
  token = globalThis.process?.env?.X_BEARER_TOKEN ?? "",
  fetchImpl = globalThis.fetch,
  // Offline API fixtures opt in with an explicit public-page transport.
  articleFetchImpl = fetchImpl === globalThis.fetch ? globalThis.fetch : null,
  articleCache = null,
  articleRevalidateMs = ARTICLE_REVALIDATE_TTL_MS,
  refreshTimeoutMs = FEED_REFRESH_TIMEOUT_MS,
  defer = (task) => void Promise.resolve(task).catch(() => {}),
  onEvent = null,
  now = Date.now,
} = {}) {
  const emit = createTelemetryEmitter(onEvent);
  let user = null;
  let userAt = 0;
  let userInFlight = null;
  let cached = null;
  let cachedAt = 0;
  let newestSeenId = null;
  let retryAt = 0;
  let inFlight = null;
  let userFieldMode = "tweet";
  let postFieldMode = "tweet";
  let cachedPinnedId = null;
  let cachedAuthor = null;
  let pinnedRetryAt = 0;
  let articlesRetryAt = 0;
  let repostsRetryAt = 0;
  let fullRefreshAt = null;
  let cachedProfile = null;
  let profileRetryAt = 0;
  let profileInFlight = null;
  let refreshCount = 0;
  let pinnedRetryCount = 0;
  let profileRefreshCount = 0;

  function withinFeedBudget(operation) {
    const controller = new AbortController();
    const timeout = new DOMException("Feed refresh timed out", "TimeoutError");
    const timer = setTimeout(() => controller.abort(timeout), refreshTimeoutMs);
    let guardTimer;
    // Give aborted optional lookups one turn to return usable posts, then enforce
    // a hard deadline even if a shared lookup/adapter ignores cancellation.
    const guard = new Promise((_, reject) => {
      guardTimer = setTimeout(() => reject(timeout), refreshTimeoutMs + FEED_ABORT_GRACE_MS);
    });
    return Promise.race([Promise.resolve().then(() => operation(controller.signal)), guard]).finally(() => {
      clearTimeout(timer);
      clearTimeout(guardTimer);
    });
  }

  async function lookupUser() {
    const budget = AbortSignal.timeout(12000);
    async function lookup(mode) {
      const url = new URL(`${X_API}/users/${USER_ID}`);
      url.searchParams.set(
        "user.fields",
        mode === "tweet" ? "name,username,profile_image_url,pinned_tweet_id" : "name,username,profile_image_url",
      );
      if (mode === "post") url.searchParams.set("expansions", "pinned_post_id");
      return getXJson(url, token, fetchImpl, { allowPartialErrors: true, signal: budget, now });
    }
    let json;
    try {
      json = await lookup(userFieldMode);
    } catch (error) {
      if (userFieldMode !== "tweet" || error?.status !== 400) throw error;
      json = await lookup("post");
      userFieldMode = "post";
    }
    const nextUser = json.data;
    if (nextUser?.id !== USER_ID || !/^[A-Za-z0-9_]{1,15}$/.test(nextUser?.username ?? "")) {
      throw new Error("X user unavailable");
    }
    if (!nextUser.pinned_tweet_id && !nextUser.pinned_post_id) {
      const expanded = json.includes?.tweets ?? json.includes?.posts;
      if (Array.isArray(expanded) && expanded.length === 1 && isId(expanded[0]?.id)) {
        nextUser.pinned_tweet_id = expanded[0].id;
      }
    }
    user = nextUser;
    userAt = now();
    return user;
  }

  async function getUser(signal = undefined) {
    if (user && now() - userAt < USER_CACHE_TTL_MS) return user;
    // The feed and the standalone profile route share one account lookup.
    if (!userInFlight)
      userInFlight = lookupUser().finally(() => {
        userInFlight = null;
      });
    return raceWithSignal(userInFlight, signal);
  }

  async function fetchPinnedPost(author, pinnedId, signal = undefined) {
    if (!isId(pinnedId)) return { post: null, status: "none" };
    function lookup(mode, includeArticles = true) {
      const articleFields = includeArticles ? ",article,article_title" : "";
      const url = new URL(`${X_API}/tweets/${pinnedId}`);
      if (mode === "tweet") {
        url.searchParams.set(
          "tweet.fields",
          `created_at,referenced_tweets,author_id,in_reply_to_user_id,note_tweet,attachments,entities${articleFields}`,
        );
        url.searchParams.set("expansions", "attachments.media_keys");
      } else {
        url.searchParams.set("post.fields", `created_at,note_post,attachments,entities${articleFields}`);
        url.searchParams.set("expansions", "attachments.media_keys,author_id");
      }
      url.searchParams.set("media.fields", "media_key,type,url,alt_text,width,height,preview_image_url,variants");
      return getXJson(url, token, fetchImpl, { signal, now });
    }
    async function lookupForMode(includeArticles) {
      try {
        return await lookup(postFieldMode, includeArticles);
      } catch (error) {
        if (postFieldMode !== "tweet" || error?.status !== 400) throw error;
        const json = await lookup("post", includeArticles);
        postFieldMode = "post";
        return json;
      }
    }
    try {
      let json;
      try {
        json = await lookupForMode(true);
      } catch (error) {
        if (error?.status !== 400) throw error;
        json = await lookupForMode(false);
      }
      if (json.data?.id === pinnedId && isArticlePost(json.data)) return { post: null, status: "none" };
      const mediaByKey = new Map(
        (Array.isArray(json.includes?.media) ? json.includes.media : [])
          .filter((media) => typeof media?.media_key === "string")
          .map((media) => [media.media_key, media]),
      );
      const post = normalizedPost(json.data, author, mediaByKey, { allowReferences: true });
      if (!post || post.id !== pinnedId || typeof json.data.created_at !== "string") {
        return { post: null, status: "unavailable" };
      }
      return { post, status: "ok" };
    } catch (error) {
      const old = cached?.pinnedPost;
      const retryAfterMs = retryDelayMs(error);
      if (old?.id === pinnedId && error?.status !== 404) return { post: old, status: "stale", retryAfterMs };
      return { post: null, status: "unavailable", retryAfterMs };
    }
  }

  async function fetchOriginalPosts(author, pinnedId, signal) {
    const found = [];
    const foundArticles = [];
    const foundReposts = [];
    const repostEvents = [];
    const repostPostsById = new Map();
    const repostUsersById = new Map();
    const repostMediaByKey = new Map();
    const permanentlyUnavailableIds = new Set();
    const seen = new Set();
    let nextToken = null;
    let includeArticles = true;
    let articlesAvailable = true;
    let repostsAvailable = true;
    let repostsRetryDelayMs = ERROR_RETRY_MS;
    const fullRefresh =
      !cached ||
      cachedPinnedId !== pinnedId ||
      !["ok", "none"].includes(cached.articlesStatus) ||
      !["ok", "none"].includes(cached.repostsStatus) ||
      fullRefreshAt === null ||
      now() - fullRefreshAt >= FULL_REFRESH_TTL_MS ||
      !newestSeenId;
    let latestId = fullRefresh ? null : newestSeenId;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = new URL(`${X_API}/users/${author.id}/tweets`);
      url.searchParams.set("exclude", "replies");
      // The live X API accepted these Article fields and expansions on 2026-10-17.
      url.searchParams.set(
        "tweet.fields",
        "created_at,referenced_tweets,author_id,in_reply_to_user_id,note_tweet,attachments,entities" +
          (includeArticles ? ",article,article_title" : ""),
      );
      url.searchParams.set(
        "expansions",
        "attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id" +
          (includeArticles ? ",article.cover_media,article.media_entities" : ""),
      );
      url.searchParams.set("user.fields", "name,username,profile_image_url,protected");
      url.searchParams.set("media.fields", "media_key,type,url,alt_text,width,height,preview_image_url,variants");
      url.searchParams.set("max_results", String(PAGE_SIZE));
      if (!fullRefresh) {
        url.searchParams.set("since_id", newestSeenId);
      }
      if (nextToken) url.searchParams.set("pagination_token", nextToken);

      let json;
      try {
        json = await getXJson(url, token, fetchImpl, { allowPartialErrors: true, signal, now });
      } catch (error) {
        // Optional Article fields must not take the existing post feed down if an
        // X API access tier/version rejects them. A fallback is unknown, not empty.
        if (!includeArticles || error?.status !== 400) throw error;
        includeArticles = false;
        articlesAvailable = false;
        url.searchParams.set(
          "tweet.fields",
          "created_at,referenced_tweets,author_id,in_reply_to_user_id,note_tweet,attachments,entities",
        );
        url.searchParams.set(
          "expansions",
          "attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id",
        );
        json = await getXJson(url, token, fetchImpl, { allowPartialErrors: true, signal, now });
      }
      if (json.errors?.length && !Array.isArray(json.data)) throw new Error("X timeline unavailable");
      // Authoritative deleted/protected reference errors skip permanently gone reposts
      // instead of locking the feed into a 60-second full-rescan loop.
      if (json.errors?.length) {
        const { permanentIds, hasTransientError } = classifyXErrors(json.errors);
        for (const id of permanentIds) permanentlyUnavailableIds.add(id);
        if (hasTransientError) repostsAvailable = false;
      }
      if (json.data !== undefined && !Array.isArray(json.data)) {
        throw new Error("Invalid X posts response");
      }
      const pagePosts = json.data ?? [];
      const mediaByKey = new Map(
        (Array.isArray(json.includes?.media) ? json.includes.media : [])
          .filter((media) => typeof media?.media_key === "string")
          .map((media) => [media.media_key, media]),
      );
      const postsById = new Map((json.includes?.tweets ?? json.includes?.posts ?? []).map((post) => [post.id, post]));
      const usersById = new Map((json.includes?.users ?? []).map((user) => [user.id, user]));
      for (const [id, post] of postsById) repostPostsById.set(id, post);
      for (const [id, user] of usersById) repostUsersById.set(id, user);
      for (const [key, media] of mediaByKey) repostMediaByKey.set(key, media);
      // A missing requested field can mean X ignored an older/newer field name.
      // Do not label posts as original when quote metadata may also be missing.
      if (pagePosts.some((post) => typeof post.created_at !== "string" || !isId(post.author_id))) {
        throw new Error("X posts are missing requested fields");
      }
      if (page === 0 && isId(json.meta?.newest_id ?? pagePosts[0]?.id)) {
        latestId = json.meta?.newest_id ?? pagePosts[0].id;
      }
      for (const post of pagePosts) {
        const isRepost = (post.referenced_tweets ?? post.referenced_posts ?? []).some(
          (reference) => reference.type === "retweeted",
        );
        if (isRepost && post.author_id === author.id) {
          if (!post.in_reply_to_user_id) repostEvents.push(post);
          continue;
        }
        if (isArticlePost(post)) {
          const article = normalizedArticle(post, author, mediaByKey);
          if (article) foundArticles.push(article);
          else if (
            post.author_id === author.id &&
            !post.in_reply_to_user_id &&
            !post.referenced_tweets?.length &&
            !post.referenced_posts?.length
          )
            articlesAvailable = false;
          continue;
        }
        const original = post.id === pinnedId ? null : normalizedPost(post, author, mediaByKey);
        if (original && !seen.has(original.id)) {
          seen.add(original.id);
          found.push(original);
        }
      }
      const tokenForNextPage = json.meta?.next_token;
      if (!tokenForNextPage) break;
      if (tokenForNextPage === nextToken) throw new Error("X posts pagination did not advance");
      if (page === MAX_PAGES - 1) break;
      nextToken = tokenForNextPage;
    }

    // Timeline reference expansions omit media on some originals. Resolve their
    // canonical details in deduplicated batches so text-only expansions cannot
    // silently turn illustrated reposts into text-only cards.
    const referenceOf = (event) =>
      (event.referenced_tweets ?? event.referenced_posts ?? []).find((reference) => reference.type === "retweeted");
    const originalIds = [
      ...new Set(
        repostEvents
          .map((event) => referenceOf(event)?.id)
          .filter((id) => isId(id) && !permanentlyUnavailableIds.has(id)),
      ),
    ];
    const verifiedOriginals = new Set();
    for (let start = 0; start < originalIds.length; start += PAGE_SIZE) {
      const ids = originalIds.slice(start, start + PAGE_SIZE);
      const url = new URL(`${X_API}/tweets`);
      url.searchParams.set("ids", ids.join(","));
      url.searchParams.set(
        "tweet.fields",
        "created_at,author_id,referenced_tweets,in_reply_to_user_id,note_tweet,attachments,entities",
      );
      url.searchParams.set("expansions", "attachments.media_keys,author_id");
      url.searchParams.set("user.fields", "name,username,profile_image_url,protected");
      url.searchParams.set("media.fields", "media_key,type,url,alt_text,width,height,preview_image_url,variants");
      try {
        const json = await getXJson(url, token, fetchImpl, { allowPartialErrors: true, signal, now });
        if (json.errors?.length) {
          const { permanentIds, hasTransientError } = classifyXErrors(json.errors);
          for (const id of permanentIds) permanentlyUnavailableIds.add(id);
          if (hasTransientError) repostsAvailable = false;
        }
        if (!Array.isArray(json.data)) {
          if (!ids.every((id) => permanentlyUnavailableIds.has(id))) throw new Error("X repost details unavailable");
          continue;
        }
        for (const post of json.data) {
          if (!ids.includes(post.id)) continue;
          repostPostsById.set(post.id, post);
          verifiedOriginals.add(post.id);
        }
        for (const user of json.includes?.users ?? []) repostUsersById.set(user.id, user);
        for (const media of json.includes?.media ?? []) repostMediaByKey.set(media.media_key, media);
      } catch (error) {
        // Keep available originals and their last verified media during an outage.
        repostsAvailable = false;
        repostsRetryDelayMs = Math.max(repostsRetryDelayMs, retryDelayMs(error));
      }
    }
    for (const event of repostEvents) {
      const id = referenceOf(event)?.id;
      const original = repostPostsById.get(id);
      const permanentlyGone =
        permanentlyUnavailableIds.has(id) || (original?.author_id && permanentlyUnavailableIds.has(original.author_id));
      const verified = verifiedOriginals.has(id);
      if (!verified && permanentlyGone) continue;
      const old = cached?.reposts?.find((post) => post.id === id);
      if (!verified) repostsAvailable = false;
      const repost =
        !verified && old
          ? { ...old, repostId: event.id, repostedAt: event.created_at }
          : normalizedRepost(event, author, repostPostsById, repostUsersById, repostMediaByKey);
      if (repost) foundReposts.push(repost);
      else if (!permanentlyGone) repostsAvailable = false;
    }

    const unique = [];
    const ids = new Set();
    for (const post of [...found, ...(fullRefresh ? [] : (cached?.posts ?? []))]) {
      if (post.id === pinnedId) continue;
      if (!ids.has(post.id)) {
        ids.add(post.id);
        unique.push(post);
      }
    }
    const articles = await enrichArticleDocuments(
      mergeArticles(foundArticles, articlesAvailable && fullRefresh ? [] : (cached?.articles ?? [])),
      cached?.articles,
      articleFetchImpl,
      {
        articleCache,
        defer,
        now,
        revalidateMs: articleRevalidateMs,
        signal,
        onEvent,
      },
    );
    const articlesStatus = articlesAvailable
      ? articles.length
        ? "ok"
        : "none"
      : articles.length
        ? "stale"
        : "unavailable";
    const repostsById = new Map();
    for (const post of [...foundReposts, ...(repostsAvailable && fullRefresh ? [] : (cached?.reposts ?? []))]) {
      if (!repostsById.has(post.id)) repostsById.set(post.id, post);
    }
    const reposts = [...repostsById.values()].sort((left, right) => {
      const byDate = (Date.parse(right.repostedAt) || 0) - (Date.parse(left.repostedAt) || 0);
      return byDate || right.repostId.length - left.repostId.length || right.repostId.localeCompare(left.repostId);
    });
    const repostsStatus = repostsAvailable
      ? reposts.length
        ? "ok"
        : "none"
      : reposts.length
        ? "stale"
        : "unavailable";
    return {
      posts: unique,
      articles,
      articlesStatus,
      reposts,
      repostsStatus,
      repostsRetryDelayMs,
      latestId,
      fullRefresh,
    };
  }

  async function fetchFeed(signal) {
    const author = await getUser(signal);
    signal.throwIfAborted();
    const pinnedId = author.pinned_tweet_id ?? author.pinned_post_id ?? null;
    const [
      { posts, articles, articlesStatus, reposts, repostsStatus, repostsRetryDelayMs, latestId, fullRefresh },
      pinned,
    ] = await Promise.all([fetchOriginalPosts(author, pinnedId, signal), fetchPinnedPost(author, pinnedId, signal)]);
    return {
      result: {
        status: "ok",
        posts,
        articles,
        articlesStatus,
        reposts,
        repostsStatus,
        // The timeline can identify an Article even when a compatibility detail
        // response omitted optional Article fields. Never turn it into a link card.
        pinnedPost: articles.some((article) => article.id === pinnedId) ? null : pinned.post,
        pinnedStatus: articles.some((article) => article.id === pinnedId) ? "none" : pinned.status,
      },
      latestId,
      pinnedId,
      author,
      fullRefresh,
      pinnedRetryDelayMs: pinned.retryAfterMs ?? ERROR_RETRY_MS,
      repostsRetryDelayMs,
    };
  }

  async function getProfile() {
    if (!token?.trim()) {
      emit({ type: "x_profile", outcome: "unavailable", reason: "missing_token", refreshCount: profileRefreshCount });
      return { status: "unavailable" };
    }
    function lastKnown() {
      // Keep the last successful profile, but never report it as a fresh success.
      return cachedProfile ? { ...cachedProfile, status: "stale" } : { status: "unavailable" };
    }
    if (now() < profileRetryAt) {
      const fallback = lastKnown();
      emit({
        type: "x_profile",
        outcome: "backoff_cached",
        status: fallback.status,
        refreshCount: profileRefreshCount,
        durationMs: 0,
      });
      return fallback;
    }
    // Concurrent profile calls share one lookup instead of one upstream request each.
    if (!profileInFlight) {
      profileInFlight = (async () => {
        const startedAt = now();
        const wasUserCached = Boolean(user && startedAt - userAt < USER_CACHE_TTL_MS && cachedProfile);
        if (!wasUserCached) profileRefreshCount += 1;
        try {
          const current = await getUser();
          cachedProfile = {
            status: "ok",
            profile: {
              name: current.name || current.username,
              username: current.username,
              avatar: safeAvatar(current.profile_image_url),
            },
          };
          profileRetryAt = 0;
          emit({
            type: "x_profile",
            outcome: wasUserCached ? "memory_hit" : "refresh",
            status: "ok",
            refreshCount: profileRefreshCount,
            durationMs: Math.max(0, now() - startedAt),
          });
          return cachedProfile;
        } catch (error) {
          // A short failure backoff stops a burst of failed lookups from repeating.
          profileRetryAt = now() + retryDelayMs(error);
          const fallback = lastKnown();
          emit({
            type: "x_profile",
            outcome: fallback.status === "stale" ? "stale_fallback" : "unavailable",
            reason: "upstream_error",
            status: fallback.status,
            refreshCount: profileRefreshCount,
            durationMs: Math.max(0, now() - startedAt),
          });
          return fallback;
        } finally {
          profileInFlight = null;
        }
      })();
    }
    return profileInFlight;
  }

  async function getFeed() {
    if (!token?.trim()) {
      emit({ type: "x_feed", outcome: "unavailable", reason: "missing_token", refreshCount });
      return unavailable();
    }
    if (inFlight) return inFlight;
    if (cached && now() - cachedAt < CACHE_TTL_MS) {
      const retryArticles = !["ok", "none"].includes(cached.articlesStatus) && now() >= articlesRetryAt;
      const retryReposts = !["ok", "none"].includes(cached.repostsStatus) && now() >= repostsRetryAt;
      if (!retryArticles && !retryReposts) {
        if (["ok", "none"].includes(cached.pinnedStatus) || now() < pinnedRetryAt) {
          emit({
            type: "x_feed",
            outcome: "memory_hit",
            refreshCount,
            durationMs: 0,
            status: cached.status,
            pinnedStatus: cached.pinnedStatus,
            articlesStatus: cached.articlesStatus,
          });
          return cached;
        }
        // Retry only the failed pin. Keep the timeline's original freshness timestamp
        // and author/pin pair, even if the standalone profile lookup has since changed.
        const pinStartedAt = now();
        pinnedRetryCount += 1;
        inFlight = withinFeedBudget((signal) => fetchPinnedPost(cachedAuthor, cachedPinnedId, signal))
          .catch(() => ({
            post: cached.pinnedPost ?? null,
            status: cached.pinnedPost ? "stale" : "unavailable",
          }))
          .then((pinned) => {
            cached = { ...cached, pinnedPost: pinned.post, pinnedStatus: pinned.status };
            pinnedRetryAt = ["ok", "none"].includes(pinned.status)
              ? 0
              : now() + (pinned.retryAfterMs ?? ERROR_RETRY_MS);
            emit({
              type: "x_feed",
              outcome: "pinned_retry",
              refreshCount,
              pinnedRetryCount,
              durationMs: Math.max(0, now() - pinStartedAt),
              status: cached.status,
              pinnedStatus: pinned.status,
              articlesStatus: cached.articlesStatus,
            });
            return cached;
          })
          .finally(() => {
            inFlight = null;
          });
        return inFlight;
      }
    }
    function lastKnown() {
      return cached
        ? {
            ...cached,
            status: "stale",
            pinnedStatus: cached.pinnedPost ? "stale" : cached.pinnedStatus,
            articlesStatus: cached.articles.length ? "stale" : "unavailable",
            repostsStatus: cached.reposts.length ? "stale" : "unavailable",
          }
        : unavailable();
    }
    if (now() < retryAt) {
      const fallback = lastKnown();
      emit({
        type: "x_feed",
        outcome: "backoff_cached",
        refreshCount,
        durationMs: 0,
        status: fallback.status,
      });
      return fallback;
    }
    const refreshStartedAt = now();
    refreshCount += 1;
    inFlight = withinFeedBudget(fetchFeed)
      .then(({ result, latestId, pinnedId, author, fullRefresh, pinnedRetryDelayMs, repostsRetryDelayMs }) => {
        cached = result;
        cachedAt = now();
        newestSeenId = latestId;
        cachedPinnedId = pinnedId;
        cachedAuthor = author;
        pinnedRetryAt = ["ok", "none"].includes(result.pinnedStatus) ? 0 : cachedAt + pinnedRetryDelayMs;
        articlesRetryAt = ["ok", "none"].includes(result.articlesStatus) ? 0 : cachedAt + ERROR_RETRY_MS;
        repostsRetryAt = ["ok", "none"].includes(result.repostsStatus) ? 0 : cachedAt + repostsRetryDelayMs;
        if (fullRefresh) fullRefreshAt = cachedAt;
        retryAt = 0;
        emit({
          type: "x_feed",
          outcome: fullRefresh ? "full_refresh" : "incremental_refresh",
          refreshCount,
          durationMs: Math.max(0, cachedAt - refreshStartedAt),
          status: result.status,
          pinnedStatus: result.pinnedStatus,
          articlesStatus: result.articlesStatus,
        });
        return result;
      })
      .catch((error) => {
        const failedAt = now();
        retryAt = failedAt + retryDelayMs(error);
        articlesRetryAt = retryAt;
        repostsRetryAt = retryAt;
        // A retry for partial Article data may fail while ordinary posts are still
        // fresh. Retain that successful response without renewing its freshness.
        const fallback = cached && failedAt - cachedAt < CACHE_TTL_MS ? cached : lastKnown();
        emit({
          type: "x_feed",
          outcome: fallback.status === "unavailable" ? "unavailable" : "stale_fallback",
          reason: "upstream_error",
          refreshCount,
          durationMs: Math.max(0, failedAt - refreshStartedAt),
          status: fallback.status,
        });
        return fallback;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }
  getFeed.getProfile = getProfile;
  return getFeed;
}
