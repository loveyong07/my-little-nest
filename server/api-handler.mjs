// The site's four API routes as one fetch-style handler. Vercel functions (api/), the
// Sites worker (worker/index.js) and the Vite dev/preview server (vite-api-plugin.mjs)
// only adapt their runtime to it.
import { authorizeFeed, authorizeProfile, signingSecret } from "./x-media-auth.mjs";
import { createXFeedService } from "./x-feed-service.mjs";
import { proxyXMedia } from "./x-media.mjs";
import { proxyXVideo } from "./x-video.mjs";

// Responses are never cached by browsers; the Vercel CDN may share a fresh answer briefly.
export const JSON_CACHE_CONTROL = "no-store";
export const JSON_CDN_CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300";

function json(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": JSON_CACHE_CONTROL,
      ...headers,
    },
  });
}

/**
 * @param {Record<string, string | undefined>} env X_BEARER_TOKEN and optional X_MEDIA_SIGNING_SECRET.
 * @returns {(request: Request) => Promise<Response | null>} null for paths outside the API.
 */
export function createApiHandler(env = {}, { fetchImpl = (...args) => globalThis.fetch(...args) } = {}) {
  const authOptions = { secret: signingSecret(env) };
  let service = null;
  const feedService = () => (service ??= createXFeedService({ token: env.X_BEARER_TOKEN ?? "", fetchImpl }));

  async function feedRoute(request, route) {
    const empty = route === "posts" ? { status: "unavailable", posts: [] } : { status: "unavailable" };
    if (request.method !== "GET") {
      return json(route === "posts" ? { status: "method_not_allowed", posts: [] } : { status: "method_not_allowed" }, {
        status: 405,
        headers: { Allow: "GET" },
      });
    }
    try {
      const result =
        route === "posts"
          ? await authorizeFeed(await feedService()(), authOptions)
          : await authorizeProfile(await feedService().getProfile(), authOptions);
      return json(result, { headers: { "Vercel-CDN-Cache-Control": JSON_CDN_CACHE_CONTROL } });
    } catch {
      // A failed lookup still answers, so no runtime is left with a hanging request.
      return json(empty, { status: 503 });
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
