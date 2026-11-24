import { ANONYMOUS_MESSAGE_MAX_LENGTH } from "../shared/anonymous-message.mjs";
import { mailboxes } from "../src/constants/site.js";

const MAX_REQUEST_BYTES = 8 * 1024;
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function readPayload(body) {
  if (!body) return null;
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return JSON.parse(text + decoder.decode());
      bytes += value.byteLength;
      if (bytes > MAX_REQUEST_BYTES) return null;
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

function reply(status, code, headers = {}) {
  return Response.json(
    { status },
    {
      status: code,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
        "Cross-Origin-Resource-Policy": "same-origin",
        ...headers,
      },
    },
  );
}

export async function sendAnonymousMessage(request, env, fetchImpl) {
  if (request.method !== "POST") return reply("method_not_allowed", 405, { Allow: "POST" });
  const url = new URL(request.url);
  const fetchSite = request.headers.get("sec-fetch-site");
  if (request.headers.get("origin") !== url.origin || (fetchSite && fetchSite !== "same-origin")) {
    return reply("forbidden", 403);
  }
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") return reply("unsupported_content_type", 415);
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) return reply("invalid_message", 413);

  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.ANONYMOUS_MESSAGE_FROM?.trim();
  if (!apiKey || !from) return reply("unconfigured", 503);

  const payload = await readPayload(request.body);
  const message = typeof payload?.message === "string" ? payload.message.trim() : "";
  if (
    !message ||
    message.length > ANONYMOUS_MESSAGE_MAX_LENGTH ||
    typeof payload.id !== "string" ||
    !REQUEST_ID.test(payload.id) ||
    Object.keys(payload).length !== 2
  ) {
    return reply("invalid_message", 400);
  }

  try {
    const upstream = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
        "Idempotency-Key": "anonymous-message/" + payload.id,
      },
      body: JSON.stringify({
        from,
        to: [mailboxes[0].address],
        subject: "【初咏的小窝】收到一封匿名留言",
        text: message,
      }),
    });
    if (upstream.ok && typeof (await upstream.json()).id === "string") {
      return reply("accepted", 202);
    }
  } catch {
    // Preserve the same public error for timeouts and an unavailable mail provider.
  }
  return reply("send_failed", 502);
}
