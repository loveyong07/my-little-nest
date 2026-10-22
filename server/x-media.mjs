import { authorizedMediaRequest, boundedMediaCache, parseMediaSource, validMediaQuery } from "./x-media-auth.mjs";
import { mediaContextHeaders } from "./media-request-policy.mjs";
import { encodeOriginalWebp } from "./x-image-webp.mjs";
import { createTelemetryEmitter } from "./telemetry.mjs";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";
const VERCEL_CDN_CACHE_CONTROL = "public, s-maxage=86400, stale-while-revalidate=604800";

function errorResponse(status, message) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function readLimitedImage(body, signal, readChunk) {
  if (!body) return null;
  const reader = body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel();
        return {};
      }
      const { done, value } = await readChunk(reader);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES) {
        await reader.cancel();
        return { tooLarge: true };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const image = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    image.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { image };
}

function streamLimitedImage(body, onDone, readChunk, abort) {
  const reader = body.getReader();
  let size = 0;
  let finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    try {
      reader.releaseLock();
    } catch {
      /* The stream may already be unlocked. */
    }
    onDone?.();
  }
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await readChunk(reader);
        if (done) {
          finish();
          controller.close();
          return;
        }
        size += value.byteLength;
        if (size > MAX_IMAGE_BYTES) {
          await reader.cancel();
          finish();
          controller.error(new Error("Image is too large"));
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        finish();
        controller.error(error);
      }
    },
    async cancel(reason) {
      try {
        const cancelled = reader.cancel(reason);
        abort(reason);
        await cancelled;
      } finally {
        finish();
      }
    },
  });
}

export async function proxyXMedia(
  request,
  fetchImpl = globalThis.fetch,
  authOptions = undefined,
  {
    connectTimeoutMs = 10000,
    stallTimeoutMs = 10000,
    totalTimeoutMs = 60000,
    webpEncoder = encodeOriginalWebp,
    photoCache = null,
    defer = (task) => void task.catch(() => {}),
    onEvent = null,
    now = Date.now,
  } = {},
) {
  if (request.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET", "Cache-Control": "no-store" },
    });
  }

  const requestUrl = new URL(request.url);
  const sourceValues = requestUrl.searchParams.getAll("url");
  if (sourceValues.length !== 1 || !validMediaQuery(request)) return errorResponse(400, "Unsupported image URL");
  let source;
  try {
    source = new URL(sourceValues[0]);
  } catch {
    return errorResponse(400, "Unsupported image URL");
  }
  source = parseMediaSource(source.href, "image");
  if (!source || !(await authorizedMediaRequest(request, source, "image", authOptions))) {
    return errorResponse(403, "Unsupported image URL");
  }

  const emit = createTelemetryEmitter(onEvent);
  const requestStartedAt = now();
  const usePhotoCache = photoCache && requestUrl.searchParams.get("format") === "webp";
  const cacheHeaders = {
    "Cache-Control": boundedMediaCache(request, CACHE_CONTROL, authOptions?.now),
    "Vercel-CDN-Cache-Control": boundedMediaCache(request, VERCEL_CDN_CACHE_CONTROL, authOptions?.now),
    "X-Content-Type-Options": "nosniff",
    ...mediaContextHeaders(request),
  };
  let blobError = false;
  if (usePhotoCache) {
    try {
      const cached = await photoCache.read(source.href, { signal: request.signal });
      if (
        cached?.image?.byteLength &&
        cached.image.byteLength <= MAX_IMAGE_BYTES &&
        ["image/webp", "image/jpeg", "image/png"].includes(cached.contentType)
      ) {
        emit({
          type: "x_media_proxy",
          layer: "function_blob",
          cache: "blob_hit",
          outcome: "ok",
          contentType: cached.contentType,
          durationMs: Math.max(0, now() - requestStartedAt),
        });
        return new Response(cached.image, {
          headers: { ...cacheHeaders, "Content-Type": cached.contentType, "X-Nest-Photo-Cache": "hit" },
        });
      }
    } catch {
      // A storage failure falls back to the existing upstream path.
      blobError = true;
    }
  }

  const controller = new AbortController();
  // A visitor that leaves must not leave an upstream image download running.
  const abortFromClient = () => controller.abort(request.signal.reason);
  if (request.signal.aborted) abortFromClient();
  else request.signal.addEventListener("abort", abortFromClient, { once: true });
  const connectTimeout = setTimeout(() => controller.abort(), connectTimeoutMs);
  // Keep a bounded lifetime, but allow healthy downloads to exceed the connection limit.
  const totalTimeout = setTimeout(() => controller.abort(), totalTimeoutMs);
  let idleTimeout;
  const cleanup = () => {
    clearTimeout(connectTimeout);
    clearTimeout(totalTimeout);
    clearTimeout(idleTimeout);
    request.signal.removeEventListener("abort", abortFromClient);
    controller.signal.removeEventListener("abort", cleanup);
  };
  controller.signal.addEventListener("abort", cleanup, { once: true });
  async function readChunk(reader) {
    // Backpressure alone is not an upstream stall: time only pending reads.
    idleTimeout = setTimeout(() => controller.abort(), stallTimeoutMs);
    try {
      return await reader.read();
    } finally {
      clearTimeout(idleTimeout);
    }
  }
  let streamingResponse = false;
  let keepTimeoutForStream = false;
  const upstreamStartedAt = now();
  try {
    const upstream = await fetchImpl(source.href, {
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" },
      redirect: "error",
      signal: controller.signal,
    });
    clearTimeout(connectTimeout);
    if (!upstream.ok) {
      await upstream.body?.cancel();
      emit({
        type: "x_media_proxy",
        cache: usePhotoCache ? "blob_miss" : "bypass",
        outcome: "upstream_error",
        reason: `http_${upstream.status}`,
        upstreamDurationMs: Math.max(0, now() - upstreamStartedAt),
        durationMs: Math.max(0, now() - requestStartedAt),
      });
      return errorResponse(upstream.status === 404 ? 404 : 502, "Image source unavailable");
    }

    let contentType = upstream.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (!IMAGE_TYPES.has(contentType)) {
      await upstream.body?.cancel();
      emit({
        type: "x_media_proxy",
        cache: usePhotoCache ? "blob_miss" : "bypass",
        outcome: "upstream_error",
        reason: "unsupported_type",
        upstreamDurationMs: Math.max(0, now() - upstreamStartedAt),
        durationMs: Math.max(0, now() - requestStartedAt),
      });
      return errorResponse(415, "Unsupported image type");
    }
    const contentLengthHeader = upstream.headers.get("content-length");
    const contentLength = contentLengthHeader === null ? Number.NaN : Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      await upstream.body?.cancel();
      emit({
        type: "x_media_proxy",
        cache: usePhotoCache ? "blob_miss" : "bypass",
        outcome: "upstream_error",
        reason: "too_large",
        upstreamDurationMs: Math.max(0, now() - upstreamStartedAt),
        durationMs: Math.max(0, now() - requestStartedAt),
      });
      return errorResponse(413, "Image is too large");
    }
    let responseBody;
    let upstreamDurationMs = 0;
    let encodeDurationMs = 0;
    let encodeFallback = false;
    const convertToWebp =
      requestUrl.searchParams.get("format") === "webp" && ["image/jpeg", "image/png"].includes(contentType);
    const persistableBody = usePhotoCache && ["image/webp", "image/jpeg", "image/png"].includes(contentType);
    if (
      !convertToWebp &&
      !persistableBody &&
      upstream.body &&
      contentLengthHeader !== null &&
      Number.isFinite(contentLength)
    ) {
      streamingResponse = true;
      upstreamDurationMs = Math.max(0, now() - upstreamStartedAt);
      // The stream can outlive this function, so it owns clearing the timeout and the listener.
      responseBody = streamLimitedImage(upstream.body, cleanup, readChunk, (reason) => controller.abort(reason));
    } else {
      const body = await readLimitedImage(upstream.body, controller.signal, readChunk);
      upstreamDurationMs = Math.max(0, now() - upstreamStartedAt);
      if (body?.tooLarge) {
        emit({
          type: "x_media_proxy",
          cache: usePhotoCache ? "blob_miss" : "bypass",
          outcome: "upstream_error",
          reason: "too_large",
          upstreamDurationMs,
          durationMs: Math.max(0, now() - requestStartedAt),
        });
        return errorResponse(413, "Image is too large");
      }
      if (!body?.image?.byteLength) {
        emit({
          type: "x_media_proxy",
          cache: usePhotoCache ? "blob_miss" : "bypass",
          outcome: "upstream_error",
          reason: "empty_body",
          upstreamDurationMs,
          durationMs: Math.max(0, now() - requestStartedAt),
        });
        return errorResponse(502, "Image source unavailable");
      }
      responseBody = body.image;
      if (convertToWebp) {
        const encodeStartedAt = now();
        try {
          const converted = await webpEncoder(body.image);
          if (converted?.byteLength) {
            responseBody = converted;
            contentType = "image/webp";
          } else {
            encodeFallback = true;
          }
        } catch {
          // Keep the full-resolution original when conversion is unavailable.
          encodeFallback = true;
        }
        encodeDurationMs = Math.max(0, now() - encodeStartedAt);
      }
    }

    if (usePhotoCache && responseBody instanceof Uint8Array) {
      const pending = Promise.resolve()
        .then(() => photoCache.write(source.href, responseBody, contentType))
        .catch(() => {});
      try {
        defer(pending);
      } catch {
        // Some local runtimes have no background-task context.
      }
    }
    emit({
      type: "x_media_proxy",
      layer: usePhotoCache ? "function_blob" : "upstream_stream",
      cache: usePhotoCache ? "blob_miss" : "bypass",
      outcome: encodeFallback ? "encode_fallback" : "ok",
      ...(blobError ? { reason: "blob_read_error" } : {}),
      contentType,
      upstreamDurationMs,
      encodeDurationMs,
      durationMs: Math.max(0, now() - requestStartedAt),
    });
    const response = new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        ...cacheHeaders,
        ...(usePhotoCache ? { "X-Nest-Photo-Cache": "miss" } : {}),
      },
    });
    keepTimeoutForStream = streamingResponse;
    return response;
  } catch {
    emit({
      type: "x_media_proxy",
      cache: usePhotoCache ? "blob_miss" : "bypass",
      outcome: "upstream_error",
      reason: request.signal.aborted ? "client_aborted" : "network_or_timeout",
      upstreamDurationMs: Math.max(0, now() - upstreamStartedAt),
      durationMs: Math.max(0, now() - requestStartedAt),
    });
    return errorResponse(502, "Image source unavailable");
  } finally {
    // A returned stream keeps the listener until it finishes or is cancelled.
    if (!keepTimeoutForStream) {
      cleanup();
    }
  }
}
