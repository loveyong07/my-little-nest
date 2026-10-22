import { get, put } from "@vercel/blob";
import { parseMediaSource } from "../shared/media-sources.mjs";
import { createTelemetryEmitter } from "./telemetry.mjs";
import {
  ARTICLE_DOCUMENT_VERSION,
  canonicalArticleMedia,
  sameArticleIdentity,
  sanitizeArticleBlocks,
} from "./x-article-document.mjs";

export const ARTICLE_CACHE_PREFIX = "x-articles/document-v1/";
export const MAX_ARTICLE_CACHE_BYTES = 256 * 1024;
const JSON_TYPES = new Set(["application/json", "text/plain"]);

/**
 * @param {string | undefined | null} id
 * @returns {string | null}
 */
export function articleCachePath(id) {
  return typeof id === "string" && /^\d+$/.test(id) ? `${ARTICLE_CACHE_PREFIX}${id}.json` : null;
}

/**
 * Serializes a verified Article block structure with unsigned source URLs.
 * Returns null if the Article or blocks fail identity/structure validation.
 *
 * @param {import("./x-article-document.mjs").ArticleItem} article
 * @param {unknown} blocks
 * @param {number} validatedAt
 * @returns {Uint8Array | null}
 */
export function serializeArticleDocumentRecord(article, blocks, validatedAt) {
  if (!articleCachePath(article?.id) || !Number.isFinite(validatedAt) || validatedAt <= 0) return null;
  const coverUrl = article.coverUrl ?? null;
  if (coverUrl !== null && parseMediaSource(coverUrl, "image")?.href !== coverUrl) return null;
  const media = canonicalArticleMedia(article.media ?? []);
  const cleanBlocks = sanitizeArticleBlocks(blocks, article);
  if (!media || !cleanBlocks) return null;
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      version: ARTICLE_DOCUMENT_VERSION,
      id: article.id,
      validatedAt: Math.trunc(validatedAt),
      text: article.text,
      coverUrl,
      media,
      blocks: cleanBlocks,
    }),
  );
  return bytes.byteLength > 0 && bytes.byteLength <= MAX_ARTICLE_CACHE_BYTES ? bytes : null;
}

/**
 * Parses and validates a cached Article JSON payload against the live timeline Article.
 *
 * @param {string} rawText
 * @param {import("./x-article-document.mjs").ArticleItem} article
 * @returns {{
 *   id: string,
 *   version: number,
 *   validatedAt: number,
 *   text: string,
 *   coverUrl: string | null,
 *   media: import("./x-article-document.mjs").ArticleMediaItem[],
 *   blocks: import("./x-article-document.mjs").ArticleBlock[],
 * } | null}
 */
export function parseArticleDocumentRecord(rawText, article) {
  if (typeof rawText !== "string" || !rawText || rawText.length > MAX_ARTICLE_CACHE_BYTES) return null;
  try {
    const record = JSON.parse(rawText);
    if (
      record?.version !== ARTICLE_DOCUMENT_VERSION ||
      record?.id !== article?.id ||
      !Number.isFinite(record?.validatedAt) ||
      record.validatedAt <= 0 ||
      !sameArticleIdentity(record, article)
    ) {
      return null;
    }
    const blocks = sanitizeArticleBlocks(record.blocks, article);
    if (!blocks) return null;
    return {
      id: record.id,
      version: record.version,
      validatedAt: Math.trunc(record.validatedAt),
      text: record.text,
      coverUrl: record.coverUrl ?? null,
      media: record.media,
      blocks,
    };
  } catch {
    return null;
  }
}

// This adapter is injected by the Vercel entry point (api/x-posts.js). Other runtimes
// retain in-memory caching without loading the Blob SDK or its credentials.
export function createBlobArticleCache({
  env = process.env,
  sdk = { get, put },
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
  /** @type {Promise<unknown>} */
  let queue = Promise.resolve();
  const writes = new Map();

  return {
    /**
     * @param {import("./x-article-document.mjs").ArticleItem} article
     * @param {{ signal?: AbortSignal }} [options]
     */
    async read(article, { signal = undefined } = {}) {
      const startedAt = now();
      const pathname = articleCachePath(article?.id);
      if (!pathname) {
        emit({
          type: "x_article_cache",
          layer: "function_blob",
          operation: "read",
          outcome: "skipped",
          reason: "invalid_id",
          durationMs: 0,
        });
        return null;
      }
      if (now() < readUnavailableUntil) {
        emit({
          type: "x_article_cache",
          layer: "function_blob",
          operation: "read",
          articleId: article.id,
          outcome: "skipped",
          reason: "circuit_open",
          durationMs: 0,
        });
        return null;
      }
      const abortSignal = AbortSignal.any([AbortSignal.timeout(readTimeoutMs), ...(signal ? [signal] : [])]);
      let reader;
      let complete = false;
      const cancel = () => void reader?.cancel().catch(() => {});
      try {
        const cached = await sdk.get(pathname, { ...credentials, access: "private", abortSignal });
        if (!cached || Number(cached.statusCode) === 404) {
          emit({
            type: "x_article_cache",
            layer: "function_blob",
            operation: "read",
            articleId: article.id,
            outcome: "miss",
            reason: "not_found",
            durationMs: Math.max(0, now() - startedAt),
          });
          return null;
        }
        const contentType = cached.blob?.contentType?.split(";")[0].trim().toLowerCase() ?? "";
        if (
          cached.statusCode !== 200 ||
          (contentType && !JSON_TYPES.has(contentType)) ||
          !cached.stream ||
          !Number.isFinite(cached.blob?.size) ||
          cached.blob.size <= 0 ||
          cached.blob.size > MAX_ARTICLE_CACHE_BYTES
        ) {
          await cached.stream?.cancel();
          emit({
            type: "x_article_cache",
            layer: "function_blob",
            operation: "read",
            articleId: article.id,
            outcome: "miss",
            reason: "invalid_blob",
            durationMs: Math.max(0, now() - startedAt),
          });
          return null;
        }
        reader = cached.stream.getReader();
        abortSignal.addEventListener("abort", cancel, { once: true });
        const decoder = new TextDecoder();
        let size = 0;
        let text = "";
        while (true) {
          abortSignal.throwIfAborted();
          const { done, value } = await reader.read();
          abortSignal.throwIfAborted();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_ARTICLE_CACHE_BYTES) {
            emit({
              type: "x_article_cache",
              layer: "function_blob",
              operation: "read",
              articleId: article.id,
              outcome: "miss",
              reason: "invalid_blob",
              durationMs: Math.max(0, now() - startedAt),
            });
            return null;
          }
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
        if (size !== cached.blob.size) {
          emit({
            type: "x_article_cache",
            layer: "function_blob",
            operation: "read",
            articleId: article.id,
            outcome: "miss",
            reason: "size_mismatch",
            durationMs: Math.max(0, now() - startedAt),
          });
          return null;
        }
        complete = true;
        const parsed = parseArticleDocumentRecord(text, article);
        emit({
          type: "x_article_cache",
          layer: "function_blob",
          operation: "read",
          articleId: article.id,
          outcome: parsed ? "hit" : "miss",
          ...(parsed ? {} : { reason: "validation_failed" }),
          durationMs: Math.max(0, now() - startedAt),
        });
        return parsed;
      } catch (error) {
        const isNotFound = error?.name === "BlobNotFoundError" || error?.status === 404;
        if (!isNotFound && !signal?.aborted) {
          readUnavailableUntil = now() + 60000;
        }
        emit({
          type: "x_article_cache",
          layer: "function_blob",
          operation: "read",
          articleId: article.id,
          outcome: isNotFound ? "miss" : "error",
          reason: isNotFound
            ? "not_found"
            : signal?.aborted
              ? "aborted"
              : abortSignal.aborted
                ? "timeout"
                : "storage_error",
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

    async write(article, blocks, { validatedAt = now() } = {}) {
      const pathname = articleCachePath(article?.id);
      const payload = pathname ? serializeArticleDocumentRecord(article, blocks, validatedAt) : null;
      if (!pathname || !payload) {
        emit({
          type: "x_article_cache",
          layer: "function_blob",
          operation: "write",
          articleId: article?.id ?? null,
          outcome: "skipped",
          reason: "invalid_input",
          durationMs: 0,
        });
        return false;
      }
      if (now() < writeUnavailableUntil) {
        emit({
          type: "x_article_cache",
          layer: "function_blob",
          operation: "write",
          articleId: article.id,
          outcome: "skipped",
          reason: "circuit_open",
          durationMs: 0,
        });
        return false;
      }
      if (writes.has(pathname)) return writes.get(pathname);
      if (writes.size >= 8) {
        emit({
          type: "x_article_cache",
          layer: "function_blob",
          operation: "write",
          articleId: article.id,
          outcome: "skipped",
          reason: "queue_full",
          durationMs: 0,
        });
        return false;
      }
      const pending = queue.then(async () => {
        if (now() < writeUnavailableUntil) return false;
        const writeStartedAt = now();
        try {
          const abortSignal = AbortSignal.timeout(writeTimeoutMs);
          await sdk.put(pathname, payload, {
            ...credentials,
            access: "private",
            contentType: "application/json; charset=utf-8",
            addRandomSuffix: false,
            allowOverwrite: true,
            cacheControlMaxAge: 86400,
            abortSignal,
          });
          emit({
            type: "x_article_cache",
            layer: "function_blob",
            operation: "write",
            articleId: article.id,
            outcome: "written",
            bytes: payload.byteLength,
            durationMs: Math.max(0, now() - writeStartedAt),
          });
          return true;
        } catch {
          writeUnavailableUntil = now() + 60000;
          emit({
            type: "x_article_cache",
            layer: "function_blob",
            operation: "write",
            articleId: article.id,
            outcome: "error",
            reason: "storage_error",
            durationMs: Math.max(0, now() - writeStartedAt),
          });
          return false;
        }
      });
      writes.set(pathname, pending);
      queue = pending;
      try {
        return await pending;
      } finally {
        writes.delete(pathname);
      }
    },
  };
}
