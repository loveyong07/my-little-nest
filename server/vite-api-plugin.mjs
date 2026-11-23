// Serves the API routes from the Vite dev and preview servers by adapting Node's
// request/response objects to the shared fetch-style handler.
import { createApiHandler } from "./api-handler.mjs";
import { createBlobPostComments } from "./blob-post-comments.mjs";

function toFetchRequest(request, signal) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (name.startsWith(":") || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
  }
  const init = {
    method: request.method,
    headers,
    signal,
    ...(request.method === "POST" ? { body: request, duplex: "half" } : {}),
  };
  return new Request(new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`), init);
}

async function sendFetchResponse(fetchResponse, response) {
  response.statusCode = fetchResponse.status;
  for (const [name, value] of fetchResponse.headers) response.setHeader(name, value);
  if (!fetchResponse.body) {
    response.end();
    return;
  }
  // Stream with backpressure; a visitor who leaves cancels the upstream body.
  const reader = fetchResponse.body.getReader();
  let disconnected = false;
  const onClose = () => {
    disconnected = true;
    void reader.cancel().catch(() => {});
  };
  response.once("close", onClose);
  try {
    while (!disconnected) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!response.write(value)) {
        await new Promise((resolve) => {
          const finish = () => {
            response.off("drain", finish);
            response.off("close", finish);
            resolve();
          };
          response.once("drain", finish);
          response.once("close", finish);
        });
      }
    }
    if (!disconnected) response.end();
  } catch {
    if (!disconnected) response.destroy();
  } finally {
    response.off("close", onClose);
    if (!disconnected) reader.releaseLock();
  }
}

/** Connect-style middleware for the API routes; other paths fall through to Vite. */
export function createNodeApiMiddleware(handleApi) {
  return async function apiMiddleware(request, response, next) {
    if (!request.url?.startsWith("/api/")) return next();
    const controller = new AbortController();
    const abort = () => {
      if (!response.writableFinished) controller.abort();
    };
    response.once("close", abort);
    try {
      const fetchResponse = await handleApi(toFetchRequest(request, controller.signal));
      if (!fetchResponse) {
        response.statusCode = 404;
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.end("Not found");
        return;
      }
      await sendFetchResponse(fetchResponse, response);
    } catch {
      if (!response.headersSent) response.statusCode = 500;
      response.end();
    } finally {
      response.off("close", abort);
    }
  };
}

export function apiPlugin(env) {
  const middleware = createNodeApiMiddleware(createApiHandler(env, { commentStore: createBlobPostComments({ env }) }));
  // Install before Vite's own middlewares; returning nothing keeps it out of the post hooks.
  const install = (server) => {
    server.middlewares.use(middleware);
  };
  return { name: "little-nest-api", configureServer: install, configurePreviewServer: install };
}
