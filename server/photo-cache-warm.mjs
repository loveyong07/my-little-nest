import { cacheablePhoto } from "./photo-cache.mjs";

// Scan representations without changing the feed's order or Article blocks.
export function collectPhotoLinks(feed) {
  const photos = new Map();
  function visit(value) {
    if (typeof value === "string" && value.startsWith("/api/x-media?")) {
      const url = new URL(value, "https://local.invalid");
      const source = cacheablePhoto(url.searchParams.get("url"));
      if (url.searchParams.get("format") === "webp" && source) photos.set(source.href, value);
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  }
  visit(feed);
  return Array.from(photos, ([source, path]) => ({ source, path }));
}

/**
 * @param {{
 *   origin: string,
 *   cache: import("../shared/contracts.mjs").PhotoCacheAdapter,
 *   fetchImpl?: typeof globalThis.fetch,
 *   limit?: number,
 *   onProgress?: (progress: { total: number, cached: number, uploaded: number, failed: number, bytes: number }) => void,
 * }} options
 */
export async function warmPhotoCache({
  origin,
  cache,
  fetchImpl = fetch,
  limit = Infinity,
  onProgress = (_progress) => {},
}) {
  if (!cache) throw new Error("Blob storage is not configured");
  const feedResponse = await fetchImpl(new URL("/api/x-posts", origin), { signal: AbortSignal.timeout(60000) });
  if (!feedResponse.ok) throw new Error("Feed unavailable");
  const feed = await feedResponse.json();
  if (feed.status !== "ok") throw new Error("Feed unavailable");
  const photos = collectPhotoLinks(feed).slice(0, limit);
  const result = { total: photos.length, cached: 0, uploaded: 0, failed: 0, bytes: 0 };
  for (const { source, path } of photos) {
    try {
      if (await cache.read(source)) result.cached++;
      else {
        const response = await fetchImpl(new URL(path, origin), {
          headers: {
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Dest": "image",
            Referer: new URL("/posts", origin).href,
          },
          signal: AbortSignal.timeout(60000),
        });
        if (!response.ok || /\bno-store\b/i.test(response.headers.get("cache-control") ?? "")) {
          await response.body?.cancel();
          throw new Error("Photo response cannot be cached");
        }
        const contentType = response.headers.get("content-type")?.split(";")[0];
        const image = new Uint8Array(await response.arrayBuffer());
        const outcome = await cache.write(source, image, contentType);
        if (outcome === "exists") result.cached++;
        else if (outcome === "written") {
          result.uploaded++;
          result.bytes += image.byteLength;
        } else throw new Error("Photo not cached");
      }
    } catch {
      result.failed++;
    }
    onProgress({ ...result });
  }
  return result;
}
