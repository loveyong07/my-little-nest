import { BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { createBlobArticleCache } from "./article-cache.mjs";
import { createXFeedService } from "./x-feed-service.mjs";

const PATH = "x-feed/snapshot-v1/current.json";
const MAX_BYTES = 4_000_000;
const STALE_AFTER_MS = 3 * 60 * 60 * 1000;
const completeSection = (status) => status === "ok" || status === "none";

/**
 * @typedef {import("../shared/contracts.mjs").XFeedCheckpoint} Checkpoint
 * @typedef {import("../shared/contracts.mjs").ProfileResponse} Profile
 * @typedef {import("../shared/contracts.mjs").PublishedXSnapshot} PublishedSnapshot
 * @typedef {{version: 1, syncedAt: number, runAt: number, checkpoint: Checkpoint, profile: Profile}} Snapshot
 * @typedef {{snapshot: Snapshot, etag: string}} StoredSnapshot
 */

function completeFeed(feed) {
  return (
    feed?.status === "ok" &&
    Array.isArray(feed.posts) &&
    Array.isArray(feed.articles) &&
    Array.isArray(feed.reposts) &&
    [feed.pinnedStatus, feed.articlesStatus, feed.repostsStatus].every(completeSection)
  );
}

/** @returns {value is Snapshot} */
function validSnapshot(value) {
  const saved = value?.checkpoint;
  return (
    value?.version === 1 &&
    Number.isSafeInteger(value.runAt) &&
    Number.isSafeInteger(value.syncedAt) &&
    Number.isSafeInteger(saved?.authorAt) &&
    (saved.fullRefreshAt === null || Number.isSafeInteger(saved.fullRefreshAt)) &&
    [saved.newestSeenId, saved.pinnedId].every((id) => id === null || /^\d{1,19}$/.test(id)) &&
    /^\d{1,19}$/.test(saved.author?.id ?? "") &&
    /^[A-Za-z0-9_]{1,15}$/.test(saved.author.username) &&
    [saved.userFieldMode, saved.postFieldMode].every((mode) => mode === "tweet" || mode === "post") &&
    completeFeed(saved.feed) &&
    value.profile?.status === "ok" &&
    value.profile.profile?.username === saved.author.username
  );
}

export function createBlobXSnapshotStore({ env = process.env, sdk = { get, put } } = {}) {
  const credentials = env.BLOB_READ_WRITE_TOKEN ? { token: env.BLOB_READ_WRITE_TOKEN } : { storeId: env.BLOB_STORE_ID };
  const configured = Boolean(credentials.token || credentials.storeId);

  return {
    configured,
    /** @returns {Promise<StoredSnapshot | null>} */
    async read({ fresh = false } = {}) {
      if (!configured) return null;
      const result = await sdk.get(PATH, {
        ...credentials,
        access: "private",
        useCache: !fresh,
        // Conditional writes need the stored object's ETag, not the weak
        // validator of a compressed HTTP representation.
        ...(fresh ? { headers: { "Accept-Encoding": "identity" } } : {}),
        abortSignal: AbortSignal.timeout(4000),
      });
      if (!result) return null;
      if (result.statusCode !== 200 || !result.stream || result.blob.size > MAX_BYTES) {
        await result.stream?.cancel();
        throw new Error("Invalid X snapshot object");
      }
      // Private JSON can be delivered compressed without a Content-Length.
      // Bound the actual decoded stream even when Blob reports an unknown size.
      let bytes = 0;
      const stream = result.stream.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            bytes += chunk.byteLength;
            if (bytes > MAX_BYTES) throw new Error("X snapshot exceeds the size limit");
            controller.enqueue(chunk);
          },
        }),
      );
      const snapshot = await new Response(stream).json();
      const etag = result.blob.etag;
      if (!validSnapshot(snapshot) || !etag || (fresh && etag.startsWith("W/"))) {
        throw new Error("Invalid X snapshot data");
      }
      return { snapshot, etag };
    },
    /** @param {Snapshot} snapshot */
    async write(snapshot, etag = undefined) {
      const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
      if (!configured || !validSnapshot(snapshot) || bytes.byteLength > MAX_BYTES) {
        throw new Error("X snapshot could not be saved");
      }
      try {
        await sdk.put(PATH, bytes, {
          ...credentials,
          access: "private",
          contentType: "application/json",
          addRandomSuffix: false,
          allowOverwrite: Boolean(etag),
          ...(etag ? { ifMatch: etag } : {}),
          cacheControlMaxAge: 60,
          abortSignal: AbortSignal.timeout(8000),
        });
        return true;
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError) return false;
        throw error;
      }
    },
  };
}

/** @returns {() => Promise<PublishedSnapshot | null>} */
export function readPublishedXSnapshot(store = createBlobXSnapshotStore(), now = Date.now) {
  let latest;
  return async () => {
    try {
      const stored = await store.read();
      if (stored && (!latest || stored.snapshot.syncedAt > latest.syncedAt)) latest = stored.snapshot;
    } catch {
      // The last verified snapshot can still be served during a storage failure.
    }
    if (!latest) return null;
    const { checkpoint, syncedAt, profile } = latest;
    const feed = { ...checkpoint.feed, syncedAt };
    if (now() - syncedAt < STALE_AFTER_MS) return { feed, syncedAt, profile };
    return {
      feed: {
        ...feed,
        status: "stale",
        pinnedStatus: feed.pinnedPost ? "stale" : feed.pinnedStatus,
        articlesStatus: feed.articles.length ? "stale" : "unavailable",
        repostsStatus: feed.reposts.length ? "stale" : "unavailable",
      },
      syncedAt,
      profile: { ...profile, status: "stale" },
    };
  };
}

export async function syncXSnapshot({
  env = process.env,
  store = createBlobXSnapshotStore({ env }),
  serviceFactory = createXFeedService,
  articleCache = createBlobArticleCache({ env }),
  now = Date.now,
  runAt = now(),
} = {}) {
  if (!store.configured || !env.X_BEARER_TOKEN?.trim()) throw new Error("X snapshot credentials are missing");
  const previous = await store.read({ fresh: true });
  if (previous && runAt <= previous.snapshot.runAt) return "already_synced";
  const articleWrites = [];
  const getFeed = serviceFactory({
    token: env.X_BEARER_TOKEN,
    resumeFrom: previous?.snapshot.checkpoint ?? null,
    articleCache,
    now,
    defer: (task) => articleWrites.push(task),
  });
  const [feed, profile] = await Promise.all([getFeed(), getFeed.getProfile()]);
  await Promise.allSettled(articleWrites);
  const checkpoint = getFeed.getCheckpoint();
  if (!completeFeed(feed) || profile.status !== "ok" || !checkpoint) {
    throw new Error("X sync did not return a complete result");
  }
  const written = await store.write({ version: 1, runAt, syncedAt: now(), checkpoint, profile }, previous?.etag);
  return written ? "saved" : "superseded";
}
