import { get, list, put } from "@vercel/blob";
import { parseMediaSource } from "../shared/media-sources.mjs";

export const PHOTO_CACHE_PREFIX = "x-photos/original-q90-v1/";
export const PHOTO_CACHE_MAX_BYTES = 800_000_000;
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const TYPES = new Set(["image/webp", "image/jpeg", "image/png"]);

export function cacheablePhoto(value) {
  const source = parseMediaSource(value, "image");
  return source?.pathname.startsWith("/media/") &&
    source.searchParams.get("name") === "orig" &&
    ["jpg", "jpeg", "png", "webp"].includes(source.searchParams.get("format"))
    ? source
    : null;
}

export async function photoCachePath(value) {
  const source = cacheablePhoto(value);
  if (!source) return null;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source.href)));
  return PHOTO_CACHE_PREFIX + Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("") + ".image";
}

// This adapter is used only by the Vercel entry point. Other runtimes retain the
// existing source/encoder path and never load the Blob SDK or its credentials.
export function createBlobPhotoCache({
  env = process.env,
  sdk = { get, list, put },
  maxBytes = PHOTO_CACHE_MAX_BYTES,
  readTimeoutMs = 1500,
  writeTimeoutMs = 15000,
  now = Date.now,
} = {}) {
  if (!env.BLOB_READ_WRITE_TOKEN && !env.BLOB_STORE_ID) return null;
  const credentials = env.BLOB_READ_WRITE_TOKEN ? { token: env.BLOB_READ_WRITE_TOKEN } : { storeId: env.BLOB_STORE_ID };
  let readUnavailableUntil = 0;
  let writeUnavailableUntil = 0;
  let usage;
  let usageAt = 0;
  let queue = Promise.resolve();
  const writes = new Map();

  async function storeBytes(signal) {
    if (usage !== undefined && now() - usageAt < 60000) return usage;
    let cursor;
    let bytes = 0;
    do {
      const page = await sdk.list({ ...credentials, limit: 1000, cursor, abortSignal: signal });
      for (const blob of page.blobs) bytes += blob.size;
      if (bytes >= maxBytes) break;
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    usage = bytes;
    usageAt = now();
    return bytes;
  }

  return {
    async read(source, { signal } = {}) {
      if (now() < readUnavailableUntil) return null;
      const pathname = await photoCachePath(source);
      if (!pathname) return null;
      const abortSignal = AbortSignal.any([AbortSignal.timeout(readTimeoutMs), ...(signal ? [signal] : [])]);
      let reader;
      let complete = false;
      const cancel = () => void reader?.cancel().catch(() => {});
      try {
        const cached = await sdk.get(pathname, { ...credentials, access: "private", abortSignal });
        if (!cached) return null;
        const contentType = cached.blob.contentType;
        if (
          cached.statusCode !== 200 ||
          !TYPES.has(contentType) ||
          !cached.stream ||
          !Number.isFinite(cached.blob.size) ||
          cached.blob.size <= 0 ||
          cached.blob.size > MAX_PHOTO_BYTES
        ) {
          await cached.stream?.cancel();
          return null;
        }
        reader = cached.stream.getReader();
        abortSignal.addEventListener("abort", cancel, { once: true });
        const chunks = [];
        let size = 0;
        while (true) {
          abortSignal.throwIfAborted();
          const { done, value } = await reader.read();
          abortSignal.throwIfAborted();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_PHOTO_BYTES) return null;
          chunks.push(value);
        }
        if (size !== cached.blob.size) return null;
        const image = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          image.set(chunk, offset);
          offset += chunk.byteLength;
        }
        complete = true;
        return { image, contentType };
      } catch {
        if (!signal?.aborted) {
          readUnavailableUntil = now() + 60000;
          writeUnavailableUntil = now() + 60000;
        }
        return null;
      } finally {
        abortSignal.removeEventListener("abort", cancel);
        if (reader) {
          if (!complete) await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
      }
    },
    async write(source, image, contentType) {
      if (
        now() < writeUnavailableUntil ||
        !TYPES.has(contentType) ||
        !image?.byteLength ||
        image.byteLength > MAX_PHOTO_BYTES
      )
        return false;
      const canonical = cacheablePhoto(source)?.href;
      if (!canonical) return false;
      if (writes.has(canonical)) return writes.get(canonical);
      if (writes.size >= 8) return false;
      const pending = queue.then(async () => {
        if (now() < writeUnavailableUntil) return false;
        try {
          const pathname = await photoCachePath(canonical);
          const abortSignal = AbortSignal.timeout(writeTimeoutMs);
          if ((await storeBytes(abortSignal)) + image.byteLength > maxBytes) return false;
          await sdk.put(pathname, image, {
            ...credentials,
            access: "private",
            contentType,
            addRandomSuffix: false,
            allowOverwrite: false,
            cacheControlMaxAge: 86400,
            abortSignal,
          });
          usage += image.byteLength;
          return true;
        } catch {
          // Quota, outages and concurrent creates must never break photo delivery.
          usage = undefined;
          writeUnavailableUntil = now() + 60000;
          return false;
        }
      });
      writes.set(canonical, pending);
      queue = pending;
      try {
        return await pending;
      } finally {
        writes.delete(canonical);
      }
    },
  };
}
