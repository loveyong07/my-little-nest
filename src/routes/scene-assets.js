import { MOBILE_QUERY, NOT_MOBILE_QUERY } from "../constants/media-queries.js";

const ASSETS = "/assets/";

const scenes = {
  home: {
    desktop: { webp: "home-beach-desktop-cadff3fb.webp", jpeg: "home-beach-desktop-d941f675.jpg", x: "50%", y: "top" },
    phone: { webp: "home-beach-mobile-ed18d0d3.webp", jpeg: "home-beach-mobile-25197c74.jpg", x: "62%", y: "top" },
  },
  posts: {
    desktop: { webp: "posts-winter-hero-q90.webp", jpeg: "posts-winter-hero-q90.jpg", x: "60%", y: "55%" },
    phoneX: "66%",
  },
  contact: {
    desktop: {
      webp: "contact-sky-letter-v2-clean-q90.webp",
      jpeg: "contact-sky-letter-v2-clean-q90.jpg",
      x: "60%",
      y: "60%",
    },
    phoneX: "66%",
  },
};

function imageUrl(file) {
  return `url("${ASSETS}${file}")`;
}

/** @returns {import("react").CSSProperties} */
export function sceneStyle(page) {
  const { desktop, phone = desktop, phoneX = phone.x } = scenes[page];
  return /** @type {import("react").CSSProperties} */ ({
    "--scene-webp": imageUrl(desktop.webp),
    "--scene-jpeg": imageUrl(desktop.jpeg),
    "--scene-x": desktop.x,
    "--scene-y": desktop.y,
    "--scene-phone-webp": imageUrl(phone.webp),
    "--scene-phone-jpeg": imageUrl(phone.jpeg),
    "--scene-phone-x": phoneX,
  });
}

export function scenePreloads(page) {
  const { desktop, phone } = scenes[page];
  if (!phone) return [{ href: ASSETS + desktop.webp }];
  return [
    { href: ASSETS + phone.webp, media: MOBILE_QUERY },
    { href: ASSETS + desktop.webp, media: NOT_MOBILE_QUERY },
  ];
}
