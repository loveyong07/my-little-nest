// Vercel function: every API route shares server/api-handler.mjs.
import { createApiHandler } from "../server/api-handler.mjs";
import { waitUntil } from "@vercel/functions";
import { createBlobArticleCache } from "../server/article-cache.mjs";

const handleApi = createApiHandler(process.env, {
  articleCache: createBlobArticleCache(),
  defer: waitUntil,
});

export default {
  async fetch(request) {
    return (await handleApi(request)) ?? new Response("Not found", { status: 404 });
  },
};
