const MEDIA_HOST = "pbs.twimg.com";
const MEDIA_PATHS = ["/media/", "/profile_images/", "/ext_tw_video_thumb/"];
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const CACHE_CONTROL = "public, max-age=1800, s-maxage=43200";

function parseXImageUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const allowedPath = MEDIA_PATHS.some((prefix) => url.pathname.startsWith(prefix));
    return url.protocol === "https:" && url.hostname === MEDIA_HOST && !url.username && !url.password
      && !url.port && allowedPath ? url : null;
  } catch {
    return null;
  }
}

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
  const source = sourceValues.length === 1 ? parseXImageUrl(sourceValues[0]) : null;
  if (!source) return errorResponse(400, "Unsupported image URL");

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
