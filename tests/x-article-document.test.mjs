import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  articleDocumentFromHtml,
  normalizedArticleDocument,
  loadArticleDocument,
  enrichArticleDocuments,
} from "../server/x-article-document.mjs";

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
