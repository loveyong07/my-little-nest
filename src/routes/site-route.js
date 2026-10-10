export const pagePaths = { home: "/", posts: "/posts", contact: "/contact" };

export function resolvePage(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === pagePaths.posts) return "posts";
  if (path === pagePaths.contact) return "contact";
  return "home";
}

export function siteNavigation(href, currentHref) {
  const destination = new URL(href, currentHref);
  if (destination.origin !== new URL(currentHref).origin || destination.hash || destination.search) return null;
  const path = destination.pathname.replace(/\/+$/, "") || "/";
  const page = Object.entries(pagePaths).find(([, value]) => value === path)?.[0];
  return page ? { page, path } : null;
}
