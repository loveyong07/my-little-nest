import { Redis } from "@upstash/redis";

/**
 * Creates a KV cache adapter for distributed caching with Upstash Redis or Vercel KV.
 * Falls back gracefully to a mock / no-op if no KV credentials are configured.
 */
export function createKvCache(options = {}) {
  let redis = options.client ?? null;

  if (!redis) {
    const url = options.url || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = options.token || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

    if (url && token) {
      try {
        redis = new Redis({ url, token });
      } catch {
        redis = null;
      }
    }
  }

  return {
    async get(key) {
      if (!redis) return null;
      try {
        const val = await redis.get(key);
        if (val && typeof val === "string") {
          try {
            return JSON.parse(val);
          } catch {
            return val;
          }
        }
        return val ?? null;
      } catch {
        return null;
      }
    },

    async set(key, value, { ex = 86400 } = {}) {
      if (!redis) return false;
      try {
        const payload = typeof value === "object" ? JSON.stringify(value) : value;
        await redis.set(key, payload, { ex });
        return true;
      } catch {
        return false;
      }
    },

    async acquireLock(key, ex = 60) {
      if (!redis) return true;
      try {
        const res = await redis.set(key, "1", { nx: true, ex });
        return res === "OK" || res === true;
      } catch {
        return true;
      }
    },

    async releaseLock(key) {
      if (!redis) return;
      try {
        await redis.del(key);
      } catch {
        // Ignore lock release failures
      }
    },

    isAvailable() {
      return redis !== null;
    },
  };
}
