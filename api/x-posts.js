import { createXFeedService } from "../server/x-feed-plugin.mjs";

const getFeed = createXFeedService({ token: process.env.X_BEARER_TOKEN ?? "" });

export default {
  async fetch(request) {
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    };

    if (request.method !== "GET") {
      return new Response(JSON.stringify({ status: "method_not_allowed", posts: [] }), {
        status: 405,
        headers: { ...headers, Allow: "GET" },
      });
    }

    return new Response(JSON.stringify(await getFeed()), {
      headers: {
        ...headers,
        "Vercel-CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  },
};
