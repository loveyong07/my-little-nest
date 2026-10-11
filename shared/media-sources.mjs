// X media hosts and path prefixes the site may display. Shared by the feed service,
// the signed media proxy (server/) and the browser (src/media-urls.js).
export const MEDIA_SOURCES = {
  image: { host: "pbs.twimg.com", paths: ["/media/", "/profile_images/", "/ext_tw_video_thumb/"] },
  video: { host: "video.twimg.com", paths: ["/ext_tw_video/", "/amplify_video/", "/tweet_video/"] },
};

// Returns the parsed URL of an allowed X media file, or null. Signed and legacy
// permissions bind the complete URL, including the original size/format query.
export function parseMediaSource(value, kind) {
  const source = MEDIA_SOURCES[kind];
  if (!source || typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== source.host ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      !source.paths.some((prefix) => url.pathname.startsWith(prefix))
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

// Width and height reported by X, when they are plausible pixel sizes.
export function mediaDimensions(media) {
  const { width, height } = media ?? {};
  return Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= 20_000 &&
    height <= 20_000
    ? { width, height }
    : null;
}
