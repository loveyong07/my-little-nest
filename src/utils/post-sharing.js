import { SITE_ORIGIN } from "../routes/site-metadata.js";
import { pagePaths } from "../routes/site-route.js";

const POST_ID = /^\d{1,20}$/;

export function sharedPostFromSearch(search) {
  const params = new URLSearchParams(search);
  const post = params.getAll("post");
  const repost = params.getAll("repost");
  const article = params.getAll("article");
  if (post.length === 1 && repost.length === 0 && article.length === 0 && POST_ID.test(post[0])) {
    return { type: "post", id: post[0] };
  }
  if (repost.length === 1 && post.length === 0 && article.length === 0 && POST_ID.test(repost[0])) {
    return { type: "repost", id: repost[0] };
  }
  if (article.length === 1 && post.length === 0 && repost.length === 0 && POST_ID.test(article[0])) {
    return { type: "article", id: article[0] };
  }
  return null;
}

export function postShareDetails(post) {
  const type = post.repostId ? "repost" : "post";
  const id = post.repostId || post.id;
  const origin = typeof window === "undefined" ? SITE_ORIGIN : window.location.origin;
  const url = new URL(pagePaths.posts, origin);
  url.searchParams.set(type, id);
  return { url: url.href, cardId: `${type}-${id}` };
}

export function articleShareDetails(article) {
  const id = article?.id;
  if (!id) return null;
  const origin = typeof window === "undefined" ? SITE_ORIGIN : window.location.origin;
  const url = new URL(pagePaths.posts, origin);
  url.searchParams.set("article", id);
  return { url: url.href, cardId: `article-${id}` };
}
