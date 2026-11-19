import { del, get, head, list, put } from "@vercel/blob";
import { parseMediaSource } from "../shared/media-sources.mjs";
import { createTelemetryEmitter } from "./telemetry.mjs";

export const PHOTO_CACHE_PREFIX = "x-photos/original-q90-v2/";
const legacyPhotoCachePrefix = "x-photos/original-q90-v1/";
export const PHOTO_CACHE_MAX_BYTES = 800_000_000;
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const USAGE_TTL_MS = 5 * 60 * 1000;
const MAX_EVICTIONS_PER_WRITE = 16;
const TYPES = new Set(["image/webp", "image/jpeg", "image/png"]);

function validPhotoBlob(blob) {
  return (
    TYPES.has(blob?.contentType) && Number.isSafeInteger(blob?.size) && blob.size > 0 && blob.size <= MAX_PHOTO_BYTES
  );
}

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
  sdk = { del, get, head, list, put },
  maxBytes = PHOTO_CACHE_MAX_BYTES,
  readTimeoutMs = 1500,
  writeTimeoutMs = 15000,
  now = Date.now,
  onEvent = null,
} = {}) {
  if (!env.BLOB_READ_WRITE_TOKEN && !env.BLOB_STORE_ID) return null;
  const credentials = env.BLOB_READ_WRITE_TOKEN ? { token: env.BLOB_READ_WRITE_TOKEN } : { storeId: env.BLOB_STORE_ID };
  const emit = createTelemetryEmitter(onEvent, env);
  let readUnavailableUntil = 0;
  let writeUnavailableUntil = 0;
  let usage;
  let usageAt = 0;
  let hasLegacyBlobs = true;
  /** @type {Array<{ url: string, size: number, uploadedAt: number }>} */
  let evictableBlobs = [];
  /** @type {Promise<unknown>} */
  let queue = Promise.resolve();
  const writes = new Map();

  async function refreshInventory(signal) {
    let cursor;
    let bytes = 0;
    let foundLegacy = false;
    const candidates = [];
    do {
      const page = await sdk.list({ ...credentials, limit: 1000, cursor, abortSignal: signal });
      for (const blob of page.blobs) {
        bytes += blob.size;
        const pathname = typeof blob.pathname === "string" ? blob.pathname : "";
        if (pathname.startsWith(legacyPhotoCachePrefix)) foundLegacy = true;
        if (
          typeof blob.url === "string" &&
          blob.url &&
          blob.uploadedAt &&
          (pathname.startsWith(PHOTO_CACHE_PREFIX) || pathname.startsWith(legacyPhotoCachePrefix))
        ) {
          const uploadedAt =
            blob.uploadedAt instanceof Date ? blob.uploadedAt.getTime() : Date.parse(String(blob.uploadedAt));
          if (Number.isFinite(uploadedAt)) candidates.push({ url: blob.url, size: blob.size, uploadedAt });
        }
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    candidates.sort((left, right) => left.uploadedAt - right.uploadedAt);
    usage = bytes;
    usageAt = now();
    hasLegacyBlobs = foundLegacy;
    evictableBlobs = candidates;
    return bytes;
  }

  async function storeBytes(signal) {
    if (usage !== undefined && now() - usageAt < USAGE_TTL_MS) return usage;
    return refreshInventory(signal);
  }

  async function evictOldest(neededBytes, signal) {
    if (typeof sdk.del !== "function") return false;
    if (usage === undefined || now() - usageAt >= USAGE_TTL_MS) await refreshInventory(signal);
    let count = 0;
    let reclaimed = 0;
    while (
      usage - reclaimed + neededBytes > maxBytes &&
      count < evictableBlobs.length &&
      count < MAX_EVICTIONS_PER_WRITE
    ) {
      reclaimed += evictableBlobs[count].size;
      count += 1;
    }
    if (!count || usage - reclaimed + neededBytes > maxBytes) return false;
    try {
      await sdk.del(
        evictableBlobs.slice(0, count).map((item) => item.url),
        { ...credentials, abortSignal: signal },
      );
    } catch {
      // The remote operation may have partially succeeded. Re-list before the next write.
      usage = undefined;
      return false;
    }
    evictableBlobs.splice(0, count);
    usage = Math.max(0, usage - reclaimed);
    return true;
  }

  return {
    /**
     * @param {string} source
     * @param {{ signal?: AbortSignal }} [options]
     */
    async read(source, { signal = undefined } = {}) {
      const startedAt = now();
      if (startedAt < readUnavailableUntil) {
        emit({
          type: "x_photo_cache",
          layer: "function_blob",
          operation: "read",
          outcome: "skipped",
          reason: "circuit_open",
          durationMs: 0,
        });
        return null;
      }
      const pathname = await photoCachePath(source);
      if (!pathname) {
        emit({
          type: "x_photo_cache",
          layer: "function_blob",
          operation: "read",
          outcome: "skipped",
          reason: "not_cacheable",
          durationMs: Math.max(0, now() - startedAt),
        });
        return null;
      }
      const abortSignal = AbortSignal.any([AbortSignal.timeout(readTimeoutMs), ...(signal ? [signal] : [])]);
      let reader;
      let complete = false;
      const cancel = () => void reader?.cancel().catch(() => {});
      try {
        /** @type {import("@vercel/blob").GetCommandOptions} */
        const options = { ...credentials, access: "private", abortSignal };
        const current = await sdk.get(pathname, options);
        // Older WebPs are reusable. Original bytes written by v1 have no record
        // of why encoding was skipped, so give them a new conversion attempt.
        const cached =
          current ??
          (hasLegacyBlobs
            ? await sdk.get(pathname.replace(PHOTO_CACHE_PREFIX, legacyPhotoCachePrefix), options)
            : null);
        if (!cached) {
          emit({
            type: "x_photo_cache",
            layer: "function_blob",
            operation: "read",
            outcome: "miss",
            reason: "not_found",
            durationMs: Math.max(0, now() - startedAt),
          });
          return null;
        }
        const contentType = cached.blob.contentType;
        if (
          cached.statusCode !== 200 ||
          !validPhotoBlob(cached.blob) ||
          (!current && contentType !== "image/webp") ||
          !cached.stream
        ) {
          await cached.stream?.cancel();
          emit({
            type: "x_photo_cache",
            layer: "function_blob",
            operation: "read",
            outcome: "miss",
            reason:
              !current && contentType !== "image/webp"
                ? "legacy_original"
                : Number(cached.statusCode) === 404
                  ? "not_found"
                  : "invalid_blob",
            durationMs: Math.max(0, now() - startedAt),
          });
          return null;
        }
        reader = cached.stream.getReader();
        abortSignal.addEventListener("abort", cancel, { once: true });
        const image = new Uint8Array(cached.blob.size);
        let size = 0;
        while (true) {
          abortSignal.throwIfAborted();
          const { done, value } = await reader.read();
          abortSignal.throwIfAborted();
          if (done) break;
          if (size + value.byteLength > image.byteLength) {
            size += value.byteLength;
            break;
          }
          image.set(value, size);
          size += value.byteLength;
        }
        if (size !== cached.blob.size) {
          emit({
            type: "x_photo_cache",
            layer: "function_blob",
            operation: "read",
            outcome: "miss",
            reason: "size_mismatch",
            durationMs: Math.max(0, now() - startedAt),
          });
          return null;
        }
        complete = true;
        emit({
          type: "x_photo_cache",
          layer: "function_blob",
          operation: "read",
          outcome: "hit",
          contentType,
          bytes: size,
          durationMs: Math.max(0, now() - startedAt),
        });
        return { image, contentType };
      } catch {
        if (!signal?.aborted) {
          readUnavailableUntil = now() + 60000;
          writeUnavailableUntil = now() + 60000;
        }
        emit({
          type: "x_photo_cache",
          layer: "function_blob",
          operation: "read",
          outcome: "error",
          reason: signal?.aborted ? "aborted" : abortSignal.aborted ? "timeout" : "storage_error",
          durationMs: Math.max(0, now() - startedAt),
        });
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
      if (now() < writeUnavailableUntil) {
        emit({
          type: "x_photo_cache",
          layer: "function_blob",
          operation: "write",
          outcome: "skipped",
          reason: "circuit_open",
          durationMs: 0,
        });
        return false;
      }
      if (!TYPES.has(contentType) || !image?.byteLength || image.byteLength > MAX_PHOTO_BYTES) {
        emit({
          type: "x_photo_cache",
          layer: "function_blob",
          operation: "write",
          outcome: "skipped",
          reason: "invalid_input",
          durationMs: 0,
        });
        return false;
      }
      const canonical = cacheablePhoto(source)?.href;
      if (!canonical) {
        emit({
          type: "x_photo_cache",
          layer: "function_blob",
          operation: "write",
          outcome: "skipped",
          reason: "not_cacheable",
          durationMs: 0,
        });
        return false;
      }
      if (writes.has(canonical)) return writes.get(canonical);
      if (writes.size >= 8) {
        emit({
          type: "x_photo_cache",
          layer: "function_blob",
          operation: "write",
          outcome: "skipped",
          reason: "queue_full",
          durationMs: 0,
        });
        return false;
      }
      const pending = queue.then(async () => {
        if (now() < writeUnavailableUntil) return false;
        const startedAt = now();
        try {
          const pathname = await photoCachePath(canonical);
          const abortSignal = AbortSignal.timeout(writeTimeoutMs);
          if ((await storeBytes(abortSignal)) + image.byteLength > maxBytes) {
            const evicted = await evictOldest(image.byteLength, abortSignal);
            if (!evicted) {
              emit({
                type: "x_photo_cache",
                layer: "function_blob",
                operation: "write",
                outcome: "skipped",
                reason: "budget_exceeded",
                durationMs: Math.max(0, now() - startedAt),
              });
              return false;
            }
          }
          try {
            await sdk.put(pathname, image, {
              ...credentials,
              access: "private",
              contentType,
              addRandomSuffix: false,
              allowOverwrite: false,
              cacheControlMaxAge: 86400,
              abortSignal,
            });
          } catch (error) {
            // Another writer may have completed the same immutable key. Verify
            // the object in storage without depending on the SDK's error text.
            const existing = abortSignal.aborted
              ? null
              : await sdk.head?.(pathname, { ...credentials, abortSignal }).catch(() => null);
            if (existing?.pathname !== pathname || !validPhotoBlob(existing)) throw error;
            usage = undefined;
            emit({
              type: "x_photo_cache",
              layer: "function_blob",
              operation: "write",
              outcome: "exists",
              contentType: existing.contentType,
              durationMs: Math.max(0, now() - startedAt),
            });
            return "exists";
          }
          usage += image.byteLength;
          emit({
            type: "x_photo_cache",
            layer: "function_blob",
            operation: "write",
            outcome: "written",
            contentType,
            bytes: image.byteLength,
            durationMs: Math.max(0, now() - startedAt),
          });
          return "written";
        } catch {
          // Quota and outages must never break photo delivery.
          usage = undefined;
          writeUnavailableUntil = now() + 60000;
          emit({
            type: "x_photo_cache",
            layer: "function_blob",
            operation: "write",
            outcome: "error",
            reason: "storage_error",
            durationMs: Math.max(0, now() - startedAt),
          });
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
