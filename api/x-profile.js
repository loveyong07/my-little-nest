// Vercel function: every API route shares server/api-handler.mjs.
import { createApiHandler } from "../server/api-handler.mjs";
import { readPublishedXSnapshot } from "../server/x-feed-snapshot.mjs";

const handleApi = createApiHandler(process.env, { readXSnapshot: readPublishedXSnapshot() });

export default {
  async fetch(request) {
    return (await handleApi(request)) ?? new Response("Not found", { status: 404 });
  },
};
