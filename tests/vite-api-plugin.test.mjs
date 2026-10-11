import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createNodeApiMiddleware } from "../server/vite-api-plugin.mjs";

async function serve(handleApi) {
  const middleware = createNodeApiMiddleware(handleApi);
  const server = createServer((request, response) =>
    middleware(request, response, () => {
      response.statusCode = 418;
      response.end("next");
    }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { origin: `http://127.0.0.1:${port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

test("API requests reach the fetch handler with their method, URL and headers", async () => {
  const seen = [];
  const { origin, close } = await serve(async (request) => {
    seen.push([
      request.method,
      new URL(request.url).pathname + new URL(request.url).search,
      request.headers.get("range"),
    ]);
    return new Response("partial", { status: 206, headers: { "Content-Range": "bytes 0-6/20", "X-Test": "yes" } });
  });
  try {
    const response = await fetch(`${origin}/api/x-video?url=a`, { headers: { Range: "bytes=0-6" } });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-range"), "bytes 0-6/20");
    assert.equal(response.headers.get("x-test"), "yes");
    assert.equal(await response.text(), "partial");
    assert.deepEqual(seen, [["GET", "/api/x-video?url=a", "bytes=0-6"]]);
  } finally {
    await close();
  }
});

test("unknown API paths are 404 and other paths fall through to Vite", async () => {
  const { origin, close } = await serve(async () => null);
  try {
    const missing = await fetch(`${origin}/api/missing`);
    assert.equal(missing.status, 404);
    assert.equal(await missing.text(), "Not found");
    const page = await fetch(`${origin}/posts`);
    assert.equal(page.status, 418);
  } finally {
    await close();
  }
});

test("streamed bodies arrive complete", async () => {
  const chunks = ["one ", "two ", "three"];
  const { origin, close } = await serve(
    async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            const chunk = chunks.shift();
            if (chunk) controller.enqueue(new TextEncoder().encode(chunk));
            else controller.close();
          },
        }),
      ),
  );
  try {
    assert.equal(await (await fetch(`${origin}/api/x-media?url=a`)).text(), "one two three");
  } finally {
    await close();
  }
});

test("a visitor who disconnects aborts the handler's request", async () => {
  let aborted;
  const signalled = new Promise((resolve) => {
    aborted = resolve;
  });
  const { origin, close } = await serve(async (request) => {
    request.signal.addEventListener("abort", () => aborted(true), { once: true });
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("first"));
        },
      }),
    );
  });
  try {
    const controller = new AbortController();
    const response = await fetch(`${origin}/api/x-video?url=a`, { signal: controller.signal });
    const reader = response.body.getReader();
    await reader.read();
    controller.abort();
    assert.equal(
      await Promise.race([signalled, new Promise((resolve) => setTimeout(() => resolve(false), 2000))]),
      true,
    );
  } finally {
    await close();
  }
});
