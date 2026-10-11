import { authorizedMediaRequest, boundedMediaCache, parseMediaSource, validMediaQuery } from "./x-media-auth.mjs";
const VIDEO_TYPE = "video/mp4";
const CACHE_CONTROL = "public, max-age=1800, s-maxage=43200";
// Covers connecting and waiting for the first byte; while streaming, the same limit
// applies between chunks so a stalled upstream releases instead of hanging on.
const STALL_TIMEOUT_MS = 15000;

function parseXVideoUrl(value) {
  return parseMediaSource(value, "video");
}

function errorResponse(status, message, extraHeaders = {}) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

function validSingleByteRange(value) {
  if (!value) return true;
  if (value.length > 128 || !/^bytes=(?:\d+-\d*|-\d+)$/.test(value)) return false;
  const [startText, endText] = value.slice(6).split("-");
  if (startText && endText && Number(startText) > Number(endText)) return false;
  return [startText, endText].filter(Boolean).every((part) => Number.isSafeInteger(Number(part)));
}

function responseBody(upstreamBody, controller, cleanup, idle) {
  const reader = upstreamBody.getReader();
  return new ReadableStream({
    async pull(streamController) {
      try {
        // Only an outstanding upstream read is timed. A visitor that pauses playback
        // stops pulling, and that must not look like a stalled upstream.
        idle.arm();
        const { done, value } = await reader.read();
        idle.clear();
        if (done) {
          cleanup();
          streamController.close();
        } else {
          streamController.enqueue(value);
        }
      } catch (error) {
        cleanup();
        streamController.error(error);
      }
    },
    cancel(reason) {
      cleanup();
      controller.abort(reason);
      return reader.cancel(reason);
    },
  });
}

export async function proxyXVideo(request, fetchImpl = globalThis.fetch, authOptions, { stallTimeoutMs = STALL_TIMEOUT_MS } = {}) {
  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed", { Allow: "GET" });
  }

  const requestUrl = new URL(request.url);
  const sourceValues = requestUrl.searchParams.getAll("url");
  const source = sourceValues.length === 1 && validMediaQuery(request) ? parseXVideoUrl(sourceValues[0]) : null;
  if (!source) return errorResponse(400, "Unsupported video URL");
  if (!await authorizedMediaRequest(request, source, "video", authOptions)) return errorResponse(403, "Unsupported video URL");

  const range = request.headers.get("range");
  if (!validSingleByteRange(range)) {
    return errorResponse(416, "Unsupported byte range", { "Accept-Ranges": "bytes", "Content-Range": "bytes */*" });
  }

  const controller = new AbortController();
  const abortFromClient = () => controller.abort(request.signal.reason);
  if (request.signal.aborted) abortFromClient();
  else request.signal.addEventListener("abort", abortFromClient, { once: true });
  const connectTimeout = setTimeout(() => controller.abort(), stallTimeoutMs);
  let idleTimeout = null;
  // Re-armed around each upstream read, so this is an idle limit and not a total limit.
  const idle = {
    arm() { clearTimeout(idleTimeout); idleTimeout = setTimeout(() => controller.abort(), stallTimeoutMs); },
    clear() { clearTimeout(idleTimeout); idleTimeout = null; },
  };
  const cleanup = () => {
    request.signal.removeEventListener("abort", abortFromClient);
    clearTimeout(connectTimeout);
    clearTimeout(idleTimeout);
  };

  try {
    const headers = new Headers({ Accept: VIDEO_TYPE });
    if (range) headers.set("Range", range);
    const ifRange = request.headers.get("if-range");
    if (ifRange) headers.set("If-Range", ifRange);

    const upstream = await fetchImpl(source.href, {
      headers,
      redirect: "error",
      signal: controller.signal,
    });
    clearTimeout(connectTimeout);

    if (!upstream.ok) {
      const contentRange = upstream.headers.get("content-range");
      await upstream.body?.cancel();
      cleanup();
      return errorResponse(upstream.status === 404 ? 404 : upstream.status === 416 ? 416 : 502,
        "Video source unavailable", contentRange ? { "Content-Range": contentRange, "Accept-Ranges": "bytes" } : {});
    }

    const contentType = upstream.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (contentType !== VIDEO_TYPE || !upstream.body) {
      await upstream.body?.cancel();
      cleanup();
      return errorResponse(415, "Unsupported video type");
    }

    const responseHeaders = new Headers({
      "Content-Type": VIDEO_TYPE,
      "Cache-Control": boundedMediaCache(request, CACHE_CONTROL, authOptions?.now),
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
    });
    for (const name of ["content-length", "content-range", "etag", "last-modified"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }

    return new Response(responseBody(upstream.body, controller, cleanup, idle), {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    cleanup();
    return errorResponse(502, "Video source unavailable");
  }
}
