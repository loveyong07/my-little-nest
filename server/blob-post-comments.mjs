import { get, put } from "@vercel/blob";
import { COMMENT_LIMIT } from "../shared/post-comments.mjs";

const MAX_RECORD_BYTES = 1024 * 1024;

export function createBlobPostComments({ env = process.env, sdk = { get, put } } = {}) {
  if (!env.BLOB_READ_WRITE_TOKEN && !env.BLOB_STORE_ID) return null;
  const credentials = env.BLOB_READ_WRITE_TOKEN ? { token: env.BLOB_READ_WRITE_TOKEN } : { storeId: env.BLOB_STORE_ID };
  const prefix = env.VERCEL_ENV === "production" ? "post-comments/v1/" : "post-comments/preview/v1/";

  async function read(postId, signal) {
    const blob = await sdk.get(`${prefix}${postId}.json`, {
      ...credentials,
      access: "private",
      useCache: false,
      abortSignal: signal,
    });
    if (!blob) return { etag: null, comments: [] };
    if (blob.statusCode !== 200 || !blob.blob.etag || blob.blob.size > MAX_RECORD_BYTES) {
      await blob.stream?.cancel();
      throw new Error("Invalid comment record");
    }
    const comments = await new Response(blob.stream).json();
    if (!Array.isArray(comments) || comments.length > COMMENT_LIMIT) throw new Error("Invalid comment list");
    return { etag: blob.blob.etag, comments };
  }

  return {
    async list(postId) {
      const { comments } = await read(postId, AbortSignal.timeout(6_000));
      return comments;
    },
    async append(postId, comment) {
      const signal = AbortSignal.timeout(10_000);
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const { etag, comments } = await read(postId, signal);
        const saved = comments.find((item) => item.id === comment.id);
        if (saved) return { status: saved.text === comment.text ? "ok" : "invalid", comments };
        if (comments.length >= COMMENT_LIMIT) return { status: "full" };
        const updated = [comment, ...comments];
        try {
          await sdk.put(`${prefix}${postId}.json`, JSON.stringify(updated), {
            ...credentials,
            access: "private",
            addRandomSuffix: false,
            ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
            contentType: "application/json",
            cacheControlMaxAge: 60,
            abortSignal: signal,
          });
          return { status: "ok", comments: updated };
        } catch (error) {
          // A concurrent creation or conditional-update failure requires a fresh read.
          if (signal.aborted || attempt === 3) throw error;
        }
      }
      throw new Error("Comment write unavailable");
    },
  };
}
