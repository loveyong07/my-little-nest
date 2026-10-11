import { createApiHandler } from "../server/api-handler.mjs";

// One handler per credential set, so a rotated secret takes effect without a restart.
let handler = { key: null, handleApi: null };

function apiHandlerFor(env) {
  const key = `${env.X_BEARER_TOKEN ?? ""}\n${env.X_MEDIA_SIGNING_SECRET ?? ""}`;
  if (handler.key !== key) handler = { key, handleApi: createApiHandler(env) };
  return handler.handleApi;
}

export default {
  async fetch(request, env) {
    const apiResponse = await apiHandlerFor(env)(request);
    if (apiResponse) return apiResponse;

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
