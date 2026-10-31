import { mediaDimensions } from "../../shared/media-sources.mjs";
import { intlLocale } from "../constants/languages.js";
import { displayXText } from "./x-text.js";

export { mediaDimensions };

export function isOwnPost(post) {
  if (!post || !/^\d+$/.test(String(post.id ?? "")) || typeof post.text !== "string") return false;
  if (!post.text.trim() && !post.media?.length) return false;
  try {
    const url = new URL(post.permalink);
    return (
      url.protocol === "https:" &&
      url.hostname === "x.com" &&
      /^\/[A-Za-z0-9_]{1,15}\/status\/\d+$/.test(url.pathname) &&
      url.pathname.endsWith(`/status/${post.id}`)
    );
  } catch {
    return false;
  }
}

export function isOriginalPost(post) {
  return (
    isOwnPost(post) &&
    !post.repostId &&
    !post.referenced_tweets?.length &&
    !post.referenced_posts?.length &&
    !post.in_reply_to_user_id
  );
}

export function postExcerpt(post, t) {
  const text = typeof post.text === "string" ? displayXText(post.text).trim().replace(/\s+/g, " ") : "";
  if (text) {
    const characters = Array.from(text);
    return characters.length > 38 ? `${characters.slice(0, 38).join("")}…` : text;
  }
  return Array.isArray(post.media) && post.media.some((media) => media?.type === "video")
    ? t.postVideoAlt
    : t.postPhotoAlt(1);
}

export function mediaFrameRatio(media, fallback = 4 / 3) {
  const items = Array.isArray(media) ? media : [media];
  return items.length
    ? Math.min(
        ...items.map((item) => {
          const size = mediaDimensions(item);
          return size ? size.width / size.height : fallback;
        }),
      )
    : fallback;
}

export function postMonthKey(post) {
  const date = new Date(post?.created_at);
  return Number.isNaN(date.getTime()) ? "" : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function postMonths(posts, language) {
  const formatter = new Intl.DateTimeFormat(intlLocale(language), { year: "numeric", month: "long" });
  const months = new Map();
  posts.forEach((post, index) => {
    const key = postMonthKey(post);
    if (key && !months.has(key)) months.set(key, { key, index, label: formatter.format(new Date(post.created_at)) });
  });
  return [...months.values()];
}
