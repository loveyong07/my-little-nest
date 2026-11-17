export const SITE_ORIGIN = "https://loveyong07.top";

const descriptions = {
  home: "初咏的个人主页。Welcome to my little nest! 在同一片天空下认识新朋友，看看原创动态，找到联系方式。",
  posts: "初咏的小窝动态页，收着日常片段、原创动态、转帖和 X 文章。浏览前请确认已满 18 周岁。",
  contact: "联系初咏：找到熟悉的社交平台，或寄一封邮件，从一句你好开始，让相遇有下文。",
};

export function siteMetadata(page) {
  const route = Object.hasOwn(descriptions, page) ? page : "home";
  return {
    description: descriptions[route],
    url: SITE_ORIGIN + (route === "home" ? "/" : `/${route}`),
    // The age-confirmed journal stays out of search results. Public calling-card
    // pages remain discoverable; no private API or media URLs enter the sitemap.
    robots: route === "posts" ? "noindex, follow" : "index, follow",
  };
}

export function syncSiteMetadata(page) {
  const meta = siteMetadata(page);
  for (const [selector, content] of [
    ['meta[name="description"]', meta.description],
    ['meta[property="og:description"]', meta.description],
    ['meta[name="twitter:description"]', meta.description],
    ['meta[property="og:url"]', meta.url],
    ['meta[name="robots"]', meta.robots],
  ]) {
    document.querySelector(selector)?.setAttribute("content", content);
  }
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", meta.url);
}
