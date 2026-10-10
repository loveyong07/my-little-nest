const ASSETS = "/assets/";
export const MOBILE_SCENE_QUERY = "(max-width: 700px)";

export function scenePreloads(page) {
  if (page === "posts") return [{ href: ASSETS + "posts-winter-hero-q90.webp" }];
  if (page === "contact") return [{ href: ASSETS + "contact-sky-letter-v2-clean-q90.webp" }];
  return [
    { href: ASSETS + "hero-sky-mobile-motion-q90.webp", media: MOBILE_SCENE_QUERY },
    { href: ASSETS + "hero-sky-alt-motion-q90.webp", media: "not all and (max-width: 700px)" },
  ];
}
