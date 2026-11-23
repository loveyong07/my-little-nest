import { get, head, list, put } from "@vercel/blob";
import { createTelemetryEmitter } from "./telemetry.mjs";

const PREFIX = "x-videos/mp4-v1/";
const VIDEO_TYPE = "video/mp4";
const MAX_VIDEO_SIZE = 100_000_000;
const MAX_VIDEO_BYTES = 500_000_000;
const MAX_STORE_BYTES = 750_000_000;
const INVENTORY_TTL_MS = 5 * 60_000;

async function videoPath(source) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  const hex = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${PREFIX}${hex}.mp4`;
}

function isMp4(value) {
  return value?.split(";")[0].trim().toLowerCase() === VIDEO_TYPE;
}

function matchesIfRange(value, headers) {
  return value === headers.get(value.startsWith('"') ? "etag" : "last-modified");
}

async function downloadVideo(source, size, fetchImpl, signal) {
  const response = await fetchImpl(source, { headers: { Accept: VIDEO_TYPE }, redirect: "error", signal });
  if (
    response.status !== 200 ||
    !isMp4(response.headers.get("content-type")) ||
    Number(response.headers.get("content-length")) !== size ||
    !response.body
  ) {
    await response.body?.cancel();
    return null;
  }
  const video = new Uint8Array(size);
  const reader = response.body.getReader();
  let offset = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return offset === size ? video : null;
      if (offset + value.byteLength > size) return null;
      video.set(value, offset);
      offset += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** @returns {import("./x-video.mjs").VideoCache | null} */
export function createBlobVideoCache({
  env = process.env,
  sdk = { get, head, list, put },
  readTimeoutMs = 1500,
  writeTimeoutMs = 45000,
  now = Date.now,
  onEvent = null,
} = {}) {
  if (!env.BLOB_READ_WRITE_TOKEN && !env.BLOB_STORE_ID) return null;
  const credentials = env.BLOB_READ_WRITE_TOKEN ? { token: env.BLOB_READ_WRITE_TOKEN } : { storeId: env.BLOB_STORE_ID };
  const emit = createTelemetryEmitter(onEvent, env);
  let inventory;
  let activeSource = null;
  let retryReadAt = 0;
  let retryWriteAt = 0;

  async function getInventory(abortSignal) {
    if (inventory && now() < inventory.expiresAt) return inventory;
    let cursor;
    let storeBytes = 0;
    let videoBytes = 0;
    do {
      const page = await sdk.list({ ...credentials, limit: 1000, cursor, abortSignal });
      for (const blob of page.blobs) {
        storeBytes += blob.size;
        if (blob.pathname.startsWith(PREFIX)) videoBytes += blob.size;
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    inventory = { storeBytes, videoBytes, expiresAt: now() + INVENTORY_TTL_MS };
    return inventory;
  }

  return {
    async read(source, headers, signal) {
      if (now() < retryReadAt || activeSource === source || signal.aborted) return;
      const pathname = await videoPath(source);
      const connection = new AbortController();
      const timeout = setTimeout(() => connection.abort(), readTimeoutMs);
      const abortSignal = AbortSignal.any([signal, connection.signal]);
      const range = headers.get("range");
      const ifRange = headers.get("if-range");
      try {
        /** @type {import("@vercel/blob").GetCommandOptions} */
        const options = { ...credentials, access: "private", abortSignal };
        let result = await sdk.get(pathname, { ...options, ...(range ? { headers: { Range: range } } : {}) });
        if (!result) return null;
        if (!result.stream) return;
        // Private Blob can serve a partial response even if If-Range mismatches.
        // Compare its validator ourselves and return the full stored object then.
        const fullResponse = range && ifRange && !matchesIfRange(ifRange, result.headers);
        if (fullResponse && result.headers.has("content-range")) {
          await result.stream.cancel();
          result = await sdk.get(pathname, options);
          if (!result?.stream) return;
        }
        // Blob's SDK exposes successful ranged reads as 200, with Content-Range
        // preserved from the storage response. The player needs the real 206.
        const contentRange = result.headers.get("content-range");
        const partial = /^bytes \d+-\d+\/\d+$/.test(contentRange ?? "");
        if (
          !isMp4(result.blob.contentType) ||
          (contentRange && (!partial || !range || fullResponse)) ||
          (range && !partial && !fullResponse)
        ) {
          await result.stream.cancel();
          return;
        }
        return new Response(result.stream, { status: partial ? 206 : 200, headers: result.headers });
      } catch {
        // A ranged request past the end can throw in the SDK. Leave its 416
        // response to the upstream and keep Blob reads available for valid ranges.
        if (!signal.aborted && (!range || connection.signal.aborted)) retryReadAt = now() + 15_000;
        return;
      } finally {
        clearTimeout(timeout);
      }
    },
    warm(source, size, fetchImpl) {
      if (activeSource || now() < retryWriteAt || !Number.isSafeInteger(size) || size <= 0 || size > MAX_VIDEO_SIZE)
        return null;
      // Limit background memory and writes in a warm function instance. Separate
      // instances use the same immutable key so only one stored copy can win.
      activeSource = source;
      return (async () => {
        const abortSignal = AbortSignal.timeout(writeTimeoutMs);
        try {
          const usage = await getInventory(abortSignal);
          if (usage.storeBytes + size > MAX_STORE_BYTES || usage.videoBytes + size > MAX_VIDEO_BYTES) {
            emit({ type: "x_video_cache", outcome: "budget_exceeded", bytes: size });
            return;
          }
          const pathname = await videoPath(source);
          const video = await downloadVideo(source, size, fetchImpl, abortSignal);
          if (!video) return;
          try {
            await sdk.put(pathname, video, {
              ...credentials,
              access: "private",
              contentType: VIDEO_TYPE,
              addRandomSuffix: false,
              allowOverwrite: false,
              cacheControlMaxAge: 86400,
              abortSignal,
            });
          } catch (error) {
            const existing = abortSignal.aborted
              ? null
              : await sdk.head(pathname, { ...credentials, abortSignal }).catch(() => null);
            if (existing?.pathname !== pathname || existing.size !== size || !isMp4(existing.contentType)) throw error;
            inventory = undefined;
            return;
          }
          usage.storeBytes += size;
          usage.videoBytes += size;
          emit({ type: "x_video_cache", outcome: "written", bytes: size });
        } catch {
          inventory = undefined;
          retryWriteAt = now() + 60_000;
          emit({ type: "x_video_cache", outcome: "failed", bytes: size });
        } finally {
          activeSource = null;
        }
      })();
    },
  };
}
