import assert from "node:assert/strict";
import test from "node:test";
import { formatPostDate } from "../src/utils/date.js";
import { normalizeReadingQuery, readingEntryDate, readingEntryMatches } from "../src/utils/reading-search.js";

process.env.TZ = "Asia/Shanghai";
const item = { title: "Hongkong", text: "A walk by the water", created_at: "2026-11-05T18:31:00.000Z" };

test("reading search accepts the displayed local date, ISO dates and full-width separators", () => {
  const entry = { item };
  assert.match(formatPostDate(item.created_at, "zh"), /2026\/11\/06/);
  for (const query of ["2026/11/06", "2026-11-06", "２０２６／１１／６", "2026年11月6日", "2026-11-05"])
    assert.equal(readingEntryMatches(entry, query, "zh"), true, query);
  assert.equal(readingEntryMatches(entry, "2026/11/07", "zh"), false);
  for (const language of ["zh", "ja", "en"])
    assert.equal(readingEntryMatches(entry, formatPostDate(item.created_at, language), language), true);
});

test("reading search preserves case-insensitive word, title and empty searches", () => {
  assert.equal(readingEntryMatches({ item }, "  HONGKONG  ", "en"), true);
  assert.equal(readingEntryMatches({ item }, "by the water", "en"), true);
  assert.equal(readingEntryMatches({ item }, " ", "en"), true);
  assert.equal(readingEntryMatches({ item }, "missing", "en"), false);
  assert.equal(normalizeReadingQuery("２０２６/１/２"), "2026-01-02");
});

test("reposts display their repost date and can be found by either timestamp", () => {
  const repost = { ...item, repostedAt: "2026-11-07T00:10:00.000Z" };
  assert.equal(readingEntryDate("reposts", repost), repost.repostedAt);
  assert.equal(readingEntryDate("posts", repost), item.created_at);
  assert.equal(readingEntryMatches({ item: repost }, "2026/11/07", "zh"), true);
  assert.equal(readingEntryMatches({ item: repost }, "2026/11/06", "zh"), true);
  assert.equal(readingEntryMatches({ item: { text: "No date", created_at: "invalid" } }, "No date", "zh"), true);
});
