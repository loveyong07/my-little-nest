// Vercel function: every API route shares server/api-handler.mjs.
import { waitUntil } from "@vercel/functions";
import { createApiHandler } from "../server/api-handler.mjs";
import { createBlobVideoCache } from "../server/video-cache.mjs";

const handleApi = createApiHandler(process.env, { defer: waitUntil, videoCache: createBlobVideoCache() });

export const config = {
  supportsResponseStreaming: true,
};

export default {
  async fetch(request) {
    return (await handleApi(request)) ?? new Response("Not found", { status: 404 });
  },
};
