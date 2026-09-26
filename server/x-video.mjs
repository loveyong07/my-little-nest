const VIDEO_HOST = "video.twimg.com";
const VIDEO_PATHS = ["/ext_tw_video/", "/amplify_video/", "/tweet_video/"];
const VIDEO_TYPE = "video/mp4";
const CACHE_CONTROL = "public, max-age=1800, s-maxage=43200";

function parseXVideoUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const allowedPath = VIDEO_PATHS.some((prefix) => url.pathname.startsWith(prefix));
    return url.protocol === "https:" && url.hostname === VIDEO_HOST && !url.username && !url.password
      && !url.port && allowedPath ? url : null;
  } catch {
    return null;
  }
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

function responseBody(upstreamBody, controller, cleanup) {
  const reader = upstreamBody.getReader();
  return new ReadableStream({
    async pull(streamController) {
      try {
        const { done, value } = await reader.read();
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

export async function proxyXVideo(request, fetchImpl = globalThis.fetch) {
  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed", { Allow: "GET" });
  }

  const requestUrl = new URL(request.url);
  const sourceValues = requestUrl.searchParams.getAll("url");
  const source = sourceValues.length === 1 ? parseXVideoUrl(sourceValues[0]) : null;
  if (!source) return errorResponse(400, "Unsupported video URL");

  const range = request.headers.get("range");
  if (!validSingleByteRange(range)) {
    return errorResponse(416, "Unsupported byte range", { "Accept-Ranges": "bytes", "Content-Range": "bytes */*" });
  }

  const controller = new AbortController();
  const abortFromClient = () => controller.abort(request.signal.reason);
  if (request.signal.aborted) abortFromClient();
  else request.signal.addEventListener("abort", abortFromClient, { once: true });
  const timeout = setTimeout(() => controller.abort(), 15000);
  const cleanup = () => request.signal.removeEventListener("abort", abortFromClient);

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
    clearTimeout(timeout);

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
      "Cache-Control": CACHE_CONTROL,
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
    });
    for (const name of ["content-length", "content-range", "etag", "last-modified"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }

    return new Response(responseBody(upstream.body, controller, cleanup), {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    clearTimeout(timeout);
    cleanup();
    return errorResponse(502, "Video source unavailable");
  }
}
