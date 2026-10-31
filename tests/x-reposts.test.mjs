import assert from "node:assert/strict";
import test from "node:test";
import { createXFeedService } from "../server/x-feed-service.mjs";
import { authorizeFeed, authorizedMediaRequest } from "../server/x-media-auth.mjs";
import { initialRepostReading, refreshedRepostReading, cacheRepostData } from "../src/utils/repost-reading.js";
import { createApiHandler, JSON_CDN_CACHE_CONTROL, JSON_CDN_CACHE_CONTROL_RETRY } from "../server/api-handler.mjs";

const account = { id: "2061726102180311040", username: "loveyong07", name: "初咏" };
const writer = {
  id: "42",
  username: "original_writer",
  name: "Original author",
  profile_image_url: "https://pbs.twimg.com/profile_images/42/avatar_normal.jpg",
};
const original = (id = "10") => ({
  id,
  author_id: writer.id,
  created_at: "2026-10-01T08:00:00Z",
  text: "An original post https://t.co/photo",
  note_tweet: { text: "The full original post https://t.co/photo" },
  attachments: { media_keys: ["photo", "video"] },
  entities: {
    urls: [{ url: "https://t.co/photo", expanded_url: `https://x.com/${writer.username}/status/${id}/photo/1` }],
  },
});
const event = (id, type, originalId = "10") => ({
  id,
  author_id: account.id,
  text: "RT @original_writer: truncated",
  created_at: `2026-10-${id === "100" ? "30" : "31"}T08:00:00Z`,
  referenced_tweets: [{ type, id: originalId }],
});
const payload = (events = [event("101", "retweeted")]) => ({
  data: events,
  includes: {
    tweets: [original()],
    users: [writer],
    media: [
      { media_key: "photo", type: "photo", url: "https://pbs.twimg.com/media/repost.jpg", width: 1600, height: 1200 },
      {
        media_key: "video",
        type: "video",
        variants: [
          {
            content_type: "video/mp4",
            bit_rate: 256000,
            url: "https://video.twimg.com/ext_tw_video/10/pu/vid/movie.mp4",
          },
        ],
      },
    ],
  },
});

for (const repostsStatus of ["ok", "none", "stale", "unavailable", undefined]) {
  test(`partial repost state (${String(repostsStatus)}) cannot enter the complete-feed CDN cache window`, async () => {
    const body = { status: "ok", posts: [], pinnedStatus: "none", articlesStatus: "none", reposts: [], repostsStatus };
    const handleApi = createApiHandler({}, { serviceFactory: () => async () => body });
    const response = await handleApi(new Request("https://nest.test/api/x-posts"));
    assert.equal(
      response.headers.get("vercel-cdn-cache-control"),
      ["ok", "none"].includes(repostsStatus) ? JSON_CDN_CACHE_CONTROL : JSON_CDN_CACHE_CONTROL_RETRY,
    );
  });
}

test("actual retweeted references preserve source identity, full text and signed media without mixing quotes or replies", async () => {
  const urls = [];
  const service = createXFeedService({
    token: "test-token",
    fetchImpl: async (input) => {
      const url = new URL(input);
      urls.push(url);
      if (url.pathname === `/2/users/${account.id}`) return Response.json({ data: account });
      if (url.pathname === "/2/tweets") {
        assert.equal(url.searchParams.get("ids"), "10");
        const details = payload();
        return Response.json({ data: [original()], includes: details.includes });
      }
      // The timeline's expansion lacks attachments/media although the original has both.
      const body = payload([
        event("101", "retweeted"),
        event("102", "quoted"),
        event("103", "replied_to"),
        { id: "104", author_id: account.id, text: "My original", created_at: "2026-10-31T08:00:00Z" },
      ]);
      body.includes.tweets = [
        { id: "10", author_id: writer.id, text: "Truncated", created_at: "2026-10-01T08:00:00Z" },
      ];
      body.includes.media = [];
      return Response.json(body);
    },
  });
  const feed = await service();
  assert.equal(feed.repostsStatus, "ok");
  assert.deepEqual(
    feed.posts.map((post) => post.id),
    ["104"],
  );
  const [post] = feed.reposts;
  assert.equal(feed.reposts.length, 1);
  assert.equal(post.id, "10");
  assert.equal(post.repostId, "101");
  assert.equal(post.author, writer.name);
  assert.equal(post.username, writer.username);
  assert.equal(post.created_at, "2026-10-01T08:00:00Z");
  assert.equal(post.repostedAt, "2026-10-31T08:00:00Z");
  assert.equal(post.text, "The full original post");
  assert.equal(post.permalink, "https://x.com/original_writer/status/10");
  assert.equal(urls[1].searchParams.get("exclude"), "replies");
  assert.ok(urls[1].searchParams.get("expansions").includes("referenced_tweets.id.author_id"));
  const signing = { secret: "test-signing-key", now: Date.UTC(2026, 9, 31) };
  const signed = await authorizeFeed(feed, signing);
  const media = signed.reposts[0].media;
  assert.equal(new URL(media[0].url).searchParams.get("name"), "orig");
  assert.equal(new URL(media[0].proxyUrl, "https://nest.test").searchParams.get("format"), "webp");
  for (const [index, kind] of ["image", "video"].entries()) {
    const request = new Request(new URL(media[index].proxyUrl, "https://nest.test"));
    assert.equal(await authorizedMediaRequest(request, new URL(media[index].url), kind, signing), true);
  }
  assert.ok(signed.reposts[0].avatarProxy.highRes);
});

test("reposts merge by original identity in repost order; full refresh removes undone reposts", async () => {
  let now = 0;
  let round = 0;
  const service = createXFeedService({
    token: "test-token",
    now: () => now,
    fetchImpl: async (input) => {
      const url = new URL(input);
      if (url.pathname === `/2/users/${account.id}`) return Response.json({ data: account });
      if (url.pathname === "/2/tweets") {
        return Response.json({
          data: url.searchParams
            .get("ids")
            .split(",")
            .map((id) => original(id)),
          includes: payload().includes,
        });
      }
      round++;
      if (round === 1) return Response.json({ ...payload([event("100", "retweeted")]), meta: { newest_id: "100" } });
      if (round === 2) {
        assert.equal(url.searchParams.get("since_id"), "100");
        const body = payload([event("102", "retweeted", "11"), event("101", "retweeted")]);
        body.includes.tweets.push(original("11"));
        return Response.json({ ...body, meta: { newest_id: "102" } });
      }
      assert.equal(url.searchParams.has("since_id"), false);
      return Response.json({ data: [] });
    },
  });
  assert.equal((await service()).reposts[0].repostId, "100");
  now += 15 * 60_000;
  const merged = await service();
  assert.deepEqual(
    merged.reposts.map((post) => post.repostId),
    ["102", "101"],
  );
  now += 24 * 60 * 60_000;
  const empty = await service();
  assert.deepEqual(empty.reposts, []);
  assert.equal(empty.repostsStatus, "none");
});

test("missing, deleted or private originals never impersonate the owner or confirm an empty collection", async () => {
  for (const problem of ["missing", "private", "partial-error"]) {
    let now = 0;
    let recover = false;
    let calls = 0;
    const service = createXFeedService({
      token: "test-token",
      now: () => now,
      fetchImpl: async (input) => {
        const url = new URL(input);
        if (url.pathname === `/2/users/${account.id}`) return Response.json({ data: account });
        if (url.pathname !== "/2/tweets") calls++;
        const body = payload();
        if (!recover) {
          if (problem === "missing") body.includes.tweets = [];
          if (problem === "private") body.includes.users = [{ ...writer, protected: true }];
          if (problem === "partial-error") body.errors = [{ title: "Referenced post unavailable" }];
        }
        return Response.json(url.pathname === "/2/tweets" ? { ...body, data: body.includes.tweets } : body);
      },
    });
    const partial = await service();
    assert.equal(partial.status, "ok");
    assert.equal(partial.repostsStatus, problem === "partial-error" ? "stale" : "unavailable");
    now = 59_999;
    await service();
    assert.equal(calls, 1);
    recover = true;
    now++;
    const recovered = await Promise.all([service(), service()]);
    assert.equal(calls, 2);
    assert.equal(recovered[0].repostsStatus, "ok");
  }
});

test("reading follows latest until manually selected, retains identity and distinguishes failures from confirmed emptiness", () => {
  const post = (id) => ({
    id,
    repostId: `${id}0`,
    username: "writer",
    text: `Shared ${id}`,
    permalink: `https://x.com/writer/status/${id}`,
  });
  const fresh = (reposts) => ({ repostsStatus: "ok", reposts });
  let reading = initialRepostReading();
  assert.equal(reading.state, "loading");
  reading = refreshedRepostReading(reading, fresh([post("1"), post("2")]));
  assert.equal(reading.state, "live");
  reading = refreshedRepostReading(reading, fresh([post("3"), post("1"), post("2")]));
  assert.equal(reading.reposts[reading.index].id, "3");
  reading = { ...reading, index: 2, hasSelectedRepost: true };
  reading = refreshedRepostReading(reading, fresh([post("4"), post("2"), post("1")]));
  assert.equal(reading.reposts[reading.index].id, "2");
  reading = refreshedRepostReading(reading, null);
  assert.equal(reading.state, "stale");
  assert.equal(reading.reposts[reading.index].id, "2");
  assert.deepEqual(cacheRepostData({ repostsStatus: "stale", reposts: reading.reposts }), {
    repostsStatus: "unavailable",
    reposts: [],
  });
  reading = refreshedRepostReading(reading, { repostsStatus: "none", reposts: [] });
  assert.equal(reading.state, "none");
  assert.equal(refreshedRepostReading(reading, {}).state, "unavailable");
});
