import assert from "node:assert/strict";
import test from "node:test";
import { createApiHandler } from "../server/api-handler.mjs";
import { createBlobXSnapshotStore, readPublishedXSnapshot, syncXSnapshot } from "../server/x-feed-snapshot.mjs";
import { createXFeedService } from "../server/x-feed-service.mjs";

const env = { X_BEARER_TOKEN: "test-token", BLOB_READ_WRITE_TOKEN: "store-token" };
const owner = { id: "2061726102180311040", username: "loveyong07", pinned_tweet_id: "8" };
const userPath = "/2/users/" + owner.id;
const media = [{ media_key: "photo", type: "photo", url: "https://pbs.twimg.com/media/Snapshot.jpg" }];
const post = (id) => ({
  id,
  text: "Post " + id,
  created_at: "2026-11-23T00:00:00Z",
  author_id: owner.id,
  attachments: { media_keys: ["photo"] },
});

test("private sync resumes publication by cursor, reuses account data and keeps the last complete snapshot", async () => {
  const start = Date.UTC(2026, 10, 23, 12);
  let time = start;
  let data;
  let etag;
  const calls = [];
  let stage = "initial";
  const sdk = {
    async get(pathname, options) {
      assert.equal(pathname, "x-feed/snapshot-v1/current.json");
      assert.equal(options.access, "private");
      if (!data) return null;
      return {
        statusCode: 200,
        stream: new Response(data).body,
        blob: { etag, size: data.byteLength },
      };
    },
    async put(pathname, bytes, options) {
      assert.equal(pathname, "x-feed/snapshot-v1/current.json");
      assert.equal(options.access, "private");
      assert.equal(options.addRandomSuffix, false);
      assert.equal(options.ifMatch, etag);
      assert.equal(options.allowOverwrite, Boolean(etag));
      data = bytes;
      etag = etag ? etag + "1" : "1";
    },
  };
  const store = createBlobXSnapshotStore({ sdk, env });

  async function fetchImpl(input) {
    const url = new URL(input);
    const sinceId = url.searchParams.get("since_id");
    calls.push([url.pathname, sinceId]);
    if (url.pathname === userPath) return Response.json({ data: owner });
    if (url.pathname === "/2/tweets/8") return Response.json({ data: post("8"), includes: { media } });
    assert.equal(url.pathname, userPath + "/tweets");
    if (stage === "failed") return new Response(null, { status: 503 });
    const posts = stage === "initial" ? [post("9")] : stage === "new" ? [post("10")] : [];
    return Response.json({
      data: posts,
      includes: { media },
      meta: posts.length ? { newest_id: posts[0].id } : { result_count: 0 },
    });
  }
  const sync = (runAt = time) =>
    syncXSnapshot({
      env,
      now: () => time,
      runAt,
      articleCache: null,
      store,
      serviceFactory: (options) => createXFeedService({ ...options, fetchImpl }),
    });

  assert.equal(await sync(), "saved");
  assert.equal(await sync(start), "already_synced");
  assert.deepEqual(calls, [
    [userPath, null],
    [userPath + "/tweets", null],
    ["/2/tweets/8", null],
  ]);
  stage = "new";
  time += 3_600_000;
  assert.equal(await sync(), "saved");
  stage = "empty";
  time += 3_600_000;
  assert.equal(await sync(), "saved");
  assert.deepEqual(calls.slice(3), [
    [userPath + "/tweets", "9"],
    [userPath + "/tweets", "10"],
  ]);

  const stored = await store.read();
  assert.equal(stored.snapshot.checkpoint.newestSeenId, "10");
  assert.equal(stored.snapshot.checkpoint.fullRefreshAt, start);
  assert.equal(stored.snapshot.checkpoint.feed.pinnedPost.id, "8");
  assert.deepEqual(
    stored.snapshot.checkpoint.feed.posts.map(({ id }) => id),
    ["10", "9"],
  );
  assert.equal(stored.snapshot.checkpoint.feed.posts[0].media[0].proxyUrl, undefined);
  assert.equal(stored.snapshot.profile.profile.username, owner.username);
  stage = "failed";
  time += 3_600_000;
  await assert.rejects(sync(), /complete result/);
  assert.deepEqual(await store.read(), stored);

  let loadFailed = false;
  const readSnapshot = readPublishedXSnapshot(
    {
      ...store,
      read: () => {
        if (loadFailed) throw new Error("storage unavailable");
        return store.read();
      },
    },
    () => time,
  );
  let upstream = 0;
  const api = createApiHandler(env, {
    readXSnapshot: readSnapshot,
    serviceFactory: () => {
      upstream++;
      throw Error("visitor caused an upstream request");
    },
  });
  const visit = (path) => api(new Request("https://nest.test/api/" + path));
  const profile = await visit("x-profile");
  assert.equal(profile.status, 200);
  assert.equal(profile.headers.get("x-nest-x-source"), "snapshot");
  const feed = await visit("x-posts");
  assert.equal(feed.status, 200);
  assert.equal(feed.headers.get("x-nest-x-synced-at"), new Date(stored.snapshot.syncedAt).toISOString());
  const body = await feed.json();
  assert.equal(body.syncedAt, stored.snapshot.syncedAt);
  assert.match(body.posts[0].media[0].proxyUrl, /^\/api\/x-media\?/);
  assert.equal(body.checkpoint, undefined);
  loadFailed = true;
  time += 2 * 3_600_000;
  const stale = await (await visit("x-posts")).json();
  assert.equal(stale.status, "stale");
  assert.equal(stale.syncedAt, stored.snapshot.syncedAt);
  assert.equal(upstream, 0);
});

test("when no snapshot exists, neither public route falls back to X", async () => {
  let upstream = 0;
  const api = createApiHandler(env, {
    readXSnapshot: async () => null,
    serviceFactory: () => void upstream++,
  });
  for (const path of ["x-posts", "x-profile"]) {
    const response = await api(new Request("https://nest.test/api/" + path));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).status, "unavailable");
  }
  assert.equal(upstream, 0);
});
