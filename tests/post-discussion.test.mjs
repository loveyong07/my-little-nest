import assert from "node:assert/strict";
import test from "node:test";
import { createApiHandler } from "../server/api-handler.mjs";
import { createXFeedService } from "../server/x-feed-service.mjs";
import { isOriginalPost } from "../src/utils/posts.js";
import { X_USER_ID } from "../shared/x-account.mjs";

const origin = "https://nest.test";
const request = (path, options) => new Request(new URL(path, origin), options);
const date = "2026-11-06T00:30:00.000Z";
const owner = { id: X_USER_ID, name: "Owner", username: "owner" };
const guest = { id: "92", name: "Reader", username: "reader" };
const post = (id, text, fields = {}) => ({ id, text, author_id: owner.id, created_at: date, ...fields });
const reference = (type, id) => [{ type, id }];

test("daily and pinned posts show only quotes of posts owned by the site account", async () => {
  for (const pinnedId of ["21", "22", "23"]) {
    const timeline = [
      post("24", "Unverified quote", { referenced_tweets: reference("quoted", "99") }),
      post("23", "Reply to someone else", {
        in_reply_to_user_id: guest.id,
        referenced_tweets: reference("replied_to", "12"),
      }),
      post("22", "Quote of someone else's post", { referenced_tweets: reference("quoted", "12") }),
      post("21", "Verified self quote", { referenced_posts: reference("quoted", "11") }),
    ];
    const includes = {
      tweets: [post("11", "Original text"), post("12", "Someone else's text", { author_id: guest.id })],
    };
    const feed = createXFeedService({
      token: "test-token",
      fetchImpl: async (url) => {
        if (url.pathname === `/2/users/${owner.id}`)
          return Response.json({ data: { ...owner, pinned_tweet_id: pinnedId } });
        if (url.pathname === `/2/tweets/${pinnedId}`)
          return Response.json({ data: timeline.find((item) => item.id === pinnedId), includes });
        return Response.json({ data: timeline, includes });
      },
    });
    const result = await feed();
    assert.deepEqual(
      result.posts.map((item) => item.id),
      pinnedId === "21" ? [] : ["21"],
    );
    assert.equal(result.pinnedStatus, pinnedId === "21" ? "ok" : "none");
    assert.deepEqual((result.pinnedPost ?? result.posts[0]).quotedPost, {
      id: "11",
      text: "Original text",
      created_at: date,
      author: owner.name,
      username: owner.username,
      avatar: null,
      permalink: "https://x.com/owner/status/11",
    });
  }
});

test("embeds and signs the original photo even when the quote expansion contains only text", async () => {
  const original = post("11", "Original photo https://t.co/photo", {
    attachments: { media_keys: ["source-photo"] },
    entities: { urls: [{ url: "https://t.co/photo", expanded_url: "https://x.com/owner/status/11/photo/1" }] },
  });
  const quote = post("21", "https://t.co/quoted", {
    referenced_tweets: reference("quoted", "11"),
    entities: { urls: [{ url: "https://t.co/quoted", expanded_url: "https://twitter.com/owner/status/11" }] },
  });
  const sourceMedia = { media_key: "source-photo", type: "photo", url: "https://pbs.twimg.com/media/Source.jpg" };
  for (const onTimeline of [true, false]) {
    let detailLookups = 0;
    const handle = createApiHandler(
      { X_BEARER_TOKEN: "test-token" },
      {
        fetchImpl: async (url) => {
          if (url.pathname === `/2/users/${owner.id}`) return Response.json({ data: owner });
          if (url.pathname === "/2/tweets") {
            detailLookups += 1;
            assert.equal(url.searchParams.get("ids"), original.id);
            return Response.json({ data: [original], includes: { media: [sourceMedia] } });
          }
          return Response.json({
            data: onTimeline ? [quote, original] : [quote],
            includes: {
              tweets: [post("11", "Original photo")],
              media: onTimeline ? [sourceMedia] : [],
            },
          });
        },
      },
    );
    const { posts } = await (await handle(request("/api/x-posts"))).json();
    assert.equal(detailLookups, onTimeline ? 0 : 1);
    assert.equal(posts[0].text, "");
    assert.equal(isOriginalPost(posts[0]), true);
    assert.equal(posts[0].quotedPost.text, "Original photo");
    assert.equal(posts[0].quotedPost.created_at, date);
    assert.equal(posts[0].quotedPost.username, owner.username);
    assert.match(posts[0].quotedPost.media[0].proxyUrl, /^\/api\/x-media\?url=/);
  }
});
