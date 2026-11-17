import assert from "node:assert/strict";
import test from "node:test";
import { createXFeedService } from "../server/x-feed-service.mjs";
import { authorizeFeed, authorizedMediaRequest, parseMediaSource } from "../server/x-media-auth.mjs";

const account = { id: "2061726102180311040", username: "loveyong07", name: "初咏", pinned_tweet_id: "90" };
const writer = { id: "42", username: "writer", name: "Writer" };
const gif = {
  media_key: "gif",
  type: "animated_gif",
  preview_image_url: "https://pbs.twimg.com/tweet_video_thumb/Audit.jpg",
  variants: [{ content_type: "video/mp4", url: "https://video.twimg.com/tweet_video/Audit.mp4" }],
  width: 640,
  height: 360,
};
const item = (id, author_id = account.id) => ({
  id,
  author_id,
  created_at: "2026-11-17T00:00:00Z",
  text: "",
  attachments: { media_keys: ["gif"] },
});

test("GIF-only originals, pins and reposts retain playable, signed MP4s and their original posters", async () => {
  const feed = await createXFeedService({
    token: "fixture-only",
    articleFetchImpl: null,
    fetchImpl: async (input) => {
      const url = new URL(input);
      if (url.pathname === `/2/users/${account.id}`) return Response.json({ data: account });
      if (url.pathname === "/2/tweets/90") return Response.json({ data: item("90"), includes: { media: [gif] } });
      if (url.pathname === "/2/tweets")
        return Response.json({ data: [item("50", writer.id)], includes: { media: [gif], users: [writer] } });
      return Response.json({
        data: [item("100"), { ...item("110"), referenced_tweets: [{ type: "retweeted", id: "50" }] }],
        includes: { media: [gif] },
      });
    },
  })();
  assert.deepEqual(
    feed.posts.map((post) => post.id),
    ["100"],
  );
  assert.equal(feed.pinnedStatus, "ok");
  assert.equal(feed.repostsStatus, "ok");
  const auth = { secret: "fixture-only-signing-secret" };
  const signed = await authorizeFeed(feed, auth);
  for (const post of [signed.posts[0], signed.pinnedPost, signed.reposts[0]]) {
    assert.equal(post.text, "");
    const media = post.media[0];
    assert.equal(media.type, "video");
    assert.equal(media.animated, true);
    assert.equal(media.url, gif.variants[0].url);
    assert.equal(media.poster, gif.preview_image_url);
    assert.equal(media.width, 640);
    assert.equal(media.height, 360);
    for (const [kind, source, proxy] of [
      ["video", media.url, media.proxyUrl],
      ["image", media.poster, media.posterProxyUrl],
    ]) {
      assert.ok(proxy, `${kind} has a signature`);
      const request = new Request(new URL(proxy, "https://nest.test"), {
        headers: { "sec-fetch-site": "same-origin" },
      });
      assert.equal(await authorizedMediaRequest(request, parseMediaSource(source, kind), kind, auth), true);
      assert.equal(
        await authorizedMediaRequest(
          new Request(request.url.replace("signature=", "signature=0")),
          parseMediaSource(source, kind),
          kind,
          auth,
        ),
        false,
      );
    }
  }
  assert.equal(parseMediaSource("https://pbs.twimg.com/other_thumb/a.jpg", "image"), null);
  assert.equal(parseMediaSource("https://pbs.twimg.com.evil.test/tweet_video_thumb/a.jpg", "image"), null);
});
