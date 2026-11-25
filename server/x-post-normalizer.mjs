// Pure post, repost, self-quote, media, short-link and X Article normalization
// helpers shared by server/x-feed-service.mjs.
import { mediaDimensions, parseMediaSource } from "../shared/media-sources.mjs";
import { normalizedArticleLinks } from "../shared/article-links.mjs";
import { X_USERNAME as USERNAME } from "../shared/x-account.mjs";
import { isId } from "./x-api-client.mjs";

export function safeAvatar(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "pbs.twimg.com" ? url.href : null;
  } catch {
    return null;
  }
}

// Post photos and video posters; avatars come only from the user lookup.
export function safePhotoUrl(value) {
  const url = parseMediaSource(value, "image");
  return url && !url.pathname.startsWith("/profile_images/") ? url.href : null;
}

export function safeVideoUrl(value) {
  return parseMediaSource(value, "video")?.href ?? null;
}

export function isMediaLinkForPost(entity, postId, media, username) {
  if (!/^https:\/\/t\.co\/[A-Za-z0-9]+$/.test(entity?.url ?? "")) return false;
  try {
    const expanded = new URL(entity.expanded_url);
    if (
      expanded.protocol !== "https:" ||
      !["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(expanded.hostname)
    )
      return false;
    const parts = expanded.pathname.split("/").filter(Boolean);
    if (
      parts.length !== 5 ||
      parts[0].toLowerCase() !== username.toLowerCase() ||
      parts[1] !== "status" ||
      parts[2] !== postId ||
      !/^\d+$/.test(parts[4])
    )
      return false;
    const type = parts[3] === "photo" ? "photo" : parts[3] === "video" ? "video" : null;
    return type !== null && Number(parts[4]) <= media.filter((item) => (item.type ?? "photo") === type).length;
  } catch {
    return false;
  }
}

export function normalizedPostText(text, post, media, username, quotedId) {
  const entities = [
    ...(Array.isArray(post.entities?.urls) ? post.entities.urls : []),
    ...(Array.isArray(post.note_tweet?.entities?.urls) ? post.note_tweet.entities.urls : []),
    ...(Array.isArray(post.note_post?.entities?.urls) ? post.note_post.entities.urls : []),
  ];
  const replacements = new Map();
  for (const entity of entities) {
    if (!/^https:\/\/t\.co\/[A-Za-z0-9]+$/.test(entity?.url ?? "")) continue;
    if (isMediaLinkForPost(entity, post.id, media, username)) {
      replacements.set(entity.url, "");
      continue;
    }
    try {
      const expanded = new URL(entity.expanded_url);
      if (["https:", "http:"].includes(expanded.protocol) && !expanded.username && !expanded.password) {
        const embeddedQuote =
          quotedId &&
          ["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(expanded.hostname) &&
          expanded.pathname.toLowerCase() === `/${username.toLowerCase()}/status/${quotedId}`;
        replacements.set(entity.url, embeddedQuote ? "" : entity.expanded_url);
      }
    } catch {
      // Keep the original short link when X supplies no valid destination.
    }
  }
  // Match each complete short link once; never replace prefixes or recursively
  // expand a destination. No requests to external destinations are necessary.
  const links = [];
  let delta = 0;
  const result = text.replace(/https:\/\/t\.co\/[A-Za-z0-9]+/g, (link, start) => {
    const replacement = replacements.get(link);
    if (replacement === undefined) return link;
    if (replacement) {
      links.push({ text: replacement, url: replacement, offset: start + delta, length: replacement.length });
    }
    delta += replacement.length - link.length;
    return replacement;
  });
  return { text: media.length || quotedId ? result.trimEnd() : result, ...(links.length ? { links } : {}) };
}

/** @returns {import("../shared/contracts.mjs").MediaItem[]} */
export function normalizedMedia(keys, mediaByKey) {
  /** @type {import("../shared/contracts.mjs").MediaItem[]} */
  const mediaItems = [];
  const usedKeys = new Set();
  for (const key of keys) {
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    const media = mediaByKey.get(key);
    const alt = typeof media?.alt_text === "string" ? media.alt_text.trim() : "";
    if (media?.type === "photo") {
      const url = safePhotoUrl(media.url);
      if (url) mediaItems.push({ type: "photo", url, alt, ...(mediaDimensions(media) ?? {}) });
    } else if (media?.type === "video" || media?.type === "animated_gif") {
      const variants = Array.isArray(media.variants) ? media.variants : [];
      const videoVariants = variants.filter(
        (variant) => variant?.content_type === "video/mp4" && safeVideoUrl(variant.url),
      );
      videoVariants.sort((left, right) => (Number(right.bit_rate) || 0) - (Number(left.bit_rate) || 0));
      const url = videoVariants[0] ? safeVideoUrl(videoVariants[0].url) : null;
      const poster = safePhotoUrl(media.preview_image_url);
      if (url)
        mediaItems.push({
          type: "video",
          ...(media.type === "animated_gif" ? { animated: true } : {}),
          url,
          ...(poster ? { poster } : {}),
          alt,
          ...(mediaDimensions(media) ?? {}),
        });
    }
  }
  return mediaItems;
}

/** @returns {import("../shared/contracts.mjs").PostItem | null} */
export function normalizedPost(post, user, mediaByKey, { allowReferences = false, quotedId = undefined } = {}) {
  if (!isId(post?.id) || typeof post.text !== "string") return null;
  if (post.author_id && post.author_id !== user.id) return null;
  if (allowReferences && post.author_id !== user.id) return null;
  if (!allowReferences && (post.in_reply_to_user_id || post.referenced_tweets?.length || post.referenced_posts?.length))
    return null;
  const mediaItems = normalizedMedia(
    Array.isArray(post.attachments?.media_keys) ? post.attachments.media_keys : [],
    mediaByKey,
  );
  const content = normalizedPostText(
    post.note_tweet?.text || post.note_post?.text || post.text,
    post,
    mediaItems,
    user.username,
    quotedId,
  );
  if (!content.text.trim() && mediaItems.length === 0 && !quotedId) return null;
  return {
    id: post.id,
    ...content,
    created_at: post.created_at ?? null,
    author: user.name || USERNAME,
    avatar: safeAvatar(user.profile_image_url),
    permalink: `https://x.com/${user.username}/status/${post.id}`,
    ...(mediaItems.length ? { media: mediaItems } : {}),
  };
}

export function normalizedRepost(event, author, postsById, usersById, mediaByKey) {
  if (event.author_id !== author.id || event.in_reply_to_user_id) return null;
  const reference = (event.referenced_tweets ?? event.referenced_posts ?? []).find((item) => item.type === "retweeted");
  if (!reference) return null;
  const original = postsById.get(reference.id);
  const user = original?.author_id === author.id ? author : usersById.get(original?.author_id);
  if (!user || user.protected || !/^[A-Za-z0-9_]{1,15}$/.test(user.username ?? "")) return null;
  const post = normalizedPost(original, user, mediaByKey, { allowReferences: true });
  if (!post || typeof original.created_at !== "string") return null;
  return { ...post, username: user.username, repostId: event.id, repostedAt: event.created_at };
}

export function normalizedQuoteTarget(original, author, mediaByKey) {
  const post = normalizedPost(original, author, mediaByKey, { allowReferences: true });
  return post ? { ...post, username: author.username } : null;
}

export function normalizedSelfQuote(post, author, mediaByKey, postsById) {
  const references = post?.referenced_tweets ?? post?.referenced_posts ?? [];
  if (post?.in_reply_to_user_id || references.length !== 1 || references[0].type !== "quoted") return null;
  const original = postsById.get(references[0].id);
  if (original?.author_id !== author.id || !isId(original.id)) return null;
  const quote = normalizedPost(post, author, mediaByKey, { allowReferences: true, quotedId: original.id });
  if (!quote) return null;
  return {
    ...quote,
    quotedPost: normalizedQuoteTarget(original, author, mediaByKey) ?? {
      id: original.id,
      text: "",
      created_at: original.created_at ?? null,
      author: author.name || author.username,
      username: author.username,
      permalink: `https://x.com/${author.username}/status/${original.id}`,
    },
  };
}

// Article metadata comes from the requested article field, never from note_tweet:
// long ordinary posts and links that mention an Article remain ordinary posts.
export function isArticlePost(post) {
  return (
    (post.article !== null && typeof post.article === "object" && !Array.isArray(post.article)) ||
    (typeof post.article_title === "string" && Boolean(post.article_title.trim()))
  );
}

export function normalizedArticle(post, user, mediaByKey) {
  if (
    !isId(post?.id) ||
    post.author_id !== user.id ||
    post.in_reply_to_user_id ||
    post.referenced_tweets?.length ||
    post.referenced_posts?.length
  )
    return null;
  const article = post.article ?? {};
  const title =
    typeof article.title === "string"
      ? article.title.trim()
      : typeof post.article_title === "string"
        ? post.article_title.trim()
        : "";
  const fullText = typeof article.plain_text === "string" ? article.plain_text : "";
  const preview = typeof article.preview_text === "string" ? article.preview_text : "";
  const text = fullText || preview;
  const links = normalizedArticleLinks(article.entities);
  const cover = normalizedMedia(typeof article.cover_media === "string" ? [article.cover_media] : [], mediaByKey).find(
    (item) => item.type === "photo",
  );
  const media = normalizedMedia(
    [
      article.cover_media,
      ...(Array.isArray(article.media_entities) ? article.media_entities : []),
      ...(Array.isArray(post.attachments?.media_keys) ? post.attachments.media_keys : []),
    ].filter((key) => typeof key === "string"),
    mediaByKey,
  );
  // An unexpected/empty Article payload is not proof that the account has no Articles.
  if (!title && !text.trim() && !media.length) return null;
  return {
    id: post.id,
    title,
    text,
    contentKind: fullText ? "full" : "preview",
    coverUrl: cover?.url ?? null,
    ...(links.length ? { links } : {}),
    created_at: post.created_at ?? null,
    author: user.name || USERNAME,
    avatar: safeAvatar(user.profile_image_url),
    permalink: `https://x.com/${user.username}/status/${post.id}`,
    ...(media.length ? { media } : {}),
  };
}

export function mergeArticles(current, previous = []) {
  const unique = new Map();
  for (const article of [...current, ...previous]) {
    if (!unique.has(article.id)) unique.set(article.id, article);
  }
  return [...unique.values()].sort((left, right) => {
    const byDate = (Date.parse(right.created_at) || 0) - (Date.parse(left.created_at) || 0);
    return byDate || right.id.length - left.id.length || right.id.localeCompare(left.id);
  });
}

export function sortReposts(reposts) {
  return [...reposts].sort((left, right) => {
    const byDate = (Date.parse(right.repostedAt) || 0) - (Date.parse(left.repostedAt) || 0);
    return byDate || right.repostId.length - left.repostId.length || right.repostId.localeCompare(left.repostId);
  });
}
