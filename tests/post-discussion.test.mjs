import assert from "node:assert/strict";
import test from "node:test";
import { createApiHandler } from "../server/api-handler.mjs";
import { createBlobPostComments } from "../server/blob-post-comments.mjs";
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
    assert.equal(posts[0].quotedPost.repliesUrl, undefined);
  }
});

test("a signed post loads only its own public direct replies, coalescing identical searches", async () => {
  let searches = 0;
  const handleApi = createApiHandler(
    { X_BEARER_TOKEN: "test-token" },
    {
      serviceFactory: () => async () => ({ status: "ok", posts: [post("42", "Reading here")] }),
      fetchImpl: async (url) => {
        searches += 1;
        assert.equal(url.pathname, "/2/tweets/search/recent");
        assert.equal(url.searchParams.get("query"), "in_reply_to_tweet_id:42");
        const included = post("43", "A reply", {
          author_id: guest.id,
          referenced_tweets: reference("replied_to", "42"),
        });
        return Response.json({
          data: url.searchParams.has("next_token")
            ? [included]
            : [
                included,
                post("44", "Nested reply", { referenced_tweets: reference("replied_to", "43") }),
                post("45", "Quote", { referenced_tweets: reference("quoted", "42") }),
                post("46", "Protected", { author_id: "93", referenced_tweets: reference("replied_to", "42") }),
              ],
          includes: { users: [owner, guest, { id: "93", username: "hidden", protected: true }] },
          meta: { next_token: url.searchParams.has("next_token") ? "third" : "second" },
        });
      },
    },
  );
  const { posts } = await (await handleApi(request("/api/x-posts"))).json();
  const url = posts[0].repliesUrl;
  assert.equal((await handleApi(request(url.replace("post=42", "post=45")))).status, 403);
  assert.equal((await handleApi(request(`${url}&post=42`))).status, 403);
  assert.equal(searches, 0);
  const results = await Promise.all([handleApi(request(url)), handleApi(request(url))]);
  for (const response of results) {
    const data = await response.json();
    assert.equal(data.status, "ok");
    assert.equal(data.limited, true);
    assert.deepEqual(
      data.replies.map(({ id, username, repliesUrl }) => ({ id, username, repliesUrl })),
      [{ id: "43", username: "reader", repliesUrl: undefined }],
    );
  }
  assert.equal(searches, 2);
});

test("public comments survive independent handlers, concurrent Blob writes, and a submit retry", async () => {
  const records = new Map();
  let conflicts = 0;
  let initialWrites = 0;
  let releaseInitialWrites;
  const concurrentWrites = new Promise((resolve) => {
    releaseInitialWrites = resolve;
  });
  const sdk = {
    get: async (path, options) => {
      assert.equal(options.useCache, false);
      const record = records.get(path);
      return record
        ? {
            statusCode: 200,
            blob: { etag: record.etag, size: Buffer.byteLength(record.text) },
            stream: new Response(record.text).body,
          }
        : null;
    },
    put: async (path, text, options) => {
      assert.equal(options.access, "private");
      if (!options.ifMatch) {
        if (++initialWrites === 2) releaseInitialWrites();
        await concurrentWrites;
      }
      const existing = records.get(path);
      if ((existing?.etag ?? null) !== (options.ifMatch ?? null)) {
        conflicts++;
        throw new Error("Blob precondition failed");
      }
      records.set(path, { text, etag: crypto.randomUUID() });
    },
  };
  const env = { X_MEDIA_SIGNING_SECRET: "test-secret", BLOB_READ_WRITE_TOKEN: "test-blob" };
  const instance = () =>
    createApiHandler(env, {
      serviceFactory: () => async () => ({ status: "ok", posts: [post("42", "First"), post("43", "Second")] }),
      commentStore: createBlobPostComments({ env, sdk }),
    });
  const first = instance();
  const other = instance();
  const { posts } = await (await first(request("/api/x-posts"))).json();
  const [url, otherUrl] = posts.map((item) => item.commentsUrl);
  const submit = (handler, text, id, from = origin) =>
    handler(
      request(url, {
        method: "POST",
        headers: { "content-type": "application/json", origin: from },
        body: JSON.stringify({ text, id }),
      }),
    );
  const firstId = crypto.randomUUID();
  const secondId = crypto.randomUUID();
  assert.equal((await submit(first, "Off-site submit", firstId, "https://another.test")).status, 403);
  assert.equal((await submit(first, " ", firstId)).status, 400);
  const responses = await Promise.all([
    submit(first, "A comment", firstId),
    submit(other, "Another comment", secondId),
  ]);
  assert.ok(responses.every((response) => response.ok));
  assert.ok(conflicts > 0);
  assert.equal((await submit(first, "A comment", firstId)).status, 200);
  const loaded = await (await instance()(request(url))).json();
  assert.deepEqual(loaded.comments.map((comment) => comment.text).sort(), ["A comment", "Another comment"]);
  assert.deepEqual(await (await other(request(otherUrl))).json(), { status: "ok", comments: [] });
});
