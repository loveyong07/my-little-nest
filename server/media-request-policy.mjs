// Browser hotlink protection, not authentication: non-browser clients can forge
// these headers. Signed source permissions and edge rate limits remain necessary.
export function allowedMediaContext(request) {
  const site = request.headers.get("sec-fetch-site");
  // same-site can include an untrusted sibling subdomain; CORP is same-origin too.
  if (site !== null) return site === "same-origin" || site === "none";

  const origin = new URL(request.url).origin;
  for (const name of ["origin", "referer"]) {
    const value = request.headers.get(name);
    if (value === null) continue;
    try {
      const url = new URL(value);
      if (url.origin !== origin || url.username || url.password) return false;
    } catch {
      return false;
    }
  }
  // Direct links and older privacy-conscious clients may send neither header.
  return true;
}

export function mediaContextHeaders(request) {
  return {
    Vary: "Sec-Fetch-Site",
    "Cross-Origin-Resource-Policy": "same-origin",
    // Without metadata, authorization depends on Referer/Origin. Do not share
    // that response or fragment the CDN cache by every referring page URL.
    ...(request.headers.has("sec-fetch-site")
      ? {}
      : { "Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store" }),
  };
}
