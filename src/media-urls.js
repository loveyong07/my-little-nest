// Browser media must use the site's constrained same-origin X routes.
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
