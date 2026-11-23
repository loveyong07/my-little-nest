import { get, list, put } from "@vercel/blob";
import { createDriveClient, validDriveId } from "./google-drive.mjs";
import {
  createBlobVideoCache,
  isMp4,
  matchesIfRange,
  MAX_VIDEO_SIZE,
  VIDEO_TYPE,
  videoCacheKey,
} from "./video-cache.mjs";
import { parseMediaSource } from "../shared/media-sources.mjs";

function validSize(size) {
  return Number.isSafeInteger(size) && size > 0 && size <= MAX_VIDEO_SIZE;
}

const indexPrefix = "x-videos/drive-index-v1/";
const indexPath = (key) => `${indexPrefix}${key}.json`;
const reservationPath = (key) => `x-videos/drive-reservations-v1/${key}.json`;

export function collectVideoSources(feed) {
  const sources = new Set();
  const posts = [feed.pinnedPost, ...feed.posts, ...(feed.reposts ?? [])];
  const items = [...posts.flatMap((post) => (post ? [post, post.quotedPost] : [])), ...(feed.articles ?? [])];
  for (const item of items) {
    for (const media of item?.media ?? []) {
      const source = parseMediaSource(media.url, "video");
      if (source) sources.add(source.href);
    }
  }
  return [...sources];
}

export function createDriveVideoArchive({
  env = process.env,
  fetchImpl = fetch,
  indexSdk = { get, list, put },
  legacy = createBlobVideoCache({ env }),
  drive = createDriveClient({ env, fetchImpl }),
} = {}) {
  const creds = env.BLOB_READ_WRITE_TOKEN ? { token: env.BLOB_READ_WRITE_TOKEN } : { storeId: env.BLOB_STORE_ID };
  if (!drive || (!creds.token && !creds.storeId)) return null;
  const cachedIndex = new Map();

  async function readRecord(path, signal, fresh = false) {
    const response = await indexSdk.get(path, {
      ...creds,
      access: "private",
      useCache: !fresh,
      abortSignal: signal,
    });
    if (!response) return null;
    if (!response.stream || response.statusCode !== 200 || response.blob.size > 512) {
      await response.stream?.cancel();
      throw new Error("Drive video index is invalid");
    }
    const entry = await new Response(response.stream).json();
    if (!validDriveId(entry?.id) || (entry.size !== null && !validSize(entry.size)))
      throw new Error("Invalid video entry");
    return entry;
  }

  async function createRecord(path, id, size, signal) {
    try {
      await indexSdk.put(path, JSON.stringify({ id, size }), {
        ...creds,
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: false,
        cacheControlMaxAge: 60,
        abortSignal: signal,
      });
      return { id, size };
    } catch (error) {
      const existing = signal.aborted ? null : await readRecord(path, signal, true).catch(() => null);
      if (existing?.size === size && (size === null || existing.id === id)) return existing;
      throw error;
    }
  }

  async function uploadFromSource(id, key, source, signal) {
    const headers = new Headers({ Accept: VIDEO_TYPE, "Accept-Encoding": "identity" });
    let response = await legacy?.read(source, headers, signal);
    if (response && (!response.body || !validSize(Number(response.headers.get("content-length"))))) {
      await response.body?.cancel();
      response = null;
    }
    response ??= await fetchImpl(source, { headers, signal, redirect: "error" });
    const size = Number(response.headers.get("content-length"));
    const body = response.body;
    try {
      if (response.status !== 200 || !body || !validSize(size) || !isMp4(response.headers.get("content-type")))
        return null;
      return await drive.upload(id, key, size, body, signal);
    } finally {
      if (body && !body.locked) await body.cancel().catch(() => {});
    }
  }

  return {
    async archivedPaths(signal) {
      const paths = new Set();
      let cursor;
      do {
        const page = await indexSdk.list({ ...creds, prefix: indexPrefix, cursor, abortSignal: signal });
        page.blobs.forEach(({ pathname }) => paths.add(pathname));
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return paths;
    },

    async archive(source, signal, archivedPaths = new Set()) {
      const canonical = parseMediaSource(source, "video")?.href;
      if (!canonical) return "skipped";
      const key = await videoCacheKey(canonical);
      const path = indexPath(key);
      if (archivedPaths.has(path) || (await readRecord(path, signal, true))) return "stored";
      const reservation = reservationPath(key);
      let entry = await readRecord(reservation, signal, true);
      if (!entry) {
        entry = await createRecord(reservation, await drive.generateId(signal), null, signal);
      }
      // A previous run may have uploaded the file before publishing its index.
      const file =
        (await drive.metadata(entry.id, signal)) ?? (await uploadFromSource(entry.id, key, canonical, signal));
      if (!file) return "skipped";
      const size = Number(file.size);
      if (
        file.id !== entry.id ||
        !validSize(size) ||
        !isMp4(file.mimeType) ||
        file.trashed ||
        file.appProperties?.nestVideo !== key
      ) {
        throw new Error("Drive did not confirm the archived video");
      }
      await createRecord(path, entry.id, size, signal);
      return "archived";
    },

    async read(source, headers, signal) {
      const connection = new AbortController();
      const deadline = setTimeout(() => connection.abort(), 4500);
      const driveSignal = AbortSignal.any([signal, connection.signal]);
      let response;
      try {
        const key = await videoCacheKey(source);
        let state = cachedIndex.get(key);
        if (!state || state.until <= Date.now()) {
          const index = await readRecord(indexPath(key), driveSignal);
          const entry = index?.size ? index : null;
          state = { entry, until: Date.now() + (entry ? 600_000 : 30_000) };
          cachedIndex.delete(key);
          if (cachedIndex.size >= 256) cachedIndex.delete(cachedIndex.keys().next().value);
          cachedIndex.set(key, state);
        }
        const { entry } = state;
        if (!entry) return null;
        let range = headers.get("range");
        const ifRange = headers.get("if-range");
        response = await drive.download(entry.id, driveSignal, range);
        if (range && ifRange && [206, 416].includes(response.status) && !matchesIfRange(ifRange, response.headers)) {
          await response.body?.cancel();
          range = null;
          response = await drive.download(entry.id, driveSignal);
        }
        if (range && response.status === 416) {
          await response.body?.cancel();
          return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${entry.size}` } });
        }
        const validRange = new RegExp(`^bytes \\d+-\\d+/${entry.size}$`).test(
          response.headers.get("content-range") ?? "",
        );
        if (
          !response.body ||
          !isMp4(response.headers.get("content-type")) ||
          (range ? response.status !== 206 || !validRange : response.status !== 200)
        ) {
          await response.body?.cancel();
          return null;
        }
        const resultHeaders = new Headers(response.headers);
        resultHeaders.set("X-Nest-Video-Store", "drive");
        return new Response(response.body, { status: response.status, headers: resultHeaders });
      } catch {
        await response?.body?.cancel().catch(() => {});
        return null;
      } finally {
        clearTimeout(deadline);
      }
    },
  };
}
