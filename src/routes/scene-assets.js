import { MOBILE_QUERY, NOT_MOBILE_QUERY } from "../constants/media-queries.js";

const ASSETS = "/assets/";

export function scenePreloads(page) {
  if (page === "posts") return [{ href: ASSETS + "posts-winter-hero-q90.webp" }];
  if (page === "contact") return [{ href: ASSETS + "contact-sky-letter-v2-clean-q90.webp" }];
  return [
    { href: ASSETS + "hero-sky-mobile-motion-q90.webp", media: MOBILE_QUERY },
    { href: ASSETS + "hero-sky-alt-motion-q90.webp", media: NOT_MOBILE_QUERY },
  ];
}
