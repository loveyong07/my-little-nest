// Vercel function: every API route shares server/api-handler.mjs.
import { createApiHandler } from "../server/api-handler.mjs";
import { waitUntil } from "@vercel/functions";
import { createBlobPhotoCache } from "../server/photo-cache.mjs";

const handleApi = createApiHandler(process.env, {
  mediaOptions: { photoCache: createBlobPhotoCache(), defer: waitUntil },
});

export default {
  async fetch(request) {
    return (await handleApi(request)) ?? new Response("Not found", { status: 404 });
  },
};
