import { createXFeedService } from "../server/x-feed-plugin.mjs";
import { proxyXMedia } from "../server/x-media.mjs";
import { proxyXVideo } from "../server/x-video.mjs";

let feedToken = null;
let getFeed = null;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/x-media") return proxyXMedia(request);
    if (url.pathname === "/api/x-video") return proxyXVideo(request);
    if (url.pathname === "/api/x-posts" || url.pathname === "/api/x-profile") {
      const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
      if (request.method !== "GET") {
        return new Response(JSON.stringify({ status: "method_not_allowed", posts: [] }), {
          status: 405, headers: { ...headers, Allow: "GET" },
        });
      }
      const token = env.X_BEARER_TOKEN || "";
      if (!getFeed || token !== feedToken) {
        feedToken = token;
        getFeed = createXFeedService({ token });
      }
      return new Response(JSON.stringify(url.pathname === "/api/x-profile" ? await getFeed.getProfile() : await getFeed()), { headers });
    }

    const response = await env.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get("accept")?.includes("text/html");

    if (response.status !== 404 || !acceptsHtml || !["GET", "HEAD"].includes(request.method)) {
      return response;
    }

    const indexUrl = new URL(request.url);
    indexUrl.pathname = "/index.html";
    indexUrl.search = "";
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};
