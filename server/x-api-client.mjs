// Low-level X API v2 HTTP transport, rate-limit backoff parsing, error classification,
// and endpoint request helpers shared by server/x-feed-service.mjs.

export const X_API = "https://api.x.com/2";
export const ERROR_RETRY_MS = 60 * 1000;
export const MAX_RATE_LIMIT_RETRY_MS = 15 * 60 * 1000;
export const PAGE_SIZE = 100;
export const MAX_PAGES = 32;

const PERMANENT_X_ERROR_TYPES = new Set([
  "https://api.twitter.com/2/problems/resource-not-found",
  "https://api.x.com/2/problems/resource-not-found",
  "https://api.twitter.com/2/problems/not-authorized-for-resource",
  "https://api.x.com/2/problems/not-authorized-for-resource",
]);

export const isId = (value) => /^\d+$/.test(String(value ?? ""));

export function classifyXErrors(errors) {
  const permanentIds = new Set();
  let hasTransientError = false;
  for (const entry of Array.isArray(errors) ? errors : []) {
    const type = typeof entry?.type === "string" ? entry.type.trim() : "";
    const id = entry?.resource_id ?? entry?.value;
    if (PERMANENT_X_ERROR_TYPES.has(type) && isId(id)) {
      permanentIds.add(String(id));
    } else {
      hasTransientError = true;
    }
  }
  return { permanentIds, hasTransientError };
}

export function parseRateLimitDelayMs(response, currentMs) {
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

export function retryDelayMs(error) {
  return Number.isFinite(error?.retryAfterMs) ? error.retryAfterMs : ERROR_RETRY_MS;
}

export function raceWithSignal(promise, signal) {
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

export async function getXJson(
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

export function fetchXUser(userId, mode, token, fetchImpl, signal, now) {
  const url = new URL(`${X_API}/users/${userId}`);
  url.searchParams.set(
    "user.fields",
    mode === "tweet" ? "name,username,profile_image_url,pinned_tweet_id" : "name,username,profile_image_url",
  );
  if (mode === "post") url.searchParams.set("expansions", "pinned_post_id");
  return getXJson(url, token, fetchImpl, { allowPartialErrors: true, signal, now });
}

export function fetchXPostDetails(ids, token, fetchImpl, signal, now) {
  const url = new URL(`${X_API}/tweets`);
  url.searchParams.set("ids", ids.join(","));
  url.searchParams.set(
    "tweet.fields",
    "created_at,author_id,referenced_tweets,in_reply_to_user_id,note_tweet,attachments,entities",
  );
  url.searchParams.set("expansions", "attachments.media_keys,author_id");
  url.searchParams.set("user.fields", "name,username,profile_image_url,protected");
  url.searchParams.set("media.fields", "media_key,type,url,alt_text,width,height,preview_image_url,variants");
  return getXJson(url, token, fetchImpl, { allowPartialErrors: true, signal, now });
}

export function fetchXPinnedPostLookup(pinnedId, mode, includeArticles, token, fetchImpl, signal, now) {
  const articleFields = includeArticles ? ",article,article_title" : "";
  const url = new URL(`${X_API}/tweets/${pinnedId}`);
  if (mode === "tweet") {
    url.searchParams.set(
      "tweet.fields",
      `created_at,referenced_tweets,author_id,in_reply_to_user_id,note_tweet,attachments,entities${articleFields}`,
    );
    url.searchParams.set("expansions", "attachments.media_keys,referenced_tweets.id");
  } else {
    url.searchParams.set(
      "post.fields",
      `created_at,referenced_posts,in_reply_to_user_id,note_post,attachments,entities${articleFields}`,
    );
    url.searchParams.set("expansions", "attachments.media_keys,author_id,referenced_posts.id");
  }
  url.searchParams.set("media.fields", "media_key,type,url,alt_text,width,height,preview_image_url,variants");
  return getXJson(url, token, fetchImpl, { signal, now });
}

export function buildXTimelineUrl(authorId, { includeArticles, fullRefresh, newestSeenId, nextToken }) {
  const url = new URL(`${X_API}/users/${authorId}/tweets`);
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
  return url;
}
