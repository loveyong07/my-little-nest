import { createApiHandler } from "../server/api-handler.mjs";

const handleApi = createApiHandler(process.env);

export default {
  async fetch(request) {
    return (await handleApi(request)) ?? new Response("Not found", { status: 404 });
  },
};
