import { MOBILE_QUERY, NOT_MOBILE_QUERY } from "../constants/media-queries.js";

const ASSETS = "/assets/";

export function scenePreloads(page) {
  if (page === "posts") return [{ href: ASSETS + "posts-winter-hero-q90.webp" }];
  if (page === "contact") return [{ href: ASSETS + "contact-sky-letter-v2-clean-q90.webp" }];
  // Change these content-versioned filenames and the CSS together when replacing the artwork.
  return [
    { href: ASSETS + "home-beach-mobile-ed18d0d3.webp", media: MOBILE_QUERY },
    { href: ASSETS + "home-beach-desktop-cadff3fb.webp", media: NOT_MOBILE_QUERY },
  ];
}
