// The site's API routes as one fetch-style handler. Vercel functions (api/), the
// Sites worker (worker/index.js) and the Vite dev/preview server (vite-api-plugin.mjs)
// only adapt their runtime to it.
import { authorizeFeed, authorizeProfile, previousSigningSecret, signingSecret } from "./x-media-auth.mjs";
import { createXFeedService } from "./x-feed-service.mjs";
import { proxyXMedia } from "./x-media.mjs";
import { proxyXVideo } from "./x-video.mjs";
import { createStarryGalFetchHandler } from "./starrygal.mjs";

// Browsers do not HTTP-cache these answers. Complete successes use the retained five-minute
// CDN policy; partial, stale and unknown results use the one-minute retry policy. These
// windows trade freshness for cache reuse; they are not measured cold-start/cost savings.
export const JSON_CACHE_CONTROL = "no-store";
export const JSON_CDN_CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=600";
export const JSON_CDN_CACHE_CONTROL_RETRY = "public, s-maxage=60";

function json(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": JSON_CACHE_CONTROL,
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
      "Cross-Origin-Resource-Policy": "same-origin",
      ...headers,
    },
  });
}

/**
 * @typedef {{
 *   fetchImpl?: typeof globalThis.fetch,
 *   articleFetchImpl?: typeof globalThis.fetch | null,
 *   articleCache?: import("../shared/contracts.mjs").ArticleCacheAdapter | null,
 *   readXSnapshot?: (() => Promise<import("../shared/contracts.mjs").PublishedXSnapshot | null>) | null,
 *   videoCache?: import("./x-video.mjs").VideoCache | null,
 *   defer?: (task: Promise<unknown>) => void,
 *   onEvent?: import("./telemetry.mjs").TelemetryEmitter | null,
 *   serviceFactory?: typeof createXFeedService,
 *   mediaOptions?: {
 *     connectTimeoutMs?: number,
 *     stallTimeoutMs?: number,
 *     totalTimeoutMs?: number,
 *     webpEncoder?: (image: Uint8Array) => Promise<Uint8Array | null>,
 *     photoCache?: import("../shared/contracts.mjs").PhotoCacheAdapter | null,
 *     defer?: (task: Promise<unknown>) => void,
 *     onEvent?: import("./telemetry.mjs").TelemetryEmitter | null,
 *     now?: () => number,
 *     inFlight?: Map<string, unknown> | null,
 *   },
 * }} ApiHandlerOptions
 */

/**
 * @param {Record<string, string | undefined>} [env] X_BEARER_TOKEN and optional X_MEDIA_SIGNING_SECRET.
 * @param {ApiHandlerOptions} [options]
 * @returns {(request: Request) => Promise<Response | null>} null for paths outside the API.
 */
export function createApiHandler(
  env = {},
  {
    fetchImpl = (input, init) => globalThis.fetch(input, init),
    articleFetchImpl = fetchImpl,
    articleCache = null,
    readXSnapshot = null,
    videoCache = null,
    defer = undefined,
    onEvent = null,
    serviceFactory = createXFeedService,
    mediaOptions = undefined,
  } = {},
) {
  const authOptions = { secret: signingSecret(env), previousSecret: previousSigningSecret(env) };
  const resolvedDefer = defer ?? mediaOptions?.defer;
  const mediaInFlight = new Map();
  let service = null;
  let starrygal = null;
  const feedService = () =>
    (service ??= serviceFactory({
      token: env.X_BEARER_TOKEN ?? "",
      fetchImpl,
      articleFetchImpl,
      articleCache,
      ...(resolvedDefer ? { defer: resolvedDefer } : {}),
      ...(onEvent ? { onEvent } : {}),
    }));
  const starrygalHandler = () =>
    (starrygal ??= createStarryGalFetchHandler({
      fetchImpl,
      token: () => env.TOUCHGAL_API_TOKEN ?? "",
    }));

  async function feedRoute(request, route) {
    const empty = route === "posts" ? { status: "unavailable", posts: [] } : { status: "unavailable" };
    if (request.method !== "GET") {
      return json(route === "posts" ? { status: "method_not_allowed", posts: [] } : { status: "method_not_allowed" }, {
        status: 405,
        headers: { Allow: "GET" },
      });
    }
    // These endpoints take no input. Random query strings must not mint cached
    // feed variants or trigger X lookups on fresh serverless instances.
    if (new URL(request.url).search) {
      return json({ ...empty, status: "invalid_request" }, { status: 400 });
    }
    try {
      const snapshot = readXSnapshot ? await readXSnapshot() : null;
      if (readXSnapshot && !snapshot) {
        return json(empty, { status: 503, headers: { "Vercel-CDN-Cache-Control": JSON_CDN_CACHE_CONTROL_RETRY } });
      }
      const snapshotHeaders = snapshot
        ? {
            "X-Nest-X-Source": "snapshot",
            "X-Nest-X-Synced-At": new Date(snapshot.syncedAt).toISOString(),
          }
        : {};
      if (route === "posts") {
        const result = await authorizeFeed(snapshot ? snapshot.feed : await feedService()(), authOptions);
        const complete =
          result?.status === "ok" &&
          ["ok", "none"].includes(result.pinnedStatus) &&
          ["ok", "none"].includes(result.repostsStatus) &&
          ["ok", "none"].includes(result.articlesStatus);
        const cdn = complete ? JSON_CDN_CACHE_CONTROL : JSON_CDN_CACHE_CONTROL_RETRY;
        const body =
          env.VERCEL_ENV === "preview" && result.status === "unavailable"
            ? { ...result, previewIssue: env.X_BEARER_TOKEN ? "x_upstream_unavailable" : "x_credential_missing" }
            : result;
        return json(body, { headers: { ...snapshotHeaders, "Vercel-CDN-Cache-Control": cdn } });
      }
      const result = await authorizeProfile(
        snapshot ? snapshot.profile : await feedService().getProfile(),
        authOptions,
      );
      const cdn = result?.status === "ok" ? JSON_CDN_CACHE_CONTROL : JSON_CDN_CACHE_CONTROL_RETRY;
      return json(result, { headers: { ...snapshotHeaders, "Vercel-CDN-Cache-Control": cdn } });
    } catch {
      // A failed lookup still answers, so no runtime is left with a hanging request.
      return json(empty, { status: 503, headers: { "Vercel-CDN-Cache-Control": JSON_CDN_CACHE_CONTROL_RETRY } });
    }
  }

  return async function handleApi(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/x-media") {
      return proxyXMedia(request, fetchImpl, authOptions, {
        ...mediaOptions,
        inFlight: mediaOptions?.inFlight ?? mediaInFlight,
        ...(resolvedDefer ? { defer: resolvedDefer } : {}),
        ...(onEvent && !mediaOptions?.onEvent ? { onEvent } : {}),
      });
    }
    if (pathname === "/api/x-video") return proxyXVideo(request, fetchImpl, authOptions, { videoCache, defer });
    if (pathname === "/api/x-posts") return feedRoute(request, "posts");
    if (pathname === "/api/x-profile") return feedRoute(request, "profile");
    if (pathname === "/api/starrygal") return starrygalHandler()(request);
    return null;
  };
}
