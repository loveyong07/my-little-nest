import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { ANONYMOUS_MESSAGE_ENDPOINT } from "../shared/anonymous-message.mjs";
import { createApiHandler } from "../server/api-handler.mjs";
import { createNodeApiMiddleware } from "../server/vite-api-plugin.mjs";
import mailService from "../services/anonymous-message/api/anonymous-message.js";

const env = {
  RESEND_API_KEY: "resend-fixture-key",
  ANONYMOUS_MESSAGE_FROM: "Nest <notes@mail.example.com>",
};
const payload = { id: "4195a86c-1498-405c-a7a3-21cad82ab696", message: " 你好，初咏\n第二行 <3 " };
const origin = "https://loveyong07.top";

function request({ method = "POST", headers = {}, body = JSON.stringify(payload), requestOrigin = origin } = {}) {
  return new Request(requestOrigin + ANONYMOUS_MESSAGE_ENDPOINT, {
    method,
    headers: { Origin: requestOrigin, "Content-Type": "application/json", ...headers },
    body: method === "POST" ? body : undefined,
  });
}

test("the local HTTP entry point delivers only the text to the configured mailbox", async (t) => {
  const outgoing = [];
  const handleApi = createApiHandler(env, {
    fetchImpl: async (url, options) => {
      outgoing.push({ url, ...options });
      return Response.json({ id: "mail-fixture-id" });
    },
  });
  const server = createServer(createNodeApiMiddleware(handleApi));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const requestOrigin = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(request({ requestOrigin }));
  assert.equal(response.status, 202);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { status: "accepted" });
  assert.equal(outgoing.length, 1);
  const mail = outgoing[0];
  assert.equal(mail.url, "https://api.resend.com/emails");
  assert.equal(mail.headers.Authorization, "Bearer " + env.RESEND_API_KEY);
  assert.equal(mail.headers["Idempotency-Key"], "anonymous-message/" + payload.id);
  assert.deepEqual(JSON.parse(mail.body), {
    from: env.ANONYMOUS_MESSAGE_FROM,
    to: ["loveyong2007@gmail.com"],
    subject: "【初咏的小窝】收到一封匿名留言",
    text: payload.message.trim(),
  });
});

test("invalid submissions and cross-origin requests do not reach Resend", async () => {
  const handleApi = createApiHandler(env, { fetchImpl: async () => assert.fail("unexpected mail request") });
  const cases = [
    [request({ method: "GET" }), 405],
    [request({ headers: { Origin: "https://other.example" } }), 403],
    [request({ headers: { "Sec-Fetch-Site": "same-site" } }), 403],
    [request({ headers: { "Content-Type": "text/plain" } }), 415],
    [request({ body: "malformed" }), 400],
    [request({ body: " ".repeat(8193) }), 400],
    [request({ body: JSON.stringify({ ...payload, message: " ".repeat(10) }) }), 400],
    [request({ body: JSON.stringify({ ...payload, message: "中".repeat(801) }) }), 400],
    [request({ body: JSON.stringify({ ...payload, to: "someone@example.com" }) }), 400],
    [request({ body: JSON.stringify({ ...payload, id: "forward-this" }) }), 400],
  ];
  for (const [incoming, status] of cases) {
    assert.equal((await handleApi(incoming)).status, status);
  }
});

test("the mail service validates the original site origin and serves only the rate-limited path", async () => {
  const service = "https://messages.example.com";
  const incoming = (site, path = ANONYMOUS_MESSAGE_ENDPOINT) =>
    new Request(service + path, {
      method: "POST",
      headers: { Origin: site, "Sec-Fetch-Site": "same-origin", "Content-Type": "text/plain" },
    });

  assert.equal((await mailService.fetch(incoming(origin))).status, 415);
  assert.equal((await mailService.fetch(incoming("https://my-little-nest.vercel.app"))).status, 415);
  assert.equal((await mailService.fetch(incoming(service))).status, 403);
  assert.equal((await mailService.fetch(incoming(origin, `${ANONYMOUS_MESSAGE_ENDPOINT}.js`))).status, 404);
});

test("unconfigured and failed delivery return clear errors without leaking provider details", async () => {
  const unavailable = await createApiHandler({})(request());
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { status: "unconfigured" });

  const handleApi = createApiHandler(env, {
    fetchImpl: async () => Response.json({ message: "provider-only details" }, { status: 403 }),
  });
  const failed = await handleApi(request());
  assert.equal(failed.status, 502);
  assert.deepEqual(await failed.json(), { status: "send_failed" });
});
