import { createApiHandler } from "../server/api-handler.mjs";
import {
  HASHED_ASSET_PATTERN,
  IMMUTABLE_ASSET_CACHE_CONTROL,
  POSTS_PRELOAD_LINK,
  ROUTE_SHELLS,
  SECURITY_HEADERS,
  STATIC_ASSET_CACHE_CONTROL,
  isBusinessRedirect,
} from "../shared/hosting-policy.mjs";

// One handler per credential set, so a rotated secret takes effect without a restart.
let handler = { key: null, handleApi: null };

function apiHandlerFor(env) {
  const key = [
    env.X_BEARER_TOKEN ?? "",
    env.X_MEDIA_SIGNING_SECRET ?? "",
    env.X_MEDIA_SIGNING_SECRET_PREVIOUS ?? "",
    env.TOUCHGAL_API_TOKEN ?? "",
  ].join("\n");
  if (handler.key !== key) handler = { key, handleApi: createApiHandler(env) };
  return handler.handleApi;
}

function withSiteHeaders(response, pathname) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  if ((pathname === "/posts" || pathname === "/posts/") && !headers.has("link")) {
    headers.set("Link", POSTS_PRELOAD_LINK);
  }
  if (pathname.startsWith("/assets/") && response.ok && !headers.has("cache-control")) {
    headers.set(
      "Cache-Control",
      HASHED_ASSET_PATTERN.test(pathname) ? IMMUTABLE_ASSET_CACHE_CONTROL : STATIC_ASSET_CACHE_CONTROL,
    );
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env, _ctx) {
    const apiResponse = await apiHandlerFor(env)(request);
    if (apiResponse) return apiResponse;

    const url = new URL(request.url);
    const { pathname } = url;
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return new Response("Not found", {
        status: 404,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "X-Robots-Tag": "noindex, nofollow",
        },
      });
    }

    if (isBusinessRedirect(pathname)) {
      const target = new URL("/", url);
      return withSiteHeaders(new Response(null, { status: 308, headers: { Location: target.toString() } }), pathname);
    }

    const isRead = request.method === "GET" || request.method === "HEAD";
    const routeShell = isRead ? ROUTE_SHELLS[pathname] : undefined;
    if (routeShell) {
      const shellUrl = new URL(url);
      shellUrl.pathname = routeShell;
      shellUrl.search = "";
      const shellResponse = await env.ASSETS.fetch(new Request(shellUrl, request));
      if (shellResponse.status !== 404) return withSiteHeaders(shellResponse, pathname);
    }

    const response = await env.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get("accept")?.includes("text/html");

    if (response.status !== 404 || !acceptsHtml || !isRead) {
      return withSiteHeaders(response, pathname);
    }

    const indexUrl = new URL(url);
    indexUrl.pathname = "/index.html";
    indexUrl.search = "";
    return withSiteHeaders(await env.ASSETS.fetch(new Request(indexUrl, request)), pathname);
  },
};
