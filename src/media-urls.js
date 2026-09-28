// Browser media must use the site's constrained same-origin X routes.
export function xMediaSrc(value, highResAvatar = false) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const allowedPath = ["/media/", "/profile_images/", "/ext_tw_video_thumb/"].some((prefix) => url.pathname.startsWith(prefix));
    if (url.protocol !== "https:" || url.hostname !== "pbs.twimg.com" || url.username || url.password || url.port || !allowedPath) return null;
    if (highResAvatar && url.pathname.startsWith("/profile_images/")) {
      url.pathname = url.pathname.replace(/_normal(?=\.[^/.]+$)/, "_400x400");
    }
    return `/api/x-media?url=${encodeURIComponent(url.href)}`;
  } catch {
    return null;
  }
}

export function xVideoSrc(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const allowedPath = ["/ext_tw_video/", "/amplify_video/", "/tweet_video/"].some((prefix) => url.pathname.startsWith(prefix));
    if (url.protocol !== "https:" || url.hostname !== "video.twimg.com" || url.username || url.password || url.port || !allowedPath) return null;
    return `/api/x-video?url=${encodeURIComponent(url.href)}`;
  } catch {
    return null;
  }
}
