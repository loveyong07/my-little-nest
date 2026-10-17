import test from "node:test";
import assert from "node:assert/strict";
import { initialArticleReading, refreshedArticleReading } from "../src/utils/article-reading.js";

const article = (id) => ({ id, title: `Article ${id}` });

test("Article state distinguishes an old response, a confirmed empty collection, and an outage", () => {
  const initial = initialArticleReading();
  assert.equal(initial.state, "loading");
  assert.equal(refreshedArticleReading(initial, { status: "ok", posts: [] }).state, "unavailable");
  assert.equal(refreshedArticleReading(initial, { articlesStatus: "unavailable", articles: [] }).state, "unavailable");
  assert.equal(refreshedArticleReading(initial, { articlesStatus: "none", articles: [] }).state, "none");
  assert.equal(refreshedArticleReading(initial, { articlesStatus: "ok", articles: [] }).state, "none");
  assert.equal(refreshedArticleReading(initial, { articlesStatus: "ok" }).state, "unavailable");
});

test("Article refresh follows the latest item until the reader selects an Article", () => {
  const first = article("1");
  const second = article("2");
  let reading = refreshedArticleReading(initialArticleReading(), { articlesStatus: "ok", articles: [first] });
  reading = refreshedArticleReading(reading, { articlesStatus: "ok", articles: [second, first] });
  assert.equal(reading.articles[reading.index].id, "2");
  reading = { ...reading, index: 1, hasSelectedArticle: true };
  reading = refreshedArticleReading(reading, { articlesStatus: "ok", articles: [article("3"), first, second] });
  assert.equal(reading.articles[reading.index].id, "1");
  reading = refreshedArticleReading(reading, { articlesStatus: "ok", articles: [second] });
  assert.equal(reading.index, 0);
  assert.equal(reading.articles[reading.index].id, "2");
});

test("Article outages preserve readable content but only confirmed emptiness clears it", () => {
  const articles = [article("2"), article("1")];
  let reading = { ...initialArticleReading({ articlesStatus: "ok", articles }), index: 1, hasSelectedArticle: true };
  assert.equal(reading.state, "stale");
  for (const feed of [null, {}, { articlesStatus: "unavailable" }, { articlesStatus: "stale", articles: [] }]) {
    reading = refreshedArticleReading(reading, feed);
    assert.equal(reading.state, "stale");
    assert.equal(reading.articles[reading.index].id, "1");
  }
  reading = refreshedArticleReading(reading, { articlesStatus: "none", articles: [] });
  assert.equal(reading.state, "none");
  assert.deepEqual(reading.articles, []);
  assert.equal(reading.index, 0);
});
