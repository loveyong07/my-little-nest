export const pagePaths = { home: "/", posts: "/posts", contact: "/contact" };

function normalizePathname(pathname) {
  return pathname.replace(/\/+$/, "") || "/";
}

export function resolvePage(pathname) {
  const path = normalizePathname(pathname);
  if (path === pagePaths.posts) return "posts";
  if (path === pagePaths.contact) return "contact";
  return "home";
}

export function siteNavigation(href, currentHref) {
  const current = new URL(currentHref);
  const destination = new URL(href, current);
  if (destination.origin !== current.origin) return null;
  const path = normalizePathname(destination.pathname);
  const page = Object.entries(pagePaths).find(([, value]) => value === path)?.[0];
  if (!page) return null;
  // Preserve native in-page anchor scrolling when only the hash changes on the active route.
  if (path === normalizePathname(current.pathname) && destination.search === current.search && destination.hash) {
    return null;
  }
  return {
    page,
    path,
    ...(destination.search ? { search: destination.search } : {}),
    ...(destination.hash ? { hash: destination.hash } : {}),
  };
}
