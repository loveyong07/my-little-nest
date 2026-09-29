import { FALLBACK_AVATAR } from "../constants/site.js";

export function handleAvatarError(event) {
  const image = event.currentTarget;
  const lowResSrc = image.dataset.avatarLowRes;
  if (lowResSrc && image.getAttribute("src") !== lowResSrc) {
    image.src = lowResSrc;
  } else if (image.getAttribute("src") !== FALLBACK_AVATAR) {
    image.src = FALLBACK_AVATAR;
  }
}
