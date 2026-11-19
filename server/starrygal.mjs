// Server-only TouchGal metadata relay for the StarryGal launcher.
// Uses Web-standard Fetch and Web Crypto APIs so Vercel, Sites Workers and Vite dev share one core.
const UPSTREAM = "https://developer.touchgal.com/api/v1/";
const MAX_CACHE_ENTRIES = 500;
const MAX_VISITORS = 2000;
const VISITOR_LIMIT = 30;
const VISITOR_WINDOW_MS = 60000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const ACTION_PARAMETERS = {
  status: new Set(["action"]),
  search: new Set(["action", "keyword", "page", "allowNsfw"]),
  detail: new Set(["action", "uniqueId", "allowNsfw"]),
  resources: new Set(["action", "uniqueId", "allowNsfw"]),
  patches: new Set(["action", "uniqueId", "allowNsfw"]),
};

const string = (value) => (typeof value === "string" ? value : "");
const strings = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === "string").slice(0, 100) : []);
const safeUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
};
const touchgalUrl = (value) => {
  const valueUrl = safeUrl(value);
  return valueUrl && /(^|\.)touchgal\.(ink|com)$/.test(new URL(valueUrl).hostname) ? valueUrl : null;
};
const positiveInteger = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : 0);

async function sha256Hex(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function jsonResponse(status, body, ttl = 0, retryAfter = undefined, extraHeaders = {}) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
    // Public metadata, no cookies. This also supports the GitHub Pages preview.
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": ttl ? `public, max-age=60, s-maxage=${ttl}, stale-while-revalidate=3600` : "no-store",
    ...extraHeaders,
  });
  if (retryAfter) headers.set("Retry-After", String(retryAfter));
  return new Response(JSON.stringify(body), { status, headers });
}

function failureResponse(status, code, retryAfter = undefined, extraHeaders = {}) {
  return jsonResponse(status, { success: false, error: { code, message: code } }, 0, retryAfter, extraHeaders);
}

export function parseRequest(requestUrl) {
  if (typeof requestUrl !== "string" || requestUrl.length > 2048) throw new Error("BAD_REQUEST");
  const url = new URL(requestUrl, "https://relay.invalid");
  const action = url.searchParams.get("action") || "status";
  const allowed = ACTION_PARAMETERS[action];
  if (!allowed) throw new Error("BAD_REQUEST");
  for (const name of url.searchParams.keys()) {
    if (!allowed.has(name) || url.searchParams.getAll(name).length !== 1) throw new Error("BAD_REQUEST");
  }
  const allowNsfw = url.searchParams.get("allowNsfw") || "false";
  if (allowNsfw !== "true" && allowNsfw !== "false") throw new Error("BAD_REQUEST");
  const upstream = new URL(action === "status" ? "me" : "games/search", UPSTREAM);
  if (action === "search") {
    const keyword = (url.searchParams.get("keyword") || "").trim();
    const pageText = url.searchParams.get("page") || "1";
    const page = Number(pageText);
    if (
      [...keyword].length < 3 ||
      [...keyword].length > 100 ||
      !/^\d+$/.test(pageText) ||
      !Number.isInteger(page) ||
      page < 1 ||
      page > 100
    )
      throw new Error("BAD_REQUEST");
    upstream.searchParams.set("keyword", keyword);
    upstream.searchParams.set("page", String(page));
    upstream.searchParams.set("limit", "20");
  } else if (action !== "status") {
    const id = url.searchParams.get("uniqueId") || "";
    if (!/^[a-z\d]{8}$/i.test(id)) throw new Error("BAD_REQUEST");
    upstream.pathname = `/api/v1/games/${id}${action === "detail" ? "" : "/" + action}`;
  }
  if (action !== "status") upstream.searchParams.set("allowNsfw", allowNsfw);
  return {
    action,
    upstream,
    ttl: action === "status" ? 300 : action === "detail" ? 86400 : 3600,
  };
}

/** Whitelist the documented fields, including on the credential self-check. */
export function publicData(action, data = {}) {
  if (action === "status")
    return {
      service: "StarryGal TouchGal relay",
      ready: true,
      minuteLimit: positiveInteger(data.minuteLimit),
      dailyLimit: positiveInteger(data.dailyLimit),
    };
  if (action === "search")
    return {
      items: Array.isArray(data.items)
        ? data.items
            .filter((item) => item && /^[a-z\d]{8}$/i.test(item.uniqueId))
            .map((item) => ({
              name: string(item.name),
              uniqueId: item.uniqueId,
            }))
            .slice(0, 20)
        : [],
      pagination: {
        page: positiveInteger(data.pagination?.page),
        total: positiveInteger(data.pagination?.total),
        hasMore: data.pagination?.hasMore === true,
      },
    };
  if (action === "detail")
    return {
      uniqueId: string(data.uniqueId),
      name: string(data.name),
      aliases: strings(data.aliases),
      introduction: string(data.introduction),
      bannerUrl: safeUrl(data.bannerUrl),
      type: strings(data.type),
      platform: strings(data.platform),
      language: strings(data.language),
      tags: strings(data.tags),
      releaseDate: string(data.releaseDate),
      updatedAt: string(data.updatedAt),
      companies: Array.isArray(data.companies)
        ? data.companies
            .filter(Boolean)
            .map((company) => ({
              name: string(company.name),
              aliases: strings(company.aliases),
            }))
            .slice(0, 50)
        : [],
      rating: {
        average:
          typeof data.rating?.average === "number" && Number.isFinite(data.rating.average) ? data.rating.average : null,
        count: positiveInteger(data.rating?.count),
      },
      touchgalUrl: touchgalUrl(data.touchgalUrl),
    };
  return {
    items: Array.isArray(data.items)
      ? data.items
          .filter((item) => item && touchgalUrl(item.deepLink))
          .slice(0, 200)
          .map((item) => ({
            name: string(item.name),
            description: string(item.description),
            sizes: strings(item.sizes),
            categories: strings(item.categories),
            deepLink: touchgalUrl(item.deepLink),
          }))
      : [],
  };
}

function clientAddress(request, fallbackAddress = "unknown") {
  const vercelForwarded = request.headers.get("x-vercel-forwarded-for");
  const realIp = request.headers.get("x-real-ip") || request.headers.get("cf-connecting-ip");
  const forwarded = request.headers.get("x-forwarded-for");
  const raw = vercelForwarded || realIp || forwarded || fallbackAddress || "unknown";
  return raw.split(",")[0].trim() || "unknown";
}

export function createStarryGalFetchHandler({
  fetchImpl = fetch,
  token = () => globalThis.process?.env?.TOUCHGAL_API_TOKEN,
} = {}) {
  // Keep rate-limit and cache tables scoped per handler instance so tests and
  // rotated credentials stay isolated.
  const cache = new Map();
  const pending = new Map();
  const visitors = new Map();
  const overflowVisitors = new Array(128);

  async function visitorAllowed(request, fallbackAddress) {
    const address = clientAddress(request, fallbackAddress);
    const key = (await sha256Hex(address)).slice(0, 24);
    const now = Date.now();
    for (const [id, value] of visitors) if (value.until <= now) visitors.delete(id);
    let item = visitors.get(key);
    if (item) return ++item.count <= VISITOR_LIMIT;
    if (visitors.size < MAX_VISITORS) {
      visitors.set(key, { until: now + VISITOR_WINDOW_MS, count: 1 });
      return true;
    }
    const bucket = Number.parseInt(key.slice(0, 2), 16) % overflowVisitors.length;
    item = overflowVisitors[bucket];
    if (!item || item.until <= now) {
      item = { until: now + VISITOR_WINDOW_MS, count: 0 };
      overflowVisitors[bucket] = item;
    }
    return ++item.count <= VISITOR_LIMIT;
  }

  function storeCache(key, body, ttl) {
    const now = Date.now();
    for (const [entryKey, entry] of cache) {
      if (entry.expires <= now) cache.delete(entryKey);
    }
    if (cache.has(key)) cache.delete(key);
    while (cache.size >= MAX_CACHE_ENTRIES) {
      cache.delete(cache.keys().next().value);
    }
    cache.set(key, { body, expires: now + ttl * 1000 });
  }

  return async function handleStarryGal(request, { remoteAddress = undefined } = {}) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "X-Robots-Tag": "noindex, nofollow",
        },
      });
    }
    if (request.method !== "GET") {
      return failureResponse(405, "METHOD_NOT_ALLOWED", undefined, { Allow: "GET, OPTIONS" });
    }
    let parsed;
    try {
      parsed = parseRequest(request.url || "");
    } catch {
      return failureResponse(400, "BAD_REQUEST");
    }
    const secret = token()?.trim();
    if (!secret) {
      return failureResponse(503, "NOT_CONFIGURED");
    }
    if (!(await visitorAllowed(request, remoteAddress))) {
      return failureResponse(429, "RATE_LIMITED", 60);
    }
    // The token hash isolates a rotated credential without retaining its plaintext as a cache key.
    const key = (await sha256Hex(secret)).slice(0, 12) + parsed.upstream.href;
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) {
      // Refresh LRU recency on hit.
      cache.delete(key);
      cache.set(key, cached);
      return jsonResponse(200, cached.body, parsed.ttl);
    }
    if (cached) cache.delete(key);
    try {
      let operation = pending.get(key);
      if (!operation) {
        operation = (async () => {
          const response = await fetchImpl(parsed.upstream, {
            headers: {
              Authorization: `Bearer ${secret}`,
              Accept: "application/json",
              "User-Agent": "StarryGal/0.2 (+https://github.com/loveyong07/loveyong-starrygal)",
            },
            signal: AbortSignal.timeout(12000),
            redirect: "error",
          });
          if (!response.ok) {
            const status = [400, 404, 429].includes(response.status) ? response.status : 503;
            const code =
              {
                400: "BAD_REQUEST",
                404: "NOT_FOUND",
                429: "RATE_LIMITED",
              }[response.status] || "UPSTREAM_UNAVAILABLE";
            return { status, code };
          }
          if (!response.body) throw new Error("UPSTREAM_UNAVAILABLE");
          // Limit the response before JSON parsing; upstream content is not trusted.
          const reader = response.body.getReader();
          const chunks = [];
          let size = 0;
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              size += value.byteLength;
              if (size > MAX_RESPONSE_BYTES) {
                await reader.cancel();
                throw new Error("UPSTREAM_UNAVAILABLE");
              }
              chunks.push(value);
            }
          } finally {
            reader.releaseLock();
          }
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
          }
          const envelope = JSON.parse(decoder.decode(bytes));
          if (
            envelope?.success !== true ||
            !envelope.data ||
            typeof envelope.data !== "object" ||
            Array.isArray(envelope.data)
          )
            throw new Error("UPSTREAM_UNAVAILABLE");
          return {
            status: 200,
            body: {
              success: true,
              data: publicData(parsed.action, envelope.data),
            },
          };
        })();
        pending.set(key, operation);
        // Cleanup belongs to the operation owner, including rejected requests.
        void operation.finally(() => pending.delete(key)).catch(() => {});
      }
      const result = await operation;
      if (result.status !== 200) {
        return failureResponse(result.status, result.code, result.status === 429 ? 60 : undefined);
      }
      storeCache(key, result.body, parsed.ttl);
      return jsonResponse(200, result.body, parsed.ttl);
    } catch {
      return failureResponse(503, "UPSTREAM_UNAVAILABLE");
    }
  };
}
