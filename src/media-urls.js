// Browser media must use the site's constrained same-origin X routes.

// Retry counters are the only unsigned part of a media URL, so each accepted value is a
// separate CDN cache key for the same source. Keep the set small and canonical; the proxy
// enforces the same limit in server/x-media-auth.mjs (MEDIA_RETRY_LIMIT).
export const MAX_MEDIA_RETRY = 3;

export function mediaRetrySrc(src, attempts, key = "retry") {
  if (!src) return null;
  const parsed = Math.trunc(Number(attempts));
  const count = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  // Attempts stay unlimited while the URL only walks the bounded variant set, so a
  // repeatedly failing image can be retried again without minting new cache keys.
  const variant = count > 0 ? ((count - 1) % MAX_MEDIA_RETRY) + 1 : 0;
  return variant > 0 ? `${src}&${key}=${variant}` : src;
}

function authorizedProxySrc(value, route, source) {
  if (typeof value !== "string" || !value.startsWith(`${route}?`)) return null;
  try {
    const url = new URL(value, "https://media.invalid");
    if (url.origin !== "https://media.invalid" || url.pathname !== route || url.hash) return null;
    const keys = [...url.searchParams.keys()];
    if (keys.length !== 3 || !["url", "expires", "signature"].every((key) => url.searchParams.getAll(key).length === 1)) return null;
    const expires = url.searchParams.get("expires");
    if (!/^\d+$/.test(expires) || !Number.isSafeInteger(Number(expires)) || Number(expires) <= 0
      || !/^[a-f0-9]{64}$/.test(url.searchParams.get("signature"))
      || url.searchParams.get("url") !== source) return null;
    return value;
  } catch { return null; }
}

export function xMediaSrc(value, highResAvatar = false, authorizedSrc = null) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const allowedPath = ["/media/", "/profile_images/", "/ext_tw_video_thumb/"].some((prefix) => url.pathname.startsWith(prefix));
    if (url.protocol !== "https:" || url.hostname !== "pbs.twimg.com" || url.username || url.password || url.port || !allowedPath) return null;
    if (highResAvatar && url.pathname.startsWith("/profile_images/")) {
      url.pathname = url.pathname.replace(/_normal(?=\.[^/.]+$)/, "_400x400");
    }
    if (authorizedSrc !== null && authorizedSrc !== undefined) return authorizedProxySrc(authorizedSrc, "/api/x-media", url.href);
    return `/api/x-media?url=${encodeURIComponent(url.href)}`;
  } catch {
    return null;
  }
}

export function xVideoSrc(value, authorizedSrc = null) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const allowedPath = ["/ext_tw_video/", "/amplify_video/", "/tweet_video/"].some((prefix) => url.pathname.startsWith(prefix));
    if (url.protocol !== "https:" || url.hostname !== "video.twimg.com" || url.username || url.password || url.port || !allowedPath) return null;
    if (authorizedSrc !== null && authorizedSrc !== undefined) return authorizedProxySrc(authorizedSrc, "/api/x-video", url.href);
    return `/api/x-video?url=${encodeURIComponent(url.href)}`;
  } catch {
    return null;
  }
}
