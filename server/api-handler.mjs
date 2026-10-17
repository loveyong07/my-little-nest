// The site's four API routes as one fetch-style handler. Vercel functions (api/), the
// Sites worker (worker/index.js) and the Vite dev/preview server (vite-api-plugin.mjs)
// only adapt their runtime to it.
import { authorizeFeed, authorizeProfile, signingSecret } from "./x-media-auth.mjs";
import { createXFeedService } from "./x-feed-service.mjs";
import { proxyXMedia } from "./x-media.mjs";
import { proxyXVideo } from "./x-video.mjs";

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
      "Cross-Origin-Resource-Policy": "same-origin",
      ...headers,
    },
  });
}

/**
 * @param {Record<string, string | undefined>} env X_BEARER_TOKEN and optional X_MEDIA_SIGNING_SECRET.
 * @returns {(request: Request) => Promise<Response | null>} null for paths outside the API.
 */
export function createApiHandler(
  env = {},
  {
    fetchImpl = (...args) => globalThis.fetch(...args),
    articleFetchImpl = fetchImpl,
    serviceFactory = createXFeedService,
  } = {},
) {
  const authOptions = { secret: signingSecret(env) };
  let service = null;
  const feedService = () =>
    (service ??= serviceFactory({ token: env.X_BEARER_TOKEN ?? "", fetchImpl, articleFetchImpl }));

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
      const result =
        route === "posts"
          ? await authorizeFeed(await feedService()(), authOptions)
          : await authorizeProfile(await feedService().getProfile(), authOptions);
      const complete =
        result?.status === "ok" &&
        (route === "profile" ||
          (["ok", "none"].includes(result.pinnedStatus) && ["ok", "none"].includes(result.articlesStatus)));
      const cdn = complete ? JSON_CDN_CACHE_CONTROL : JSON_CDN_CACHE_CONTROL_RETRY;
      return json(result, { headers: { "Vercel-CDN-Cache-Control": cdn } });
    } catch {
      // A failed lookup still answers, so no runtime is left with a hanging request.
      return json(empty, { status: 503, headers: { "Vercel-CDN-Cache-Control": JSON_CDN_CACHE_CONTROL_RETRY } });
    }
  }

  return async function handleApi(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/x-media") return proxyXMedia(request, fetchImpl, authOptions);
    if (pathname === "/api/x-video") return proxyXVideo(request, fetchImpl, authOptions);
    if (pathname === "/api/x-posts") return feedRoute(request, "posts");
    if (pathname === "/api/x-profile") return feedRoute(request, "profile");
    return null;
  };
}
