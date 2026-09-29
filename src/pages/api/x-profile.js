export const prerender = false;

import { createXFeedService } from "../../../server/x-feed-plugin.mjs";

const getProfile = createXFeedService({ token: process.env.X_BEARER_TOKEN ?? "" }).getProfile;

export async function GET() {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "public, s-maxage=900, stale-while-revalidate=86400",
    "CDN-Cache-Control": "public, s-maxage=900, stale-while-revalidate=86400",
  };

  return new Response(JSON.stringify(await getProfile()), { headers });
}

export async function ALL({ request }) {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ status: "method_not_allowed" }), {
      status: 405,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        Allow: "GET",
      },
    });
  }
  return GET();
}
