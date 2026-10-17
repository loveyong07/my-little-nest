import assert from "node:assert/strict";
import test from "node:test";
import { createXFeedService } from "../server/x-feed-service.mjs";
import { createApiHandler, JSON_CDN_CACHE_CONTROL, JSON_CDN_CACHE_CONTROL_RETRY } from "../server/api-handler.mjs";
import { authorizeFeed, authorizedMediaRequest, parseMediaSource } from "../server/x-media-auth.mjs";

const USER_ID = "2061726102180311040";
const author = { id: USER_ID, username: "loveyong07", name: "初咏" };
const post = (id, extra = {}) => ({
  id,
  text: "A post",
  author_id: USER_ID,
  created_at: "2026-10-17T00:00:00.000Z",
  ...extra,
});
// Matches the shape read from the official /2/tweets endpoint on 2026-10-17:
// Article body/preview are strings; cover_media and media_entities are media keys.
const article = (id, extra = {}) =>
  post(id, {
    text: "https://t.co/article",
    article: {
      title: "An Article",
      plain_text: "The complete first paragraph.\n\nThe complete second paragraph.",
      preview_text: "A shorter preview.",
      cover_media: "3_cover",
      media_entities: ["3_inline", "3_cover", "3_unsafe"],
      ...extra,
    },
  });
const media = [
  { media_key: "3_inline", type: "photo", url: "https://pbs.twimg.com/media/inline.jpg", width: 1000, height: 700 },
  { media_key: "3_cover", type: "photo", url: "https://pbs.twimg.com/media/cover.jpg", width: 2000, height: 800 },
  { media_key: "3_unsafe", type: "photo", url: "https://other.test/unsafe.jpg" },
];
function service(timeline, options = {}) {
  const urls = [];
  const feed = createXFeedService({
    token: "test-token",
    ...options,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      urls.push(parsed);
      if (parsed.pathname === `/2/users/${USER_ID}`) return Response.json({ data: author });
      return timeline(parsed);
    },
  });
  return { feed, urls };
}

test("reads the official Article shape, full text and cover-first safe media, separately from ordinary long posts", async () => {
  const { feed, urls } = service(() =>
    Response.json({
      data: [
        article("20"),
        post("19", { note_tweet: { text: "An ordinary long post" } }),
        post("18", { text: "A link to someone else's Article https://x.com/i/article/123" }),
        article("17", { title: "A quoted Article" }),
      ].map((item) => (item.id === "17" ? { ...item, referenced_tweets: [{ type: "quoted", id: "1" }] } : item)),
      includes: { media },
    }),
  );
  const result = await feed();
  assert.equal(result.status, "ok");
  assert.equal(result.articlesStatus, "ok");
  assert.deepEqual(
    result.posts.map((item) => item.id),
    ["19", "18"],
  );
  assert.equal(result.posts[0].text, "An ordinary long post");
  assert.equal(result.articles.length, 1);
  assert.deepEqual(result.articles[0], {
    id: "20",
    title: "An Article",
    text: "The complete first paragraph.\n\nThe complete second paragraph.",
    contentKind: "full",
    created_at: "2026-10-17T00:00:00.000Z",
    author: "初咏",
    avatar: null,
    permalink: "https://x.com/loveyong07/status/20",
    media: [
      { type: "photo", url: "https://pbs.twimg.com/media/cover.jpg", alt: "", width: 2000, height: 800 },
      { type: "photo", url: "https://pbs.twimg.com/media/inline.jpg", alt: "", width: 1000, height: 700 },
    ],
  });
  assert.ok(urls[1].searchParams.get("tweet.fields").split(",").includes("article"));
  assert.ok(urls[1].searchParams.get("expansions").split(",").includes("article.cover_media"));
  assert.ok(urls[1].searchParams.get("expansions").split(",").includes("article.media_entities"));
});

test("keeps an Article preview readable when the API omits its full body", async () => {
  const { feed } = service(() => Response.json({ data: [article("20", { plain_text: undefined })] }));
  const result = await feed();
  assert.equal(result.articlesStatus, "ok");
  assert.equal(result.articles[0].text, "A shorter preview.");
  assert.equal(result.articles[0].contentKind, "preview");
});

test("reports no Articles only after a successful complete timeline, and caches that empty result", async () => {
  const { feed, urls } = service(() => Response.json({ data: [post("20")] }));
  const result = await feed();
  assert.equal(result.articlesStatus, "none");
  assert.deepEqual(result.articles, []);
  assert.equal(await feed(), result);
  assert.equal(urls.length, 2);
});

test("collects Articles on older pages, merges incremental refreshes, and reconciles deleted Articles", async () => {
  let time = 0;
  const { feed, urls } = service(
    (url) => {
      if (time >= 24 * 60 * 60 * 1000) return Response.json({ data: [article("40")] });
      if (url.searchParams.has("since_id")) return Response.json({ data: [article("40")], meta: { newest_id: "40" } });
      if (url.searchParams.has("pagination_token")) return Response.json({ data: [article("10"), article("20")] });
      return Response.json({ data: [post("30"), article("20")], meta: { next_token: "older", newest_id: "30" } });
    },
    { now: () => time },
  );
  assert.deepEqual(
    (await feed()).articles.map((item) => item.id),
    ["20", "10"],
  );
  assert.equal(urls[2].searchParams.get("pagination_token"), "older");
  time += 15 * 60 * 1000;
  const incremental = await feed();
  assert.deepEqual(
    incremental.articles.map((item) => item.id),
    ["40", "20", "10"],
  );
  assert.deepEqual(
    incremental.posts.map((item) => item.id),
    ["30"],
  );
  assert.equal(urls.at(-1).searchParams.get("since_id"), "30");
  time = 24 * 60 * 60 * 1000;
  const reconciled = await feed();
  assert.deepEqual(
    reconciled.articles.map((item) => item.id),
    ["40"],
  );
  assert.deepEqual(reconciled.posts, []);
  assert.equal(urls.at(-1).searchParams.has("since_id"), false);
});

test("a rejected optional Article field preserves live posts, reports unknown Articles, then recovers with a full scan", async () => {
  let time = 0;
  let reject = true;
  const { feed, urls } = service(
    (url) => {
      if (reject && url.searchParams.get("tweet.fields").split(",").includes("article")) {
        return new Response("unsupported field", { status: 400 });
      }
      return Response.json({ data: reject ? [post("20")] : [article("20"), post("19")] });
    },
    { now: () => time },
  );
  const result = await feed();
  assert.equal(result.status, "ok");
  assert.equal(result.articlesStatus, "unavailable");
  assert.deepEqual(result.articles, []);
  assert.equal(result.posts[0].id, "20");
  assert.equal(urls.length, 3);
  assert.equal(urls.at(-1).searchParams.get("expansions"), "attachments.media_keys");
  time = 60_000 - 1;
  await Promise.all(Array.from({ length: 8 }, () => feed()));
  assert.equal(urls.length, 3, "no Article retries before the backoff boundary");
  time++;
  reject = false;
  const recoveredBatch = await Promise.all(Array.from({ length: 8 }, () => feed()));
  const recovered = recoveredBatch[0];
  assert.ok(
    recoveredBatch.every((item) => item === recovered),
    "Article retries share one in-flight full scan",
  );
  assert.equal(urls.length, 4, "partial Article recovery happens before the fifteen-minute successful-post TTL");
  assert.equal(recovered.articlesStatus, "ok");
  assert.deepEqual(
    recovered.articles.map((item) => item.id),
    ["20"],
  );
  assert.deepEqual(
    recovered.posts.map((item) => item.id),
    ["19"],
  );
  assert.equal(urls.at(-1).searchParams.has("since_id"), false);
});

test("failed partial Article retries keep prior content, back off and recover without extending its cache lifetime", async () => {
  let time = 0;
  let phase = "valid";
  const { feed, urls } = service(
    () => {
      if (phase === "failed") return new Response("unavailable", { status: 503 });
      return Response.json({
        data: phase === "malformed" ? [post("21", { article: {} }), post("19")] : [article("20"), post("19")],
      });
    },
    { now: () => time },
  );
  const initial = await feed();
  phase = "malformed";
  time = 15 * 60 * 1000;
  const partial = await feed();
  assert.equal(partial.status, "ok");
  assert.equal(partial.articlesStatus, "stale");
  assert.deepEqual(partial.articles, initial.articles);
  const count = urls.length;
  phase = "failed";
  time += 60_000;
  const failures = await Promise.all(Array.from({ length: 8 }, () => feed()));
  assert.ok(failures.every((result) => result === partial));
  assert.equal(urls.length, count + 1, "one failed upstream recovery for concurrent readers");
  time += 60_000 - 1;
  await feed();
  assert.equal(urls.length, count + 1, "no repeated upstream requests in the failure backoff");
  time++;
  phase = "valid";
  const recovered = await feed();
  assert.equal(recovered.status, "ok");
  assert.equal(recovered.articlesStatus, "ok");
  assert.equal(urls.length, count + 2);
  assert.equal(urls.at(-1).searchParams.has("since_id"), false, "recovery reconciles the entire Article set");
  phase = "failed";
  time += 15 * 60 * 1000;
  const expired = await feed();
  assert.equal(expired.status, "stale");
  assert.equal(expired.articlesStatus, "stale");
});

for (const hadArticles of [true, false]) {
  test(`timeline failure never becomes an empty Article success (previous Articles=${hadArticles})`, async () => {
    let time = 0;
    let fail = false;
    const { feed, urls } = service(
      () =>
        fail
          ? new Response("private upstream error", { status: 503 })
          : Response.json({ data: hadArticles ? [article("20")] : [post("20")] }),
      { now: () => time },
    );
    const first = await feed();
    fail = true;
    time += 15 * 60 * 1000;
    const stale = await feed();
    assert.equal(stale.status, "stale");
    assert.equal(stale.articlesStatus, hadArticles ? "stale" : "unavailable");
    assert.deepEqual(stale.articles, first.articles);
    const count = urls.length;
    assert.deepEqual(await feed(), stale);
    assert.equal(urls.length, count, "the shared failure backoff applies to Articles");
    assert.equal(JSON.stringify(stale).includes("private upstream error"), false);
  });
}

test("an unreadable Article payload is unknown rather than an empty account or a daily post", async () => {
  const { feed } = service(() => Response.json({ data: [post("20", { article: {} }), post("19")] }));
  const result = await feed();
  assert.equal(result.status, "ok");
  assert.equal(result.articlesStatus, "unavailable");
  assert.deepEqual(result.articles, []);
  assert.deepEqual(
    result.posts.map((item) => item.id),
    ["19"],
  );
});

test("a pinned Article stays in the independent Article timeline and out of daily posts", async () => {
  const feed = createXFeedService({
    token: "test-token",
    fetchImpl: async (url) => {
      const { pathname } = new URL(url);
      if (pathname === `/2/users/${USER_ID}`) return Response.json({ data: { ...author, pinned_tweet_id: "20" } });
      if (pathname === "/2/tweets/20") return Response.json({ data: article("20") });
      return Response.json({ data: [article("20"), post("19")] });
    },
  });
  const result = await feed();
  assert.equal(result.articles[0].id, "20");
  assert.deepEqual(
    result.posts.map((item) => item.id),
    ["19"],
  );
  assert.equal(result.pinnedPost.id, "20");
});

test("Article media uses the same signed, original-quality same-origin permissions as posts", async () => {
  const { feed } = service(() => Response.json({ data: [article("20")], includes: { media } }));
  const input = await feed();
  const original = structuredClone(input);
  const options = { secret: "article-signing-secret", now: 1792195200000 };
  const output = await authorizeFeed(input, options);
  assert.deepEqual(input, original);
  for (const item of output.articles[0].media) {
    const request = new Request(new URL(item.proxyUrl, "https://example.test"));
    assert.equal(new URL(request.url).pathname, "/api/x-media");
    assert.equal(new URL(request.url).searchParams.get("url"), item.url);
    assert.equal(await authorizedMediaRequest(request, parseMediaSource(item.url, "image"), "image", options), true);
  }
  assert.equal(JSON.stringify(output).includes(options.secret), false);
});

for (const articlesStatus of ["ok", "none", "stale", "unavailable", undefined]) {
  test(`Article ${String(articlesStatus)} controls the complete-feed CDN cache policy`, async () => {
    const body = { status: "ok", posts: [], articles: [], articlesStatus, pinnedStatus: "none" };
    const handleApi = createApiHandler({}, { serviceFactory: () => async () => body });
    const response = await handleApi(new Request("https://example.test/api/x-posts"));
    assert.equal(
      response.headers.get("vercel-cdn-cache-control"),
      ["ok", "none"].includes(articlesStatus) ? JSON_CDN_CACHE_CONTROL : JSON_CDN_CACHE_CONTROL_RETRY,
    );
  });
}
