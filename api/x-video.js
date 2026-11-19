// Vercel function: every API route shares server/api-handler.mjs.
import { createApiHandler } from "../server/api-handler.mjs";

const handleApi = createApiHandler(process.env);

export const config = {
  supportsResponseStreaming: true,
};

export default {
  async fetch(request) {
    return (await handleApi(request)) ?? new Response("Not found", { status: 404 });
  },
};
