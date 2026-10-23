import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  ARTICLE_DOCUMENT_VERSION,
  ARTICLE_REVALIDATE_TTL_MS,
  articleDocumentFromHtml,
  normalizedArticleDocument,
  loadArticleDocument,
  enrichArticleDocuments,
} from "../server/x-article-document.mjs";
import {
  articleCachePath,
  createBlobArticleCache,
  parseArticleDocumentRecord,
  serializeArticleDocumentRecord,
} from "../server/article-cache.mjs";
import { authorizeFeed, authorizedMediaRequest, parseMediaSource } from "../server/x-media-auth.mjs";
import { articleLinkParts } from "../shared/article-links.mjs";

const document = JSON.parse(readFileSync(new URL("../scripts/qa/fixtures/x-article-document.json", import.meta.url)));
const media = [document.cover_media_results.result, ...document.media_entities].map((item) => ({
  type: "photo",
  url: item.media_info.original_img_url,
}));
const article = {
  coverUrl: media[0].url,
  id: "2111445635736146057",
  permalink: "https://x.com/loveyong07/status/2111445635736146057",
  text: document.content_state.blocks
    .filter((block) => block.type !== "atomic")
    .map((block) => block.text)
    .join("\n"),
  media,
};
const htmlFor = (doc, id = article.id) =>
  `<script>window.untrusted = doNotExecute(); const payload = ${JSON.stringify(JSON.stringify({ data: { tweet_result_by_rest_id: { rest_id: id, result: { article: { article_results: { result: doc } } } } } }))};</script>`;

test("reads public X hydration as inert JSON and checks the exact post identity", () => {
  assert.deepEqual(articleDocumentFromHtml(htmlFor(document), article.id), document);
  assert.equal(articleDocumentFromHtml(htmlFor(document, "123"), article.id), null);
  assert.equal(articleDocumentFromHtml("<script>doNotExecute()</script>", article.id), null);
});

test("preserves the original five body-image positions, which differ from the API media array order", () => {
  const blocks = normalizedArticleDocument(document, article);
  const images = blocks.filter((block) => block.type === "photo");
  assert.deepEqual(
    images.map((image) => image.url),
    [media[2].url, media[4].url, media[1].url, media[3].url, media[5].url],
  );
  const previousText = images.map((image) => blocks[blocks.indexOf(image) - 1].text);
  assert.ok(previousText[0].includes("TouchGal"));
  assert.ok(previousText[1].includes("6月我第一次用上了Codex"));
  assert.ok(previousText[2].includes("我的抖音"));
  assert.ok(previousText[3].includes("Muse.ai"));
  assert.ok(previousText[4].includes("以上就是关于"));
  assert.equal(blocks.filter((block) => block.type === "divider").length, 2);
  assert.ok(blocks.some((block) => block.links?.some((link) => link.url === "https://www.touchgal.ink/")));
});

test("script filtering still accepts escaped post IDs and ignores unrelated scripts", () => {
  const escaped = htmlFor(document).replace(
    article.id,
    [...article.id].map((digit) => `\\u${digit.charCodeAt(0).toString(16).padStart(4, "0")}`).join(""),
  );
  assert.equal(escaped.includes(article.id), false);
  assert.deepEqual(
    articleDocumentFromHtml(`<script>const noise = "irrelevant";</script>${escaped}`, article.id),
    document,
  );
});

test("without a cover, every attached photo needs a verified body position", () => {
  const noCover = { ...article, coverUrl: null, media: media.slice(1) };
  assert.ok(normalizedArticleDocument(document, noCover));
  const changed = structuredClone(document);
  const state = changed.content_state;
  const firstUrl = noCover.media[0].url;
  const firstId = changed.media_entities.find((item) => item.media_info.original_img_url === firstUrl).media_id;
  const entities = new Map(state.entity_map.map((entry) => [String(entry.key), entry.value]));
  state.blocks = state.blocks.filter(
    (block) =>
      !block.entity_ranges?.some((range) =>
        entities.get(String(range.key))?.data?.media_items?.some((item) => String(item.media_id) === String(firstId)),
      ),
  );
  assert.equal(normalizedArticleDocument(changed, noCover), null);
});

test("a cover change prevents reusing body positions validated against the old cover", async () => {
  const previous = [{ ...article, blocks: normalizedArticleDocument(document, article) }];
  const [result] = await enrichArticleDocuments(
    [{ ...article, coverUrl: null }],
    previous,
    async () => new Response("Unavailable", { status: 503 }),
  );
  assert.equal(result.blocks, undefined);
});

test("rejects out-of-date text and unknown media instead of guessing positions or moving photos to the end", () => {
  assert.equal(normalizedArticleDocument(document, { ...article, text: "An edited Article" }), null);
  assert.equal(normalizedArticleDocument(document, { ...article, media: media.slice(0, 3) }), null);
  const changed = structuredClone(document);
  changed.content_state.blocks = changed.content_state.blocks.filter((block) => block.key !== "aee0b");
  assert.equal(normalizedArticleDocument(changed, article), null);
});

test("loads only the same public article, without API credentials, and handles upstream failures", async () => {
  const blocks = await loadArticleDocument(article, async (url, options) => {
    assert.equal(url.href, "https://x.com/loveyong07/article/2111445635736146057");
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.redirect, "error");
    return new Response(htmlFor(document));
  });
  assert.equal(blocks.filter((block) => block.type === "photo").length, 5);
  assert.equal(await loadArticleDocument(article, async () => new Response("Forbidden", { status: 403 })), null);
  assert.equal(await loadArticleDocument(article, async () => new Response("x".repeat(2 * 1024 * 1024 + 1))), null);
  const previous = [{ ...article, blocks }];
  assert.deepEqual(
    (
      await enrichArticleDocuments([article], previous, async () => {
        throw Error("offline");
      })
    )[0].blocks,
    blocks,
  );
  assert.equal(
    (
      await enrichArticleDocuments([{ ...article, text: "Edited" }], previous, async () => {
        throw Error("offline");
      })
    )[0].blocks,
    undefined,
  );
});

test("persists only verified unsigned Article structures and validates version, text, cover and media identity", async () => {
  const blocks = normalizedArticleDocument(document, article);
  assert.equal(articleCachePath(article.id), `x-articles/document-v1/${article.id}.json`);
  assert.equal(articleCachePath("../bad"), null);

  const bytes = serializeArticleDocumentRecord(article, blocks, 1_700_000_000_000);
  assert.ok(bytes instanceof Uint8Array);
  const raw = new TextDecoder().decode(bytes);
  assert.equal(raw.includes("/api/x-media"), false);
  const parsed = parseArticleDocumentRecord(raw, article);
  assert.equal(parsed.version, ARTICLE_DOCUMENT_VERSION);
  assert.equal(parsed.validatedAt, 1_700_000_000_000);
  assert.deepEqual(parsed.blocks, blocks);

  assert.equal(parseArticleDocumentRecord(raw, { ...article, text: "Modified text" }), null);
  assert.equal(parseArticleDocumentRecord(raw, { ...article, coverUrl: null }), null);
  assert.equal(parseArticleDocumentRecord(raw, { ...article, media: media.slice(0, 4) }), null);

  const wrongVersion = JSON.stringify({ ...JSON.parse(raw), version: ARTICLE_DOCUMENT_VERSION + 1 });
  assert.equal(parseArticleDocumentRecord(wrongVersion, article), null);

  const signedBlocks = blocks.map((block) =>
    block.type === "photo" ? { ...block, url: `/api/x-media?url=${encodeURIComponent(block.url)}` } : block,
  );
  assert.equal(serializeArticleDocumentRecord(article, signedBlocks, 1_700_000_000_000), null);
});

test("uses cached Article blocks first, revalidates after TTL, and never overwrites a valid snapshot on failure", async () => {
  const store = new Map();
  let time = 1_700_000_000_000;
  let puts = 0;
  const events = [];
  const cache = createBlobArticleCache({
    env: { BLOB_READ_WRITE_TOKEN: "test-blob-token" },
    now: () => time,
    onEvent: (event) => events.push(event),
    sdk: {
      get: async (pathname) => {
        const bytes = store.get(pathname);
        if (!bytes) return null;
        return {
          statusCode: 200,
          stream: new Response(bytes).body,
          blob: { size: bytes.byteLength, contentType: "application/json" },
        };
      },
      put: async (pathname, payload, options) => {
        puts += 1;
        assert.equal(options.access, "private");
        assert.equal(options.allowOverwrite, true);
        assert.equal(options.addRandomSuffix, false);
        store.set(pathname, payload);
      },
    },
  });

  let htmlCalls = 0;
  let currentDoc = document;
  let failHtml = false;
  const tasks = [];
  const runEnrich = (previous) =>
    enrichArticleDocuments(
      [article],
      previous,
      async () => {
        htmlCalls += 1;
        if (failHtml) return new Response("Unavailable", { status: 503 });
        return new Response(htmlFor(currentDoc));
      },
      {
        articleCache: cache,
        defer: (task) => tasks.push(task),
        now: () => time,
        onEvent: (event) => events.push(event),
      },
    );

  // 1. Initial miss fetches public HTML and persists unsigned blocks in background.
  const first = await runEnrich([]);
  await Promise.all(tasks.splice(0));
  assert.equal(htmlCalls, 1);
  assert.equal(puts, 1);
  assert.equal(first[0].blocks.filter((b) => b.type === "photo").length, 5);

  // 2. Same-instance refresh within 24h uses memory cache without reading Blob or HTML.
  time += 15 * 60 * 1000;
  const memoryHit = await runEnrich(first);
  assert.equal(htmlCalls, 1);
  assert.deepEqual(memoryHit[0].blocks, first[0].blocks);
  assert.equal(events.at(-1).outcome, "memory_hit");

  // 3. Cold-start instance within 24h reads Blob snapshot and skips HTML scraping.
  time += 2 * 60 * 60 * 1000;
  const blobHit = await runEnrich([]);
  assert.equal(htmlCalls, 1);
  assert.deepEqual(blobHit[0].blocks, first[0].blocks);
  assert.equal(events.at(-1).outcome, "blob_hit");

  // 4. After 24h TTL, a failed HTML revalidation keeps the verified snapshot and does not overwrite Blob.
  time += ARTICLE_REVALIDATE_TTL_MS;
  failHtml = true;
  const fallback = await runEnrich([]);
  await Promise.all(tasks.splice(0));
  assert.equal(htmlCalls, 2);
  assert.equal(puts, 1, "failed revalidation must never overwrite the valid snapshot");
  assert.deepEqual(fallback[0].blocks, first[0].blocks);
  assert.equal(events.at(-1).outcome, "stale_fallback");

  // 5. When HTML recovers after TTL, link/position changes are picked up even with identical text and media.
  failHtml = false;
  const updatedDoc = structuredClone(document);
  const linkEntity = updatedDoc.content_state.entity_map.find((item) => item.value?.type === "LINK");
  linkEntity.value.data.url = "https://www.touchgal.ink/updated";
  currentDoc = updatedDoc;
  const revalidated = await runEnrich(fallback);
  await Promise.all(tasks.splice(0));
  assert.equal(htmlCalls, 3);
  assert.equal(puts, 2);
  assert.equal(events.filter((e) => e.type === "x_article_document").at(-1).outcome, "revalidated");
  assert.equal(events.filter((e) => e.type === "x_article_cache").at(-1).outcome, "written");
  assert.ok(revalidated[0].blocks.some((b) => b.links?.some((l) => l.url === "https://www.touchgal.ink/updated")));

  // 6. Unsigned cached blocks receive fresh media signatures on each response day.
  const dayOne = await authorizeFeed({ status: "ok", posts: [], articles: revalidated }, { secret: "s", now: time });
  const dayThree = await authorizeFeed(
    { status: "ok", posts: [], articles: revalidated },
    { secret: "s", now: time + 3 * 86400 * 1000 },
  );
  assert.notEqual(dayOne.articles[0].media[0].proxyUrl, dayThree.articles[0].media[0].proxyUrl);
  const req = new Request(new URL(dayThree.articles[0].media[0].proxyUrl, "https://nest.test"));
  assert.equal(
    await authorizedMediaRequest(req, parseMediaSource(dayThree.articles[0].media[0].url, "image"), "image", {
      secret: "s",
      now: time + 3 * 86400 * 1000,
    }),
    true,
  );
});

test("retains verified fallback blocks for unqueued Articles when the 4-worker batch hits the shared timeout", async () => {
  const verifiedBlocks = normalizedArticleDocument(document, article);
  const item = (id, extra = {}) => ({
    ...article,
    id,
    permalink: `https://x.com/loveyong07/status/${id}`,
    ...extra,
  });
  const articles = [item("1"), item("2"), item("3"), item("4"), item("5"), item("6", { text: "Edited sixth text" })];
  const previous = [
    { ...item("5"), blocks: verifiedBlocks },
    { ...item("6"), blocks: verifiedBlocks },
  ];
  let fetchCalls = 0;
  const result = await enrichArticleDocuments(
    articles,
    previous,
    async (_url, { signal }) => {
      fetchCalls += 1;
      await new Promise((resolve) => {
        if (signal.aborted) resolve();
        else signal.addEventListener("abort", resolve, { once: true });
      });
      throw new Error("aborted");
    },
    { timeoutMs: 20 },
  );
  assert.equal(fetchCalls, 4, "shared timeout stops queueing articles past the first four workers");
  assert.equal(result[0].blocks, undefined);
  assert.deepEqual(result[4].blocks, verifiedBlocks, "fifth article keeps its verified fallback blocks");
  assert.equal(result[5].blocks, undefined, "edited sixth article still rejects mismatched old blocks");
});

test("restores fresh and stale Blob structures before slow HTML requests exhaust the batch", async () => {
  const time = 1_800_000_000_000;
  const verifiedBlocks = normalizedArticleDocument(document, article);
  const articles = Array.from({ length: 7 }, (_, index) => ({
    ...article,
    id: String(index + 1),
    permalink: `https://x.com/loveyong07/status/${index + 1}`,
  }));
  const store = new Map();
  for (const index of [4, 5, 6]) {
    store.set(
      articleCachePath(articles[index].id),
      serializeArticleDocumentRecord(
        articles[index],
        verifiedBlocks,
        index === 5 ? time - ARTICLE_REVALIDATE_TTL_MS - 1 : time,
      ),
    );
  }
  articles[6] = { ...articles[6], text: "Changed since the stored snapshot" };
  const reads = [];
  const cache = createBlobArticleCache({
    env: { BLOB_READ_WRITE_TOKEN: "test" },
    now: () => time,
    sdk: {
      get: async (pathname) => {
        reads.push(pathname);
        const bytes = store.get(pathname);
        return bytes
          ? {
              statusCode: 200,
              stream: new Response(bytes).body,
              blob: { size: bytes.byteLength, contentType: "application/json" },
            }
          : null;
      },
      put: async () => assert.fail("failed HTML must not overwrite a snapshot"),
    },
  });
  let fetches = 0;
  const result = await enrichArticleDocuments(
    articles,
    [],
    async (_url, { signal }) => {
      fetches++;
      await new Promise((resolve) => {
        if (signal.aborted) resolve();
        else signal.addEventListener("abort", resolve, { once: true });
      });
      throw new Error("simulated timeout");
    },
    { articleCache: cache, now: () => time, timeoutMs: 50 },
  );
  assert.equal(reads.length, 7);
  assert.equal(fetches, 4);
  assert.deepEqual(result[4].blocks, verifiedBlocks, "fresh fifth snapshot survives the HTML queue timeout");
  assert.deepEqual(result[5].blocks, verifiedBlocks, "stale sixth snapshot is still a verified fallback");
  assert.equal(result[6].blocks, undefined, "edited text rejects the old seventh snapshot");
});

test("Article link ranges survive normalization and persistent-cache round trips", () => {
  const text = "😀 Read more and Read more; Read more";
  const current = { id: "9001", text, media: [], coverUrl: null };
  const doc = {
    content_state: {
      blocks: [
        {
          type: "unstyled",
          text,
          entity_ranges: [
            { offset: 3, length: 9, key: "first" },
            { offset: 17, length: 9, key: "second" },
          ],
        },
      ],
      entity_map: {
        first: { type: "LINK", data: { url: "https://example.com/first" } },
        second: { type: "LINK", data: { url: "https://example.com/second" } },
      },
    },
    media_entities: [],
  };
  const blocks = normalizedArticleDocument(doc, current);
  assert.deepEqual(
    blocks[0].links.map(({ offset, length }) => ({ offset, length })),
    [
      { offset: 3, length: 9 },
      { offset: 17, length: 9 },
    ],
  );
  const raw = new TextDecoder().decode(serializeArticleDocumentRecord(current, blocks, 1_800_000_000_000));
  const restored = parseArticleDocumentRecord(raw, current);
  assert.deepEqual(restored.blocks, blocks);
  assert.deepEqual(
    articleLinkParts(text, restored.blocks[0].links)
      .filter((part) => part.url)
      .map((part) => part.url),
    ["https://example.com/first", "https://example.com/second"],
  );
  const invalid = structuredClone(blocks);
  invalid[0].links[1].offset = 100;
  assert.equal(serializeArticleDocumentRecord(current, invalid, 1_800_000_000_000), null);
});
