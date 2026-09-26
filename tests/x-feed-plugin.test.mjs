import assert from "node:assert/strict";
import test from "node:test";
import { createXFeedService } from "../server/x-feed-plugin.mjs";

const post = (id, text, extra = {}) => ({
  id, text, author_id: "123", created_at: "2026-09-25T00:00:00Z", ...extra,
});

test("returns unavailable without requesting X when no token is configured", async () => {
  const feed = createXFeedService({
    token: "",
    fetchImpl: () => { throw new Error("Should not request X"); },
  });
  assert.deepEqual(await feed(), { status: "unavailable", posts: [] });
});

test("returns only original posts and caches successful X responses", async () => {
  const urls = [];
  let time = 1000;
  const feed = createXFeedService({
    token: "private-test-token",
    now: () => time,
    fetchImpl: async (url, options) => {
      urls.push(String(url));
      assert.equal(options.headers.Authorization, "Bearer private-test-token");
      assert.equal(options.redirect, "error");
      if (new URL(url).pathname.includes("/by/username/")) {
        return new Response(JSON.stringify({ data: {
          id: "123", username: "loveyong07", name: "初咏",
          profile_image_url: "https://pbs.twimg.com/avatar.jpg",
        } }), { status: 200 });
      }
      if (new URL(url).searchParams.get("since_id") === "1") {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [
        post("1", "Original"),
        post("2", "Reply", { referenced_tweets: [{ type: "replied_to", id: "9" }] }),
        post("3", "Repost", { referenced_tweets: [{ type: "retweeted", id: "9" }] }),
        post("4", "Quote", { referenced_tweets: [{ type: "quoted", id: "9" }] }),
        post("5", "Other author", { author_id: "456" }),
      ] }), { status: 200 });
    },
  });

  const first = await feed();
  assert.deepEqual(first, { status: "ok", pinnedPost: null, pinnedStatus: "none", posts: [{
    id: "1", text: "Original", created_at: "2026-09-25T00:00:00Z",
    author: "初咏", avatar: "https://pbs.twimg.com/avatar.jpg",
    permalink: "https://x.com/loveyong07/status/1",
  }] });
  assert.equal(new URL(urls[1]).searchParams.get("exclude"), "replies,retweets");
  assert.equal(new URL(urls[1]).searchParams.get("max_results"), "10");
  assert.equal((await feed()).posts.length, 1);
  assert.equal(urls.length, 2);
  time += 15 * 60 * 1000;
  assert.deepEqual((await feed()).posts, first.posts);
  assert.equal(urls.length, 4);
  assert.equal(new URL(urls[3]).searchParams.get("since_id"), null);
});

test("loads photos from the post's media keys in attachment order", async () => {
  let postsUrl;
  const feed = createXFeedService({
    token: "private-test-token",
    fetchImpl: async (url) => {
      if (new URL(url).pathname.includes("/by/username/")) {
        return new Response(JSON.stringify({ data: { id: "123", username: "loveyong07" } }), { status: 200 });
      }
      postsUrl = new URL(url);
      return new Response(JSON.stringify({
        data: [post("10", "Photos https://t.co/article https://t.co/photo", {
          attachments: { media_keys: ["second", "first", "video", "unsafe", "second"] },
          entities: { urls: [
            { url: "https://t.co/article", expanded_url: "https://example.com/article" },
            { url: "https://t.co/photo", expanded_url: "https://x.com/loveyong07/status/10/photo/1" },
          ] },
        })],
        includes: { media: [
          { media_key: "first", type: "photo", url: "https://pbs.twimg.com/media/first.jpg", alt_text: "First photo" },
          { media_key: "second", type: "photo", url: "https://pbs.twimg.com/media/second.jpg", alt_text: "Second photo" },
          { media_key: "video", type: "video", preview_image_url: "https://pbs.twimg.com/media/video.jpg" },
          { media_key: "unsafe", type: "photo", url: "https://example.com/image.jpg" },
        ] },
      }), { status: 200 });
    },
  });

  const result = await feed();
  assert.equal(result.status, "ok");
  assert.equal(postsUrl.searchParams.get("expansions"), "attachments.media_keys");
  assert.ok(postsUrl.searchParams.get("tweet.fields").split(",").includes("attachments"));
  assert.ok(postsUrl.searchParams.get("tweet.fields").split(",").includes("entities"));
  assert.ok(postsUrl.searchParams.get("media.fields").split(",").includes("url"));
  assert.equal(result.posts[0].text, "Photos https://t.co/article");
  assert.deepEqual(result.posts[0].media, [
    { url: "https://pbs.twimg.com/media/second.jpg", alt: "Second photo" },
    { url: "https://pbs.twimg.com/media/first.jpg", alt: "First photo" },
  ]);
});

test("keeps an image-only original post after removing its photo link", async () => {
  const feed = createXFeedService({
    token: "private-test-token",
    fetchImpl: async (url) => new URL(url).pathname.includes("/by/username/")
      ? new Response(JSON.stringify({ data: { id: "123", username: "loveyong07" } }), { status: 200 })
      : new Response(JSON.stringify({
        data: [post("11", "https://t.co/photo", {
          attachments: { media_keys: ["photo"] },
          entities: { urls: [{ url: "https://t.co/photo", expanded_url: "https://twitter.com/loveyong07/status/11/photo/1" }] },
        })],
        includes: { media: [{ media_key: "photo", type: "photo", url: "https://pbs.twimg.com/media/photo.jpg" }] },
      }), { status: 200 }),
  });

  const result = await feed();
  assert.equal(result.status, "ok");
  assert.equal(result.posts[0].text, "");
  assert.equal(result.posts[0].media.length, 1);
});

test("paginates only as needed and merges newer originals without re-reading the user", async () => {
  const urls = [];
  let time = 0;
  const feed = createXFeedService({
    token: "private-test-token",
    now: () => time,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      urls.push(parsed);
      if (parsed.pathname.includes("/by/username/")) {
        return new Response(JSON.stringify({ data: { id: "123", username: "loveyong07", name: "初咏" } }), { status: 200 });
      }
      if (parsed.searchParams.get("since_id") === "30") {
        return new Response(JSON.stringify({ data: [
          post("31", "New original"),
        ], meta: { newest_id: "31" } }), { status: 200 });
      }
      if (parsed.searchParams.get("pagination_token") === "older") {
        return new Response(JSON.stringify({ data: [
          post("20", "Original 20"),
          post("19", "Original 19"),
          post("18", "Original 18"),
          post("17", "Original 17"),
          post("16", "Original 16"),
          post("15", "Original 15"),
        ] }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [
        post("30", "Quoted", { referenced_tweets: [{ type: "quoted", id: "10" }] }),
        post("29", "Quoted too", { referenced_posts: [{ type: "quoted", id: "11" }] }),
      ], meta: { newest_id: "30", next_token: "older" } }), { status: 200 });
    },
  });

  const first = await feed();
  assert.deepEqual(first.posts.map((post) => post.id), ["20", "19", "18", "17", "16", "15"]);
  assert.equal(urls[2].searchParams.get("pagination_token"), "older");
  time += 15 * 60 * 1000;
  const updated = await feed();
  assert.deepEqual(updated.posts.map((post) => post.id), ["31", "20", "19", "18", "17", "16"]);
  assert.equal(urls[4].searchParams.get("since_id"), "30");
  assert.equal(urls.filter((url) => url.pathname.includes("/by/username/")).length, 2);
});

test("keeps the last successful posts on a temporary X error and backs off", async () => {
  let time = 0;
  let calls = 0;
  const feed = createXFeedService({
    token: "private-test-token",
    now: () => time,
    fetchImpl: async (url) => {
      calls += 1;
      if (new URL(url).pathname.includes("/by/username/")) {
        return new Response(JSON.stringify({ data: { id: "123", username: "loveyong07" } }), { status: 200 });
      }
      if (calls === 2) {
        return new Response(JSON.stringify({ data: [post("1", "Saved")] }), { status: 200 });
      }
      return new Response("rate limited", { status: 429 });
    },
  });

  assert.equal((await feed()).status, "ok");
  time += 15 * 60 * 1000;
  const stale = await feed();
  assert.equal(stale.status, "stale");
  assert.deepEqual(stale.posts.map((post) => post.id), ["1"]);
  assert.equal(stale.pinnedStatus, "none");
  assert.deepEqual(await feed(), stale);
  assert.equal(calls, 4);
});

test("hides X errors and credentials from the response", async () => {
  const feed = createXFeedService({
    token: "private-test-token",
    fetchImpl: async () => new Response("denied", { status: 403 }),
  });
  const result = await feed();
  assert.deepEqual(result, { status: "unavailable", posts: [] });
  assert.ok(!JSON.stringify(result).includes("private-test-token"));
});

test("does not call a feed live when requested post metadata is missing", async () => {
  const feed = createXFeedService({
    token: "private-test-token",
    fetchImpl: async (url) => new URL(url).pathname.includes("/by/username/")
      ? new Response(JSON.stringify({ data: { id: "123", username: "loveyong07" } }), { status: 200 })
      : new Response(JSON.stringify({ data: [{ id: "1", text: "Maybe a quote" }] }), { status: 200 }),
  });
  assert.deepEqual(await feed(), { status: "unavailable", posts: [] });
});

test("loads the account's pinned reply with its photo and excludes it from six daily posts", async () => {
  const urls = [];
  const feed = createXFeedService({
    token: "private-test-token",
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      urls.push(parsed);
      if (parsed.pathname.includes("/by/username/")) {
        return new Response(JSON.stringify({ data: {
          id: "123", username: "loveyong07", name: "初咏", pinned_tweet_id: "8",
        } }), { status: 200 });
      }
      if (parsed.pathname === "/2/tweets/8") {
        return new Response(JSON.stringify({
          data: post("8", "Pinned reply https://t.co/photo", {
            in_reply_to_user_id: "456",
            referenced_tweets: [{ type: "replied_to", id: "4" }],
            attachments: { media_keys: ["photo"] },
            entities: { urls: [{ url: "https://t.co/photo", expanded_url: "https://x.com/loveyong07/status/8/photo/1" }] },
          }),
          includes: { media: [{ media_key: "photo", type: "photo", url: "https://pbs.twimg.com/media/photo.jpg", alt_text: "Pinned photo" }] },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: ["10", "9", "8", "7", "6", "5", "4"].map((id) => post(id, `Daily ${id}`)) }), { status: 200 });
    },
  });

  const result = await feed();
  assert.equal(result.status, "ok");
  assert.equal(result.pinnedStatus, "ok");
  assert.equal(result.pinnedPost.id, "8");
  assert.equal(result.pinnedPost.text, "Pinned reply");
  assert.deepEqual(result.pinnedPost.media, [{ url: "https://pbs.twimg.com/media/photo.jpg", alt: "Pinned photo" }]);
  assert.deepEqual(result.posts.map((item) => item.id), ["10", "9", "7", "6", "5", "4"]);
  assert.ok(urls[0].searchParams.get("user.fields").includes("pinned_tweet_id"));
  assert.equal(urls[0].searchParams.has("expansions"), false);
  assert.equal(urls.find((item) => item.pathname === "/2/tweets/8").searchParams.get("expansions"), "attachments.media_keys");
});

test("refreshes switched and removed pins, and restores a former pin to the daily feed", async () => {
  let time = 0;
  let pinnedId = "8";
  const timelineUrls = [];
  const feed = createXFeedService({
    token: "private-test-token",
    now: () => time,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.includes("/by/username/")) {
        return new Response(JSON.stringify({ data: {
          id: "123", username: "loveyong07", ...(pinnedId ? { pinned_tweet_id: pinnedId } : {}),
        } }), { status: 200 });
      }
      if (parsed.pathname.startsWith("/2/tweets/")) {
        const id = parsed.pathname.split("/").at(-1);
        return new Response(JSON.stringify({ data: post(id, `Pinned ${id}`) }), { status: 200 });
      }
      timelineUrls.push(parsed);
      return new Response(JSON.stringify({ data: ["10", "9", "8", "7", "6", "5", "4"].map((id) => post(id, `Daily ${id}`)) }), { status: 200 });
    },
  });

  assert.deepEqual((await feed()).posts.map((item) => item.id), ["10", "9", "7", "6", "5", "4"]);
  pinnedId = "9";
  time += 15 * 60 * 1000;
  const switched = await feed();
  assert.equal(switched.pinnedPost.id, "9");
  assert.deepEqual(switched.posts.map((item) => item.id), ["10", "8", "7", "6", "5", "4"]);
  pinnedId = null;
  time += 15 * 60 * 1000;
  const removed = await feed();
  assert.equal(removed.pinnedPost, null);
  assert.equal(removed.pinnedStatus, "none");
  assert.deepEqual(removed.posts.map((item) => item.id), ["10", "9", "8", "7", "6", "5"]);
  assert.ok(timelineUrls.every((url) => !url.searchParams.has("since_id")));
});

test("uses a stale pin only for the same pinned ID when its detail lookup fails", async () => {
  let time = 0;
  let pinnedId = "8";
  let failPinned = false;
  const feed = createXFeedService({
    token: "private-test-token",
    now: () => time,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.includes("/by/username/")) {
        return new Response(JSON.stringify({ data: { id: "123", username: "loveyong07", pinned_tweet_id: pinnedId } }), { status: 200 });
      }
      if (parsed.pathname.startsWith("/2/tweets/")) {
        return failPinned
          ? new Response("rate limited", { status: 429 })
          : new Response(JSON.stringify({ data: post(pinnedId, "Saved pin") }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: ["10", "9", "8", "7", "6", "5", "4"].map((id) => post(id, `Daily ${id}`)) }), { status: 200 });
    },
  });

  assert.equal((await feed()).pinnedStatus, "ok");
  failPinned = true;
  time += 15 * 60 * 1000;
  const stale = await feed();
  assert.equal(stale.pinnedStatus, "stale");
  assert.equal(stale.pinnedPost.id, "8");
  pinnedId = "9";
  time += 15 * 60 * 1000;
  const changed = await feed();
  assert.equal(changed.pinnedPost, null);
  assert.equal(changed.pinnedStatus, "unavailable");
  assert.equal(changed.posts.some((item) => item.id === "9"), false);
});

test("falls back to the renamed pin expansion when the older field is rejected", async () => {
  const userUrls = [];
  const feed = createXFeedService({
    token: "private-test-token",
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.includes("/by/username/")) {
        userUrls.push(parsed);
        return parsed.searchParams.get("user.fields").includes("pinned_tweet_id")
          ? new Response("unsupported field", { status: 400 })
          : new Response(JSON.stringify({
            data: { id: "123", username: "loveyong07", pinned_post_id: "8" },
            errors: [{ title: "Not Found Error", parameter: "pinned_post_id" }],
          }), { status: 200 });
      }
      if (parsed.pathname === "/2/tweets/8") {
        return new Response(JSON.stringify({ data: post("8", "Renamed pin") }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [post("9", "Daily")] }), { status: 200 });
    },
  });

  const result = await feed();
  assert.equal(result.pinnedPost.id, "8");
  assert.equal(result.pinnedStatus, "ok");
  assert.equal(userUrls.length, 2);
  assert.equal(userUrls[0].searchParams.has("expansions"), false);
  assert.equal(userUrls[1].searchParams.get("expansions"), "pinned_post_id");
  assert.equal(userUrls[1].searchParams.get("user.fields").includes("pinned_post_id"), false);
});

test("accepts a pin that is returned only through the user lookup expansion", async () => {
  const feed = createXFeedService({
    token: "private-test-token",
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.includes("/by/username/")) {
        if (parsed.searchParams.get("user.fields").includes("pinned_tweet_id")) {
          return new Response("unsupported field", { status: 400 });
        }
        return new Response(JSON.stringify({
          data: { id: "123", username: "loveyong07" },
          includes: { posts: [{ id: "8", text: "Expanded pin" }] },
        }), { status: 200 });
      }
      if (parsed.pathname === "/2/tweets/8") {
        return new Response(JSON.stringify({ data: post("8", "Full pinned post") }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [post("9", "Daily")] }), { status: 200 });
    },
  });

  assert.equal((await feed()).pinnedPost.text, "Full pinned post");
});

test("retries pinned post detail with current post.fields after a rejected tweet.fields request", async () => {
  const detailUrls = [];
  const feed = createXFeedService({
    token: "private-test-token",
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.includes("/by/username/")) {
        return new Response(JSON.stringify({ data: { id: "123", username: "loveyong07", pinned_tweet_id: "8" } }), { status: 200 });
      }
      if (parsed.pathname === "/2/tweets/8") {
        detailUrls.push(parsed);
        return parsed.searchParams.has("tweet.fields")
          ? new Response("unsupported field", { status: 400 })
          : new Response(JSON.stringify({ data: post("8", "Current fields", {
            author_id: parsed.searchParams.get("expansions")?.split(",").includes("author_id") ? "123" : undefined,
          }) }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [post("9", "Daily")] }), { status: 200 });
    },
  });

  const result = await feed();
  assert.equal(result.pinnedStatus, "ok");
  assert.equal(result.pinnedPost.text, "Current fields");
  assert.equal(detailUrls.length, 2);
  assert.ok(detailUrls[1].searchParams.has("post.fields"));
  assert.ok(detailUrls[1].searchParams.get("expansions").includes("attachments.media_keys"));
  assert.ok(detailUrls[1].searchParams.get("expansions").includes("author_id"));
});

test("does not display a pin whose detail response belongs to another author", async () => {
  const feed = createXFeedService({
    token: "private-test-token",
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.includes("/by/username/")) {
        return new Response(JSON.stringify({ data: { id: "123", username: "loveyong07", pinned_tweet_id: "8" } }), { status: 200 });
      }
      if (parsed.pathname === "/2/tweets/8") {
        return new Response(JSON.stringify({ data: post("8", "Someone else's post", { author_id: "456" }) }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [post("9", "Daily"), post("8", "Pinned ID")] }), { status: 200 });
    },
  });

  const result = await feed();
  assert.equal(result.pinnedPost, null);
  assert.equal(result.pinnedStatus, "unavailable");
  assert.deepEqual(result.posts.map((item) => item.id), ["9"]);
});

test("keeps the daily feed live when user lookup has a partial pin expansion error", async () => {
  const urls = [];
  const feed = createXFeedService({
    token: "private-test-token",
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      urls.push(parsed);
      if (parsed.pathname.includes("/by/username/")) {
        return new Response(JSON.stringify({
          data: { id: "123", username: "loveyong07", pinned_tweet_id: "8" },
          errors: [{ title: "Not Found Error", parameter: "pinned_tweet_id" }],
        }), { status: 200 });
      }
      if (parsed.pathname === "/2/tweets/8") {
        return new Response("not found", { status: 404 });
      }
      return new Response(JSON.stringify({
        data: ["10", "9", "8", "7", "6", "5", "4"].map((id) => post(id, `Daily ${id}`)),
      }), { status: 200 });
    },
  });

  const result = await feed();
  assert.equal(result.status, "ok");
  assert.deepEqual(result.posts.map((item) => item.id), ["10", "9", "7", "6", "5", "4"]);
  assert.equal(result.pinnedPost, null);
  assert.equal(result.pinnedStatus, "unavailable");
  assert.equal(urls[0].searchParams.has("expansions"), false);
});
