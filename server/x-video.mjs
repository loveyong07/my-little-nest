import { authorizedMediaRequest, boundedMediaCache, parseMediaSource, validMediaQuery } from "./x-media-auth.mjs";
import { mediaContextHeaders } from "./media-request-policy.mjs";
const VIDEO_TYPE = "video/mp4";
const CACHE_CONTROL = "public, max-age=1800, s-maxage=43200";
// Covers connecting and waiting for the first byte; while streaming, the same limit
// applies between chunks so a stalled upstream releases instead of hanging on.
const STALL_TIMEOUT_MS = 15000;
// Bound total streaming time so a paused connection cannot hold a function open indefinitely.
const TOTAL_TIMEOUT_MS = 55000;

/**
 * @typedef {{
 *   read: (source: string, headers: Headers, signal: AbortSignal) => Promise<Response | null | undefined>,
 *   warm: (source: string, size: number, fetchImpl: typeof globalThis.fetch) => Promise<unknown> | null,
 * }} VideoCache
 */

function videoSize(response) {
  if (response.status === 200) return Number(response.headers.get("content-length"));
  const range = response.headers.get("content-range") ?? "";
  return Number(/^bytes \d+-\d+\/(\d+)$/.exec(range)?.[1]);
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
  if (!startText && Number(endText) === 0) return false;
  if (startText && endText && Number(startText) > Number(endText)) return false;
  return [startText, endText].filter(Boolean).every((part) => Number.isSafeInteger(Number(part)));
}

function validIfRange(value) {
  return Boolean(value && value.length <= 256 && !/[\r\n]/.test(value));
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

/**
 * @param {Request} request
 * @param {typeof globalThis.fetch} [fetchImpl]
 * @param {import("../shared/contracts.mjs").MediaSigningOptions} [authOptions]
 * @param {{stallTimeoutMs?: number, totalTimeoutMs?: number, videoCache?: VideoCache | null, defer?: (task: Promise<unknown>) => void}} [options]
 */
export async function proxyXVideo(
  request,
  fetchImpl = globalThis.fetch,
  authOptions,
  { stallTimeoutMs = STALL_TIMEOUT_MS, totalTimeoutMs = TOTAL_TIMEOUT_MS, videoCache = null, defer = undefined } = {},
) {
  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed", { Allow: "GET" });
  }

  const requestUrl = new URL(request.url);
  const sourceValues = requestUrl.searchParams.getAll("url");
  const source =
    sourceValues.length === 1 && validMediaQuery(request) ? parseMediaSource(sourceValues[0], "video") : null;
  if (!source) return errorResponse(400, "Unsupported video URL");
  if (!(await authorizedMediaRequest(request, source, "video", authOptions)))
    return errorResponse(403, "Unsupported video URL");

  const range = request.headers.get("range");
  if (!validSingleByteRange(range)) {
    return errorResponse(416, "Unsupported byte range", { "Accept-Ranges": "bytes" });
  }

  const controller = new AbortController();
  const abortFromClient = () => controller.abort(request.signal.reason);
  if (request.signal.aborted) abortFromClient();
  else request.signal.addEventListener("abort", abortFromClient, { once: true });
  const connectTimeout = setTimeout(() => controller.abort(), stallTimeoutMs);
  const totalTimeout = Number.isFinite(totalTimeoutMs) ? setTimeout(() => controller.abort(), totalTimeoutMs) : null;
  let idleTimeout = null;
  // Re-armed around each upstream read, so this is an idle limit and not a total limit.
  const idle = {
    arm() {
      clearTimeout(idleTimeout);
      idleTimeout = setTimeout(() => controller.abort(), stallTimeoutMs);
    },
    clear() {
      clearTimeout(idleTimeout);
      idleTimeout = null;
    },
  };
  const cleanup = () => {
    request.signal.removeEventListener("abort", abortFromClient);
    clearTimeout(connectTimeout);
    clearTimeout(totalTimeout);
    clearTimeout(idleTimeout);
  };

  try {
    const headers = new Headers({ Accept: VIDEO_TYPE });
    if (range) headers.set("Range", range);
    const ifRange = request.headers.get("if-range");
    if (validIfRange(ifRange)) headers.set("If-Range", ifRange);

    const cached = await videoCache?.read(source.href, headers, controller.signal).catch(() => undefined);
    const upstream =
      cached ??
      (await fetchImpl(source.href, {
        headers,
        redirect: "error",
        signal: controller.signal,
      }));
    clearTimeout(connectTimeout);

    if (!upstream.ok) {
      await upstream.body?.cancel();
      cleanup();
      if (upstream.status === 416) {
        const contentRange = upstream.headers.get("content-range");
        return errorResponse(416, "Video range unavailable", {
          "Accept-Ranges": "bytes",
          ...(/^bytes \*\/\d+$/i.test(contentRange ?? "") ? { "Content-Range": contentRange } : {}),
        });
      }
      return errorResponse(upstream.status === 404 ? 404 : 502, "Video source unavailable");
    }

    const contentType = upstream.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (contentType !== VIDEO_TYPE || !upstream.body) {
      await upstream.body?.cancel();
      cleanup();
      return errorResponse(415, "Unsupported video type");
    }
    // Only a confirmed miss schedules another download. A slow or failed
    // storage lookup already has the upstream stream as its fallback.
    if (videoCache && defer && cached === null) {
      const task = videoCache.warm(source.href, videoSize(upstream), fetchImpl);
      if (task) defer(task);
    }

    const responseHeaders = new Headers({
      "Content-Type": VIDEO_TYPE,
      "Cache-Control": boundedMediaCache(request, CACHE_CONTROL, authOptions?.now),
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
      ...mediaContextHeaders(request),
      ...(videoCache ? { "X-Nest-Video-Cache": cached ? "hit" : "miss" } : {}),
      ...(cached?.headers.get("x-nest-video-store") === "drive" ? { "X-Nest-Video-Store": "drive" } : {}),
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
