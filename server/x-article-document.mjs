import { safeArticleLink } from "../shared/article-links.mjs";

const MAX_PAGE_BYTES = 2 * 1024 * 1024;

// Parse data literals only. The public page's hydration payload is a JSON string
// inside JavaScript; executing that script would run untrusted remote code.
export function articleDocumentFromHtml(html, postId) {
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
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
  // An SSR page may lag behind a fresh API edit. Never apply old positions to new
  // text, or publish a partial document that omits one of the attached photos.
  const normalize = (text) => text.replace(/\s/g, "");
  if (
    normalize(
      blocks
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n"),
    ) !== normalize(article.text)
  )
    return null;
  const positionedPhotos = new Set(blocks.filter((block) => block.type === "photo").map((block) => block.url));
  if ([...allowedPhotos].slice(1).some((url) => !positionedPhotos.has(url))) return null;
  return blocks;
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

export async function enrichArticleDocuments(articles, previous, fetchImpl) {
  if (!fetchImpl || !articles.length) return articles;
  const result = [...articles];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  let next = 0;
  try {
    await Promise.all(
      Array.from({ length: Math.min(4, articles.length) }, async () => {
        while (next < articles.length && !controller.signal.aborted) {
          const index = next++;
          const article = articles[index];
          const blocks = await loadArticleDocument(article, fetchImpl, controller.signal);
          const old = previous?.find((item) => item.id === article.id);
          const retained =
            old?.text === article.text && JSON.stringify(old?.media) === JSON.stringify(article.media)
              ? old?.blocks
              : null;
          if (blocks || retained) result[index] = { ...article, blocks: blocks ?? retained };
        }
      }),
    );
  } finally {
    clearTimeout(timer);
  }
  return result;
}
