const MEDIA_HOSTS = new Set(["pbs.twimg.com", "video.twimg.com", "abs.twimg.com"]);
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

async function readLimitedImage(body) {
  if (!body) return null;
  const reader = body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
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

export async function proxyXMedia(request, fetchImpl = globalThis.fetch) {
  if (request.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET", "Cache-Control": "no-store" },
    });
  }

  const requestUrl = new URL(request.url);
  const sourceValues = requestUrl.searchParams.getAll("url");
  if (sourceValues.length !== 1) return errorResponse(400, "Unsupported image URL");
  let source;
  try {
    source = new URL(sourceValues[0]);
  } catch {
    return errorResponse(400, "Unsupported image URL");
  }
  if (source.protocol !== "https:" || !MEDIA_HOSTS.has(source.hostname)
    || source.username || source.password || source.port) {
    return errorResponse(403, "Unsupported image URL");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const upstream = await fetchImpl(source.href, {
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" },
      redirect: "error",
      signal: controller.signal,
    });
    if (!upstream.ok) {
      await upstream.body?.cancel();
      return errorResponse(upstream.status === 404 ? 404 : 502, "Image source unavailable");
    }

    const contentType = upstream.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (!IMAGE_TYPES.has(contentType)) {
      await upstream.body?.cancel();
      return errorResponse(415, "Unsupported image type");
    }
    const contentLength = Number(upstream.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      await upstream.body?.cancel();
      return errorResponse(413, "Image is too large");
    }
    const body = await readLimitedImage(upstream.body);
    if (body.tooLarge) return errorResponse(413, "Image is too large");
    if (!body.image?.byteLength) return errorResponse(502, "Image source unavailable");

    return new Response(body.image, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": CACHE_CONTROL,
        "Vercel-CDN-Cache-Control": VERCEL_CDN_CACHE_CONTROL,
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  } catch {
    return errorResponse(502, "Image source unavailable");
  } finally {
    clearTimeout(timeout);
  }
}
