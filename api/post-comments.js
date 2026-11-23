import { createApiHandler } from "../server/api-handler.mjs";
import { createBlobPostComments } from "../server/blob-post-comments.mjs";

const handleApi = createApiHandler(process.env, { commentStore: createBlobPostComments() });

export default {
  async fetch(request) {
    return (await handleApi(request)) ?? new Response("Not found", { status: 404 });
  },
};
