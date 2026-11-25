import assert from "node:assert/strict";
import test from "node:test";
import { stripFontsourceWoff1 } from "../build/woff2-fonts.mjs";
import {
  ERROR_RETRY_MS,
  MAX_RATE_LIMIT_RETRY_MS,
  buildXTimelineUrl,
  classifyXErrors,
  parseRateLimitDelayMs,
} from "../server/x-api-client.mjs";
import { isArticlePost, mergeArticles, normalizedPostText, sortReposts } from "../server/x-post-normalizer.mjs";
import { detectBrowserLanguage } from "../src/hooks/useI18n.js";
import { articleShareDetails, postShareDetails, sharedPostFromSearch } from "../src/utils/post-sharing.js";

test("sharedPostFromSearch parses exclusive post, repost and article deep links", () => {
  assert.deepEqual(sharedPostFromSearch("?post=12345"), { type: "post", id: "12345" });
  assert.deepEqual(sharedPostFromSearch("?repost=67890"), { type: "repost", id: "67890" });
  assert.deepEqual(sharedPostFromSearch("?article=24680"), { type: "article", id: "24680" });
  assert.equal(sharedPostFromSearch("?post=1&article=2"), null);
  assert.equal(sharedPostFromSearch("?repost=1&article=2"), null);
  assert.equal(sharedPostFromSearch("?article=abc"), null);
  assert.equal(sharedPostFromSearch("?article=1&article=2"), null);

  assert.deepEqual(articleShareDetails({ id: "24680" }), {
    url: "https://loveyong07.top/posts?article=24680",
    cardId: "article-24680",
  });
  assert.equal(articleShareDetails({}), null);
  assert.deepEqual(postShareDetails({ id: "111", repostId: "222" }), {
    url: "https://loveyong07.top/posts?repost=222",
    cardId: "repost-222",
  });
});

test("detectBrowserLanguage maps first-visit browser locales to supported UI languages", () => {
  assert.equal(detectBrowserLanguage({ languages: ["ja-JP", "en-US"] }), "ja");
  assert.equal(detectBrowserLanguage({ languages: ["en-GB", "ja"] }), "en");
  assert.equal(detectBrowserLanguage({ languages: ["zh-Hant-HK", "en-US"] }), "zh");
  assert.equal(detectBrowserLanguage({ languages: ["fr-FR", "ja-JP"] }), "ja");
  assert.equal(detectBrowserLanguage({ languages: ["fr-FR", "de-DE"] }), "zh");
  assert.equal(detectBrowserLanguage({ language: "en-US" }), "en");
  assert.equal(detectBrowserLanguage(null), "zh");
});

test("stripFontsourceWoff1 removes legacy WOFF fallbacks while keeping WOFF2 sources", () => {
  const source = `@font-face {
  font-family: 'ZCOOL KuaiLe';
  src: url(./files/zcool-kuaile-5-400-normal.woff2) format('woff2'), url(./files/zcool-kuaile-5-400-normal.woff) format('woff');
}`;
  const minified =
    '@font-face{font-family:Quicksand;src:url(/assets/q-1234abcd.woff2) format("woff2"),url(/assets/q-5678efgh.woff) format(woff)}';
  const stripped = stripFontsourceWoff1(source);
  assert.match(stripped, /zcool-kuaile-5-400-normal\.woff2/);
  assert.doesNotMatch(stripped, /\.woff['")]/);
  assert.equal(
    stripFontsourceWoff1(minified),
    '@font-face{font-family:Quicksand;src:url(/assets/q-1234abcd.woff2) format("woff2")}',
  );
});

test("extracted X API client and post normalizer preserve rate-limit, error and entity contracts", () => {
  assert.deepEqual(
    classifyXErrors([
      { type: "https://api.x.com/2/problems/resource-not-found", resource_id: "101" },
      { type: "https://api.x.com/2/problems/server-error", resource_id: "102" },
    ]),
    { permanentIds: new Set(["101"]), hasTransientError: true },
  );

  const headers = new Headers({ "retry-after": "120" });
  assert.equal(parseRateLimitDelayMs({ status: 429, headers }, 1_000), 120_000);
  assert.equal(
    parseRateLimitDelayMs({ status: 429, headers: new Headers({ "retry-after": "99999" }) }, 1_000),
    MAX_RATE_LIMIT_RETRY_MS,
  );
  assert.equal(
    parseRateLimitDelayMs({ status: 429, headers: new Headers({ "retry-after": "5" }) }, 1_000),
    ERROR_RETRY_MS,
  );

  const incrementalUrl = buildXTimelineUrl("42", {
    includeArticles: true,
    fullRefresh: false,
    newestSeenId: "900",
    nextToken: "tok",
  });
  assert.equal(incrementalUrl.searchParams.get("since_id"), "900");
  assert.equal(incrementalUrl.searchParams.get("pagination_token"), "tok");
  assert.match(incrementalUrl.searchParams.get("tweet.fields") ?? "", /article/);

  assert.equal(isArticlePost({ article: { title: "Hello" } }), true);
  assert.equal(isArticlePost({ note_tweet: { text: "Long post" } }), false);

  const textResult = normalizedPostText(
    "Hello https://t.co/ext and https://t.co/pic",
    {
      id: "55",
      entities: {
        urls: [
          { url: "https://t.co/ext", expanded_url: "https://example.com/path" },
          { url: "https://t.co/pic", expanded_url: "https://x.com/user/status/55/photo/1" },
        ],
      },
    },
    [{ type: "photo", url: "https://pbs.twimg.com/media/1.jpg" }],
    "user",
    undefined,
  );
  assert.equal(textResult.text, "Hello https://example.com/path and");
  assert.equal(textResult.links?.[0]?.url, "https://example.com/path");

  assert.deepEqual(
    mergeArticles(
      [{ id: "2", created_at: "2026-10-02T00:00:00Z" }],
      [
        { id: "2", created_at: "2026-10-02T00:00:00Z", stale: true },
        { id: "1", created_at: "2026-10-01T00:00:00Z" },
      ],
    ).map((item) => item.id),
    ["2", "1"],
  );
  assert.deepEqual(
    sortReposts([
      { id: "a", repostId: "10", repostedAt: "2026-10-01T00:00:00Z" },
      { id: "b", repostId: "11", repostedAt: "2026-10-02T00:00:00Z" },
    ]).map((item) => item.id),
    ["b", "a"],
  );
});
