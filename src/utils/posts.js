export function isOwnPost(post) {
  if (!post || !/^\d+$/.test(String(post.id ?? "")) || typeof post.text !== "string") return false;
  if (!post.text.trim() && !post.media?.length) return false;
  try {
    const url = new URL(post.permalink);
    return url.protocol === "https:" && url.hostname === "x.com" && /^\/[A-Za-z0-9_]{1,15}\/status\/\d+$/.test(url.pathname) && url.pathname.endsWith(`/status/${post.id}`);
  } catch { return false; }
}

export function isOriginalPost(post) {
  return isOwnPost(post) && !post.referenced_tweets?.length && !post.in_reply_to_user_id;
}

export function postExcerpt(post, t) {
  const text = typeof post.text === "string" ? post.text.trim().replace(/\s+/g, " ") : "";
  if (text) {
    const characters = Array.from(text);
    return characters.length > 38 ? `${characters.slice(0, 38).join("")}…` : text;
  }
  return Array.isArray(post.media) && post.media.some((media) => media?.type === "video") ? t.postVideoAlt : t.postPhotoAlt(1);
}
