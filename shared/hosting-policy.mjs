// Shared security headers and route-shell policy validated against vercel.json.
export const SITE_CSP =
  "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self'; media-src 'self'; frame-src 'none'";

export const SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy": SITE_CSP,
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
});

export const STATIC_ASSET_CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";
export const IMMUTABLE_ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const POSTS_PRELOAD_LINK =
  '</assets/posts-winter-hero-q90.webp>; rel=preload; as=image; type="image/webp"; fetchpriority=high';

export const HASHED_ASSET_PATTERN = /^\/assets\/.*-[A-Za-z0-9_-]{8}\.(?:js|css|woff|woff2)$/;

export const ROUTE_SHELLS = Object.freeze({
  "/posts": "/route-shells/posts.html",
  "/posts/": "/route-shells/posts.html",
  "/contact": "/route-shells/contact.html",
  "/contact/": "/route-shells/contact.html",
  "/privacy": "/legal/privacy.html",
  "/privacy/": "/legal/privacy.html",
  "/terms": "/legal/terms.html",
  "/terms/": "/legal/terms.html",
});

export function isBusinessRedirect(pathname) {
  return pathname === "/business" || pathname.startsWith("/business/");
}
