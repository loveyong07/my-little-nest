import { safeArticleLink } from "../shared/article-links.mjs";
import { parseMediaSource } from "../shared/media-sources.mjs";
import { createTelemetryEmitter } from "./telemetry.mjs";

export const ARTICLE_DOCUMENT_VERSION = 1;
export const ARTICLE_REVALIDATE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const validatedAtByBlocks = new WeakMap();

/**
 * @typedef {import("../shared/contracts.mjs").ArticleLink} ArticleLink
 * @typedef {import("../shared/contracts.mjs").ArticleBlock} ArticleBlock
 * @typedef {import("../shared/contracts.mjs").MediaItem} ArticleMediaItem
 * @typedef {import("../shared/contracts.mjs").ArticleItem} ArticleItem
 */

/**
 * Extracts canonical unsigned media descriptors from an Article.
 * Rejects signed proxy URLs or untrusted hosts.
 *
 * @param {ArticleMediaItem[] | undefined} media
 * @returns {{ type: "photo" | "video", url: string }[] | null}
 */
export function canonicalArticleMedia(media = []) {
  if (!Array.isArray(media)) return null;
  /** @type {{ type: "photo" | "video", url: string }[]} */
  const canonical = [];
  for (const item of media) {
    /** @type {"photo" | "video" | null} */
    const type = (item?.type ?? "photo") === "video" ? "video" : (item?.type ?? "photo") === "photo" ? "photo" : null;
    const kind = type === "video" ? "video" : "image";
    if (!type || typeof item?.url !== "string" || parseMediaSource(item.url, kind)?.href !== item.url) {
      return null;
    }
    canonical.push({ type, url: item.url });
  }
  return canonical;
}

/**
 * Verifies that a cached or previous Article snapshot matches the current Article's
 * identity, text, cover image and unsigned media sequence.
 *
 * @param {{ id?: string, text?: string, coverUrl?: string | null, media?: ArticleMediaItem[] } | null | undefined} snapshot
 * @param {ArticleItem | null | undefined} article
 * @returns {boolean}
 */
export function sameArticleIdentity(snapshot, article) {
  if (!snapshot || !article || typeof article.id !== "string" || typeof article.text !== "string") return false;
  if (snapshot.id !== undefined && snapshot.id !== article.id) return false;
  if (snapshot.text !== article.text) return false;
  if ((snapshot.coverUrl ?? null) !== (article.coverUrl ?? null)) return false;
  const left = canonicalArticleMedia(snapshot.media ?? []);
  const right = canonicalArticleMedia(article.media ?? []);
  if (!left || !right || left.length !== right.length) return false;
  return left.every((item, index) => item.type === right[index].type && item.url === right[index].url);
}

/**
 * Validates and normalizes Article blocks against the Article's text, cover and media.
 * Ensures only unsigned source photo URLs and safe HTTP(S) links are accepted.
 *
 * @param {unknown} blocks
 * @param {ArticleItem | null | undefined} article
 * @returns {ArticleBlock[] | null}
 */
export function sanitizeArticleBlocks(blocks, article) {
  if (!Array.isArray(blocks) || blocks.length === 0 || blocks.length > 5000 || typeof article?.text !== "string") {
    return null;
  }
  const coverUrl = article.coverUrl ?? null;
  if (coverUrl !== null && parseMediaSource(coverUrl, "image")?.href !== coverUrl) return null;
  const media = canonicalArticleMedia(article.media ?? []);
  if (!media) return null;
  const allowedPhotos = new Set(media.filter((item) => item.type === "photo").map((item) => item.url));

  /** @type {ArticleBlock[]} */
  const sanitized = [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") return null;
    if (block.type === "divider") {
      sanitized.push({ type: "divider" });
      continue;
    }
    if (block.type === "photo") {
      if (typeof block.url !== "string" || !allowedPhotos.has(block.url)) return null;
      sanitized.push({ type: "photo", url: block.url });
      continue;
    }
    if (block.type === "text" && typeof block.text === "string") {
      /** @type {ArticleLink[] | undefined} */
      let links;
      if (block.links !== undefined) {
        if (!Array.isArray(block.links) || block.links.length === 0) return null;
        links = [];
        for (const link of block.links) {
          const url = safeArticleLink(link?.url);
          if (typeof link?.text !== "string" || !link.text || !block.text.includes(link.text) || !url) {
            return null;
          }
          links.push({ text: link.text, url });
        }
      }
      sanitized.push({ type: "text", text: block.text, ...(links ? { links } : {}) });
      continue;
    }
    return null;
  }

  // An SSR page or cached snapshot may lag behind a fresh API edit. Never apply old
  // positions to new text, or publish a partial document that omits an attached photo.
  const normalize = (text) => text.replace(/\s/g, "");
  if (
    normalize(
      sanitized
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n"),
    ) !== normalize(article.text)
  )
    return null;
  const positionedPhotos = new Set(sanitized.filter((block) => block.type === "photo").map((block) => block.url));
  if ([...allowedPhotos].some((url) => url !== coverUrl && !positionedPhotos.has(url))) return null;
  return sanitized;
}

/**
 * @param {unknown} blocks
 * @param {ArticleItem | null | undefined} article
 * @returns {boolean}
 */
export function validArticleBlocks(blocks, article) {
  return sanitizeArticleBlocks(blocks, article) !== null;
}

// Parse data literals only. The public page's hydration payload is a JSON string
// inside JavaScript; executing that script would run untrusted remote code.
export function articleDocumentFromHtml(html, postId) {
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (!script[1].includes("content_state")) continue;
    for (const literal of script[1].matchAll(/"(?:[^"\\]|\\.)*"/g)) {
      if (!literal[0].includes("content_state")) continue;
      try {
        const data = JSON.parse(JSON.parse(literal[0].replace(/\\x([0-9a-f]{2})/gi, "\\u00$1")));
        const tweet = data?.data?.tweet_result_by_rest_id;
        if (tweet?.rest_id !== postId) continue;
        const document = tweet.result?.article?.article_results?.result;
        if (Array.isArray(document?.content_state?.blocks)) return document;
      } catch {
        // Other script literals are unrelated; never evaluate JavaScript.
      }
    }
  }
  return null;
}

export function normalizedArticleDocument(document, article) {
  const state = document?.content_state;
  if (!Array.isArray(state?.blocks) || state.blocks.length > 5000) return null;
  const rawEntities = state.entity_map ?? state.entities;
  const entities = new Map(
    Array.isArray(rawEntities)
      ? rawEntities.map((entry) => [String(entry.key), entry.value])
      : Object.entries(rawEntities ?? {}),
  );
  const mediaById = new Map(
    (document.media_entities ?? []).map((item) => [String(item.media_id), item.media_info?.original_img_url]),
  );
  const allowedPhotos = new Set((article.media ?? []).filter((item) => item.type === "photo").map((item) => item.url));
  const blocks = [];
  for (const block of state.blocks) {
    if (block.type === "atomic") {
      if (!block.entity_ranges?.length) return null;
      for (const range of block.entity_ranges ?? []) {
        const entity = entities.get(String(range.key));
        if (entity?.type === "DIVIDER") blocks.push({ type: "divider" });
        else if (entity?.type === "MEDIA") {
          for (const item of entity.data?.media_items ?? []) {
            const url = mediaById.get(String(item.media_id));
            if (!allowedPhotos.has(url)) return null;
            blocks.push({ type: "photo", url });
          }
        } else return null; // Unknown atomic content must not be silently reordered.
      }
      continue;
    }
    if (typeof block.text !== "string") return null;
    const links = (block.entity_ranges ?? []).flatMap((range) => {
      const entity = entities.get(String(range.key));
      const url = entity?.type === "LINK" ? safeArticleLink(entity.data?.url) : null;
      return url ? [{ text: block.text.slice(range.offset, range.offset + range.length), url }] : [];
    });
    blocks.push({ type: "text", text: block.text, ...(links.length ? { links } : {}) });
  }
  return sanitizeArticleBlocks(blocks, article);
}

export async function loadArticleDocument(article, fetchImpl, signal) {
  try {
    const source = new URL(article.permalink);
    if (source.origin !== "https://x.com" || !/^\/[A-Za-z0-9_]+\/status\/\d+$/.test(source.pathname)) return null;
    source.pathname = source.pathname.replace("/status/", "/article/");
    const response = await fetchImpl(source, { signal, redirect: "error", headers: { Accept: "text/html" } });
    if (!response.ok || !response.body) return null;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let html = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_PAGE_BYTES) return null;
        html += decoder.decode(value, { stream: true });
      }
      html += decoder.decode();
    } finally {
      await reader.cancel().catch(() => {});
    }
    return normalizedArticleDocument(articleDocumentFromHtml(html, article.id), article);
  } catch {
    return null;
  }
}

export async function enrichArticleDocuments(
  articles,
  previous,
  fetchImpl,
  {
    articleCache = null,
    defer = (task) => void Promise.resolve(task).catch(() => {}),
    now = Date.now,
    revalidateMs = ARTICLE_REVALIDATE_TTL_MS,
    timeoutMs = 6000,
    onEvent = null,
  } = {},
) {
  if (!articles.length || (!fetchImpl && !articleCache && !previous?.length)) return articles;
  const emit = createTelemetryEmitter(onEvent);
  const prepared = articles.map((article) => {
    const copy = { ...article };
    delete copy.blocks;
    const old = previous?.find((item) => item.id === copy.id);
    const memoryBlocks = old && sameArticleIdentity(old, copy) ? sanitizeArticleBlocks(old.blocks, copy) : null;
    const memoryValidatedAt = memoryBlocks ? validatedAtByBlocks.get(old.blocks) : undefined;
    if (memoryBlocks && Number.isFinite(memoryValidatedAt)) {
      validatedAtByBlocks.set(memoryBlocks, memoryValidatedAt);
    }
    return {
      article: copy,
      memoryBlocks,
      memoryValidatedAt,
    };
  });
  const result = prepared.map(({ article, memoryBlocks }) =>
    memoryBlocks ? { ...article, blocks: memoryBlocks } : article,
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let next = 0;
  try {
    await Promise.all(
      Array.from({ length: Math.min(4, result.length) }, async () => {
        while (next < result.length && !controller.signal.aborted) {
          const index = next++;
          const { article, memoryBlocks, memoryValidatedAt } = prepared[index];
          const startedAt = now();
          const checkTime = now();
          if (
            memoryBlocks &&
            Number.isFinite(memoryValidatedAt) &&
            checkTime >= memoryValidatedAt &&
            checkTime - memoryValidatedAt < revalidateMs
          ) {
            validatedAtByBlocks.set(memoryBlocks, memoryValidatedAt);
            result[index] = { ...article, blocks: memoryBlocks };
            emit({
              type: "x_article_document",
              articleId: article.id,
              outcome: "memory_hit",
              durationMs: Math.max(0, checkTime - startedAt),
            });
            continue;
          }

          let cachedEntry = null;
          if (articleCache) {
            try {
              cachedEntry = await articleCache.read(article, { signal: controller.signal });
            } catch {
              cachedEntry = null;
            }
          }
          const cachedBlocks =
            cachedEntry && sameArticleIdentity(cachedEntry, article)
              ? sanitizeArticleBlocks(cachedEntry.blocks, article)
              : null;
          const cachedValidatedAt =
            cachedBlocks && Number.isFinite(cachedEntry.validatedAt) ? cachedEntry.validatedAt : undefined;
          const afterCacheTime = now();
          if (
            cachedBlocks &&
            Number.isFinite(cachedValidatedAt) &&
            afterCacheTime >= cachedValidatedAt &&
            afterCacheTime - cachedValidatedAt < revalidateMs
          ) {
            validatedAtByBlocks.set(cachedBlocks, cachedValidatedAt);
            result[index] = { ...article, blocks: cachedBlocks };
            emit({
              type: "x_article_document",
              articleId: article.id,
              outcome: "blob_hit",
              durationMs: Math.max(0, afterCacheTime - startedAt),
            });
            continue;
          }

          const hadVerifiedFallback = Boolean(memoryBlocks || cachedBlocks);
          const blocks = fetchImpl ? await loadArticleDocument(article, fetchImpl, controller.signal) : null;
          const finishedAt = now();
          if (blocks) {
            validatedAtByBlocks.set(blocks, finishedAt);
            result[index] = { ...article, blocks };
            if (articleCache) {
              const pending = Promise.resolve()
                .then(() => articleCache.write(article, blocks, { validatedAt: finishedAt }))
                .catch(() => {});
              try {
                defer(pending);
              } catch {
                // Some local runtimes have no background-task context.
              }
            }
            emit({
              type: "x_article_document",
              articleId: article.id,
              outcome: hadVerifiedFallback ? "revalidated" : "fetched",
              durationMs: Math.max(0, finishedAt - startedAt),
            });
            continue;
          }

          const retained = memoryBlocks ?? cachedBlocks;
          const retainedAt = memoryValidatedAt ?? cachedValidatedAt;
          if (retained) {
            if (Number.isFinite(retainedAt)) validatedAtByBlocks.set(retained, retainedAt);
            result[index] = { ...article, blocks: retained };
            emit({
              type: "x_article_document",
              articleId: article.id,
              outcome: "stale_fallback",
              reason: fetchImpl ? "fetch_failed" : "fetch_disabled",
              durationMs: Math.max(0, finishedAt - startedAt),
            });
          } else {
            emit({
              type: "x_article_document",
              articleId: article.id,
              outcome: "unavailable",
              reason: fetchImpl ? "fetch_failed" : "fetch_disabled",
              durationMs: Math.max(0, finishedAt - startedAt),
            });
          }
        }
      }),
    );
  } finally {
    clearTimeout(timer);
  }
  return result;
}
