// Reads the account's profile, pinned post, originals, reposts and Articles from the X API, with an
// in-memory cache, incremental refreshes and a failure backoff. Shared by every runtime
// through server/api-handler.mjs.
import { ARTICLE_REVALIDATE_TTL_MS, enrichArticleDocuments } from "./x-article-document.mjs";
import { createTelemetryEmitter } from "./telemetry.mjs";
import { X_USER_ID as USER_ID } from "../shared/x-account.mjs";
import { FEED_REFRESH_TIMEOUT_MS, FEED_ABORT_GRACE_MS } from "../shared/request-budgets.mjs";
import {
  ERROR_RETRY_MS,
  MAX_PAGES,
  PAGE_SIZE,
  buildXTimelineUrl,
  classifyXErrors,
  fetchXPinnedPostLookup,
  fetchXPostDetails,
  fetchXUser,
  getXJson,
  isId,
  raceWithSignal,
  retryDelayMs,
} from "./x-api-client.mjs";
import {
  isArticlePost,
  mergeArticles,
  normalizedArticle,
  normalizedPost,
  normalizedQuoteTarget,
  normalizedRepost,
  normalizedSelfQuote,
  safeAvatar,
  sortReposts,
} from "./x-post-normalizer.mjs";

const CACHE_TTL_MS = 15 * 60 * 1000;
const FULL_REFRESH_TTL_MS = 24 * 60 * 60 * 1000;
const USER_CACHE_TTL_MS = CACHE_TTL_MS;
const SCHEDULED_USER_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const unavailable = () => ({ status: "unavailable", posts: [] });

/** @typedef {import("../shared/contracts.mjs").XFeedCheckpoint} XFeedCheckpoint */

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
  resumeFrom = /** @type {XFeedCheckpoint | null | undefined} */ (undefined),
} = {}) {
  const emit = createTelemetryEmitter(onEvent);
  const userCacheTtl = resumeFrom === undefined ? USER_CACHE_TTL_MS : SCHEDULED_USER_CACHE_TTL_MS;
  let user = resumeFrom?.author ?? null;
  let userAt = resumeFrom?.authorAt ?? 0;
  let userInFlight = null;
  let cached = resumeFrom?.feed ?? null;
  let cachedAt = 0;
  let newestSeenId = resumeFrom?.newestSeenId ?? null;
  let retryAt = 0;
  let inFlight = null;
  let userFieldMode = resumeFrom?.userFieldMode ?? "tweet";
  let postFieldMode = resumeFrom?.postFieldMode ?? "tweet";
  let cachedPinnedId = resumeFrom?.pinnedId ?? null;
  let cachedAuthor = resumeFrom?.author ?? null;
  let pinnedRetryAt = 0;
  let articlesRetryAt = 0;
  let repostsRetryAt = 0;
  let fullRefreshAt = resumeFrom?.fullRefreshAt ?? null;
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
    let json;
    try {
      json = await fetchXUser(USER_ID, userFieldMode, token, fetchImpl, budget, now);
    } catch (error) {
      if (userFieldMode !== "tweet" || error?.status !== 400) throw error;
      json = await fetchXUser(USER_ID, "post", token, fetchImpl, budget, now);
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
    if (user && now() - userAt < userCacheTtl) return user;
    // The feed and the standalone profile route share one account lookup.
    if (!userInFlight)
      userInFlight = lookupUser().finally(() => {
        userInFlight = null;
      });
    return raceWithSignal(userInFlight, signal);
  }

  function fetchPostDetails(ids, signal) {
    return fetchXPostDetails(ids, token, fetchImpl, signal, now);
  }

  async function fetchPinnedPost(author, pinnedId, signal = undefined) {
    if (!isId(pinnedId)) return { post: null, status: "none" };
    async function lookupForMode(includeArticles) {
      try {
        return await fetchXPinnedPostLookup(pinnedId, postFieldMode, includeArticles, token, fetchImpl, signal, now);
      } catch (error) {
        if (postFieldMode !== "tweet" || error?.status !== 400) throw error;
        const json = await fetchXPinnedPostLookup(pinnedId, "post", includeArticles, token, fetchImpl, signal, now);
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
      const references = json.data?.referenced_tweets ?? json.data?.referenced_posts ?? [];
      const isQuote = references.some((ref) => ref.type === "quoted");
      const postsById = new Map((json.includes?.tweets ?? json.includes?.posts ?? []).map((post) => [post.id, post]));
      if (json.data?.id === pinnedId && json.data?.author_id === author.id) {
        const parent = references.find((ref) => ref.type === "replied_to");
        const parentAuthorId = json.data.in_reply_to_user_id ?? postsById.get(parent?.id)?.author_id;
        if ((parent || parentAuthorId) && parentAuthorId !== author.id) return { post: null, status: "none" };
        if (isQuote) {
          /** @type {import("../shared/contracts.mjs").PostItem} */
          const quote = normalizedSelfQuote(json.data, author, mediaByKey, postsById);
          if (!quote || typeof json.data.created_at !== "string") return { post: null, status: "none" };
          try {
            const details = await fetchPostDetails([quote.quotedPost.id], signal);
            const target = Array.isArray(details.data)
              ? details.data.find((post) => post.id === quote.quotedPost.id)
              : null;
            if (target?.author_id && target.author_id !== author.id) return { post: null, status: "none" };
            for (const media of details.includes?.media ?? []) mediaByKey.set(media.media_key, media);
            quote.quotedPost = normalizedQuoteTarget(target, author, mediaByKey) ?? quote.quotedPost;
          } catch {
            // The verified expansion is still usable if the optional detail lookup fails.
            const previous = cached?.pinnedPost?.quotedPost;
            if (previous?.id === quote.quotedPost.id && previous.media?.length) quote.quotedPost = previous;
          }
          return { post: quote, status: "ok" };
        }
      }
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
    const ownTimelinePosts = new Map();
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
      let url = buildXTimelineUrl(author.id, { includeArticles, fullRefresh, newestSeenId, nextToken });
      let json;
      try {
        json = await getXJson(url, token, fetchImpl, { allowPartialErrors: true, signal, now });
      } catch (error) {
        // Optional Article fields must not take the existing post feed down if an
        // X API access tier/version rejects them. A fallback is unknown, not empty.
        if (!includeArticles || error?.status !== 400) throw error;
        includeArticles = false;
        articlesAvailable = false;
        url = buildXTimelineUrl(author.id, { includeArticles: false, fullRefresh, newestSeenId, nextToken });
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
      if (resumeFrom !== undefined && json.data === undefined && json.meta?.result_count !== 0) {
        throw new Error("X timeline did not confirm an empty result");
      }
      const pagePosts = json.data ?? [];
      const mediaByKey = new Map(
        (Array.isArray(json.includes?.media) ? json.includes.media : [])
          .filter((media) => typeof media?.media_key === "string")
          .map((media) => [media.media_key, media]),
      );
      const postsById = new Map((json.includes?.tweets ?? json.includes?.posts ?? []).map((post) => [post.id, post]));
      const quoteTargets = new Map([...postsById, ...pagePosts.map((post) => [post.id, post])]);
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
        if (post.author_id === author.id) ownTimelinePosts.set(post.id, post);
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
        const original =
          post.id === pinnedId
            ? null
            : (normalizedPost(post, author, mediaByKey) ?? normalizedSelfQuote(post, author, mediaByKey, quoteTargets));
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

    // Reference expansions can omit attachments. Use full timeline entries for
    // owned quote targets when available, and share detail batches with reposts.
    const referenceOf = (event) =>
      (event.referenced_tweets ?? event.referenced_posts ?? []).find((reference) => reference.type === "retweeted");
    const repostIds = new Set(repostEvents.map((event) => referenceOf(event)?.id).filter(isId));
    const quoteIds = found.flatMap(({ quotedPost }) =>
      quotedPost && !ownTimelinePosts.has(quotedPost.id) ? [quotedPost.id] : [],
    );
    const originalIds = [...new Set([...repostIds, ...quoteIds])].filter((id) => !permanentlyUnavailableIds.has(id));
    const verifiedOriginals = new Set();
    for (let start = 0; start < originalIds.length; start += PAGE_SIZE) {
      const ids = originalIds.slice(start, start + PAGE_SIZE);
      const includesReposts = ids.some((id) => repostIds.has(id));
      try {
        const json = await fetchPostDetails(ids, signal);
        if (json.errors?.length) {
          const { permanentIds, hasTransientError } = classifyXErrors(json.errors);
          for (const id of permanentIds) permanentlyUnavailableIds.add(id);
          if (hasTransientError && includesReposts) repostsAvailable = false;
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
        if (!includesReposts) continue;
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

    const previousQuotes = new Map(
      cached?.posts?.filter((post) => post.quotedPost).map((post) => [post.id, post.quotedPost]),
    );
    const dailyPosts = found.flatMap((post) => {
      if (!post.quotedPost) return [post];
      const id = post.quotedPost.id;
      const target = ownTimelinePosts.get(id) ?? repostPostsById.get(id);
      if (target?.author_id && target.author_id !== author.id) return [];
      const full = normalizedQuoteTarget(target, author, repostMediaByKey);
      if (ownTimelinePosts.has(id) || verifiedOriginals.has(id)) {
        return [{ ...post, quotedPost: full ?? post.quotedPost }];
      }
      const previous = previousQuotes.get(post.id);
      const fallback = previous?.id === id && previous.media?.length ? previous : (full ?? post.quotedPost);
      return [{ ...post, quotedPost: fallback }];
    });
    const unique = [];
    const ids = new Set();
    for (const post of [...dailyPosts, ...(fullRefresh ? [] : (cached?.posts ?? []))]) {
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
    const reposts = sortReposts(repostsById.values());
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
    const reusablePin =
      resumeFrom &&
      userAt === resumeFrom.authorAt &&
      cachedPinnedId === pinnedId &&
      ["ok", "none"].includes(cached?.pinnedStatus)
        ? { post: cached.pinnedPost, status: cached.pinnedStatus }
        : null;
    const [
      { posts, articles, articlesStatus, reposts, repostsStatus, repostsRetryDelayMs, latestId, fullRefresh },
      pinned,
    ] = await Promise.all([
      fetchOriginalPosts(author, pinnedId, signal),
      reusablePin ?? fetchPinnedPost(author, pinnedId, signal),
    ]);
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
        const wasUserCached = Boolean(user && startedAt - userAt < userCacheTtl && cachedProfile);
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
  getFeed.getCheckpoint = /** @returns {XFeedCheckpoint | null} */ () =>
    cached && cachedAuthor
      ? {
          feed: cached,
          newestSeenId,
          pinnedId: cachedPinnedId,
          author: cachedAuthor,
          authorAt: userAt,
          fullRefreshAt,
          userFieldMode,
          postFieldMode,
        }
      : null;
  return getFeed;
}
