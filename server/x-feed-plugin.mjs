import { proxyXMedia } from "./x-media.mjs";

const USERNAME = "loveyong07";
const USER_ID = "2061726102180311040";
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

function safePhotoUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "pbs.twimg.com" && url.pathname.startsWith("/media/")
      ? url.href : null;
  } catch {
    return null;
  }
}

function isPhotoLinkForPost(entity, postId, photoCount, username) {
  if (!/^https:\/\/t\.co\/[A-Za-z0-9]+$/.test(entity?.url ?? "")) return false;
  try {
    const expanded = new URL(entity.expanded_url);
    if (expanded.protocol !== "https:" || !["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(expanded.hostname)) return false;
    const parts = expanded.pathname.split("/").filter(Boolean);
    return parts.length === 5 && parts[0].toLowerCase() === username.toLowerCase() && parts[1] === "status"
      && parts[2] === postId && parts[3] === "photo"
      && /^\d+$/.test(parts[4]) && Number(parts[4]) <= photoCount;
  } catch {
    return false;
  }
}

function withoutPhotoLinks(text, post, photoCount, username) {
  if (!photoCount) return text;
  const entities = [
    ...(Array.isArray(post.entities?.urls) ? post.entities.urls : []),
    ...(Array.isArray(post.note_tweet?.entities?.urls) ? post.note_tweet.entities.urls : []),
    ...(Array.isArray(post.note_post?.entities?.urls) ? post.note_post.entities.urls : []),
  ];
  const mediaLinks = new Set(entities.filter((entity) => isPhotoLinkForPost(entity, post.id, photoCount, username)).map((entity) => entity.url));
  for (const link of mediaLinks) text = text.replaceAll(link, "");
  return text.trimEnd();
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

function normalizedPost(post, user, mediaByKey, { allowReferences = false } = {}) {
  if (!isId(post?.id) || typeof post.text !== "string") return null;
  if (post.author_id && post.author_id !== user.id) return null;
  if (allowReferences && post.author_id !== user.id) return null;
  if (!allowReferences && (post.in_reply_to_user_id || post.referenced_tweets?.length || post.referenced_posts?.length)) return null;
  const photos = [];
  const usedKeys = new Set();
  for (const key of Array.isArray(post.attachments?.media_keys) ? post.attachments.media_keys : []) {
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    const media = mediaByKey.get(key);
    const url = media?.type === "photo" ? safePhotoUrl(media.url) : null;
    if (url) photos.push({ url, alt: typeof media.alt_text === "string" ? media.alt_text.trim() : "" });
  }
  const text = withoutPhotoLinks(post.note_tweet?.text || post.note_post?.text || post.text, post, photos.length, user.username);
  if (!text.trim() && photos.length === 0) return null;
  return {
    id: post.id,
    text,
    created_at: post.created_at ?? null,
    author: user.name || USERNAME,
    avatar: safeAvatar(user.profile_image_url),
    permalink: `https://x.com/${user.username}/status/${post.id}`,
    ...(photos.length ? { media: photos } : {}),
  };
}

export function createXFeedService({
  token = globalThis.process?.env?.X_BEARER_TOKEN ?? "",
  fetchImpl = globalThis.fetch,
  now = Date.now,
} = {}) {
  let user = null;
  let userAt = 0;
  let cached = null;
  let cachedAt = 0;
  let newestSeenId = null;
  let retryAt = 0;
  let inFlight = null;
  let userFieldMode = "tweet";
  let postFieldMode = "tweet";
  let cachedPinnedId = null;
  let fullRefreshAt = null;

  async function getUser() {
    if (user && now() - userAt < USER_CACHE_TTL_MS) return user;
    async function lookup(mode) {
      const url = new URL(`${X_API}/users/${USER_ID}`);
      url.searchParams.set("user.fields", mode === "tweet"
        ? "name,username,profile_image_url,pinned_tweet_id"
        : "name,username,profile_image_url");
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

  async function fetchPinnedPost(author, pinnedId) {
    if (!isId(pinnedId)) return { post: null, status: "none" };
    function lookup(mode) {
      const url = new URL(`${X_API}/tweets/${pinnedId}`);
      if (mode === "tweet") {
        url.searchParams.set("tweet.fields", "created_at,referenced_tweets,author_id,in_reply_to_user_id,note_tweet,attachments,entities");
        url.searchParams.set("expansions", "attachments.media_keys");
      } else {
        url.searchParams.set("post.fields", "created_at,note_post,attachments,entities");
        url.searchParams.set("expansions", "attachments.media_keys,author_id");
      }
      url.searchParams.set("media.fields", "media_key,type,url,alt_text,width,height");
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
    const seen = new Set();
    let nextToken = null;
    const fullRefresh = !cached || cachedPinnedId !== pinnedId || fullRefreshAt === null
      || now() - fullRefreshAt >= FULL_REFRESH_TTL_MS || !newestSeenId;
    let latestId = fullRefresh ? null : newestSeenId;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = new URL(`${X_API}/users/${author.id}/tweets`);
      url.searchParams.set("exclude", "replies,retweets");
      // The live X API accepted tweet.fields for this endpoint on 2026-09-26.
      url.searchParams.set("tweet.fields", "created_at,referenced_tweets,author_id,in_reply_to_user_id,note_tweet,attachments,entities");
      url.searchParams.set("expansions", "attachments.media_keys");
      url.searchParams.set("media.fields", "media_key,type,url,alt_text,width,height");
      url.searchParams.set("max_results", String(PAGE_SIZE));
      if (!fullRefresh) {
        url.searchParams.set("since_id", newestSeenId);
      }
      if (nextToken) url.searchParams.set("pagination_token", nextToken);

      const json = await getXJson(url, token, fetchImpl);
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
    for (const post of [...found, ...(fullRefresh ? [] : cached?.posts ?? [])]) {
      if (post.id === pinnedId) continue;
      if (!ids.has(post.id)) {
        ids.add(post.id);
        unique.push(post);
      }
    }
    return { posts: unique, latestId, fullRefresh };
  }

  async function fetchFeed() {
    const author = await getUser();
    const pinnedId = author.pinned_tweet_id ?? author.pinned_post_id ?? null;
    const [{ posts, latestId, fullRefresh }, pinned] = await Promise.all([
      fetchOriginalPosts(author, pinnedId),
      fetchPinnedPost(author, pinnedId),
    ]);
    return {
      result: { status: "ok", posts, pinnedPost: pinned.post, pinnedStatus: pinned.status },
      latestId,
      pinnedId,
      fullRefresh,
    };
  }

  async function getProfile() {
    if (!token?.trim()) return { status: "unavailable" };
    try {
      const current = await getUser();
      return { status: "ok", profile: {
        name: current.name || current.username,
        username: current.username,
        avatar: safeAvatar(current.profile_image_url),
      } };
    } catch {
      return { status: "unavailable" };
    }
  }

  async function getFeed() {
    if (!token?.trim()) return unavailable();
    if (cached && now() - cachedAt < CACHE_TTL_MS) return cached;
    if (now() < retryAt) return cached ? { ...cached, status: "stale", pinnedStatus: cached.pinnedPost ? "stale" : cached.pinnedStatus } : unavailable();
    if (inFlight) return inFlight;

    inFlight = fetchFeed()
      .then(({ result, latestId, pinnedId, fullRefresh }) => {
        cached = result;
        cachedAt = now();
        newestSeenId = latestId;
        cachedPinnedId = pinnedId;
        if (fullRefresh) fullRefreshAt = cachedAt;
        retryAt = 0;
        return result;
      })
      .catch(() => {
        retryAt = now() + ERROR_RETRY_MS;
        return cached ? { ...cached, status: "stale", pinnedStatus: cached.pinnedPost ? "stale" : cached.pinnedStatus } : unavailable();
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }
  getFeed.getProfile = getProfile;
  return getFeed;
}

export function xFeedPlugin(options = {}) {
  const getFeed = createXFeedService(options);
  function installMiddleware(server) {
    server.middlewares.use("/api/x-media", async (request, response) => {
      if (request.url?.split("?")[0] !== "/") {
        response.statusCode = 404;
        response.end("Not found");
        return;
      }
      const proxyResponse = await proxyXMedia(new Request(new URL(request.url ?? "/", "http://localhost"), {
        method: request.method,
      }));
      response.statusCode = proxyResponse.status;
      for (const [name, value] of proxyResponse.headers) response.setHeader(name, value);
      response.end(Buffer.from(await proxyResponse.arrayBuffer()));
    });

    for (const route of ["/api/x-posts", "/api/x-profile"]) server.middlewares.use(route, async (request, response) => {
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        if (request.method !== "GET") {
          response.statusCode = 405;
          response.setHeader("Allow", "GET");
          response.end(JSON.stringify({ status: "method_not_allowed", posts: [] }));
          return;
        }
        if (request.url?.split("?")[0] !== "/") {
          response.statusCode = 404;
          response.end(JSON.stringify(unavailable()));
          return;
        }
        response.end(JSON.stringify(route === "/api/x-profile" ? await getFeed.getProfile() : await getFeed()));
    });
  }
  return {
    name: "local-x-original-posts",
    configureServer: installMiddleware,
    configurePreviewServer: installMiddleware,
  };
}
