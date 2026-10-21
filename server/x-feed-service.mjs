// Reads the account's profile, pinned post, original posts and Articles from the X API, with an
// in-memory cache, incremental refreshes and a failure backoff. Shared by every runtime
// through server/api-handler.mjs.
import { mediaDimensions, parseMediaSource } from "../shared/media-sources.mjs";
import { normalizedArticleLinks } from "../shared/article-links.mjs";
import { enrichArticleDocuments } from "./x-article-document.mjs";
import { X_USER_ID as USER_ID, X_USERNAME as USERNAME } from "../shared/x-account.mjs";

const X_API = "https://api.x.com/2";
const CACHE_TTL_MS = 15 * 60 * 1000;
const FULL_REFRESH_TTL_MS = 24 * 60 * 60 * 1000;
const USER_CACHE_TTL_MS = CACHE_TTL_MS;
const ERROR_RETRY_MS = 60 * 1000;
const PAGE_SIZE = 100;
const MAX_PAGES = 32;

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
  const result = text.replace(/https:\/\/t\.co\/[A-Za-z0-9]+/g, (link) => replacements.get(link) ?? link);
  return media.length ? result.trimEnd() : result;
}

async function getXJson(url, token, fetchImpl, { allowPartialErrors = false } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error(`X API returned ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const json = await response.json();
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
    } else if (media?.type === "video") {
      const variants = Array.isArray(media.variants) ? media.variants : [];
      const videoVariants = variants.filter(
        (variant) => variant?.content_type === "video/mp4" && safeVideoUrl(variant.url),
      );
      videoVariants.sort((left, right) => (Number(right.bit_rate) || 0) - (Number(left.bit_rate) || 0));
      const url = videoVariants[0] ? safeVideoUrl(videoVariants[0].url) : null;
      const poster = safePhotoUrl(media.preview_image_url);
      if (url)
        mediaItems.push({ type: "video", url, ...(poster ? { poster } : {}), alt, ...(mediaDimensions(media) ?? {}) });
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
  const text = normalizedPostText(
    post.note_tweet?.text || post.note_post?.text || post.text,
    post,
    mediaItems,
    user.username,
  );
  if (!text.trim() && mediaItems.length === 0) return null;
  return {
    id: post.id,
    text,
    created_at: post.created_at ?? null,
    author: user.name || USERNAME,
    avatar: safeAvatar(user.profile_image_url),
    permalink: `https://x.com/${user.username}/status/${post.id}`,
    ...(mediaItems.length ? { media: mediaItems } : {}),
  };
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
  now = Date.now,
} = {}) {
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
  let fullRefreshAt = null;
  let cachedProfile = null;
  let profileRetryAt = 0;
  let profileInFlight = null;

  async function lookupUser() {
    async function lookup(mode) {
      const url = new URL(`${X_API}/users/${USER_ID}`);
      url.searchParams.set(
        "user.fields",
        mode === "tweet" ? "name,username,profile_image_url,pinned_tweet_id" : "name,username,profile_image_url",
      );
      if (mode === "post") url.searchParams.set("expansions", "pinned_post_id");
      return getXJson(url, token, fetchImpl, { allowPartialErrors: true });
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

  async function getUser() {
    if (user && now() - userAt < USER_CACHE_TTL_MS) return user;
    // The feed and the standalone profile route share one account lookup.
    if (!userInFlight)
      userInFlight = lookupUser().finally(() => {
        userInFlight = null;
      });
    return userInFlight;
  }

  async function fetchPinnedPost(author, pinnedId) {
    if (!isId(pinnedId)) return { post: null, status: "none" };
    function lookup(mode) {
      const url = new URL(`${X_API}/tweets/${pinnedId}`);
      if (mode === "tweet") {
        url.searchParams.set(
          "tweet.fields",
          "created_at,referenced_tweets,author_id,in_reply_to_user_id,note_tweet,attachments,entities,article,article_title",
        );
        url.searchParams.set("expansions", "attachments.media_keys");
      } else {
        url.searchParams.set("post.fields", "created_at,note_post,attachments,entities,article,article_title");
        url.searchParams.set("expansions", "attachments.media_keys,author_id");
      }
      url.searchParams.set("media.fields", "media_key,type,url,alt_text,width,height,preview_image_url,variants");
      return getXJson(url, token, fetchImpl);
    }
    try {
      let json;
      try {
        json = await lookup(postFieldMode);
      } catch (error) {
        if (postFieldMode !== "tweet" || error?.status !== 400) throw error;
        json = await lookup("post");
        postFieldMode = "post";
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
      if (old?.id === pinnedId && error?.status !== 404) return { post: old, status: "stale" };
      return { post: null, status: "unavailable" };
    }
  }

  async function fetchOriginalPosts(author, pinnedId) {
    const found = [];
    const foundArticles = [];
    const seen = new Set();
    let nextToken = null;
    let includeArticles = true;
    let articlesAvailable = true;
    const fullRefresh =
      !cached ||
      cachedPinnedId !== pinnedId ||
      !["ok", "none"].includes(cached.articlesStatus) ||
      fullRefreshAt === null ||
      now() - fullRefreshAt >= FULL_REFRESH_TTL_MS ||
      !newestSeenId;
    let latestId = fullRefresh ? null : newestSeenId;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = new URL(`${X_API}/users/${author.id}/tweets`);
      url.searchParams.set("exclude", "replies,retweets");
      // The live X API accepted these Article fields and expansions on 2026-10-17.
      url.searchParams.set(
        "tweet.fields",
        "created_at,referenced_tweets,author_id,in_reply_to_user_id,note_tweet,attachments,entities" +
          (includeArticles ? ",article,article_title" : ""),
      );
      url.searchParams.set(
        "expansions",
        "attachments.media_keys" + (includeArticles ? ",article.cover_media,article.media_entities" : ""),
      );
      url.searchParams.set("media.fields", "media_key,type,url,alt_text,width,height,preview_image_url,variants");
      url.searchParams.set("max_results", String(PAGE_SIZE));
      if (!fullRefresh) {
        url.searchParams.set("since_id", newestSeenId);
      }
      if (nextToken) url.searchParams.set("pagination_token", nextToken);

      let json;
      try {
        json = await getXJson(url, token, fetchImpl);
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
        url.searchParams.set("expansions", "attachments.media_keys");
        json = await getXJson(url, token, fetchImpl);
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
      // A missing requested field can mean X ignored an older/newer field name.
      // Do not label posts as original when quote metadata may also be missing.
      if (pagePosts.some((post) => typeof post.created_at !== "string" || !isId(post.author_id))) {
        throw new Error("X posts are missing requested fields");
      }
      if (page === 0 && isId(json.meta?.newest_id ?? pagePosts[0]?.id)) {
        latestId = json.meta?.newest_id ?? pagePosts[0].id;
      }
      for (const post of pagePosts) {
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
      if (page === MAX_PAGES - 1) throw new Error("X posts exceed the supported timeline window");
      nextToken = tokenForNextPage;
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
    );
    const articlesStatus = articlesAvailable
      ? articles.length
        ? "ok"
        : "none"
      : articles.length
        ? "stale"
        : "unavailable";
    return { posts: unique, articles, articlesStatus, latestId, fullRefresh };
  }

  async function fetchFeed() {
    const author = await getUser();
    const pinnedId = author.pinned_tweet_id ?? author.pinned_post_id ?? null;
    const [{ posts, articles, articlesStatus, latestId, fullRefresh }, pinned] = await Promise.all([
      fetchOriginalPosts(author, pinnedId),
      fetchPinnedPost(author, pinnedId),
    ]);
    return {
      result: {
        status: "ok",
        posts,
        articles,
        articlesStatus,
        // The timeline can identify an Article even when a compatibility detail
        // response omitted optional Article fields. Never turn it into a link card.
        pinnedPost: articles.some((article) => article.id === pinnedId) ? null : pinned.post,
        pinnedStatus: articles.some((article) => article.id === pinnedId) ? "none" : pinned.status,
      },
      latestId,
      pinnedId,
      author,
      fullRefresh,
    };
  }

  async function getProfile() {
    if (!token?.trim()) return { status: "unavailable" };
    function lastKnown() {
      // Keep the last successful profile, but never report it as a fresh success.
      return cachedProfile ? { ...cachedProfile, status: "stale" } : { status: "unavailable" };
    }
    if (now() < profileRetryAt) return lastKnown();
    // Concurrent profile calls share one lookup instead of one upstream request each.
    if (!profileInFlight) {
      profileInFlight = (async () => {
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
          return cachedProfile;
        } catch {
          // A short failure backoff stops a burst of failed lookups from repeating.
          profileRetryAt = now() + ERROR_RETRY_MS;
          return lastKnown();
        } finally {
          profileInFlight = null;
        }
      })();
    }
    return profileInFlight;
  }

  async function getFeed() {
    if (!token?.trim()) return unavailable();
    if (inFlight) return inFlight;
    if (cached && now() - cachedAt < CACHE_TTL_MS) {
      const retryArticles = !["ok", "none"].includes(cached.articlesStatus) && now() >= articlesRetryAt;
      if (!retryArticles) {
        if (["ok", "none"].includes(cached.pinnedStatus) || now() < pinnedRetryAt) return cached;
        // Retry only the failed pin. Keep the timeline's original freshness timestamp
        // and author/pin pair, even if the standalone profile lookup has since changed.
        inFlight = fetchPinnedPost(cachedAuthor, cachedPinnedId)
          .then((pinned) => {
            cached = { ...cached, pinnedPost: pinned.post, pinnedStatus: pinned.status };
            pinnedRetryAt = ["ok", "none"].includes(pinned.status) ? 0 : now() + ERROR_RETRY_MS;
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
          }
        : unavailable();
    }
    if (now() < retryAt) return lastKnown();
    inFlight = fetchFeed()
      .then(({ result, latestId, pinnedId, author, fullRefresh }) => {
        cached = result;
        cachedAt = now();
        newestSeenId = latestId;
        cachedPinnedId = pinnedId;
        cachedAuthor = author;
        pinnedRetryAt = ["ok", "none"].includes(result.pinnedStatus) ? 0 : cachedAt + ERROR_RETRY_MS;
        articlesRetryAt = ["ok", "none"].includes(result.articlesStatus) ? 0 : cachedAt + ERROR_RETRY_MS;
        if (fullRefresh) fullRefreshAt = cachedAt;
        retryAt = 0;
        return result;
      })
      .catch(() => {
        retryAt = now() + ERROR_RETRY_MS;
        articlesRetryAt = retryAt;
        // A retry for partial Article data may fail while ordinary posts are still
        // fresh. Retain that successful response without renewing its freshness.
        if (cached && now() - cachedAt < CACHE_TTL_MS) return cached;
        return lastKnown();
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }
  getFeed.getProfile = getProfile;
  return getFeed;
}
