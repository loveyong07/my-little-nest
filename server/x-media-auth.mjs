import { parseMediaSource, originalPhotoSource } from "../shared/media-sources.mjs";
import { LEGACY_IMAGE_URLS, LEGACY_VIDEO_URLS } from "./x-media-legacy.mjs";
import { allowedMediaContext } from "./media-request-policy.mjs";

export { parseMediaSource };
const DAY_SECONDS = 86400;
const MAX_LIFETIME_SECONDS = 8 * DAY_SECONDS;
// Every accepted retry counter is a distinct CDN cache key for the same source, so the
// accepted set stays small and canonical: decimal text without leading zeros or zero,
// capped at this limit. Keep in step with MAX_MEDIA_RETRY in src/media-urls.js.
export const MEDIA_RETRY_LIMIT = 3;
const legacy = { image: new Set(LEGACY_IMAGE_URLS), video: new Set(LEGACY_VIDEO_URLS) };
const encoder = new TextEncoder();
let cachedSecret;
let cachedKey;

// A dedicated X_MEDIA_SIGNING_SECRET is preferred; without it the key is derived from the
// X credential (signingKey() never uses the secret directly).
export function signingSecret(env = globalThis.process?.env ?? {}) {
  return env.X_MEDIA_SIGNING_SECRET || env.X_BEARER_TOKEN || "";
}

export function validMediaQuery(request) {
  const params = new URL(request.url).searchParams;
  const allowed = new Set(["url", "expires", "signature", "retry", "lightboxRetry", "format"]);
  for (const key of params.keys()) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) return false;
  }
  for (const key of ["retry", "lightboxRetry"]) {
    const value = params.get(key);
    // Canonical text only: 0, 00, 04, 10 and 100 are rejected so the cache-key set stays fixed.
    if (value !== null && (!/^[1-9]\d*$/.test(value) || Number(value) > MEDIA_RETRY_LIMIT)) return false;
  }
  return params.getAll("url").length === 1 && (!params.has("format") || params.get("format") === "webp");
}

async function signingKey(secret) {
  if (!secret) return null;
  if (secret !== cachedSecret) {
    cachedSecret = secret;
    cachedKey = (async () => {
      const rootKey = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const derived = await crypto.subtle.sign("HMAC", rootKey, encoder.encode("little-nest/media-signing-key/v1"));
      return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    })();
  }
  return cachedKey;
}

function payload(kind, source, expires, format = null) {
  return encoder.encode(`little-nest/media/v1\n${kind}\n${expires}\n${source.href}${format ? `\n${format}` : ""}`);
}

export async function signedMediaUrl(value, kind, { secret = signingSecret(), now = Date.now(), format = null } = {}) {
  const source = parseMediaSource(value, kind);
  if (
    format !== null &&
    (format !== "webp" ||
      kind !== "image" ||
      !source?.pathname.startsWith("/media/") ||
      source.searchParams.get("name") !== "orig")
  )
    return null;
  const key = source ? await signingKey(secret) : null;
  if (!key) return null;
  // One URL per resource/day retains shared CDN caching and outlives the 24-hour browser feed cache.
  const expires = (Math.floor(now / (DAY_SECONDS * 1000)) + 8) * DAY_SECONDS;
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, payload(kind, source, expires, format)));
  const signature = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `/api/x-${kind === "image" ? "media" : "video"}?url=${encodeURIComponent(source.href)}&expires=${expires}&signature=${signature}${format ? `&format=${format}` : ""}`;
}

export async function authorizedMediaRequest(
  request,
  source,
  kind,
  { secret = signingSecret(), now = Date.now() } = {},
) {
  if (!source || !validMediaQuery(request)) return false;
  // This is an early browser hotlink check, not a substitute for cryptographic authorization.
  if (!allowedMediaContext(request)) return false;
  const params = new URL(request.url).searchParams;
  const format = params.get("format");
  if (
    format &&
    (kind !== "image" || !source.pathname.startsWith("/media/") || source.searchParams.get("name") !== "orig")
  )
    return false;
  const expiresText = params.get("expires");
  const signature = params.get("signature");
  if (expiresText === null && signature === null) return !format && (legacy[kind]?.has(source.href) ?? false);
  if (!/^\d{10}$/.test(expiresText ?? "") || !/^[a-f0-9]{64}$/.test(signature ?? "")) return false;
  const expires = Number(expiresText);
  const nowSeconds = Math.floor(now / 1000);
  if (expires <= nowSeconds || expires > nowSeconds + MAX_LIFETIME_SECONDS + 60) return false;
  const key = await signingKey(secret);
  if (!key) return false;
  const bytes = Uint8Array.from(signature.match(/.{2}/g), (hex) => Number.parseInt(hex, 16));
  return crypto.subtle.verify("HMAC", key, bytes, payload(kind, source, expires, format));
}

export function boundedMediaCache(request, policy, now = Date.now()) {
  const expires = new URL(request.url).searchParams.get("expires");
  if (expires === null) return policy;
  const remaining = Math.max(0, Number(expires) - Math.floor(now / 1000) - 1);
  const ages = [...policy.matchAll(/(?:^|,\s*)(?:s-maxage|max-age)=(\d+)/g)].map((match) => Number(match[1]));
  const fresh = Math.min(remaining, Math.max(0, ...ages));
  return policy
    .replace(/((?:s-maxage|max-age)=)(\d+)/g, (_, directive, age) => directive + Math.min(Number(age), remaining))
    .replace(
      /(stale-while-revalidate=)(\d+)/g,
      (_, directive, age) => directive + Math.min(Number(age), Math.max(0, remaining - fresh)),
    );
}

async function avatarProxy(value, options) {
  const url = parseMediaSource(value, "image");
  if (!url || !url.pathname.startsWith("/profile_images/")) return undefined;
  const normal = await signedMediaUrl(url.href, "image", options);
  url.pathname = url.pathname.replace(/_normal(?=\.[^/.]+$)/, "_400x400");
  const highRes = await signedMediaUrl(url.href, "image", options);
  return normal && highRes ? { normal, highRes } : undefined;
}

export async function authorizeProfile(result, options) {
  if (!result?.profile) return result;
  const proxy = await avatarProxy(result.profile.avatar, options);
  return { ...result, profile: { ...result.profile, ...(proxy ? { avatarProxy: proxy } : {}) } };
}

export async function authorizeFeed(result, options) {
  async function postWithMedia(post) {
    if (!post) return post;
    const proxy = await avatarProxy(post.avatar, options);
    const media = Array.isArray(post.media)
      ? await Promise.all(
          post.media.map(async (item) => {
            const url = item.type === "photo" ? originalPhotoSource(item.url) : item.url;
            const original = item.type === "photo" && new URL(url).searchParams.get("name") === "orig";
            const proxyUrl = await signedMediaUrl(url, item.type === "video" ? "video" : "image", {
              ...options,
              ...(original ? { format: "webp" } : {}),
            });
            const posterProxyUrl = item.poster ? await signedMediaUrl(item.poster, "image", options) : null;
            return { ...item, url, ...(proxyUrl ? { proxyUrl } : {}), ...(posterProxyUrl ? { posterProxyUrl } : {}) };
          }),
        )
      : undefined;
    const blocks = post.blocks?.map((block) =>
      block.type === "photo" ? { ...block, url: originalPhotoSource(block.url) } : block,
    );
    return {
      ...post,
      ...(blocks ? { blocks } : {}),
      ...(proxy ? { avatarProxy: proxy } : {}),
      ...(media ? { media } : {}),
    };
  }
  return {
    ...result,
    posts: await Promise.all((result?.posts ?? []).map((post) => postWithMedia(post))),
    ...(Array.isArray(result?.articles)
      ? { articles: await Promise.all(result.articles.map((post) => postWithMedia(post))) }
      : {}),
    ...(result?.pinnedPost ? { pinnedPost: await postWithMedia(result.pinnedPost) } : {}),
  };
}
