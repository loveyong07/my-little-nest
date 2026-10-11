import assert from "node:assert/strict";
import test from "node:test";
import { createXFeedService } from "../server/x-feed-plugin.mjs";

const post = (id, text, extra = {}) => ({
  id,
  text,
  author_id: "2061726102180311040",
  created_at: "2026-09-25T00:00:00Z",
  ...extra,
});

test("returns unavailable without requesting X when no token is configured", async () => {
  const feed = createXFeedService({
    token: "",
    fetchImpl: () => {
      throw new Error("Should not request X");
    },
  });
  assert.deepEqual(await feed(), { status: "unavailable", posts: [] });
});

test("syncs profile changes by stable user ID without fetching the timeline", async () => {
  let calls = 0;
  let time = 0;
  const feed = createXFeedService({
    token: "private-test-token",
    now: () => time,
    fetchImpl: async (url) => {
      calls += 1;
      assert.equal(new URL(url).pathname, "/2/users/2061726102180311040");
      return new Response(
        JSON.stringify({
          data: {
            id: "2061726102180311040",
            username: calls === 1 ? "loveyong07" : "new_yong",
            name: calls === 1 ? "初咏" : "新名字",
            profile_image_url: "https://pbs.twimg.com/avatar.jpg",
          },
        }),
        { status: 200 },
      );
    },
  });
  assert.deepEqual(await feed.getProfile(), {
    status: "ok",
    profile: {
      name: "初咏",
      username: "loveyong07",
      avatar: "https://pbs.twimg.com/avatar.jpg",
    },
  });
  assert.equal(calls, 1);
  time += 15 * 60 * 1000;
  assert.deepEqual(await feed.getProfile(), {
    status: "ok",
    profile: {
      name: "新名字",
      username: "new_yong",
      avatar: "https://pbs.twimg.com/avatar.jpg",
    },
  });
  assert.equal(calls, 2);
});

test("coalesces concurrent profile lookups instead of one upstream request each", async () => {
  let calls = 0;
  const feed = createXFeedService({
    token: "private-test-token",
    fetchImpl: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return new Response(
        JSON.stringify({
          data: {
            id: "2061726102180311040",
            username: "loveyong07",
            name: "初咏",
            profile_image_url: "https://pbs.twimg.com/avatar.jpg",
          },
        }),
        { status: 200 },
      );
    },
  });
  const results = await Promise.all(Array.from({ length: 8 }, () => feed.getProfile()));
  for (const result of results) {
    assert.deepEqual(result, {
      status: "ok",
      profile: {
        name: "初咏",
        username: "loveyong07",
        avatar: "https://pbs.twimg.com/avatar.jpg",
      },
    });
  }
  assert.equal(calls, 1);
});

test("backs off repeated profile failures and keeps the last successful profile as stale", async () => {
  let calls = 0;
  let time = 0;
  let fail = false;
  const feed = createXFeedService({
    token: "private-test-token",
    now: () => time,
    fetchImpl: async () => {
      calls += 1;
      if (fail) return new Response("unavailable", { status: 500 });
      return new Response(
        JSON.stringify({
          data: {
            id: "2061726102180311040",
            username: "loveyong07",
            name: "初咏",
            profile_image_url: "https://pbs.twimg.com/avatar.jpg",
          },
        }),
        { status: 200 },
      );
    },
  });
  assert.equal((await feed.getProfile()).status, "ok");
  assert.equal(calls, 1);

  fail = true;
  time += 15 * 60 * 1000;
  const failed = await Promise.all(Array.from({ length: 8 }, () => feed.getProfile()));
  assert.equal(calls, 2, "concurrent failures must share one lookup");
  for (const result of failed) {
    assert.equal(result.status, "stale", "old data must not be reported as a fresh success");
    assert.equal(result.profile.username, "loveyong07");
  }

  time += 30 * 1000;
  assert.equal((await feed.getProfile()).status, "stale");
  assert.equal(calls, 2, "a failed lookup must back off instead of repeating");

  time += 31 * 1000;
  fail = false;
  assert.deepEqual(await feed.getProfile(), {
    status: "ok",
    profile: {
      name: "初咏",
      username: "loveyong07",
      avatar: "https://pbs.twimg.com/avatar.jpg",
    },
  });
  assert.equal(calls, 3, "the profile must recover once the upstream works again");
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
      if (new URL(url).pathname.endsWith("/users/2061726102180311040")) {
        return new Response(
          JSON.stringify({
            data: {
              id: "2061726102180311040",
              username: "loveyong07",
              name: "初咏",
              profile_image_url: "https://pbs.twimg.com/avatar.jpg",
            },
          }),
          { status: 200 },
        );
      }
      if (new URL(url).searchParams.get("since_id") === "1") {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          data: [
            post("1", "Original"),
            post("2", "Reply", { referenced_tweets: [{ type: "replied_to", id: "9" }] }),
            post("3", "Repost", { referenced_tweets: [{ type: "retweeted", id: "9" }] }),
            post("4", "Quote", { referenced_tweets: [{ type: "quoted", id: "9" }] }),
            post("5", "Other author", { author_id: "456" }),
          ],
        }),
        { status: 200 },
      );
    },
  });

  const first = await feed();
  assert.deepEqual(first, {
    status: "ok",
    pinnedPost: null,
    pinnedStatus: "none",
    posts: [
      {
        id: "1",
        text: "Original",
        created_at: "2026-09-25T00:00:00Z",
        author: "初咏",
        avatar: "https://pbs.twimg.com/avatar.jpg",
        permalink: "https://x.com/loveyong07/status/1",
      },
    ],
  });
  assert.equal(new URL(urls[1]).searchParams.get("exclude"), "replies,retweets");
  assert.equal(new URL(urls[1]).searchParams.get("max_results"), "100");
  assert.equal((await feed()).posts.length, 1);
  assert.equal(urls.length, 2);
  time += 15 * 60 * 1000;
  assert.deepEqual((await feed()).posts, first.posts);
  assert.equal(urls.length, 4);
  assert.equal(new URL(urls[3]).searchParams.get("since_id"), "1");
});

test("loads photos from the post's media keys in attachment order", async () => {
  let postsUrl;
  const feed = createXFeedService({
    token: "private-test-token",
    fetchImpl: async (url) => {
      if (new URL(url).pathname.endsWith("/users/2061726102180311040")) {
        return new Response(JSON.stringify({ data: { id: "2061726102180311040", username: "loveyong07" } }), {
          status: 200,
        });
      }
      postsUrl = new URL(url);
      return new Response(
        JSON.stringify({
          data: [
            post("10", "Photos https://t.co/article https://t.co/photo", {
              attachments: { media_keys: ["second", "first", "video", "unsafe", "second"] },
              entities: {
                urls: [
                  { url: "https://t.co/article", expanded_url: "https://example.com/article" },
                  { url: "https://t.co/photo", expanded_url: "https://x.com/loveyong07/status/10/photo/1" },
                ],
              },
            }),
          ],
          includes: {
            media: [
              {
                media_key: "first",
                type: "photo",
                url: "https://pbs.twimg.com/media/first.jpg",
                alt_text: "First photo",
              },
              {
                media_key: "second",
                type: "photo",
                url: "https://pbs.twimg.com/media/second.jpg",
                alt_text: "Second photo",
              },
              { media_key: "video", type: "video", preview_image_url: "https://pbs.twimg.com/media/video.jpg" },
              { media_key: "unsafe", type: "photo", url: "https://example.com/image.jpg" },
            ],
          },
        }),
        { status: 200 },
      );
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
    fetchImpl: async (url) =>
      new URL(url).pathname.endsWith("/users/2061726102180311040")
        ? new Response(JSON.stringify({ data: { id: "2061726102180311040", username: "loveyong07" } }), { status: 200 })
        : new Response(
            JSON.stringify({
              data: [
                post("11", "https://t.co/photo", {
                  attachments: { media_keys: ["photo"] },
                  entities: {
                    urls: [
                      { url: "https://t.co/photo", expanded_url: "https://twitter.com/loveyong07/status/11/photo/1" },
                    ],
                  },
                }),
              ],
              includes: {
                media: [{ media_key: "photo", type: "photo", url: "https://pbs.twimg.com/media/photo.jpg" }],
              },
            }),
            { status: 200 },
          ),
  });

  const result = await feed();
  assert.equal(result.status, "ok");
  assert.equal(result.posts[0].text, "");
  assert.equal(result.posts[0].media.length, 1);
});

test("retains safe photo and video dimensions for daily and pinned media without altering URLs", async () => {
  const photoUrl = "https://pbs.twimg.com/media/original.jpg?name=orig";
  const videoUrl = "https://video.twimg.com/ext_tw_video/123/pu/vid/1920x1080/clip.mp4";
  const dimensions = [
    { width: 1200, height: 1800 },
    { width: 0, height: 100 },
    { width: -1, height: 100 },
    { width: 100.5, height: 100 },
    { width: "100", height: 100 },
    { width: 100 },
    { width: 20_001, height: 100 },
    { width: 100, height: Number.MAX_SAFE_INTEGER + 1 },
  ];
  const media = dimensions.map((size, index) => ({
    media_key: `photo-${index}`,
    type: "photo",
    url: photoUrl,
    ...size,
  }));
  media.push({
    media_key: "video",
    type: "video",
    width: 1920,
    height: 1080,
    preview_image_url: "https://pbs.twimg.com/ext_tw_video_thumb/123/poster.jpg",
    variants: [{ content_type: "video/mp4", bit_rate: 1000, url: videoUrl }],
  });
  const feed = createXFeedService({
    token: "private-test-token",
    fetchImpl: async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname.endsWith("/users/2061726102180311040")) {
        return new Response(
          JSON.stringify({ data: { id: "2061726102180311040", username: "loveyong07", pinned_tweet_id: "8" } }),
        );
      }
      const data = post(pathname === "/2/tweets/8" ? "8" : "10", "Media", {
        attachments: { media_keys: media.map((item) => item.media_key) },
      });
      return new Response(JSON.stringify({ data: pathname === "/2/tweets/8" ? data : [data], includes: { media } }));
    },
  });
  const result = await feed();
  for (const item of [result.posts[0], result.pinnedPost]) {
    assert.deepEqual(item.media[0], { url: photoUrl, alt: "", width: 1200, height: 1800 });
    for (const invalid of item.media.slice(1, -1)) {
      assert.equal(invalid.url, photoUrl);
      assert.equal("width" in invalid, false);
      assert.equal("height" in invalid, false);
    }
    assert.deepEqual(item.media.at(-1), {
      type: "video",
      url: videoUrl,
      poster: "https://pbs.twimg.com/ext_tw_video_thumb/123/poster.jpg",
      alt: "",
      width: 1920,
      height: 1080,
    });
  }
});

test("paginates the original feed and merges newer posts without a six-post cap", async () => {
  const urls = [];
  let time = 0;
  const feed = createXFeedService({
    token: "private-test-token",
    now: () => time,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      urls.push(parsed);
      if (parsed.pathname.endsWith("/users/2061726102180311040")) {
        return new Response(
          JSON.stringify({ data: { id: "2061726102180311040", username: "loveyong07", name: "初咏" } }),
          { status: 200 },
        );
      }
      if (parsed.searchParams.get("since_id") === "30") {
        return new Response(JSON.stringify({ data: [post("31", "New original")], meta: { newest_id: "31" } }), {
          status: 200,
        });
      }
      if (parsed.searchParams.get("pagination_token") === "older") {
        return new Response(
          JSON.stringify({
            data: [
              post("20", "Original 20"),
              post("19", "Original 19"),
              post("18", "Original 18"),
              post("17", "Original 17"),
              post("16", "Original 16"),
              post("15", "Original 15"),
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          data: [
            post("30", "Quoted", { referenced_tweets: [{ type: "quoted", id: "10" }] }),
            post("29", "Quoted too", { referenced_posts: [{ type: "quoted", id: "11" }] }),
          ],
          meta: { newest_id: "30", next_token: "older" },
        }),
        { status: 200 },
      );
    },
  });

  const first = await feed();
  assert.deepEqual(
    first.posts.map((post) => post.id),
    ["20", "19", "18", "17", "16", "15"],
  );
  assert.equal(urls[2].searchParams.get("pagination_token"), "older");
  time += 15 * 60 * 1000;
  const updated = await feed();
  assert.deepEqual(
    updated.posts.map((post) => post.id),
    ["31", "20", "19", "18", "17", "16", "15"],
  );
  assert.equal(urls[4].searchParams.get("since_id"), "30");
  assert.equal(urls.filter((url) => url.pathname.endsWith("/users/2061726102180311040")).length, 2);
});

test("loads more than six originals across a 100-post page boundary", async () => {
  const timelineUrls = [];
  const feed = createXFeedService({
    token: "private-test-token",
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/users/2061726102180311040")) {
        return new Response(JSON.stringify({ data: { id: "2061726102180311040", username: "loveyong07" } }), {
          status: 200,
        });
      }
      timelineUrls.push(parsed);
      const older = parsed.searchParams.get("pagination_token") === "older";
      const ids = older ? [105, 104, 103, 102, 101] : Array.from({ length: 100 }, (_, index) => 205 - index);
      return new Response(
        JSON.stringify({
          data: ids.map((id) => post(String(id), `Original ${id}`)),
          meta: older ? {} : { newest_id: "205", next_token: "older" },
        }),
        { status: 200 },
      );
    },
  });

  const result = await feed();
  assert.equal(result.status, "ok");
  assert.equal(result.posts.length, 105);
  assert.equal(result.posts[0].id, "205");
  assert.equal(result.posts.at(-1).id, "101");
  assert.equal(timelineUrls.length, 2);
  assert.ok(timelineUrls.every((url) => url.searchParams.get("max_results") === "100"));
  assert.equal(timelineUrls[1].searchParams.get("pagination_token"), "older");
});

test("paginates every new-post page before merging with the full cache", async () => {
  let time = 0;
  const timelineUrls = [];
  const feed = createXFeedService({
    token: "private-test-token",
    now: () => time,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/users/2061726102180311040")) {
        return new Response(JSON.stringify({ data: { id: "2061726102180311040", username: "loveyong07" } }), {
          status: 200,
        });
      }
      timelineUrls.push(parsed);
      if (parsed.searchParams.get("pagination_token") === "more-new") {
        return new Response(JSON.stringify({ data: [post("102", "New 102"), post("101", "New 101")] }), {
          status: 200,
        });
      }
      if (parsed.searchParams.has("since_id")) {
        return new Response(
          JSON.stringify({
            data: [post("104", "New 104"), post("103", "New 103")],
            meta: { newest_id: "104", next_token: "more-new" },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          data: [post("100", "Saved 100"), post("99", "Saved 99"), post("98", "Saved 98")],
          meta: { newest_id: "100" },
        }),
        { status: 200 },
      );
    },
  });

  assert.deepEqual(
    (await feed()).posts.map((item) => item.id),
    ["100", "99", "98"],
  );
  time += 15 * 60 * 1000;
  assert.deepEqual(
    (await feed()).posts.map((item) => item.id),
    ["104", "103", "102", "101", "100", "99", "98"],
  );
  assert.equal(timelineUrls.length, 3);
  assert.ok(timelineUrls.slice(1).every((url) => url.searchParams.get("since_id") === "100"));
  assert.equal(timelineUrls[2].searchParams.get("pagination_token"), "more-new");
});

test("reconciles deleted posts in a daily full refresh", async () => {
  let time = 0;
  const timelineUrls = [];
  const feed = createXFeedService({
    token: "private-test-token",
    now: () => time,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/users/2061726102180311040")) {
        return new Response(JSON.stringify({ data: { id: "2061726102180311040", username: "loveyong07" } }), {
          status: 200,
        });
      }
      timelineUrls.push(parsed);
      const ids =
        time >= 24 * 60 * 60 * 1000 ? ["4", "3", "1"] : parsed.searchParams.has("since_id") ? [] : ["3", "2", "1"];
      return new Response(
        JSON.stringify({
          data: ids.map((id) => post(id, `Original ${id}`)),
          meta: ids.length ? { newest_id: ids[0] } : {},
        }),
        { status: 200 },
      );
    },
  });

  assert.deepEqual(
    (await feed()).posts.map((item) => item.id),
    ["3", "2", "1"],
  );
  time += 15 * 60 * 1000;
  assert.deepEqual(
    (await feed()).posts.map((item) => item.id),
    ["3", "2", "1"],
  );
  assert.equal(timelineUrls[1].searchParams.get("since_id"), "3");
  time = 24 * 60 * 60 * 1000;
  assert.deepEqual(
    (await feed()).posts.map((item) => item.id),
    ["4", "3", "1"],
  );
  assert.equal(timelineUrls[2].searchParams.has("since_id"), false);
});

test("keeps the complete previous feed when a daily reconciliation page fails", async () => {
  let time = 0;
  let failOlderPage = true;
  const feed = createXFeedService({
    token: "private-test-token",
    now: () => time,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/users/2061726102180311040")) {
        return new Response(JSON.stringify({ data: { id: "2061726102180311040", username: "loveyong07" } }), {
          status: 200,
        });
      }
      if (time === 0) {
        return new Response(
          JSON.stringify({
            data: [post("3", "Saved 3"), post("2", "Saved 2"), post("1", "Saved 1")],
            meta: { newest_id: "3" },
          }),
          { status: 200 },
        );
      }
      if (parsed.searchParams.get("pagination_token") === "older") {
        return failOlderPage
          ? new Response("rate limited", { status: 429 })
          : new Response(JSON.stringify({ data: [post("1", "Saved 1")] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          data: [post("4", "New 4"), post("3", "Saved 3")],
          meta: { newest_id: "4", next_token: "older" },
        }),
        { status: 200 },
      );
    },
  });

  assert.deepEqual(
    (await feed()).posts.map((item) => item.id),
    ["3", "2", "1"],
  );
  time = 24 * 60 * 60 * 1000;
  const stale = await feed();
  assert.equal(stale.status, "stale");
  assert.deepEqual(
    stale.posts.map((item) => item.id),
    ["3", "2", "1"],
  );
  failOlderPage = false;
  time += 60 * 1000;
  const recovered = await feed();
  assert.equal(recovered.status, "ok");
  assert.deepEqual(
    recovered.posts.map((item) => item.id),
    ["4", "3", "1"],
  );
});

test("keeps the last successful posts on a temporary X error and backs off", async () => {
  let time = 0;
  let calls = 0;
  const feed = createXFeedService({
    token: "private-test-token",
    now: () => time,
    fetchImpl: async (url) => {
      calls += 1;
      if (new URL(url).pathname.endsWith("/users/2061726102180311040")) {
        return new Response(JSON.stringify({ data: { id: "2061726102180311040", username: "loveyong07" } }), {
          status: 200,
        });
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
  assert.deepEqual(
    stale.posts.map((post) => post.id),
    ["1"],
  );
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
    fetchImpl: async (url) =>
      new URL(url).pathname.endsWith("/users/2061726102180311040")
        ? new Response(JSON.stringify({ data: { id: "2061726102180311040", username: "loveyong07" } }), { status: 200 })
        : new Response(JSON.stringify({ data: [{ id: "1", text: "Maybe a quote" }] }), { status: 200 }),
  });
  assert.deepEqual(await feed(), { status: "unavailable", posts: [] });
});

test("loads the account's pinned reply with its photo and excludes it from daily posts", async () => {
  const urls = [];
  const feed = createXFeedService({
    token: "private-test-token",
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      urls.push(parsed);
      if (parsed.pathname.endsWith("/users/2061726102180311040")) {
        return new Response(
          JSON.stringify({
            data: {
              id: "2061726102180311040",
              username: "loveyong07",
              name: "初咏",
              pinned_tweet_id: "8",
            },
          }),
          { status: 200 },
        );
      }
      if (parsed.pathname === "/2/tweets/8") {
        return new Response(
          JSON.stringify({
            data: post("8", "Pinned reply https://t.co/photo", {
              in_reply_to_user_id: "456",
              referenced_tweets: [{ type: "replied_to", id: "4" }],
              attachments: { media_keys: ["photo"] },
              entities: {
                urls: [{ url: "https://t.co/photo", expanded_url: "https://x.com/loveyong07/status/8/photo/1" }],
              },
            }),
            includes: {
              media: [
                {
                  media_key: "photo",
                  type: "photo",
                  url: "https://pbs.twimg.com/media/photo.jpg",
                  alt_text: "Pinned photo",
                },
              ],
            },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ data: ["10", "9", "8", "7", "6", "5", "4"].map((id) => post(id, `Daily ${id}`)) }),
        { status: 200 },
      );
    },
  });

  const result = await feed();
  assert.equal(result.status, "ok");
  assert.equal(result.pinnedStatus, "ok");
  assert.equal(result.pinnedPost.id, "8");
  assert.equal(result.pinnedPost.text, "Pinned reply");
  assert.deepEqual(result.pinnedPost.media, [{ url: "https://pbs.twimg.com/media/photo.jpg", alt: "Pinned photo" }]);
  assert.deepEqual(
    result.posts.map((item) => item.id),
    ["10", "9", "7", "6", "5", "4"],
  );
  assert.ok(urls[0].searchParams.get("user.fields").includes("pinned_tweet_id"));
  assert.equal(urls[0].searchParams.has("expansions"), false);
  assert.equal(
    urls.find((item) => item.pathname === "/2/tweets/8").searchParams.get("expansions"),
    "attachments.media_keys",
  );
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
      if (parsed.pathname.endsWith("/users/2061726102180311040")) {
        return new Response(
          JSON.stringify({
            data: {
              id: "2061726102180311040",
              username: "loveyong07",
              ...(pinnedId ? { pinned_tweet_id: pinnedId } : {}),
            },
          }),
          { status: 200 },
        );
      }
      if (parsed.pathname.startsWith("/2/tweets/")) {
        const id = parsed.pathname.split("/").at(-1);
        return new Response(JSON.stringify({ data: post(id, `Pinned ${id}`) }), { status: 200 });
      }
      timelineUrls.push(parsed);
      return new Response(
        JSON.stringify({ data: ["10", "9", "8", "7", "6", "5", "4"].map((id) => post(id, `Daily ${id}`)) }),
        { status: 200 },
      );
    },
  });

  assert.deepEqual(
    (await feed()).posts.map((item) => item.id),
    ["10", "9", "7", "6", "5", "4"],
  );
  pinnedId = "9";
  time += 15 * 60 * 1000;
  const switched = await feed();
  assert.equal(switched.pinnedPost.id, "9");
  assert.deepEqual(
    switched.posts.map((item) => item.id),
    ["10", "8", "7", "6", "5", "4"],
  );
  pinnedId = null;
  time += 15 * 60 * 1000;
  const removed = await feed();
  assert.equal(removed.pinnedPost, null);
  assert.equal(removed.pinnedStatus, "none");
  assert.deepEqual(
    removed.posts.map((item) => item.id),
    ["10", "9", "8", "7", "6", "5", "4"],
  );
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
      if (parsed.pathname.endsWith("/users/2061726102180311040")) {
        return new Response(
          JSON.stringify({ data: { id: "2061726102180311040", username: "loveyong07", pinned_tweet_id: pinnedId } }),
          { status: 200 },
        );
      }
      if (parsed.pathname.startsWith("/2/tweets/")) {
        return failPinned
          ? new Response("rate limited", { status: 429 })
          : new Response(JSON.stringify({ data: post(pinnedId, "Saved pin") }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ data: ["10", "9", "8", "7", "6", "5", "4"].map((id) => post(id, `Daily ${id}`)) }),
        { status: 200 },
      );
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
  assert.equal(
    changed.posts.some((item) => item.id === "9"),
    false,
  );
});

test("falls back to the renamed pin expansion when the older field is rejected", async () => {
  const userUrls = [];
  const feed = createXFeedService({
    token: "private-test-token",
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/users/2061726102180311040")) {
        userUrls.push(parsed);
        return parsed.searchParams.get("user.fields").includes("pinned_tweet_id")
          ? new Response("unsupported field", { status: 400 })
          : new Response(
              JSON.stringify({
                data: { id: "2061726102180311040", username: "loveyong07", pinned_post_id: "8" },
                errors: [{ title: "Not Found Error", parameter: "pinned_post_id" }],
              }),
              { status: 200 },
            );
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
      if (parsed.pathname.endsWith("/users/2061726102180311040")) {
        if (parsed.searchParams.get("user.fields").includes("pinned_tweet_id")) {
          return new Response("unsupported field", { status: 400 });
        }
        return new Response(
          JSON.stringify({
            data: { id: "2061726102180311040", username: "loveyong07" },
            includes: { posts: [{ id: "8", text: "Expanded pin" }] },
          }),
          { status: 200 },
        );
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
      if (parsed.pathname.endsWith("/users/2061726102180311040")) {
        return new Response(
          JSON.stringify({ data: { id: "2061726102180311040", username: "loveyong07", pinned_tweet_id: "8" } }),
          { status: 200 },
        );
      }
      if (parsed.pathname === "/2/tweets/8") {
        detailUrls.push(parsed);
        return parsed.searchParams.has("tweet.fields")
          ? new Response("unsupported field", { status: 400 })
          : new Response(
              JSON.stringify({
                data: post("8", "Current fields", {
                  author_id: parsed.searchParams.get("expansions")?.split(",").includes("author_id")
                    ? "2061726102180311040"
                    : undefined,
                }),
              }),
              { status: 200 },
            );
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
      if (parsed.pathname.endsWith("/users/2061726102180311040")) {
        return new Response(
          JSON.stringify({ data: { id: "2061726102180311040", username: "loveyong07", pinned_tweet_id: "8" } }),
          { status: 200 },
        );
      }
      if (parsed.pathname === "/2/tweets/8") {
        return new Response(JSON.stringify({ data: post("8", "Someone else's post", { author_id: "456" }) }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ data: [post("9", "Daily"), post("8", "Pinned ID")] }), { status: 200 });
    },
  });

  const result = await feed();
  assert.equal(result.pinnedPost, null);
  assert.equal(result.pinnedStatus, "unavailable");
  assert.deepEqual(
    result.posts.map((item) => item.id),
    ["9"],
  );
});

test("keeps the daily feed live when user lookup has a partial pin expansion error", async () => {
  const urls = [];
  const feed = createXFeedService({
    token: "private-test-token",
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      urls.push(parsed);
      if (parsed.pathname.endsWith("/users/2061726102180311040")) {
        return new Response(
          JSON.stringify({
            data: { id: "2061726102180311040", username: "loveyong07", pinned_tweet_id: "8" },
            errors: [{ title: "Not Found Error", parameter: "pinned_tweet_id" }],
          }),
          { status: 200 },
        );
      }
      if (parsed.pathname === "/2/tweets/8") {
        return new Response("not found", { status: 404 });
      }
      return new Response(
        JSON.stringify({
          data: ["10", "9", "8", "7", "6", "5", "4"].map((id) => post(id, `Daily ${id}`)),
        }),
        { status: 200 },
      );
    },
  });

  const result = await feed();
  assert.equal(result.status, "ok");
  assert.deepEqual(
    result.posts.map((item) => item.id),
    ["10", "9", "7", "6", "5", "4"],
  );
  assert.equal(result.pinnedPost, null);
  assert.equal(result.pinnedStatus, "unavailable");
  assert.equal(urls[0].searchParams.has("expansions"), false);
});
